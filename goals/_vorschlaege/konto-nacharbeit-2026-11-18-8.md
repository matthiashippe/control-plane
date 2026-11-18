Schwere: 1
Goal: konto 05
Befund: konto 05 legt `src/konto/payout.ts` mit 587 Zeilen neu an und bringt `src/handoff/routes.ts` von 509 auf 850, `mcp/server.mjs` von 1222 auf 1526 und `src/public/konto-client/flow.mjs` von 369 auf 505 Zeilen, ohne dass eine Commit-Message des Goal-Branches die Größe begründet.
Beleg: `git show 52f6468^2:src/konto/payout.ts | wc -l; git show 52f6468^1:src/handoff/routes.ts | wc -l; git show 52f6468^2:src/handoff/routes.ts | wc -l; git log --format=%B 52f6468^1..52f6468^2 | grep -ciE 'zeilen|lines|größe'` -> `587`, `509`, `850`, `0` | src/konto/payout.ts:1, src/handoff/routes.ts:1, mcp/server.mjs:1
Empfehlung: Die Geld-Routen des Handoffs (`payoutStep`, `/h/{code}/payout-*`, `/h/{code}/deposit`) aus `src/handoff/routes.ts` nach `src/konto/` ziehen und die Geld-Tools aus `mcp/server.mjs` in ein eigenes Modul unter `mcp/`, sonst die Größe in der nächsten Commit-Message an der Datei begründen.
MVP: Schönheit
Verworfen: MVP: Schönheit ohne belegten Fehler; die Größe allein ist kein Fehler (2026-11-18)
