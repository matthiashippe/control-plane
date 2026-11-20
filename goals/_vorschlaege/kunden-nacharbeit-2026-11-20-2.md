Schwere: 2
Goal: kunden 03
Befund: kunden 03 prüft `CP_UNTIL` im Block `runtime_funnel` mit einer zweiten Kopie der ISO-Prüfung aus dem Block `CP_REPORT=decline` (gleicher regulärer Ausdruck, `Date.parse`, Meldung auf stderr, Exit 1), statt die Funktion `iso` aus kunden 01 zu nutzen; lockert jemand eine der beiden Prüfungen, gelten für dasselbe `CP_UNTIL` in den beiden Berichten verschiedene Regeln.
Beleg: `git grep -n 'd{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?Z$/.test(' -- ops/db-report.cjs` -> `ops/db-report.cjs:272` und `ops/db-report.cjs:844` | ops/db-report.cjs:844
Empfehlung: `iso(name, fallback)` aus dem decline-Block an den Anfang von `ops/db-report.cjs` heben und im Block `runtime_funnel` mit dem Rückfall auf den Beginn der laufenden UTC-Stunde aufrufen; der Fall `stops with an exit other than 0 for an unreadable CP_UNTIL` in `test/runtime-funnel.test.ts` und `refuses a CP_SINCE that is no ISO time in UTC` in `test/customer-decline.test.ts` sichern beide Wege.
MVP: Schönheit
Verworfen: MVP Schönheit, beide ISO-Prüfungen sind durch Fälle in test/runtime-funnel.test.ts und test/customer-decline.test.ts gesichert (Loop-Triage PRO-25822) (2026-11-20)
