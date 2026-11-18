Schwere: 1
Goal: konto 05
Befund: `formatUsd` in `src/konto/payout.ts` wiederholt die Rechnung von `usd` in `src/public/handoff.ts` (atomare USDC auf ganze Cent abgeschnitten, zwei Nachkommastellen), nur ohne das Dollarzeichen.
Beleg: `git grep -n 'cents % 100n).padStart(2, "0")' origin/dev -- src ':!src/public/konto-client/konto.js'` -> `src/konto/payout.ts:95`, `src/public/handoff.ts:18`, `src/public/konto-client/flow.mjs:388` | src/konto/payout.ts:93, src/public/handoff.ts:16
Empfehlung: `usd` in `src/public/handoff.ts` auf `"$" + formatUsd(atomic)` umstellen oder beide aus einem Modul unter `src/konto/` (etwa `src/konto/usdc.ts`) nehmen; die Kopie im Browser-Skript `flow.mjs` bleibt, weil sie ohne Server-Import läuft.
MVP: Schönheit
