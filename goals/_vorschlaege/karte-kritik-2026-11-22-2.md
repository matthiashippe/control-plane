Schwere: 3
Goal: karte 02
Befund: Die Freigabe der drei Produkte bei Digistore24 steht auf `pending`, und niemand sieht nach, ob sie kommt oder mit welchem Grund sie abgelehnt wird; erst danach verkauft die Kasse an Fremde.
Beleg: `node ops/digistore-release.mjs --report` -> `approval 771278: pending` (ebenso 771279 und 771280), eingereicht am 22.11.2026 vor dem Rollout der Startseite mit dem Block `card`
Empfehlung: karte 03 liest zu Beginn und täglich `--report`. Steht dort `approved`, beginnt die Messung der sieben Tage; steht `rejected` mit Grund, behebt das Glied den Grund und reicht mit `--submit` genau einmal neu ein (seit Punkt 14 von karte 02 zählt eine Änderung am Block `card` als neuer Stand). Lehnt Digistore24 zweimal mit demselben Grund ab, geht der Grund an den Tech Lead.
