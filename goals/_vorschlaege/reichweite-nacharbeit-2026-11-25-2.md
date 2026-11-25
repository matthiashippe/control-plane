Schwere: 1
Goal: reichweite 04
Befund: reichweite 04 bringt `test/relink-comments.test.ts` von 318 auf 760 Zeilen, und keine Commit-Message des Goal-Branches begründet die Größe über 500 Zeilen.
Beleg: `git show ef2f48b^1:test/relink-comments.test.ts | wc -l; git show origin/dev:test/relink-comments.test.ts | wc -l; git log --format=%B ef2f48b^1..ef2f48b^2 | grep -c -i -E '500|relink-comments\.test'` -> `318`, `760`, `0` | test/relink-comments.test.ts:760
Empfehlung: Die Fälle von `--name` und `--name --no-card` in eine eigene Datei `test/name-comments.test.ts` legen, die `test/relink-sandbox.ts` wie bisher nutzt; sonst die Größe in der nächsten Commit-Message an der Datei begründen.
MVP: Schönheit

Linse Q, Frage 6.

Übernommen: Watch List in STATE.md (2026-11-25)
