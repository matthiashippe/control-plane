/**
 * kunden 01: why the paying foreign automaton stops.
 *
 * Two halves, both run for real. `ops/db-report.cjs` with CP_REPORT=decline is run against a database
 * this file builds, the way ops/customer-decline.sh runs it in the container; and the shell tool itself
 * is run against the planted fixtures. Every case has its counter-proof in the same test, so a green
 * line cannot come from a filter that lets nothing through.
 */
import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db.js";

const OPERATOR = "0xd24f37d0838e62621ed24111164485ded0f0924f"; // in OURS of ops/db-report.cjs
const TOOL = "0x2222222222222222222222222222222222222222"; // ours by the name of its key
const STRANGER = "0x1111111111111111111111111111111111111111";
const LATER = "0x3333333333333333333333333333333333333333";
const SINCE = "2026-11-12T00:00:00Z";
const UNTIL = "2026-11-15T00:00:00Z";
const ADDRESS = /([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}/;

type Db = ReturnType<typeof openDb>;

function wallet(db: Db, address: string, balanceMc: number) {
  db.prepare("INSERT OR IGNORE INTO wallets (address, balance_mc, created_at) VALUES (?, ?, ?)").run(
    address,
    balanceMc,
    "2026-11-01T00:00:00.000Z",
  );
}

function row(db: Db, address: string, kind: string, deltaMc: number, at: string, model = "m-a") {
  db.prepare("INSERT INTO ledger (address, kind, delta_mc, ref, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    address,
    kind,
    deltaMc,
    `gen-${address.slice(2, 8)}-${at}`,
    JSON.stringify({ model }),
    at,
  );
}

/** The planned database: the stranger, a later stranger, our operator wallet and a tool of ours. */
function plant(db: Db) {
  wallet(db, STRANGER, 0);
  wallet(db, LATER, 700000);
  wallet(db, OPERATOR, 900000);
  wallet(db, TOOL, 100000);
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    TOOL,
    "hash-tool",
    "cnwy_k_xxxxxxx",
    "ops-decline-check",
    "2026-11-01T00:00:00.000Z",
  );
  row(db, STRANGER, "topup", 400000, "2026-11-10T08:00:00.000Z");
  row(db, STRANGER, "inference", -100000, "2026-11-11T23:59:59.000Z"); // before the window
  row(db, STRANGER, "inference", -100000, "2026-11-12T10:00:00.000Z");
  row(db, STRANGER, "inference", -100000, "2026-11-12T10:05:00.000Z", "m-b");
  row(db, STRANGER, "inference", -50000, "2026-11-13T09:00:00.000Z");
  row(db, STRANGER, "inference", -100000, "2026-11-15T00:00:00.000Z"); // at --until: outside
  row(db, LATER, "inference", -1000, "2026-11-13T12:00:00.000Z");
  row(db, OPERATOR, "inference", -5000, "2026-11-12T09:00:00.000Z");
  row(db, TOOL, "inference", -5000, "2026-11-12T08:00:00.000Z");
  db.prepare(
    "INSERT INTO inference_aborts (model, requested_model, provider, duration_ms, purchase_mc, answered, ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run("m-a", "m-a", "openrouter", 60000, 20000, 1, "gen-abort", "2026-11-13T09:30:00.000Z");
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
  const dir = mkdtempSync(join(tmpdir(), "cp-decline-"));
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

const decline = (dbPath: string) =>
  run("ops/db-report.cjs", dbPath, { CP_REPORT: "decline", CP_SINCE: SINCE, CP_UNTIL: UNTIL });

describe("ops/db-report.cjs with CP_REPORT=decline", () => {
  it("never lists our own addresses, by address or by key name, and does list the strangers", () => {
    const j = withDb((p) => JSON.parse(decline(p)));
    expect(j.customers.map((c: any) => c.n), "the stranger and the later stranger, numbered by first row").toEqual([1, 2]);
    expect(j.customers.map((c: any) => c.balance_mc), "and only they: 0 and 700000, never 900000 or 100000").toEqual([0, 700000]);
    expect(j.customers[0].last_topup, "the topup before the window still counts").toBe("2026-11-10T08:00:00.000Z");
    expect(j.customers[1].last_topup, "no topup is null").toBeNull();
  });

  it("keeps every row of a stranger in the window and none outside it", () => {
    const j = withDb((p) => JSON.parse(decline(p)));
    expect(j.customers[0].rows).toEqual([
      { at: "2026-11-12T10:00:00.000Z", model: "m-a", charged_mc: 100000 },
      { at: "2026-11-12T10:05:00.000Z", model: "m-b", charged_mc: 100000 },
      { at: "2026-11-13T09:00:00.000Z", model: "m-a", charged_mc: 50000 },
    ]);
    expect(j.aborts).toEqual([{ at: "2026-11-13T09:30:00.000Z", model: "m-a", answered: 1, purchase_mc: 20000 }]);
    // The other direction: the window moved back one day takes in the row it left out.
    const wide = withDb((p) =>
      JSON.parse(run("ops/db-report.cjs", p, { CP_REPORT: "decline", CP_SINCE: "2026-11-11T00:00:00Z", CP_UNTIL: UNTIL })),
    );
    expect(wide.customers[0].rows).toHaveLength(4);
  });

  it("carries no address, no key and no ref in the JSON", () => {
    const [text, dbHasThem] = withDb((p) => {
      const db = openDb(p);
      const n = (db.prepare("select count(*) n from ledger where address = ? and ref like 'gen-%'").get(STRANGER) as any).n;
      db.close();
      return [decline(p), n] as const;
    });
    expect(dbHasThem, "the database does hold the address and its refs").toBeGreaterThan(0);
    expect(text).not.toMatch(ADDRESS);
    expect(text).not.toContain("gen-");
    expect(text).not.toContain("hash-tool");
    expect(text).not.toContain("ops-decline-check");
  });

  it("leaves the default report unchanged without CP_REPORT", () => {
    withDb((p, dir) => {
      const plain = run("ops/db-report.cjs", p, {});
      const j = JSON.parse(plain);
      expect(j).not.toHaveProperty("customers");
      expect(j).toHaveProperty("wallets", 4);
      // Byte for byte: the same script with the decline block cut out prints the same report.
      const source = readFileSync("ops/db-report.cjs", "utf-8");
      const start = source.indexOf('if (process.env.CP_REPORT === "decline") {');
      const end = source.indexOf("\n}\n", start);
      expect(start).toBeGreaterThan(0);
      const without = join(dir, "db-report-without.cjs");
      writeFileSync(without, source.slice(0, start) + source.slice(end + 3));
      expect(plain).toBe(run(without, p, {}));
    });
  });

  it("refuses a CP_SINCE that is no ISO time in UTC", () => {
    withDb((p) => {
      const r = spawnSync("node", ["ops/db-report.cjs"], {
        env: { ...process.env, CP_DB_PATH: p, CP_REPORT: "decline", CP_SINCE: "2026-11-12" },
        encoding: "utf-8",
      });
      expect(r.status).toBe(1);
      expect(r.stdout).toBe("");
    });
  });
});

function tool(own: string, extra: string[] = []) {
  const seen = mkdtempSync(join(tmpdir(), "cp-decline-seen-"));
  try {
    return spawnSync(
      "bash",
      [
        "ops/customer-decline.sh",
        "--db-json",
        "ops/fixtures/customer-decline-db.json",
        "--log",
        "ops/fixtures/customer-decline.log",
        "--since",
        SINCE,
        "--until",
        UNTIL,
        ...extra,
      ],
      { env: { ...process.env, CP_OWN_IPS: own, CP_OWN_IPS_SEEN: join(seen, "seen.txt") }, encoding: "utf-8" },
    );
  } finally {
    rmSync(seen, { recursive: true, force: true });
  }
}

describe("ops/customer-decline.sh against the planted fixtures", () => {
  it("counts the planned customer, its 402 on the last day and the 500 of another address under OTHER", () => {
    const r = tool("ops/fixtures/customer-decline-own-ips.txt");
    expect(r.status).toBe(0);
    const lines = r.stdout.trim().split("\n");
    for (const want of [
      `DECLINE since ${SINCE} until ${UNTIL}: 1 foreign customers with inference`,
      "CUSTOMER 1: first 2026-11-12T10:00:00Z, last 2026-11-13T09:00:00Z, balance 0.00 USD, last topup 2026-11-10T08:00:00Z, ips 1",
      "DAY 1 2026-11-12: 3 calls, 3.00 USD, models m-a:3, http 2xx 3 402 0 4xx 0 5xx 0",
      "DAY 1 2026-11-13: 1 calls, 0.50 USD, models m-a:1, http 2xx 1 402 0 4xx 0 5xx 0",
      "DAY 1 2026-11-14: 0 calls, 0.00 USD, models -, http 2xx 0 402 2 4xx 0 5xx 0",
      "OTHER 2026-11-14: http 2xx 0 402 0 4xx 0 5xx 1",
      "ABORTS 2026-11-13: 1 aborted, 1 answered after, 0.20 USD bought",
      "UNMATCHED: 0 inference rows without a log line within 5 s",
      `WEEK: 3.50 USD foreign inference in the 7 days before ${UNTIL}`,
    ]) {
      expect(lines).toContain(want);
    }
    expect(r.stdout).not.toMatch(ADDRESS);
  });

  it("never matches ours, and does once our address is off the list", () => {
    const dir = mkdtempSync(join(tmpdir(), "cp-decline-own-"));
    try {
      const other = join(dir, "own.txt");
      writeFileSync(other, "192.0.2.254\n");
      const ours = tool("ops/fixtures/customer-decline-own-ips.txt").stdout;
      const off = tool(other).stdout;
      expect(ours).toMatch(/^CUSTOMER 1: .*, ips 1$/m);
      expect(off).toMatch(/^CUSTOMER 1: .*, ips 2$/m);
      expect(off).toContain("DAY 1 2026-11-12: 3 calls, 3.00 USD, models m-a:3, http 2xx 4 402 0 4xx 0 5xx 0");
      expect(off).not.toMatch(ADDRESS);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits 1 on an empty window and 2 on a log it cannot read", () => {
    const own = "ops/fixtures/customer-decline-own-ips.txt";
    expect(tool(own, ["--until", SINCE]).status).toBe(1);
    const r = spawnSync(
      "bash",
      ["ops/customer-decline.sh", "--db-json", "ops/fixtures/customer-decline-db.json", "--log", "ops/fixtures/no-such.log", "--since", SINCE],
      { env: { ...process.env, CP_OWN_IPS: own }, encoding: "utf-8" },
    );
    expect(r.status).toBe(2);
  });

  it("passes its own selftest, whose lines name ours, 402 and unmatched", () => {
    const r = spawnSync("bash", ["ops/customer-decline.sh", "--selftest"], { encoding: "utf-8" });
    expect(r.stdout.trim().split("\n").pop()).toBe("SELFTEST OK");
    for (const word of ["ours", "402", "unmatched"]) expect(r.stdout).toMatch(new RegExp(`^ok .*${word}`, "m"));
  });
});
