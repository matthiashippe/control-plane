/**
 * SQLite schema of the control plane.
 *
 * Money sits as integer millicents (1/1000 of a cent) in `wallets.balance_mc`, so inference calls
 * can be billed at a fraction of a cent; the API shows `balance_cents` = floor(mc/1000). Every
 * balance change runs in the same transaction as its ledger row. Keys are only stored hashed.
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
      address     TEXT PRIMARY KEY,             -- lowercase 0x address
      balance_mc  INTEGER NOT NULL DEFAULT 0,   -- millicents
      reserved_mc INTEGER NOT NULL DEFAULT 0,   -- inference calls in flight, see reserveMc()
      created_at    TEXT NOT NULL
    );

    -- Small things that have to survive a restart (the last price catalogue, for example).
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
      token      TEXT PRIMARY KEY,              -- access_token from /v1/auth/verify
      address    TEXT NOT NULL REFERENCES wallets(address),
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      address    TEXT NOT NULL REFERENCES wallets(address),
      key_hash   TEXT NOT NULL UNIQUE,          -- sha256 hex of the full key
      key_prefix TEXT NOT NULL,
      name       TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS api_keys_address ON api_keys(address);

    -- Every balance change is exactly one ledger row, written in the same transaction.
    CREATE TABLE IF NOT EXISTS ledger (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      address     TEXT NOT NULL REFERENCES wallets(address),
      kind        TEXT NOT NULL,                -- topup | inference | transfer_in | transfer_out
      delta_mc    INTEGER NOT NULL,             -- millicents, negative = charge
      ref         TEXT,                         -- idempotency key / foreign reference (x402 nonce, tx hash, ...)
      meta        TEXT,                         -- JSON
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ledger_address ON ledger(address, id);

    -- x402 payments, keyed by the authorization nonce of the EIP-3009 signature.
    CREATE TABLE IF NOT EXISTS payments (
      nonce         TEXT PRIMARY KEY,
      from_address  TEXT NOT NULL,
      to_address    TEXT NOT NULL,              -- recipient of the credits (from the path)
      value_atomic  TEXT NOT NULL,              -- bigint as a string
      credits_mc    INTEGER NOT NULL,
      balance_after_mc INTEGER,       -- balance right after the credit, see settledResponse()
      status        TEXT NOT NULL,              -- pending | settled | failed
      tx_hash       TEXT,
      error         TEXT,
      created_at    TEXT NOT NULL,
      settled_at    TEXT
    );

    -- Registered automatons (POST /v1/automatons/register), one row per automaton_id.
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

    -- Posted bounties. The price is already charged against the buyer's balance when the bounty
    -- goes up and is fixed as a bounty_hold ledger row; the price_mc column only says how much is
    -- to be refunded or paid out.
    --
    -- Deliberately NOT via wallets.reserved_mc: that column is set to zero on every start (see
    -- migrate() further down), because it cleans up aborted inference reservations. A deploy would
    -- therefore silently release every hold, and the buyer would have their money back while their
    -- bounty is still posted.
    CREATE TABLE IF NOT EXISTS bounties (
      id          TEXT PRIMARY KEY,
      creator     TEXT NOT NULL REFERENCES wallets(address),
      kind        TEXT NOT NULL,                -- factual | creative
      brief       TEXT NOT NULL,
      price_mc    INTEGER NOT NULL,
      deadline    TEXT NOT NULL,                -- ISO 8601
      status      TEXT NOT NULL,                -- open | cancelled
      created_at  TEXT NOT NULL,
      closed_at   TEXT,
      winner_submission TEXT
    );
    CREATE INDEX IF NOT EXISTS bounties_status ON bounties(status, deadline);
    CREATE INDEX IF NOT EXISTS bounties_creator ON bounties(creator, id);

    -- One entry for a bounty. The unique index over (bounty_id, agent) is the rule: one attempt
    -- per agent and bounty. Without it an agent could enter the same bounty a hundred times and
    -- bury the buyer's choice.
    CREATE TABLE IF NOT EXISTS submissions (
      id          TEXT PRIMARY KEY,
      bounty_id   TEXT NOT NULL REFERENCES bounties(id),
      agent       TEXT NOT NULL REFERENCES wallets(address),
      body        TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS submissions_once ON submissions(bounty_id, agent);
    CREATE INDEX IF NOT EXISTS submissions_bounty ON submissions(bounty_id, id);
  `);

  // Existing databases do not know reserved_mc yet. SQLite has no "ADD COLUMN IF NOT EXISTS", so
  // look first.
  const walletColumns = db.prepare("PRAGMA table_info(wallets)").all() as { name: string }[];
  if (!walletColumns.some((c) => c.name === "reserved_mc")) {
    db.exec("ALTER TABLE wallets ADD COLUMN reserved_mc INTEGER NOT NULL DEFAULT 0");
  }

  // Same thing for the bounty table: `CREATE TABLE IF NOT EXISTS` does not add a column to a table
  // that already exists, and the production database has had `bounties` without this column since
  // the deploy of 20.09.2026.
  const bountyColumns = db.prepare("PRAGMA table_info(bounties)").all() as { name: string }[];
  if (bountyColumns.length > 0 && !bountyColumns.some((c) => c.name === "winner_submission")) {
    db.exec("ALTER TABLE bounties ADD COLUMN winner_submission TEXT");
  }

  // The unique index over (bounty_id, agent) used to be called `submissions_einmal`. The name was
  // the last German identifier in the schema; the index above creates the English one, and this
  // drops the old one so a database from before the rename does not carry both. Dropping is safe
  // because both cover the same columns with the same uniqueness.
  db.exec("DROP INDEX IF EXISTS submissions_einmal");

  // Second line of defence against duplicate credits: an x402 nonce may produce at most one topup
  // row, even if the check in the code slips through. The index cannot be created, however, when an
  // existing database already contains duplicates, which is exactly the result of the bug it
  // protects against. A hard abort would be the worse option here: together with the autoheal
  // service it would turn into a restart loop and the service would be gone for good. So warn
  // loudly and keep running without the index; the check in pay.ts stays.
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS ledger_topup_ref ON ledger(ref) WHERE kind = 'topup' AND ref IS NOT NULL");
  } catch {
    const duplicates = db
      .prepare("SELECT ref, count(*) AS n FROM ledger WHERE kind = 'topup' AND ref IS NOT NULL GROUP BY ref HAVING n > 1")
      .all() as { ref: string; n: number }[];
    console.error(
      `[db] WARNING: ledger_topup_ref could not be created, ${duplicates.length} x402 nonce(s) have more than one ` +
        `credit: ${duplicates.map((d) => `${d.ref} (${d.n}x)`).join(", ")}. ` +
        `The books do not add up. Inspect with: SELECT * FROM ledger WHERE kind='topup' AND ref IN (...). ` +
        `The service keeps running, the guard against new double bookings sits in pay.ts.`,
    );
  }

  // Balance right after the credit. Needed so the answer to a repeated payment header does not
  // leak the current balance: that answer is served without an API key.
  const paymentColumns = db.prepare("PRAGMA table_info(payments)").all() as { name: string }[];
  if (!paymentColumns.some((c) => c.name === "balance_after_mc")) {
    db.exec("ALTER TABLE payments ADD COLUMN balance_after_mc INTEGER");
  }

  // Reservations belong to requests in flight. A freshly started process has none, so leftover
  // values are the remains of a crash in the middle of a provider call. Resetting them here is only
  // correct as long as exactly one process works on this file, and that is exactly how the service
  // runs (one container, one SQLite file).
  db.exec("UPDATE wallets SET reserved_mc = 0 WHERE reserved_mc <> 0");

  // The same for payments stuck in state `pending`: they too belong to a request that is no longer
  // running. Leaving them here would be the worst of all, because the nonce then answers 409
  // forever and nobody can try again, although the USDC may already have moved. They are therefore
  // set to `failed`, which opens the retry path, and explicitly logged: if the payment did settle
  // on chain, the payer has spent money without credits and a human has to look at it.
  const stuck = db
    .prepare("SELECT nonce, from_address, to_address, credits_mc FROM payments WHERE status = 'pending'")
    .all() as { nonce: string; from_address: string; to_address: string; credits_mc: number }[];
  if (stuck.length) {
    db.exec("UPDATE payments SET status = 'failed', error = 'interrupted_by_restart' WHERE status = 'pending'");
    for (const p of stuck) {
      console.error(
        `[db] WARNING: payment ${p.nonce} was stuck in 'pending' across a restart and is now 'failed'. ` +
          `Payer ${p.from_address}, recipient ${p.to_address}, ${p.credits_mc} mc. Check whether the ` +
          `authorization settled on chain: if it did, money moved without credits being booked.`,
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
  // bounty_hold charges the price when the bounty goes up, bounty_release frees it again when the
  // bounty is taken back. Both are real balance changes and not reservations, so they survive a
  // restart (src/bounties/store.ts says why).
  kind:
    | "topup" | "inference" | "transfer_in" | "transfer_out"
    | "bounty_hold" | "bounty_release" | "bounty_award" | "bounty_fee";
  deltaMc: number;
  ref?: string;
  meta?: Record<string, unknown>;
  /**
   * Reservation that is resolved together with this booking, in the same transaction. Otherwise
   * there would be a window between release and charge in which a parallel call sees the credit.
   */
  releaseReservedMc?: number;
}

