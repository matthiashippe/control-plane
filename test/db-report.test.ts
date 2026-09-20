/**
 * The database report is what the loop reads every cycle, and since 2026-09-20 it carries the one
 * number the whole plan hangs on: a bounty_hold from an address that is not ours. A number that is
 * declared decisive and then never checked is decoration, so this file runs the actual script
 * against a database it built itself.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, postLedger, MC_PER_CENT } from "../src/db.js";

const OPERATOR = "0xd24f37d0838e62621ed24111164485ded0f0924f";
const FIRST_AGENT = "0xf6204b0662082d65d78eab79936a4d91744dee6b";
const STRANGER = "0x1111111111111111111111111111111111111111";

/** Runs ops/db-report.cjs the way status.sh does: the script on stdin, CP_DB_PATH in the env. */
function report(dbPath: string): Record<string, any> {
  const out = execFileSync("node", ["ops/db-report.cjs"], {
    env: { ...process.env, CP_DB_PATH: dbPath },
    encoding: "utf-8",
  });
  return JSON.parse(out);
}

function withDb(fn: (db: ReturnType<typeof openDb>, path: string) => void): Record<string, any> {
  const dir = mkdtempSync(join(tmpdir(), "cp-report-"));
  const path = join(dir, "cp.db");
  try {
    const db = openDb(path);
    fn(db, path);
    db.close();
    return report(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function postBounty(db: ReturnType<typeof openDb>, creator: string, id: string, priceMc: number, status = "open") {
  postLedger(db, { address: creator, kind: "topup", deltaMc: priceMc, ref: `seed-${id}` });
  db.prepare(
    "INSERT INTO bounties (id, creator, kind, brief, price_mc, deadline, status, created_at) VALUES (?, ?, 'factual', 'b', ?, ?, ?, ?)",
  ).run(id, creator, priceMc, new Date(Date.now() + 3_600_000).toISOString(), status, new Date().toISOString());
  postLedger(db, { address: creator, kind: "bounty_hold", deltaMc: -priceMc, ref: `bounty:${id}` });
}

describe("The market numbers in the database report", () => {
  it("counts no stranger while only we post", () => {
    const r = withDb((db) => {
      postBounty(db, OPERATOR, "ours-1", 200 * MC_PER_CENT);
    });
    expect(r.market.open_bounties).toBe(1);
    expect(r.market.foreign_buyers, "our own job must not read as a stranger").toBe(0);
  });

  it("counts a stranger the moment one posts, which is the whole point", () => {
    const r = withDb((db) => {
      postBounty(db, OPERATOR, "ours-1", 200 * MC_PER_CENT);
      postBounty(db, STRANGER, "theirs-1", 100 * MC_PER_CENT);
    });
    // The counter-check for the test above: if the query counted every address, the first case
    // would already have said 1, and this one would never be able to tell the difference.
    expect(r.market.foreign_buyers).toBe(1);
  });

  it("does not count the agent from the first cycle as a stranger", () => {
    const r = withDb((db) => {
      postBounty(db, OPERATOR, "ours-1", 200 * MC_PER_CENT);
      db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(FIRST_AGENT, new Date().toISOString());
      db.prepare("INSERT INTO submissions (id, bounty_id, agent, body, created_at) VALUES ('s1', 'ours-1', ?, 'work', ?)")
        .run(FIRST_AGENT, new Date().toISOString());
    });
    expect(r.market.submissions).toBe(1);
    expect(r.market.foreign_agents, "we created that agent ourselves").toBe(0);
  });

  it("counts a stranger's agent", () => {
    const r = withDb((db) => {
      postBounty(db, OPERATOR, "ours-1", 200 * MC_PER_CENT);
      db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(STRANGER, new Date().toISOString());
      db.prepare("INSERT INTO submissions (id, bounty_id, agent, body, created_at) VALUES ('s1', 'ours-1', ?, 'work', ?)")
        .run(STRANGER, new Date().toISOString());
    });
    expect(r.market.foreign_agents).toBe(1);
  });

  it("reports what is held, what was awarded and what the fee brought in", () => {
    const r = withDb((db) => {
      postBounty(db, OPERATOR, "open-1", 200 * MC_PER_CENT);
      postBounty(db, OPERATOR, "done-1", 800 * MC_PER_CENT, "awarded");
      postLedger(db, { address: STRANGER, kind: "bounty_fee", deltaMc: 80 * MC_PER_CENT, ref: "fee" });
    });
    // Only what is still open counts as held. The awarded one has paid out, so its price is not
    // lying anywhere any more, and reporting it as held would overstate the operator's exposure.
    expect(r.market.held_mc).toBe(200 * MC_PER_CENT);
    expect(r.market.awarded).toBe(1);
    expect(r.market.fee_earned_mc).toBe(80 * MC_PER_CENT);
  });

  it("shows what is left of the starter pool", () => {
    const r = withDb((db) => {
      postLedger(db, { address: STRANGER, kind: "grant", deltaMc: 15 * MC_PER_CENT, ref: `starter:${STRANGER}` });
    });
    expect(r.market.starter_granted).toBe(1);
    expect(r.market.starter_pool_left_mc).toBe(500_000 - 15 * MC_PER_CENT);
  });
});
