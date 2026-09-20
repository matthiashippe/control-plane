// Checks a restored SQLite before the service starts on it again.
//
// Locally:          node ops/restore-pruefen.cjs /path/to/cp.db
// In the container: docker compose -f docker-compose.prod.yml exec -T cp node - < ops/restore-pruefen.cjs
//
// Output: one line per check, a JSON summary at the end. Exit 1 as soon as one check fails. The
// file is only read (readonly); the schema comparison writes nothing either.
const Database = require("better-sqlite3");

const path = process.argv[2] || process.env.CP_DB_PATH || "/data/cp.db";
const db = new Database(path, { readonly: true, fileMustExist: true });
const one = (sql, ...a) => db.prepare(sql).get(...a);
const all = (sql, ...a) => db.prepare(sql).all(...a);

let failures = 0;
const result = { file: path };
function check(name, ok, detail) {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`);
  if (!ok) failures++;
}

// 1. Is the file intact at all? A half-copied backup shows up here, not later in production.
const integrity = one("PRAGMA integrity_check").integrity_check;
result.integrity_check = integrity;
check("integrity_check", integrity === "ok", integrity);

const fk = all("PRAGMA foreign_key_check");
result.foreign_key_violations = fk.length;
check("foreign_key_check", fk.length === 0, `${fk.length} violations`);

// 2. Schema level. A backup older than the last migration does not know these columns. That is no
// reason to abort: openDb() migrates on start. Somebody just has to know.
const columns = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
const tables = all("SELECT name FROM sqlite_master WHERE type='table'").map((r) => r.name);
const missing = [];
if (!columns("wallets").includes("reserved_mc")) missing.push("wallets.reserved_mc");
if (!columns("payments").includes("balance_after_mc")) missing.push("payments.balance_after_mc");
if (!tables.includes("kv")) missing.push("kv");
result.schema_missing = missing;
if (missing.length) {
  console.log(`note  schema older than the code: ${missing.join(", ")} missing. openDb() adds that on start.`);
} else {
  check("schema up to date", true);
}

// 3. The real question: does every wallet match its ledger rows? Every balance change is exactly
// one ledger row in the same transaction, so the sum has to match exactly. If it does not, the
// snapshot was not consistent and the backup is worthless.
const mismatched = all(`
  SELECT w.address, w.balance_mc, coalesce(l.s, 0) AS ledger_sum_mc
  FROM wallets w
  LEFT JOIN (SELECT address, sum(delta_mc) AS s FROM ledger GROUP BY address) l ON l.address = w.address
  WHERE w.balance_mc <> coalesce(l.s, 0)
`);
const totals = one("SELECT count(*) n, coalesce(sum(balance_mc),0) s FROM wallets");
const ledgerTotals = one("SELECT count(*) n, coalesce(sum(delta_mc),0) s FROM ledger");
result.wallets = totals.n;
result.balance_mc = totals.s;
result.ledger_rows = ledgerTotals.n;
result.ledger_sum_mc = ledgerTotals.s;
check("balance_mc == ledger_sum_mc per wallet", mismatched.length === 0,
  mismatched.length ? mismatched.map((r) => `${r.address} ${r.balance_mc} vs ${r.ledger_sum_mc}`).join("; ") : `${totals.n} wallets, ${totals.s} mc`);
check("sum across all wallets", totals.s === ledgerTotals.s, `${totals.s} mc vs ${ledgerTotals.s} mc in the ledger`);

// 4. Payments. `settled` is the receipt of a credit: every one of them must have its topup ledger
// row, otherwise somebody paid and got no credits.
const payments = {};
for (const r of all("SELECT status, count(*) n FROM payments GROUP BY status")) payments[r.status] = r.n;
result.payments = payments;
const unbooked = all(`
  SELECT p.nonce FROM payments p
  WHERE p.status = 'settled' AND NOT EXISTS (SELECT 1 FROM ledger l WHERE l.kind = 'topup' AND l.ref = p.nonce)
`);
result.settled_without_booking = unbooked.length;
check("every settled payment has its topup row", unbooked.length === 0,
  unbooked.length ? unbooked.map((r) => r.nonce).join(", ") : `${payments.settled || 0} settled`);

const duplicates = all("SELECT ref, count(*) n FROM ledger WHERE kind='topup' AND ref IS NOT NULL GROUP BY ref HAVING n > 1");
result.duplicate_topups = duplicates.length;
check("no duplicate credit per x402 nonce", duplicates.length === 0,
  duplicates.map((r) => `${r.ref} (${r.n}x)`).join(", "));

// 5. State that disappears again on the first start: the backup comes out of running production,
// so it carries reservations and `pending` payments of requests that no longer exist. openDb()
// resets both, pending becomes failed. Whoever counts, counts beforehand.
result.open_reservations = columns("wallets").includes("reserved_mc")
  ? one("SELECT count(*) n FROM wallets WHERE reserved_mc <> 0").n : null;
result.pending_payments = payments.pending || 0;
if (result.open_reservations || result.pending_payments) {
  console.log(`note  ${result.open_reservations} wallet(s) with a reservation, ${result.pending_payments} payment(s) in 'pending'. ` +
    `The first start sets reservations to 0 and 'pending' to 'failed' and logs every one of them.`);
}

result.keys = one("SELECT count(*) n FROM api_keys WHERE revoked_at IS NULL").n;
result.automatons = one("SELECT count(*) n FROM automatons").n;
result.failures = failures;
console.log(JSON.stringify(result));
process.exit(failures ? 1 : 0);
