/**
 * Credit by card: the IPN of Digistore24 (goals/karte/01).
 *
 * A person without a wallet buys one of three packages in the checkout of Digistore24 (card, PayPal, Apple Pay). Digistore24 is
 * the seller; it posts a signed IPN to `POST /pay/digistore`, and this file turns the vendor share of that order into credit on
 * the automaton whose address the buyer brought along in `custom`.
 *
 * The rule of src/checkout/index.ts ("the amount comes from the row, never from the callback") is turned around here: there is no
 * row of ours before the IPN, the amount comes from the IPN itself, and so the signature is the only thing that makes it true.
 * Nothing is stored before the signature holds, and without the passphrase nothing is even read.
 *
 * Money is integers throughout. `amount_vendor` is read as decimal text into whole cents, the ECB rate as decimal text into
 * `rate_e4` (USD per EUR times 10000), and the credit is `floor(cents * rate_e4 * MC_PER_CENT / 10000)`. One order is booked at most
 * once: the row in `card_orders` moves from `pending_rate` to `booked` in the same transaction as the ledger row, and the index
 * `ledger_topup_ref` refuses a second `topup` with the same `ds24:<order_id>` anyway.
 *
 * A refund or chargeback takes back at most the free credit (balance minus reservations and sandbox holds), never more, so no
 * balance goes negative; what could not be taken back is recorded as `shortfall_mc`. Credit stays internal and is never paid out.
 *
 * No log line, error and answer carries `custom`, an address, the passphrase or `sha_sign`.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { getAvailableMc, MC_PER_CENT, postLedger, type Db } from "../db.js";

export interface CardPackage {
  /** The product ID at Digistore24. Public: it stands in every order link. */
  productId: string;
  grossEurCents: number;
  label: string;
  /** The vendor share of a real test order of this product in EUR cents (goals/karte/02), measured, never estimated. */
  vendorEurCents: number;
  /** The credit page, README, plugin and checkout name before the purchase: floor(vendorEurCents * CARD_RATE_E4 / 1e6). */
  aboutCreditUsd: number;
}

/**
 * USD per EUR times 10000 for the credit named before the purchase: the lowest USD rate in eurofxref-hist-90d.xml of the ECB on
 * 2026-11-22 (1.0968 of 2026-11-18). The IPN books with the rate of the day of the order, so the credit is "about" this much.
 */
export const CARD_RATE_E4 = 10968;

/**
 * Vendor share per product, from `ops/card-orders.sh --test-vendor` after the test orders of 2026-11-22. A buyer from a country
 * with a higher VAT gets somewhat less, hence "about". Kept apart from the list below, because ops/digistore.mjs reads and writes
 * each package of that list as exactly `{ productId, grossEurCents, label }`.
 */
const MEASURED: Readonly<Record<string, { vendorEurCents: number; aboutCreditUsd: number }>> = {
  "771278": { vendorEurCents: 280, aboutCreditUsd: 3 },
  "771279": { vendorEurCents: 1423, aboutCreditUsd: 15 },
  "771280": { vendorEurCents: 3707, aboutCreditUsd: 40 },
};

/** The three packages, created in the vendor account with ops/digistore.mjs --create. */
const LISTED = [
  { productId: "771278", grossEurCents: 500, label: "credit 5 EUR" },
  { productId: "771279", grossEurCents: 2000, label: "credit 20 EUR" },
  { productId: "771280", grossEurCents: 5000, label: "credit 50 EUR" },
] as const;

export const CARD_PACKAGES: readonly CardPackage[] = LISTED.map((p) => {
  const m = MEASURED[p.productId];
  if (!m) throw new Error(`no measured vendor share for product ${p.productId}`);
  return { ...p, ...m };
});

/**
 * The link to the checkout of `pkg` for `address` (goals/karte/02), straight to Digistore24, because its review only accepts
 * links that go there directly. The address goes only in `custom`, in lower case, and comes back in the IPN. Null for anything
 * that is not an address, so no link without one is ever made.
 */
export function cardCheckoutUrl(pkg: CardPackage, address: string): string | null {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address) || !/^[1-9][0-9]*$/.test(pkg.productId)) return null;
  return `https://www.checkout-ds24.com/product/${pkg.productId}/?custom=${address.toLowerCase()}`;
}

