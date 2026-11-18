Schwere: 2
Goal: konto 05
Befund: konto 05 ersetzt in `src/konto/chain.ts` die Prüfung `requireSepolia` durch `requireNet`, lässt `requireSepolia` aber als exportierte Funktion ohne einen einzigen Aufrufer stehen, und `docs/konto/konto.md:86` beschreibt weiter, dass `sendKontoTx` sie ruft.
Beleg: `git grep -nw requireSepolia origin/dev -- src test ops harness mcp` -> nur `src/konto/chain.ts:15:export function requireSepolia(chainId: unknown): void {` | src/konto/chain.ts:15
Empfehlung: `requireSepolia` (und damit den Import `KONTO_CHAIN_ID` in `src/konto/chain.ts:12`) streichen, `docs/konto/konto.md:86` auf `requireNet` umschreiben und die Prüfbefehle von konto 03 Punkt 5, die nach `requireSepolia(` suchen, in `goals/konto/ANNAHMEN.md` als abgelöst durch `requireNet` und `test/konto-mainnet.test.ts` eintragen.
MVP: Schönheit
