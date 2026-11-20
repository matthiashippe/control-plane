Schwere: 3
Goal: kunden 04
Befund: Die Liste der eigenen Namen steht an zwei Stellen fest im Skript: als Vorgabe von `CP_OWN_HOSTS` und als `HOSTS` im Block der Ankünfte. Mit dem nächsten Namen (oder den Namen mit `www`, die `deploy/Caddyfile` weiterleitet und die in der Messung mit 13 Ankünften als fremder Referrer stehen) muss jemand beide Stellen von Hand nachziehen. Vergisst er eine, landet der neue Name unter `other hosts` oder als fremder Referrer. So ging es nach umzug 01 mit `automatonhost.com`.
Beleg: `ops/traffic.sh`, `CP_OWN_HOSTS="${CP_OWN_HOSTS:-automatonhost.com postyourprice.com cp.hippe.eu}"` und `HOSTS = ("automatonhost.com", "postyourprice.com", "cp.hippe.eu")` | `deploy/Caddyfile`, Block mit allen Hosts
Empfehlung: Wenn ein Glied den nächsten Host einführt oder ändert: `HOSTS` aus `CP_OWN_HOSTS` ableiten und einen Test ergänzen, der die Namen aus `deploy/Caddyfile` gegen `CP_OWN_HOSTS` prüft (die Namen mit `www` als eigene Seite oder bewusst ausgenommen).
MVP: nein, weil das heute stimmt und erst beim nächsten Umzug bricht.
