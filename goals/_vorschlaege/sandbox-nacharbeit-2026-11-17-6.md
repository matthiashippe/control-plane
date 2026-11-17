Schwere: 1
Goal: sandbox 09
Befund: In `sandbox_live` von `ops/live.sh` stehen seit sandbox 09 die lokalen Variablen `start`, `exitf`, `outf` und `deadline` noch in der `local`-Zeile, werden aber in der Funktion nicht mehr verwendet, weil die Schleife im Hintergrund nach `bg_live` umgezogen ist.
Beleg: `git show origin/dev:ops/live.sh | awk 'NR>=745 && NR<=814' | grep -n -w -E 'start|deadline|exitf|outf'` -> nur `3:` (die `local`-Zeile) | ops/live.sh:747
Empfehlung: Die vier Namen aus der `local`-Zeile von `sandbox_live` streichen.
MVP: Schönheit

Linse Q, Frage 3 (tote Pfade), Merge 82719fd. An der Merge-Basis las die Funktion `exitf` und `outf` noch (`git show 82719fd^1:ops/live.sh`, Zeilen 715 bis 726).
Verworfen: MVP: Schönheit ohne belegten Fehler, und der Kurs-Check vom 17.11. (PRO-23529) sieht den Detail-Anteil über der Schwelle; die ungenutzten Namen ändern kein Verhalten (2026-11-17)
