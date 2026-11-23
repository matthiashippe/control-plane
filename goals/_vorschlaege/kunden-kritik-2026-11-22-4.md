Schwere: 2
Goal: kunden 11
Befund: `src/bounties/house.ts` führt den Namen des Runtime-Schlüssels als eigene Konstante `HOUSE_RUNTIME_KEY_NAME`, obwohl kunden 10 genau dieses Literal auf `RUNTIME_KEY_NAME` aus `src/credits/starter.ts` vereinheitlicht hat; ändert ein neuer Pin den Namen, zahlt die Startgutschrift weiter und der Hausauftrag nicht mehr.
Beleg: `grep -c '"conway-automaton"' src/bounties/house.ts` -> 1 | src/credits/starter.ts:458
Empfehlung: `house.ts` importiert `RUNTIME_KEY_NAME`; Prüfung `grep -c '"conway-automaton"' src/bounties/house.ts` gibt 0 aus.

Übernommen: Glied 1 an den Tech Lead, PRO-28123, mitzunehmen an derselben Stelle (2026-11-23)
