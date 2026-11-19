/**
 * kunden 02: who still pays Conway, and whether they know us.
 *
 * Two halves, both run for real. `ops/db-report.cjs` with CP_REPORT=wallets is run against a database
 * this file builds, the way ops/conway-payers.sh runs it in the container; and the shell tool itself is
 * run against the planted fixtures and against the JSON of that database. Every case has its
 * counter-proof in the same test, so a green line cannot come from a filter that lets nothing through.
 */
import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db.js";

const OPERATOR = "0xd24f37d0838e62621ed24111164485ded0f0924f"; // in OURS of ops/db-report.cjs
const TOOL = "0x2222222222222222222222222222222222222222"; // ours by the name of its key
const STRANGER = "0x111111111111111111111111111111111111aaaa"; // wallet, inference, one settled and one failed payment
const PAYER_ONLY = "0x444444444444444444444444444444444444bbbb"; // a settled payment, no wallet row
const FAILED_ONLY = "0x5555555555555555555555555555555555555555"; // only a failed payment, no wallet row
const QUIET = "0x3333333333333333333333333333333333333333"; // a wallet and nothing else
const ADDRESS = /0x[0-9a-fA-F]{40}/;
const HASH = /[0-9a-f]{64}/;
const W = "PAYERS window 2026-10-19T12:00:00Z to 2026-11-18T12:00:00Z";

type Db = ReturnType<typeof openDb>;
const sha = (a: string) => createHash("sha256").update(a.toLowerCase()).digest("hex");

function wallet(db: Db, address: string) {
  db.prepare("INSERT OR IGNORE INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(
    address,
    "2026-11-01T00:00:00.000Z",
  );
}

function inference(db: Db, address: string, at: string) {
  db.prepare("INSERT INTO ledger (address, kind, delta_mc, ref, meta, created_at) VALUES (?, 'inference', -1000, ?, '{}', ?)").run(
    address,
    `gen-${address.slice(2, 8)}-${at}`,
    at,
  );
}

function payment(db: Db, nonce: string, from: string, status: string, settledAt: string | null) {
  db.prepare(
    "INSERT INTO payments (nonce, from_address, to_address, value_atomic, credits_mc, status, tx_hash, created_at, settled_at) VALUES (?, ?, ?, '5000000', 500000, ?, ?, ?, ?)",
  ).run(nonce, from, from.toLowerCase(), status, `0x${"ab".repeat(32)}`, "2026-11-01T00:00:00.000Z", settledAt);
}

/** The planned database: two of ours, three strangers that pay or hold a wallet, one failed payer. */
function plant(db: Db) {
  for (const a of [OPERATOR, TOOL, STRANGER, QUIET]) wallet(db, a);
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    TOOL,
    "hash-tool",
    "cnwy_k_xxxxxxx",
    "ops-payers-check",
    "2026-11-01T00:00:00.000Z",
  );
  inference(db, STRANGER, "2026-11-10T10:00:00.000Z");
  inference(db, STRANGER, "2026-11-10T10:01:00.000Z");
  inference(db, OPERATOR, "2026-11-10T10:02:00.000Z");
  inference(db, TOOL, "2026-11-10T10:03:00.000Z");
  // The stranger pays with a checksummed address; it is still the one wallet and the one hash.
  payment(db, "n-1", "0x111111111111111111111111111111111111AAAA", "settled", "2026-11-11T00:00:00.000Z");
  payment(db, "n-2", STRANGER, "failed", null);
  payment(db, "n-3", "0x444444444444444444444444444444444444BBBB", "settled", "2026-11-12T00:00:00.000Z");
  payment(db, "n-4", FAILED_ONLY, "failed", null);
  payment(db, "n-5", OPERATOR, "settled", "2026-11-13T00:00:00.000Z");
}

function run(script: string, dbPath: string, env: Record<string, string>) {
  const base = { ...process.env };
  delete base.CP_REPORT;
  delete base.CP_SINCE;
  delete base.CP_UNTIL;
  // On stdin, the way the container runs it: `node -` resolves better-sqlite3 from the working directory.
  return execFileSync("node", ["-"], {
    input: readFileSync(script, "utf-8"),
    env: { ...base, CP_DB_PATH: dbPath, ...env },
    encoding: "utf-8",
  });
}

