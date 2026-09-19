// Prüft eine zurückgespielte SQLite, bevor der Dienst wieder darauf startet.
//
// Lokal:       node ops/restore-pruefen.cjs /pfad/zur/cp.db
// Im Container: docker compose -f docker-compose.prod.yml exec -T cp node - < ops/restore-pruefen.cjs
//
// Ausgabe: je Prüfung eine Zeile, am Ende eine JSON-Zusammenfassung. Exit 1, sobald eine Prüfung
// fehlschlägt. Die Datei wird nur gelesen (readonly), auch der Schema-Abgleich schreibt nichts.
const Database = require("better-sqlite3");

const pfad = process.argv[2] || process.env.CP_DB_PATH || "/data/cp.db";
const db = new Database(pfad, { readonly: true, fileMustExist: true });
const one = (sql, ...a) => db.prepare(sql).get(...a);
const all = (sql, ...a) => db.prepare(sql).all(...a);

let fehler = 0;
const ergebnis = { datei: pfad };
function pruefe(name, ok, detail) {
  console.log(`${ok ? "ok  " : "FEHL"}  ${name}${detail ? `: ${detail}` : ""}`);
  if (!ok) fehler++;
}

// 1. Ist die Datei überhaupt heil? Ein halb kopiertes Backup fällt hier auf, nicht erst im Betrieb.
const integrity = one("PRAGMA integrity_check").integrity_check;
ergebnis.integrity_check = integrity;
pruefe("integrity_check", integrity === "ok", integrity);

const fk = all("PRAGMA foreign_key_check");
ergebnis.foreign_key_violations = fk.length;
pruefe("foreign_key_check", fk.length === 0, `${fk.length} Verletzungen`);

// 2. Schema-Stand. Ein Backup, das älter ist als die letzte Migration, kennt diese Spalten nicht.
// Das ist kein Abbruchgrund: openDb() migriert beim Start. Es muss nur jemand wissen.
const spalten = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
const tabellen = all("SELECT name FROM sqlite_master WHERE type='table'").map((r) => r.name);
const fehlend = [];
if (!spalten("wallets").includes("reserved_mc")) fehlend.push("wallets.reserved_mc");
if (!spalten("payments").includes("balance_after_mc")) fehlend.push("payments.balance_after_mc");
if (!tabellen.includes("kv")) fehlend.push("kv");
ergebnis.schema_fehlt = fehlend;
if (fehlend.length) {
  console.log(`hinw  Schema älter als der Code: ${fehlend.join(", ")} fehlt. openDb() ergänzt das beim Start.`);
} else {
  pruefe("Schema aktuell", true);
}

// 3. Die eigentliche Frage: Deckt sich jede Wallet mit ihren Ledgerzeilen? Jede Saldo-Änderung ist
// genau eine Ledgerzeile in derselben Transaktion, also muss die Summe exakt stimmen. Tut sie es
// nicht, war der Snapshot nicht konsistent und das Backup ist wertlos.
const schief = all(`
  SELECT w.address, w.balance_mc, coalesce(l.s, 0) AS ledger_sum_mc
  FROM wallets w
  LEFT JOIN (SELECT address, sum(delta_mc) AS s FROM ledger GROUP BY address) l ON l.address = w.address
  WHERE w.balance_mc <> coalesce(l.s, 0)
`);
const summen = one("SELECT count(*) n, coalesce(sum(balance_mc),0) s FROM wallets");
const ledgerSumme = one("SELECT count(*) n, coalesce(sum(delta_mc),0) s FROM ledger");
ergebnis.wallets = summen.n;
ergebnis.balance_mc = summen.s;
ergebnis.ledger_rows = ledgerSumme.n;
ergebnis.ledger_sum_mc = ledgerSumme.s;
pruefe("balance_mc == ledger_sum_mc je Wallet", schief.length === 0,
  schief.length ? schief.map((r) => `${r.address} ${r.balance_mc} vs ${r.ledger_sum_mc}`).join("; ") : `${summen.n} Wallets, ${summen.s} mc`);
pruefe("Summe über alle Wallets", summen.s === ledgerSumme.s, `${summen.s} mc vs ${ledgerSumme.s} mc im Ledger`);

// 4. Zahlungen. `settled` ist der Beleg für eine Gutschrift: Jede muss ihre topup-Ledgerzeile
// haben, sonst hat jemand bezahlt und keine Credits bekommen.
const zahlungen = {};
for (const r of all("SELECT status, count(*) n FROM payments GROUP BY status")) zahlungen[r.status] = r.n;
ergebnis.payments = zahlungen;
const ohneBuchung = all(`
  SELECT p.nonce FROM payments p
  WHERE p.status = 'settled' AND NOT EXISTS (SELECT 1 FROM ledger l WHERE l.kind = 'topup' AND l.ref = p.nonce)
`);
ergebnis.settled_ohne_buchung = ohneBuchung.length;
pruefe("jede settled-Zahlung hat ihre topup-Zeile", ohneBuchung.length === 0,
  ohneBuchung.length ? ohneBuchung.map((r) => r.nonce).join(", ") : `${zahlungen.settled || 0} settled`);

const doppelt = all("SELECT ref, count(*) n FROM ledger WHERE kind='topup' AND ref IS NOT NULL GROUP BY ref HAVING n > 1");
ergebnis.doppelte_topups = doppelt.length;
pruefe("keine doppelte Gutschrift je x402-Nonce", doppelt.length === 0,
  doppelt.map((r) => `${r.ref} (${r.n}x)`).join(", "));

// 5. Bestände, die beim ersten Start wieder verschwinden: Das Backup kommt aus dem laufenden
// Betrieb, also stehen dort Reservierungen und `pending`-Zahlungen von Requests, die es nicht
// mehr gibt. openDb() setzt beides zurück, pending wird zu failed. Wer zählt, zählt vorher.
ergebnis.offene_reservierungen = spalten("wallets").includes("reserved_mc")
  ? one("SELECT count(*) n FROM wallets WHERE reserved_mc <> 0").n : null;
ergebnis.pending_payments = zahlungen.pending || 0;
if (ergebnis.offene_reservierungen || ergebnis.pending_payments) {
  console.log(`hinw  ${ergebnis.offene_reservierungen} Wallet(s) mit Reservierung, ${ergebnis.pending_payments} Zahlung(en) in 'pending'. ` +
    `Der erste Start setzt Reservierungen auf 0 und 'pending' auf 'failed' und protokolliert jede davon.`);
}

ergebnis.keys = one("SELECT count(*) n FROM api_keys WHERE revoked_at IS NULL").n;
ergebnis.automatons = one("SELECT count(*) n FROM automatons").n;
ergebnis.fehler = fehler;
console.log(JSON.stringify(ergebnis));
process.exit(fehler ? 1 : 0);
