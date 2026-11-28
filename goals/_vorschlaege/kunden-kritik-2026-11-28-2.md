Schwere: 2
Goal: kunden 19
Befund: Die Zeile `PAY 1` von `ops/usdc-bands.sh` zählt nur Anfragen auf `/pay/1` und darunter (`is_pay_one` in `ops/usdc_bands.py:148`). Eine Runtime, die `/pay/5/` aufruft und mit der zweiten Zeile des Angebots nur 1 USD signiert (`src/payments/pay.ts:505` bis `:513`), kauft die Stufe 1, erscheint dort aber nicht. Nach dem neuen Punkt 5 von kunden 19 zählt `TOPUPS 1 USD` diesen Kauf, der Versuch davor (402 auf `/pay/5/` an eine fremde Adresse) bleibt unsichtbar.
Beleg: `ops/usdc_bands.py:148` | `src/payments/pay.ts:512`
Empfehlung: Eine weitere Zeile `PAY 5` im selben Format (402, 200, sonst), damit der Richtungs-Check sieht, ob fremde Runtimes überhaupt an die Kasse kommen, auch wenn sie den Pfad der Stufe 5 nehmen. Die Zeile `PAY 1` bleibt unverändert, weil kunden 18 und 19 sie prüfen.
MVP: Funktion, weil sonst offen bleibt, ob eine Null bei `TOPUPS 1 USD` heißt, dass niemand an die Kasse kommt, oder dass er dort scheitert.
