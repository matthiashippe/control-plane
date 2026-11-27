Schwere: 1
Goal: kunden 14
Befund: Die Grenzen von `HOUSE STEP USE` hat kein Fall: Weder der Selbsttest noch die Fixture pflanzt eine Zeile `inference` des Kunden zur selben Millisekunde wie sein Schrittguthaben oder genau auf `--until`, also bleiben `t >= stepAt` und `t <= ms(until)` statt der strengen Vergleiche in `ops/db-report.cjs:607` grün.
Beleg: `git grep -n -E '2026-11-14T07:00:00|2026-11-16T00:00:00|2026-11-17T00:00:00' origin/dev -- ops/fixtures/customer-work-plant.mts ops/customer-work.sh test/customer-work.test.ts` -> nur `ops/customer-work.sh:265` (das Schrittguthaben selbst) und `:287` (die Grenzen S, U, U3), keine Zeile `inference` darauf; die Zeilen des Kunden liegen bei 06:30 (`:264`) und 16T03:00 (`:267`) | ops/db-report.cjs:607
Empfehlung: In `PLANT_STEPS_JS` je eine Zeile `inference` des Kunden genau auf `2026-11-14T07:00:00.000Z` und genau auf `2026-11-16T00:00:00.000Z` pflanzen (Erwartung bleibt 2). Dazu in `test/customer-work.test.ts` zwei Fälle mit `failsWithReport`, die `t > stepAt` gegen `t >= stepAt` und `t < ms(until)` gegen `t <= ms(until)` tauschen und `FAIL step use` erwarten.
MVP: Schönheit

Linse Q, Frage 1. Die drei neuen Mutationsfälle in `test/customer-work.test.ts` nehmen nur eine Grenze ganz weg, keiner verschiebt sie um den Randfall; Linse K nennt das im Verdict `goals/kunden/verdicts/14-z3-K.md:40` als Kandidaten für die Nacharbeit (hier gelesen, nicht ausgeführt: kein `node_modules` im Checkout).
Übernommen: Tech Lead, PRO-31352 Glied 8, beim nächsten Goal an der Datei, Watch List in STATE.md (2026-11-27)
