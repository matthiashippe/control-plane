Schwere: 1
Goal: reichweite 03
Befund: Das Element `<video>` und die Zeile darunter mit der festen Länge „26 seconds“ stehen zweimal gleich im Code, einmal auf der Startseite und einmal in der Vorlage der Fehlerseiten.
Beleg: `git grep -n -c '26 seconds, no sound' origin/dev -- src` -> `src/public/error-pages.ts:1`, `src/public/index.html:1`; `git grep -n 'poster="/video/move-poster.png"><source' origin/dev -- src` -> `src/public/error-pages.ts:97`, `src/public/index.html:974` | src/public/error-pages.ts:97
Empfehlung: Element und Zeile als eine Konstante in `src/public/error-pages.ts` (oder einer eigenen Datei) führen und in `src/public/index.html` über einen Platzhalter einsetzen, den `src/app.ts` füllt, wie es `withOrigin` und `withCard` schon tun; dazu ein Fall in `test/video.test.ts`, der die Länge aus `ops/video-assess.mjs` gegen den Text prüft.

Wird das Video neu gerendert (Zyklus 6 änderte die Länge schon von 24,7 auf 26,3 s), muss die Zahl an zwei Stellen nachgezogen werden, und kein Test bemerkt es.

Linse Q, Frage 2.
Übernommen: Watch List in STATE.md, beim nächsten neuen Rendern des Videos (24.11.2026)
