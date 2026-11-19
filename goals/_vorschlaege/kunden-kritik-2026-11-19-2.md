Schwere: 2
Goal: kunden 01
Befund: `ops/customer-decline.sh` zählt Logzeilen von Adressen, deren Ledger-Zeilen `oursClause` als eigene führt, die aber nicht in `ops/own-ips.txt` stehen, unter `OTHER` als fremd (48 Mal 200 und 28 Mal Status 0 vom 16. bis 19.11.), weil die beiden Listen der eigenen Adressen auseinanderlaufen.
Beleg: `bash ops/customer-decline.sh --since 2026-11-05T00:00:00Z` -> `OTHER 2026-11-16: http 2xx 20 402 0 4xx 1721 5xx 0` | docs/kunden/rueckgang-2026-11.md:144
Empfehlung: Bei der nächsten Arbeit an `ops/customer-decline.sh` die Adresse, von der das eigene Werkzeug ruft, in `ops/own-ips.txt` aufnehmen oder Logzeilen, deren nächste Inferenz-Zeile nach `oursClause` eigen ist, aus `OTHER` nehmen; bis dahin `OTHER 2xx` nicht als fremde Nachfrage lesen.
MVP: Funktion, weil `OTHER` sonst fremde Nachfrage vortäuscht, wo eigene Läufe stehen.
