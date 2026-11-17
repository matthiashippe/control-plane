Schwere: 2
Goal: konto 04
Befund: Kein Test prüft die Fehlerantworten 400 `invalid_limit` (ungültiges `daily_limit_usdc` wie `"0"`, `"1.5"` oder kein Vielfaches von 10000) und 404 `no_account` (API-Schlüssel ohne Konto) von `/v1/konto/limit`, eine Mutation an `parseLimit` bliebe deshalb grün.
Beleg: `git grep -c -e invalid_limit -e no_account origin/dev -- 'test/konto-limit*.test.ts' test/mcp-automaton.test.ts test/konto-client-limit.test.ts` -> keine Ausgabe, Exit 1 | src/konto/limit.ts:97, src/konto/limit.ts:117, src/handoff/routes.ts:266
Empfehlung: In `test/konto-limit.test.ts` einen Fall für 400 `invalid_limit` mit mehreren ungültigen Werten (Cap danach unverändert) und einen für 404 `no_account` bei GET und POST `/v1/konto/limit` und bei `step: "limit"` von `POST /v1/handoff` ergänzen.
MVP: Funktion, weil ein falsch angenommener Betrag das Tageslimit eines zahlenden Kontos setzt.

Linse Q, Frage 1 (Tests prüfen Verhalten mit Randfall), Merge c141093. Die vorhandenen 400-Fälle in `test/konto-limit.test.ts` (Zeilen 197, 247, 265) prüfen ein Limit unter dem heutigen und falsche Signaturen, nicht das Format des Betrags.
Übernommen: PRO-23679 Glied 3 (2026-11-17)
