/**
 * kunden 06: the database half of ops/starter-paths.sh, `CP_REPORT=starter-paths` in ops/db-report.cjs.
 *
 * The report runs for real against a database this file builds, the way the tool runs it in the container (`node -` on
 * stdin). Every case carries its counter-proof in the same planted database: the address that must not count sits next
 * to the ones that must, so an empty list cannot come from a filter that lets nothing through.
 */
import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db.js";

const ROOT = join(__dirname, "..");
const REPORT = join(ROOT, "ops", "db-report.cjs");
const SINCE = "2026-11-10T00:00:00Z";
const UNTIL = "2026-11-17T00:00:00Z";

// Made-up addresses only: `c1` is 0x…c1.
const addr = (tail: string) => `0x${tail.padStart(40, "0")}`;
const [C1, C2, C3, C4, A1] = ["c1", "c2", "c3", "c4", "a1"].map(addr);
const OPERATOR = "0xd24f37d0838e62621ed24111164485ded0f0924f";

type Db = ReturnType<typeof openDb>;
type Runtime = { n: number; key_at: string; granted: boolean; granted_at: string | null; funded_at: string | null };

let seq = 0;

function key(db: Db, address: string, name: string, at: string) {
  db.prepare("INSERT OR IGNORE INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, at);
  seq += 1;
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address,
    `hash-${seq}`,
    "prefix-made-up",
    name,
    at,
  );
}

function ledger(db: Db, address: string, kind: string, delta: number, at: string) {
  seq += 1;
  db.prepare("INSERT INTO ledger (address, kind, delta_mc, ref, meta, created_at) VALUES (?, ?, ?, ?, '{}', ?)").run(
    address,
    kind,
    delta,
    `ref-${seq}`,
    at,
  );
}

function plant(db: Db) {
  // A stranger without a grant, one with a grant, one funded by a topup, one before the window.
  key(db, C1, "conway-automaton", "2026-11-12T10:00:00.000Z");
  key(db, C2, "conway-automaton", "2026-11-13T08:00:00.000Z");
  ledger(db, C2, "grant", 15000, "2026-11-13T08:00:02.000Z");
  key(db, C3, "conway-automaton", "2026-11-14T09:00:00.000Z");
  ledger(db, C3, "topup", 500000, "2026-11-14T09:30:00.000Z");
  ledger(db, C3, "inference", -1000, "2026-11-14T09:31:00.000Z");
  key(db, C4, "conway-automaton", "2026-11-01T09:00:00.000Z");
  key(db, C4, "conway-automaton", "2026-11-12T09:00:00.000Z");
  // Ours: one by a key name of ours, one on OURS.
  key(db, A1, "conway-automaton", "2026-11-12T11:00:00.000Z");
  key(db, A1, "ops-selftest", "2026-11-12T11:00:00.000Z");
  key(db, OPERATOR, "conway-automaton", "2026-11-12T12:00:00.000Z");
}

function run(fill: (db: Db) => void, env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "cp-starter-paths-"));
  const path = join(dir, "cp.db");
  try {
    const db = openDb(path);
    fill(db);
    db.close();
    const base = { ...process.env };
    delete base.CP_REPORT;
    delete base.CP_SINCE;
    delete base.CP_UNTIL;
    return spawnSync("node", ["-"], {
      cwd: ROOT,
      input: readFileSync(REPORT, "utf-8"),
      env: { ...base, CP_DB_PATH: path, CP_REPORT: "starter-paths", CP_SINCE: SINCE, CP_UNTIL: UNTIL, ...env },
      encoding: "utf-8",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runtimes(fill: (db: Db) => void = plant): Runtime[] {
  const r = run(fill);
  expect(r.status).toBe(0);
  return JSON.parse(r.stdout).runtimes as Runtime[];
}

describe("CP_REPORT=starter-paths", () => {
  it("lists every new foreign runtime of the window by its first key, with grant and funding, and nothing else", () => {
    expect(runtimes()).toEqual([
      { n: 1, key_at: "2026-11-12T10:00:00.000Z", granted: false, granted_at: null, funded_at: null },
      { n: 2, key_at: "2026-11-13T08:00:00.000Z", granted: true, granted_at: "2026-11-13T08:00:02.000Z", funded_at: "2026-11-13T08:00:02.000Z" },
      { n: 3, key_at: "2026-11-14T09:00:00.000Z", granted: false, granted_at: null, funded_at: "2026-11-14T09:30:00.000Z" },
    ]);
  });

  it("never lists ours, by key name or on OURS, and counts a runtime only in the window of its first key", () => {
    const planned = runtimes();
    // Counter-proof: without its ops- key a1 is a stranger, and c4 with its first key moved into the window counts.
    const asStranger = runtimes((db) => {
      plant(db);
      db.prepare("DELETE FROM api_keys WHERE address = ? AND name = 'ops-selftest'").run(A1);
      db.prepare("UPDATE api_keys SET created_at = '2026-11-11T09:00:00.000Z' WHERE address = ? AND created_at LIKE '2026-11-01%'").run(C4);
    });
    expect(planned.map((r) => r.key_at)).not.toContain("2026-11-12T11:00:00.000Z");
    expect(planned.map((r) => r.key_at)).not.toContain("2026-11-12T12:00:00.000Z");
    expect(asStranger.map((r) => r.key_at)).toEqual([
      "2026-11-11T09:00:00.000Z",
      "2026-11-12T10:00:00.000Z",
      "2026-11-12T11:00:00.000Z",
      "2026-11-13T08:00:00.000Z",
      "2026-11-14T09:00:00.000Z",
    ]);
  });

  it("names no address and no key", () => {
    const r = run(plant);
    expect(r.stdout).not.toMatch(/0x[0-9a-fA-F]{40}/);
    expect(r.stdout).not.toMatch(/hash-|prefix-made-up/);
    // Counter-proof: the database does hold them, so the absence is the report's doing.
    expect(r.stdout.length).toBeGreaterThan(0);
  });

  it("refuses a time that is no ISO time in UTC with exit 1", () => {
    expect(run(plant, { CP_UNTIL: "2026-11-17" }).status).toBe(1);
    expect(run(plant).status).toBe(0);
  });

  it("leaves the standard report alone without CP_REPORT", () => {
    const dir = mkdtempSync(join(tmpdir(), "cp-starter-paths-"));
    try {
      const path = join(dir, "cp.db");
      const db = openDb(path);
      plant(db);
      db.close();
      const base = { ...process.env };
      delete base.CP_REPORT;
      const out = execFileSync("node", ["-"], {
        cwd: ROOT,
        input: readFileSync(REPORT, "utf-8"),
        env: { ...base, CP_DB_PATH: path, CP_UNTIL: UNTIL },
        encoding: "utf-8",
      });
      expect(JSON.parse(out).runtimes).toBeUndefined();
      expect(JSON.parse(out).runtime_funnel).toBeDefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
