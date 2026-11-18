Schwere: 2
Goal: konto 11
Befund: Bridge dokumentiert kein Abschalten einer Auszahladresse; ob das Löschen des alten Bankkontos (`DELETE` External Account) die alte Auszahladresse nach einer neuen IBAN stilllegt, ist offen.
Beleg: `awk '/^## Abgelöste Auszahladresse bei Bridge$/{f=1;next} /^## /{f=0} f' docs/konto/euro.md | grep -c 'DELETE'` -> 1 | docs/konto/euro.md:Abschnitt „Abgelöste Auszahladresse bei Bridge“
Empfehlung: Mit dem echten Zugang (konto 06) in der Sandbox von Bridge prüfen, welchen Zustand eine Liquidation Address nach dem Löschen ihres External Account meldet; stilllegt sie das, nach einem gelungenen Widerruf das alte Bankkonto löschen. Für den Schutz des Geldes ist es nicht nötig, weil der Widerruf aus goals/konto/11 die alte Weiterleitung schon ohne Erlaubnis lässt.
