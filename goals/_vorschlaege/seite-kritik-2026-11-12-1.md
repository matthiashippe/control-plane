Schwere: 2
Goal: seite 01
Befund: Der erste Bildschirm bei 390 px ist mit 844 px gemessen, Safari auf einem iPhone mit 390 x 844 zeigt mit Adress- und Werkzeugleiste aber nur etwa 660 px, und der Umzug endet bei 828 px, also kann der untere Teil des Codekastens (`automaton --provision`) auf dem Telefon erst nach Scrollen sichtbar sein.
Beleg: `node ops/soll.mjs --pruefen` -> `soll: 2 Bilder, umzug oben 390=828 1440=656, 0 Mängel` | ops/soll-assess.mjs:7
Empfehlung: In seite 02 die Ankünfte mit Referrer `github.com/Conway-Research` nach Gerät auszählen (User-Agent im Caddy-Log); kommen nennenswert viele vom Telefon, ein Folge-Goal, das bei 390 den Codekasten vor die Überschrift zieht oder die Faltlinie auf 660 px setzt. Bei 1440 (656 von 900 px) gibt es kein Problem.
Übernommen: seite 02 (Ankünfte nach Gerät zählen, Folge-Goal nur bei vielen Telefonen), DONE und gemergt (PR #49) (2026-11-13)
