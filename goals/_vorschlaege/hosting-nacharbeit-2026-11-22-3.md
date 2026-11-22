Schwere: 1
Goal: hosting 05
Befund: hosting 05 bringt `ops/sandbox/sandboxd.mjs` von 775 auf 808 Zeilen, und keine Commit-Message des Goal-Branches begründet die Größe über 500 Zeilen.
Beleg: `git show 63f14ac^1:ops/sandbox/sandboxd.mjs | wc -l; git show origin/dev:ops/sandbox/sandboxd.mjs | wc -l; git log --format=%B 63f14ac^1..63f14ac^2 | grep -ciE '500|zeilen'` -> `775`, `808`, `0` | ops/sandbox/sandboxd.mjs:328
Empfehlung: Die Größe in der nächsten Commit-Message an `ops/sandbox/sandboxd.mjs` begründen oder als bewusste Ausnahme in `goals/hosting/ANNAHMEN.md` festhalten; `imageHealth` und `imageFacts` wären ein Kandidat für eine eigene Datei unter `ops/sandbox/`.

Linse Q, Frage 6.

Verworfen: Größe einer Datei ohne Fehlerbild, kein Gewinn für Kunden (2026-11-22)
