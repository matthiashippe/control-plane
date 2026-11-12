# Annahmen Topic betrieb

- 12.11.2026, betrieb 01: Der Betrag der Aufladung rechnet direkt aus `usage_weekly` (mindestens 7 mal `CP_CREDIT_MIN_DAILY_USD`),
  nicht aus dem durch 7 geteilten Verbrauch je Tag, damit kein Rest der Division ein genaues Vielfaches von 5 USD um 5 USD erhöht. Das
  ist dieselbe Regel wie im Goal (7 mal `d`), nur ohne Rundungsfehler.
- 12.11.2026, betrieb 01: `--topup` nimmt dieselben Quellen wie die Reichweite, also auch `--container`; so lassen sich die Zahlen aus
  dem Container der Produktion lesen, ohne dass der Schlüssel den Container verlässt.
- 12.11.2026, betrieb 01: Das Minimum von 10 USD greift mit den Standardwerten nie, weil der Mindestverbrauch von 1 USD je Tag schon
  7 USD und damit 10 USD ergibt; der Selftest zeigt es deshalb mit `CP_CREDIT_MIN_DAILY_USD=0.5`.