function withDb<T>(fn: (dbPath: string, dir: string) => T, fill: (db: Db) => void = plant): T {
  const dir = mkdtempSync(join(tmpdir(), "cp-payers-"));
  const path = join(dir, "cp.db");
  try {
    const db = openDb(path);
    fill(db);
    db.close();
    return fn(path, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const wallets = (dbPath: string) => run("ops/db-report.cjs", dbPath, { CP_REPORT: "wallets" });
const byHash = (j: any) => new Map<string, any>(j.wallets.map((w: any) => [w.h, w]));

describe("ops/db-report.cjs with CP_REPORT=wallets", () => {
  it("never lists our own wallets, by address or by key name, only as hash in ours, and does list the strangers", () => {
    const j = withDb((p) => JSON.parse(wallets(p)));
    expect(j.ours, "the operator by address and the tool by its key name").toEqual(
      expect.arrayContaining([sha(OPERATOR), sha(TOOL)]),
    );
    const listed = byHash(j);
    expect(listed.has(sha(OPERATOR)), "ours never in wallets").toBe(false);
    expect(listed.has(sha(TOOL)), "ours never in wallets").toBe(false);
    // The other direction: every stranger with a wallet or a settled payment is there, once.
    expect([...listed.keys()].sort()).toEqual([sha(STRANGER), sha(PAYER_ONLY), sha(QUIET)].sort());
    expect(listed.get(sha(STRANGER))).toEqual({
      h: sha(STRANGER),
      wallet: true,
      inference_rows: 2,
      paid: 1,
      last_paid_at: "2026-11-11T00:00:00.000Z",
    });
    expect(listed.get(sha(PAYER_ONLY))).toEqual({
      h: sha(PAYER_ONLY),
      wallet: false,
      inference_rows: 0,
      paid: 1,
      last_paid_at: "2026-11-12T00:00:00.000Z",
    });
    expect(listed.get(sha(QUIET))).toMatchObject({ wallet: true, inference_rows: 0, paid: 0, last_paid_at: null });
  });

  it("counts only settled payments, and a failed one once it is settled", () => {
    const j = withDb((p) => JSON.parse(wallets(p)));
    expect(byHash(j).has(sha(FAILED_ONLY)), "a failed payment alone makes no payer").toBe(false);
    expect(byHash(j).get(sha(STRANGER)).paid, "the failed payment of the stranger is not counted").toBe(1);
    const settled = withDb(
      (p) => JSON.parse(wallets(p)),
      (db) => {
        plant(db);
        db.prepare("UPDATE payments SET status = 'settled', settled_at = '2026-11-14T00:00:00.000Z' WHERE status = 'failed'").run();
      },
    );
    expect(byHash(settled).get(sha(STRANGER))).toMatchObject({ paid: 2, last_paid_at: "2026-11-14T00:00:00.000Z" });
    expect(byHash(settled).get(sha(FAILED_ONLY))).toMatchObject({ wallet: false, paid: 1 });
  });

  it("carries no address, no key, no ref and no tx hash in the JSON", () => {
    const [text, dbHasThem] = withDb((p) => {
      const db = openDb(p);
      const n = (db.prepare("select count(*) n from payments where from_address = ? and tx_hash is not null").get(STRANGER) as any).n;
      db.close();
      return [wallets(p), n] as const;
    });
    expect(dbHasThem, "the database does hold the address and its tx hash").toBeGreaterThan(0);
    expect(text).not.toMatch(ADDRESS);
    expect(text).not.toContain("ab".repeat(32));
    expect(text).not.toContain("gen-");
    expect(text).not.toContain("hash-tool");
    expect(text).not.toContain("ops-payers-check");
  });

  it("leaves the default report unchanged without CP_REPORT and with CP_REPORT=decline", () => {
    withDb((p, dir) => {
      const plain = run("ops/db-report.cjs", p, {});
      const j = JSON.parse(plain);
      expect(j).not.toHaveProperty("ours");
      expect(typeof j.wallets, "the default report keeps its count of wallets, not the list").toBe("number");
      // Byte for byte: the same script with the wallets block cut out prints the same, in both modes.
      const source = readFileSync("ops/db-report.cjs", "utf-8");
      const start = source.indexOf('if (process.env.CP_REPORT === "wallets") {');
      const end = source.indexOf("\n}\n", start);
      expect(start).toBeGreaterThan(0);
      const without = join(dir, "db-report-without.cjs");
      writeFileSync(without, source.slice(0, start) + source.slice(end + 3));
      expect(plain).toBe(run(without, p, {}));
      const decline = { CP_REPORT: "decline", CP_SINCE: "2026-11-01T00:00:00Z", CP_UNTIL: "2026-11-20T00:00:00Z" };
      const withDecline = run("ops/db-report.cjs", p, decline);
      expect(JSON.parse(withDecline).customers).toHaveLength(1);
      expect(withDecline).toBe(run(without, p, decline));
    });
  });
});

function tool(args: string[]) {
  return spawnSync("bash", ["ops/conway-payers.sh", ...args], { encoding: "utf-8" });
}

describe("ops/conway-payers.sh", () => {
  it("counts the window and the overlap of the planned fixtures", () => {
    const r = tool(["--db-json", "ops/fixtures/conway-payers-db.json", "--transfers", "ops/fixtures/conway-payers-transfers.csv"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim().split("\n")).toEqual([
      `${W}: 4 wallets, 3 topped up, 40.01 USDC, 1 ours left out`,
      "OVERLAP topped up: 3 wallets, 2 known here, 1 with inference here, 1 paid here, 1 paid Conway after their last payment here",
      "OVERLAP all: 4 wallets, 3 known here, 2 with inference here, 1 paid here, 1 paid Conway after their last payment here",
    ]);
    expect(r.stdout).not.toMatch(ADDRESS);
    expect(r.stdout).not.toMatch(HASH);
  });

  it("leaves ours out, and counts it once ours is empty, as conway-money-metrics.py does", () => {
    const dir = mkdtempSync(join(tmpdir(), "cp-payers-ours-"));
    try {
      const j = JSON.parse(readFileSync("ops/fixtures/conway-payers-db.json", "utf-8"));
      j.ours = [];
      const none = join(dir, "no-ours.json");
      writeFileSync(none, JSON.stringify(j));
      const r = tool(["--db-json", none, "--transfers", "ops/fixtures/conway-payers-transfers.csv"]);
      expect(r.stdout.split("\n")[0]).toBe(`${W}: 5 wallets, 4 topped up, 45.01 USDC, 0 ours left out`);
      const m = JSON.parse(
        execFileSync("python3", ["docs/research/data/conway-money-metrics.py", "ops/fixtures/conway-payers-transfers.csv", "--json"], {
          encoding: "utf-8",
        }),
      );
      expect([m.wallets_30d, m.topup_wallets_30d]).toEqual([5, 4]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("finds the overlap through the JSON of db-report, and none once the payer is ours", () => {
    const csv = [
      "block,timestamp_utc,from,usdc,tx_hash",
      `1,2026-11-10T00:00:00Z,${STRANGER},5.000000,tx-1`,
      `2,2026-11-12T00:00:00Z,${STRANGER},5.000000,tx-2`,
      `3,2026-11-13T00:00:00Z,${OPERATOR},5.000000,tx-3`,
      `4,2026-11-14T00:00:00Z,0x6666666666666666666666666666666666666666,0.010000,tx-4`,
    ].join("\n");
    withDb((p, dir) => {
      const transfers = join(dir, "transfers.csv");
      writeFileSync(transfers, csv + "\n");
      const json = join(dir, "wallets.json");
      writeFileSync(json, wallets(p));
      const r = tool(["--db-json", json, "--transfers", transfers]);
      expect(r.stdout.trim().split("\n")).toEqual([
        "PAYERS window 2026-10-15T00:00:00Z to 2026-11-14T00:00:00Z: 2 wallets, 1 topped up, 10.01 USDC, 1 ours left out",
        "OVERLAP topped up: 1 wallets, 1 known here, 1 with inference here, 1 paid here, 1 paid Conway after their last payment here",
        "OVERLAP all: 2 wallets, 1 known here, 1 with inference here, 1 paid here, 1 paid Conway after their last payment here",
      ]);
      // The other direction: the stranger's address put on our side makes it ours, and it drops out.
      const j = JSON.parse(readFileSync(json, "utf-8"));
      j.ours.push(sha(STRANGER));
      writeFileSync(json, JSON.stringify(j));
      const off = tool(["--db-json", json, "--transfers", transfers]);
      expect(off.stdout.split("\n")[0]).toBe(
        "PAYERS window 2026-10-15T00:00:00Z to 2026-11-14T00:00:00Z: 1 wallets, 0 topped up, 0.01 USDC, 2 ours left out",
      );
      expect(off.stdout).not.toMatch(ADDRESS);
      expect(off.stdout).not.toMatch(HASH);
    });
  });

  it("exits 2 on a file it cannot read, 1 on an unknown flag, and passes its selftest naming ours, overlap and window", () => {
    expect(tool(["--db-json", "ops/fixtures/conway-payers-db.json", "--transfers", "ops/fixtures/no-such.csv"]).status).toBe(2);
    expect(tool(["--db-json", "ops/fixtures/no-such.json", "--transfers", "ops/fixtures/conway-payers-transfers.csv"]).status).toBe(2);
    expect(tool(["--no-such-flag"]).status).toBe(1);
    const r = tool(["--selftest"]);
    expect(r.stdout.trim().split("\n").pop()).toBe("SELFTEST OK");
    for (const word of ["ours", "overlap", "window"]) expect(r.stdout).toMatch(new RegExp(`^ok .*${word}`, "m"));
  });
});

describe("ops/conway-reach.py", () => {
  it("passes its selftest, each way counted in both directions on a planted world, and prints no address", () => {
    const r = spawnSync("python3", ["ops/conway-reach.py", "--selftest"], { encoding: "utf-8" });
    expect(r.status).toBe(0);
    expect(r.stdout.trim().split("\n").pop()).toBe("SELFTEST OK");
    for (const way of ["erc8004", "social", "issues"]) {
      expect(r.stdout).toMatch(new RegExp(`^ok   ${way}: `, "m"));
      expect(r.stdout).toMatch(new RegExp(`^ok   ${way} counter-proof: `, "m"));
    }
    expect(r.stdout).not.toMatch(ADDRESS);
    expect(spawnSync("python3", ["ops/conway-reach.py", "--way", "nowhere"]).status).toBe(1);
    expect(spawnSync("python3", ["ops/conway-reach.py", "--way", "issues", "--payers", "/nonexistent/payers.txt"]).status).toBe(2);
  });
});
