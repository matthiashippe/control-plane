/**
 * kunden 03: the funnel of new Conway runtimes.
 *
 * `ops/db-report.cjs` is run for real against a database this file builds, the way ops/status.sh runs it in the
 * container (`node -` on stdin), with CP_UNTIL fixed. Every case carries its counter-proof in the same planted database:
 * the address that must not count sits next to the ones that must, so a zero cannot come from a filter that lets nothing
 * through. The last case runs ops/status.sh itself with `ssh`, `curl` and `openssl` as fakes on PATH; the fake `ssh` runs
 * the report it was handed locally against the test database.
 *
 * REPORT_UNDER_TEST points the test at another copy of ops/db-report.cjs, so the counter-proof can run it against the
 * report of origin/dev, which has no runtime_funnel.
 */
import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { openDb } from "../src/db.js";

const ROOT = join(__dirname, "..");
const OPS = join(ROOT, "ops");
const REPORT = process.env.REPORT_UNDER_TEST ? resolve(process.env.REPORT_UNDER_TEST) : join(OPS, "db-report.cjs");
const UNTIL = "2026-11-19T12:00:00Z";
const ADDRESS = /0x[0-9a-fA-F]{40}/;
const HASH = /[0-9a-f]{64}/;

// Made-up addresses only: `c1` is 0x…c1.
const addr = (tail: string) => `0x${tail.padStart(40, "0")}`;
const [C1, C2, C3, C4, C5, C6, C7, C8, C9, A1] = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "a1"].map(addr);

type Db = ReturnType<typeof openDb>;
type Week = { from: string; to: string; keys: number; starter_credit: number; inference: number; paid: number };
type Funnel = {
  until: string;
  weeks: Week[];
  total: { keys: number; starter_credit: number; inference: number; paid: number };
  largest_drop: { stage: string | null; lost: number };
};

let seq = 0;

function wallet(db: Db, address: string) {
  db.prepare("INSERT OR IGNORE INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, "2026-09-01T00:00:00.000Z");
}

function key(db: Db, address: string, name: string, at: string) {
  wallet(db, address);
  seq += 1;
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address,
    `hash-${seq}`,
    "prefix-made-up",
    name,
    at,
  );
}

function ledger(db: Db, address: string, kind: string, at: string) {
  wallet(db, address);
  seq += 1;
  db.prepare("INSERT INTO ledger (address, kind, delta_mc, ref, meta, created_at) VALUES (?, ?, ?, ?, '{}', ?)").run(
    address,
    kind,
    kind === "grant" ? 15000 : -1000,
    `ref-${seq}`,
    at,
  );
}

function payment(db: Db, from: string, to: string, status: string, at: string) {
  seq += 1;
  db.prepare(
    "INSERT INTO payments (nonce, from_address, to_address, value_atomic, credits_mc, status, tx_hash, created_at, settled_at) VALUES (?, ?, ?, '5000000', 500000, ?, NULL, ?, ?)",
  ).run(`nonce-${seq}`, from, to, status, at, status === "settled" ? at : null);
}

const OTHER = addr("ee"); // the other side of a payment that names its runtime only in to_address

