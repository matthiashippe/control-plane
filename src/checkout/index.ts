/**
 * Buying credits with a card, up to the line this loop does not cross.
 *
 * Why it exists. Measured over the whole access log: 43 visitors reached the point where posting a
 * job needs money and none got past it, because the only rail in is USDC on Base. Goal 16 removed
 * the identity half of that wall (a key is the account now, no wallet, no signature). This is the
 * money half. ZIELE-alt-bis-29-09.md calls it form B: the buyer pays with a card and gets credits, everything
 * after that is unchanged, credits stay not redeemable, and no new regulatory surface opens beyond
 * the ordinary sale of usage.
 *
 * **Where the provider lives.** `CheckoutProvider` is the interface; `fakeProvider` below is what
 * the tests run against, and the Stripe adapter is `src/payments/stripe.ts` (Goal 20, 2026-09-29).
 *
 * **The whole safety argument in one sentence: the amount comes from the row, never from the
 * callback.** A callback says which payment it concerns. What that payment was for is what we
 * wrote down when the buyer started it. Reading the amount out of the callback is how a forged one
 * credits whatever it likes, and every check below exists to keep that from being possible.
 *
 * Off by default. See `checkoutEnabled()` for what switches it on.
 */

import { randomBytes } from "node:crypto";
import { postLedger, ensureWallet, MC_PER_CENT, type Db } from "../db.js";
import { OFFERS, type Offer, type OfferField } from "../public/catalog.js";
import { isStripeLiveKey, isStripeTestKey } from "../payments/stripe-key.js";

/** Every card payment here is in euro. The catalogue prices are euro cents. */
export const CURRENCY = "eur";

/**
 * Die kleinste und die groesste Kartenzahlung, in Cent.
 *
 * Der Boden lag bis zum 29.09.2026 bei einem Euro, und das war die Zahl, die am freundlichsten
 * aussah und am teuersten war. Die uebliche europaeische Kartengebuehr ist ein Prozentsatz plus
 * ein fester Betrag je Zahlung (Stripe Standard: 1,5 Prozent plus 25 Cent fuer Karten aus dem
 * EWR). Der feste Anteil entscheidet bei kleinen Betraegen alles:
 *
 *   1 EUR  ->  0,265 EUR Gebuehr  =  26,5 Prozent
 *   5 EUR  ->  0,325 EUR          =   6,5 Prozent
 *  10 EUR  ->  0,400 EUR          =   4,0 Prozent
 *  50 EUR  ->  1,000 EUR          =   2,0 Prozent
 *
 * Zehn Euro ist die Stelle, an der die Gebuehr aufhoert, den Preis zu bestimmen. Darunter
 * verkaufen wir zu einem Viertel an den Zahlungsanbieter, und der Kaeufer merkt nichts davon,
 * weil er den Preis zahlt, den er sieht.
 *
 * Passt zum Preisboden am Auftrag (PRICE_MIN_MC, zehn Cent): eine Aufladung von zehn Euro traegt
 * hundert Auftraege zum Boden, und niemand muss fuer jeden Auftrag einzeln zur Karte greifen.
 */
export const MIN_CENTS = 1_000;
export const MAX_CENTS = 50_000;

export class CheckoutError extends Error {
  /** `field` names the order-page field a refusal is about, so the page can say which one. */
  constructor(readonly code: string, readonly status: number, readonly hint: string, readonly field?: string) {
    super(code);
  }
}

/**
 * On with `CP_CHECKOUT=1`, or with a Stripe TEST key in `CP_STRIPE_SECRET_KEY`. A LIVE key opens it
 * only together with `CP_CHECKOUT_LIVE=1`, and nothing else does.
 *
 * The key is Matthias' switch, because `CP_CHECKOUT` sits in `deploy/**`, which the loop does not
 * touch. Only a test key counts (HAN-17, 2026-09-29): swapping `sk_test_` for `sk_live_` must not
 * open the card path for real money on the next restart without a commit and a test.
 *
 * Live has its own switch since Goal 22 (HAN-38, condition 1 and 2, 2026-09-29). Before it,
 * `CP_CHECKOUT=1` next to a live key opened the path for real money, because that flag was checked
 * first and never looked at the key. So a live key now decides alone, and `CP_CHECKOUT=1` cannot
 * stand in for `CP_CHECKOUT_LIVE=1`. Matthias sets that one after somebody delivers (GOAL.md).
 */
