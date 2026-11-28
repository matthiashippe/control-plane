Schwere: 3
Goal: wache 04
Befund: Der Prüfbefehl „genau 2“ für `cardBreaker\(db|walletRefunded\(db` in `src/payments/card-way.ts` zählt die beiden Funktionsdefinitionen schon mit, die gewollte Umsetzung (`cardClosedFor` ruft beide) liefert also mindestens 3, und der Punkt ist nur durch Umbenennen eines Parameters erfüllbar.
Beleg: `git grep -n -E 'cardBreaker\(db|walletRefunded\(db' origin/dev -- src/payments/card-way.ts` -> :41 `export function cardBreaker(db: Db`, :54 `export function walletRefunded(db: Db`, :85, :125
Empfehlung: Vor dem Start den Prüfbefehl auf Aufrufe außerhalb der Definitionen stellen, etwa `grep -E '\b(cardBreaker|walletRefunded)\(' src/payments/card-way.ts | grep -vc 'export function'` mit Erwartung 2 und beiden Treffern in `cardClosedFor`, oder zählen, dass außerhalb von `card-way.ts` kein Aufruf mehr steht.
Übernommen: Tech Lead, PRO-32469 Glied 5 (2026-11-28)
