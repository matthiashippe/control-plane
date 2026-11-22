Schwere: 3
Goal: karte 02
Befund: Die Dankeseite der drei Produkte im Konto sagt „30 days money back“, obwohl die Rückgabe seit der Freigabe vom 22.11.2026 auf 60 Tagen steht und Matthias am 22.11.2026 sagte: „alle Texte sagen 60 Tage“.
Beleg: `ops/digistore.mjs:42` (`THANKYOU_TEXT`) -> `30 days money back`; `node ops/digistore-release.mjs --report` -> `approval 771278: approved` (ebenso 771279 und 771280)
Empfehlung: Das nächste Glied mit Arbeit am Konto (wache 01 oder karte 03) stellt `THANKYOU_TEXT` auf „You have 60 days to cancel the purchase.“ und schreibt nur das Feld der Dankeseite der drei eigenen Produkte. Vorher klärt es im OpenAPI-Index oder bei einem Produkt, ob Digistore24 ein freigegebenes Produkt nach einer Änderung der Dankeseite neu prüft; wenn ja, gilt `--submit` mit genau einem Einreichen.
