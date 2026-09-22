/**
 * Backup and restore, reproduced without Docker.
 *
 * Background: on 19.09.2026 `ops/backup.sh` had been running for days, but nobody had ever restored
 * a backup. The drill for that is in `ops/README.md`, section "Restoring a backup"; these
 * tests pin down the three places where it goes wrong.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { openDb, postLedger } from "../src/db.js";

const REPO = process.cwd();
const VACUUM = path.join(REPO, "ops", "backup-vacuum.cjs");
const CHECK_SCRIPT = path.join(REPO, "ops", "restore-pruefen.cjs");

const directories: string[] = [];
const openConnections: Database.Database[] = [];

afterEach(() => {
  for (const db of openConnections.splice(0)) {
    try {
      db.close();
    } catch {
      /* already closed */
    }
  }
  for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-backup-"));
  directories.push(dir);
  return dir;
}

/**
 * Builds a database like the one in production: schema in the .db, data in the WAL, connection
 * open. It is exactly this state that makes a copy of the .db alone worthless.
 */
function productionDatabase(dir: string): { file: string; db: ReturnType<typeof openDb> } {
  const file = path.join(dir, "cp.db");
  openDb(file).close(); // first start: create the schema and check it out, after that the .db is small
  const db = openDb(file);
  openConnections.push(db);
  for (let i = 0; i < 3; i++) {
    const address = `0x${String(i).repeat(40)}`;
    const nonce = `0xnonce${i}`;
    postLedger(db, { address, kind: "topup", deltaMc: 500_000 * (i + 1), ref: nonce });
    postLedger(db, { address, kind: "inference", deltaMc: -(137 + i), meta: { model: "gpt-5.2", margin_mc: 12 } });
    db.prepare(
      `INSERT INTO payments (nonce, from_address, to_address, value_atomic, credits_mc, balance_after_mc, status, tx_hash, created_at, settled_at)
       VALUES (?,?,?,?,?,?, 'settled', ?, ?, ?)`,
    ).run(nonce, address, address, "5000000", 500_000 * (i + 1), 500_000 * (i + 1), `0xtx${i}`, "2026-09-19T03:00:00Z", "2026-09-19T03:00:01Z");
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?,?,?,?,?)").run(
      address,
      `hash${i}`.padEnd(64, "0"),
      `cp_live_${i}`,
      `key-${i}`,
      "2026-09-19T03:00:00Z",
    );
    db.prepare(
      "INSERT INTO automatons (automaton_id, address, creator_address, name, bio, registered_at) VALUES (?,?,?,?,?,?)",
    ).run(`aut-${i}`, address, address, `Automaton ${i}`, "", "2026-09-19T03:00:00Z");
  }
  return { file, db };
}

