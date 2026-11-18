Schwere: 2
Goal: konto 06
Befund: Zwei Zeilen „Abgelöst: konto 02 Punkt 1 …“ erwarten genau `Exit 1, Node.js v22.23.5`, also die letzte Zeile des Stacktrace eines `ENOENT`; mit dem nächsten Node-Update ändert sich diese Zeile, das Audit führt beide Befehle dann als ROT, und der Loop Master macht daraus eine Reparatur ohne Ursache.
Beleg: `goals/konto/ANNAHMEN.md` Abschnitt `## Abgelöst durch konto 06 (Maker, 2026-11-17)`, Zeilen 1 und 2.
Empfehlung: Das Audit vergleicht bei einer Zeile `Abgelöst:` die letzte Ausgabezeile ohne die Versionszeile von Node (`/^Node\.js v\d/`), oder der Tech Lead ersetzt die Zeilen nach dem nächsten Node-Update mit der neuen Ausgabe; vorzuziehen ist die Regel im Audit, weil sie jede künftige Ablösung mit Absturz abdeckt.
Übernommen: PRO-24877 Glied 7 (2026-11-18)
