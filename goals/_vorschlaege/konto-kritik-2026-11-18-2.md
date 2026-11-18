Schwere: 2
Goal: konto 11
Befund: `POST /h/{code}/payout` prüft den Widerruf gegen `replacedPermission(current)`, wartet danach auf `checkSignature`, und erst `finishPayout` bestimmt in seiner Transaktion die abzulösende Erlaubnis neu; leert ein Auszahl-Lauf dazwischen `retire_*`, speichert `finishPayout` einen Widerruf, der für eine andere Erlaubnis unterschrieben ist, und der nächste Lauf schickt ihn mit unserem Gas, damit er revertiert.
Beleg: `src/handoff/routes.ts` (Widerruf geprüft vor `await checkSignature(konto, permission, signature)`), `src/konto/payout.ts` (`finishPayout`: `replacedPermission(readPayout(db, account))`)
Empfehlung: Die Route gibt `finishPayout` die Erlaubnis mit, für die sie den Widerruf geprüft hat, und `finishPayout` gibt `false` (Handoff neu) zurück, wenn sie in der Transaktion eine andere ablösen würde.
Übernommen: PRO-24877 Glied 3 (2026-11-18)
