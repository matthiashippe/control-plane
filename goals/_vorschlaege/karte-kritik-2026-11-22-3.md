Schwere: 2
Goal: karte 02
Befund: Die Dankeseite der drei Produkte im Konto sagt „30 days money back“, die Rückgabe steht seit der Freigabe vom 22.11.2026 auf 60 Tagen.
Beleg: `ops/digistore.mjs:42` (`THANKYOU_TEXT`) -> `30 days money back`; `node ops/digistore.mjs --report` -> `refund 60 days` je Produkt
Empfehlung: In karte 03 prüfen, ob Digistore24 ein freigegebenes Produkt nach einer Änderung der Dankeseite neu prüft; wenn nicht, den Satz auf „You have 60 days to cancel the purchase.“ stellen, sonst so lassen, weil der Käufer mehr bekommt, als dort steht.
