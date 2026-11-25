Schwere: 2
Goal: fehler 12
Befund: `/pricing` baut die Sätze zu Karte, USDC, Inferenz und Sunset als Kopie der Strings aus `/llms.txt`, und der Test prüft die Gleichheit nur im Zustand ohne Katalog, also können beide Seiten bei Notverkauf (`notForSaleNow()`) oder Sunset (`intakeClosed`) still auseinanderlaufen.
Beleg: `grep -c 'does not sell access to language models' src/app.ts` -> mehrere Kopien desselben Satzes (Zeilen in `/llms.txt` und in `pricing` am Kopf von goal/fehler-12 320609b); `test/docs-pricing.test.ts:83` prüft nur `billed at purchase cost times ${MARKUP}` mit `createApp({ db })` ohne `catalog`.
Empfehlung: Die Sätze für Kasse, Inferenz und Sunset als kleine Funktionen neben `pricing` ziehen, die `/llms.txt` und `/pricing` beide aufrufen, und in `test/docs-pricing.test.ts` je einen Fall mit `catalog` und `inferenceSunsetAt` wie in `test/inference-sunset.test.ts` ergänzen: bei Sunset kein `/card/`, kein `/pay/`, „Credits are no longer sold here.“, und derselbe Inferenzsatz wie in `/llms.txt`.

Übernommen: Tech Lead, PRO-29721 Glied 2 (2026-11-25)
