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

    -- A card payment on its way, behind CP_CHECKOUT and unreachable while that is off.
    --
    -- The amount lives HERE and never in the callback. A provider's callback says which payment it
    -- is talking about; what that payment was for is what we wrote down when we started it. Taking
    -- the amount from the callback is how a forged one credits any balance it likes, and it is the
    -- single most expensive mistake available on this path.
    --
    -- A row is either credits for a wallet (address) or a catalogue offer bought by a person who has
    -- no wallet (offer, Goal 20). Keep this definition and CHECKOUTS_V2 below identical.
    CREATE TABLE IF NOT EXISTS checkouts (
      reference  TEXT PRIMARY KEY,               -- what the provider echoes back
      address    TEXT REFERENCES wallets(address),
      cents      INTEGER NOT NULL,
      provider   TEXT NOT NULL,                  -- fake | stripe_test | stripe
      status     TEXT NOT NULL,                  -- pending | paid | abandoned
      created_at TEXT NOT NULL,
      settled_at TEXT,
      offer      TEXT,                           -- id from OFFERS in src/public/catalog.ts
      CHECK (address IS NOT NULL OR offer IS NOT NULL)
    );
    CREATE INDEX IF NOT EXISTS checkouts_address ON checkouts(address, created_at);

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

    -- Every read of GET /v1/credits/balance by an address, counted. Not analytics: it is the only
    -- evidence this service has that a runtime is up, pointed at us, and waiting for money it
    -- cannot ask for. Measured on 2026-09-22: a Korean operator provisioned at 02:05 UTC, polled
    -- this one endpoint twenty-six times between 04:01 and 04:07 with a balance of zero, and left.
    -- The starter grant that would have started them was sitting one call away behind a door only
    -- a human reading the answer could open. See grantToWaitingRuntime() in credits/starter.ts.
    CREATE TABLE IF NOT EXISTS balance_polls (
      address  TEXT PRIMARY KEY,
      n        INTEGER NOT NULL,
      first_at TEXT NOT NULL,
      last_at  TEXT NOT NULL
    );

    -- Posted bounties. The price is already charged against the buyer's balance when the bounty
    -- goes up and is fixed as a bounty_hold ledger row; the price_mc column only says how much
    -- goes back to the buyer or over to the winner.
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

    -- Was der Kaeufer zu einer Lieferung sagt, damit sie ueberarbeitet werden kann.
    --
    -- Matthias am 29.09.: "meine mutter moechte eine website haben, wuerde ihr briefing da
    -- eintragen und bekommt dann eine website geliefert fuer 100 oder 300 euro, kann aus allen
    -- lieferungen aussuchen, und dann gibts noch agent driven 2 3 4 iterationsrunden, alle via
    -- text eingerichtet damit die agents das direkt umsetzen koennen."
    --
    -- Bis dahin war eine Lieferung endgueltig: submissions_once liess je Agent und Auftrag
    -- genau eine zu, und es gab keinen Weg, etwas dazu zu sagen. Ein Kaeufer konnte nur annehmen
    -- oder nichts tun. Fuer einen Text von 45 Cent ging das; fuer eine Website von 300 Euro ist
    -- eine Runde Rueckmeldung der ganze Unterschied zwischen brauchbar und weggeworfen.
    --
    -- Nur Text, ausdruecklich. Der Empfaenger ist eine Maschine, die es direkt umsetzen soll.
    CREATE TABLE IF NOT EXISTS feedback (
      id            TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES submissions(id),
      author        TEXT NOT NULL REFERENCES wallets(address),
      body          TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS feedback_submission ON feedback(submission_id, id);
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

  // The commission a bounty was posted under, written down at posting.
  //
  // It used to be read from `FEE_PERCENT` at AWARD time, so changing the figure would have
  // silently changed the payout of every job already on the board. `/bounties.json` publishes
  // `award_cents` for each open job and the pages promise "the winner is credited the price minus
  // the fee", so an agent that read 135 and then received 120 would have been told one number and
  // paid another. That is not a pricing change, it is a broken promise, and it is the reason the
  // commission could not be touched at all.
  //
  // Existing rows take 10, which is what they were actually posted under: the figure has never
  // been anything else since the table exists (src/bounties/store.ts, FEE_PERCENT = 10 since
  // 2026-09-20). Backfilling them with today's constant instead would rewrite history the moment
  // the constant moves, which is the same bug one layer down.
  // Runden. Eine Ueberarbeitung ist eine neue Zeile, die auf die alte zeigt, und nicht ein
  // Ueberschreiben: der Kaeufer soll sehen koennen, was sich geaendert hat, und die Rueckmeldung
  // haengt an der Fassung, auf die sie sich bezieht.
  const subColumns = db.prepare("PRAGMA table_info(submissions)").all() as { name: string }[];
  if (subColumns.length > 0 && !subColumns.some((c) => c.name === "round")) {
    db.exec("ALTER TABLE submissions ADD COLUMN round INTEGER NOT NULL DEFAULT 1");
    db.exec("ALTER TABLE submissions ADD COLUMN revises TEXT");
    // Der alte Index liess eine Zeile je Agent und Auftrag zu und ist damit genau die Sperre
    // gegen Runden. Der neue laesst eine je Runde zu, was dieselbe Zusage fuer jede Runde ist.
    db.exec("DROP INDEX IF EXISTS submissions_once");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS submissions_once_per_round ON submissions(bounty_id, agent, round)");
  }

  if (bountyColumns.length > 0 && !bountyColumns.some((c) => c.name === "fee_percent")) {
    db.exec("ALTER TABLE bounties ADD COLUMN fee_percent INTEGER NOT NULL DEFAULT 10");
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
  // One starter grant per address, ever, enforced by the database rather than by a check in front
  // of the insert. Two simultaneous calls would otherwise both pass the check and the service would
  // give the same wallet its stake twice.
  //
  // In its own statement, deliberately: it used to sit in the same try block as the topup index
  // below, and that index cannot be created on a database that already carries duplicate credits.
  // A database in exactly the state one bug produces therefore silently lost the defence against
  // an unrelated one.
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS ledger_grant_once ON ledger(address) WHERE kind = 'grant'");

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

  migrateCheckoutsV2(db);

  // What a buyer said they need and where to reach them (Goal 21, 2026-09-29). A table of its own
  // rather than two columns on `checkouts`: SQLite cannot add a NOT NULL column without a default
  // to a table that has rows, and the twelve test rows in production on 2026-09-29 have neither.
  // The CHECKs hold the rule even for a later code path that forgets to validate. `brief` is JSON
  // with the offer's fields (HAN-24), so the minimums per field live in OFFERS, not here.
  // The rows are deleted on a schedule set by Recht (HAN-26), see `cleanupOrderBriefs`.
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_briefs (
      reference  TEXT PRIMARY KEY REFERENCES checkouts(reference),
      brief      TEXT NOT NULL CHECK (json_valid(brief) AND json_type(brief) = 'object'),  -- the offer's fields
      email      TEXT NOT NULL CHECK (email LIKE '%_@_%._%'),
      created_at TEXT NOT NULL
    );
  `);

  // The key to the page that shows the texts (HAN-67). Random, 256 bits, set when the order starts,
  // so the page Stripe sends the buyer back to can link to it before anything is written. It is the
  // only thing in that URL: no email, no name (blocklist 7). Rows from before this column have none
  // and get no page.
  const briefCols = db.prepare("PRAGMA table_info(order_briefs)").all() as { name: string }[];
  if (!briefCols.some((c) => c.name === "token")) db.exec("ALTER TABLE order_briefs ADD COLUMN token TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS order_briefs_token ON order_briefs(token) WHERE token IS NOT NULL");

  // One row per paid order that is being or has been written (Goal 23, point 1; HAN-67). `body` is
  // the texts as JSON and is emptied with the brief (`cleanupOrderBriefs`); the rest names no person
  // and stays for the report. `error` is a code, never text from the order. `written_at` is set once.
  db.exec(`
    CREATE TABLE IF NOT EXISTS deliveries (
      reference  TEXT PRIMARY KEY REFERENCES checkouts(reference),
      status     TEXT NOT NULL CHECK (status IN ('claimed', 'written', 'sent', 'failed')),
      attempts   INTEGER NOT NULL DEFAULT 0,
      claimed_at TEXT NOT NULL,
      written_at TEXT,
      sent_at    TEXT,
      message_id TEXT,
      versions   INTEGER NOT NULL DEFAULT 0,
      body       TEXT,
      upstreams  TEXT,
      cost_mc    INTEGER NOT NULL DEFAULT 0,
      error      TEXT
    );
  `);

  // The conversation that asks back (HAN-77). `fields` is what was understood so far, `turns` the
  // transcript; both are a person's words and are deleted after a day (`cleanupConversations` in
  // src/checkout/conversation.ts). `conversation_days` counts model calls and their cost per UTC
  // day, which is what the daily cap reads; it names nobody.
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id         TEXT PRIMARY KEY,
      offer      TEXT NOT NULL,
      fields     TEXT NOT NULL CHECK (json_valid(fields) AND json_type(fields) = 'object'),
      turns      TEXT NOT NULL CHECK (json_valid(turns) AND json_type(turns) = 'array'),
      asked      TEXT,
      questions  INTEGER NOT NULL DEFAULT 0,
      calls      INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversation_days (
      day     TEXT PRIMARY KEY,
      calls   INTEGER NOT NULL DEFAULT 0,
      cost_mc INTEGER NOT NULL DEFAULT 0
    );
  `);

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

const CHECKOUTS_V2 = `
    CREATE TABLE checkouts_v2 (
      reference  TEXT PRIMARY KEY,
      address    TEXT REFERENCES wallets(address),
      cents      INTEGER NOT NULL,
      provider   TEXT NOT NULL,
      status     TEXT NOT NULL,
      created_at TEXT NOT NULL,
      settled_at TEXT,
      offer      TEXT,
      CHECK (address IS NOT NULL OR offer IS NOT NULL)
    )`;

/**
 * Makes `checkouts.address` nullable and adds `offer` (Goal 20, 2026-09-29).
 *
 * A person paying for a catalogue offer has no wallet, so the row has no address. SQLite cannot
 * drop NOT NULL with ALTER, so the table is rebuilt, copied and renamed in one transaction. It runs
 * only while `address` is still NOT NULL, which makes a second start a no-op. Production had zero
 * rows in `checkouts` on 2026-09-29, so the copy moves nothing there; the test moves one anyway.
 */
export function migrateCheckoutsV2(db: Db): boolean {
  const cols = db.prepare("PRAGMA table_info(checkouts)").all() as { name: string; notnull: number }[];
  const address = cols.find((c) => c.name === "address");
  if (!address || address.notnull !== 1) return false;
  db.transaction(() => {
    db.exec(CHECKOUTS_V2);
    db.exec(
      `INSERT INTO checkouts_v2 (reference, address, cents, provider, status, created_at, settled_at)
         SELECT reference, address, cents, provider, status, created_at, settled_at FROM checkouts`,
    );
    db.exec("DROP TABLE checkouts");
    db.exec("ALTER TABLE checkouts_v2 RENAME TO checkouts");
    db.exec("CREATE INDEX IF NOT EXISTS checkouts_address ON checkouts(address, created_at)");
  })();
  return true;
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
    | "bounty_hold" | "bounty_release" | "bounty_award" | "bounty_fee"
    // grant_returned is negative and only ever cancels a job-scoped grant whose job ended without
    // an award. It is a separate kind because the unique index that makes "one grant per address,
    // ever" true is scoped to kind = 'grant' and would refuse a second row there.
    | "grant" | "grant_returned";
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
  // A charge that does not settle a reservation must not reach into what a call in flight has
  // already reserved. Without this the buyer path could spend the credit an inference was holding
  // (`bounty_hold` charges against `balance_mc` alone): the provider call then booked
  // `min(cost, balance) = 0`, the bounty was cancelled straight afterwards, and the wallet came
  // out of it whole with an answer the operator had paid a provider for. Repeatable as often as
  // you like, and the books stayed consistent throughout, which is why no sum caught it.
  //
  // The inference booking itself is the opposite case: the money is already spent upstream, so it
  // settles against its own reservation and against everything else the wallet still holds.
  // `releaseReservedMc` is what tells the two apart.
  const againstReserved = entry.deltaMc < 0 && !entry.releaseReservedMc ? 1 : 0;
  const run = db.transaction(() => {
    ensureWallet(db, address);
    const res = db
      .prepare(
        "UPDATE wallets SET balance_mc = balance_mc + ? " +
          "WHERE address = ? AND balance_mc + ? - (CASE WHEN ? = 1 THEN reserved_mc ELSE 0 END) >= 0",
      )
      .run(entry.deltaMc, address, entry.deltaMc, againstReserved);
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

/** Days an unpaid order's brief and email are kept, counted from `order_briefs.created_at`. */
export const UNPAID_BRIEF_DAYS = 30;
/** Days a paid order's brief and email are kept, counted from `checkouts.settled_at`. */
export const PAID_BRIEF_DAYS = 120;

/**
 * Deletes what a buyer typed once there is no reason left to keep it (HAN-26, 2026-09-29).
 *
 * The periods are Recht's and are published on /datenschutz, so the page and this function have to
 * agree (test/order-brief.test.ts). Unpaid: 30 days, which is also the window of
 * `order_briefs_30d`, so the number stays readable. Paid: 120 days after the payment, which covers
 * withdrawal, the rounds of changes and a chargeback, where the brief is the proof of what was
 * ordered. The same for `stripe` and `stripe_test`, because a test payment still carries a real
 * person's address. `checkouts` stays: it names no person.
 */
export function cleanupOrderBriefs(db: Db, now = Date.now()): number {
  const day = 24 * 60 * 60 * 1000;
  // The texts were written from the brief and go with it (Goal 23, point 1). Same period, counted
  // from the payment; the delivery row itself stays, it names nobody.
  db.prepare(
    `UPDATE deliveries SET body = NULL WHERE body IS NOT NULL AND reference IN (
       SELECT reference FROM checkouts WHERE status = 'paid' AND settled_at < ?
     )`,
  ).run(new Date(now - PAID_BRIEF_DAYS * day).toISOString());
  return db
    .prepare(
      `DELETE FROM order_briefs WHERE reference IN (
         SELECT b.reference FROM order_briefs b JOIN checkouts c USING (reference)
          WHERE (c.status != 'paid' AND b.created_at < ?)
             OR (c.status = 'paid' AND c.settled_at < ?)
       )`,
    )
    .run(new Date(now - UNPAID_BRIEF_DAYS * day).toISOString(), new Date(now - PAID_BRIEF_DAYS * day).toISOString())
    .changes;
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