/**
 * Books a balance change together with its ledger row. Has to run inside a db.transaction() when
 * several bookings belong together; on its own the function is atomic. Throws when the balance
 * would go negative.
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
 * Reserves credit for a call in flight. Atomic: the condition sits inside the UPDATE itself, so two
 * concurrent requests cannot both see and spend the same credit. That was exactly the bug before,
 * when only the balance was read ahead of the provider call. Returns false when the available
 * credit (balance minus what is already reserved) is not enough.
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

/** Gives a reservation back without booking anything (provider error, aborted call). */
export function releaseMc(db: Db, address: string, mc: number): void {
  db.prepare("UPDATE wallets SET reserved_mc = max(0, reserved_mc - ?) WHERE address = ?").run(mc, address.toLowerCase());
}

/** Balance minus reservations in flight. That is what a new call may actually spend. */
export function getAvailableMc(db: Db, address: string): number {
  const row = db
    .prepare("SELECT balance_mc - reserved_mc AS available FROM wallets WHERE address = ?")
    .get(address.toLowerCase()) as { available: number } | undefined;
  return row?.available ?? 0;
}

/**
 * Clears out rows that only cost space. Without it `siwe_nonces` grows without bound on every call
 * to `/v1/auth/nonce`, and that path needs no API key (security review 19.09.2026). Returns how
 * many rows disappeared per table.
 *
 * Nonces stay as long as a signature can be valid, plus a buffer. Payments are only discarded in
 * state `failed`, and only old ones: `settled` is the receipt of a credit and is never deleted.
 */
export function cleanupExpired(db: Db, now = Date.now()): { nonces: number; sessions: number; payments: number } {
  const NONCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const FAILED_PAYMENT_MAX_AGE_DAYS = 30;
  const run = db.transaction(() => {
    const nonces = db.prepare("DELETE FROM siwe_nonces WHERE issued_at < ?").run(now - NONCE_MAX_AGE_MS).changes;
    const sessions = db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now).changes;
    const payments = db
      .prepare("DELETE FROM payments WHERE status = 'failed' AND created_at < ?")
      .run(new Date(now - FAILED_PAYMENT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString()).changes;
    return { nonces, sessions, payments };
  });
  return run();
}

/** Key-value store for small things that have to survive a restart. */
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
