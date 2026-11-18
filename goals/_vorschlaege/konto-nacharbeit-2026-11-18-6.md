Schwere: 2
Goal: konto 05
Befund: `ops/konto/sepolia-payout-run.mjs` benennt Variablen deutsch (`ziel`, `zielFremd`, `atZiel`, `forwarderFremd`, `codeFremd`, `erlaubnisTx`, `anlageTx`, `anlageFremdTx`, `auszahlungTx`, `auszahlungBlock`, `fremdSpendTx`, `fremdZielTx`, `konto`), entgegen Grundregel 12.
Beleg: `git grep -c -w -E 'ziel|zielFremd|atZiel|forwarderFremd|erlaubnisTx|anlageTx|auszahlungTx|fremdSpendTx|fremdZielTx' origin/dev -- ops/konto/sepolia-payout-run.mjs` -> `44` | ops/konto/sepolia-payout-run.mjs:159, ops/konto/sepolia-payout-run.mjs:160, ops/konto/sepolia-payout-run.mjs:304, ops/konto/sepolia-payout-run.mjs:309, loop-constraints.md Grundregel 12
Empfehlung: Die Bezeichner englisch fassen (`destination`, `otherDestination`, `atDestination`, `otherForwarder`, `approveTx`, `deployTx`, `payoutTx`, `foreignSpendTx`, `foreignTargetTx`, `account`); die deutschen Schlüssel im erzeugten `docs/konto/sepolia-payout.md` dürfen bleiben, weil die Doku deutsch ist.
MVP: Schönheit
