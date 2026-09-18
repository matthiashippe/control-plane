/**
 * SQLite-Schema des Control Plane.
 *
 * Geld liegt nur als Integer-Cents in `wallets.balance_cents`; jede Änderung daran läuft in
 * derselben Transaktion wie ihre Ledger-Zeile (ab Goal 2). Keys werden nur gehasht gespeichert.
 */

import Database from "better-sqlite3";

export type Db = Database.Database;

export function openDb(path: string): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      address       TEXT PRIMARY KEY,           -- lowercase 0x-Adresse
      balance_cents INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS siwe_nonces (
      nonce       TEXT PRIMARY KEY,
      issued_at   INTEGER NOT NULL,             -- Unix ms
      consumed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,              -- access_token aus /v1/auth/verify
      address    TEXT NOT NULL REFERENCES wallets(address),
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      address    TEXT NOT NULL REFERENCES wallets(address),
      key_hash   TEXT NOT NULL UNIQUE,          -- sha256 hex des vollen Keys
      key_prefix TEXT NOT NULL,
      name       TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS api_keys_address ON api_keys(address);
  `);
}

export function ensureWallet(db: Db, address: string): void {
  db.prepare(
    "INSERT OR IGNORE INTO wallets (address, balance_cents, created_at) VALUES (?, 0, ?)",
  ).run(address.toLowerCase(), new Date().toISOString());
}

export function getBalanceCents(db: Db, address: string): number {
  const row = db
    .prepare("SELECT balance_cents FROM wallets WHERE address = ?")
    .get(address.toLowerCase()) as { balance_cents: number } | undefined;
  return row?.balance_cents ?? 0;
}
