Schwere: 2
Goal: hosting 05
Befund: Der Fall „the pause between two attempts is CP_SANDBOXD_PAUSE with a default of 20 seconds“ prüft kein Verhalten, sondern sucht die Zeichenfolge der Zuweisung im Quelltext von `ops/watchdog.sh`; alle anderen Fälle setzen `CP_SANDBOXD_PAUSE=0`, also belegt kein Lauf, dass ohne die Variable wirklich 20 Sekunden gewartet wird.
Beleg: `git grep -n -F 'SANDBOXD_PAUSE="${CP_SANDBOXD_PAUSE:-20}"' origin/dev -- test/` -> `test/watchdog-sandboxd.test.ts:271` (`toContain` auf `readFileSync(WATCHDOG)`) | test/watchdog-sandboxd.test.ts:270
Empfehlung: Den Fall als Lauf bauen: `run` ohne `CP_SANDBOXD_PAUSE` mit `[DOWN]` aufrufen und `sleeps()` gegen `["20"]` prüfen (das falsche `sleep` schreibt sein Argument schon mit); der Textvergleich entfällt.

Linse Q, Frage 1.

Übernommen: Watch List in STATE.md, beim nächsten Goal an ops/watchdog.sh (2026-11-22)
