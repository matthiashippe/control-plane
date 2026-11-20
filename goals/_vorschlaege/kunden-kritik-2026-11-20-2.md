Schwere: 3
Goal: kunden 06
Befund: Der neue Auslöser hängt am Schlüsselnamen `conway-automaton` der Runtime am Pin `d8f8168` (`RUNTIME_KEY_NAME` in `src/credits/starter.ts`). Benennt eine neue Version der Runtime ihren Schlüssel um, gibt der Dienst die Gutschrift wieder erst beim ersten Denken oder beim dritten Lesen, und kein Test wird rot: Der Job `e2e` prüft seit PR #318 nur `balance_mc < credited_mc`, und `credited_mc` enthält die Gutschrift, muss sie aber nicht enthalten.
Beleg: `grep -n "credited_mc" harness/e2e/full.sh` -> die Summe aus `topup` und `grant` ohne eigene Prüfung auf eine Zeile `grant`; `test/starter-first-call.test.ts` setzt den Namen selbst.
Empfehlung: Ein Pflege-PR `fix` in `harness/e2e/full.sh`: Der Ledger-Block gibt die Zahl der Zeilen `grant` der ersten Wallet aus, und das Ende verlangt genau 1 mit dem `trigger` `first balance read`. Bei einem neuen Pin wird der Lauf dann rot, wenn die Runtime den Auslöser nicht mehr trifft.
