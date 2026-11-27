Schwere: 1
Goal: kunden 14
Befund: kunden 14 bringt `ops/customer-work.sh` von 493 auf 516 Zeilen, und keine Commit-Message des Goal-Branches begründet die Größe über 500 Zeilen.
Beleg: `git show 6eb1531^1:ops/customer-work.sh | wc -l; git show 6eb1531:ops/customer-work.sh | wc -l; git log --format=%B 6eb1531^1..6eb1531^2 | grep -c -i -E '500|zeilen|größe|customer-work\.sh'` -> `493`, `516`, `0` | ops/customer-work.sh:275
Empfehlung: Den Selbsttest (`--selftest`, `ops/customer-work.sh:275` bis `:458`) samt `PLANT_STEPS_JS` (`:231` bis `:273`) in eine eigene Datei `ops/customer-work-selftest.sh` legen, die das Skript mit seinen Schaltern aufruft. Dann bleibt `ops/customer-work.sh` unter 500 Zeilen. Sonst die Größe in der nächsten Commit-Message an der Datei begründen.
MVP: Schönheit

Linse Q, Frage 6. `ops/db-report.cjs` lag schon vor dem Goal über 500 Zeilen und zählt hier nicht; dieselbe Klasse wurde mehrfach verworfen (kunden-nacharbeit-2026-11-21-5) und einmal in die Watch List übernommen (reichweite-nacharbeit-2026-11-25-2).
Übernommen: Tech Lead, PRO-31352 Glied 8, beim nächsten Goal an der Datei, Watch List in STATE.md (2026-11-27)
