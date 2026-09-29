/**
 * Goal 22: every session paid in Stripe ends up `paid` in `checkouts`, also when the buyer never
 * comes back to /katalog/danke.
 *
 * Nothing here talks to Stripe. The adapter gets a staged `fetch` that answers per session id from
 * a table the test writes, and records every call, so a test can say which rows were asked about
 * and which were not. Every rule is held from both sides: what must be asked is asked, and what
 * must not be asked costs no call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureWallet, openDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import { beginCheckout, reconcileCheckouts, RECONCILE_BATCH } from "../src/checkout/index.js";
import { stripeProvider } from "../src/payments/stripe.js";
import { OFFERS } from "../src/public/catalog.js";

const TEST_KEY = "sk_test_placeholder";
const LIVE_KEY = "sk_live_placeholder";
const OFFER = OFFERS[0];
const NOW = new Date("2026-09-29T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

type Answer = Partial<{ status: string; payment_status: string; amount_total: number; currency: string; livemode: boolean }>;
type Staged = Answer | "500" | "hang";

/** A Stripe that answers GET /checkout/sessions/<id> from `answers`, and nothing else. */
function stagedStripe(answers: Map<string, Staged> = new Map()) {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if ((init?.method ?? "GET") === "POST" && url === "https://api.stripe.com/v1/checkout/sessions") {
      const id = `cs_test_topup${calls.length}`;
      answers.set(id, answers.get("*") ?? {});
      return Response.json({ id, url: `https://checkout.stripe.com/c/pay/${id}` });
    }
    const id = decodeURIComponent(url.split("/").pop()!);
    const a = answers.get(id);
    if (a === undefined) return Response.json({ error: { message: "No such checkout.session" } }, { status: 404 });
    if (a === "500") return Response.json({ error: { message: "boom" } }, { status: 500 });
    if (a === "hang") {
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
    }
    return Response.json({
      id,
      status: "complete",
      payment_status: "paid",
      amount_total: OFFER.priceCents,
      currency: "eur",
      livemode: id.startsWith("cs_live_"),
      ...a,
    });
  }) as typeof fetch;
  return { calls, answers, fetchImpl };
}

const provider = (s: ReturnType<typeof stagedStripe>, secretKey = TEST_KEY, timeoutMs = 10_000) =>
  stripeProvider({ secretKey, origin: () => "https://postyourprice.com", fetch: s.fetchImpl, timeoutMs });

function insertRow(
  d: ReturnType<typeof openDb>,
  reference: string,
  opts: { provider?: string; createdAt?: string; address?: string | null; cents?: number } = {},
) {
  const address = opts.address ?? null;
  if (address) ensureWallet(d, address);
  d.prepare(
    "INSERT INTO checkouts (reference, address, offer, cents, provider, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
  ).run(reference, address, address ? null : OFFER.id, opts.cents ?? OFFER.priceCents, opts.provider ?? "stripe_test", opts.createdAt ?? minutesAgo(10));
}

const row = (d: ReturnType<typeof openDb>, reference: string) =>
  d.prepare("SELECT status, settled_at FROM checkouts WHERE reference = ?").get(reference) as { status: string; settled_at: string | null };
const asked = (s: ReturnType<typeof stagedStripe>, id: string) => s.calls.filter((u) => u.endsWith(`/${id}`)).length;

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  delete process.env.CP_CHECKOUT;
  delete process.env.CP_CHECKOUT_LIVE;
  process.env.CP_STRIPE_SECRET_KEY = TEST_KEY;
  log = vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  delete process.env.CP_CHECKOUT;
  delete process.env.CP_CHECKOUT_LIVE;
  delete process.env.CP_STRIPE_SECRET_KEY;
  log.mockRestore();
});

