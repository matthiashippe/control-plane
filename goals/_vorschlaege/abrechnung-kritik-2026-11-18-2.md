Schwere: 2
Goal: abrechnung 05
Befund: Der Anbieter korrigiert seine Tageswerte nachträglich: Den 10.11.2026 meldete er am 11.11. mit 1597747 mc, am 18.11. mit 1601660 mc (3913 mc mehr), und genau das macht den Tag zu `noise`. Gemessen wurde am 18.11. um 00:18 UTC, 18 Minuten nach dem Ende des 17.11., dessen Lücke (766 mc, 86 mc je Abbruch) damit auf einem womöglich unfertigen Tageswert steht.
Beleg: `grep -n "3913 mc höher" docs/abrechnung/einkauf-abbrueche.md` | docs/abrechnung/einkauf-abbrueche.md, Abschnitt `## Nach sieben Tagen`
Empfehlung: `ops/abort-purchase.sh` markiert Tage, die jünger als ein festgelegter Abstand sind (etwa 72 h nach Tagesende), als `provisional` und rechnet sie nicht in den Einkauf je Abbruch; die Zahl für 10. bis 17.11. wird mit diesem Abstand einmal neu gemessen. Prüfen, ob die 7783 mc am einen Abbruch vom 12.11. (Tag des Endes des Ausfalls) ein Abbruch sind oder eine Korrektur des Anbieters.
Übernommen: PRO-24877 Glied 2 (2026-11-18)
