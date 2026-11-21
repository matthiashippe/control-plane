Schwere: 3
Goal: kanal 05
Befund: kanal 05 entscheidet zwischen `Antwortpaket` und `anderer Kanal`, aber seit dem 10.11.2026 hat niemand ein Issue im Upstream-Repo geöffnet, ein neues Antwortpaket hätte also keine Empfänger, und die Regel prüft das nicht.
Beleg: `gh issue list -R Conway-Research/automaton --state all --search "created:>=2026-11-10" --json number,createdAt` -> `447 (2026-11-10T23:53:31Z), 446 (2026-11-10T05:40:08Z)`, nichts danach | goals/kanal/05-urteil-je-antwort-welche-davon-automatons-gebracht-hat.md:100
Empfehlung: Die Zeile `Nächste Runde: Antwortpaket, weil …` nur zulassen, wenn das Werkzeug zur Messzeit offene Issues mit Anmelde- oder Zahlungsfehlern seit der letzten Runde zählt (Zeile `NEW ISSUES since <t>: <n>`); bei 0 lautet das Urteil `anderer Kanal`, und das Goal nennt Idee 3 aus `docs/richtung/2026-11-19.md` (Paket der Runtime mit unserer Adresse) als Kandidat.

Der Richtungs-Check vom 19.11. misst dasselbe (`docs/richtung/2026-11-19.md:28`, 0 neue Onboarding-Issues in der Woche ab 12.11.). Ohne diese Bedingung kann ein einzelner angemeldeter Besucher über eine alte Antwort das Urteil `Antwortpaket` auslösen, und kanal 06 und 07 bauen dann am Postwerkzeug für eine Runde, die niemand liest.

Übernommen: Glied 4 an den Tech Lead, kanal 05 vor dem Start am 26.11. (PRO-26356) (2026-11-21)
