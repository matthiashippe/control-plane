/**
 * The open jobs for a person instead of for a parser.
 *
 * `/bounties.json` is the right answer for an agent and a dead end for somebody clicking through
 * from an article: raw JSON, and they leave. The brief is the product here, so the brief is what
 * this page shows, in full. Two things therefore have to hold and are guarded below: a brief is
 * somebody else's text and must never become markup, and every job needs an address of its own,
 * because "we run a marketplace" convinces nobody and "here is 135 cents of uncontested work"
 * might.
 */
import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";

function setup() {
  const db = openDb(":memory:");
  const app = createApp({ db, pay: { payTo: "0x" + "1".repeat(40) } as never });
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const key = "cnwy_k_" + "5c".repeat(16);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address, hashApiKey(key), key.slice(0, 15), "test", new Date().toISOString(),
  );
  postLedger(db, { address, kind: "topup", deltaMc: 500_000, ref: "seed" });
  const post = (body: unknown) =>
    app.request("/v1/bounties", { method: "POST", headers: { "content-type": "application/json", authorization: key }, body: JSON.stringify(body) });
  return { db, app, post, page: async () => (await app.request("/jobs")).text() };
}

const inAnHour = () => new Date(Date.now() + 3600e3).toISOString();

describe("/jobs", () => {
  /**
   * The card says whose agents are competing, because so far they are all ours.
   *
   * The landing page learned this on 2026-09-22 after an adversarial read held it against the
   * honesty paragraph in /terms: "Nothing on this site counts our own jobs as somebody else's
   * demand." /jobs kept saying "1 agent competing" with no mark, and /jobs is the page an agent
   * reads before deciding whether this market is worth entering (H3).
   *
   * Marked, not subtracted. A card that dropped our own entrant would hide that somebody really
   * did compete, which is true and is the thing that has to work before a stranger will.
   */
  /**
   * The count of open jobs is counted, not measured off the list the page happens to hold.
   *
   * `openBounties` caps: 50 for this page, 100 for the market block on the landing page. Both
   * printed the length of what they had fetched, so at 51 open jobs /jobs would have said "50 jobs
   * open right now" and the landing page would have linked "All 100 open jobs" at 101. Wrong
   * exactly on the day this market first works, and invisible while there are five.
   */
  it("counts the open jobs instead of measuring its own page", async () => {
    const { db, app, post, page } = setup();
    const inAnHour = () => new Date(Date.now() + 3600e3).toISOString();
    // 52 open jobs, two past the cap this page fetches with.
    for (let i = 0; i < 52; i++) {
      const res = await post({
        brief: `FACT SHEET number ${i}. Ninety words maximum, hand in the sheet and nothing else.`,
        kind: "factual",
        price_cents: 1,
        deadline: inAnHour(),
      });
      expect(res.status, `job ${i} could not be posted`).toBe(201);
    }
    const html = await page();
    expect(html, "the page has to name the number it has, not the number it fetched").toContain(">52<");
    expect(html).toContain("52</span><span class=\"l\">jobs open right now");
    const landing = await (await app.request("/")).text();
    expect(landing, "and the landing page links the same number").toContain("All 52 open jobs");
  });

  it("says how many of the competing agents are not ours", async () => {
    const { db, app, post, page } = setup();
    const res = await post({
      brief: "FACT SHEET on one page. 90 words maximum. Hand in the sheet and nothing else.",
      kind: "factual",
      price_cents: 150,
      deadline: inAnHour(),
    });
    const { id } = (await res.json()) as { id: string };

    expect(await page(), "no entrant yet is said in words").toContain("nobody competing yet");

    // One of ours, by the name on its key: `ops/compete.ts` names them ops-seed-<persona>,
    // and `ops-%` is on OUR_KEY_NAMES in src/bounties/ours.ts.
    const unser = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(unser, new Date().toISOString());
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
      unser, hashApiKey("cnwy_k_" + "1f".repeat(16)), "cnwy_k_ours000", "ops-seed-klaus", new Date().toISOString(),
    );
    db.prepare("INSERT INTO submissions (id, bounty_id, agent, body, created_at) VALUES (?, ?, ?, ?, ?)").run(
      "s-ours", id, unser, "our work", new Date().toISOString(),
    );
    expect(await page(), "one entrant and it is ours").toContain("1 agent competing, and it is ours");

    // And a stranger, whose key carries a name none of our tools use.
    const fremd = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(fremd, new Date().toISOString());
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
      fremd, hashApiKey("cnwy_k_" + "2f".repeat(16)), "cnwy_k_them000", "conway-automaton", new Date().toISOString(),
    );
    db.prepare("INSERT INTO submissions (id, bounty_id, agent, body, created_at) VALUES (?, ?, ?, ?, ?)").run(
      "s-them", id, fremd, "their work", new Date().toISOString(),
    );
    const html = await page();
    expect(html, "two entrants, one of them a stranger").toContain("2 agents competing, 1 of them not ours");
    expect(html, "and the day they are all strangers the qualifier goes").not.toMatch(/all of them ours|it is ours/);
  });


  it("shows the whole brief, the money and the call that enters", async () => {
    const { post, page } = setup();
    const res = await post({
      brief: "FACT SHEET for developers.\n\nSecond paragraph with the detail.\n\n90 words maximum.",
      kind: "factual",
      price_cents: 150,
      deadline: inAnHour(),
    });
    const { id } = (await res.json()) as { id: string };

    const html = await page();
    expect(html, "the whole brief, not the first line").toContain("Second paragraph with the detail.");
    expect(html).toContain("135 ¢");
    expect(html, "what the buyer put up").toContain("150 ¢");
    expect(html, "an agent must be able to enter without reading the docs first").toContain('"bounty_id":"' + id + '"');
    expect(html, "every job needs an address of its own").toContain(`id="${id}"`);
    expect(html).toContain("nobody competing yet");
  });

  it("never lets a brief become markup", async () => {
    const { post, page } = setup();
    await post({
      brief: `<img src=x onerror="alert(1)"> and <script>alert("x")</script> in a brief.`,
      kind: "creative",
      price_cents: 20,
      deadline: inAnHour(),
    });

    const html = await page();
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain('onerror="alert');
    expect(html, "it still has to be readable as text").toContain("in a brief.");
  });

  it("says so plainly when nothing is open, instead of an empty page", async () => {
    const { page } = setup();
    const html = await page();
    expect(html).toContain("Nothing is open right now");
    expect(html, "a dead end is worse than a pointer").toContain("/receipts.json");
  });

  it("is where the landing page sends somebody who wants to see the market", async () => {
    const { app } = setup();
    const html = await (await app.request("/")).text();
    expect(html).toContain('href="/jobs"');
    expect(await (await app.request("/llms.txt")).text()).toContain("/jobs");
  });
});
