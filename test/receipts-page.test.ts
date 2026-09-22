/**
 * The receipt a person can read, and the line it still must not cross.
 *
 * `/receipts.json` is the parser's answer. This is the one a link points at, and it shows the work
 * itself, which means every rule about what may be published applies here too and has to be
 * guarded here too: work handed in before the rule existed stays withheld, and so does its author.
 */
import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";

function account(db: ReturnType<typeof openDb>, app: ReturnType<typeof createApp>, n: number, balanceMc: number) {
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const key = `cnwy_k_${String(n).repeat(2)}` + "3d".repeat(15);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address, hashApiKey(key), key.slice(0, 15), "test", new Date().toISOString(),
  );
  if (balanceMc > 0) postLedger(db, { address, kind: "topup", deltaMc: balanceMc, ref: `seed-${n}` });
  return {
    address,
    call: (path: string, body?: unknown) =>
      app.request(path, { method: "POST", headers: { "content-type": "application/json", authorization: key }, body: JSON.stringify(body ?? {}) }),
  };
}

async function market(submittedAt: string) {
  const db = openDb(":memory:");
  const app = createApp({ db, pay: { payTo: "0x" + "1".repeat(40) } as never });
  const buyer = account(db, app, 1, 500_000);
  const agent = account(db, app, 2, 50_000);
  const posted = await buyer.call("/v1/bounties", {
    brief: "FACT SHEET for developers.\n\nA second paragraph of the brief.",
    kind: "factual",
    price_cents: 200,
    deadline: new Date(Date.now() + 3600e3).toISOString(),
  });
  const { id } = (await posted.json()) as { id: string };
  const sub = await agent.call("/v1/submissions", { bounty_id: id, body: "THE WINNING WORK, in full." });
  const s = (await sub.json()) as { id: string };
  db.prepare("UPDATE submissions SET created_at = ? WHERE id = ?").run(submittedAt, s.id);
  await buyer.call("/v1/bounties/award", { bounty_id: id, submission_id: s.id });
  return { db, app, agent, buyer, id, page: async () => (await app.request("/receipts")).text() };
}

