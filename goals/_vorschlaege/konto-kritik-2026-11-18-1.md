Schwere: 3
Goal: konto 11
Befund: Dass die Coinbase Smart Wallet v1 den Widerruf annimmt (roher Hash der User Operation, `SignatureWrapper` mit `ownerIndex` 0, Gebühr 0 über `handleOps` unseres Gasschlüssels), belegt nur der nachgebaute Knoten in `test/money-helpers.ts`, der diese Annahmen selbst kodiert; stimmt eine davon auf der Kette nicht, revertiert jeder Widerruf, und jeder Kunde mit neuer IBAN nach einem Schlüsselwechsel landet in 409 `payout_needs_phone`, ohne dass Geld ausgezahlt wird.
Beleg: `test/money-helpers.ts` (`revokeOf` im `payoutNode`), `goals/konto/11-wer-nach-einem-schluesselwechsel-neu-auszahlt-beendet-mit-derselben-unterschrift-die-alte-erlaubnis.md` Abschnitt „Kontext für den Maker“, Rollout („ein Lauf von ops/konto/sepolia-payout-run.mjs mit Widerruf ist ein Vorschlag für später“)
Empfehlung: Vor dem ersten echten Wechsel des Gasschlüssels `ops/konto/sepolia-payout-run.mjs` um einen Durchlauf mit zweiter IBAN und Widerruf erweitern und auf Base Sepolia fahren: `UserOperationEvent` mit `success: true`, danach `isApproved` der alten Erlaubnis falsch.
Übernommen: PRO-24877 Glied 4 (2026-11-18)
