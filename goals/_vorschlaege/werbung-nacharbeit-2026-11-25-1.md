Schwere: 1
Goal: werbung 03
Befund: werbung 03 bringt `test/agent-probe.test.ts` von 296 auf 582 Zeilen, und keine Commit-Message des Goal-Branches begründet die Größe über 500 Zeilen.
Beleg: `git show c7d692a^1:test/agent-probe.test.ts | wc -l; git show origin/dev:test/agent-probe.test.ts | wc -l; git log --format=%B c7d692a^1..c7d692a^2 | grep -c -i -E '500|zeilen|agent-probe\.test'` -> `296`, `582`, `0` | test/agent-probe.test.ts:582
Empfehlung: Die Fälle von `--week` (neuer Block `describe("ops/agent-probe.sh --week")`) in eine eigene Datei `test/agent-probe-week.test.ts` legen, dann bleiben beide Dateien unter 500 Zeilen; sonst die Größe in der nächsten Commit-Message an der Datei begründen.
MVP: Schönheit

Linse Q, Frage 6. `ops/traffic.sh` (1570 auf 1586) und `ops/README.md` lagen schon vor dem Goal über 500 Zeilen und zählen hier nicht.

Übernommen: Watch List in STATE.md (2026-11-25)
