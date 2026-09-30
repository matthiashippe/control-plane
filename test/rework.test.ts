/**
 * HAN-95: a round of changes on a paid catalogue order. The buyer writes under one of the three
 * texts what should change, and gets the whole text again, written on the same model; the earlier
 * text stays. At most three rounds per order, the price does not rise.
 *
 * Every rule is held from both sides: a round that should go through does, and changes the text; one
 * that should not (fourth round, empty feedback, a stranger's token, an unchanged text) does not,
 * and costs the buyer no round.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import { fakeProvider } from "../src/checkout/index.js";
import {
  currentText,
  deliverPaidOrders,
  MAX_REWORK_ROUNDS,
  REWORK_TTL_MS,
  ReworkError,
  reworkVersion,
  type Version,
  type VersionWriter,
} from "../src/checkout/deliver.js";
import { OFFERS } from "../src/public/catalog.js";

type Db = ReturnType<typeof openDb>;
const TEXT_OFFER = OFFERS.find((o) => o.id === "text-ueber-ihr-angebot")!;
const OURS = "demo-rework@example.invalid";
const T0 = new Date("2026-10-01T10:00:00.000Z");
const at = (min: number) => () => new Date(T0.getTime() + min * 60_000);

let n = 0;
/** A paid order whose three texts are written, as the delivery run leaves it. */
async function writtenOrder(d: Db) {
  n += 1;
  const reference = `cs_test_rework_${n}`;
  const token = `${"r".repeat(38)}${String(n).padStart(5, "0")}`;
  d.prepare("INSERT INTO checkouts (reference, address, offer, cents, provider, status, created_at, settled_at) VALUES (?, NULL, ?, ?, 'stripe_test', 'paid', ?, ?)").run(
    reference,
    TEXT_OFFER.id,
    TEXT_OFFER.priceCents,
    new Date(T0.getTime() - 60_000).toISOString(),
    T0.toISOString(),
  );
  d.prepare("INSERT INTO order_briefs (reference, brief, email, created_at, token) VALUES (?, ?, ?, ?, ?)").run(
    reference,
    JSON.stringify({ was: "Klavierunterricht für Kinder und Erwachsene", fuer_wen: "Familien in Altona", wo: "Aushang" }),
    OURS,
    T0.toISOString(),
    token,
  );
  const first = writer((i) => ({ text: `Order ${n} text ${i}` }));
  await deliverPaidOrders(d, first, null, at(5));
  return { reference, token };
}

/** A writer that answers from a script per call and remembers what it was asked. */
function writer(script: (call: number, req: { model: string; user: string }) => { text: string; costMc?: number } | Error) {
  const calls: { model: string; system: string; user: string }[] = [];
  const w: VersionWriter & { calls: typeof calls } = {
    models: ["model-a", "model-b"],
    calls,
    async write(req) {
      calls.push(req);
      const out = script(calls.length, req);
      if (out instanceof Error) throw out;
      return { text: out.text, costMc: out.costMc ?? 500, upstream: "Azure" };
    },
  };
  return w;
}
/** Every call gives a new text, numbered. */
const fresh = () => writer((i) => ({ text: `Rewritten ${i}` }));

const row = (d: Db, reference: string) =>
  d.prepare("SELECT rounds, rework_at, cost_mc, body, status FROM deliveries WHERE reference = ?").get(reference) as {
    rounds: number;
    rework_at: string | null;
    cost_mc: number;
    body: string;
    status: string;
  };
const versions = (d: Db, reference: string) => JSON.parse(row(d, reference).body) as Version[];

async function refused(p: Promise<unknown>): Promise<ReworkError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ReworkError) return e;
    throw e;
  }
  throw new Error("expected a refusal");
}

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  process.env.CP_CHECKOUT = "1";
  process.env.CP_TEST_DELIVERY_TO = OURS;
  log = vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  delete process.env.CP_CHECKOUT;
  delete process.env.CP_TEST_DELIVERY_TO;
  log.mockRestore();
});