describe("/receipts", () => {
  it("shows the work that won, when the rule covers it", async () => {
    const { page, agent, buyer, id } = await market("2026-09-22T10:00:00.000Z");
    const html = await page();

    expect(html).toContain("THE WINNING WORK, in full.");
    expect(html, "the brief belongs next to the work it bought").toContain("A second paragraph of the brief.");
    expect(html).toContain("180 ¢");
    expect(html, "the commission, and that it came off the winner").toContain("20 ¢");
    expect(html).toContain(agent.address.slice(0, 6));
    expect(html, "the buyer is never named").not.toContain(buyer.address);
    expect(html, "a receipt needs an address of its own").toContain(`id="${id}"`);
    // Plural slips are small holes in a large claim, and they show up exactly at one, which is
    // the state this market is in. "1 jobs paid out" stood live on 2026-09-21, and a second slip
    // sat one line next to it. Read as text, not as markup: the number and its word are two
    // elements, so asserting the sentence against the raw HTML silently never matches.
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text).toContain("1 job paid out");
    expect(text).toContain("to the agent that won it");
    expect(text).toContain("1 agent competed");
  });

  /**
   * The page exists to be proof, and since 2026-09-21 every winner on it is an agent of ours.
   *
   * The article going out argues that 10,564 x402 services with one paying wallet each are people
   * testing their own deployment, and it sends readers here. Showing our own agents as evidence
   * without saying so is refutable in one click, and it would take the rest of the piece with it.
   */
  it("says so when the winning agent is the operator's own", async () => {
    const { db, app, agent } = await market("2026-09-22T10:00:00.000Z");

    const clean = (await (await app.request("/receipts")).text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(clean, "a stranger's agent gets no such sentence").not.toContain("won by an agent of the operator");
    expect(clean, "and no marker either").not.toContain("Every job here was posted by the operator");

    // The same market, with the winner's key named the way ops/compete.ts names its own.
    db.prepare("UPDATE api_keys SET name = 'ops-seed-vera' WHERE address = ?").run(agent.address);
    const html = await (await app.request("/receipts")).text();
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    expect(text, "the one winner here is ours and the page has to say it")
      .toContain("Every job here was posted by the operator and won by an agent of the operator's");
    expect(text, "and the row itself carries the marker").toContain("ours");
    expect(html, "with the fine print one click away").toContain('href="/terms"');
    expect(html, "the work and the address stay, because the money moved either way")
      .toContain("THE WINNING WORK, in full.");
    expect(html).toContain(agent.address.slice(0, 6));
  });

  it("does not withhold our own agent's work, because there was nobody to promise", async () => {
    // The withholding is a promise kept to a stranger who was never told their work would be read.
    // The only paid receipt on this market was won by our own first-cycle agent on 20.09., before
    // the rule, and the page presented it as an author whose rights were being respected. That
    // reads as a stranger, which is the opposite of what the row is.
    const { db, app, agent } = await market("2026-09-20T10:00:00.000Z");

    const beforeRename = await (await app.request("/receipts")).text();
    expect(beforeRename, "a stranger from before the rule stays withheld").not.toContain("THE WINNING WORK");

    db.prepare("UPDATE api_keys SET name = 'ops-seed-vera' WHERE address = ?").run(agent.address);
    const html = await (await app.request("/receipts")).text();
    expect(html, "our own work from the same day is shown").toContain("THE WINNING WORK, in full.");
    expect(html, "and the address with it").toContain(agent.address.slice(0, 6));
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text, "the reason for withholding is gone, because nothing is withheld")
      .not.toContain("nothing told an agent its work would be published");
    expect(text).toContain("Every job here was posted by the operator and won by an agent of the operator's");

    // The same through the parser's door, or the two answers disagree about whose work they show.
    const json = (await (await app.request("/receipts.json")).json()) as { receipts: { entries: { ours: boolean; body: string | null }[] }[] };
    const entry = json.receipts[0].entries[0];
    expect(entry.ours).toBe(true);
    expect(entry.body).toContain("THE WINNING WORK");
  });

  it("admits the jobs that ran out with nobody paid", async () => {
    // /receipts shows what was paid for, which is the half of the record that flatters the market.
    // A job nobody entered leaves the open list at its deadline and appears nowhere afterwards, so
    // a reader counting evidence sees only successes. That is what this project accuses the x402
    // directory of doing with its own numbers.
    const { db, app } = await market("2026-09-22T10:00:00.000Z");

    const withoutExpired = (await (await app.request("/receipts")).text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(withoutExpired, "nothing has expired yet, so the page says nothing about it")
      .not.toContain("ran out of time");

    // One expired job nobody entered. The creator has to be a real wallet: `bounties.creator`
    // references `wallets(address)`, which is the constraint that keeps a job from belonging to
    // nobody.
    const creator = "0x" + "5".repeat(40);
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)")
      .run(creator, new Date().toISOString());
    db.prepare("INSERT INTO bounties (id, creator, kind, brief, price_mc, deadline, status, created_at, closed_at) " +
      "VALUES ('exp-1', ?, 'factual', 'A brief.', 30000, ?, 'expired', ?, ?)")
      .run(creator, new Date(Date.now() - 1000).toISOString(),
           new Date(Date.now() - 2000).toISOString(), new Date().toISOString());
    // And a cancelled one, which must not be counted. A cancelled job is a buyer changing their
    // mind, usually within a minute and usually a throwaway from a production check; seventeen of
    // them sit on the live database and all seventeen are ours. Without this case the choice only
    // lives in a comment: widening the query to both statuses leaves the test green.
    db.prepare("INSERT INTO bounties (id, creator, kind, brief, price_mc, deadline, status, created_at, closed_at) " +
      "VALUES ('can-1', ?, 'factual', 'A brief.', 99000, ?, 'cancelled', ?, ?)")
      .run(creator, new Date(Date.now() - 1000).toISOString(),
           new Date(Date.now() - 2000).toISOString(), new Date().toISOString());

    const text = (await (await app.request("/receipts")).text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text).toContain("1 job also ran out of time with nobody paid");
    expect(text, "the cancelled job's 99 cents must not be in that figure").not.toContain("129 ¢");
    expect(text, "with the money it carried").toContain("30 ¢");
    expect(text, "and the fact that nobody even tried").toContain("not one of them was entered");
  });

  it("withholds the work and the author when it was handed in before the rule", async () => {
    const { page, agent } = await market("2026-09-20T10:00:00.000Z");
    const html = await page();

    expect(html, "nobody told this agent its work would be read").not.toContain("THE WINNING WORK");
    expect(html, "and nobody told it that it would be named either").not.toContain(agent.address.slice(0, 6));
    expect(html, "that somebody competed still has to be visible").toContain("1 agent competed");
    expect(html).toContain("author withheld");
  });

  it("says so plainly when nothing has been paid out", async () => {
    const app = createApp({ db: openDb(":memory:") });
    const html = await (await app.request("/receipts")).text();
    expect(html).toContain("Nothing has been paid out yet");
    expect(html, "a dead end is worse than a pointer").toContain("/jobs");
  });

  it("is named in the sitemap, with the other three", async () => {
    const app = createApp({ db: openDb(":memory:") });
    const res = await app.request("/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/xml");
    const xml = await res.text();
    for (const path of ["/", "/jobs", "/receipts", "/x402"]) {
      expect(xml).toContain(`https://cp.hippe.eu${path}<`);
    }
    expect(await (await app.request("/robots.txt")).text()).toContain("Sitemap: https://cp.hippe.eu/sitemap.xml");
  });
});
