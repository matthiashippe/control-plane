Schwere: 1
Goal: hosting 07
Befund: hosting 07 bringt `src/db.ts` mit der Tabelle `sweep_failures` von 1032 auf 1041 Zeilen, und keine Commit-Message des Goal-Branches begründet die Größe über 500 Zeilen.
Beleg: `git show 79ed3d5^1:src/db.ts | wc -l; git show origin/dev:src/db.ts | wc -l; git log --format=%B 79ed3d5^1..79ed3d5^2 | grep -ciE '500|zeilen'` -> `1032`, `1041`, `0` | src/db.ts:540
Empfehlung: Die Größe in der nächsten Commit-Message an `src/db.ts` begründen oder als bewusste Ausnahme in `goals/hosting/ANNAHMEN.md` festhalten.

Linse Q, Frage 6.