/** The plan from the goal file. */
function plant(db: Db) {
  key(db, C1, "conway-automaton", "2026-11-18T10:00:00.000Z");
  ledger(db, C1, "grant", "2026-11-18T10:00:01.000Z");
  ledger(db, C1, "inference", "2026-11-18T10:05:00.000Z");
  payment(db, C1, C1, "settled", "2026-11-18T11:00:00.000Z");

  key(db, C2, "conway-automaton", "2026-11-17T10:00:00.000Z");
  ledger(db, C2, "grant", "2026-11-17T10:00:01.000Z");

  key(db, C3, "conway-automaton", "2026-11-16T10:00:00.000Z");

  key(db, C4, "conway-automaton", "2026-11-15T10:00:00.000Z");
  ledger(db, C4, "grant", "2026-11-15T10:00:01.000Z");
  ledger(db, C4, "inference", "2026-11-15T10:05:00.000Z");
  payment(db, C4, C4, "failed", "2026-11-15T11:00:00.000Z");

  key(db, C5, "conway-automaton", "2026-11-08T10:00:00.000Z");
  ledger(db, C5, "inference", "2026-11-08T10:05:00.000Z");
  payment(db, OTHER, C5, "settled", "2026-11-08T11:00:00.000Z");

  key(db, C8, "conway-automaton", "2026-11-10T10:00:00.000Z");
  key(db, C8, "conway-automaton", "2026-11-18T10:00:00.000Z");

  key(db, C6, "conway-automaton", "2026-10-01T10:00:00.000Z");
  ledger(db, C6, "grant", "2026-10-01T10:00:01.000Z");
  ledger(db, C6, "inference", "2026-10-01T10:05:00.000Z");
  payment(db, C6, C6, "settled", "2026-10-01T11:00:00.000Z");

  key(db, C7, "browser", "2026-11-18T10:00:00.000Z");
  ledger(db, C7, "grant", "2026-11-18T10:00:01.000Z");

  key(db, C9, "conway-automaton", "2026-11-19T13:00:00.000Z");

  key(db, A1, "conway-automaton", "2026-11-18T10:00:00.000Z");
  key(db, A1, "ops-selftest", "2026-11-18T10:00:00.000Z");
  ledger(db, A1, "grant", "2026-11-18T10:00:01.000Z");
  ledger(db, A1, "inference", "2026-11-18T10:05:00.000Z");
  payment(db, A1, A1, "settled", "2026-11-18T11:00:00.000Z");
}

