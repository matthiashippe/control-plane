Schwere: 1
Goal: kunden 06
Befund: `RUNTIME_KEY_NAME` in `src/credits/starter.ts` soll laut Kommentar der Name sein, den SIWE einem Schlüssel ohne Namen gibt, aber `src/auth/siwe.ts` und `src/app.ts` schreiben dafür weiter das Literal; ändert sich der Standard dort, gibt `grantOnFirstRead` still keine Gutschrift mehr.
Beleg: `git grep -n -E 'name \|\| "conway-automaton"|body.name \?\? "conway-automaton"' origin/dev -- src/` -> src/auth/siwe.ts:204, src/app.ts:2536 | src/credits/starter.ts:458
Empfehlung: An beiden Stellen `RUNTIME_KEY_NAME` importieren statt des Literals.

Linse Q, Frage 2.

Übernommen: Teil von Glied 3 an den Tech Lead, `RUNTIME_KEY_NAME` statt Literal (PRO-26356) (2026-11-21)
