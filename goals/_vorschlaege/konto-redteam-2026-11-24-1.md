Schwere: 3
Goal: konto 11
Befund: `sendPayout` schickt auf dem Weg zum Hauptnetz zusätzlich `handleOps` an den EntryPoint v0.6, eine Sendeart, die die Ausnahme Hauptnetz in Grundregel 10 nicht nennt, und `sendKontoTx` prüft nur die Kette, nicht die Art der Transaktion.
Beleg: `git show origin/dev:loop-constraints.md | grep -c handleOps; git show origin/dev:src/konto/payout.ts | grep -n 'functionName: "handleOps"' | cut -c1-4` -> `0`, `494:` | loop-constraints.md:59, src/konto/payout.ts:494, src/konto/chain.ts:52-56
Empfehlung: Bevor Matthias `CP_KONTO_MAINNET=1` setzt, nimmt er den Widerruf über `handleOps` in Grundregel 10 auf oder lehnt ihn ab; bis dahin verweigert `sendKontoTx` auf chainId 8453 jede Transaktion, deren Selektor nicht zu den in Regel 10 genannten gehört, mit einem Test dafür.

## Herleitung

Die Ausnahme Hauptnetz (Matthias, 17.11.2026) erlaubt auf Base wörtlich nur `approveWithSignature`, `revokeAsSpender`, `spend()` sowie Anlegen und Aufruf des `PayoutForwarder`. Die Goal-Datei konto 11 (Entscheidung 2) und goals/konto/ANNAHMEN.md:326 werten `handleOps` mit dem vom Kunden unterschriebenen Widerruf als Teil dieser Ausnahme; eine Änderung der Regel durch einen Menschen gibt es dafür nicht (letzte Änderungen 5f77e64 am 17.11. und 187d0a5 am 22.11., beide ohne `handleOps`). Linse B notierte die Lücke in `11-z3-B` und `11-z4-B` nur als Hinweis.

Was die Schwere senkt: `CP_KONTO_MAINNET` ist nicht gesetzt, konto 15 wartet auf Matthias, und die Operation widerruft nur eine Erlaubnis, bewegt also kein Geld.

Gegenprüfung (frischer Subagent): bestätigt.
Übernommen: Glied 5 an den Tech Lead, PRO-28911; ob handleOps in Regel 10 kommt, steht auf der Watch List in STATE.md bis vor CP_KONTO_MAINNET=1 (24.11.2026)
