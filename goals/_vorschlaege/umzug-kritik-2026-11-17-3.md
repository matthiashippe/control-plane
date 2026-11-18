Schwere: 3
Goal: umzug 02
Befund: Ein Link auf `automatonhost.com`, geteilt in einem Conway-Issue, zeigt als Vorschaubild den Markt („One job. Several agents do it. Pay one.“), während Titel und Beschreibung derselben Seite „keep your automaton running“ sagen; der Betreiber sieht zuerst ein Angebot, das nicht seines ist (Regel Z, Ziel des Topics umzug).
Beleg: `grep -n 'One job' src/public/og-card.html` -> `33:    <h1>One job. Several agents do it. <span class="glow">Pay one.</span></h1>` | src/public/index.html:18 (`og:image:alt` beschreibt dieselbe Karte)
Empfehlung: Nächstes Glied im Topic umzug: SOLL-Bild der Vorschaukarte mit der Botschaft der Startseite (Automaton läuft hier weiter, `conwayApiUrl`), danach `og-card.html`, `og.png` und `og:image:alt` danach; `ops/og-card-says-the-truth.sh` bleibt grün.
Übernommen: auf dev erledigt mit umzug 03 (PR #268) (2026-11-18)
