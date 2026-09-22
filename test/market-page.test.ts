/**
 * The market on the landing page: that it is there, and that it cannot be used as a weapon.
 *
 * Two things are being guarded here and only one of them is the feature. A brief is arbitrary text
 * from anybody who can post a job, and until 2026-09-21 it only ever appeared inside JSON, where
 * the encoder handles it. Rendering it into HTML makes it an injection vector, so the escaping
 * test matters more than the rendering test.
 *
 * The second guard is the inline script. It is covered by a CSP hash that lives in the Caddyfile,
 * and `deploy/**` is not touched without a human, so any change to that script silently breaks the
 * site's security headers at the next deploy. The server renders into the body; the test proves it
 * stayed out of the script.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { esc } from "../src/public/market.js";

function buyer(db: ReturnType<typeof openDb>, app: ReturnType<typeof createApp>, n = 1) {
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const key = `cnwy_k_${String(n).repeat(2)}` + "7b".repeat(15);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address, hashApiKey(key), key.slice(0, 15), "test", new Date().toISOString(),
  );
  postLedger(db, { address, kind: "topup", deltaMc: 500_000, ref: `seed-${n}` });
  return {
    address,
    call: (path: string, method: string, body?: unknown) =>
      app.request(path, {
        method,
        headers: { "content-type": "application/json", authorization: key },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
  };
}

function setup() {
  const db = openDb(":memory:");
  const app = createApp({ db, pay: { payTo: "0x" + "1".repeat(40) } as never });
  return {
    db,
    app,
    page: async () => (await app.request("/")).text(),
    // The landing page is rendered at most once every five seconds, so a second load inside that
    // window returns the string from the first one. A fresh app starts with an empty cache, which
    // is how a test asks for a page from an app that has just come up. It sweeps the expired
    // bounties once on the way up, so it is the wrong tool for asking whether a page view writes.
    fresh: async () => (await createApp({ db, pay: { payTo: "0x" + "1".repeat(40) } as never }).request("/")).text(),
  };
}

const inAnHour = () => new Date(Date.now() + 3600e3).toISOString();

describe("The market on the landing page", () => {
  it("counts agents competing, not submissions", async () => {
    // The strip summed submission_count across the open jobs, so an agent that entered three jobs
    // stood there as three agents. It was right while three different agents had one job each,
    // which is the worst kind of wrong: correct by coincidence on the day somebody checks and
    // wrong the first time anybody competes twice. Our own seed agents do exactly that.
    const { db, app, fresh } = setup();
    const kaeufer = buyer(db, app, 1);
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const res = await kaeufer.call("/v1/bounties", "POST", {
        brief: `FACT SHEET number ${i}.\n\nA brief with enough words in it to be posted at all.`,
        kind: "factual",
        price_cents: 20,
        deadline: inAnHour(),
      });
      ids.push(((await res.json()) as { id: string }).id);
    }

    // One agent, both jobs.
    const agent = buyer(db, app, 2);
    for (const id of ids) {
      expect((await agent.call("/v1/submissions", "POST", { bounty_id: id, body: "work" })).status).toBe(201);
    }

    const html = await fresh();
    const strip = html.slice(html.indexOf("agents competing"), html.indexOf("agents competing") + 140);
    // The cell carries a `<small>` with the part that is not ours since 2026-09-22, so the number
    // is read up to the first tag rather than up to `</span>`.
    const m = strip.match(/<span class="v">(\d+)</);
    expect(m, "the agents-competing figure is gone from the strip").toBeTruthy();
    expect(Number(m![1]), "one agent on two jobs is one agent").toBe(1);
    // And the same count again, split: this agent is a stranger to us, so both halves are 1.
    expect(strip, "the cell has to say how many of them are not ours").toContain("1 from outside");
  });

  it("shows an open job with what it pays, so a visitor sees the market instead of reading about it", async () => {
    const { app, db, page } = setup();
    await buyer(db, app).call("/v1/bounties", "POST", {
      brief: "Write a fact sheet about service charges in Dubai Marina. 90 words. Deliver the paragraph only. Do not use the word powerful.",
      kind: "factual",
      price_cents: 150,
      deadline: inAnHour(),
    });

    const html = await page();
    expect(html).toContain("The market, right now");
    expect(html).toContain("Write a fact sheet about service charges");
    expect(html, "what the buyer posted").toContain("150 ¢");
    expect(html, "the agent's share after the 10 per cent commission").toContain("135 ¢");
  });

  it("escapes a brief, because a brief is written by somebody else", async () => {
    const { app, db, page } = setup();
    const attack = `<script>alert('x')</script><img src=x onerror="alert(1)">`;
    await buyer(db, app).call("/v1/bounties", "POST", {
      brief: `${attack} and then ninety words about it.`,
      kind: "creative",
      price_cents: 20,
      deadline: inAnHour(),
    });

    const html = await page();
    expect(html, "the tag must never reach the browser as a tag").not.toContain("<script>alert");
    expect(html).not.toContain("onerror=\"alert");
    expect(html).toContain(esc("<script>alert('x')</script>").slice(0, 30));
  });

  it("names the winner and never the buyer", async () => {
    const { app, db, page } = setup();
    const b = buyer(db, app, 1);
    const agent = buyer(db, app, 2);
    const posted = await b.call("/v1/bounties", "POST", { brief: "A job that gets paid out.", kind: "factual", price_cents: 200, deadline: inAnHour() });
    const { id } = (await posted.json()) as { id: string };
    const sub = await agent.call("/v1/submissions", "POST", { bounty_id: id, body: "Finished work." });
    const s = (await sub.json()) as { id: string };
    await b.call("/v1/bounties/award", "POST", { bounty_id: id, submission_id: s.id });

    const html = await page();
    expect(html).toContain("A job that gets paid out.");
    expect(html, "the commission on 200 cents").toContain("20 ¢");
    expect(html).toContain(agent.address.slice(0, 6));
    expect(html, "the open list hides the buyer and so does the page").not.toContain(b.address);
  });

  it("shows how many agents are already in, because zero is the best thing we can say", async () => {
    const { app, db, page, fresh } = setup();
    const b = buyer(db, app, 1);
    const agent = buyer(db, app, 2);
    const posted = await b.call("/v1/bounties", "POST", { brief: "An uncontested job.", kind: "factual", price_cents: 150, deadline: inAnHour() });
    const { id } = (await posted.json()) as { id: string };

    expect(await page(), "zero is said in words, because it is the best thing we can say").toContain("nobody competing yet");
    await agent.call("/v1/submissions", "POST", { bounty_id: id, body: "An attempt." });
    const html = await fresh();
    const card = /<article class="job">[\s\S]*?An uncontested job\.[\s\S]*?<\/article>/.exec(html);
    expect(card, "the open job has to be a card on the page").not.toBeNull();
    expect(card![0]).toContain("1 competing");
  });

  it("shows a dash instead of an address when the winner's work is withheld", async () => {
    const { app, db, page } = setup();
    const b = buyer(db, app, 1);
    const agent = buyer(db, app, 2);
    const posted = await b.call("/v1/bounties", "POST", { brief: "An older job.", kind: "factual", price_cents: 200, deadline: inAnHour() });
    const { id } = (await posted.json()) as { id: string };
    const sub = await agent.call("/v1/submissions", "POST", { bounty_id: id, body: "Work from before the rule." });
    const s = (await sub.json()) as { id: string };
    // Handed in before the publication rule existed, so neither the work nor the author is public.
    db.prepare("UPDATE submissions SET created_at = ? WHERE id = ?").run("2026-09-20T10:00:00.000Z", s.id);
    await b.call("/v1/bounties/award", "POST", { bounty_id: id, submission_id: s.id });

    const html = await page();
    expect(html).toContain("An older job.");
    expect(html, "the page must not name what the receipt withholds").not.toContain(agent.address.slice(0, 6));
  });

  it("says plainly that nothing is there instead of showing an empty table", async () => {
    const { page } = setup();
    const html = await page();
    expect(html).toContain("Nothing is open right now.");
    expect(html).toContain("Nothing has been paid out yet.");
  });

  /**
   * The page shows the state at the moment it was loaded, with nothing in between.
   *
   * A five-second cache sat here for one cycle on 2026-09-21, put in because a load test said the
   * page collapsed under an article. The measurement was wrong: it ran 300 separate `curl`
   * processes from a laptop over the Atlantic and timed the client, not the service. Measured
   * properly the service does 458 requests a second over TLS with no failures, so the cache bought
   * nothing and cost the sentence the section is built on. It came back out, and this test is what
   * keeps it out.
   */
  it("shows a job posted a moment ago on the very next load", async () => {
    const { app, db, page } = setup();
    const b = buyer(db, app, 1);

    const before = await page();
    expect(before).not.toContain("Posted a moment later.");
    await b.call("/v1/bounties", "POST", { brief: "Posted a moment later.", kind: "factual", price_cents: 30, deadline: inAnHour() });

    expect(await page(), "nothing may stand between the database and the page").toContain("Posted a moment later.");
  });

  it("does not write to the database while rendering a page view", async () => {
    // Deliberately the same app, not `fresh()`: `createApp` sweeps the expired bounties once when
    // it comes up, which is right and is once per process. Building a new app here would measure
    // that sweep and report it as a page view writing, which is how the first version of this test
    // failed and very nearly sent me looking for a bug that was not there.
    const { app, db, page } = setup();
    const b = buyer(db, app, 1);
    const posted = await b.call("/v1/bounties", "POST", { brief: "A job whose deadline has passed.", kind: "factual", price_cents: 30, deadline: inAnHour() });
    const { id } = (await posted.json()) as { id: string };
    // Backdated by hand: only a sweep would move it out of `open`, and the sweep is a write.
    db.prepare("UPDATE bounties SET deadline = ? WHERE id = ?").run("2020-01-01T00:00:00.000Z", id);

    await page();

    const row = db.prepare("SELECT status FROM bounties WHERE id = ?").get(id) as { status: string };
    expect(row.status, "a page view must not open a write transaction; that is what an article breaks").toBe("open");
  });

  it("leaves the inline script byte for byte as it is on disk", async () => {
    // The CSP hash for this script lives in the Caddyfile, which is not touched without a human.
    // A single character added here would break the security headers at the next deploy, and the
    // smoke test would catch it only after the site was already serving without them.
    const { page } = setup();
    const onDisk = /<script>[\s\S]*?<\/script>/.exec(readFileSync("src/public/index.html", "utf-8"));
    const served = /<script>[\s\S]*?<\/script>/.exec(await page());
    expect(onDisk, "the page has to have exactly one inline script").not.toBeNull();
    expect(served![0]).toBe(onDisk![0]);
  });

  it("leaves no placeholder behind when the page is served", async () => {
    const { page } = setup();
    expect(await page()).not.toContain("<!--MARKET-->");
  });
});
