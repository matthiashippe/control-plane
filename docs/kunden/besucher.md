# Besucher je Host

Erste Messung des Blocks `-- Arrivals per host --` aus `ops/traffic.sh` (kunden 04). Eine Ankunft ist eine fremde Adresse, deren
erste Anfrage im ganzen Zugriffslog im Fenster liegt; sie zählt einmal, beim Host dieser ersten Anfrage, mit dem Host ihres
Referrers. Im Repo stehen nur Zählungen und Hosts, keine Adresse.

Gemessen: 2026-11-19T22:54:12Z

Befehl auf dem code-host nach `set -a; . ~/.config/control-plane/loop.env; set +a`, nur lesend (das Zugriffslog kommt über
`ops/access-log.sh`). Der Lauf schrieb die ganze Ausgabe in eine Datei außerhalb des Repos, darauf lief dasselbe `sed`, weil der
Rest der Ausgabe Adressen trägt:

bash ops/traffic.sh 168 | sed -n '/^-- Arrivals per host --$/,/^$/p'

```
-- Arrivals per host --
   2615 foreign arrival(s) in the last 168 hours
   automatonhost.com: 362 foreign arrival(s)
      321  (none)
      28  (our page)
      12  www.automatonhost.com
      1  (unreadable)
   postyourprice.com: 2197 foreign arrival(s)
      2155  (none)
      28  (our page)
      11  www.google.com
      2  github.com
      1  www.postyourprice.com
   cp.hippe.eu: 56 foreign arrival(s)
      54  (none)
      1  github.com
      1  www.google.com
   other hosts: 0 foreign arrival(s)

```

Leitzahl: 2615 fremde Ankünfte in 7 Tagen, davon 362 über automatonhost.com, 2197 über postyourprice.com, 56 über cp.hippe.eu, 0 über andere Hosts

Fast alle Ankünfte kommen ohne Referrer (2530 von 2615); über eine Suche kamen 12 (`www.google.com`), über GitHub 3. Die Namen
`www.automatonhost.com` und `www.postyourprice.com` leitet `deploy/Caddyfile` mit 308 auf den Namen ohne `www` weiter; ein
Browser behält dabei den ursprünglichen Referrer, diese 13 Referrer kommen also nicht von einem Klick auf unserer Seite. Sie stehen
wie jeder Host außerhalb von `CP_OWN_HOSTS` als fremder Referrer.

Ursache: `https://postyourprice.com/sitemap.xml` antwortet seit umzug 01 mit 301 auf `https://automatonhost.com/sitemap.xml`, `curl -s` ohne `-L` liefert darum keinen Text, das `grep -oE '<loc>[^<]*'` in der Zuweisung von `CP_PAGES` endet mit 1, und `set -euo pipefail` beendet `ops/traffic.sh` direkt nach der Kopfzeile; belegt mit `curl -s -o /dev/null -m 10 -w '%{http_code} %{redirect_url}' https://postyourprice.com/sitemap.xml`, das am 19.11.2026 um 22:55 UTC `301 https://automatonhost.com/sitemap.xml` ausgab, während `curl -s -m 10 https://postyourprice.com/sitemap.xml | wc -c` 0 und `curl -sL -m 10 https://postyourprice.com/sitemap.xml | grep -c '<loc>'` 11 ergab.

Ergebnis: Der Abbruch lag am Host, wie der Richtungs-Check vom 19.11. vermutete: `test/traffic-hosts.test.ts` mit einem `curl`, das wie die Produktion antwortet, endet gegen `ops/traffic.sh` von `origin/dev` nach der Kopfzeile, gegen den neuen Stand mit Exit 0, und der Lauf gegen die Produktion oben kam durch.
