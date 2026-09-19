# Conway-Protokoll aus Sicht des Servers

Quelle: unveränderte Upstream-Runtime `Conway-Research/automaton@d8f8168` (Stand 18.09.2026),
gelesen in `src/identity/provision.ts`, `src/conway/{client,topup,x402,http-client,inference}.ts`,
`src/index.ts`, `src/types.ts`. Alles hier ist Client-Verhalten, das der Server bedienen muss.
Was Conway serverseitig tatsächlich tat, ist nicht bekannt und egal.

## Transport

- Nur HTTPS. Der Runtime-Client (`http-client.ts`) verweigert `http://` außer auf Loopback,
  und Loopback nur bei `allowHttpOnLoopback: true`, was im Upstream fest `false` ist.
  Konsequenz für den Harness: eigenes CA-Zertifikat, `NODE_EXTRA_CA_CERTS` im Runtime-Container.
- Auth-Header ist der API-Key **roh**: `Authorization: cnwy_k_...` (kein `Bearer`). Gilt für
  alle `/v1/*`-Aufrufe außer nonce/verify (ohne Auth) und `api-keys` (Bearer mit access_token).
- Retries: 429/500/502/503/504 mit Backoff, 404 wird vom Client bis zu 3x wiederholt
  (Conway-LB-Bug). Der Client sendet `Idempotency-Key` bei Transfers; der Server muss ihn ehren.
- Der Client hat einen Circuit Breaker (5 Fehler, 60 s offen). Ein Server, der flappt, wird
  minutenweise ignoriert.

## Konfiguration auf Nutzerseite

`~/.automaton/automaton.json`: `conwayApiUrl` (Default `https://api.conway.tech`),
`conwayApiKey`, `sandboxId` (leer = lokale Ausführung, keine Sandbox-Calls), `inferenceModel`
(Default `gpt-5.2`), `socialRelayUrl` (Default `https://social.conway.tech`, DNS tot).
Upstream liest `CONWAY_API_URL` nur in `provision()`, nicht für die laufende Runtime.
`listModels` fragt hart zuerst `https://inference.conway.tech/v1/models`, fällt bei Fehler auf
`${conwayApiUrl}/v1/models` zurück.

## Endpunkte, Phase 1 (ohne Sandboxes)

### Provisionierung (SIWE)

1. `POST /v1/auth/nonce` (ohne Auth) -> `200 { "nonce": "<string>" }`
2. Client baut SIWE-Message (`siwe`-Paket, `prepareMessage()`):
   `domain: "conway.tech"`, `uri: "${conwayApiUrl}/v1/auth/verify"`, `version: "1"`,
   `chainId: 8453`, `statement: "Sign in to Conway as an Automaton to provision an API key."`,
   `nonce`, `issuedAt`. Signatur per `account.signMessage` (EIP-191).
   Server: Message parsen (`siwe`), Nonce muss ausgegeben und unverbraucht sein (TTL 10 min),
   Domain und chainId prüfen, Signatur verifizieren, Nonce verbrauchen.
3. `POST /v1/auth/verify` Body `{ "message": "<siwe text>", "signature": "0x..." }`
   (Solana zusätzlich `chain_type: "solana"`, Phase 1 nicht unterstützt: 400)
   -> `200 { "access_token": "<jwt oder opaque, kurzlebig>" }`
   Fehler: `401 { "error": "Invalid or expired nonce" }` ist der Wortlaut, den Conway heute liefert.
4. `POST /v1/auth/api-keys` Header `Authorization: Bearer <access_token>`,
   Body `{ "name": "conway-automaton" }`
   -> `200 { "key": "cnwy_k_<32 hex>", "key_prefix": "cnwy_k_<8 hex>" }`
   Server: Key nur gehasht speichern (sha256), Prefix im Klartext. Wallet -> beliebig viele Keys.

### Credits

- `GET /v1/credits/balance` -> `200 { "balance_cents": <int> }` (Client akzeptiert auch
  `credits_cents`). Wird pro Heartbeat-Tick gelesen; steuert die Survival-Tiers der Runtime.