/** Reads a file the way a human would after a restore: is it intact, is it full? */
function state(file: string): Record<string, unknown> {
  const db = new Database(file, { readonly: true });
  const value = (sql: string): number | string => {
    try {
      return (db.prepare(sql).get() as { n: number }).n;
    } catch (err) {
      return `ERROR: ${(err as Error).message}`;
    }
  };
  const out = {
    integrity: (() => {
      try {
        return (db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check;
      } catch (err) {
        return `ERROR: ${(err as Error).message}`;
      }
    })(),
    wallets: value("SELECT count(*) n FROM wallets"),
    balance_mc: value("SELECT coalesce(sum(balance_mc),0) n FROM wallets"),
    ledger: value("SELECT count(*) n FROM ledger"),
    ledger_sum_mc: value("SELECT coalesce(sum(delta_mc),0) n FROM ledger"),
    settled: value("SELECT count(*) n FROM payments WHERE status = 'settled'"),
    keys: value("SELECT count(*) n FROM api_keys"),
  };
  db.close();
  return out;
}

function backup(source: string, target: string): Record<string, unknown> {
  const output = execFileSync(process.execPath, [VACUUM], {
    env: { ...process.env, CP_DB_PATH: source, CP_BACKUP_TMP: target },
    encoding: "utf8",
  });
  return JSON.parse(output.trim().split("\n").pop() as string);
}

describe("creating a backup (ops/backup-vacuum.cjs)", () => {
  it("gets the content out of the WAL, which a copy of the .db alone does not", () => {
    const dir = tmpDir();
    const { file } = productionDatabase(dir);

    // What the header of the script warns about: cp of the .db while the content sits in the -wal.
    const naive = path.join(dir, "naive.db");
    fs.copyFileSync(file, naive);
    const naiveState = state(naive);
    expect(naiveState.wallets, "the bare copy contains no row").toBe(0);
    expect(naiveState.integrity, "and still looks intact, which is why it goes unnoticed").toBe("ok");
    expect(fs.statSync(naive).size, "and sits far above any size threshold meant to catch it").toBeGreaterThan(20480);

    const result = backup(file, path.join(dir, "backup-tmp.db"));
    expect(result.problems).toEqual([]);
    expect(result.wallets).toBe(3);
    expect(state(path.join(dir, "backup-tmp.db"))).toMatchObject({ integrity: "ok", wallets: 3, settled: 3, keys: 3 });
  });

  it("runs even when the target file from the last run is still there", () => {
    const dir = tmpDir();
    const { file } = productionDatabase(dir);
    const target = path.join(dir, "backup-tmp.db");

    // A raw VACUUM INTO fails on an existing file. If it was left behind after a failed transfer,
    // every further backup failed from then on, day after day.
    backup(file, target);
    const raw = new Database(file, { readonly: true });
    expect(() => raw.exec(`VACUUM INTO ('${target}')`)).toThrow(/output file already exists/);
    raw.close();

    expect(backup(file, target).wallets).toBe(3);
  });

  it("does not accept a backup whose balances do not match the ledger rows", () => {
    const dir = tmpDir();
    const { file, db } = productionDatabase(dir);
    db.prepare("UPDATE wallets SET balance_mc = balance_mc + 4711 WHERE address = ?").run("0x" + "0".repeat(40));

    expect(() => backup(file, path.join(dir, "backup-tmp.db"))).toThrow(/without a matching ledger sum/);
  });

  it("does not take along a half-executed booking, even with a concurrent writer", () => {
    const dir = tmpDir();
    const { file, db } = productionDatabase(dir);

    // A writer in the middle of its transaction: balance raised, ledger row not yet written. If the
    // backup sees that intermediate state, it is worthless as a receipt.
    db.exec("BEGIN IMMEDIATE");
    db.prepare("UPDATE wallets SET balance_mc = balance_mc + 999_000 WHERE address = ?").run("0x" + "1".repeat(40));
    const result = backup(file, path.join(dir, "backup-tmp.db"));
    db.exec("ROLLBACK");

    expect(result.problems).toEqual([]);
    const b = state(path.join(dir, "backup-tmp.db"));
    expect(b.balance_mc, "balance and ledger have to match exactly in the backup").toBe(b.ledger_sum_mc);
  });
});

describe("restoring a backup (ops/README.md)", () => {
  it("yields an intact, complete database when -wal and -shm are removed", () => {
    const dir = tmpDir();
    const { file } = productionDatabase(dir);
    const saved = path.join(dir, "cp-backup.db");
    backup(file, saved);

    const targetDir = tmpDir();
    const targetFile = path.join(targetDir, "cp.db");
    fs.copyFileSync(saved, targetFile);
    for (const suffix of ["-wal", "-shm"]) fs.rmSync(targetFile + suffix, { force: true });

    expect(state(targetFile)).toMatchObject({ integrity: "ok", wallets: 3, settled: 3, keys: 3 });
    // And the service comes up on it: openDb() migrates, cleans up and opens.
    const db = openDb(targetFile);
    openConnections.push(db);
    expect((db.prepare("SELECT count(*) n FROM wallets").get() as { n: number }).n).toBe(3);
  });

  it("yields a broken database when the -wal and -shm of the old one are left behind", () => {
    const dir = tmpDir();
    const { file } = productionDatabase(dir);
    const saved = path.join(dir, "cp-backup.db");
    backup(file, saved);

    // The state of the old database as it sits in the volume after a hard stop: .db plus -wal plus
    // -shm. The backup is copied over it, the companion files stay.
    const targetDir = tmpDir();
    const targetFile = path.join(targetDir, "cp.db");
    for (const suffix of ["", "-wal", "-shm"]) fs.copyFileSync(file + suffix, targetFile + suffix);
    fs.copyFileSync(saved, targetFile);

    const broken = state(targetFile);
    const intact = { integrity: "ok", wallets: 3, balance_mc: 2_999_586, ledger: 6, ledger_sum_mc: 2_999_586, settled: 3, keys: 3 };
    expect(state(saved), "the backup itself is fine").toEqual(intact);
    expect(broken, "the mixture of new .db and old WAL is not").not.toEqual(intact);
    expect(
      String(broken.integrity) !== "ok" || broken.settled !== 3 || typeof broken.ledger_sum_mc === "string",
      `expected a corrupted or incomplete file, found: ${JSON.stringify(broken)}`,
    ).toBe(true);
  });

  it("accepts a backup that is older than the latest migrations", () => {
    const dir = tmpDir();
    const old = path.join(dir, "cp-old.db");
    // Schema from before reserved_mc, balance_after_mc and the kv table.
    const db = new Database(old);
    db.exec(`
      CREATE TABLE wallets (address TEXT PRIMARY KEY, balance_mc INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE TABLE siwe_nonces (nonce TEXT PRIMARY KEY, issued_at INTEGER NOT NULL, consumed_at INTEGER);
      CREATE TABLE sessions (token TEXT PRIMARY KEY, address TEXT NOT NULL REFERENCES wallets(address), expires_at INTEGER NOT NULL);
      CREATE TABLE api_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, address TEXT NOT NULL REFERENCES wallets(address),
        key_hash TEXT NOT NULL UNIQUE, key_prefix TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT);
      CREATE TABLE ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, address TEXT NOT NULL REFERENCES wallets(address),
        kind TEXT NOT NULL, delta_mc INTEGER NOT NULL, ref TEXT, meta TEXT, created_at TEXT NOT NULL);
      CREATE TABLE payments (nonce TEXT PRIMARY KEY, from_address TEXT NOT NULL, to_address TEXT NOT NULL,
        value_atomic TEXT NOT NULL, credits_mc INTEGER NOT NULL, status TEXT NOT NULL, tx_hash TEXT, error TEXT,
        created_at TEXT NOT NULL, settled_at TEXT);
      CREATE TABLE automatons (automaton_id TEXT PRIMARY KEY, address TEXT NOT NULL, creator_address TEXT NOT NULL,
        name TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', genesis_prompt_hash TEXT, registered_at TEXT NOT NULL);
    `);
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?,?,?)").run("0xa", 499_863, "2026-09-05T03:17:00Z");
    db.prepare("INSERT INTO ledger (address, kind, delta_mc, ref, created_at) VALUES (?,?,?,?,?)").run("0xa", "topup", 500_000, "0xold", "2026-09-05T03:17:00Z");
    db.prepare("INSERT INTO ledger (address, kind, delta_mc, created_at) VALUES (?,?,?,?)").run("0xa", "inference", -137, "2026-09-05T03:18:00Z");
    db.prepare(
      "INSERT INTO payments (nonce, from_address, to_address, value_atomic, credits_mc, status, created_at, settled_at) VALUES (?,?,?,?,?, 'settled', ?, ?)",
    ).run("0xold", "0xa", "0xa", "5000000", 500_000, "2026-09-05T03:17:00Z", "2026-09-05T03:17:01Z");
    db.close();

    const before = new Database(old, { readonly: true });
    const columnsBefore = (t: string) => (before.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
    expect(columnsBefore("wallets")).not.toContain("reserved_mc");
    expect(columnsBefore("payments")).not.toContain("balance_after_mc");
    before.close();

    const migrated = openDb(old);
    openConnections.push(migrated);
    const names = (t: string) => (migrated.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
    expect(names("wallets"), "the first start adds reserved_mc").toContain("reserved_mc");
    expect(names("payments"), "and balance_after_mc").toContain("balance_after_mc");
    expect(names("kv"), "and creates the kv table").toContain("value");
    expect((migrated.prepare("SELECT balance_mc n FROM wallets WHERE address = '0xa'").get() as { n: number }).n, "the balances stay untouched").toBe(499_863);
    expect((migrated.prepare("SELECT count(*) n FROM kv").get() as { n: number }).n, "the price catalogue from the kv is gone, the start hangs on OpenRouter again").toBe(0);
  });
});

describe("checking a restored file (ops/restore-pruefen.cjs)", () => {
  function check(file: string): { code: number; output: string } {
    try {
      return { code: 0, output: execFileSync(process.execPath, [CHECK_SCRIPT, file], { encoding: "utf8" }) };
    } catch (err) {
      const e = err as { status: number; stdout: string };
      return { code: e.status, output: e.stdout };
    }
  }

  it("accepts a clean backup", () => {
    const dir = tmpDir();
    const { file } = productionDatabase(dir);
    const saved = path.join(dir, "cp-backup.db");
    backup(file, saved);

    const { code, output } = check(saved);
    expect(code).toBe(0);
    expect(output).toContain("balance_mc == ledger_sum_mc per wallet");
    expect(JSON.parse(output.trim().split("\n").pop() as string)).toMatchObject({ failures: 0, wallets: 3, settled_without_booking: 0 });
  });

  it("fires when one x402 nonce has two credits", () => {
    // The legacy bug that is why ledger_topup_ref is only created inside a try/catch. In a current
    // database the index stops it, an old backup can still contain it: then the start only reports
    // it to the log and carries on, and without this check nobody notices.
    const dir = tmpDir();
    const old = path.join(dir, "cp-old.db");
    const db = new Database(old);
    db.exec(`
      CREATE TABLE wallets (address TEXT PRIMARY KEY, balance_mc INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE TABLE ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, address TEXT NOT NULL, kind TEXT NOT NULL,
        delta_mc INTEGER NOT NULL, ref TEXT, meta TEXT, created_at TEXT NOT NULL);
      CREATE TABLE payments (nonce TEXT PRIMARY KEY, from_address TEXT NOT NULL, to_address TEXT NOT NULL,
        value_atomic TEXT NOT NULL, credits_mc INTEGER NOT NULL, status TEXT NOT NULL, tx_hash TEXT, error TEXT,
        created_at TEXT NOT NULL, settled_at TEXT);
      CREATE TABLE api_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, address TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE,
        key_prefix TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT);
      CREATE TABLE automatons (automaton_id TEXT PRIMARY KEY, address TEXT NOT NULL, creator_address TEXT NOT NULL,
        name TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', genesis_prompt_hash TEXT, registered_at TEXT NOT NULL);
      INSERT INTO wallets (address, balance_mc, created_at) VALUES ('0xa', 1000000, '2026-09-05T03:17:00Z');
      INSERT INTO ledger (address, kind, delta_mc, ref, created_at) VALUES ('0xa', 'topup', 500000, '0xnonce0', '2026-09-05T03:17:00Z');
      INSERT INTO ledger (address, kind, delta_mc, ref, created_at) VALUES ('0xa', 'topup', 500000, '0xnonce0', '2026-09-05T03:19:00Z');
      INSERT INTO payments (nonce, from_address, to_address, value_atomic, credits_mc, status, created_at, settled_at)
        VALUES ('0xnonce0', '0xa', '0xa', '5000000', 500000, 'settled', '2026-09-05T03:17:00Z', '2026-09-05T03:17:01Z');
    `);
    db.close();

    const { code, output } = check(old);
    expect(code, "a duplicate credit must not pass").toBe(1);
    expect(output).toContain("0xnonce0 (2x)");
  });

  it("reports a backup whose schema is older than the code without rejecting it", () => {
    const dir = tmpDir();
    const old = path.join(dir, "cp-old.db");
    const db = new Database(old);
    db.exec(`
      CREATE TABLE wallets (address TEXT PRIMARY KEY, balance_mc INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE TABLE ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, address TEXT NOT NULL, kind TEXT NOT NULL,
        delta_mc INTEGER NOT NULL, ref TEXT, meta TEXT, created_at TEXT NOT NULL);
      CREATE TABLE payments (nonce TEXT PRIMARY KEY, from_address TEXT NOT NULL, to_address TEXT NOT NULL,
        value_atomic TEXT NOT NULL, credits_mc INTEGER NOT NULL, status TEXT NOT NULL, tx_hash TEXT, error TEXT,
        created_at TEXT NOT NULL, settled_at TEXT);
      CREATE TABLE api_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, address TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE,
        key_prefix TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT);
      CREATE TABLE automatons (automaton_id TEXT PRIMARY KEY, address TEXT NOT NULL, creator_address TEXT NOT NULL,
        name TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', genesis_prompt_hash TEXT, registered_at TEXT NOT NULL);
    `);
    db.close();

    const { code, output } = check(old);
    expect(code, "an old schema is no reason to discard the backup").toBe(0);
    expect(output).toContain("schema older than the code");
    expect(JSON.parse(output.trim().split("\n").pop() as string).schema_missing).toEqual([
      "wallets.reserved_mc",
      "payments.balance_after_mc",
      "kv",
    ]);
  });
});
