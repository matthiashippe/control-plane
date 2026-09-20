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

    -- Kleinkram, der einen Neustart überleben muss (z. B. der letzte Preiskatalog).
    CREATE TABLE IF NOT EXISTS kv (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL
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
      balance_after_mc INTEGER,       -- Saldo direkt nach der Gutschrift, siehe settledResponse()
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

    -- Ausgeschriebene Auftraege. Der Preis ist beim Einstellen bereits vom Guthaben des
    -- Auftraggebers abgebucht und liegt als Ledger-Zeile bounty_hold fest; die Spalte
    -- price_mc sagt nur noch, wie viel zurueckzugeben oder auszuzahlen ist.
    --
    -- Bewusst NICHT ueber wallets.reserved_mc: Diese Spalte wird bei jedem Start auf null
    -- gesetzt (siehe migrate() weiter unten), weil sie abgebrochene Inferenz-Reservierungen
    -- aufraeumt. Ein Deploy wuerde damit jede Hinterlegung still freigeben, und der Auftraggeber
    -- haette sein Geld zurueck, waehrend sein Auftrag weiter ausgeschrieben ist.
    CREATE TABLE IF NOT EXISTS bounties (
      id          TEXT PRIMARY KEY,
      creator     TEXT NOT NULL REFERENCES wallets(address),
      kind        TEXT NOT NULL,                -- factual | creative
      brief       TEXT NOT NULL,
      price_mc    INTEGER NOT NULL,
      deadline    TEXT NOT NULL,                -- ISO 8601
      status      TEXT NOT NULL,                -- open | cancelled
      created_at  TEXT NOT NULL,
      closed_at   TEXT
    );
    CREATE INDEX IF NOT EXISTS bounties_status ON bounties(status, deadline);
    CREATE INDEX IF NOT EXISTS bounties_creator ON bounties(creator, id);
  `);

  // Bestehende Datenbanken kennen reserved_mc noch nicht. SQLite hat kein "ADD COLUMN IF NOT
  // EXISTS", deshalb erst nachsehen.
  const spalten = db.prepare("PRAGMA table_info(wallets)").all() as { name: string }[];
  if (!spalten.some((c) => c.name === "reserved_mc")) {
    db.exec("ALTER TABLE wallets ADD COLUMN reserved_mc INTEGER NOT NULL DEFAULT 0");
  }

  // Zweite Verteidigungslinie gegen doppelte Gutschriften: Eine x402-Nonce darf höchstens eine
  // topup-Zeile erzeugen, auch wenn die Prüfung im Code durchrutscht. Der Index kann aber nicht
  // angelegt werden, wenn eine Bestandsdatenbank bereits Duplikate enthält, also genau das
  // Ergebnis des Fehlers, gegen den er schützt. Ein harter Abbruch wäre hier das Schlechtere:
  // Zusammen mit dem autoheal-Dienst würde daraus eine Neustartschleife, und der Dienst wäre
  // dauerhaft weg. Deshalb laut warnen und ohne Index weiterlaufen; die Prüfung in pay.ts bleibt.
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS ledger_topup_ref ON ledger(ref) WHERE kind = 'topup' AND ref IS NOT NULL");
  } catch {
    const doppelte = db
      .prepare("SELECT ref, count(*) AS n FROM ledger WHERE kind = 'topup' AND ref IS NOT NULL GROUP BY ref HAVING n > 1")
      .all() as { ref: string; n: number }[];
    console.error(
      `[db] ACHTUNG: ledger_topup_ref konnte nicht angelegt werden, ${doppelte.length} x402-Nonce(n) haben mehr als eine ` +
        `Gutschrift: ${doppelte.map((d) => `${d.ref} (${d.n}x)`).join(", ")}. ` +
        `Die Buchhaltung stimmt nicht. Prüfen mit: SELECT * FROM ledger WHERE kind='topup' AND ref IN (...). ` +
        `Der Dienst läuft weiter, die Absicherung gegen neue Doppelbuchungen steckt in pay.ts.`,
    );
  }

  // Saldo direkt nach der Gutschrift. Wird gebraucht, damit die Antwort auf einen wiederholten
  // Zahlungs-Header nicht den aktuellen Kontostand verrät: Diese Antwort gibt es ohne API-Key.
  const zahlungsSpalten = db.prepare("PRAGMA table_info(payments)").all() as { name: string }[];
  if (!zahlungsSpalten.some((c) => c.name === "balance_after_mc")) {
    db.exec("ALTER TABLE payments ADD COLUMN balance_after_mc INTEGER");
  }

  // Reservierungen gehören zu laufenden Requests. Ein frisch gestarteter Prozess hat keine, also
  // sind übriggebliebene Werte Reste eines Absturzes mitten im Provider-Call. Sie hier
  // zurückzusetzen ist nur korrekt, solange genau ein Prozess auf dieser Datei arbeitet, und
  // genau so läuft der Dienst (ein Container, eine SQLite-Datei).
  db.exec("UPDATE wallets SET reserved_mc = 0 WHERE reserved_mc <> 0");

  // Dasselbe für Zahlungen, die im Zustand `pending` hängen: Auch sie gehören zu einem Request,
  // der nicht mehr läuft. Sie hier stehen zu lassen wäre das Schlimmste von allem, denn die
  // Nonce antwortet dann dauerhaft mit 409 und niemand kann es erneut versuchen, obwohl die
  // USDC möglicherweise schon geflossen sind. Sie werden deshalb auf `failed` gesetzt, was den
  // Retry-Pfad öffnet, und ausdrücklich protokolliert: Ist die Zahlung on-chain durchgelaufen,
  // hat der Zahler Geld ohne Credits und das muss ein Mensch ansehen.
  const haengend = db
    .prepare("SELECT nonce, from_address, to_address, credits_mc FROM payments WHERE status = 'pending'")
    .all() as { nonce: string; from_address: string; to_address: string; credits_mc: number }[];
  if (haengend.length) {
    db.exec("UPDATE payments SET status = 'failed', error = 'interrupted_by_restart' WHERE status = 'pending'");
    for (const z of haengend) {
      console.error(
        `[db] ACHTUNG: Zahlung ${z.nonce} hing beim Neustart in 'pending' und ist jetzt 'failed'. ` +
          `Zahler ${z.from_address}, Empfänger ${z.to_address}, ${z.credits_mc} mc. Prüfen, ob die ` +
          `Autorisierung on-chain gesettelt wurde: Dann ist Geld geflossen, ohne dass Credits gebucht sind.`,
      );
    }
  }
}

export const MC_PER_CENT = 1000;

export function mcToCents(mc: number): number {
  return Math.floor(mc / MC_PER_CENT);
}

export interface LedgerEntry {
  address: string;
  // bounty_hold bucht den Preis beim Einstellen ab, bounty_release gibt ihn beim
  // Zurueckziehen wieder frei. Beides sind echte Saldo-Aenderungen und keine Reservierung,
  // damit sie einen Neustart ueberleben (src/bounties/store.ts sagt, warum).
  kind: "topup" | "inference" | "transfer_in" | "transfer_out" | "bounty_hold" | "bounty_release";
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

/**
 * Räumt Zeilen weg, die nur noch Platz kosten. Ohne das wächst `siwe_nonces` mit jedem Aufruf von
 * `/v1/auth/nonce` unbegrenzt, und dieser Pfad braucht keinen API-Key (Sicherheitsprüfung
 * 19.09.2026). Gibt zurück, wie viele Zeilen je Tabelle verschwunden sind.
 *
 * Nonces bleiben so lange, wie eine Signatur gültig sein kann, plus Puffer. Payments werden nur
 * im Zustand `failed` verworfen, und auch nur alte: `settled` ist der Beleg für eine Gutschrift
 * und wird nie gelöscht.
 */
export function cleanupExpired(db: Db, now = Date.now()): { nonces: number; sessions: number; payments: number } {
  const NONCE_MAX_ALTER_MS = 24 * 60 * 60 * 1000;
  const FAILED_PAYMENT_MAX_ALTER_TAGE = 30;
  const run = db.transaction(() => {
    const nonces = db.prepare("DELETE FROM siwe_nonces WHERE issued_at < ?").run(now - NONCE_MAX_ALTER_MS).changes;
    const sessions = db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now).changes;
    const payments = db
      .prepare("DELETE FROM payments WHERE status = 'failed' AND created_at < ?")
      .run(new Date(now - FAILED_PAYMENT_MAX_ALTER_TAGE * 24 * 60 * 60 * 1000).toISOString()).changes;
    return { nonces, sessions, payments };
  });
  return run();
}

/** Schlüssel-Wert-Ablage für Kleinkram, der einen Neustart überleben muss. */
export function setKV(db: Db, key: string, value: string): void {
  db.prepare("INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?").run(
    key,
    value,
    new Date().toISOString(),
    value,
    new Date().toISOString(),
  );
}

export function getKV(db: Db, key: string): string | null {
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
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
