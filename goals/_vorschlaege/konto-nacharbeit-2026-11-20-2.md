Schwere: 1
Goal: konto 13
Befund: konto 13 bringt `src/public/konto-client/flow.mjs` von 551 auf 642 Zeilen und `src/konto/payout.ts` von 763 auf 783, ohne dass eine Commit-Message des Goal-Branches die Größe über 500 Zeilen begründet.
Beleg: `git show 9c9654ba^1:src/public/konto-client/flow.mjs | wc -l; git show 9c9654ba:src/public/konto-client/flow.mjs | wc -l` -> `551`, `642`; `git log 9c9654ba^1..9c9654ba^2 --format=%B | grep -ciE '500|Zeilen'` -> `0` | src/public/konto-client/flow.mjs:381
Empfehlung: Den Widerruf des Clients (`ENTRY_POINT`, `REVOKE_*_GAS`, ABIs, `revokedPermission`, `revokeHash`, Zeilen 379 bis 461) in ein eigenes Modul neben `flow.mjs` ziehen, das `ops/konto/build-client.mjs` mitbündelt; sonst die Größe in der nächsten Commit-Message an der Datei begründen.

`src/handoff/routes.ts` (889 auf 893) steht mit gleicher Aussage schon in `konto-nacharbeit-2026-11-17-4.md` und zählt hier nicht.
MVP: Schönheit
Verworfen: MVP Schönheit, Größe einer Datei ohne Fehler im Verhalten, während der Loop auf kleiner Flamme läuft (Loop-Triage PRO-25822) (2026-11-20)
