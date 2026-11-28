Schwere: 2
Goal: wache 04
Befund: Die 402 fragt `cardUrlFor` mit eigener Uhr `new Date()` statt der Uhr `clock()` von `createApp`, also urteilt nach wache 04 noch eine Stelle über die Kasse per Karte mit anderer Zeit als Seiten, `/card/<paket>` und IPN; die Deny List von wache 04 sperrte `src/inference/**`.
Beleg: `grep -n 'cardUrlFor(db, address, new Date())' src/inference/proxy.ts` -> 412:    const cardUrl = cardUrlFor(db, address, new Date());
Empfehlung: In einem Glied, das `src/inference/proxy.ts` nennt, die Uhr über `chatOpts` an `handleChat` geben und in `test/card-way-pages.test.ts` einen Fall „names no card link in the 402 while the breaker window has passed on the app clock“ mit fester Uhr ergänzen.
