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

## fehler 03 (12.11.2026, Engineer CP)

- Auch die Tagesstempel für `credit unreadable` (`.credit-fail`) und für das Zertifikat (`.cert`) werden erst nach erfolgreichem POST
  gespeichert, wie es das Ziel des Goals nennt. Scheitert der POST, kommt die Meldung im nächsten Lauf (fünf Minuten später) noch
  einmal; nach einem erfolgreichen POST gilt wieder höchstens eine am Tag.
- Der Fake für `curl` im neuen Test scheitert mit Exit 22, dem Code von `curl --fail` bei einer Antwort 4xx oder 5xx. Der alte
  Watchdog gab `--fail` nicht mit, dem Fake ist das gleich; die Gegenprobe gegen `5458fa3` misst also nur das Speichern des Zustands.

## fehler 04 (12.11.2026, Engineer CP)

- `ops/traffic.sh` legt eine Adresse beiseite, deren /24 im Log drei oder mehr Adressen hat. Die Dokumentationsbereiche haben nur drei
  /24-Netze, deshalb sind die Ersatzadressen nicht der Reihe nach vergeben, sondern so auf die drei Netze verteilt, dass in jeder
  Fixture jede Adresse dieselbe Antwort auf „drei oder mehr aus ihrem /24“ bekommt wie vorher (die sechs Adressen des Scanners teilen
  weiter ein Netz). Gemessen über alle Fixtures von `ops/traffic.sh` mit Adressen als `X` und zusammengezogenen Leerzeichen: gleiche
  Ausgabe bis auf die Zusammenfassung „N address(es) in M network(s)“ in drei Fixtures mit vier oder neun fremden Netzen, die mit drei
  Netzen nicht darstellbar sind. Der Selbsttest von `ops/traffic.sh` und die Fixtures von `ops/depth.sh` sind gleich.
- Versionen in Browserkennungen der Fixtures (`Chrome/<n>.0.0.0`) sehen für die Regex des Tests aus wie öffentliche Adressen. Sie sind
  auf vierteilige Versionen mit vierstelligem dritten Teil umgestellt (Form echter Chrome-Builds); kein Skript liest die Version, und
  jede Version bekommt genau einen Ersatz, damit gleiche Kennungen gleich bleiben.
- Ein Kommentar in `ops/fetchers.py` nannte den PTR einer GCP-Adresse, dessen Anfang die Oktette rückwärts als eigene Adresse
  enthielt; er nennt jetzt nur die Domain.
- Die beiden öffentlichen DNS-Resolver (Cloudflare, Quad9) stehen als `datacenter` mit dem PTR aus der Abfrage durch `ops/fetchers.py` in der Liste, weil sie als
  Resolver der Sandboxes in Goal-Dateien, Verdicts und `ANNAHMEN.md` des Topics sandbox stehen; die Ersetzung lässt sie überall
  unverändert, auch dort, wo ein Selbsttest sie als Besucher nutzt.
- Eine Adresse eines Contabo-Servers steht in den Momentaufnahmen des x402-Verzeichnisses unter `docs/research/data/` als Host eines öffentlichen Dienstes;
  der Betreiber kommt aus RDAP von RIPE, weil der Cache von `ops/fetchers.py` ihn nicht als Rechenzentrum erkennt.
- Der Absatz in `ops/README.md` ist Englisch wie die ganze Datei.
- Falle: Eine Abfrage mit `ops/fetchers.py` schreibt jede Adresse in den gemeinsamen Cache, auch eine, die kein Rechenzentrum ist, und
  `test/visitor-addresses.test.ts` aus fehler 02 hält jede solche Adresse für einen Besucher, ohne `ops/known-ips.txt` zu lesen. Die
  acht Abfragen dieses Laufs machten den Test auf dem code-host rot; die acht Zeilen, die nur dieser Lauf geschrieben hatte, sind
  wieder aus dem Cache genommen (Datei bleibt, 960 Zeilen wie vorher, atomar per rename), danach ist der Test grün. Für eine
  Abfrage ohne Cache-Eintrag `CP_FETCHER_CACHE` auf eine Datei aus `mktemp` setzen.
