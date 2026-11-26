Schwere: 1
Goal: werbung 04
Befund: werbung 04 bringt `ops/agent-probe.sh` von 466 auf 503 Zeilen, und keine Commit-Message des Goal-Branches begründet die Größe über 500 Zeilen.
Beleg: `git show 5a279bb^1:ops/agent-probe.sh | wc -l; git show 5a279bb:ops/agent-probe.sh | wc -l; git log --format=%B 5a279bb^1..5a279bb^2 | grep -c -i -E '500|zeilen|größe|agent-probe\.sh'` -> `466`, `503`, `0` | ops/agent-probe.sh:503
Empfehlung: Den Selbsttest (`--selftest`, `ops/agent-probe.sh:263` bis `:359`) in eine eigene Datei `ops/agent-probe-selftest.sh` legen, die das Skript mit seinen Schaltern aufruft, dann bleibt `ops/agent-probe.sh` unter 500 Zeilen; sonst die Größe in der nächsten Commit-Message an der Datei begründen.
MVP: Schönheit

Linse Q, Frage 6. `ops/README.md` lag schon vor dem Goal über 500 Zeilen und zählt hier nicht.
