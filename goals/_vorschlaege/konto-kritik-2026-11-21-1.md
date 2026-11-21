Schwere: 4
Goal: konto 15
Befund: konto 15 startete am 19.11. um 15:17 UTC, 17 Minuten nach dem Merge des Richtungs-Checks, der festlegt, dass konto 15 erst nach `kunden` startet, und legt Matthias jetzt ein Gate (KYC, Gasschlüssel, Karte über 25 USD) für ein Produkt mit 0 Konten vor.
Beleg: `git show origin/dev:docs/richtung/2026-11-19.md | sed -n 103p` -> „konto 15 startet erst nach `kunden`“ | `git log -1 --format=%ci 4c3e722` -> 2026-11-19 15:17 UTC | Progress Log auf `origin/goal/konto-15`: `ops/konto-live.sh` -> `accounts 0`
Empfehlung: Der Tech Lead hält konto 15 an; Matthias bekommt zuerst die offene Entscheidung „Konto einfrieren“ aus dem Richtungs-Check und erst danach, falls er weitermachen will, die Gate-Karte.
MVP: Kauf, weil das Gate Geld und Zeit von Matthias für einen Weg ohne Kunden bindet.