describe("reconcileCheckouts", () => {
  it("books a paid session nobody came back for", async () => {
    const s = stagedStripe(new Map([["cs_test_paid", {}]]));
    const d = openDb(":memory:");
    insertRow(d, "cs_test_paid");
    const r = await reconcileCheckouts(d, provider(s), NOW);
    expect(r).toEqual({ paid: 1, abandoned: 0, open: 0, error: 0, skipped: 0 });
    expect(row(d, "cs_test_paid").status).toBe("paid");
    expect(row(d, "cs_test_paid").settled_at).not.toBeNull();
  });

  it("calls an expired session abandoned and settles nothing, also 72 hours on", async () => {
    const expired = { status: "expired", payment_status: "unpaid" };
    const s = stagedStripe(new Map([["cs_test_gone", expired], ["cs_test_old", expired]]));
    const d = openDb(":memory:");
    insertRow(d, "cs_test_gone");
    insertRow(d, "cs_test_old", { createdAt: minutesAgo(72 * 60) });
    const r = await reconcileCheckouts(d, provider(s), NOW);
    expect(r).toMatchObject({ paid: 0, abandoned: 2 });
    for (const id of ["cs_test_gone", "cs_test_old"]) expect(row(d, id)).toEqual({ status: "abandoned", settled_at: null });
  });

  it("leaves an open session pending and asks again on the next run", async () => {
    const s = stagedStripe(new Map([["cs_test_open", { status: "open", payment_status: "unpaid" }]]));
    const d = openDb(":memory:");
    insertRow(d, "cs_test_open");
    expect(await reconcileCheckouts(d, provider(s), NOW)).toMatchObject({ open: 1, paid: 0, abandoned: 0 });
    expect(row(d, "cs_test_open")).toEqual({ status: "pending", settled_at: null });
    await reconcileCheckouts(d, provider(s), NOW);
    expect(asked(s, "cs_test_open")).toBe(2);
    // And once Stripe says paid, the same row books.
    s.answers.set("cs_test_open", {});
    expect(await reconcileCheckouts(d, provider(s), NOW)).toMatchObject({ paid: 1 });
  });

  it("asks nothing about a stripe_test row while running live, and does ask about the stripe row", async () => {
    process.env.CP_STRIPE_SECRET_KEY = LIVE_KEY;
    process.env.CP_CHECKOUT_LIVE = "1";
    const s = stagedStripe(new Map<string, Staged>([["cs_test_old", {}], ["cs_live_real", {}]]));
    const d = openDb(":memory:");
    insertRow(d, "cs_test_old", { provider: "stripe_test" });
    insertRow(d, "cs_live_real", { provider: "stripe" });
    const r = await reconcileCheckouts(d, provider(s, LIVE_KEY), NOW);
    expect(r).toEqual({ paid: 1, abandoned: 0, open: 0, error: 0, skipped: 0 });
    expect(asked(s, "cs_test_old")).toBe(0);
    expect(row(d, "cs_test_old").status).toBe("pending");
    expect(row(d, "cs_live_real").status).toBe("paid");
  });

  it("books the next row when Stripe answers 500 for one", async () => {
    const s = stagedStripe(new Map<string, Staged>([["cs_test_a", "500"], ["cs_test_b", {}]]));
    const d = openDb(":memory:");
    insertRow(d, "cs_test_a", { createdAt: minutesAgo(20) });
    insertRow(d, "cs_test_b", { createdAt: minutesAgo(10) });
    expect(await reconcileCheckouts(d, provider(s), NOW)).toMatchObject({ error: 1, paid: 1 });
    expect(row(d, "cs_test_a").status).toBe("pending");
    expect(row(d, "cs_test_b").status).toBe("paid");
  });

  it("counts an UPDATE that throws something other than a CheckoutError, and books the next row", async () => {
    const s = stagedStripe(new Map<string, Staged>([["cs_test_a", {}], ["cs_test_b", {}]]));
    const d = openDb(":memory:");
    insertRow(d, "cs_test_a", { createdAt: minutesAgo(20) });
    insertRow(d, "cs_test_b", { createdAt: minutesAgo(10) });
    d.exec(`CREATE TRIGGER boom BEFORE UPDATE ON checkouts WHEN OLD.reference = 'cs_test_a'
            BEGIN SELECT RAISE(ABORT, 'staged failure'); END`);
    expect(await reconcileCheckouts(d, provider(s), NOW)).toMatchObject({ error: 1, paid: 1 });
    expect(row(d, "cs_test_a").status).toBe("pending");
    expect(row(d, "cs_test_b").status).toBe("paid");
  });

  it.each([
    [RECONCILE_BATCH + 1, 1],
    [RECONCILE_BATCH, 0],
  ])("asks about at most 100 rows, oldest first: %i pending give skipped = %i", async (n, skipped) => {
    const s = stagedStripe(new Map([["*", {}]]));
    const d = openDb(":memory:");
    for (let i = 0; i < n; i++) {
      const id = `cs_test_n${i}`;
      s.answers.set(id, { status: "open", payment_status: "unpaid" });
      insertRow(d, id, { createdAt: minutesAgo(1_000 - i) });
    }
    const r = await reconcileCheckouts(d, provider(s), NOW);
    expect(r).toMatchObject({ open: Math.min(n, RECONCILE_BATCH), skipped });
    expect(s.calls).toHaveLength(Math.min(n, RECONCILE_BATCH));
    if (skipped) expect(asked(s, `cs_test_n${n - 1}`), "the youngest row waits").toBe(0);
  });

  it("ends a run on a Stripe that never answers, and a second run meanwhile asks nothing", async () => {
    const s = stagedStripe(new Map<string, Staged>([["cs_test_hang", "hang"]]));
    const d = openDb(":memory:");
    insertRow(d, "cs_test_hang");
    const first = reconcileCheckouts(d, provider(s, TEST_KEY, 50), NOW);
    const second = await reconcileCheckouts(d, provider(s, TEST_KEY, 50), NOW);
    expect(second, "the second run does not start").toBeNull();
    expect(s.calls).toHaveLength(1);
    expect(await first).toMatchObject({ error: 1 });
    // Once the first run is over, the next one runs again.
    s.answers.set("cs_test_hang", {});
    expect(await reconcileCheckouts(d, provider(s, TEST_KEY, 50), NOW)).toMatchObject({ paid: 1 });
  });

  it("does not ask about a row younger than two minutes, and does once it is older", async () => {
    const s = stagedStripe(new Map([["cs_test_new", {}]]));
    const d = openDb(":memory:");
    insertRow(d, "cs_test_new", { createdAt: minutesAgo(1) });
    expect(await reconcileCheckouts(d, provider(s), NOW)).toEqual({ paid: 0, abandoned: 0, open: 0, error: 0, skipped: 0 });
    expect(s.calls).toHaveLength(0);
    const later = new Date(NOW.getTime() + 61_000);
    expect(await reconcileCheckouts(d, provider(s), later)).toMatchObject({ paid: 1 });
  });

  it("does not run while the card path is off, nor without a provider", async () => {
    process.env.CP_STRIPE_SECRET_KEY = LIVE_KEY;
    const s = stagedStripe(new Map([["cs_live_x", {}]]));
    const d = openDb(":memory:");
    insertRow(d, "cs_live_x", { provider: "stripe" });
    expect(await reconcileCheckouts(d, provider(s, LIVE_KEY), NOW)).toBeNull();
    expect(s.calls).toHaveLength(0);
    process.env.CP_STRIPE_SECRET_KEY = TEST_KEY;
    expect(await reconcileCheckouts(d, null, NOW)).toBeNull();
  });

  it("logs one line of counts per run, with no reference and no address in it", async () => {
    const s = stagedStripe(new Map([["cs_test_logged", {}]]));
    const d = openDb(":memory:");
    insertRow(d, "cs_test_logged", { address: "key:someone@example.com", cents: 1_000 });
    s.answers.set("cs_test_logged", { amount_total: 1_000 });
    await reconcileCheckouts(d, provider(s), NOW);
    const lines = log.mock.calls.map((c) => c.join(" "));
    expect(lines).toEqual(["[reconcile] provider=stripe_test paid=1 abandoned=0 open=0 error=0 skipped=0"]);
    expect(lines.join("\n")).not.toContain("cs_test_logged");
    expect(lines.join("\n")).not.toContain("someone@example.com");
  });
});

