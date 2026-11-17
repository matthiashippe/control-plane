Schwere: 1
Goal: sandbox 08
Befund: sandbox 08 legt `ops/automaton-live.sh` neu mit 710 Zeilen an, und keine Commit-Message des Goal-Branches begründet die Größe.
Beleg: `git show origin/dev:ops/automaton-live.sh | wc -l; git log --format=%B 792a490^1..792a490^2 | grep -ciE 'zeilen|lines|größe'` -> `710`, `0` | ops/automaton-live.sh:1
Empfehlung: Die Helfer, die das Skript mit `ops/live.sh` teilt (siehe sandbox-nacharbeit-2026-11-17-4), in eine eingebundene Datei ziehen und den Selbsttest abtrennen, sonst die Größe in der nächsten Commit-Message an der Datei begründen.
MVP: Schönheit

Linse Q, Frage 6 (Datei über 500 Zeilen), Merge 792a490. `ops/live.sh`, `ops/sandbox/setup.sh` und `src/app.ts` lagen schon vor dem Goal über 500 Zeilen und zählen hier nicht.
Verworfen: MVP: Schönheit ohne belegten Fehler, und der Kurs-Check vom 17.11. (PRO-23529) sieht den Detail-Anteil über der Schwelle; die Größe allein ist kein Fehler (2026-11-17)