export function checkoutEnabled(): boolean {
  const key = process.env.CP_STRIPE_SECRET_KEY ?? "";
  if (isStripeLiveKey(key)) return process.env.CP_CHECKOUT_LIVE === "1";
  return process.env.CP_CHECKOUT === "1" || isStripeTestKey(key);
}

/**
 * What a provider reads back about a payment.
 *
 * `cents` and `currency` are what the provider says it charged. They are never booked: the amount
 * comes from the row. They exist so a disagreement can refuse the settle (409), which can only turn
 * a payment down, never credit one.
 */
export interface ProviderReading {
  /** paid: money arrived. open: not yet, keep waiting. failed: it will not arrive. */
  outcome: "paid" | "open" | "failed";
  cents?: number;
  currency?: string;
}

export interface CheckoutProvider {
  readonly name: string;
  /** Starts a payment and returns the reference the provider will echo back, plus where to send the buyer. */
  begin(input: {
    cents: number;
    address?: string;
    offer?: { id: string; name: string };
    /** The buyer's address, already validated. Only an offer carries one (Goal 21). */
    email?: string;
  }): Promise<{ reference: string; redirect: string }>;
  /** Which payment a callback names, without asking anybody. Empty when it names none. */
  reference(payload: unknown): string;
  /**
   * Whether that payment went through. Asynchronous because a real provider cannot tell from the
   * callback alone and has to be asked. It deliberately returns no amount to book: see the note at
   * the top of this file.
   */
  read(payload: unknown): Promise<ProviderReading>;
}

export interface Checkout {
  reference: string;
  address: string | null;
  offer: string | null;
  cents: number;
  provider: string;
  status: "pending" | "paid" | "abandoned";
}

export interface Settled {
  /** Credits booked to a wallet, in cents. Always 0 for an offer, which has no wallet. */
  credited_cents: number;
  already: boolean;
  address: string | null;
  offer: string | null;
  /** The amount of the row, which is what was paid when status is 'paid'. */
  cents: number;
  status: Checkout["status"];
}

function requireEnabled(): void {
  if (!checkoutEnabled()) {
    throw new CheckoutError(
      "checkout_disabled",
      404,
      "Paying by card is not switched on here. Credits are bought with USDC on Base; " +
        "POST /v1/credits/topup and /.well-known/x402 describe that route.",
    );
  }
}

/** Starts a payment. Writes down what it is for, which is what settling will book. */
export async function beginCheckout(
  db: Db,
  provider: CheckoutProvider,
  input: { address: string; cents: number },
): Promise<{ checkout: Checkout; redirect: string }> {
  requireEnabled();
  const cents = input.cents;
  if (!Number.isInteger(cents) || cents < MIN_CENTS || cents > MAX_CENTS) {
    throw new CheckoutError(
      "amount_out_of_range",
      400,
      `cents must be a whole number between ${MIN_CENTS} and ${MAX_CENTS}. ` +
        "The floor is the card fee, not a policy: at one euro the usual European card fee " +
        "(1.5 per cent plus 25 cents) takes 26.5 per cent of the payment, at ten euros it takes " +
        "4 per cent.",
    );
  }
  const address = input.address.toLowerCase();
  const { reference, redirect } = await provider.begin({ cents, address });
  if (!reference) throw new CheckoutError("provider_no_reference", 502, "The payment provider did not name the payment.");

  const run = db.transaction(() => {
    ensureWallet(db, address);
    db.prepare(
      "INSERT INTO checkouts (reference, address, cents, provider, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)",
    ).run(reference, address, cents, provider.name, new Date().toISOString());
  });
  run();
  return { checkout: { reference, address, offer: null, cents, provider: provider.name, status: "pending" }, redirect };
}

/** RFC 5321 caps a path at 256 octets including the brackets, which leaves 254 for the address. */
export const EMAIL_MAX = 254;
/** Something, an at sign, something with a dot. Deliberately loose: a real address is never refused. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Two words, so "xxxxxxxxxx" is not an occasion (HAN-24).
 *
 * A word is two or more letters or digits in a row, and at least one letter has to be there.
 * GOAL.md says "two words of letters", read literally that refuses its own positive example
 * "70. Geburtstag", which has one; so digits count as a word, and "x x" still does not.
 */
