Schwere: 1
Goal: konto 03
Befund: konto 03 führt den Fehlerzustand der Handy-Seite im Code unter dem deutschen Namen `fehlgeschlagen` (Route `POST /h/{code}/fehlgeschlagen`, Zustand in `src/public/konto.ts`, `KONTO_STATES` in `ops/soll-assess.mjs`), und die Umbenennung in konto 04 nimmt nur `freigabe`, `erledigt` und `ungueltig` mit.
Beleg: `git grep -nw fehlgeschlagen origin/dev -- src ops/soll-assess.mjs ':!src/public/konto-client/konto.js' | wc -l` -> `10` | src/handoff/routes.ts:347, src/handoff/routes.ts:360, src/public/konto.ts:16, src/public/konto-client/main.mjs:11, ops/soll-assess.mjs:160, goals/konto/04-die-terminal-tools.md:157 (prüft nur `freigabe|erledigt|ungueltig`), loop-constraints.md:63
Empfehlung: Die Umbenennung von konto 04 um `fehlgeschlagen` zu `failed` erweitern: Route `POST /h/{code}/failed`, Zustand und Titel in `src/public/konto.ts`, das Formularziel in `src/public/konto-client/main.mjs` samt neu gebautem `konto.js`; Bilder und Quellen `docs/soll/konto-fehlgeschlagen-*` behalten ihren Namen und werden über dieselbe eine Zuordnung in `ops/soll-assess.mjs` gelesen, und die Prüfung in konto 04 Zeile 157 nimmt `fehlgeschlagen` in ihr Muster auf.
MVP: Schönheit

Linse Q, Frage 5 (Bezeichner Englisch), Merge c1d7f74, Regelstelle `loop-constraints.md:63` (Grundregel 12, ausnahmslos). Die Goal-Datei von konto 03 gab nur die Namen der Bilder vor (Zeile 93 und 131), nicht Route und Zustand im Code. Gleiche Klasse wie konto-nacharbeit-2026-11-14-1 (übernommen in konto 04); konto 04 nennt `fehlgeschlagen` in Zeile 87 nur als Zustand, der auf der Seite unverändert bleibt.
Übernommen: PRO-23679 Glied 1 (2026-11-17)
