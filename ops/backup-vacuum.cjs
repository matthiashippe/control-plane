// Creates the daily backup inside the running cp container and checks it before it leaves the
// volume. Fed in by ops/backup.sh:
//   docker compose -f docker-compose.prod.yml exec -T cp node - < ops/backup-vacuum.cjs
// Testable locally with CP_DB_PATH and CP_BACKUP_TMP (see test/backup.test.ts).
//
// Why not simply `cp cp.db`: the database runs in WAL mode. The .db file holds the state of the
// last checkpoint, everything after it sits in the -wal next to it. At the traffic this service
// has, no checkpoint runs for days: a copy of the .db alone is then a database with a complete
// schema and zero rows, which `PRAGMA integrity_check` considers fine. `VACUUM INTO`, by contrast,
// writes a consistent snapshot out of the running application.
const fs = require("node:fs");
const Database = require("better-sqlite3");

const sourcePath = process.env.CP_DB_PATH || "/data/cp.db";
const targetPath = process.env.CP_BACKUP_TMP || "/data/backup-tmp.db";

// Clear out the leftovers of an aborted run. Without that, VACUUM INTO fails with "output file
// already exists", and from then on every single day: one failed transfer silences the backup for
// good.
for (const p of [targetPath, `${targetPath}-wal`, `${targetPath}-shm`]) fs.rmSync(p, { force: true });

const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
const count = (db) => ({
  wallets: db.prepare("SELECT count(*) n FROM wallets").get().n,
  ledger: db.prepare("SELECT count(*) n FROM ledger").get().n,
  settled: db.prepare("SELECT count(*) n FROM payments WHERE status = 'settled'").get().n,
  keys: db.prepare("SELECT count(*) n FROM api_keys").get().n,
  automatons: db.prepare("SELECT count(*) n FROM automatons").get().n,
  balance_mc: db.prepare("SELECT coalesce(sum(balance_mc), 0) n FROM wallets").get().n,
});
const before = count(source);

const t0 = Date.now();
source.exec(`VACUUM INTO ('${targetPath.replace(/'/g, "''")}')`);
const durationMs = Date.now() - t0;
source.close();

// The backup checks itself while it is still in the volume. An error here is better than a file in
// the set that only shows up when it is restored.
const copy = new Database(targetPath, { readonly: true, fileMustExist: true });
const after = count(copy);
const integrity = copy.prepare("PRAGMA integrity_check").get().integrity_check;
const mismatched = copy
  .prepare(`SELECT count(*) n FROM wallets w
            LEFT JOIN (SELECT address, sum(delta_mc) s FROM ledger GROUP BY address) l ON l.address = w.address
            WHERE w.balance_mc <> coalesce(l.s, 0)`)
  .get().n;
copy.close();

const bytes = fs.statSync(targetPath).size;
const problems = [];
if (integrity !== "ok") problems.push(`integrity_check: ${integrity}`);
if (mismatched > 0) problems.push(`${mismatched} wallet(s) without a matching ledger sum`);
// Wallets, ledger rows and settled payments are never deleted, so the backup must not contain
// fewer of them than the source did before the run. That is exactly what catches the empty copy a
// pure size threshold lets through: the schema alone weighs around 80 KB.
for (const field of ["wallets", "ledger", "settled", "keys", "automatons"]) {
  if (after[field] < before[field]) problems.push(`${field}: ${after[field]} in the backup, ${before[field]} in the source`);
}

console.log(JSON.stringify({ file: targetPath, bytes, duration_ms: durationMs, ...after, integrity_check: integrity, problems }));
if (problems.length) {
  console.error(`backup unusable: ${problems.join("; ")}`);
  process.exit(1);
}
