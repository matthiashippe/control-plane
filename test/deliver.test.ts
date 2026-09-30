/**
 * HAN-67 (Goal 23, delivered on the page first): a paid catalogue order becomes three texts without
 * anybody touching it, and the buyer reads them behind a token on the page Stripe sends them back to.
 *
 * The writer is a stub here; where the wire matters (`zdr`, error classes, `provider`) the test goes
 * through `OpenRouterProvider` with a staged `fetch`. Every rule is held from both sides.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, cleanupOrderBriefs, PAID_BRIEF_DAYS } from "../src/db.js";
import { createApp } from "../src/app.js";
import { beginOfferCheckout, DELIVERY_TOKEN_PATTERN, fakeProvider, settleCheckout } from "../src/checkout/index.js";
import {
  chatWriter,
  countsAsAttempt,
  deliverPaidOrders,
  DELIVERY_COST_CAP_MC,
  DELIVERY_START,
  MAX_ATTEMPTS,
  STALE_WRITTEN_MS,
  type Mailer,
  type VersionWriter,
} from "../src/checkout/deliver.js";
import { OpenRouterProvider } from "../src/inference/openrouter.js";
import { ProviderBadRequestError, ProviderUnavailableError } from "../src/inference/provider.js";
import { OFFERS } from "../src/public/catalog.js";

type Db = ReturnType<typeof openDb>;
const TEXT_OFFER = OFFERS.find((o) => o.id === "text-ueber-ihr-angebot")!;
const SPEECH = OFFERS.find((o) => o.id === "rede-zum-fest")!;
const OURS = "vorfuehrung@postyourprice.com";
const MARKER_EMAIL = "zz-unmistakable-7f3a@postyourprice.com";
const T0 = new Date("2026-10-01T10:00:00.000Z");
const at = (min: number) => () => new Date(T0.getTime() + min * 60_000);

let n = 0;
function paidOrder(
  d: Db,
  o: { provider?: string; email?: string; settledAt?: string; offer?: typeof TEXT_OFFER; brief?: Record<string, string> } = {},
) {
  n += 1;
  const reference = `cs_test_deliver_${n}`;
  const offer = o.offer ?? TEXT_OFFER;
  const brief = o.brief ?? { was: "Klavierunterricht für Kinder und Erwachsene", fuer_wen: "Familien in Altona", wo: "Aushang" };
  const token = `${"a".repeat(38)}${String(n).padStart(5, "0")}`;
  d.prepare("INSERT INTO checkouts (reference, address, offer, cents, provider, status, created_at, settled_at) VALUES (?, NULL, ?, ?, ?, 'paid', ?, ?)").run(
    reference,
    offer.id,
    offer.priceCents,
    o.provider ?? "stripe_test",
    new Date(T0.getTime() - 60_000).toISOString(),
    o.settledAt ?? T0.toISOString(),
  );
  d.prepare("INSERT INTO order_briefs (reference, brief, email, created_at, token) VALUES (?, ?, ?, ?, ?)").run(
    reference,
    JSON.stringify(brief),
    o.email ?? OURS,
    T0.toISOString(),
    token,
  );
  return { reference, token };
}

/** A writer that answers from a script per call; default three different texts. */
function stubWriter(script: (call: number, model: string) => { text: string; costMc?: number } | Error = (i) => ({ text: `Text number ${i}` })) {
  const calls: { model: string; system: string; user: string }[] = [];
  const w: VersionWriter & { calls: typeof calls } = {
    models: ["model-a", "model-b"],
    calls,
    async write(req) {
      calls.push(req);
      const out = script(calls.length, req.model);
      if (out instanceof Error) throw out;
      return { text: out.text, costMc: out.costMc ?? 100, upstream: "Azure" };
    },
  };
  return w;
}

const delivery = (d: Db, reference: string) =>
  d.prepare("SELECT * FROM deliveries WHERE reference = ?").get(reference) as
    | { status: string; attempts: number; versions: number; body: string | null; upstreams: string; cost_mc: number; error: string | null; written_at: string | null; sent_at: string | null; message_id: string | null }
    | undefined;

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  delete process.env.CP_CHECKOUT_LIVE;
  process.env.CP_CHECKOUT = "1";
  delete process.env.CP_STRIPE_SECRET_KEY;
  log = vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  delete process.env.CP_CHECKOUT;
  log.mockRestore();
});

