Schwere: 1
Goal: konto 09
Befund: konto 09 schreibt den Wrapper um `PayoutChain`, der alle sechs Methoden von Hand an `inner.chain` weiterreicht, zweimal neu in `test/konto-payout.test.ts` (`lossySetup`, `unreadableSetup`), zusätzlich zur Kopie in `test/konto-payout-pending.test.ts`; die neue Methode `callerOf` musste deshalb in alle drei nachgetragen werden.
Beleg: `git grep -c 'code: (a) => inner.chain!.code(a)' origin/dev -- test` -> `test/konto-payout-pending.test.ts:1`, `test/konto-payout.test.ts:2` | test/konto-payout.test.ts:295, test/konto-payout.test.ts:465, test/konto-payout-pending.test.ts:20
Empfehlung: In `test/money-helpers.ts` eine Funktion `wrappedChain(overrides)` anlegen, die `moneySetup` mit einer weitergereichten Chain baut und nur die überschriebenen Methoden ersetzt, und die drei Setups darauf umstellen.
MVP: Schönheit
