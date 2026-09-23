/**
 * Buying credits with a card, up to the line this loop does not cross.
 *
 * Why it exists. Measured over the whole access log: 43 visitors reached the point where posting a
 * job needs money and none got past it, because the only rail in is USDC on Base. Goal 16 removed
 * the identity half of that wall (a key is the account now, no wallet, no signature). This is the
 * money half. ZIELE.md calls it form B: the buyer pays with a card and gets credits, everything
 * after that is unchanged, credits stay not redeemable, and no new regulatory surface opens beyond
 * the ordinary sale of usage.
 *
 * **What is deliberately not here.** No Stripe, no provider SDK, no key. `CheckoutProvider` is an
 * interface with one implementation, a fake one, used by the tests. The real adapter belongs in
 * `src/payments/**`, which this loop does not touch, and it waits on a business decision that is
 * not a loop's to make (`.scratch/gtm/stripe-entscheidung.md`: legal form, VAT, who is the
 * counterparty). Everything on this side of that line can be built and proved now, so that the day
 * the decision lands the work is an adapter and not a system.
 *
 * **The whole safety argument in one sentence: the amount comes from the row, never from the
 * callback.** A callback says which payment it concerns. What that payment was for is what we
 * wrote down when the buyer started it. Reading the amount out of the callback is how a forged one
 * credits whatever it likes, and every check below exists to keep that from being possible.
 *
 * Off by default. With CP_CHECKOUT unset nothing here runs and the routes do not exist.
 */

import { postLedger, ensureWallet, MC_PER_CENT, type Db } from "../db.js";

/** The smallest and largest a card top-up may be, in cents. */
export const MIN_CENTS = 100;
export const MAX_CENTS = 50_000;

export class CheckoutError extends Error {
  constructor(readonly code: string, readonly status: number, readonly hint: string) {
    super(code);
  }
}

export function checkoutEnabled(): boolean {
  return process.env.CP_CHECKOUT === "1";
}

export interface CheckoutProvider {
  readonly name: string;
  /** Starts a payment and returns the reference the provider will echo back, plus where to send the buyer. */
  begin(input: { cents: number; address: string }): Promise<{ reference: string; redirect: string }>;
  /**
   * Reads a callback and says what it is about. It returns a reference and whether the payment
   * went through, and deliberately NOT an amount: see the note at the top of this file.
   */
  read(payload: unknown): { reference: string; paid: boolean };
}

export interface Checkout {
  reference: string;
  address: string;
  cents: number;
  provider: string;
  status: "pending" | "paid" | "abandoned";
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
      `cents must be a whole number between ${MIN_CENTS} and ${MAX_CENTS}.`,
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
  return { checkout: { reference, address, cents, provider: provider.name, status: "pending" }, redirect };
}

/**
 * Books a payment that went through, once.
 *
 * Idempotent through the ledger and not through a flag: `ledger_topup_ref` is a unique index on
 * `ref` for kind 'topup' (src/db.ts), so a second callback for the same payment hits the database
 * constraint rather than a check that could be raced. The status column is bookkeeping for the
 * page; the index is what makes the money right.
 */
export function settleCheckout(
  db: Db,
  provider: CheckoutProvider,
  payload: unknown,
): { credited_cents: number; already: boolean; address: string } {
  requireEnabled();
  const { reference, paid } = provider.read(payload);
  if (!reference) throw new CheckoutError("reference_missing", 400, "The callback does not name a payment.");

  const row = db
    .prepare("SELECT reference, address, cents, provider, status FROM checkouts WHERE reference = ?")
    .get(reference) as Checkout | undefined;
  // A callback for a payment we never started is not ours to book, whatever it claims.
  if (!row) throw new CheckoutError("unknown_payment", 404, "No payment here carries that reference.");
  if (row.provider !== provider.name) {
    throw new CheckoutError("wrong_provider", 409, "That payment was started with a different provider.");
  }
  if (!paid) {
    db.prepare("UPDATE checkouts SET status = 'abandoned' WHERE reference = ? AND status = 'pending'").run(reference);
    return { credited_cents: 0, already: false, address: row.address };
  }
  if (row.status === "paid") return { credited_cents: row.cents, already: true, address: row.address };

  try {
    const run = db.transaction(() => {
      postLedger(db, {
        address: row.address,
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
      return { credited_cents: row.cents, already: true, address: row.address };
    }
    throw e;
  }
  return { credited_cents: row.cents, already: false, address: row.address };
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
    read(payload) {
      const p = (typeof payload === "object" && payload !== null ? payload : {}) as Record<string, unknown>;
      return {
        reference: typeof p.reference === "string" ? p.reference : "",
        paid: p.paid === true,
      };
    },
  };
}
