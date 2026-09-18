/**
 * SQLite-Schema des Control Plane.
 *
 * Geld liegt als Integer-Millicents (1/1000 Cent) in `wallets.balance_mc`, damit Inferenz-Calls im
 * Bruchteil eines Cents abgerechnet werden können; die API zeigt `balance_cents` = floor(mc/1000).
 * Jede Saldo-Änderung läuft in derselben Transaktion wie ihre Ledger-Zeile. Keys werden nur
 * gehasht gespeichert.
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
      address     TEXT PRIMARY KEY,             -- lowercase 0x-Adresse
      balance_mc  INTEGER NOT NULL DEFAULT 0,   -- Millicents
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
      delta_mc    INTEGER NOT NULL,             -- Millicents, negativ = Abbuchung
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
      credits_mc    INTEGER NOT NULL,
      status        TEXT NOT NULL,              -- pending | settled | failed
      tx_hash       TEXT,
      error         TEXT,
      created_at    TEXT NOT NULL,
      settled_at    TEXT
    );
  `);
}

export const MC_PER_CENT = 1000;

export function mcToCents(mc: number): number {
  return Math.floor(mc / MC_PER_CENT);
}

export interface LedgerEntry {
  address: string;
  kind: "topup" | "inference" | "transfer_in" | "transfer_out";
  deltaMc: number;
  ref?: string;
  meta?: Record<string, unknown>;
}

/**
 * Bucht eine Saldo-Änderung samt Ledger-Zeile. Muss innerhalb einer db.transaction() laufen,
 * wenn mehrere Buchungen zusammengehören; für sich allein ist die Funktion atomar.
 * Wirft, wenn der Saldo negativ würde.
 */
export function postLedger(db: Db, entry: LedgerEntry): { balanceMc: number } {
  const address = entry.address.toLowerCase();
  if (!Number.isInteger(entry.deltaMc)) throw new Error("delta_mc must be an integer");
  const run = db.transaction(() => {
    ensureWallet(db, address);
    const res = db
      .prepare("UPDATE wallets SET balance_mc = balance_mc + ? WHERE address = ? AND balance_mc + ? >= 0")
      .run(entry.deltaMc, address, entry.deltaMc);
    if (res.changes !== 1) throw new Error("insufficient_balance");
    db.prepare(
      "INSERT INTO ledger (address, kind, delta_mc, ref, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(
      address,
      entry.kind,
      entry.deltaMc,
      entry.ref ?? null,
      entry.meta ? JSON.stringify(entry.meta) : null,
      new Date().toISOString(),
    );
    return { balanceMc: getBalanceMc(db, address) };
  });
  return run();
}

export function ensureWallet(db: Db, address: string): void {
  db.prepare(
    "INSERT OR IGNORE INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)",
  ).run(address.toLowerCase(), new Date().toISOString());
}

export function getBalanceMc(db: Db, address: string): number {
  const row = db
    .prepare("SELECT balance_mc FROM wallets WHERE address = ?")
    .get(address.toLowerCase()) as { balance_mc: number } | undefined;
  return row?.balance_mc ?? 0;
}

export function getBalanceCents(db: Db, address: string): number {
  return mcToCents(getBalanceMc(db, address));
}
