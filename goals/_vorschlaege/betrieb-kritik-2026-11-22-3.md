Schwere: 2
Goal: betrieb 06
Befund: Der Wächter in `test/rollback-schema.test.ts` erkennt nur `RENAME COLUMN <a> TO <b>` und `DROP COLUMN <x>` mit festen Bezeichnern (`\w+`), eine Migration in einer Schleife mit `${column}` wie in `src/db.ts` bei `ADD COLUMN ${column}` rutscht durch.
Beleg: `grep -c 'COLUMN \${column}' src/db.ts` -> 2 | test/rollback-schema.test.ts:43
Empfehlung: `missingWaysBack` meldet jedes `RENAME COLUMN` und `DROP COLUMN`, dessen Bezeichner mit `${` beginnt, als fehlenden Rückweg, mit einem Fall dazu, damit eine solche Migration ihre Spalten in Schritt 8 ausdrücklich nennen muss.
MVP: Funktion.

Übernommen: Watch List in STATE.md, beim nächsten Goal an test/rollback-schema.test.ts oder einer Migration mit ${column} (2026-11-23)
