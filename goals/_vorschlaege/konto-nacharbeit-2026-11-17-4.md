Schwere: 1
Goal: konto 04
Befund: konto 04 bringt `mcp/server.mjs` von 429 auf 1222 Zeilen und `src/handoff/routes.ts` von 362 auf 509 Zeilen, ohne dass eine Commit-Message des Goal-Branches die Größe begründet.
Beleg: `git show c141093^1:mcp/server.mjs | wc -l; git show origin/dev:mcp/server.mjs | wc -l; git show c141093^1:src/handoff/routes.ts | wc -l; git show origin/dev:src/handoff/routes.ts | wc -l; git log --format=%B c141093^1..c141093^2 | grep -ciE 'zeilen|lines|größe'` -> `429`, `1222`, `362`, `509`, `0` | mcp/server.mjs:1, src/handoff/routes.ts:1
Empfehlung: Die Automaton-Tools aus `mcp/server.mjs` in ein eigenes Modul unter `mcp/` und die Limit-Routen aus `src/handoff/routes.ts` nach `src/konto/limit.ts` ziehen, sonst die Größe in der nächsten Commit-Message an der Datei begründen.
MVP: Schönheit

Linse Q, Frage 6 (Datei über 500 Zeilen), Merge c141093. Dieselbe Klasse wurde zweimal verworfen (abrechnung-nacharbeit-2026-11-11-2, domains-nacharbeit-2026-11-15-1) und einmal übernommen (messung-nacharbeit-2026-11-15-3).
Verworfen: MVP: Schönheit ohne belegten Fehler, und der Kurs-Check vom 17.11. (PRO-23529) sieht den Detail-Anteil über der Schwelle; die Größe allein ist kein Fehler, die Limit-Routen bündelt PRO-23679 Glied 2 (2026-11-17)
