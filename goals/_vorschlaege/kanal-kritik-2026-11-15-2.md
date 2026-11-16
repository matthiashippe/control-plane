Schwere: 2
Goal: kanal 05
Befund: Die drei Antworten vom 10.11.2026 (#440, #442, #443, gepostet 14:03 bis 14:06 UTC) gehören zu keiner Runde des Urteils: Ihre Zeile `ISSUE` entsteht nur bei einem Referrer nach `--since 2026-11-11T07:04:50Z`, Ankünfte davor fallen ganz heraus, und die Entscheidung `Nächste Runde:` zählt nur die Zeilen `(Runde 1)` und `(Runde 2)`.
Beleg: `grep -c '^2026-11-10T14:0' ops/posted-answers.log` -> 3 | goals/kanal/05-urteil-je-antwort-welche-davon-automatons-gebracht-hat.md:37 (Zeile je Nummer nur „mit einem Zeitstempel ab `--since`“), goals/kanal/05-urteil-je-antwort-welche-davon-automatons-gebracht-hat.md:104 (Summe nur über `Runde [12]`)
Empfehlung: kanal 05 misst ab `2026-11-10T14:03:20Z` und führt #440, #442 und #443 als `Runde 0` mit eigener Zeile in `goals/kanal/ertrag.md`; die Summe für `Nächste Runde:` zählt alle drei Runden. Die Zeilen `Ertrag Runde 1:` und `Alle neuen:` bleiben unverändert stehen.

Eine Anmeldung über #440 wäre ein Beleg, dass Antworten in Conways Tracker wirken, würde aber unter der heutigen Regel als „anderer Kanal“ gelesen. Die 14 Tage dieser drei Antworten enden am 24.11.2026 und liegen damit vollständig vor der Messung am 26.11.
Übernommen: Triage-Glieder 16.11. an den Tech Lead, Glied 4 (PRO-22463, Antworten vom 10.11. als Runde 0) (2026-11-16)