export function hasTwoWords(text: string): boolean {
  return (text.match(/[\p{L}\p{N}]{2,}/gu) ?? []).length >= 2 && /\p{L}/u.test(text);
}

/**
 * Whether one trimmed value would pass the order page. The conversation (HAN-77) asks with the same
 * rule, so it never hands over something the form would send back.
 */
export function fieldValid(f: OfferField, value: string): boolean {
  return f.kind === "choice"
    ? f.options.includes(value)
    : value.length >= f.min && value.length <= f.max && hasTwoWords(value);
}

/**
 * The offer's fields out of a form, checked, trimmed and in the offer's order. Anything the offer
 * does not ask for is dropped, so a form cannot store more than the page showed.
 */
export function checkBrief(offer: Offer, input: Readonly<Record<string, string>>): Record<string, string> {
  const brief: Record<string, string> = {};
  for (const f of offer.fields) {
    const value = (input[f.name] ?? "").trim();
    if (!fieldValid(f, value)) {
      const rule = f.kind === "choice" ? `one of ${f.options.join(", ")}` : `${f.min} to ${f.max} characters and two words`;
      throw new CheckoutError("brief_invalid", 400, `${f.name} must be ${rule}.`, f.name);
    }
    brief[f.name] = value;
  }
  return brief;
}

/**
 * Starts a payment for a catalogue offer, by a person who has no wallet (Goal 20, Goal 21).
 *
 * The price is looked up in OFFERS, so a form that sends a price of its own has nowhere to put it.
 *
 * Since Goal 21 (2026-09-29) nobody reaches Stripe without filling the offer's fields and leaving
 * an address. Every check runs before the provider is asked and before a row is written, so a
 * refusal costs no Stripe call and leaves no row. The address goes into `order_briefs` only, never
 * into `checkouts.address`: that column is a wallet, and `finishSettle` credits every row that has
 * one (HAN-24). It is written as an explicit null here for that reason. The old signature with the offer id alone is gone on
 * purpose, so the old way cannot be reached from code either. Both rows go in one transaction:
 * Done 4 of Goal 21 counts checkouts without a brief, and that number has to be able to stay 0.
 */
export async function beginOfferCheckout(
  db: Db,
  provider: CheckoutProvider,
  input: { offerId: string; brief: Readonly<Record<string, string>>; email: string },
): Promise<{ checkout: Checkout; redirect: string }> {
  requireEnabled();
  const offer = OFFERS.find((o) => o.id === input.offerId);
  if (!offer) throw new CheckoutError("unknown_offer", 400, "There is no offer with that id.");
  const brief = JSON.stringify(checkBrief(offer, input.brief));
  const email = input.email.trim().toLowerCase();
  if (email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) {
    throw new CheckoutError("email_invalid", 400, "That is not an email address.");
  }
  const cents = offer.priceCents;
  const { reference, redirect } = await provider.begin({ cents, offer: { id: offer.id, name: offer.name }, email });
  if (!reference) throw new CheckoutError("provider_no_reference", 502, "The payment provider did not name the payment.");
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      "INSERT INTO checkouts (reference, address, offer, cents, provider, status, created_at) VALUES (?, NULL, ?, ?, ?, 'pending', ?)",
    ).run(reference, offer.id, cents, provider.name, now);
    db.prepare("INSERT INTO order_briefs (reference, brief, email, created_at, token) VALUES (?, ?, ?, ?, ?)").run(
      reference,
      brief,
      email,
      now,
      newDeliveryToken(),
    );
  })();
  return {
    checkout: { reference, address: null, offer: offer.id, cents, provider: provider.name, status: "pending" },
    redirect,
  };
}

