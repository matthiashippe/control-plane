# control-plane

A drop-in replacement for `api.conway.tech`: the subset of the Conway API that the unmodified
[automaton runtime](https://github.com/Conway-Research/automaton) actually calls. An automaton
owner changes one line in `~/.automaton/automaton.json` and keeps running:

```json
"conwayApiUrl": "https://cp.hippe.eu"
```

Conway stopped onboarding automatons in July 2026: `POST /v1/auth/verify` answers 500 or 401 for
every fresh wallet, and nine open issues describe the same wall (#339, #353, #355, #356, #359,
#372, #376, #377, #379). This service exists because my own automaton needed a control plane.

**Hosted instance: https://cp.hippe.eu** (live status at `/v1/status`). You can also run your own;
see the license below for what "your own" covers.

## What it implements

| Endpoint | Purpose |
|---|---|
| `POST /v1/auth/nonce`, `/v1/auth/verify`, `/v1/auth/api-keys` | SIWE provisioning, API key per wallet |
| `GET /v1/credits/balance`, `/v1/credits/pricing` | prepaid usage balance, tiers |
| `GET /pay/{usd}/{address}` | x402 top-up (USDC on Base, EIP-3009), settled by an external facilitator |
| `POST /v1/chat/completions`, `GET /v1/models` | OpenAI-compatible inference with tools, metered server side |
| `POST /v1/automatons/register` | registry, EIP-712 signature checked |
| `GET /`, `/health`, `/v1/status` | landing page and public status |

Not implemented: sandboxes, hosted ports, file APIs, the social relay and domains (all answer 501).
Credit transfers between wallets are disabled on purpose.

Two findings from building this, both documented in `docs/protocol.md`, both relevant to anyone
writing a compatible server:

- The runtime does **not** ask for the model in `inferenceModel` during agent turns. It asks for
  the candidates of its own routing matrix (`gpt-5.2`, `gpt-5-mini`, `gpt-5.3`), so a catalog that
  only offers its own model IDs gets five 404s and the agent goes to sleep. This server serves
  those names as aliases.
- The bootstrap top-up on first start has a hard 15 second timeout. If settlement is slower, the
  runtime gives up but the signed payment is still on its way (upstream issue #393). Settlement
  here is never tied to the client connection, and the authorization nonce is the idempotency key,
  so a replayed signature credits exactly once.

## Pricing, in one sentence

Credits cost what the inference costs the operator, times 1.3. The ledger stores the purchase
cost and the margin for every call. Credits are usage balance only: not transferable, not
redeemable for money.

## Run it yourself

```bash
pnpm install
pnpm test                      # unit tests, no network
pnpm e2e                       # full harness: unmodified runtime d8f8168 in Docker against
                               # this server, local Anvil chain, mock provider, no real money
pnpm dev                       # local, http://127.0.0.1:8402
```

The harness in `harness/` is the point of this repo as much as the server is: it boots the
**unmodified** upstream runtime against a local chain and verifies a complete first run
(provisioning, registration, top-up, five turns, sleep). `deploy/` holds the production setup
(Docker Compose plus Caddy). Configuration is documented in `deploy/.env.example`.

## How this was built

Every feature in this repo was built as a goal with a machine-checkable done condition
(`goals/`), implemented in one session and then verified by a separate agent that runs the checks
itself and rejects by default. Three of those verifications came back REJECT, and the log of what
was found is in `loop-run-log.md`. The method is [loop
engineering](https://github.com/cobusgreyling/loop-engineering); `LOOP.md` and `loop-constraints.md`
are the operating rules, `STATE.md` is the current queue.

## License

[PolyForm Noncommercial 1.0.0](LICENSE.md): read it, audit it, run it for yourself, change it.
Selling it as a service needs a commercial license (matthias@hanseatictech.de).

Operated by Hanseatic Tech Company, Hamburg. Not affiliated with Conway Research.
