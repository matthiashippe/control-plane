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
      reserved_mc INTEGER NOT NULL DEFAULT 0,   -- laufende Inferenz-Calls, siehe reserveMc()
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
    -- Zweite Verteidigungslinie gegen doppelte Gutschriften: Eine x402-Nonce darf höchstens
    -- eine topup-Zeile erzeugen, auch wenn ein Claim-Rennen im Code durchrutscht.
    CREATE UNIQUE INDEX IF NOT EXISTS ledger_topup_ref ON ledger(ref) WHERE kind = 'topup' AND ref IS NOT NULL;

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

    -- Registrierte Automatons (POST /v1/automatons/register), eine Zeile je automaton_id.
    CREATE TABLE IF NOT EXISTS automatons (
      automaton_id        TEXT PRIMARY KEY,
      address             TEXT NOT NULL,
      creator_address     TEXT NOT NULL,
      name                TEXT NOT NULL,
      bio                 TEXT NOT NULL DEFAULT '',
      genesis_prompt_hash TEXT,
      registered_at       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS automatons_address ON automatons(address);
  `);

  // Bestehende Datenbanken kennen reserved_mc noch nicht. SQLite hat kein "ADD COLUMN IF NOT
  // EXISTS", deshalb erst nachsehen.
  const spalten = db.prepare("PRAGMA table_info(wallets)").all() as { name: string }[];
  if (!spalten.some((c) => c.name === "reserved_mc")) {
    db.exec("ALTER TABLE wallets ADD COLUMN reserved_mc INTEGER NOT NULL DEFAULT 0");
  }

  // Reservierungen gehören zu laufenden Requests. Ein frisch gestarteter Prozess hat keine, also
  // sind übriggebliebene Werte Reste eines Absturzes mitten im Provider-Call. Sie hier
  // zurückzusetzen ist nur korrekt, solange genau ein Prozess auf dieser Datei arbeitet, und
  // genau so läuft der Dienst (ein Container, eine SQLite-Datei).
  db.exec("UPDATE wallets SET reserved_mc = 0 WHERE reserved_mc <> 0");
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
  /**
   * Reservierung, die mit dieser Buchung aufgelöst wird, in derselben Transaktion. Sonst gäbe es
   * zwischen Freigabe und Abbuchung ein Fenster, in dem ein paralleler Call das Guthaben sieht.
   */
  releaseReservedMc?: number;
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
    if (entry.releaseReservedMc) {
      db.prepare("UPDATE wallets SET reserved_mc = max(0, reserved_mc - ?) WHERE address = ?").run(entry.releaseReservedMc, address);
    }
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

/**
 * Reserviert Guthaben für einen laufenden Call. Atomar: Die Bedingung steht im UPDATE selbst,
 * deshalb können zwei gleichzeitige Requests nicht beide dasselbe Guthaben sehen und verbrauchen.
 * Genau das war der Fehler davor, als vor dem Provider-Call nur der Saldo gelesen wurde.
 * Gibt false zurück, wenn das verfügbare Guthaben (Saldo minus bereits Reserviertes) nicht reicht.
 */
export function reserveMc(db: Db, address: string, mc: number): boolean {
  if (!Number.isInteger(mc) || mc < 0) throw new Error("reserve_mc must be a non-negative integer");
  const addr = address.toLowerCase();
  const run = db.transaction(() => {
    ensureWallet(db, addr);
    const res = db
      .prepare("UPDATE wallets SET reserved_mc = reserved_mc + ? WHERE address = ? AND balance_mc - reserved_mc - ? >= 0")
      .run(mc, addr, mc);
    return res.changes === 1;
  });
  return run();
}

/** Gibt eine Reservierung zurück, ohne zu buchen (Provider-Fehler, abgebrochener Call). */
export function releaseMc(db: Db, address: string, mc: number): void {
  db.prepare("UPDATE wallets SET reserved_mc = max(0, reserved_mc - ?) WHERE address = ?").run(mc, address.toLowerCase());
}

/** Saldo minus laufende Reservierungen. Das ist, was ein neuer Call tatsächlich ausgeben darf. */
export function getAvailableMc(db: Db, address: string): number {
  const row = db
    .prepare("SELECT balance_mc - reserved_mc AS available FROM wallets WHERE address = ?")
    .get(address.toLowerCase()) as { available: number } | undefined;
  return row?.available ?? 0;
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
