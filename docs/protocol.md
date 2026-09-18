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
- Abrechnung: serverseitig nach `usage`, Preis = Listenpreis x 1,3 (Conways Faktor, gemessen),
  Abbuchung atomar mit dem Ledger-Eintrag. Bei `balance_cents` unter dem geschätzten Maximum:
  `402 { "error": "INSUFFICIENT_CREDITS", "details": { "required_cents", "current_balance_cents" } }`
  (Format, das `topupForSandbox` parst).
- `GET /v1/models` -> `{ "data": [ { "id", "provider", "available": true, "pricing": { "input_per_million", "output_per_million" } } ] }`.
  Runtime-Default-Modell ist `gpt-5.2`; der Katalog muss entweder diese ID führen oder der Nutzer
  setzt `inferenceModel`. Der Katalog nennt nur Modelle, die der konfigurierte Provider liefert.

### Registry

`POST /v1/automatons/register` Body
`{ automaton_id, automaton_address, creator_address, name, bio, nonce, signature, payload_hash, genesis_prompt_hash? }`.
`payload_hash = keccak256(JSON.stringify(sortiertes Objekt aus automaton_id, automaton_address, creator_address, name, bio))`,
Signatur EIP-712 Domain `{ name: "AIWS Automaton", version: "1", chainId: 8453 }`, Typ
`Register(string automatonId, string nonce, bytes32 payloadHash)`. Server: Hash nachrechnen,
Signatur gegen `automaton_address` prüfen, speichern. Doppelte `automaton_id` mit anderer
Adresse: `409`. Antwort `200 { "automaton": { ... } }`. Die Runtime ruft es genau einmal und
merkt sich das Ergebnis, auch bei `failed`.

## Phase 2 (nicht in diesem Repo-Stand)

Sandboxes (`/v1/sandboxes`, `/exec`, `/files/*`, `/ports/*`), Social-Relay (`/v1/messages`,
`/messages/poll`, `/messages/count`), Domains (`api.conway.domains`). Phase 1 antwortet auf
`GET /v1/sandboxes` mit `{ "sandboxes": [] }`, auf alles andere davon `501 { "error": "not_implemented" }`.
