Schwere: 2
Goal: wache 03
Befund: Die Regel, wann die Kasse per Karte für eine Wallet zu ist (Notschalter an oder Wallet mit Erstattung), steht nach wache 03 zweimal: in `cardRedirect` (`src/payments/card-way.ts:125`) und als eigene Verzweigung in `handleDigistoreIpn` (`src/payments/digistore.ts:326` bis `:333`).
Beleg: `git grep -n -E 'cardBreaker\(db, now\)\.on|walletRefunded\(db, address\)' origin/dev -- src/payments` -> `src/payments/card-way.ts:125` (beide in einer Zeile), `src/payments/digistore.ts:329` und `:331` | src/payments/digistore.ts:326
Empfehlung: Eine Funktion `cardClosedFor(db, address, now)` in `src/payments/card-way.ts`, die den Grund (`"card breaker on"`, `"wallet had a refund"`) oder null liefert; `cardRedirect` und `handleDigistoreIpn` rufen beide nur sie, beim nächsten Goal an der Kasse.
MVP: Funktion, weil ein dritter Grund zum Sperren sonst nur an einer Stelle landet und eine Zahlung über den direkten Link wieder Credits bucht, die der Notschalter halten soll.

Linse Q, Frage 2. Genau diese Lücke zwischen Weiterleitung und IPN hatte wache-kritik-2026-11-23-1 beschrieben.

Übernommen: Watch List in STATE.md (2026-11-25)
