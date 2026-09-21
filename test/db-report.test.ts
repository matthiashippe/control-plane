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

  // Since 2026-09-21 the open list publishes how many agents are already in. That makes our own
  // leftovers on a live job visible to strangers as competition, and it happened: an MCP
  // production check submitted to a real 150-cent bounty on 2026-09-20 and the row outlived the
  // fix, so an arriving agent read "1 competitor" where the truth was nobody.
  it("notices our own submission sitting on a live job, and does not count a stranger's", () => {
    const wall = (db: ReturnType<typeof openDb>, address: string, name: string) => {
      db.prepare("INSERT OR IGNORE INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
      db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(address, `hash-${name}`, "cnwy_k_xxxxxxx", name, new Date().toISOString());
    };
    const submit = (db: ReturnType<typeof openDb>, id: string, bounty: string, agent: string) =>
      db.prepare("INSERT INTO submissions (id, bounty_id, agent, body, created_at) VALUES (?, ?, ?, 'w', ?)")
        .run(id, bounty, agent, new Date().toISOString());

    const clean = withDb((db) => {
      postBounty(db, OPERATOR, "ours-1", 200 * MC_PER_CENT);
      wall(db, STRANGER, "conway-automaton");
      submit(db, "s-1", "ours-1", STRANGER);
    });
    expect(clean.market.our_submissions_on_open, "a real agent named conway-automaton is not us").toBe(0);

    const dirty = withDb((db) => {
      postBounty(db, OPERATOR, "ours-1", 200 * MC_PER_CENT);
      wall(db, "0x2222222222222222222222222222222222222222", "mcp-production-check-agent");
      submit(db, "s-1", "ours-1", "0x2222222222222222222222222222222222222222");
    });
    expect(dirty.market.our_submissions_on_open).toBe(1);

    const closed = withDb((db) => {
      postBounty(db, OPERATOR, "ours-1", 200 * MC_PER_CENT, "cancelled");
      wall(db, "0x2222222222222222222222222222222222222222", "mcp-production-check-agent");
      submit(db, "s-1", "ours-1", "0x2222222222222222222222222222222222222222");
    });
    expect(closed.market.our_submissions_on_open, "only a live job shows the number to anybody").toBe(0);
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

  it("does not count an agent our own checks provisioned", () => {
    const CHECKER = "0x2222222222222222222222222222222222222222";
    const r = withDb((db) => {
      postBounty(db, OPERATOR, "ours-1", 200 * MC_PER_CENT);
      db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(CHECKER, new Date().toISOString());
      db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, 'h', 'p', 'mcp-production-check-agent', ?)")
        .run(CHECKER, new Date().toISOString());
      db.prepare("INSERT INTO submissions (id, bounty_id, agent, body, created_at) VALUES ('s1', 'ours-1', ?, 'work', ?)")
        .run(CHECKER, new Date().toISOString());
    });
    expect(r.market.submissions).toBe(1);
    // On 2026-09-21 the first full run of ops/check-all.sh reported four foreign agents, all four
    // of them provisioned by our own production checks minutes earlier.
    expect(r.market.foreign_agents, "our own checks are not the supply side waking up").toBe(0);
  });

  it("still counts an agent whose key is named the way a real runtime names it", () => {
    const REAL = "0x3333333333333333333333333333333333333333";
    const r = withDb((db) => {
      postBounty(db, OPERATOR, "ours-1", 200 * MC_PER_CENT);
      db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(REAL, new Date().toISOString());
      // This is the name the unmodified Conway runtime gives its key. Excluding it would hide
      // exactly the people this number exists to find, so the exclusion list is spelled out
      // instead of matching a pattern.
      db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, 'h', 'p', 'conway-automaton', ?)")
        .run(REAL, new Date().toISOString());
      db.prepare("INSERT INTO submissions (id, bounty_id, agent, body, created_at) VALUES ('s1', 'ours-1', ?, 'work', ?)")
        .run(REAL, new Date().toISOString());
    });
    expect(r.market.foreign_agents).toBe(1);
  });

  it("shows what is left of the starter pool", () => {
    const r = withDb((db) => {
      postLedger(db, { address: STRANGER, kind: "grant", deltaMc: 15 * MC_PER_CENT, ref: `starter:${STRANGER}` });
    });
    expect(r.market.starter_granted).toBe(1);
    expect(r.market.starter_pool_left_mc).toBe(500_000 - 15 * MC_PER_CENT);
  });
});