describe("deliverPaidOrders", () => {
  it("writes three texts for a paid order with a brief, once, and leaves it written without a mailer", async () => {
    const d = openDb(":memory:");
    const { reference } = paidOrder(d);
    const w = stubWriter();
    const r = await deliverPaidOrders(d, w, null, at(5));
    expect(r).toMatchObject({ found: 1, written: 1, sent: 0, failed: 0, upstreams: { Azure: 3 } });
    const row = delivery(d, reference)!;
    expect(row).toMatchObject({ status: "written", versions: 3, attempts: 0, error: null, sent_at: null });
    expect(row.written_at).toBe(at(5)().toISOString());
    expect(JSON.parse(row.upstreams)).toEqual(["Azure", "Azure", "Azure"]);
    expect(row.cost_mc).toBe(300);
    expect(w.calls.map((c) => c.model)).toEqual(["model-a", "model-b", "model-a"]);
    // The next run finds nothing and asks nobody.
    const again = await deliverPaidOrders(d, w, null, at(10));
    expect(again).toMatchObject({ found: 0, written: 0 });
    expect(w.calls).toHaveLength(3);
    expect(delivery(d, reference)!.written_at, "written_at is set once").toBe(at(5)().toISOString());
  });

  it("writes nothing for pending, abandoned, paid without brief, or paid before DELIVERY_START", async () => {
    const d = openDb(":memory:");
    const w = stubWriter();
    for (const status of ["pending", "abandoned"]) {
      const { reference } = paidOrder(d);
      d.prepare("UPDATE checkouts SET status = ? WHERE reference = ?").run(status, reference);
    }
    d.prepare("INSERT INTO checkouts (reference, address, offer, cents, provider, status, created_at, settled_at) VALUES ('cs_test_nobrief', NULL, ?, 1700, 'stripe_test', 'paid', ?, ?)").run(
      TEXT_OFFER.id,
      T0.toISOString(),
      T0.toISOString(),
    );
    const before = paidOrder(d, { settledAt: new Date(Date.parse(DELIVERY_START) - 1).toISOString() });
    const r = await deliverPaidOrders(d, w, null, at(5));
    expect(r).toMatchObject({ found: 0 });
    expect(w.calls).toHaveLength(0);
    expect(delivery(d, before.reference)).toBeUndefined();
    // Counter-check: the same row one millisecond later is written.
    const after = paidOrder(d, { settledAt: DELIVERY_START });
    expect(await deliverPaidOrders(d, w, null, at(5))).toMatchObject({ found: 1, written: 1 });
    expect(delivery(d, after.reference)!.status).toBe("written");
  });

  it("writes a test-mode order only for the demo address, and any address in live mode", async () => {
    const d = openDb(":memory:");
    const w = stubWriter();
    const strangers = ["x@example.com", "andere@postyourprice.com", "someone@gmail.com"].map((email) => paidOrder(d, { email }));
    const ours = paidOrder(d, { email: "Vorfuehrung@PostYourPrice.com" });
    const live = paidOrder(d, { provider: "stripe", email: "someone@gmail.com" });
    const r = await deliverPaidOrders(d, w, null, at(5));
    expect(r).toMatchObject({ found: 2, written: 2 });
    for (const s of strangers) expect(delivery(d, s.reference)).toBeUndefined();
    expect(delivery(d, ours.reference)!.status).toBe("written");
    expect(delivery(d, live.reference)!.status).toBe("written");
  });

  it("does not run with the card path off or without a writer", async () => {
    const d = openDb(":memory:");
    paidOrder(d);
    const w = stubWriter();
    delete process.env.CP_CHECKOUT;
    expect(await deliverPaidOrders(d, w, null, at(5))).toBeNull();
    process.env.CP_CHECKOUT = "1";
    expect(await deliverPaidOrders(d, null, null, at(5))).toBeNull();
    expect(w.calls).toHaveLength(0);
    expect(await deliverPaidOrders(d, w, null, at(5))).toMatchObject({ written: 1 });
  });

  it("rewrites a failing text once, keeps the good ones, and never shows fewer than three", async () => {
    const d = openDb(":memory:");
    const { reference } = paidOrder(d);
    // Call 2 and its rewrite (call 3) come back empty.
    const w = stubWriter((i) => ({ text: i === 2 || i === 3 ? "   " : `Text ${i}` }));
    const r = await deliverPaidOrders(d, w, null, at(5));
    expect(r).toMatchObject({ written: 0, open: 1 });
    const row = delivery(d, reference)!;
    expect(row).toMatchObject({ status: "claimed", versions: 2, attempts: 1, error: "check_empty" });
    expect(w.calls).toHaveLength(4);
    // Next run writes only the missing slot, and the stored ones are never written again.
    const w2 = stubWriter(() => ({ text: "The missing one" }));
    expect(await deliverPaidOrders(d, w2, null, at(10))).toMatchObject({ written: 1 });
    expect(w2.calls).toHaveLength(1);
    const body = JSON.parse(delivery(d, reference)!.body!) as { text: string }[];
    expect(body.map((v) => v.text)).toEqual(["Text 1", "The missing one", "Text 4"]);
  });

  it("refuses a copy of another text and a speech of the wrong length", async () => {
    const d = openDb(":memory:");
    const brief = { anlass: "70. Geburtstag", person: "Oma Hilde", laenge: "3 Minuten", inhalt: "Sie hat vierzig Jahre lang die Bäckerei am Markt geführt und alle Enkel großgezogen." };
    const { reference } = paidOrder(d, { offer: SPEECH, brief });
    const ok = (k: number) => Array.from({ length: 390 }, (_, i) => `w${k}_${i}`).join(" ");
    const w = stubWriter((i) => ({ text: i === 1 ? ok(1) : i === 2 ? ok(1) : i === 3 ? "far too short" : ok(i) }));
    await deliverPaidOrders(d, w, null, at(5));
    const row = delivery(d, reference)!;
    expect(row.versions, "slot 2: duplicate then too short").toBe(2);
    expect(row.error).toBe("check_length");
    // Counter-check: in range and different, all three pass.
    const d2 = openDb(":memory:");
    const other = paidOrder(d2, { offer: SPEECH, brief });
    await deliverPaidOrders(d2, stubWriter((i) => ({ text: ok(i) })), null, at(5));
    expect(delivery(d2, other.reference)!.versions).toBe(3);
  });

  it("fails a row after five counted attempts, and a later run asks nobody", async () => {
    const d = openDb(":memory:");
    const { reference } = paidOrder(d);
    const w = stubWriter(() => new ProviderBadRequestError("openrouter", {}));
    for (let i = 0; i < MAX_ATTEMPTS; i++) await deliverPaidOrders(d, w, null, at(5 * (i + 1)));
    expect(delivery(d, reference)).toMatchObject({ status: "failed", error: "attempts_exhausted", attempts: MAX_ATTEMPTS });
    const calls = w.calls.length;
    await deliverPaidOrders(d, w, null, at(60));
    expect(w.calls.length, "failed is final").toBe(calls);
  });

  it("does not count 429, 5xx or a timeout, and delivers on the seventh run", async () => {
    const d = openDb(":memory:");
    const { reference } = paidOrder(d);
    let broken = true;
    const errs = [429, 502, null];
    let k = 0;
    const w = stubWriter((i) => (broken ? new ProviderUnavailableError("openrouter", errs[k++ % 3], "x") : { text: `T${i}` }));
    for (let i = 0; i < 6; i++) await deliverPaidOrders(d, w, null, at(5 * (i + 1)));
    expect(delivery(d, reference)).toMatchObject({ status: "claimed", attempts: 0 });
    broken = false;
    expect(await deliverPaidOrders(d, w, null, at(40))).toMatchObject({ written: 1 });
  });

  it("stops at the cost cap summed over runs, and a later run asks nobody", async () => {
    const d = openDb(":memory:");
    const { reference } = paidOrder(d);
    const w = stubWriter(() => ({ text: "", costMc: 9_000 }));
    for (let i = 0; i < 4; i++) await deliverPaidOrders(d, w, null, at(5 * (i + 1)));
    const row = delivery(d, reference)!;
    expect(row).toMatchObject({ status: "failed", error: "cost_cap" });
    expect(row.cost_mc).toBeGreaterThanOrEqual(DELIVERY_COST_CAP_MC);
    expect(row.cost_mc).toBeLessThan(DELIVERY_COST_CAP_MC + 9_000);
    const calls = w.calls.length;
    await deliverPaidOrders(d, w, null, at(60));
    expect(w.calls.length).toBe(calls);
  });

  it("lets only one of two concurrent runs take a row", async () => {
    const d = openDb(":memory:");
    const d2 = openDb(":memory:");
    paidOrder(d);
    const w = stubWriter();
    const [a, b] = await Promise.all([deliverPaidOrders(d, w, null, at(5)), deliverPaidOrders(d, w, null, at(5))]);
    expect([a, b].filter((x) => x === null)).toHaveLength(1);
    expect(w.calls).toHaveLength(3);
    // A stale claim from a dead run is taken again after 30 minutes, not before.
    const { reference } = paidOrder(d2);
    d2.prepare("INSERT INTO deliveries (reference, status, claimed_at) VALUES (?, 'claimed', ?)").run(reference, at(0)().toISOString());
    expect(await deliverPaidOrders(d2, w, null, at(29))).toMatchObject({ found: 0 });
    expect(await deliverPaidOrders(d2, w, null, at(31))).toMatchObject({ written: 1 });
  });

  it("logs counts only: no address, no reference, no text", async () => {
    const d = openDb(":memory:");
    const { reference } = paidOrder(d, { email: OURS });
    await deliverPaidOrders(d, stubWriter(() => ({ text: `secret-text-${Math.random()}` })), null, at(5));
    const lines = log.mock.calls.map((c) => String(c[0]));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\[deliver\] found=1 written=1 sent=0 failed=0 open=0 upstreams=Azure:3 mailer=off seconds=/);
    for (const bad of [OURS, reference, "secret-text", "Klavier"]) expect(lines[0]).not.toContain(bad);
  });
});