describe("reconcile and /katalog/danke on the same session", () => {
  it("settles an offer once", async () => {
    const s = stagedStripe(new Map([["cs_test_both", {}]]));
    const d = openDb(":memory:");
    insertRow(d, "cs_test_both");
    const p = provider(s);
    const app = createApp({ db: d, checkout: p, rateLimit: null });
    const [r, page] = await Promise.all([reconcileCheckouts(d, p, NOW), app.request("/katalog/danke?session_id=cs_test_both")]);
    expect(r).toMatchObject({ paid: 1 });
    expect(page.status).toBe(200);
    const settled = row(d, "cs_test_both").settled_at;
    expect(settled).not.toBeNull();
    await app.request("/katalog/danke?session_id=cs_test_both");
    await reconcileCheckouts(d, p, NOW);
    expect(row(d, "cs_test_both").settled_at, "settled once, never again").toBe(settled);
  });

  it("credits a topup once: one row in the ledger", async () => {
    const s = stagedStripe(new Map([["*", { amount_total: 1_500 }]]));
    const d = openDb(":memory:");
    const p = provider(s);
    const { checkout } = await beginCheckout(d, p, { address: "key:buyer", cents: 1_500 });
    const app = createApp({ db: d, checkout: p, rateLimit: null });
    const later = new Date(Date.now() + 10 * 60_000);
    await Promise.all([reconcileCheckouts(d, p, later), app.request(`/katalog/danke?session_id=${checkout.reference}`)]);
    expect(row(d, checkout.reference).status).toBe("paid");
    const ledger = d.prepare("SELECT count(*) AS n FROM ledger WHERE ref = ?").get(`checkout:${checkout.reference}`) as { n: number };
    expect(ledger.n).toBe(1);
    const wallet = d.prepare("SELECT balance_mc FROM wallets WHERE address = 'key:buyer'").get() as { balance_mc: number };
    expect(wallet.balance_mc).toBe(1_500 * 1_000);
  });
});
