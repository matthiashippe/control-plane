import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, MC_PER_CENT } from "../src/db.js";
import {
  beginCheckout,
  settleCheckout,
  fakeProvider,
  checkoutEnabled,
  CheckoutError,
  MIN_CENTS,
  MAX_CENTS,
} from "../src/checkout/index.js";

/**
 * Buying credits with a card, up to the line this loop does not cross.
 *
 * Every test here is about one sentence: the amount comes from the row we wrote when the buyer
 * started, never from the callback. A callback says which payment it concerns and whether it went
 * through. If it could also say how much, a forged one would credit whatever it liked.
 */
const db = () => openDb(":memory:");
const ADDR = "key:" + "c".repeat(40);

beforeEach(() => {
  process.env.CP_CHECKOUT = "1";
});
afterEach(() => {
  delete process.env.CP_CHECKOUT;
});

const balance = (d: ReturnType<typeof openDb>, a = ADDR) =>
  (d.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(a) as { balance_mc: number } | undefined)
    ?.balance_mc ?? 0;

describe("a card payment, from start to booked", () => {
  it("credits exactly what was asked for", async () => {
    const d = db();
    const p = fakeProvider();
    const { checkout, redirect } = await beginCheckout(d, p, { address: ADDR, cents: 500 });
    expect(checkout.status).toBe("pending");
    expect(redirect).toContain(checkout.reference);
    expect(balance(d), "nothing is credited before the money arrives").toBe(0);

    const res = settleCheckout(d, p, { reference: checkout.reference, paid: true });
    expect(res.credited_cents).toBe(500);
    expect(res.already).toBe(false);
    expect(balance(d)).toBe(500 * MC_PER_CENT);
  });

  // The one that matters. A callback that names an amount must not be able to set it.
  it("ignores an amount the callback tries to name", async () => {
    const d = db();
    const p = fakeProvider();
    const { checkout } = await beginCheckout(d, p, { address: ADDR, cents: 500 });
    settleCheckout(d, p, { reference: checkout.reference, paid: true, cents: 500_000, amount: 500_000 });
    expect(balance(d), "the row decides, not the callback").toBe(500 * MC_PER_CENT);
  });

  it("books a repeated callback once, because the provider is right to retry", async () => {
    const d = db();
    const p = fakeProvider();
    const { checkout } = await beginCheckout(d, p, { address: ADDR, cents: 300 });
    const first = settleCheckout(d, p, { reference: checkout.reference, paid: true });
    const second = settleCheckout(d, p, { reference: checkout.reference, paid: true });
    expect(first.already).toBe(false);
    expect(second.already, "a retry is not an error").toBe(true);
    expect(balance(d)).toBe(300 * MC_PER_CENT);
    expect(
      (d.prepare("SELECT count(*) AS n FROM ledger WHERE kind = 'topup'").get() as { n: number }).n,
    ).toBe(1);
  });

  it("books nothing for a payment that did not go through, and says so in the row", async () => {
    const d = db();
    const p = fakeProvider();
    const { checkout } = await beginCheckout(d, p, { address: ADDR, cents: 500 });
    const res = settleCheckout(d, p, { reference: checkout.reference, paid: false });
    expect(res.credited_cents).toBe(0);
    expect(balance(d)).toBe(0);
    const row = d.prepare("SELECT status FROM checkouts WHERE reference = ?").get(checkout.reference) as {
      status: string;
    };
    expect(row.status).toBe("abandoned");
  });

  it("refuses a callback for a payment nobody started here", () => {
    const d = db();
    const p = fakeProvider();
    expect(() => settleCheckout(d, p, { reference: "made_up", paid: true })).toThrow(CheckoutError);
    expect(balance(d)).toBe(0);
  });

  it("refuses a callback from a provider the payment was not started with", async () => {
    const d = db();
    const started = fakeProvider();
    const { checkout } = await beginCheckout(d, started, { address: ADDR, cents: 500 });
    const other = { ...fakeProvider(), name: "somebody-else" };
    expect(() => settleCheckout(d, other, { reference: checkout.reference, paid: true })).toThrow(
      CheckoutError,
    );
    expect(balance(d)).toBe(0);
  });

  it("keeps the amount inside the range it published", async () => {
    const d = db();
    const p = fakeProvider();
    for (const cents of [0, MIN_CENTS - 1, MAX_CENTS + 1, 12.5, NaN]) {
      await expect(beginCheckout(d, p, { address: ADDR, cents })).rejects.toThrow(CheckoutError);
    }
    expect((d.prepare("SELECT count(*) AS n FROM checkouts").get() as { n: number }).n).toBe(0);
  });

  it("counts as a real top-up, because that is what it is", async () => {
    // foreign_gmv_30d only counts a buyer who put money in, asked as a `topup` row in the ledger
    // (ops/db-report.cjs). A card buyer has put money in, so the row has to be one.
    const d = db();
    const p = fakeProvider();
    const { checkout } = await beginCheckout(d, p, { address: ADDR, cents: 500 });
    settleCheckout(d, p, { reference: checkout.reference, paid: true });
    const row = d
      .prepare("SELECT kind, ref FROM ledger WHERE address = ?")
      .get(ADDR) as { kind: string; ref: string };
    expect(row.kind).toBe("topup");
    expect(row.ref).toBe(`checkout:${checkout.reference}`);
  });
});

describe("while it is switched off, it does not exist", () => {
  it("says so rather than half working", async () => {
    delete process.env.CP_CHECKOUT;
    expect(checkoutEnabled()).toBe(false);
    const d = db();
    const p = fakeProvider();
    await expect(beginCheckout(d, p, { address: ADDR, cents: 500 })).rejects.toThrow(CheckoutError);
    expect(() => settleCheckout(d, p, { reference: "x", paid: true })).toThrow(CheckoutError);
  });

  it("names the route that does work instead", async () => {
    delete process.env.CP_CHECKOUT;
    try {
      await beginCheckout(db(), fakeProvider(), { address: ADDR, cents: 500 });
      throw new Error("it went through with the flag off");
    } catch (e) {
      expect((e as CheckoutError).code).toBe("checkout_disabled");
      expect((e as CheckoutError).hint).toMatch(/USDC on Base/);
    }
  });
});
