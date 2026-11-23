Schwere: 2
Goal: wache 01
Befund: `usdcTopupUrl` in `src/payments/card-way.ts` baut den Link über USDC `${siteOrigin()}/pay/5/<adresse>` ein zweites Mal, obwohl `src/inference/proxy.ts` denselben Link für `topup_url` der 402 selbst zusammensetzt und der Kommentar verlangt, dass beide gleich sind.
Beleg: `git grep -n '/pay/5/\${' e423d4d -- src` -> `src/inference/proxy.ts:363`, `src/inference/proxy.ts:378: topup_url: \`${siteOrigin()}/pay/5/${address}\``, `src/payments/card-way.ts:100: return \`${siteOrigin()}/pay/5/${address.toLowerCase()}\`` | src/payments/card-way.ts:100
Empfehlung: `topup_url` und den Satz „Buy credits at …“ in `src/inference/proxy.ts:363` und `:378` aus `usdcTopupUrl(address)` holen, damit der Link nur an einer Stelle entsteht.

Zwei Stellen für denselben Link heißt: Ändert ein Goal den Pfad oder die Stufe, zeigt die Seite des Notschalters einen anderen Weg als die 402.
