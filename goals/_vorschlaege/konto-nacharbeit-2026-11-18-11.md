Schwere: 1
Goal: konto 09
Befund: konto 09 bringt `test/konto-payout.test.ts` von 283 auf 531 Zeilen, ohne dass eine Commit-Message des Goal-Branches die Größe begründet.
Beleg: `git show 6b0002c^1:test/konto-payout.test.ts | wc -l; git show 6b0002c^2:test/konto-payout.test.ts | wc -l; git log --format=%B 6b0002c^1..6b0002c^2 | grep -ciE 'zeilen|lines|größe'` -> `283`, `531`, `0` | test/konto-payout.test.ts:1
Empfehlung: Die beiden neuen Blöcke „after a new gas key or a lost receipt“ und „when the chain cannot be read before the retire“ in eine eigene Datei `test/konto-payout-retire.test.ts` legen (zusammen mit dem Helfer aus konto-nacharbeit-2026-11-18-10), sonst die Größe in der nächsten Commit-Message begründen.
MVP: Schönheit