describe("the mailer seam", () => {
  const mailer = () => {
    const sent: { idempotencyKey: string; to: string }[] = [];
    const m: Mailer & { sent: typeof sent } = {
      sent,
      async send(x) {
        sent.push({ idempotencyKey: x.idempotencyKey, to: x.to });
        return { id: `msg_${sent.length}` };
      },
    };
    return m;
  };

  it("sends a written row once, with the reference as the key", async () => {
    const d = openDb(":memory:");
    const { reference } = paidOrder(d);
    const m = mailer();
    expect(await deliverPaidOrders(d, stubWriter(), m, at(5))).toMatchObject({ written: 1, sent: 1 });
    expect(m.sent).toEqual([{ idempotencyKey: reference, to: OURS }]);
    expect(delivery(d, reference)).toMatchObject({ status: "sent", message_id: "msg_1" });
    await deliverPaidOrders(d, stubWriter(), m, at(10));
    expect(m.sent).toHaveLength(1);
  });

  it("sends a row written earlier without writing it again, and not after 23 hours", async () => {
    const d = openDb(":memory:");
    const fresh = paidOrder(d);
    const stale = paidOrder(d);
    const w = stubWriter();
    await deliverPaidOrders(d, w, null, at(5));
    d.prepare("UPDATE deliveries SET written_at = ? WHERE reference = ?").run(new Date(T0.getTime() - STALE_WRITTEN_MS - 60_000).toISOString(), stale.reference);
    const m = mailer();
    await deliverPaidOrders(d, w, m, at(10));
    expect(w.calls, "nothing rewritten").toHaveLength(6);
    expect(m.sent.map((s) => s.idempotencyKey)).toEqual([fresh.reference]);
    expect(delivery(d, stale.reference)).toMatchObject({ status: "failed", error: "stale_written" });
  });
});