function withDb<T>(fn: (dbPath: string) => T, fill: (db: Db) => void = plant): T {
  const dir = mkdtempSync(join(tmpdir(), "cp-funnel-"));
  const path = join(dir, "cp.db");
  try {
    const db = openDb(path);
    fill(db);
    db.close();
    return fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function report(dbPath: string): { raw: string; funnel: Funnel } {
  const env = { ...process.env };
  delete env.CP_REPORT;
  delete env.CP_SINCE;
  const raw = execFileSync("node", ["-"], {
    cwd: ROOT,
    input: readFileSync(REPORT, "utf-8"),
    env: { ...env, CP_DB_PATH: dbPath, CP_UNTIL: UNTIL },
    encoding: "utf-8",
  });
  const funnel = JSON.parse(raw).runtime_funnel as Funnel;
  expect(funnel).toBeDefined();
  return { raw, funnel };
}

const planned = () => withDb((p) => report(p).funnel);

describe("runtime_funnel in the standard report", () => {
  it("counts the plan per week, the total and the largest drop", () => {
    const f = planned();
    expect(f.until).toBe("2026-11-19T12:00:00.000Z");
    expect(f.weeks).toEqual([
      { from: "2026-11-12T12:00:00.000Z", to: "2026-11-19T12:00:00.000Z", keys: 4, starter_credit: 3, inference: 2, paid: 1 },
      { from: "2026-11-05T12:00:00.000Z", to: "2026-11-12T12:00:00.000Z", keys: 2, starter_credit: 0, inference: 1, paid: 1 },
      { from: "2026-10-29T12:00:00.000Z", to: "2026-11-05T12:00:00.000Z", keys: 0, starter_credit: 0, inference: 0, paid: 0 },
      { from: "2026-10-22T12:00:00.000Z", to: "2026-10-29T12:00:00.000Z", keys: 0, starter_credit: 0, inference: 0, paid: 0 },
    ]);
    expect(f.total).toEqual({ keys: 6, starter_credit: 3, inference: 3, paid: 2 });
    expect(f.largest_drop).toEqual({ stage: "starter_credit", lost: 3 });
    expect(Object.keys(f).sort()).toEqual(["largest_drop", "total", "until", "weeks"]);
  });

  it("never counts our own address, even with a conway-automaton key and money on every stage", () => {
    const without = withDb((p) => report(p).funnel, (db) => {
      plant(db);
    });
    // Counter-proof: the same address without its ops- key is a stranger and lands in week 1 on every stage.
    const asStranger = withDb((p) => report(p).funnel, (db) => {
      plant(db);
      db.prepare("DELETE FROM api_keys WHERE address = ? AND name = 'ops-selftest'").run(A1);
    });
    expect(without.weeks[0]).toMatchObject({ keys: 4, starter_credit: 3, inference: 2, paid: 1 });
    expect(asStranger.weeks[0]).toMatchObject({ keys: 5, starter_credit: 4, inference: 3, paid: 2 });
    // An address on OURS counts never either, with nothing but a conway-automaton key.
    const operator = "0xd24f37d0838e62621ed24111164485ded0f0924f";
    const withOperator = withDb((p) => report(p).funnel, (db) => {
      plant(db);
      key(db, operator, "conway-automaton", "2026-11-18T10:00:00.000Z");
    });
    expect(withOperator.total).toEqual(without.total);
  });

  it("only conway-automaton keys make a runtime", () => {
    const f = planned();
    // Counter-proof: c7 with its key renamed to conway-automaton is one more key with a starter grant in week 1.
    const renamed = withDb((p) => report(p).funnel, (db) => {
      plant(db);
      db.prepare("UPDATE api_keys SET name = 'conway-automaton' WHERE address = ?").run(C7);
    });
    expect(f.weeks[0].keys).toBe(4);
    expect(renamed.weeks[0]).toMatchObject({ keys: 5, starter_credit: 4 });
  });

  it("counts a runtime once, in the week of its first key", () => {
    const f = planned();
    // c8 has keys in week 2 and week 1; week 2 holds c5 and c8, week 1 does not hold c8.
    expect(f.weeks[1].keys).toBe(2);
    expect(f.weeks[0].keys).toBe(4);
    expect(f.total.keys).toBe(6);
    // Counter-proof: without its first key c8 moves to week 1.
    const moved = withDb((p) => report(p).funnel, (db) => {
      plant(db);
      db.prepare("DELETE FROM api_keys WHERE address = ? AND created_at = '2026-11-10T10:00:00.000Z'").run(C8);
    });
    expect(moved.weeks[1].keys).toBe(1);
    expect(moved.weeks[0].keys).toBe(5);
  });

  it("counts only settled payments as paid", () => {
    const f = planned();
    expect(f.weeks[0].paid).toBe(1);
    // Counter-proof: c4's failed payment settled is one more payer in week 1.
    const settled = withDb((p) => report(p).funnel, (db) => {
      plant(db);
      db.prepare("UPDATE payments SET status = 'settled', settled_at = created_at WHERE from_address = ?").run(C4);
    });
    expect(settled.weeks[0].paid).toBe(2);
    // And a settled payment that names the runtime only in to_address counts (c5, without a starter grant).
    expect(f.weeks[1]).toMatchObject({ starter_credit: 0, paid: 1 });
  });

  it("counts nothing outside the window of four weeks before CP_UNTIL", () => {
    const f = planned();
    expect(f.total.keys).toBe(6);
    // Counter-proof: c6 inside the window and c9 before CP_UNTIL both count.
    const inside = withDb((p) => report(p).funnel, (db) => {
      plant(db);
      db.prepare("UPDATE api_keys SET created_at = '2026-10-23T10:00:00.000Z' WHERE address = ?").run(C6);
      db.prepare("UPDATE api_keys SET created_at = '2026-11-19T11:00:00.000Z' WHERE address = ?").run(C9);
    });
    expect(inside.weeks[3]).toMatchObject({ keys: 1, starter_credit: 1, inference: 1, paid: 1 });
    expect(inside.weeks[0].keys).toBe(5);
    expect(inside.total.keys).toBe(8);
  });

  it("ends the window at the start of the current UTC hour without CP_UNTIL", () => {
    withDb((p) => {
      const env = { ...process.env };
      delete env.CP_REPORT;
      delete env.CP_UNTIL;
      const before = Math.floor(Date.now() / 3600e3) * 3600e3;
      const out = execFileSync("node", ["-"], { cwd: ROOT, input: readFileSync(REPORT, "utf-8"), env: { ...env, CP_DB_PATH: p }, encoding: "utf-8" });
      const after = Math.floor(Date.now() / 3600e3) * 3600e3;
      const until = Date.parse((JSON.parse(out).runtime_funnel as Funnel).until);
      expect([before, after]).toContain(until);
    });
  });

  it("carries no address, no hash and no key in the block", () => {
    const { raw, funnel } = withDb((p) => report(p));
    const block = JSON.stringify(funnel);
    expect(block).not.toMatch(ADDRESS);
    expect(block).not.toMatch(HASH);
    expect(block).not.toMatch(/prefix-made-up|hash-\d/);
    // Counter-proof: the same patterns do find the planted addresses elsewhere in the database, so they can match.
    expect(JSON.stringify({ C1, A1 })).toMatch(ADDRESS);
    expect(raw.length).toBeGreaterThan(block.length);
  });

  it("names no drop when no stage loses anyone", () => {
    const empty = withDb((p) => report(p).funnel, () => {});
    expect(empty.total).toEqual({ keys: 0, starter_credit: 0, inference: 0, paid: 0 });
    expect(empty.largest_drop).toEqual({ stage: null, lost: 0 });
    const full = withDb((p) => report(p).funnel, (db) => {
      key(db, C1, "conway-automaton", "2026-11-18T10:00:00.000Z");
      ledger(db, C1, "grant", "2026-11-18T10:00:01.000Z");
      ledger(db, C1, "inference", "2026-11-18T10:05:00.000Z");
      payment(db, C1, C1, "settled", "2026-11-18T11:00:00.000Z");
    });
    expect(full.total).toEqual({ keys: 1, starter_credit: 1, inference: 1, paid: 1 });
    expect(full.largest_drop).toEqual({ stage: null, lost: 0 });
    // Counter-proof: the same runtime without a payment loses one at the last stage.
    const unpaid = withDb((p) => report(p).funnel, (db) => {
      key(db, C1, "conway-automaton", "2026-11-18T10:00:00.000Z");
      ledger(db, C1, "grant", "2026-11-18T10:00:01.000Z");
      ledger(db, C1, "inference", "2026-11-18T10:05:00.000Z");
    });
    expect(unpaid.largest_drop).toEqual({ stage: "paid", lost: 1 });
  });

  it("stops with an exit other than 0 for an unreadable CP_UNTIL", () => {
    withDb((p) => {
      const r = spawnSync("node", ["-"], {
        cwd: ROOT,
        input: readFileSync(REPORT, "utf-8"),
        env: { ...process.env, CP_REPORT: "", CP_DB_PATH: p, CP_UNTIL: "yesterday" },
        encoding: "utf-8",
      });
      expect(r.status).not.toBe(0);
      expect(r.stdout).toBe("");
    });
  });

  it("status shows the block under db.runtime_funnel", () => {
    withDb((dbPath) => {
      const root = mkdtempSync(join(tmpdir(), "cp-funnel-status-"));
      try {
        const bin = join(root, "bin");
        mkdirSync(bin);
        const ops = join(root, "ops");
        mkdirSync(ops);
        // ops/status.sh finds db-report.cjs next to itself, so the copy runs the report under test.
        copyFileSync(join(OPS, "status.sh"), join(ops, "status.sh"));
        copyFileSync(REPORT, join(ops, "db-report.cjs"));
        for (const helper of ["webhook-unreachable.sh", "webhook-last.sh"]) copyFileSync(join(OPS, helper), join(ops, helper));
        const fake = (name: string, lines: string[]) => {
          writeFileSync(join(bin, name), ["#!/bin/sh", ...lines].join("\n") + "\n");
          chmodSync(join(bin, name), 0o755);
        };
        fake("ssh", [
          'case "$*" in',
          `  *"exec -T cp node -") cd ${JSON.stringify(ROOT)} && CP_DB_PATH=${JSON.stringify(dbPath)} CP_UNTIL=${UNTIL} exec node - ;;`,
          "  *) exit 255 ;;",
          "esac",
        ]);
        fake("curl", ["exit 7"]);
        fake("openssl", ["exit 1"]);
        const r = spawnSync("bash", [join(ops, "status.sh")], {
          cwd: root,
          encoding: "utf8",
          timeout: 60_000,
          env: {
            PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
            HOME: root,
            CP_URL: "https://status.invalid",
            CP_DEPLOY_HOST: "root@server.invalid",
            CP_DEPLOY_KEY: join(root, "no-key"),
          },
        });
        const funnel = JSON.parse(r.stdout).db.runtime_funnel as Funnel;
        expect(funnel.weeks).toHaveLength(4);
        expect(funnel.total).toEqual({ keys: 6, starter_credit: 3, inference: 3, paid: 2 });
        expect(funnel.largest_drop).toEqual({ stage: "starter_credit", lost: 3 });
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });
});