/** Digistore24 cuts the passphrase field to 40 characters without a word; a longer one could never match. */
export const PASSPHRASE_MAX = 40;
export const ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";
export const ECB_TIMEOUT_MS = 10_000;
export const CARD_PAYMENTS_UNAVAILABLE = { error: "card_payments_unavailable" } as const;

export interface DigistoreDeps {
  /** CP_DIGISTORE_IPN_PASSPHRASE. Empty, missing or longer than PASSPHRASE_MAX: every POST is refused. */
  passphrase: string | null | undefined;
  fetch?: typeof fetch;
  now?: () => Date;
  log?: (line: string) => void;
}

export interface IpnAnswer {
  status: 200 | 403 | 503;
  /** Text for Digistore24 (`OK`) or a JSON error. */
  body: string | { error: string };
}

/** The passphrase that may be used, or null. */
export function usablePassphrase(p: string | null | undefined): string | null {
  if (!p) return null;
  if (p.length > PASSPHRASE_MAX) return null;
  return p;
}

/**
 * The string Digistore24 hashes: every field except `sha_sign` with a non-empty value, sorted by name in byte order, each as
 * `name=value` followed by the passphrase, also after the last one. Same as digistore_signature() of ipn_receiver.php.
 */
export function signatureString(fields: Record<string, string>, passphrase: string): string {
  const names = Object.keys(fields)
    .filter((n) => n !== "sha_sign" && n !== "SHASIGN" && fields[n] !== "" && fields[n] != null)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return names.map((n) => `${n}=${fields[n]}${passphrase}`).join("");
}

export function signFields(fields: Record<string, string>, passphrase: string): string {
  return createHash("sha512").update(signatureString(fields, passphrase), "utf8").digest("hex").toUpperCase();
}

/** Constant time: a comparison that stops at the first difference tells by its duration how much was right. */
export function signatureValid(fields: Record<string, string>, passphrase: string): boolean {
  const seen = Buffer.from(String(fields.sha_sign ?? "").toUpperCase(), "utf8");
  const expected = Buffer.from(signFields(fields, passphrase), "utf8");
  if (seen.length !== expected.length) return false;
  return timingSafeEqual(seen, expected);
}

/** "4.06", "4.1", "4" into 406, 410, 400 cents; anything else null. Never a float. */
export function eurCents(text: string | undefined): number | null {
  const m = /^\s*([0-9]{1,9})(?:\.([0-9]{1,2}))?\s*$/.exec(text ?? "");
  if (!m) return null;
  return parseInt(m[1], 10) * 100 + parseInt((m[2] ?? "0").padEnd(2, "0"), 10);
}

/** "1.0512" into 10512 (USD per EUR times 10000); further digits are cut, not rounded. */
export function rateE4(text: string): number | null {
  const m = /^\s*([0-9]{1,3})(?:\.([0-9]+))?\s*$/.exec(text);
  if (!m) return null;
  const v = parseInt(m[1], 10) * 10000 + parseInt((m[2] ?? "").slice(0, 4).padEnd(4, "0"), 10);
  return v > 0 ? v : null;
}

