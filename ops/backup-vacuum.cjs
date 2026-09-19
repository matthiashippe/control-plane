// Erzeugt das tägliche Backup im laufenden cp-Container und prüft es, bevor es das Volume verlässt.
// Wird von ops/backup.sh eingespeist:
//   docker compose -f docker-compose.prod.yml exec -T cp node - < ops/backup-vacuum.cjs
// Lokal prüfbar mit CP_DB_PATH und CP_BACKUP_TMP (siehe test/backup.test.ts).
//
// Warum nicht einfach `cp cp.db`: Die Datenbank läuft im WAL-Modus. Die .db-Datei enthält den
// Stand des letzten Checkpoints, alles danach steht im -wal daneben. Bei dem Verkehr, den dieser
// Dienst hat, läuft tagelang kein Checkpoint: Eine Kopie der .db allein ist dann eine Datenbank
// mit vollständigem Schema und null Zeilen, die `PRAGMA integrity_check` für in Ordnung hält.
// `VACUUM INTO` schreibt dagegen einen konsistenten Snapshot aus der laufenden Anwendung heraus.
const fs = require("node:fs");
const Database = require("better-sqlite3");

const quellPfad = process.env.CP_DB_PATH || "/data/cp.db";
const zielPfad = process.env.CP_BACKUP_TMP || "/data/backup-tmp.db";

// Reste eines abgebrochenen Laufs wegräumen. Ohne das scheitert VACUUM INTO mit "output file
// already exists", und zwar ab dann jeden Tag: Ein einziger fehlgeschlagener Abtransport legt
// das Backup dauerhaft still.
for (const p of [zielPfad, `${zielPfad}-wal`, `${zielPfad}-shm`]) fs.rmSync(p, { force: true });

const quelle = new Database(quellPfad, { readonly: true, fileMustExist: true });
const zaehle = (db) => ({
  wallets: db.prepare("SELECT count(*) n FROM wallets").get().n,
  ledger: db.prepare("SELECT count(*) n FROM ledger").get().n,
  settled: db.prepare("SELECT count(*) n FROM payments WHERE status = 'settled'").get().n,
  keys: db.prepare("SELECT count(*) n FROM api_keys").get().n,
  automatons: db.prepare("SELECT count(*) n FROM automatons").get().n,
  balance_mc: db.prepare("SELECT coalesce(sum(balance_mc), 0) n FROM wallets").get().n,
});
const vorher = zaehle(quelle);

const t0 = Date.now();
quelle.exec(`VACUUM INTO ('${zielPfad.replace(/'/g, "''")}')`);
const dauerMs = Date.now() - t0;
quelle.close();

// Das Backup prüft sich selbst, solange es noch im Volume liegt. Ein Fehler hier ist besser als
// eine Datei im Bestand, die erst beim Zurückspielen auffällt.
const kopie = new Database(zielPfad, { readonly: true, fileMustExist: true });
const nachher = zaehle(kopie);
const integrity = kopie.prepare("PRAGMA integrity_check").get().integrity_check;
const schief = kopie
  .prepare(`SELECT count(*) n FROM wallets w
            LEFT JOIN (SELECT address, sum(delta_mc) s FROM ledger GROUP BY address) l ON l.address = w.address
            WHERE w.balance_mc <> coalesce(l.s, 0)`)
  .get().n;
kopie.close();

const bytes = fs.statSync(zielPfad).size;
const probleme = [];
if (integrity !== "ok") probleme.push(`integrity_check: ${integrity}`);
if (schief > 0) probleme.push(`${schief} Wallet(s) ohne passende Ledgersumme`);
// Wallets, Ledgerzeilen und settled-Zahlungen werden nie gelöscht, also darf das Backup davon
// nicht weniger enthalten als die Quelle vor dem Lauf. Genau das fängt die leere Kopie, die eine
// reine Größenschwelle durchlässt: Das Schema allein wiegt schon rund 80 KB.
for (const feld of ["wallets", "ledger", "settled", "keys", "automatons"]) {
  if (nachher[feld] < vorher[feld]) probleme.push(`${feld}: ${nachher[feld]} im Backup, ${vorher[feld]} in der Quelle`);
}

console.log(JSON.stringify({ datei: zielPfad, bytes, dauer_ms: dauerMs, ...nachher, integrity_check: integrity, probleme }));
if (probleme.length) {
  console.error(`Backup unbrauchbar: ${probleme.join("; ")}`);
  process.exit(1);
}
