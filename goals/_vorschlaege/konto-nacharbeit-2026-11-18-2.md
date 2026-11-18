Schwere: 2
Goal: konto 05
Befund: Der Bridge-Client führt `getCustomer` und `drains` samt Typen `BridgeCustomer` und `Drain`, aber kein Code außerhalb von `test/konto-bridge.test.ts` ruft sie; dabei sagt die Entscheidung in `docs/konto/euro.md:197`, dass die Auszahlung erst bei Endorsement `sepa` `approved` aus `GET /v0/customers/{customerID}` weitergeht, und `src/handoff/routes.ts:253` prüft nur `kycStatus`.
Beleg: `git grep -n -E '\.(getCustomer|drains)\(' origin/dev -- src ops harness mcp` -> keine Ausgabe, Exit 1 | src/konto/bridge.ts:71, src/konto/bridge.ts:77, src/handoff/routes.ts:253, docs/konto/euro.md:197
Empfehlung: Entweder `payoutStep` in `src/handoff/routes.ts` fragt nach `kycStatus` `approved` zusätzlich `getCustomer` und geht erst bei Endorsement `sepa` `approved` weiter (mit Test in `test/konto-payout.test.ts` für einen Kunden mit KYC approved und SEPA pending), oder `getCustomer`, `drains` und ihre Typen fallen aus `src/konto/bridge.ts` und die Entscheidung in `docs/konto/euro.md` nennt nur `kyc_status`.
MVP: Schönheit
