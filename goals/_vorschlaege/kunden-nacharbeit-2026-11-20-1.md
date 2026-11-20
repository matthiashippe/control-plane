Schwere: 2
Goal: kunden 02
Befund: kunden 02 kopiert für `CP_REPORT=wallets` die Schreibschleife des Blocks `CP_REPORT=decline` aus kunden 01 (Kommentar, `Buffer.from`, `writeSync` mit Offset, Wiederholung bei `EAGAIN`) Zeile für Zeile, statt eine gemeinsame Funktion zu nutzen; eine Korrektur an einer Kopie erreicht die andere nicht.
Beleg: `git grep -c 'off += require("fs").writeSync(1, out, off, out.length - off);' -- ops/db-report.cjs` -> `ops/db-report.cjs:2`; `diff <(sed -n 312,321p ops/db-report.cjs) <(sed -n 369,378p ops/db-report.cjs)` -> nur die Zeile mit `JSON.stringify(...)` unterscheidet sich | ops/db-report.cjs:369
Empfehlung: Vor dem ersten `CP_REPORT`-Block eine Funktion `writeJsonAndExit(obj)` anlegen (Schleife mit `EAGAIN`, dann `process.exit(0)`) und beide Blöcke darauf umstellen; die Tests `test/customer-decline.test.ts` und `test/conway-payers.test.ts` prüfen die Ausgabe beider Blöcke schon.
MVP: Schönheit