/** 32 random bytes, base64url: the 43 characters that open the page with the texts (HAN-67). */
export function newDeliveryToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What `newDeliveryToken` produces and nothing else, checked before the database is asked. */
export const DELIVERY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Books a payment that went through, once.
 *
 * Everything that needs no provider is checked first and throws synchronously: switched off, no
 * reference, a reference we never started, a different provider. Only a row that exists here is
 * worth asking the provider about. HAN-17 found the other order: with the provider asked first,
 * every anonymous `GET /katalog/danke?session_id=anything` spent a Stripe call with our secret key.
 *
 * Credits are idempotent through the ledger: `ledger_topup_ref` is a unique index on `ref` for kind
 * 'topup' (src/db.ts), so a second callback hits the database constraint rather than a check that
 * could be raced. An offer books nothing into the ledger, so there it is the conditional UPDATE
 * (`status != 'paid'`, one changed row) that decides who was first.
 */
export function settleCheckout(db: Db, provider: CheckoutProvider, payload: unknown): Promise<Settled> {
  requireEnabled();
  const reference = provider.reference(payload);
  if (!reference) throw new CheckoutError("reference_missing", 400, "The callback does not name a payment.");

  const row = db
    .prepare("SELECT reference, address, offer, cents, provider, status FROM checkouts WHERE reference = ?")
    .get(reference) as Checkout | undefined;
  // A callback for a payment we never started is not ours to book, whatever it claims.
  if (!row) throw new CheckoutError("unknown_payment", 404, "No payment here carries that reference.");
  if (row.provider !== provider.name) {
    throw new CheckoutError("wrong_provider", 409, "That payment was started with a different provider.");
  }
  return finishSettle(db, provider, payload, row);
}

async function finishSettle(db: Db, provider: CheckoutProvider, payload: unknown, row: Checkout): Promise<Settled> {
  const { reference } = row;
  const reading = await provider.read(payload);
  const result = (credited_cents: number, already: boolean, status: Checkout["status"]): Settled => ({
    credited_cents,
    already,
    address: row.address,
    offer: row.offer,
    cents: row.cents,
    status,
  });

  // The provider may name what it charged. Disagreeing with the row refuses; agreeing books the row.
  if (reading.cents !== undefined && reading.cents !== row.cents) {
    throw new CheckoutError("amount_mismatch", 409, "The provider reports a different amount than this payment was started for.");
  }
  if (reading.currency !== undefined && reading.currency.toLowerCase() !== CURRENCY) {
    throw new CheckoutError("currency_mismatch", 409, "The provider reports a different currency than this payment was started in.");
  }

  if (reading.outcome === "open") {
    const now = db.prepare("SELECT status FROM checkouts WHERE reference = ?").get(reference) as { status: Checkout["status"] };
    return result(0, false, now.status);
  }
  if (reading.outcome === "failed") {
    db.prepare("UPDATE checkouts SET status = 'abandoned' WHERE reference = ? AND status = 'pending'").run(reference);
    const now = db.prepare("SELECT status FROM checkouts WHERE reference = ?").get(reference) as { status: Checkout["status"] };
    return result(0, false, now.status);
  }

  if (row.address === null) {
    // No wallet, so nothing to credit. Credits stay not redeemable, and an offer never becomes any.
    const changed = db
      .prepare("UPDATE checkouts SET status = 'paid', settled_at = ? WHERE reference = ? AND status != 'paid'")
      .run(new Date().toISOString(), reference).changes;
    return result(0, changed !== 1, "paid");
  }

  const address = row.address;
  if (row.status === "paid") return result(row.cents, true, "paid");
  try {
    const run = db.transaction(() => {
      postLedger(db, {
        address,
        kind: "topup",
        // The row, never the callback.
        deltaMc: row.cents * MC_PER_CENT,
        ref: `checkout:${reference}`,
        meta: { provider: provider.name, cents: row.cents },
      });
      db.prepare("UPDATE checkouts SET status = 'paid', settled_at = ? WHERE reference = ?").run(
        new Date().toISOString(),
        reference,
      );
    });
    run();
  } catch (e) {
    // The unique index fired, so this payment is already in the books. Say so instead of failing:
    // a provider that retries a callback is behaving correctly and must not be told it went wrong.
    if (String((e as Error).message).includes("UNIQUE")) {
      db.prepare("UPDATE checkouts SET status = 'paid' WHERE reference = ?").run(reference);
      return result(row.cents, true, "paid");
    }
    throw e;
  }
  return result(row.cents, false, "paid");
}

