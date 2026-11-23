Schwere: 2
Goal: kunden 11
Befund: `ops/db-report.cjs` prüft die Hausberichte mit einer eigenen Kopie von `checkHouseReport`, mit den Grenzen 20 und 200 als feste Zahlen und einer eigenen Liste der Methoden, statt die Regel aus dem gebauten Dienst zu laden, wie dieselbe Datei es für `dist/credits/starter.js` schon tut; kein Test hält beide Fassungen gleich.
Beleg: `git grep -n -E 'calls.length > 20|path.length > 200|HOUSE_CALLS_MAX = |HOUSE_PATH_MAX = ' e423d4d -- ops src` -> `ops/db-report.cjs:553`, `ops/db-report.cjs:557`, `src/bounties/house.ts:44`, `src/bounties/house.ts:45` | ops/db-report.cjs:543
Empfehlung: `ops/db-report.cjs` lädt `checkHouseReport` aus `./dist/bounties/house.js` mit demselben Rückfall wie bei `starter.js` (Zeile 27), oder ein Test vergleicht beide Regeln an denselben gültigen und ungültigen Berichten.

Ändert ein Goal `HOUSE_CALLS_MAX` oder `HOUSE_PATH_MAX`, nimmt der Dienst Berichte an, die `ops/customer-work.sh` still nicht mehr zählt. Die Liste der Methoden steht ein drittes Mal in ops/customer-work.sh:60.

Übernommen: Watch List in STATE.md, beim nächsten Goal an ops/db-report.cjs oder an HOUSE_CALLS_MAX und HOUSE_PATH_MAX (2026-11-23)
