Schwere: 1
Goal: konto 03
Befund: Die Felder der Spend Permission stehen in `src/konto/` zweimal von Hand: als EIP-712-Typ `SPEND_PERMISSION_TYPES` in `src/konto/permission.ts` und als ABI-Tupel `PERMISSION_TUPLE` in `src/konto/topup.ts`, Feld für Feld gleich; dazu je eine Kopie in `src/public/konto-client/flow.mjs` und `harness/e2e/konto-chain.mjs`.
Beleg: `git grep -n '{ name: "salt", type: "uint256" }' origin/dev -- src harness ':!src/public/konto-client/konto.js' | wc -l` -> `4` | src/konto/permission.ts:30, src/konto/topup.ts:151, src/public/konto-client/flow.mjs:37, harness/e2e/konto-chain.mjs:73
Empfehlung: `PERMISSION_TUPLE` in `src/konto/topup.ts` nimmt seine `components` aus `SPEND_PERMISSION_TYPES.SpendPermission` statt eine eigene Liste zu führen; die Kopien im Browser-Skript und im Harness bleiben, weil `test/konto-client.test.ts` die Signatur des Skripts mit dem Typ des Servers prüft und der Harness bewusst unabhängig rechnet. `test/konto-topup.test.ts` und der Job `e2e` belegen, dass sich nichts ändert.
MVP: Schönheit

Linse Q, Frage 2 (Logik-Duplikate), Merge c1d7f74. Ein Abweichen der beiden Listen in `src/konto/` fiele heute nur im Job `e2e` auf (approveWithSignature und spend gegen den Vertrag im Harness), kein Unit-Test vergleicht sie.
