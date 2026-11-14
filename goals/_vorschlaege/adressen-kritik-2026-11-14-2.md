Schwere: 2
Goal: adressen 01
Befund: `ops/actions-log-addresses.sh` erkennt nur IPv4. Heute hat `postyourprice.com` keinen AAAA-Eintrag, also kommt kein Besucher über IPv6; bekommt die Domain einen, zählt der Zähler eine IPv6-Adresse in einer Zeile einer Anfrage nicht und meldet `total 0`. Dazu läuft der Zähler nur von Hand, ein neuer Lauf mit Adresse fällt also erst beim nächsten Aufruf auf.
Beleg: ops/actions-log-addresses.sh:119 (Muster nur `[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+`), `dig +short AAAA postyourprice.com | grep -c ':'` -> 0 (14.11.2026)
Empfehlung: Im nächsten Goal, das am Netz von Caddy oder an DNS etwas ändert, IPv6 im Zähler ergänzen (Fixture aus `2001:db8::/32`, `::1` und `fe80::/10` privat), und `--workflow deploy.yml` als Zeile in den Nachtlauf nehmen, der bei `total` größer 0 oder Exit 2 meldet.
