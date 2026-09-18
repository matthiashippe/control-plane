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

    -- Jede Saldo-Änderung ist genau eine Ledger-Zeile, geschrieben in derselben Transaktion.
    CREATE TABLE IF NOT EXISTS ledger (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      address     TEXT NOT NULL REFERENCES wallets(address),
      kind        TEXT NOT NULL,                -- topup | inference | transfer_in | transfer_out
      delta_cents INTEGER NOT NULL,
      ref         TEXT,                         -- Idempotenzschlüssel / Fremdreferenz (x402-Nonce, tx-Hash, ...)
      meta        TEXT,                         -- JSON
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ledger_address ON ledger(address, id);

    -- x402-Zahlungen, Schlüssel ist die Authorization-Nonce der EIP-3009-Signatur.
    CREATE TABLE IF NOT EXISTS payments (
      nonce         TEXT PRIMARY KEY,
      from_address  TEXT NOT NULL,
      to_address    TEXT NOT NULL,              -- Empfänger der Credits (aus dem Pfad)
      value_atomic  TEXT NOT NULL,              -- bigint als String
      credits_cents INTEGER NOT NULL,
      status        TEXT NOT NULL,              -- pending | settled | failed
      tx_hash       TEXT,
      error         TEXT,
      created_at    TEXT NOT NULL,
      settled_at    TEXT
    );
  `);
}

export interface LedgerEntry {
  address: string;
  kind: "topup" | "inference" | "transfer_in" | "transfer_out";
  deltaCents: number;
  ref?: string;
  meta?: Record<string, unknown>;
}

/**
 * Bucht eine Saldo-Änderung samt Ledger-Zeile. Muss innerhalb einer db.transaction() laufen,
 * wenn mehrere Buchungen zusammengehören; für sich allein ist die Funktion atomar.
 * Wirft, wenn der Saldo negativ würde.
 */
export function postLedger(db: Db, entry: LedgerEntry): { balanceCents: number } {
  const address = entry.address.toLowerCase();
  const run = db.transaction(() => {
    ensureWallet(db, address);
    const res = db
      .prepare(
        "UPDATE wallets SET balance_cents = balance_cents + ? WHERE address = ? AND balance_cents + ? >= 0",
      )
      .run(entry.deltaCents, address, entry.deltaCents);
    if (res.changes !== 1) throw new Error("insufficient_balance");
    db.prepare(
      "INSERT INTO ledger (address, kind, delta_cents, ref, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(
      address,
      entry.kind,
      entry.deltaCents,
      entry.ref ?? null,
      entry.meta ? JSON.stringify(entry.meta) : null,
      new Date().toISOString(),
    );
    return { balanceCents: getBalanceCents(db, address) };
  });
  return run();
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
