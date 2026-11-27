Schwere: 1
Goal: kunden 16
Befund: `ops/sandbox-customer.sh` legt `own_list` als vierte wörtlich gleiche Fassung neben `ops/customer-decline.sh`, `ops/customer-work.sh` und `ops/starter-paths.sh` an, obwohl die Online-Hälfte schon als `conway_own_list` in `ops/conway-arrivals.sh:24` gemeinsam liegt.
Beleg: `git grep -n -F 'list=$(CP_OWN_IPS="" CP_OWN_IPS_FILE="$file" own_ips_offline 2>/dev/null) || return 2' origin/dev -- ops` -> `ops/customer-decline.sh:189`, `ops/customer-work.sh:207`, `ops/sandbox-customer.sh:196`, `ops/starter-paths.sh:179`; `diff` der Funktion gegen jede der drei anderen -> identisch | ops/sandbox-customer.sh:192
Empfehlung: `own_list` mit beiden Zweigen als eine Funktion neben `conway_own_list` nach `ops/conway-arrivals.sh` ziehen und die vier Werkzeuge darauf umstellen, beim nächsten Goal an einem davon; ihre Selbsttests bleiben unverändert und belegen, dass die Zählung gleich bleibt.
MVP: Schönheit

Linse Q, Frage 2. Dieselbe Klasse (Kopien aus `ops/customer-decline.sh` in ein neues Werkzeug, dort `loop.env` und `parse`/`iso`) wurde in kunden-nacharbeit-2026-11-21-3 verworfen; `own_list` entscheidet aber, welche Anfragen als fremd zählen, und eine auseinanderlaufende Kopie zählt eigene Läufe als Kunden (vgl. messung-nacharbeit-2026-11-15-2, übernommen).
