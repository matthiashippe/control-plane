Schwere: 1
Goal: hosting 01
Befund: `src/index.ts` bindet den Rückgabewert von `startBillingRound` an `billing` und verwirft ihn sofort mit `void billing;`, nur damit die Textsuche in test/billing-round.test.ts den Block über `const billing = ` findet; der Handle `stop` wird nirgends genutzt.
Beleg: `git show origin/dev:src/index.ts | grep -n billing` -> `104: // \`billing\` stays as a name: the checks of goals/hosting/01 point 3 read this block from its line on.`, `105: const billing = startBillingRound({`, `112: void billing;` | src/index.ts:105, src/index.ts:112
Empfehlung: Mit dem Umbau aus hosting-nacharbeit-2026-11-18-1 `startBillingRound(...)` ohne Bindung aufrufen und `void billing;` samt Kommentar in Zeile 104 streichen.
MVP: Schönheit
