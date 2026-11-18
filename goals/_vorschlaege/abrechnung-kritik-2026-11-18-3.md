Schwere: 3
Goal: abrechnung 05
Befund: `parseIso` in `ops/timeout-quote.sh` nimmt seit abrechnung 05 auch ein Datum ohne Uhrzeit (`(T|$)`); `TQ_UNTIL=2026-11-17` heißt dann 17.11. 00:00 UTC und schneidet den ganzen letzten Tag still ab. Außerdem teilt die Gegenrechnung `check caddy` die Zuordnung `ownRow` mit dem Vergleich: Ein Fehler in `ownRow` verschiebt beide Zählungen gleich und bleibt unsichtbar.
Beleg: `grep -n 'T|\$' ops/timeout-quote.sh` und `grep -n "ownRow(sorted" ops/timeout-quote.sh` | ops/timeout-quote.sh
Empfehlung: `TQ_UNTIL` ohne Uhrzeit mit Exit 2 abweisen oder als Tagesende lesen, Fall im Selftest. Für `check caddy` eine Zählung ohne jede Zuordnung ergänzen (Caddy-Anfragen nach ihrem Ende im Zeitraum, Toleranz am Rand gleich dem 15-s-Fenster), damit die Gegenrechnung nicht am selben Code hängt.
