Schwere: 2
Goal: kanal 03
Befund: `ops/github-yield.sh` zählt jede Ankunft mit Referrer `https://github.com/Conway-Research…` in eine Summe. Seit 2026-11-12 20:43 UTC stehen auch die Antworten der zweiten Runde (#447, #406, #408) im Fenster ab 2026-11-11T07:04:50Z. Die Widerlegungsregel in `goals/kanal/ertrag.md` gilt aber den Posts vom 11.11. (#434, #430, #427): Eine Anmeldung über #408 würde am 2026-11-25 die erste Runde retten, und welche Antwort wirkt, sieht niemand.
Beleg: `funnel()` in `ops/github-yield.sh` prüft nur das Präfix des Referrers; der Pfad `/issues/<n>` wird nicht gelesen. `ops/posted-answers.log` trägt seit Zyklus 2 sechs Einträge nach 2026-11-11.
Empfehlung: Im Glied mit dem Urteil am 2026-11-25 eine Zeile je Issue-Nummer aus dem Referrer-Pfad (`ISSUE <n>: <a> arrived, <b> signed in, <c> paid`), nur Summen, und die Regel an die Nummern der Runde binden statt an den Zeitraum. Fixture: eine Ankunft über #434 mit Anmeldung und eine über #447 mit Anmeldung, jede zählt nur in ihrer Zeile.
MVP: Funktion, weil das Urteil sonst die zwei Runden vermischt und über einen Kanal entscheidet, dessen Wirkung je Antwort niemand kennt.
