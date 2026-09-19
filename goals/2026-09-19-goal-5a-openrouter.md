# GOAL.md

## Status
DONE (2026-09-19 11:20, Verifier PASS)

## Active Objective
OpenRouter als erster echter Inferenz-Provider: Katalog mit Live-Preisen, Abbuchung nach den
tatsächlichen Einkaufskosten (`usage.cost`) mal 1,3, Provider-Ausfälle werden nicht dem Automaton
angelastet; die unveränderte Upstream-Runtime fährt im Harness echte Turns über OpenRouter.

## Done Condition
- [x] `pnpm test` grün, `test/openrouter.test.ts` mit mindestens 6 Tests (fetch gestubbt, kein
      Netz): Request-Mapping (Modell-ID mit Präfix, `usage.include`, Header), Antwort-Mapping
      inklusive `usage.cost`; Abbuchung = ceil(cost_usd x 100 000 x 1,3) mc, wenn `usage.cost` da
      ist, sonst Listenpreis-Formel; OpenRouter 402/429/5xx -> unser 503 `provider_unavailable`
      ohne Ledger-Zeile; Katalog aus `CP_OPENROUTER_MODELS` mit Preisen aus `/models`; Alias
      `gpt-5.2` -> `openai/gpt-5.2` und `gpt-5-mini` -> `openai/gpt-5-mini` als Default
      Prüfung: `pnpm test` exit 0, `grep -c "it(" test/openrouter.test.ts` >= 6
- [x] `pnpm e2e:openrouter` grün (ein echter Call über OpenRouter, Kosten unter 0,01 USD)
      Prüfung: `OPENROUTER_API_KEY=$(grep '^OPENROUTER_API_KEY=' ~/brain/connectors/secrets.env | cut -d= -f2) pnpm e2e:openrouter`
      exit 0, Ausgabe enthält `OPENROUTER OK model=openai/gpt-5-mini cost_usd=`
- [x] `pnpm e2e:live` grün (Upstream-Runtime gegen OpenRouter im Harness, Budget unter 0,50 USD)
      Prüfung: gleiche Env wie oben, `pnpm e2e:live` exit 0, Ausgabe enthält `LIVE OK turns=` mit
      turns >= 3, `ledger_consistent=true`, `uncollected_mc=0`, `api_errors=0`
- [x] Die Offline-Läufe bleiben grün und brauchen keinen Key
      Prüfung: `env -u OPENROUTER_API_KEY pnpm e2e` enthält `E2E OK`, `pnpm test` ohne Key grün
- [x] Nach den E2E-Läufen ist die Umgebung abgeräumt
      Prüfung: `docker compose -f harness/docker-compose.yml ps -q` ist leer
- [x] goal-verifier PASS

## Acceptance Criteria
- [x] `src/inference/openrouter.ts`: `OpenRouterProvider` implementiert `ChatProvider`;
      `CP_OPENROUTER_MODELS` (Komma-Liste OpenRouter-IDs, Default `openai/gpt-5.2,openai/gpt-5-mini`);
      Preise beim Start aus `GET /api/v1/models` (USD je Token -> je Million), Refresh stündlich;
      `chat()` schickt Body 1:1 plus `usage: { include: true }`, Header `Authorization: Bearer`,
      `HTTP-Referer`, `X-Title`; Timeout 120 s
- [x] `Usage` bekommt optionales `cost_usd`; `costMc()` nutzt es, wenn vorhanden; Ledger-meta
      enthält `cost_usd` und `margin_mc` (Abbuchung minus Einkauf in mc)
- [x] Provider-Fehler (402 kein Guthaben, 429, 5xx, Timeout) -> `503 { error: "provider_unavailable" }`,
      keine Abbuchung, Log-Zeile mit Provider-Status; 4xx auf unseren Body (400) -> 400 durchgereicht
- [x] Harness: `CP_PROVIDER` und `CP_MODEL_ALIASES` per Env überschreibbar (`e2e:live` setzt
      `openrouter`), `OPENROUTER_API_KEY` wird nur aus der Umgebung des Hosts durchgereicht, nie in
      Dateien; `e2e:live` bricht ohne Key mit klarer Meldung ab
- [x] `docs/protocol.md` und README: Einkaufsquelle, Alias-Default, Kostenformel
- [x] Key erscheint in keiner Ausgabe, keinem Log, keiner Datei im Repo
      (`git grep -nE 'sk-or-v1-[0-9a-f]{20,}'` leer; der Test-Fake `sk-or-v1-test` zählt nicht)

## Deny List
- Kein `deploy/`, kein Mainnet, kein Facilitator-Code (Goal 5b)
- Kein Patch an der Runtime

## Budget
- max Zyklen: 8
- max Versuche pro Gap: 3
- OpenRouter-Ausgaben in diesem Goal: unter 2 USD gesamt

## Progress Log
- 2026-09-19 11:05 Zyklus 1: OpenRouterProvider (Katalog aus /models, Refresh, usage.cost), Provider-Fehlerklassen und 503/400-Mapping im Proxy, purchase_mc/margin_mc im Ledger, Default-Aliase, Compose per Env umschaltbar, setup.live.json (maxTurnsPerCycle 6), openrouter-smoke.ts, live.sh, 9 Unit-Tests. Fund: gpt-5-mini liefert mit max_tokens 16 leeren Content (Reasoning-Tokens). Eigene Läufe: OPENROUTER OK cost_usd=0.00017875; LIVE OK turns=5 api_errors=0 ledger_consistent=true uncollected_mc=0 cost_usd=0.055499 (Marge 1665 mc); E2E OK ohne Key; 47 Unit-Tests. Verifier ausstehend.
- 2026-09-19 11:20 Verifier (Sonnet): PASS. Eigene Läufe: 47/47 Unit, OPENROUTER OK cost_usd=0.00019475, LIVE OK turns=5 api_errors=0 ledger_consistent=true uncollected_mc=0 cost_usd=0.047168, E2E OK ohne Key, Key-Guard exit 2, Key-Leak-Grep leer.

## Blockers
