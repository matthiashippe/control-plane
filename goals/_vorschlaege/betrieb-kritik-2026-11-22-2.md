Schwere: 2
Goal: betrieb 06
Befund: Der Test `test/rollback-schema.test.ts` zieht aus Schritt 8 nur die Anweisung `ALTER TABLE … RENAME COLUMN`, das ganze Skript hinter `--entrypoint node cp -e`, das jemand beim Rückweg einfügt, läuft in keinem Test, und sein Pfad `/data/cp.db` ist nicht an `CP_DB_PATH` in `deploy/docker-compose.prod.yml` gebunden.
Beleg: `grep -c 'nothing to do' test/rollback-schema.test.ts` -> 0 | deploy/README.md:82
Empfehlung: Ein Fall in `test/rollback-schema.test.ts` zieht das Skript aus Schritt 8, ersetzt den Pfad durch eine Wegwerf-DB, führt es zweimal mit `node -e` im Repo aus und erwartet `renamed`, dann `nothing to do`; ein zweiter Fall vergleicht den Pfad im Skript mit `CP_DB_PATH` aus `deploy/docker-compose.prod.yml`. Von Hand lief das Skript am 22.11.2026 gegen eine Wegwerf-DB grün.
MVP: Funktion.

Übernommen: Watch List in STATE.md, beim nächsten Goal an test/rollback-schema.test.ts (2026-11-23)