- `GET /v1/credits/pricing` -> `200 { "tiers": [ { name, vcpu, memory_mb, disk_gb, monthly_cents } ] }`
  (Sandbox-Tiers; Phase 1 leer erlaubt, Client verträgt `[]`).
- `POST /v1/credits/transfer` (Fallback-Pfad `/v1/credits/transfers`), Header `Idempotency-Key`,
  Body `{ "to_address": "0x..", "amount_cents": <int>, "note"?: string }`
  -> `200 { ... }`. Phase 1: Transfer zwischen zwei Wallets desselben Control Plane, atomar,
  idempotent per Key. Nicht auszahlbar (Regulatorik, siehe Nachfrage-Recherche 6.2).

### Topup über x402 (`/pay`)

Client: `src/conway/topup.ts` + `src/conway/x402.ts`, x402 **v1-Stil, handgebaut**, nicht `@x402/fetch`.

1. `GET /pay/{amountUsd}/{walletAddress}` ohne `X-Payment` -> `402`.
   Tiers: 5, 25, 100, 500, 1000, 2500 USD; andere Beträge 400.
   Angebot im Body (Client liest zuerst Header `X-Payment-Required` als JSON oder base64-JSON,
   dann Body); wir liefern beides identisch:
   ```json
   {
     "x402Version": 1,
     "accepts": [{
       "scheme": "exact",
       "network": "base",
       "maxAmountRequired": "5000000",
       "payTo": "0x<HTC-Wallet>",
       "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
       "maxTimeoutSeconds": 300,
       "resource": "/pay/5/0x...",
       "description": "5 USD credits"
     }]
   }
   ```
   `network` darf `base`, `base-sepolia`, `eip155:8453`, `eip155:84532` sein. Betrag: bei
   `x402Version: 1` und einer Ganzzahl bis 6 Stellen interpretiert der Client sie als **USD mit
   `parseUnits(.., 6)`**, ab 7 Stellen oder v2 als atomare Einheit. `5000000` (7 Stellen) ist
   eindeutig 5 USDC. Sicherer: `"5.000000"` mit Punkt geht immer als Dezimal-USDC.
