# GOAL.md

## Status
ACTIVE

## Active Objective
Inferenz: `POST /v1/chat/completions` als Proxy über ein Provider-Interface mit serverseitiger
Abbuchung (Listenpreis x 1,3); die unveränderte Upstream-Runtime fährt nach dem Bootstrap-Topup
fünf Turns mit Tool-Calls gegen einen Mock-Provider, jeder Call ist eine Ledger-Zeile, und ein
leeres Konto bekommt das 402-Format, das die Runtime versteht.

## Done Condition
- [ ] `pnpm test` grün, `test/inference.test.ts` mit mindestens 6 Tests: Proxy antwortet im
      OpenAI-Format mit `usage`; Kosten = ceil(prompt x in + completion x out) x 1,3 in Millicents,
      Ledger-Zeile `kind = inference` pro Call; Saldo sinkt exakt um die Summe; leeres Konto -> 402
      `{ error: "INSUFFICIENT_CREDITS", details: { required_cents, current_balance_cents } }`;
      unbekanntes Modell -> 404; `/v1/models` liefert `data[]` mit `pricing.input_per_million` =
      Listenpreis x 1,3; Abbuchung übersteigt nie den Saldo (Rest als `uncollected_mc` im meta)
      Prüfung: `pnpm test` exit 0, `grep -c "it(" test/inference.test.ts` >= 6
- [ ] `pnpm e2e:inference` grün
      Prüfung: `pnpm e2e:inference` exit 0, Ausgabe enthält `INFERENCE OK turns=5` und
      `ledger_consistent=true` (500 000 mc Topup minus Summe der Inferenz-Abbuchungen == Saldo)
- [ ] Topup- und Smoke-Test bleiben grün
      Prüfung: `pnpm e2e:topup` enthält `TOPUP OK`, `pnpm e2e:smoke` enthält `SMOKE OK`
- [ ] Nach den E2E-Läufen ist die Umgebung abgeräumt
      Prüfung: `docker compose -f harness/docker-compose.yml ps -q` ist leer
- [ ] goal-verifier PASS

## Acceptance Criteria
- [ ] Saldo intern in Millicents (`balance_mc`, `delta_mc`), API weiter `balance_cents` =
      floor(mc / 1000); Topup 5 USD = 500 000 mc. Tests aus Goal 1 und 2 auf Millicents angepasst,
      ohne Assertions abzuschwächen
- [ ] `ChatProvider`-Interface (`id`, `models()`, `chat(req)`) in `src/inference/provider.ts`;
      `MockProvider` (`CP_PROVIDER=mock`) antwortet deterministisch: Requests 1 bis 4 je ein
      Tool-Call aus der Liste (check_credits, system_synopsis, list_models, view_soul), sofern im
      `tools`-Array angeboten, Request 5 ein `sleep`-Tool-Call mit `duration_seconds` 600; danach Text
- [ ] `POST /v1/chat/completions`: Header `Authorization: <key>` roh; Body OpenAI-Format mit
      `tools`/`tool_choice`, `max_tokens` oder `max_completion_tokens`; Vorprüfung
      (geschätzte Prompt-Tokens + max Tokens) gegen den Saldo -> 402; Antwort mit `usage`;
      Abbuchung nach tatsächlicher `usage` in einer Transaktion mit der Ledger-Zeile
- [ ] `GET /v1/models`: `{ data: [{ id, provider, available: true, pricing: { input_per_million,
      output_per_million } }] }` mit Verkaufspreisen (Listenpreis x 1,3)
- [ ] Harness: Runtime-Konfiguration `inferenceModel: "mock-1"` in setup.json; `inference.sh`
      wartet auf fünf `Turn`-Zeilen im Runtime-Log, liest Saldo und Ledger und prüft Konsistenz
- [ ] `docs/protocol.md` Abschnitt Inferenz um Millicents und Vorprüfung ergänzt
- [ ] Katalog-Aliase (`CP_MODEL_ALIASES`): die Runtime fragt für Agent-Turns `gpt-5.2`/`gpt-5-mini`
      aus ihrer Routing-Matrix statt `inferenceModel` (Harness-Fund in Zyklus 1); Aliase lösen auf
      das reale Modell auf, `/v1/models` listet sie mit `provider: "other"` und beiden Preisfeldern
      (`input_per_million`, `input_per_1k`); Fund in docs/protocol.md dokumentiert

## Deny List
- Kein echter Provider (Anthropic kommt in Goal 5), kein Netzzugriff aus dem Provider
- Kein Register/Transfer (Goal 4), kein `deploy/`, kein Patch an der Runtime

## Budget
- max Zyklen: 8
- max Versuche pro Gap: 3

## Progress Log
- 2026-09-18 22:15 Zyklus 1: Millicents-Umstellung (db, pay, Tests), Provider-Interface, MockProvider, Catalog + Proxy mit Vorprüfung/402/Abbuchung, /v1/models, inference.sh. Erster E2E-Lauf scheiterte: Runtime fragt `gpt-5.2` statt `inferenceModel` (Routing-Matrix). Fix: Katalog-Aliase, `provider: "other"`, `input_per_1k`. Danach INFERENCE OK turns=5 balance_cents=489 inference_rows=5 ledger_consistent=true; topup.sh an laufende Inferenz angepasst (Gutschrift 500 000 mc in einer Zeile statt Saldo == 500); TOPUP OK, SMOKE OK; 30 Unit-Tests. Verifier ausstehend.

## Blockers
