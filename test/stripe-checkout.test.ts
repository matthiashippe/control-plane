/**
 * Goal 20: a person buys a catalogue offer by card, in Stripe's test mode.
 *
 * Nothing here talks to Stripe. The adapter gets a staged `fetch` that answers like Stripe and
 * records every call, so a test can say both what was sent and that nothing was sent at all.
 *
 * The rule from test/checkout.test.ts carries over unchanged: the amount comes from the row. Here
 * the row takes it from OFFERS, and neither the form nor the way back from Stripe can move it.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, migrateCheckoutsV2 } from "../src/db.js";
import { createApp } from "../src/app.js";
import {
  beginOfferCheckout,
  checkoutEnabled,
  CheckoutError,
  settleCheckout,
} from "../src/checkout/index.js";
import { stripeProvider } from "../src/payments/stripe.js";
import { stripeProviderName } from "../src/payments/stripe-key.js";
import { OFFERS, TEST_MODE_LINE } from "../src/public/catalog.js";

// Placeholders with the right prefixes. Not keys: Stripe would reject every one of them.
const TEST_KEY = "sk_test_placeholder";
const LIVE_KEY = "sk_live_placeholder";
const OFFER = OFFERS[0];

interface Call {
  method: string;
  url: string;
  body: URLSearchParams | null;
  auth: string | null;
}

/** A Stripe that knows the sessions it created and answers `read` from `state`. */
function stagedStripe(state: Partial<{ payment_status: string; status: string; amount_total: number; currency: string; livemode: boolean }> = {}) {
  const calls: Call[] = [];
  let n = 0;
  const sessions = new Map<string, number>();
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body instanceof URLSearchParams ? init.body : null;
    const auth = new Headers(init?.headers).get("authorization");
    calls.push({ method, url, body, auth });
    if (method === "POST" && url === "https://api.stripe.com/v1/checkout/sessions") {
      n += 1;
      const id = `cs_test_staged${n}`;
      sessions.set(id, Number(body?.get("line_items[0][price_data][unit_amount]")));
      return Response.json({ id, url: `https://checkout.stripe.com/c/pay/${id}` });
    }
    const m = url.match(/^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions\/([^/?]+)$/);
    if (method === "GET" && m && sessions.has(decodeURIComponent(m[1]))) {
      return Response.json({
        id: m[1],
        status: "complete",
        payment_status: "paid",
        amount_total: sessions.get(decodeURIComponent(m[1])),
        currency: "eur",
        livemode: false,
        ...state,
      });
    }
    return Response.json({ error: { message: "No such checkout.session" } }, { status: 404 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const origin = () => "https://postyourprice.com";
const stripe = (s: ReturnType<typeof stagedStripe>, secretKey = TEST_KEY) =>
  stripeProvider({ secretKey, origin, fetch: s.fetchImpl });

const row = (d: ReturnType<typeof openDb>, reference: string) =>
  d.prepare("SELECT * FROM checkouts WHERE reference = ?").get(reference) as Record<string, unknown>;
const ledgerRows = (d: ReturnType<typeof openDb>) =>
  (d.prepare("SELECT count(*) AS n FROM ledger").get() as { n: number }).n;

beforeEach(() => {
  delete process.env.CP_CHECKOUT;
  process.env.CP_STRIPE_SECRET_KEY = TEST_KEY;
});
afterEach(() => {
  delete process.env.CP_CHECKOUT;
  delete process.env.CP_STRIPE_SECRET_KEY;
});

describe("the checkouts table after Goal 20", () => {
  it("migrates the old schema once and keeps the row it had", () => {
    const dir = mkdtempSync(join(tmpdir(), "cp-checkouts-"));
    const path = join(dir, "cp.db");
    try {
      const old = new Database(path);
      old.exec(`
        CREATE TABLE wallets (address TEXT PRIMARY KEY, balance_mc INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
        CREATE TABLE checkouts (
          reference TEXT PRIMARY KEY, address TEXT NOT NULL REFERENCES wallets(address), cents INTEGER NOT NULL,
          provider TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, settled_at TEXT);
        INSERT INTO wallets VALUES ('key:old', 0, '2026-09-20T00:00:00.000Z');
        INSERT INTO checkouts VALUES ('ref-old', 'key:old', 1500, 'fake', 'paid', '2026-09-20T00:00:00.000Z', '2026-09-20T00:01:00.000Z');
      `);
      old.close();

      const first = openDb(path);
      const cols = first.prepare("PRAGMA table_info(checkouts)").all() as { name: string; notnull: number }[];
      expect(cols.find((c) => c.name === "address")?.notnull).toBe(0);
      expect(cols.some((c) => c.name === "offer")).toBe(true);
      expect(row(first, "ref-old")).toEqual({
        reference: "ref-old",
        address: "key:old",
        cents: 1500,
        provider: "fake",
        status: "paid",
        created_at: "2026-09-20T00:00:00.000Z",
        settled_at: "2026-09-20T00:01:00.000Z",
        offer: null,
      });
      first.close();

      const second = openDb(path);
      expect(migrateCheckoutsV2(second), "a second start must not migrate again").toBe(false);
      expect(row(second, "ref-old").cents).toBe(1500);
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a row that is neither for a wallet nor for an offer, and takes each alone", () => {
    const d = openDb(":memory:");
    const insert = d.prepare(
      "INSERT INTO checkouts (reference, address, offer, cents, provider, status, created_at) VALUES (?, ?, ?, 1900, 'fake', 'pending', 'x')",
    );
    expect(() => insert.run("neither", null, null)).toThrow(/CHECK/);
    expect(() => insert.run("offer-only", null, OFFER.id)).not.toThrow();
  });
});

describe("the switch", () => {
  it("is on with a test key alone, and with a restricted test key", () => {
    process.env.CP_STRIPE_SECRET_KEY = TEST_KEY;
    expect(checkoutEnabled()).toBe(true);
    process.env.CP_STRIPE_SECRET_KEY = "rk_test_placeholder";
    expect(checkoutEnabled()).toBe(true);
  });

  it("stays off with a live key alone, because live needs a switch of its own", () => {
    process.env.CP_STRIPE_SECRET_KEY = LIVE_KEY;
    expect(checkoutEnabled()).toBe(false);
    process.env.CP_STRIPE_SECRET_KEY = "rk_live_placeholder";
    expect(checkoutEnabled()).toBe(false);
    delete process.env.CP_STRIPE_SECRET_KEY;
    expect(checkoutEnabled()).toBe(false);
  });
});

describe("the provider name, from the key", () => {
  it("says stripe only for a live key", () => {
    expect(stripeProviderName(LIVE_KEY)).toBe("stripe");
    expect(stripeProviderName("rk_live_placeholder")).toBe("stripe");
  });

  it("says stripe_test for every other key, including a restricted test key", () => {
    for (const k of [TEST_KEY, "rk_test_placeholder", "pk_test_placeholder", "garbage", ""]) {
      expect(stripeProviderName(k), k).toBe("stripe_test");
    }
    expect(stripe(stagedStripe()).name).toBe("stripe_test");
    expect(stripe(stagedStripe(), LIVE_KEY).name).toBe("stripe");
  });
});

describe("the Stripe adapter against a staged fetch", () => {
  it("creates the session with the price from OFFERS, in euro, card only", async () => {
    const s = stagedStripe();
    const d = openDb(":memory:");
    const { checkout, redirect } = await beginOfferCheckout(d, stripe(s), OFFER.id);
    expect(redirect).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect(s.calls).toHaveLength(1);
    const body = s.calls[0].body!;
    expect(body.get("mode")).toBe("payment");
    expect(body.get("line_items[0][price_data][unit_amount]")).toBe(String(OFFER.priceCents));
    expect(body.get("line_items[0][price_data][currency]")).toBe("eur");
    expect(body.get("line_items[0][price_data][product_data][name]")).toBe(OFFER.name);
    expect(body.get("payment_method_types[0]")).toBe("card");
    expect(body.get("success_url")).toBe("https://postyourprice.com/katalog/danke?session_id={CHECKOUT_SESSION_ID}");
    expect(body.get("cancel_url")).toBe("https://postyourprice.com/katalog");
    expect(s.calls[0].auth).toBe(`Bearer ${TEST_KEY}`);
    expect(row(d, checkout.reference)).toMatchObject({
      address: null,
      offer: OFFER.id,
      cents: OFFER.priceCents,
      provider: "stripe_test",
      status: "pending",
    });
  });

  it("marks a paid offer as paid and books nothing into the ledger", async () => {
    const s = stagedStripe();
    const d = openDb(":memory:");
    const { checkout } = await beginOfferCheckout(d, stripe(s), OFFER.id);
    const r = await settleCheckout(d, stripe(s), { session_id: checkout.reference });
    expect(r).toMatchObject({ status: "paid", cents: OFFER.priceCents, credited_cents: 0, already: false, address: null });
    expect(row(d, checkout.reference).status).toBe("paid");
    expect(ledgerRows(d), "no wallet, so nothing is credited").toBe(0);
  });

  it("settles an offer once, even when two reloads arrive together", async () => {
    const s = stagedStripe();
    const d = openDb(":memory:");
    const p = stripe(s);
    const { checkout } = await beginOfferCheckout(d, p, OFFER.id);
    const [a, b] = await Promise.all([
      settleCheckout(d, p, { session_id: checkout.reference }),
      settleCheckout(d, p, { session_id: checkout.reference }),
    ]);
    expect([a.already, b.already].sort()).toEqual([false, true]);
    const settledAt = row(d, checkout.reference).settled_at;
    const again = await settleCheckout(d, p, { session_id: checkout.reference });
    expect(again.already).toBe(true);
    expect(row(d, checkout.reference).settled_at, "a reload does not settle again").toBe(settledAt);
  });

  it("books nothing while Stripe says unpaid, and keeps the row pending rather than abandoned", async () => {
    const s = stagedStripe({ payment_status: "unpaid", status: "open" });
    const d = openDb(":memory:");
    const { checkout } = await beginOfferCheckout(d, stripe(s), OFFER.id);
    const r = await settleCheckout(d, stripe(s), { session_id: checkout.reference });
    expect(r.status).toBe("pending");
    expect(row(d, checkout.reference).status).toBe("pending");
    expect(row(d, checkout.reference).settled_at).toBeNull();
  });

  it("calls a session abandoned only when Stripe says it expired", async () => {
    const s = stagedStripe({ payment_status: "unpaid", status: "expired" });
    const d = openDb(":memory:");
    const { checkout } = await beginOfferCheckout(d, stripe(s), OFFER.id);
    const r = await settleCheckout(d, stripe(s), { session_id: checkout.reference });
    expect(r.status).toBe("abandoned");
    expect(row(d, checkout.reference).status).toBe("abandoned");
  });

  it("refuses with 409 when Stripe reports another amount, and books nothing", async () => {
    const s = stagedStripe({ amount_total: 1 });
    const d = openDb(":memory:");
    const { checkout } = await beginOfferCheckout(d, stripe(s), OFFER.id);
    await expect(settleCheckout(d, stripe(s), { session_id: checkout.reference })).rejects.toMatchObject({
      code: "amount_mismatch",
      status: 409,
    });
    expect(row(d, checkout.reference).status).toBe("pending");
  });

  it("refuses with 409 when Stripe reports another currency", async () => {
    const s = stagedStripe({ currency: "usd" });
    const d = openDb(":memory:");
    const { checkout } = await beginOfferCheckout(d, stripe(s), OFFER.id);
    await expect(settleCheckout(d, stripe(s), { session_id: checkout.reference })).rejects.toMatchObject({
      code: "currency_mismatch",
      status: 409,
    });
    expect(row(d, checkout.reference).status).toBe("pending");
  });

  it("refuses with 409 when Stripe's mode disagrees with the row", async () => {
    const s = stagedStripe({ livemode: true });
    const d = openDb(":memory:");
    const { checkout } = await beginOfferCheckout(d, stripe(s), OFFER.id);
    await expect(settleCheckout(d, stripe(s), { session_id: checkout.reference })).rejects.toMatchObject({
      code: "livemode_mismatch",
      status: 409,
    });
    expect(row(d, checkout.reference).status).toBe("pending");
  });

  it("asks Stripe nothing for a session id that is not in the table", async () => {
    const s = stagedStripe();
    const d = openDb(":memory:");
    expect(() => settleCheckout(d, stripe(s), { session_id: "cs_test_nobodystartedthis" })).toThrow(CheckoutError);
    expect(s.calls, "an unknown reference must not cost a Stripe call").toHaveLength(0);
  });

  it("asks Stripe nothing for an id that is not a session id at all", async () => {
    const s = stagedStripe();
    const d = openDb(":memory:");
    for (const id of ["../../customers", "cs_test_a/../../customers", "cs_test_a?expand=x", "", 42]) {
      expect(() => settleCheckout(d, stripe(s), { session_id: id })).toThrow(CheckoutError);
    }
    expect(s.calls).toHaveLength(0);
  });

  it("names no key in an error", async () => {
    const failing = (async () => new Response("{}", { status: 401 })) as typeof fetch;
    const p = stripeProvider({ secretKey: TEST_KEY, origin, fetch: failing });
    const e = await beginOfferCheckout(openDb(":memory:"), p, OFFER.id).catch((x) => x as CheckoutError);
    expect(e).toBeInstanceOf(CheckoutError);
    expect(`${e.message} ${e.hint}`).not.toContain(TEST_KEY);
  });
});

describe("/katalog/kaufen and /katalog/danke", () => {
  const app = (s: ReturnType<typeof stagedStripe>, d = openDb(":memory:"), rateLimit: { limit: number; windowMs: number } | null = null) =>
    ({ d, app: createApp({ db: d, checkout: stripe(s), rateLimit }) });
  const buy = (a: ReturnType<typeof createApp>, body: string) =>
    a.request("/katalog/kaufen", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });

  it("sends the buyer to Stripe with the catalogue price, whatever else the form says", async () => {
    const s = stagedStripe();
    const { d, app: a } = app(s);
    const res = await buy(a, `angebot=${OFFER.id}&cents=1&price=1&priceCents=1&amount=1`);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect(s.calls[0].body!.get("line_items[0][price_data][unit_amount]")).toBe(String(OFFER.priceCents));
    const rows = d.prepare("SELECT offer, cents FROM checkouts").all();
    expect(rows).toEqual([{ offer: OFFER.id, cents: OFFER.priceCents }]);
  });

  it("answers 400 for an offer that does not exist, and starts nothing", async () => {
    const s = stagedStripe();
    const { d, app: a } = app(s);
    expect((await buy(a, "angebot=gibt-es-nicht")).status).toBe(400);
    expect((await buy(a, "")).status).toBe(400);
    expect(s.calls).toHaveLength(0);
    expect((d.prepare("SELECT count(*) AS n FROM checkouts").get() as { n: number }).n).toBe(0);
  });

  it("shows the button and the test-mode line while the key is a test key", async () => {
    const html = await (await app(stagedStripe()).app.request("/katalog")).text();
    expect(html).toContain('action="/katalog/kaufen"');
    expect(html).toContain(`value="${OFFER.id}"`);
    expect(html).toContain(TEST_MODE_LINE);
  });

  it("shows no button and refuses the POST while the card path is off", async () => {
    process.env.CP_STRIPE_SECRET_KEY = LIVE_KEY;
    const s = stagedStripe();
    const { app: a } = app(s);
    const html = await (await a.request("/katalog")).text();
    expect(html).not.toContain('action="/katalog/kaufen"');
    expect(html).not.toContain(TEST_MODE_LINE);
    expect((await buy(a, `angebot=${OFFER.id}`)).status).toBe(404);
    expect(s.calls).toHaveLength(0);
  });

  it("says paid on the way back, and a reload books nothing twice", async () => {
    const s = stagedStripe();
    const { d, app: a } = app(s);
    const res = await buy(a, `angebot=${OFFER.id}`);
    const id = res.headers.get("location")!.split("/").pop()!;
    const page = await a.request(`/katalog/danke?session_id=${id}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Ihre Zahlung ist angekommen");
    expect(html).toContain(OFFER.name);
    expect(html).toContain(TEST_MODE_LINE);
    const settledAt = row(d, id).settled_at;
    expect((await a.request(`/katalog/danke?session_id=${id}`)).status).toBe(200);
    expect(row(d, id).settled_at).toBe(settledAt);
    expect(d.prepare("SELECT count(*) AS n FROM checkouts WHERE status = 'paid'").get()).toEqual({ n: 1 });
  });

  it("says not paid, with a way back, while Stripe says unpaid", async () => {
    const s = stagedStripe({ payment_status: "unpaid", status: "open" });
    const { app: a } = app(s);
    const id = (await buy(a, `angebot=${OFFER.id}`)).headers.get("location")!.split("/").pop()!;
    const html = await (await a.request(`/katalog/danke?session_id=${id}`)).text();
    expect(html).toContain("Die Zahlung ist nicht abgeschlossen");
    expect(html).toContain('href="/katalog"');
    expect(html).not.toContain("Ihre Zahlung ist angekommen");
  });

  it("says unknown for a session nobody started here, without asking Stripe", async () => {
    const s = stagedStripe();
    const { app: a } = app(s);
    for (const q of ["?session_id=cs_test_unknown", "?session_id=../../customers", "?session_id=x"]) {
      const res = await a.request(`/katalog/danke${q}`);
      expect(res.status, q).toBe(404);
      expect(await res.text()).toContain("finden wir keine Zahlung");
    }
    expect(s.calls).toHaveLength(0);
  });

  it("sends a visit without any session id back to the catalogue", async () => {
    const s = stagedStripe();
    const res = await app(s).app.request("/katalog/danke");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/katalog");
    expect(s.calls).toHaveLength(0);
  });

  it("puts both routes under the rate limit for strangers", async () => {
    const s = stagedStripe();
    const { app: a } = app(s, openDb(":memory:"), { limit: 2, windowMs: 60_000 });
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) codes.push((await a.request("/katalog/danke?session_id=cs_test_x")).status);
    expect(codes).toEqual([404, 404, 429]);
    expect((await buy(a, `angebot=${OFFER.id}`)).status).toBe(429);
    expect((await a.request("/katalog")).status, "the catalogue itself stays unlimited").toBe(200);
  });
});
