Schwere: 1
Goal: konto 03
Befund: `topUp` in `src/konto/topup.ts` liest `approved_tx` aus `konto_accounts` und führt es in `AccountRow`, verwendet den Wert aber nie; ob die Erlaubnis bestätigt ist, fragt es bei jedem Lauf über `isApproved` die Chain.
Beleg: `git grep -n 'row.approved_tx\|\.approved_tx' origin/dev -- src | wc -l` -> `0` | src/konto/topup.ts:61, src/konto/topup.ts:124, src/konto/topup.ts:141
Empfehlung: `approved_tx` aus dem SELECT und aus `AccountRow` in `src/konto/topup.ts` streichen; die Spalte bleibt, weil `topUp` sie schreibt (src/konto/topup.ts:144) und `ops/konto/sepolia-run.mjs:270` und `test/konto-topup.test.ts:141` sie lesen. `test/konto-topup.test.ts` und `test/konto-topup-pending.test.ts` bleiben unverändert grün.
MVP: Schönheit

Linse Q, Frage 3 (tote Pfade, ungenutzte Werte), Merge c1d7f74. Ob ein gesetztes `approved_tx` den Aufruf `isApproved` sparen soll, berührt konto-kritik-2026-11-15-2 (RPC bei jeder Anfrage) und ist hier nicht verlangt.