describe("on the wire, through OpenRouterProvider", () => {
  function staged(answer: (body: Record<string, unknown>, init?: RequestInit) => Response | Promise<Response>) {
    const bodies: Record<string, unknown>[] = [];
    const impl = (async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      return answer(body, init);
    }) as typeof fetch;
    const p = new OpenRouterProvider({ apiKey: "k", models: ["openai/gpt-5.2", "openai/gpt-5-mini"], fetch: impl, priceRefreshMs: 0, timeoutMs: 50 });
    return { p, bodies };
  }
  const ok = (text: string) =>
    Response.json({ id: "x", model: "m", provider: "Azure", choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0.004 } });

  it("asks with zdr, stores the answering provider and the cost, and never puts the email in a prompt", async () => {
    const d = openDb(":memory:");
    const { reference } = paidOrder(d, { email: MARKER_EMAIL, provider: "stripe" });
    let i = 0;
    const { p, bodies } = staged(() => ok(`Fassung ${++i}`));
    await deliverPaidOrders(d, chatWriter(p, ["openai/gpt-5.2", "openai/gpt-5-mini"]), null, at(5));
    expect(bodies).toHaveLength(3);
    for (const b of bodies) {
      expect(b.provider).toEqual({ zdr: true });
      expect(JSON.stringify(b)).not.toContain(MARKER_EMAIL);
      expect(JSON.stringify(b)).toContain("Klavierunterricht");
    }
    expect(bodies.map((b) => b.model)).toEqual(["openai/gpt-5.2", "openai/gpt-5-mini", "openai/gpt-5.2"]);
    const row = delivery(d, reference)!;
    expect(JSON.parse(row.upstreams)).toEqual(["Azure", "Azure", "Azure"]);
    expect(row.cost_mc, "0.004 USD is 400 mc, three times").toBe(1_200);
  });

  it("does not ask for zdr through the proxy path, even when a caller sends the field", async () => {
    const { p, bodies } = staged(() => ok("x"));
    await p.chat({ model: "openai/gpt-5.2", messages: [{ role: "user", content: "hi" }], maxTokens: 10, apiKeyId: "a", zdr: false });
    expect(bodies[0].provider).toBeUndefined();
  });

  it("classifies each case of the table in Goal 23, point 2", async () => {
    const cases: [string, (body: Record<string, unknown>, init?: RequestInit) => Response | Promise<Response>, boolean][] = [
      ["400", () => Response.json({ error: { message: "bad" } }, { status: 400 }), true],
      ["402", () => new Response("no credit", { status: 402 }), true],
      ["429", () => new Response("slow down", { status: 429 }), false],
      ["502", () => new Response("bad gateway", { status: 502 }), false],
      ["timeout", (_b, init) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))), false],
      ["body error 4xx", () => Response.json({ error: { code: 403, message: "moderation" } }), true],
      ["body error 502", () => Response.json({ error: { code: 502, message: "upstream" } }), false],
      ["body error without code", () => Response.json({ error: { message: "?" } }), true],
      ["no choices", () => Response.json({ id: "x", choices: [] }), true],
    ];
    for (const [name, answer, counts] of cases) {
      const { p } = staged(answer);
      const err = await chatWriter(p, ["openai/gpt-5.2"]).write({ model: "openai/gpt-5.2", system: "s", user: "u", maxTokens: 10 }).catch((e) => e);
      expect(err, name).toBeInstanceOf(Error);
      expect(countsAsAttempt(err), name).toBe(counts);
    }
  });

  it("pays twice for two texts while the third model keeps answering 502, and never counts an attempt", async () => {
    const d = openDb(":memory:");
    const { reference } = paidOrder(d);
    const { p } = staged((b) => (b.model === "openai/gpt-5-mini" ? new Response("down", { status: 502 }) : ok(`T ${Math.random()}`)));
    const w = chatWriter(p, ["openai/gpt-5.2", "openai/gpt-5-mini"]);
    await deliverPaidOrders(d, w, null, at(5));
    const first = delivery(d, reference)!;
    expect(first).toMatchObject({ status: "claimed", versions: 2, attempts: 0, cost_mc: 800 });
    for (let i = 2; i < 6; i++) await deliverPaidOrders(d, w, null, at(5 * i));
    expect(delivery(d, reference)).toMatchObject({ status: "claimed", versions: 2, attempts: 0, cost_mc: 800 });
  });
});

