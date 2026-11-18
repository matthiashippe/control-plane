Schwere: 2
Goal: konto 11
Befund: Der Client unterschreibt `data-revoke-hash` der Seite ungeprüft mit dem Schlüssel des Eigentümers; für die Smart Wallet ist eine Unterschrift über einen Hash einer User Operation eine Vollmacht für jeden Aufruf (etwa einen weiteren Owner), während die neue Erlaubnis der Client aus ihren Feldern selbst hasht.
Beleg: `src/public/konto-client/flow.mjs` (`runPayout`: `signer.signRawPayloads([hash, revoke.hash])`), `src/public/konto-client/main.mjs` (`revokeHash: d.revokeHash`)
Empfehlung: Die Seite trägt statt des Hashes die abzulösende Erlaubnis (`data-revoke-permission`) und die Nonce, der Client baut User Operation und Hash selbst wie `revokeUserOperation` und `revokeHash` in `src/konto/payout.ts`; ein Test zeigt, dass ein fremder Hash auf der Seite nicht unterschrieben wird. Der Gewinn ist begrenzt, solange `konto.js` vom selben Server kommt.
