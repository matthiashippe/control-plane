Schwere: 2
Goal: werbung 03
Befund: `seen` zählt jede URL außer conway.tech im Satz mit `conwayApiUrl`, also auch `http://localhost:3000` oder `https://example.com`, obwohl solche Antworten unseren Hinweis nicht gefunden haben müssen.
Beleg: `ops/agent-probe.sh` (sub foreign_url im Block WEEK_RULES: jeder Host außer conway.tech und seinen Subdomains)
Empfehlung: In einem Folge-Goal localhost, 127.0.0.0/8, `::1`, example.com/.org/.net und `.local` von foreign_url ausnehmen, mit einem Fixture, das genau so eine Antwort trägt; die Zahl der Woche 2026-W48 ändert sich dadurch nicht (keine ihrer Antworten nennt so eine URL).
MVP: Schönheit, weil die echten Antworten bisher keine solche URL tragen und die Zahl erst bei vielen Wochen verzerren würde.

Übernommen: Watch List in STATE.md (2026-11-25)