/** USD rates by day from the ECB file, as [date, rate_e4] pairs. */
export function parseEcbUsd(xml: string): [string, number][] {
  const out: [string, number][] = [];
  const day = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>([\s\S]*?)<\/Cube>/g;
  for (const m of xml.matchAll(day)) {
    const usd = /<Cube\s+currency=['"]USD['"]\s+rate=['"]([0-9.]+)['"]/.exec(m[2]);
    const r = usd ? rateE4(usd[1]) : null;
    if (r) out.push([m[1], r]);
  }
  return out;
}

/** The rate of `day`, or of the last day before it that has one (weekend, holiday). Null when the file has none up to that day. */
export function rateFor(rates: [string, number][], day: string): { rateE4: number; date: string } | null {
  let best: [string, number] | null = null;
  for (const r of rates) if (r[0] <= day && (!best || r[0] > best[0])) best = r;
  return best ? { rateE4: best[1], date: best[0] } : null;
}

/** The USD rates of the ECB, or null while the ECB cannot be reached or answers something else. */
export async function fetchEcbUsd(fetchImpl: typeof fetch): Promise<[string, number][] | null> {
  try {
    const res = await fetchImpl(ECB_URL, { signal: AbortSignal.timeout(ECB_TIMEOUT_MS) });
    if (!res.ok) return null;
    const rates = parseEcbUsd(await res.text());
    return rates.length ? rates : null;
  } catch {
    return null;
  }
}

/** The credit of an order: whole millicents, rounded down. */
export function creditMc(vendorEurCents: number, rate: number): number {
  return Math.floor((vendorEurCents * rate * MC_PER_CENT) / 10000);
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const packageOf = (productId: string | undefined) =>
  productId ? (CARD_PACKAGES.find((p) => p.productId !== "" && p.productId === productId) ?? null) : null;

interface OrderRow {
  order_id: string;
  product_id: string;
  address: string | null;
  mode: string;
  status: string;
  vendor_eur_cents: number | null;
  rate_date: string | null;
  credited_mc: number;
}

/** The day whose rate counts: `order_date` of the IPN, else the day of the clock (UTC). */
function orderDay(fields: Record<string, string>, now: Date): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(fields.order_date ?? "");
  return m ? m[1] : now.toISOString().slice(0, 10);
}

/**
 * Books one order that waits for its rate: row to `booked` and the `topup` in one transaction. False when there is no rate for its
 * day or the row is no longer waiting (a parallel IPN booked it first).
 */
function bookWithRate(db: Db, orderId: string, rates: [string, number][], now: Date): boolean {
  const run = db.transaction(() => {
    const row = db.prepare("SELECT * FROM card_orders WHERE order_id = ? AND status = 'pending_rate'").get(orderId) as
      | OrderRow
      | undefined;
    if (!row || !row.address || row.vendor_eur_cents == null || !row.rate_date) return false;
    const rate = rateFor(rates, row.rate_date);
    if (!rate) return false;
    const mc = creditMc(row.vendor_eur_cents, rate.rateE4);
    const at = now.toISOString();
    db.prepare(
      "UPDATE card_orders SET status = 'booked', rate_e4 = ?, rate_date = ?, credited_mc = ?, updated_at = ? " +
        "WHERE order_id = ? AND status = 'pending_rate'",
    ).run(rate.rateE4, rate.date, mc, at, orderId);
    postLedger(db, {
      address: row.address,
      kind: "topup",
      deltaMc: mc,
      ref: `ds24:${orderId}`,
      meta: {
        source: "digistore24",
        product_id: row.product_id,
        vendor_eur_cents: row.vendor_eur_cents,
        rate_e4: rate.rateE4,
        rate_date: rate.date,
      },
    });
    return true;
  });
  return run();
}

/** Books every order that waits for its rate, once the ECB answers. Run at start and every 10 minutes (src/index.ts). */
export async function bookPendingCardOrders(
  db: Db,
  deps: Pick<DigistoreDeps, "fetch" | "now" | "log"> = {},
): Promise<number> {
  const waiting = db.prepare("SELECT order_id FROM card_orders WHERE status = 'pending_rate'").all() as { order_id: string }[];
  if (!waiting.length) return 0;
  const log = deps.log ?? ((l: string) => console.log(l));
  const rates = await fetchEcbUsd(deps.fetch ?? fetch);
  if (!rates) {
    log(`[digistore] ecb unreachable, ${waiting.length} order(s) keep waiting for their rate`);
    return 0;
  }
  const now = (deps.now ?? (() => new Date()))();
  let booked = 0;
  for (const w of waiting) {
    try {
      if (bookWithRate(db, w.order_id, rates, now)) {
        booked++;
        log(`[digistore] order ${w.order_id} booked after waiting for the rate`);
      }
    } catch (err) {
      log(`[digistore] order ${w.order_id} could not be booked: ${err instanceof Error ? err.message : "error"}`);
    }
  }
  return booked;
}

function reverse(
  db: Db,
  order: { orderId: string; productId: string; mode: "live" | "test" },
  event: string,
  now: Date,
  log: (l: string) => void,
): void {
  const { orderId } = order;
  const run = db.transaction(() => {
    const row = db.prepare("SELECT * FROM card_orders WHERE order_id = ?").get(orderId) as OrderRow | undefined;
    const at = now.toISOString();
    if (!row) {
      // Digistore24 retries a failed payment IPN for days, so the refund can come first. The row blocks that late payment.
      db.prepare(
        "INSERT INTO card_orders (order_id, product_id, address, mode, status, credited_mc, reversed_mc, shortfall_mc, " +
          "created_at, updated_at) VALUES (?, ?, NULL, ?, 'reversed', 0, 0, 0, ?, ?)",
      ).run(orderId, order.productId, order.mode, at, at);
      return `${event} before its payment, order blocked, nothing booked`;
    }
    if (row.status === "booked" && row.address) {
      const take = Math.max(0, Math.min(row.credited_mc, getAvailableMc(db, row.address)));
      if (take > 0) {
        postLedger(db, {
          address: row.address,
          kind: "card_reversal",
          deltaMc: -take,
          ref: `ds24:${orderId}`,
          meta: { source: "digistore24", event, credited_mc: row.credited_mc },
        });
      }
      db.prepare(
        "UPDATE card_orders SET status = 'reversed', reversed_mc = ?, shortfall_mc = ?, updated_at = ? WHERE order_id = ?",
      ).run(take, row.credited_mc - take, at, orderId);
      return `${event}: ${take} mc taken back, ${row.credited_mc - take} mc short`;
    }
    if (row.status === "pending_rate" || row.status === "unassigned") {
      db.prepare("UPDATE card_orders SET status = 'reversed', updated_at = ? WHERE order_id = ?").run(at, orderId);
      return `${event} before any booking, nothing taken back`;
    }
    return `${event} on a ${row.status} order, nothing booked`;
  });
  log(`[digistore] order ${orderId}: ${run()}`);
}

/** One IPN of Digistore24, fields as they came in the form body. */
export async function handleDigistoreIpn(db: Db, deps: DigistoreDeps, fields: Record<string, string>): Promise<IpnAnswer> {
  const passphrase = usablePassphrase(deps.passphrase);
  if (!passphrase) return { status: 503, body: CARD_PAYMENTS_UNAVAILABLE };
  if (!signatureValid(fields, passphrase)) return { status: 403, body: { error: "invalid_signature" } };
  const log = deps.log ?? ((l: string) => console.log(l));
  const now = (deps.now ?? (() => new Date()))();
  const event = fields.event ?? "";
  if (event === "connection_test") return { status: 200, body: "OK" };
  const pkg = packageOf(fields.product_id);
  // The vendor account is shared with other projects: an order of theirs is none of ours.
  if (!pkg) return { status: 200, body: "OK" };
  const orderId = String(fields.order_id ?? "").trim();
  if (!orderId) return { status: 200, body: "OK" };

  if (event === "on_refund" || event === "on_chargeback") {
    reverse(db, { orderId, productId: pkg.productId, mode: fields.api_mode === "live" ? "live" : "test" }, event, now, log);
    return { status: 200, body: "OK" };
  }
  if (event !== "on_payment") return { status: 200, body: "OK" };

  const mode = fields.api_mode === "live" ? "live" : "test";
  const custom = String(fields.custom ?? "").trim();
  const address = ADDRESS.test(custom) ? custom.toLowerCase() : null;
  const cents = eurCents(fields.amount_vendor);
  const day = orderDay(fields, now);
  const status =
    mode === "test" ? "test" : !address || fields.currency !== "EUR" || cents == null ? "unassigned" : "pending_rate";
  const at = now.toISOString();
  const inserted = db
    .prepare(
      "INSERT OR IGNORE INTO card_orders (order_id, product_id, address, mode, status, vendor_eur_cents, rate_date, " +
        "credited_mc, reversed_mc, shortfall_mc, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)",
    )
    .run(orderId, pkg.productId, address, mode, status, cents, day, at, at).changes;
  const row = db.prepare("SELECT status FROM card_orders WHERE order_id = ?").get(orderId) as { status: string };
  if (!inserted && row.status !== "pending_rate") {
    log(`[digistore] order ${orderId} repeated, nothing booked`);
    return { status: 200, body: "OK" };
  }
  if (row.status !== "pending_rate") {
    log(`[digistore] order ${orderId} stored as ${row.status}, nothing booked`);
    return { status: 200, body: "OK" };
  }
  const rates = await fetchEcbUsd(deps.fetch ?? fetch);
  if (!rates) {
    log(`[digistore] order ${orderId} waits for the ecb rate`);
    return { status: 200, body: "OK" };
  }
  try {
    if (bookWithRate(db, orderId, rates, now)) log(`[digistore] order ${orderId} booked`);
    else log(`[digistore] order ${orderId} has no ecb rate for its day yet`);
  } catch (err) {
    log(`[digistore] order ${orderId} could not be booked: ${err instanceof Error ? err.message : "error"}`);
  }
  return { status: 200, body: "OK" };
}