describe("reworkVersion", () => {
  it("writes the whole text again from the old text and the feedback, on the same model, and keeps the old one", async () => {
    const d = openDb(":memory:");
    const { reference, token } = await writtenOrder(d);
    const before = versions(d, reference);
    const costBefore = row(d, reference).cost_mc;
    const w = fresh();
    const r = await reworkVersion(d, w, { token, slot: 1, feedback: "  Bitte kürzer und ohne Ausrufezeichen  " }, at(20));
    expect(r).toEqual({ round: 1, slot: 1, text: "Rewritten 1" });

    // In: the text as it stood and the feedback, on the model that wrote it.
    expect(w.calls).toHaveLength(1);
    expect(w.calls[0].model).toBe(before[1].model);
    const sent = JSON.parse(w.calls[0].user) as { text: string; feedback: string };
    expect(sent.text).toBe(before[1].text);
    expect(sent.feedback).toBe("Bitte kürzer und ohne Ausrufezeichen");

    // Out: a new text that differs from the old, the old one still there, the other two untouched.
    const after = versions(d, reference);
    expect(currentText(after[1])).toBe("Rewritten 1");
    expect(currentText(after[1])).not.toBe(before[1].text);
    expect(after[1].text, "the first text stays in body").toBe(before[1].text);
    expect(after[1].revisions).toEqual([{ feedback: "Bitte kürzer und ohne Ausrufezeichen", text: "Rewritten 1", upstream: "Azure", at: at(20)().toISOString() }]);
    expect(after[0]).toEqual(before[0]);
    expect(after[2]).toEqual(before[2]);

    // Counted, cost booked, price unchanged, nothing left reserved.
    expect(row(d, reference)).toMatchObject({ rounds: 1, rework_at: null, cost_mc: costBefore + 500, status: "written" });
    expect((d.prepare("SELECT cents FROM checkouts WHERE reference = ?").get(reference) as { cents: number }).cents).toBe(TEXT_OFFER.priceCents);
  });

  it("a second round works on the text as it stands now, and every earlier text stays", async () => {
    const d = openDb(":memory:");
    const { reference, token } = await writtenOrder(d);
    const first = versions(d, reference)[0].text;
    const w = fresh();
    await reworkVersion(d, w, { token, slot: 0, feedback: "wärmer" }, at(20));
    await reworkVersion(d, w, { token, slot: 0, feedback: "noch kürzer" }, at(21));
    expect((JSON.parse(w.calls[1].user) as { text: string }).text).toBe("Rewritten 1");
    const v = versions(d, reference)[0];
    expect([v.text, ...v.revisions!.map((r) => r.text)]).toEqual([first, "Rewritten 1", "Rewritten 2"]);
    expect(row(d, reference).rounds).toBe(2);
  });

  it(`allows ${MAX_REWORK_ROUNDS} rounds per order over all three texts, and refuses the next without asking the model`, async () => {
    const d = openDb(":memory:");
    const { reference, token } = await writtenOrder(d);
    const w = fresh();
    for (const slot of [0, 1, 2]) await reworkVersion(d, w, { token, slot, feedback: "anders" }, at(20 + slot));
    expect(row(d, reference).rounds).toBe(3);
    const e = await refused(reworkVersion(d, w, { token, slot: 0, feedback: "noch einmal" }, at(30)));
    expect([e.code, e.status]).toEqual(["no_rounds_left", 409]);
    expect(w.calls, "the fourth round costs no model call").toHaveLength(3);
    expect(row(d, reference)).toMatchObject({ rounds: 3, rework_at: null });
  });

  it("refuses empty feedback before anything is reserved or asked", async () => {
    const d = openDb(":memory:");
    const { reference, token } = await writtenOrder(d);
    const w = fresh();
    for (const feedback of ["", "   ", "\n\t"]) {
      const e = await refused(reworkVersion(d, w, { token, slot: 0, feedback }, at(20)));
      expect([e.code, e.status]).toEqual(["empty_feedback", 400]);
    }
    expect(w.calls).toHaveLength(0);
    expect(row(d, reference)).toMatchObject({ rounds: 0, rework_at: null });
    // The other side: one word is enough.
    await reworkVersion(d, w, { token, slot: 0, feedback: "kürzer" }, at(21));
    expect(row(d, reference).rounds).toBe(1);
  });

  it("a token reaches its own order and no other one", async () => {
    const d = openDb(":memory:");
    const a = await writtenOrder(d);
    const b = await writtenOrder(d);
    const bBefore = row(d, b.reference).body;
    const w = fresh();
    await reworkVersion(d, w, { token: a.token, slot: 0, feedback: "kürzer" }, at(20));
    expect(row(d, a.reference).rounds).toBe(1);
    expect(row(d, b.reference)).toMatchObject({ rounds: 0, body: bBefore });

    for (const token of ["s".repeat(43), a.token.slice(0, -1) + "9", ""]) {
      const e = await refused(reworkVersion(d, w, { token, slot: 0, feedback: "kürzer" }, at(21)));
      expect([e.code, e.status]).toEqual(["no_order", 404]);
    }
    expect(w.calls).toHaveLength(1);
  });

  it("refuses an order that is not written yet, or not paid", async () => {
    const d = openDb(":memory:");
    const { reference, token } = await writtenOrder(d);
    d.prepare("UPDATE deliveries SET status = 'claimed' WHERE reference = ?").run(reference);
    expect((await refused(reworkVersion(d, fresh(), { token, slot: 0, feedback: "x" }, at(20)))).code).toBe("no_order");
    d.prepare("UPDATE deliveries SET status = 'written' WHERE reference = ?").run(reference);
    d.prepare("UPDATE checkouts SET status = 'open' WHERE reference = ?").run(reference);
    expect((await refused(reworkVersion(d, fresh(), { token, slot: 0, feedback: "x" }, at(20)))).code).toBe("no_order");
  });

  it("does not count a text that comes back unchanged, or as a copy of another version", async () => {
    const d = openDb(":memory:");
    const { reference, token } = await writtenOrder(d);
    const before = versions(d, reference);
    const costBefore = row(d, reference).cost_mc;
    // Same as before, twice.
    const same = writer(() => ({ text: `  ${before[0].text}  ` }));
    const e = await refused(reworkVersion(d, same, { token, slot: 0, feedback: "anders" }, at(20)));
    expect([e.code, e.status]).toEqual(["unchanged", 502]);
    expect(same.calls, "one retry, then stop").toHaveLength(2);
    // A copy of version 2, twice.
    const copy = writer(() => ({ text: before[1].text }));
    expect((await refused(reworkVersion(d, copy, { token, slot: 0, feedback: "anders" }, at(21)))).code).toBe("unchanged");
    // No round counted, nothing reserved, the body as it was; what the calls cost is booked.
    expect(row(d, reference)).toMatchObject({ rounds: 0, rework_at: null, cost_mc: costBefore + 4 * 500 });
    expect(versions(d, reference)).toEqual(before);
    // The other side: unchanged once, then a new text, counts as one round.
    const second = writer((i) => ({ text: i === 1 ? before[0].text : "Finally different" }));
    const r = await reworkVersion(d, second, { token, slot: 0, feedback: "anders" }, at(22));
    expect(r.text).toBe("Finally different");
    expect(row(d, reference).rounds).toBe(1);
  });

  it("does not count a round the writer failed, and releases it", async () => {
    const d = openDb(":memory:");
    const { reference, token } = await writtenOrder(d);
    const broken = writer(() => new Error("upstream down"));
    const e = await refused(reworkVersion(d, broken, { token, slot: 2, feedback: "anders" }, at(20)));
    expect([e.code, e.status]).toEqual(["writer_failed", 502]);
    expect(row(d, reference)).toMatchObject({ rounds: 0, rework_at: null });
    expect((await refused(reworkVersion(d, null, { token, slot: 2, feedback: "anders" }, at(20)))).code).toBe("no_writer");
    await reworkVersion(d, fresh(), { token, slot: 2, feedback: "anders" }, at(21));
    expect(row(d, reference).rounds).toBe(1);
  });

  it("lets one round run at a time, so two clicks cannot pass the limit together", async () => {
    const d = openDb(":memory:");
    const { reference, token } = await writtenOrder(d);
    d.prepare("UPDATE deliveries SET rounds = 2 WHERE reference = ?").run(reference);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: VersionWriter = { models: ["model-a"], write: async () => (await gate, { text: "Slow new text", costMc: 500, upstream: null }) };
    const one = reworkVersion(d, slow, { token, slot: 0, feedback: "a" }, at(20));
    const two = await refused(reworkVersion(d, fresh(), { token, slot: 1, feedback: "b" }, at(20)));
    expect([two.code, two.status]).toEqual(["busy", 409]);
    release();
    await one;
    expect(row(d, reference)).toMatchObject({ rounds: 3, rework_at: null });
  });

  it("frees a reservation left by a request that died, after REWORK_TTL_MS and not before", async () => {
    const d = openDb(":memory:");
    const { reference, token } = await writtenOrder(d);
    d.prepare("UPDATE deliveries SET rework_at = ? WHERE reference = ?").run(at(20)().toISOString(), reference);
    const early = new Date(at(20)().getTime() + REWORK_TTL_MS - 1000);
    expect((await refused(reworkVersion(d, fresh(), { token, slot: 0, feedback: "x" }, () => early))).code).toBe("busy");
    const late = new Date(at(20)().getTime() + REWORK_TTL_MS + 1000);
    await reworkVersion(d, fresh(), { token, slot: 0, feedback: "x" }, () => late);
    expect(row(d, reference).rounds).toBe(1);
  });

  it("refuses a version that does not exist and feedback over the limit", async () => {
    const d = openDb(":memory:");
    const { token } = await writtenOrder(d);
    for (const slot of [-1, 3, 1.5, Number.NaN]) {
      expect((await refused(reworkVersion(d, fresh(), { token, slot, feedback: "x" }, at(20)))).code).toBe("bad_version");
    }
    expect((await refused(reworkVersion(d, fresh(), { token, slot: 0, feedback: "x".repeat(2001) }, at(20)))).code).toBe("feedback_too_long");
  });
});

