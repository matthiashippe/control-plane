Schwere: 2
Goal: kanal 05
Befund: kanal 05 stand auf PLANNED mit „frühestens 2026-11-26“, obwohl `ROADMAP.md` es als ersetzt durch kanal 06 führt, und hätte am selben Tag wie kanal 06 doppelt starten können.
Beleg: `git show origin/dev:ROADMAP.md | grep -c "05 entfällt: ersetzt durch 06"` -> 1 | goals/kanal/05-urteil-je-antwort-welche-davon-automatons-gebracht-hat.md:4 `PLANNED`
Empfehlung: kanal 05 bleibt PAUSED (in diesem PR gesetzt); löschen kann die Datei nur die Human Inbox.
MVP: Detail.
