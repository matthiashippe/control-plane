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
