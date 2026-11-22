Schwere: 2
Goal: reichweite 01
Befund: Die Fehlerseiten tragen im JSON-LD nur Organization, WebSite und WebPage, keinen Knoten, der den Fehlertext und den einen Schritt als Lösung beschreibt, obwohl genau diese Suche das Ziel des Goals ist.
Beleg: `src/app.ts` Route `/errors/:slug` ruft `page()` ohne `ld`-Argument; `src/public/jsonld.ts` kennt Knoten nur für Seiten, deren Inhalt sie belegen
Empfehlung: Je Fehlerseite ein Knoten `TechArticle` (headline gleich `heading`, about der Fehlertext) oder `HowTo` mit dem einen Schritt aus dem Kasten, nur mit dem, was die Seite zeigt (Regel in `src/public/jsonld.ts`); messen über die Leitzahl `search` von `ops/error-pages-arrivals.mjs` vier Wochen nach dem Rollout.