describe("/katalog/nachbessern and the page", () => {
  const appWith = (d: Db, w: VersionWriter | null = fresh()) => createApp({ db: d, checkout: fakeProvider(), rateLimit: null, rework: w });
  const form = (fields: Record<string, string>) => ({
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });

  it("shows one field under each of the three texts, with the rounds left", async () => {
    const d = openDb(":memory:");
    const { token } = await writtenOrder(d);
    const html = await (await appWith(d).request(`/katalog/fassungen?t=${token}`)).text();
    expect(html.match(/<textarea [^>]*name="wunsch"/g)).toHaveLength(3);
    expect(html.match(/action="\/katalog\/nachbessern"/g)).toHaveLength(3);
    for (const i of [1, 2, 3]) expect(html).toContain(`name="fassung" value="${i}"`);
    expect(html).toContain("Das geht noch dreimal, ohne Aufpreis");
    expect(html, "no select, no second field: the buyer's own words").not.toContain("<select");
    expect(html, "no more mail detour").not.toContain("mailto:");
  });

  it("a form round answers 303 back to the page, which shows the new text and keeps the old one a click away", async () => {
    const d = openDb(":memory:");
    const { reference, token } = await writtenOrder(d);
    const old = versions(d, reference)[1].text;
    const app = appWith(d);
    const res = await app.request("/katalog/nachbessern", form({ t: token, fassung: "2", wunsch: "Bitte <b>kürzer</b>" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`/katalog/fassungen?t=${token}&fassung=2&runde=1`);
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    const html = await (await app.request(res.headers.get("location")!)).text();
    expect(html).toContain("Fassung 2 ist neu geschrieben. Das war Runde 1 von 3.");
    expect(html).toContain("Rewritten 1");
    expect(html).toContain("Frühere Fassung ansehen (1)");
    expect(html).toContain(old);
    expect(html, "the feedback is escaped").toContain("Bitte &lt;b&gt;kürzer&lt;/b&gt;");
    expect(html).not.toContain("<b>kürzer</b>");
    expect(html).toContain("Das geht noch zweimal");
  });

  it("answers JSON to JSON, so an agent acting for the buyer can use it", async () => {
    const d = openDb(":memory:");
    const { token } = await writtenOrder(d);
    const res = await appWith(d).request("/katalog/nachbessern", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, fassung: 3, wunsch: "förmlicher" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ fassung: 3, runde: 1, runden_hoechstens: 3, text: "Rewritten 1" });
  });

  it("after three rounds shows no field and says why, and a fourth POST is refused with the reason", async () => {
    const d = openDb(":memory:");
    const { reference, token } = await writtenOrder(d);
    const app = appWith(d);
    for (const f of ["1", "2", "3"]) expect((await app.request("/katalog/nachbessern", form({ t: token, fassung: f, wunsch: "anders" }))).status).toBe(303);
    const html = await (await app.request(`/katalog/fassungen?t=${token}`)).text();
    expect(html).not.toContain('name="wunsch"');
    expect(html).toContain("Sie haben alle 3 Runden genutzt.");
    const fourth = await app.request("/katalog/nachbessern", form({ t: token, fassung: "1", wunsch: "noch einmal" }));
    expect(fourth.status).toBe(409);
    expect(await fourth.text()).toContain("Mehr Runden gibt es je Bestellung nicht, weil jede für Sie ohne Aufpreis ist.");
    expect(row(d, reference).rounds).toBe(3);
  });

  it("an empty field gets the page back with the reason and no round counted", async () => {
    const d = openDb(":memory:");
    const { reference, token } = await writtenOrder(d);
    const res = await appWith(d).request("/katalog/nachbessern", form({ t: token, fassung: "1", wunsch: "  " }));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Bitte schreiben Sie in das Feld, was anders werden soll.");
    expect(row(d, reference).rounds).toBe(0);
  });

  it("a stranger's or malformed token gets 404 and touches nothing", async () => {
    const d = openDb(":memory:");
    const { reference } = await writtenOrder(d);
    const w = fresh();
    const app = appWith(d, w);
    for (const t of ["q".repeat(43), "../etc", ""]) {
      const res = await app.request("/katalog/nachbessern", form({ t, fassung: "1", wunsch: "kürzer" }));
      expect(res.status).toBe(404);
      expect(await res.text()).toContain("Zu diesem Link finden wir keine Bestellung.");
    }
    expect(w.calls).toHaveLength(0);
    expect(row(d, reference).rounds).toBe(0);
  });

  it("sits behind the per-address cap like the other paths that spend a model call", async () => {
    const d = openDb(":memory:");
    const app = createApp({ db: d, checkout: fakeProvider(), rateLimit: { limit: 2, windowMs: 60_000 }, rework: fresh() });
    const hit = () => app.request("/katalog/nachbessern", form({ t: "q".repeat(43), fassung: "1", wunsch: "x" }));
    expect((await hit()).status).toBe(404);
    expect((await hit()).status).toBe(404);
    expect((await hit()).status).toBe(429);
  });
});
