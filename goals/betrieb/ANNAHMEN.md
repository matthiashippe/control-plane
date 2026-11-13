# Annahmen Topic betrieb

- 12.11.2026, betrieb 01: Der Betrag der Aufladung rechnet direkt aus `usage_weekly` (mindestens 7 mal `CP_CREDIT_MIN_DAILY_USD`),
  nicht aus dem durch 7 geteilten Verbrauch je Tag, damit kein Rest der Division ein genaues Vielfaches von 5 USD um 5 USD erhöht. Das
  ist dieselbe Regel wie im Goal (7 mal `d`), nur ohne Rundungsfehler.
- 12.11.2026, betrieb 01: `--topup` nimmt dieselben Quellen wie die Reichweite, also auch `--container`; so lassen sich die Zahlen aus
  dem Container der Produktion lesen, ohne dass der Schlüssel den Container verlässt.
- 12.11.2026, betrieb 01: Das Minimum von 10 USD greift mit den Standardwerten nie, weil der Mindestverbrauch von 1 USD je Tag schon
  7 USD und damit 10 USD ergibt; der Selftest zeigt es deshalb mit `CP_CREDIT_MIN_DAILY_USD=0.5`.
- 12.11.2026, betrieb 01: Matthias' Antwort am Human Gate („schon erledigt“, 21:35 deutscher Zeit) nennt keine Uhrzeit des
  Einschaltens. Die Zeile `Eingeschaltet:` trägt deshalb den Zeitpunkt der Antwort in UTC (20:35), also die späteste Zeit, zu der die
  Aufladung eingeschaltet war. Die Uhrzeiten der Karte sind deutsche Zeit: Der Kartentext von 18:21 kam nach dem Kommentar des Tech
  Leads um 17:12 UTC.
- 12.11.2026, betrieb 02: Seit der Vorabmessung um 22:00 UTC lief ein sechster Rollout (Container-Start 2026-11-12 22:43:42 UTC). Er
  steht mit in `docs/betrieb/neustart.md`, weil der Abschnitt `## Vorher` je Rollout seit dem 10.11.2026 eine Zeile verlangt.
- 12.11.2026, betrieb 02: Die Messungen für die Doku liefen mit `CP_OWN_IPS_FILE` auf einer Kopie von `ops/own-ips.txt` in einem
  temporären Ordner, weil `own_ips` eine neu gesehene eigene Adresse in die Liste schreibt und `ops/own-ips.txt` auf der Deny List
  steht. Das Ergebnis ist dasselbe wie mit der Datei im Repo, die eigene Adresse dieses Rechners zählt in beiden Fällen als eigene.
- 12.11.2026, betrieb 02: `own_ips` (in `ops/own-ips.sh`, Deny List) meldet eine neue eigene Adresse auf stderr mit der Adresse.
  `ops/deploy-window.sh` reicht diese Zeile mit `<address>` statt der Adresse weiter, damit auch stderr im öffentlichen Log von
  `deploy.yml` keine Adresse trägt.
- 12.11.2026, betrieb 02: `--log` ohne `--at` endet mit Exit 2, und unter `--log` liest das Werkzeug als eigene Adressen nur die Datei
  aus `CP_OWN_IPS_FILE`, nicht zusätzlich `CP_OWN_IPS`, wie es das Goal festlegt.
