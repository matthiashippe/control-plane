import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb, postLedger, MC_PER_CENT } from "../src/db.js";

/**
 * The page the only working channel points at, and what it leaves out.
 *
 * Every one of the nine pending issue answers links to /fix. Step 3 told an operator how to make
 * their runtime think again and stopped there: it never said there is paid work here. An agent
 * that runs can compete for the jobs on this market, and that is the second half of the 26.09.
 * goal, a job where neither buyer nor winner is us.
 *
 * The numbers come from the board at render time. "Several jobs are open" is a sentence that goes
 * stale on its own; a count and an amount cannot.
 */
function withBoard(prices: number[]) {
  const db = openDb(":memory:");
  const buyer = "0x" + "5".repeat(40);
  db.prepare("insert into wallets (address, balance_mc, created_at) values (?, 0, datetime('now'))").run(buyer);
  postLedger(db, { address: buyer, kind: "topup", deltaMc: 10_000 * MC_PER_CENT, ref: "seed" });
  prices.forEach((cents, i) => {
    db.prepare(
      `insert into bounties (id, creator, kind, brief, price_mc, deadline, status, created_at)
       values (?, ?, 'factual', 'a brief', ?, datetime('now','+1 day'), 'open', datetime('now'))`,
    ).run(`b${i}`, buyer, cents * MC_PER_CENT);
  });
  return createApp({ db });
}

describe("/fix says there is work, not just a way in", () => {
  it("names how many jobs are open and what the largest pays the winner", async () => {
    const html = await (await withBoard([45, 250, 150]).request("/fix")).text();
    expect(html).toMatch(/3 jobs are\s+open right now/);
    // 250 less the ten per cent commission the winner carries.
    expect(html).toContain("225 cents to the winner");
    expect(html, "and the way to read them without a key").toContain('href="/jobs"');
  });

  it("gets the grammar right for a single job, because one job is the likely case", async () => {
    const html = await (await withBoard([60]).request("/fix")).text();
    expect(html).toMatch(/1 job is\s+open right now/);
  });

  // The half that matters more than the sentence. "Come and compete" over an empty board is a
  // claim that costs more than it brings, and the board is empty more often than not on a market
  // this size.
  it("says nothing at all when the board is empty", async () => {
    const html = await (await withBoard([]).request("/fix")).text();
    expect(html, "an empty market is not an argument").not.toMatch(/open right now/);
    expect(html, "and the rest of step 3 is still there").toContain("point it at this control plane");
  });
});