/** A pending row younger than this is left alone: the buyer is most likely still on Stripe's page. */
export const RECONCILE_MIN_AGE_MS = 2 * 60 * 1000;
/** At most this many rows are asked about per run, oldest first. */
export const RECONCILE_BATCH = 100;

/** One run of `reconcileCheckouts`, in rows. `skipped` are the ones the cap left for the next run. */
export interface ReconcileResult {
  paid: number;
  abandoned: number;
  open: number;
  error: number;
  skipped: number;
}

// Per database, so a run that hangs on the provider cannot be joined by the next tick (HAN-38,
// condition 5). A WeakSet and not a flag, so two databases in one test file do not block each other.
const reconciling = new WeakSet<Db>();

/**
 * Asks the provider about every pending row, so a payment is booked even when the buyer never
 * comes back to /katalog/danke (Goal 22, 2026-09-29).
 *
 * Until then the only booking path was that page. A buyer who closed the tab after paying left the
 * row `pending` for good, and a session nobody finished stayed `pending` too, so the table could not
 * tell the two apart. This runs the same `settleCheckout` the page runs, with the same checks
 * (amount from the row, mode from the provider, conditional UPDATE), so it can book nothing the
 * page could not.
 *
 * No upper bound on age (HAN-38, condition 3): the 17 `stripe_test` rows pending since 30.08. have
 * to resolve on the first run whenever it happens. Every error is caught per row, not only
 * `CheckoutError` (condition 6): a thrown UPDATE on one row must not keep the next one from being
 * booked. The log line carries counts only, never a reference or an address.
 *
 * Returns null when it did not run: switched off, or the previous run on this database is still
 * going.
 */
export async function reconcileCheckouts(
  db: Db,
  provider: CheckoutProvider | null,
  now: Date = new Date(),
): Promise<ReconcileResult | null> {
  if (!provider || !checkoutEnabled()) return null;
  if (reconciling.has(db)) {
    console.log("[reconcile] previous run still going, not starting another");
    return null;
  }
  reconciling.add(db);
  try {
    const before = new Date(now.getTime() - RECONCILE_MIN_AGE_MS).toISOString();
    const where = "status = 'pending' AND provider = ? AND created_at < ?";
    const total = (db.prepare(`SELECT count(*) AS n FROM checkouts WHERE ${where}`).get(provider.name, before) as { n: number }).n;
    const refs = db
      .prepare(`SELECT reference FROM checkouts WHERE ${where} ORDER BY created_at ASC LIMIT ?`)
      .all(provider.name, before, RECONCILE_BATCH) as { reference: string }[];
    const r: ReconcileResult = { paid: 0, abandoned: 0, open: 0, error: 0, skipped: total - refs.length };
    for (const { reference } of refs) {
      try {
        const s = await settleCheckout(db, provider, { session_id: reference });
        if (s.status === "paid") r.paid += 1;
        else if (s.status === "abandoned") r.abandoned += 1;
        else r.open += 1;
      } catch {
        r.error += 1;
      }
    }
    console.log(
      `[reconcile] provider=${provider.name} paid=${r.paid} abandoned=${r.abandoned} open=${r.open} error=${r.error} skipped=${r.skipped}`,
    );
    return r;
  } finally {
    reconciling.delete(db);
  }
}

/**
 * The provider the tests run against, and the only one that exists today.
 *
 * It is here and not under test/ on purpose: it is the shape the real adapter has to fit, and a
 * shape that lives in the test folder gets bent to suit the test.
 */
export function fakeProvider(prefix = "fake"): CheckoutProvider {
  let n = 0;
  return {
    name: "fake",
    async begin({ cents }) {
      n += 1;
      const reference = `${prefix}_${n}_${cents}`;
      return { reference, redirect: `https://provider.invalid/pay/${reference}` };
    },
    reference(payload) {
      const p = (typeof payload === "object" && payload !== null ? payload : {}) as Record<string, unknown>;
      return typeof p.reference === "string" ? p.reference : "";
    },
    // A fake callback is final: it either says the money arrived or that it will not. It names no
    // amount, so the amount check above never fires for it and the row decides alone.
    async read(payload) {
      const p = (typeof payload === "object" && payload !== null ? payload : {}) as Record<string, unknown>;
      return { outcome: p.paid === true ? "paid" : "failed" };
    },
  };
}