describe("the pages", () => {
  const appWith = (d: Db) => createApp({ db: d, checkout: fakeProvider(), rateLimit: null });

  it("gives every offer order a 256-bit token, not derived from the email or the reference", async () => {
    const d = openDb(":memory:");
    const brief = { was: "Klavierunterricht für Kinder", fuer_wen: "Familien in Altona", wo: "Aushang" };
    const a = await beginOfferCheckout(d, fakeProvider(), { offerId: TEXT_OFFER.id, brief, email: OURS });
    const b = await beginOfferCheckout(d, fakeProvider("other"), { offerId: TEXT_OFFER.id, brief, email: OURS });
    const tokens = d.prepare("SELECT token FROM order_briefs").all() as { token: string }[];
    expect(tokens).toHaveLength(2);
    for (const { token } of tokens) {
      expect(token).toMatch(DELIVERY_TOKEN_PATTERN);
      expect(token).not.toContain(a.checkout.reference);
      expect(token).not.toContain("vorfuehrung");
    }
    expect(tokens[0].token).not.toBe(tokens[1].token);
    expect(b.checkout.reference).not.toBe(a.checkout.reference);
  });

  it("says it is writing and reloads, then shows the three texts, under the right token only", async () => {
    const d = openDb(":memory:");
    const { token } = paidOrder(d);
    const app = appWith(d);
    const waiting = await app.request(`/katalog/fassungen?t=${token}`);
    expect(waiting.status).toBe(200);
    const w = await waiting.text();
    expect(w).toContain("Wir schreiben Ihre drei Fassungen");
    expect(w).toContain('http-equiv="refresh" content="30"');
    expect(waiting.headers.get("referrer-policy")).toBe("no-referrer");
    expect(waiting.headers.get("cache-control")).toBe("no-store");

    await deliverPaidOrders(d, stubWriter((i) => ({ text: `<b>Fassung</b> ${i}\n\nZweiter Absatz` })), null, at(5));
    const html = await (await app.request(`/katalog/fassungen?t=${token}`)).text();
    expect(html).toContain("Ihre drei Fassungen");
    for (const i of [1, 2, 3]) expect(html).toContain(`&lt;b&gt;Fassung&lt;/b&gt; ${i}`);
    expect(html, "the model's output is escaped").not.toContain("<b>Fassung</b>");
    expect(html).not.toContain('http-equiv="refresh"');

    const wrong = token.slice(0, -1) + (token.endsWith("1") ? "2" : "1");
    for (const q of ["", "?t="]) {
      const res = await app.request(`/katalog/fassungen${q}`);
      expect(res.status, q).toBe(303);
      expect(res.headers.get("location")).toBe("/katalog");
    }
    for (const t of [wrong, "short", token + "x", "../../etc"]) {
      const res = await app.request(`/katalog/fassungen?t=${encodeURIComponent(t)}`);
      expect(res.status, t).toBe(404);
      expect(await res.text()).not.toContain("Fassung 1");
    }
  });

  it("does not promise texts to a test-mode stranger, and says so", async () => {
    const d = openDb(":memory:");
    const { token } = paidOrder(d, { email: "x@example.com" });
    const html = await (await appWith(d).request(`/katalog/fassungen?t=${token}`)).text();
    expect(html).toContain("schreiben wir keine Fassungen");
    expect(html).not.toContain("Wir schreiben Ihre drei Fassungen");
  });

  it("shows nothing for an unpaid order, and nothing after the texts went with the brief", async () => {
    const d = openDb(":memory:");
    const unpaid = paidOrder(d);
    d.prepare("UPDATE checkouts SET status = 'pending' WHERE reference = ?").run(unpaid.reference);
    expect((await appWith(d).request(`/katalog/fassungen?t=${unpaid.token}`)).status).toBe(404);

    const { reference, token } = paidOrder(d);
    await deliverPaidOrders(d, stubWriter(), null, at(5));
    cleanupOrderBriefs(d, T0.getTime() + (PAID_BRIEF_DAYS + 1) * 86_400_000);
    expect(delivery(d, reference)).toMatchObject({ status: "written", versions: 3, body: null });
    expect((await appWith(d).request(`/katalog/fassungen?t=${token}`)).status).toBe(404);
  });

  it("links from the return page to the token and moves on by itself, without putting texts under the session id", async () => {
    const d = openDb(":memory:");
    const p = fakeProvider();
    const app = createApp({ db: d, checkout: p, rateLimit: null });
    const brief = { was: "Klavierunterricht für Kinder", fuer_wen: "Familien in Altona", wo: "Aushang" };
    const { checkout } = await beginOfferCheckout(d, p, { offerId: TEXT_OFFER.id, brief, email: OURS });
    await settleCheckout(d, p, { reference: checkout.reference, paid: true });
    const { token } = d.prepare("SELECT token FROM order_briefs").get() as { token: string };
    // The fake provider reads `reference`; the page passes `session_id`, so ask the way Stripe's adapter would.
    const stripeLike = { ...p, reference: (x: unknown) => String((x as { session_id?: string }).session_id ?? "") };
    const app2 = createApp({ db: d, checkout: stripeLike, rateLimit: null });
    await deliverPaidOrders(d, stubWriter(), null, () => new Date());
    const res = await app2.request(`/katalog/danke?session_id=${checkout.reference}`);
    const html = await res.text();
    expect(html).toContain("Ihre Zahlung ist angekommen");
    expect(html).toContain(`/katalog/fassungen?t=${token}`);
    expect(html).toContain(`http-equiv="refresh" content="4;url=/katalog/fassungen?t=${token}"`);
    expect(html, "no text under the session id").not.toContain("Text number");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    void app;
  });
});
