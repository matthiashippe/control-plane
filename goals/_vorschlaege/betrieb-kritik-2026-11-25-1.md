Schwere: 2
Goal: betrieb 07
Befund: Das Ergebnis von betrieb 07 steht schon fest, weil der Rest beim Inferenz-Anbieter bis zum Fensterende am 26.11. 20:35 UTC bei rund 24 USD und damit über der Aufladeschwelle von 16 USD bleibt; die Messung kann die Aufladung nicht belegen und belegt trotzdem den einzigen Goal-Platz (`parallel_goals: 1`).
Beleg: docs/kunden/aufladung-2026-11.md:8 und :65 (`CREDIT RUNWAY OK: 30.86 USD, 30.8 days at 1.00 USD per day`, gemessen 2026-11-20) | goals/betrieb/07-die-nachmessung-der-aufladung-nach-14-tagen.md:8 und :52
Empfehlung: Mit diesem PR pausiert. Zurück auf PLANNED mit neuem Fenster, sobald der Watchdog einen Rest unter 20 USD meldet; bis dahin deckt der Alarm `CREDIT RUNWAY LOW` den leeren Saldo.
Übernommen: betrieb 07 steht auf dev auf PAUSED mit der Zeile `Pause:` (Loop-Kritik, PR #436); die Wiederaufnahme mit neuem Fenster bei einem Rest unter 20 USD steht auf der Watch List in STATE.md (2026-11-26)
