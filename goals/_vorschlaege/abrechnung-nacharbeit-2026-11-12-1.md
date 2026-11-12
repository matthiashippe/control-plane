Schwere: 1
Goal: abrechnung 04
Befund: `ops/abort-purchase.sh` kopiert den Lesezugriff auf die Produktion aus `ops/timeout-quote.sh` (`fetch_rows` Zeichen für Zeichen, `load_env` und das Gerüst von `ROWS_JS` fast gleich), statt ihn mit dem Werkzeug aus abrechnung 03 zu teilen.
Beleg: `git grep -n -F 'ConnectTimeout=10 "$CP_HOST" "docker exec deploy-cp-1 node -e $(printf %q "$ROWS_JS")' origin/dev -- ops/` -> `ops/abort-purchase.sh:187` und `ops/timeout-quote.sh:251` | ops/abort-purchase.sh:54, :162 bis :189 gegen ops/timeout-quote.sh:51, :236 bis :252
Empfehlung: Einen gemeinsamen Helfer unter `ops/` anlegen (Umgebung laden, Schlüssel prüfen, `docker exec deploy-cp-1 node -e <js> /data/cp.db` lesend über `ssh`), den beide Skripte rufen, so wie `ops/timeout-quote.sh` schon `ops/access-log.sh` ruft; je Skript bleibt nur die eigene Abfrage.
MVP: Schönheit

Linse Q, Frage 2 (Logik-Duplikate). Die Kopien laufen schon auseinander: `load_env` in abort-purchase.sh liest `loop.env` immer, die Fassung in timeout-quote.sh nur ohne gesetztes `CP_HOST`. Ändern sich Containername oder Datenbankpfad, muss jede Kopie nachgezogen werden (dazu `ops/live.sh:189`). Verwandt mit `abrechnung-nacharbeit-2026-11-11-3` (Duplikat innerhalb von timeout-quote.sh), aber eine andere Stelle.
