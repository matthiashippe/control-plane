Schwere: 3
Goal: umzug 03
Befund: `page()` ersetzt für Seiten mit eigener Karte nur den Dateinamen (`og.png` zu `og-x402.png`), `og:image:alt` kommt unverändert aus `src/public/index.html`. Seit umzug 03 beschreibt der Alt-Text auf den Seiten mit `og-x402.png` die Umzugskarte („Set conwayApiUrl …“), obwohl das Bild die x402-Karte zeigt; vorher beschrieb er dort ebenso falsch den Markt.
Beleg: `grep -n '"og-x402.png"' src/app.ts` -> zwei Aufrufe von `page()`; `grep -n 'image:alt' src/app.ts` -> kein Treffer, der Alt-Text wird nirgends je Karte gesetzt.
Empfehlung: `page()` setzt `og:image:alt` je Karte aus einer Tabelle neben `ogImage()` (`og.png` mit dem Text aus `index.html`, `og-x402.png` mit einem eigenen Satz, der die x402-Karte beschreibt), dazu ein Test, der für jede Karte Bild und Alt-Text paarweise prüft.
Übernommen: PRO-24877 Glied 8 (2026-11-18)
