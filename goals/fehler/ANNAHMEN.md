# Annahmen im Topic fehler

## fehler 01 (12.11.2026, Engineer CP)

- Die Zeile von `ops/credit-runway.sh` ist Englisch (`CREDIT RUNWAY OK: 9.37 USD, 3.7 days at 2.49 USD per day, threshold 7.46 USD`),
  nicht wie im Kontext der Goal-Datei mit „Tage bei … USD je Tag“: Log-Zeilen sind Code, und Code ist Englisch
  (`loop-constraints.md`, Grundregel 12). Präfixe, Felder, Reihenfolge und Exit-Codes sind die aus der Goal-Datei; dazu kommt die
  Schwelle in USD, weil die Doku sie nennen muss.
- Schwelle als ein Betrag: das Größere aus `CP_CREDIT_WARN_USD` und `CP_CREDIT_WARN_DAYS` mal Verbrauch je Tag. Das ist gleich
  „weniger als 3 Tage oder unter 5 USD“ aus der Goal-Datei und lässt sich in einer Zeile ablesen. Die Tage werden abgerundet
  (14,99 USD bei 5 USD je Tag sind 2,9 Tage, nicht 3,0), damit eine LOW-Zeile nie die Schwelle als Reichweite zeigt.
- Geldbeträge in `ops/credit-runway.sh` als `Decimal`, nie als float; das ist eine Messung des Anbieterguthabens, kein Ledger.
- `ops/watchdog.sh` prüft das Guthaben vor der Gesundheit und in jedem Lauf, weil der Dienst am 11.11. gesund war und trotzdem jede
  Inferenz mit 503 beantwortete; bei einem Ausfall des Dienstes endet der Lauf nach der Gesundheit mit Exit 1, die Guthabenzeile
  steht dann schon im Log.
- Ein FAIL des Werkzeugs steht in jedem Lauf als `[WARN] credit unreadable` im Log, über den Webhook aber höchstens einmal am Tag
  (Datei `<CP_WATCHDOG_STATE>.credit-fail`, wie beim Zertifikat), sonst käme alle 5 Minuten dieselbe Meldung. Der gespeicherte
  Zustand `low` oder `ok` bleibt dabei unverändert.
- Erster Lauf ohne gespeicherten Zustand: LOW meldet sofort, OK meldet nichts.
- Die Messung aus dem Container der Produktion lief per `ssh … 'bash -s -- --container' < ops/credit-runway.sh`: lesend, zwei
  GET an den Anbieter aus `deploy-cp-1`, keine Datei auf dem Server.
- Kritik 1: Die Abfrage des Guthabens im Watchdog läuft unter `timeout -k 5 ${CP_CREDIT_TIMEOUT:-45}`. 45 Sekunden decken die zwei
  GET aus dem Container (je 15 s Zeitlimit) samt Start von `node`; mit der Gesundheit (höchstens 60 s) bleibt ein Lauf unter den
  5 Minuten des Cron. GNU `timeout` signalisiert seine ganze Prozessgruppe, also stirbt `docker exec` mit. Auf dem Server liegt
  `/usr/bin/timeout` (GNU coreutils 9.4, gelesen am 12.11.2026 per `ssh … 'command -v timeout; timeout --version'`); ohne `timeout`
  (Mac ohne coreutils) läuft die Abfrage ohne Grenze.
- Kritik 2: Der Watchdog kennt drei Zustände des Guthabens (`ok`, `low`, `empty`). `empty` heißt ein Rest von 0 oder darunter in der
  Zeile des Werkzeugs (`CREDIT RUNWAY LOW: <Rest> USD`). Von `ok` oder ohne Zustand nach `empty` kommt nur die Meldung `empty`, von
  `low` nach `empty` genau eine weitere; die Meldung `empty` trägt das Wort `LOW` nicht, damit sie von der ersten Warnung zu
  unterscheiden ist. Steigt der Rest nach `empty` über 0, aber nicht über die Schwelle, wird der Zustand still wieder `low`; fällt er
  dann erneut auf 0, kommt wieder eine Meldung `empty`. `OK` meldet aus `low` und aus `empty`.

## fehler 02 (12.11.2026, Engineer CP)

- Der Test `test/fetcher-cache.test.ts` fährt eine Kopie von `ops/fetchers.py` in einem leeren Ordner mit `HOME` in einem zweiten
  leeren Ordner, damit „neben dem Skript entsteht keine Datei“ auf einem Ordner geprüft wird, der leer anfängt, auch wenn im
  eigenen Checkout noch eine alte `ops/fetcher-cache.tsv` liegt. Die einzige nicht gecachte Adresse ist `127.0.0.1`, die der
  Resolver aus `/etc/hosts` beantwortet; der Test braucht kein Netz.
- Die Adresse des echten Googlebot aus dem Selbsttest von `ops/crawlers.sh` bleibt, weil der Selbsttest ohne sie nicht zeigen kann,
  dass die DNS-Probe einen echten Crawler durchlässt; sie steht mit Betreiber und PTR in `ops/crawler-ips.txt` (eine Zeile). Alle
  anderen Besucheradressen sind durch Adressen aus `192.0.2.0/24`, `198.51.100.0/24` und `203.0.113.0/24` ersetzt, je Adresse
  dieselbe Ersatzadresse in allen Dateien. Die Selbsttests von `ops/fetchers.py`, `ops/crawlers.sh` und `ops/failures.sh` sind
  danach grün.
- `ops/check-all.sh` ruft `ops/fetchers.py` weiter auf; der Cache landet dann im `HOME` des aufrufenden Nutzers unter
  `.cache/control-plane/`, außerhalb jedes Checkouts.