2. Client signiert EIP-3009 `TransferWithAuthorization` (EIP-712, Domain `USD Coin` v2,
   chainId aus network, verifyingContract = asset), `validAfter = now-60`,
   `validBefore = now + maxTimeoutSeconds`, zufällige 32-Byte-Nonce, und wiederholt den GET mit
   Header `X-Payment: base64(JSON)`:
   ```json
   { "x402Version": 1, "scheme": "exact", "network": "base",
     "payload": { "signature": "0x..", "authorization": { "from", "to", "value", "validAfter", "validBefore", "nonce" } } }
   ```
   Der bezahlte Request hat `retries: 0`; ein Timeout hier heißt: Geld weg, Gutschrift unklar
   (Issue #393). Server-Pflicht: Settlement und Gutschrift in einer Transaktion, Authorization-Nonce
   als Idempotenzschlüssel, Wiederholung derselben Signatur liefert dieselbe Antwort ohne zweite Gutschrift.
3. Antwort `200 { "credits_cents": 500, "balance_cents": <neu>, "tx_hash": "0x.." }`
   (Client liest `credits_cents`, sonst `amount_cents`, sonst `amountUsd*100`).
4. Settlement: Facilitator (`/verify`, `/settle` mit `paymentPayload` + `paymentRequirements`),
   CDP oder PayAI; kein eigener Facilitator (Regulatorik 6.3). Im Harness: lokaler Settler gegen
   Anvil-Fork, der `transferWithAuthorization` selbst sendet. Nur dort.

Bootstrap: Beim Start kauft die Runtime automatisch 5 USD, sobald `balance_cents < 500` und die
USDC-Balance der Wallet (RPC aus `AUTOMATON_RPC_URL`, Default Base Mainnet) über 5 liegt, mit
15 s Gesamt-Timeout. Ein langsames Settlement bricht den Bootstrap ab, die Signatur ist dann
trotzdem unterwegs: Settlement darf nie an den Client-Timeout gekoppelt sein.

### Inferenz

- `POST /v1/chat/completions`, Header `Authorization: <key>` roh, Body OpenAI-Format:
  `model`, `messages` (system/user/assistant/tool, mit `tool_calls` und `tool_call_id`),
  `stream: false`, `max_tokens` oder `max_completion_tokens` (letzteres bei `gpt-5*`, `o*`, `gpt-4.1*`),
  optional `temperature`, `tools` (function-Schema) + `tool_choice: "auto"`. Timeout clientseitig
  `INFERENCE_TIMEOUT_MS`.
- Antwort: `{ id, model, choices: [{ message: { role, content, tool_calls? }, finish_reason }], usage: { prompt_tokens, completion_tokens, total_tokens } }`.
- **Welche Modell-IDs die Runtime anfragt (Harness-Fund 18.09.2026):** nicht das konfigurierte
  `inferenceModel`, sondern die Kandidaten ihrer Routing-Matrix (`src/inference/types.ts`,
  `DEFAULT_ROUTING_MATRIX`): tier high/normal `gpt-5.2` (dann `gpt-5.3` bzw. `gpt-5-mini`),
  low_compute/critical `gpt-5-mini`; `inferenceModel` ist nur Fallback, wenn keine Baseline-ID
  enabled ist. Ein Drop-in-Katalog muss `gpt-5.2`, `gpt-5-mini` und `gpt-5.3` bedienen; das
  Control Plane bildet sie per `CP_MODEL_ALIASES` auf reale Modelle ab und antwortet mit der
  angefragten ID im Feld `model`.
- `GET /v1/models` -> `{ "data": [ { id, provider, owned_by, available, context_window, max_tokens,
  supports_tools, parameter_style, pricing: { input_per_million, output_per_million, input_per_1k, output_per_1k } } ] }`.
  Zwei Leser im Upstream: `conway/client.ts` liest `input_per_million`, die Model-Registry
  (`refreshFromApi`, per Heartbeat) liest `input_per_1k`. `provider` ist `"other"`: die Registry
  deaktiviert beim Start jedes Modell außerhalb ihrer Baseline, dessen Provider nicht `ollama` oder
  `other` ist, und `other` wird sicher über `conwayApiUrl` geroutet (bei `openai`/`anthropic` plus
  eigenem Key in der Config ginge die Runtime am Control Plane vorbei).
- Abrechnung: serverseitig nach `usage`, Verkaufspreis = Listenpreis x 1,3 (Conways Faktor,
  gemessen). Saldo intern in Millicents (1/1000 Cent), Kosten je Call
  `ceil((prompt x in + completion x out) x 0,1 x 1,3)` mc mit Preisen in USD je Million Tokens;
  API zeigt `balance_cents = floor(mc / 1000)`. Abbuchung und Ledger-Zeile (`kind = inference`) in
  einer Transaktion; die Abbuchung übersteigt nie den Saldo, ein Rest steht als `uncollected_mc`
  im meta (Agent bleibt bei 0 = critical statt negativ = dead).
- Vorprüfung vor dem Call: geschätzte Prompt-Tokens (Zeichen/4) plus maximale Ausgabe gegen den
  Saldo; reicht er nicht:
  `402 { "error": "INSUFFICIENT_CREDITS", "details": { "required_cents", "current_balance_cents" } }`
  (Format, das `topupForSandbox` parst; der Agent-Loop versucht bei 402 einen Topup und wiederholt einmal).
- Unbekanntes Modell: `404 { "error": "model_not_found" }`. `stream: true`: 400.
- Provider-Ausfall (kein Guthaben beim Einkauf, Rate-Limit, 5xx, Timeout, Upstream-Fehler im
  200-Body): `503 { "error": "provider_unavailable" }` ohne Abbuchung. Die Runtime behandelt 503
  als retrybar (Backoff, Circuit Breaker) und kauft keine Credits nach, was bei einem 402 passieren
  würde. Ein 400 des Providers auf unseren Body geht als `400 provider_rejected_request` durch.

## Einkauf (Betrieb)

Provider `openrouter` (`CP_PROVIDER=openrouter`, `OPENROUTER_API_KEY`, `CP_OPENROUTER_MODELS`,
Default `openai/gpt-5.2,openai/gpt-5-mini`): OpenAI-kompatible Chat-Completions, Body 1:1 plus
`usage: { include: true }`. Preise beim Start aus `GET /api/v1/models` (USD je Token, mal 1e6),
stündlich erneuert; fehlt ein konfiguriertes Modell, startet das Control Plane nicht.
Default-Aliase `gpt-5.2 -> openai/gpt-5.2`, `gpt-5-mini -> openai/gpt-5-mini` (kein `gpt-5.3`:
OpenRouter führt nur die Codex-Variante, und die Runtime fragt `gpt-5.3` nur, wenn `gpt-5.2`
deaktiviert ist). `usage.cost` (USD) sind die tatsächlichen Einkaufskosten; Abbuchung
`ceil(cost_usd x 100 000 x 1,3)` mc, Ledger-meta mit `cost_usd`, `purchase_mc`, `margin_mc`.
Reasoning-Modelle (gpt-5*) zählen Denk-Tokens zu `completion_tokens`; mit `max_tokens` unter
etwa 100 kommt keine Antwort (Harness-Fund 19.09.2026), die Runtime schickt 2048 bis 8192.
Messung 19.09.2026: fünf Turns der Upstream-Runtime auf `gpt-5.2` mit je rund 12k Prompt-Tokens
kosteten 5,55 Cent Einkauf, 7,22 Cent Abbuchung, 1,67 Cent Marge.

### Registry

`POST /v1/automatons/register` Body
`{ automaton_id, automaton_address, creator_address, name, bio, nonce, signature, payload_hash, genesis_prompt_hash? }`.
`payload_hash = keccak256(toHex(JSON.stringify(sortiertes Objekt aus automaton_id, automaton_address, creator_address, name, bio [, genesis_prompt_hash])))`,
Signatur EIP-712 Domain `{ name: "AIWS Automaton", version: "1", chainId: 8453 }`, Typ
`Register(string automatonId, string nonce, bytes32 payloadHash)`, `nonce` ist eine vom Client
erzeugte UUID (kein Server-Nonce).

Server: Hash nachrechnen (400 `payload_hash_mismatch`), Signatur gegen `automaton_address`
prüfen (401), `automaton_address` muss die Wallet des API-Keys sein (403), gleiche `automaton_id`
mit anderer Adresse 409, mit gleicher Adresse idempotent 200. Antwort
`200 { "automaton": { automaton_id, automaton_address, creator_address, name, bio, genesis_prompt_hash, registered_at } }`.
Die Runtime ruft es genau einmal und merkt sich das Ergebnis (`registered`, `conflict`, `failed`),
auch bei Fehlern; ein Control Plane, das hier 404 liefert, sieht den Aufruf nie wieder.

### Pricing und Transfer

- `GET /v1/credits/pricing` -> `{ "tiers": [], "topup_tiers_usd": [5, 25, 100, 500, 1000, 2500] }`
  (Sandbox-Tiers erst in Phase 2; der Client mappt `tiers || pricing || []`).
- `POST /v1/credits/transfer` und `/v1/credits/transfers` -> `501 { "error": "not_implemented" }`.
  Phase-1-Entscheidung (STATE.md): Credits sind nicht übertragbar; die Runtime-Tools
  `transfer_credits` und `fund_child` melden dem Agenten den Fehler und laufen weiter.

## Phase 2 (nicht in diesem Repo-Stand)

Sandboxes (`/v1/sandboxes`, `/exec`, `/files/*`, `/ports/*`), Social-Relay (`/v1/messages`,
`/messages/poll`, `/messages/count`), Domains (`api.conway.domains`). Phase 1 antwortet auf
`GET /v1/sandboxes` mit `{ "sandboxes": [] }`, auf alles andere davon `501 { "error": "not_implemented" }`.
