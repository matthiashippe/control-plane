/**
 * The page /h/{code} (goals/konto/02, Punkt 6): it shows what is approved and approves only with the right number, exactly once
 * and only for ten minutes. A code from a foreign session without the matching number approves nothing.
 */
import { describe, expect, it } from "vitest";
import { ATLAS, buttons, create, handoffApp, tap } from "./handoff-helpers.js";

const state = (db: ReturnType<typeof handoffApp>["db"], code: string) =>
  (db.prepare("SELECT state FROM handoffs WHERE code = ?").get(code) as { state: string }).state;

const ERLEDIGT = /<h1>Done\. Go back to your terminal\.<\/h1>/;
const UNGUELTIG = /<h1>This code no longer works\.<\/h1>/;

describe("GET /h/{code}", () => {
  it("shows the name, the daily limit and the amount as $5.00, and three different two-digit numbers with the match among them", async () => {
    const { app } = handoffApp();
    const h = await create(app, { ...ATLAS, amount_usdc: "1230000" });
    const res = await app.request(`/h/${h.code}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<h1>Allow Atlas to spend up to $5.00 a day?</h1>");
    expect(html).toContain('<span class="n">$5.00</span><span class="l">Daily limit for Atlas</span>');
    expect(html).toContain('<span class="n">$1.23</span><span class="l">First payment</span>');
    const nums = buttons(html);
    expect(nums).toHaveLength(3);
    expect(new Set(nums).size).toBe(3);
    for (const n of nums) expect(n >= 10 && n <= 99).toBe(true);
    expect(nums).toContain(h.match);
    expect(html).toMatch(/<form method="post" class="choices">/);
    expect(html).not.toMatch(/<script/i);
  });

  it("escapes a name that carries markup", async () => {
    const { app } = handoffApp();
    const h = await create(app, { ...ATLAS, automaton_name: '<script>alert("x")</script>' });
    const html = await (await app.request(`/h/${h.code}`)).text();
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });

  it("puts the match at each of the three places at least 50 times in 300 handoffs", async () => {
    const { app } = handoffApp();
    const at = [0, 0, 0];
    for (let i = 0; i < 300; i++) {
      const h = await create(app);
      const nums = buttons(await (await app.request(`/h/${h.code}`)).text());
      at[nums.indexOf(h.match)]++;
    }
    expect(at.reduce((a, b) => a + b, 0)).toBe(300);
    for (const n of at) expect(n).toBeGreaterThanOrEqual(50);
  });

  it("answers an unknown code with 404 and the page ungueltig", async () => {
    const { app } = handoffApp();
    for (const code of ["ZZZZZZZZZZZZ", "not-a-code", "0000000000000000000"]) {
      const res = await app.request(`/h/${code}`);
      expect(res.status, code).toBe(404);
      expect(await res.text()).toMatch(UNGUELTIG);
    }
    const tapped = await tap(app, "ZZZZZZZZZZZZ", 47);
    expect(tapped.status).toBe(404);
    expect(await tapped.text()).toContain("There is no such code.");
  });

  it("carries Cache-Control no-store, Referrer-Policy no-referrer and noindex on every answer", async () => {
    const { app } = handoffApp();
    const h = await create(app);
    const answers = [await app.request(`/h/${h.code}`), await tap(app, h.code, h.match), await app.request(`/h/${h.code}`), await app.request("/h/ZZZZZZZZZZZZ")];
    for (const res of answers) {
      expect(res.headers.get("cache-control"), String(res.status)).toBe("no-store");
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      expect(res.headers.get("x-robots-tag")).toBe("noindex");
      const html = await res.text();
      expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
      expect(html).toContain('<meta name="referrer" content="no-referrer">');
    }
    expect(await (await app.request("/sitemap.xml")).text()).not.toContain("/h/");
  });

  it("answers 429 once one address asks for more unknown codes than the rate limit allows", async () => {
    const { app } = handoffApp({ handoff: { missLimit: { limit: 3, windowMs: 600_000 } } });
    const from = { "x-forwarded-for": "203.0.113.9" };
    for (let i = 0; i < 3; i++) expect((await app.request(`/h/ZZZZZZZZZZZ${i}`, { headers: from })).status).toBe(404);
    const res = await app.request("/h/ZZZZZZZZZZZ9", { headers: from });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toMatch(/^[0-9]+$/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    // A known code still opens for that address: the cap counts guesses, not people.
    const h = await create(app);
    expect((await app.request(`/h/${h.code}`, { headers: from })).status).toBe(200);
  });
});

describe("POST /h/{code}", () => {
  it("turns the handoff done with the right number and shows the page erledigt", async () => {
    const { app, db } = handoffApp();
    const h = await create(app);
    const res = await tap(app, h.code, h.match);
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(ERLEDIGT);
    expect(state(db, h.code)).toBe("done");
  });

  it("burns the code on a wrong number, shows ungueltig, and the right number afterwards approves nothing", async () => {
    const { app, db } = handoffApp();
    const h = await create(app);
    const nums = buttons(await (await app.request(`/h/${h.code}`)).text());
    const wrong = nums.find((n) => n !== h.match)!;
    const res = await tap(app, h.code, wrong);
    expect(res.status).toBe(410);
    const html = await res.text();
    expect(html).toMatch(UNGUELTIG);
    expect(html).toContain("A wrong number was tapped, so it was closed.");
    expect(state(db, h.code)).toBe("burned");
    const again = await tap(app, h.code, h.match);
    expect(again.status).toBe(410);
    expect(await again.text()).not.toMatch(ERLEDIGT);
    expect(state(db, h.code)).toBe("burned");
    expect((await app.request(`/h/${h.code}`)).status).toBe(410);
  });

  it("approves nothing with a code from a foreign session and the number of the own terminal", async () => {
    const { app, db } = handoffApp();
    const foreign = await create(app, { ...ATLAS, automaton_name: "Foreign" });
    let own = await create(app);
    while (own.match === foreign.match) own = await create(app);
    // The person scanned a code somebody else put in front of them and taps the number their own terminal shows.
    const res = await tap(app, foreign.code, own.match);
    expect(res.status).toBe(410);
    expect(await res.text()).not.toMatch(ERLEDIGT);
    expect(state(db, foreign.code)).toBe("burned");
    expect(state(db, own.code)).toBe("pending");
  });

  it("answers a second tap after done with ungueltig and leaves the handoff done", async () => {
    const { app, db } = handoffApp();
    const h = await create(app);
    expect((await tap(app, h.code, h.match)).status).toBe(200);
    const second = await tap(app, h.code, h.match);
    expect(second.status).toBe(410);
    const html = await second.text();
    expect(html).toMatch(UNGUELTIG);
    expect(html).toContain("It was already used.");
    expect(state(db, h.code)).toBe("done");
  });

  it("answers page and tap after 601 seconds with ungueltig and the state expired, and not one second earlier", async () => {
    const { app, db, clock } = handoffApp();
    const early = await create(app);
    clock.now += 599_000;
    expect((await app.request(`/h/${early.code}`)).status).toBe(200);
    expect((await tap(app, early.code, early.match)).status).toBe(200);

    const late = await create(app);
    clock.now += 601_000;
    const page = await app.request(`/h/${late.code}`);
    expect(page.status).toBe(410);
    const html = await page.text();
    expect(html).toMatch(UNGUELTIG);
    expect(html).toContain("It ran out after 10 minutes.");
    const tapped = await tap(app, late.code, late.match);
    expect(tapped.status).toBe(410);
    expect(await tapped.text()).toMatch(UNGUELTIG);
    expect(state(db, late.code)).toBe("expired");
  });
});
