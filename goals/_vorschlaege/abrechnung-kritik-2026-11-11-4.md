Schwere: 2
Goal: abrechnung 04
Befund: Die Zahl „Einkauf ohne Verkauf 0 mc“ aus abrechnung 04 beruht auf einem einzigen Tag (10.11.2026) ohne eine Zeile in `inference_aborts`; die Frage des Goals, was ein Abbruch ohne Antwort beim Anbieter kostet, ist damit nicht beantwortet, nur das Werkzeug ist belegt.
Beleg: `grep -n "keine einzige Zeile" docs/abrechnung/einkauf-abbrueche.md` -> Zeile 35 | docs/abrechnung/einkauf-abbrueche.md:35
Empfehlung: Das Kettenglied abrechnung 05 (Vergleich ab 17.11., siehe abrechnung-kritik-2026-11-11-3) fährt `bash ops/abort-purchase.sh` über dieselben Tage mit und schreibt die Zahl je Abbruch neu in `einkauf-abbrueche.md` und `timeouts.md`, sobald es eine Zeile mit `answered = 0` gibt; sonst steht dort erneut 0 mit Grund.
