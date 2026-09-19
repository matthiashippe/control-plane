# Error responses

Every error this control plane returns carries three things: the machine-readable `error` field,
a `message` in plain English that says what happened and what to do next, and a `docs` link into
this page. Older integrations only looked at the status code and at `error`, and both of those are
unchanged: `message` and `docs` were added next to them, never in place of them.

What you will not find in a response body: stack traces, file paths, internal hostnames, or
anything about another wallet on this instance. If an error is ours, the detail stays in our log
and the body says only that the call was not charged.

| Status | `error` | Endpoint | Meaning |
| --- | --- | --- | --- |
| 400 | `invalid_body`, `missing_fields`, `invalid_address`, `payload_hash_mismatch`, `field_too_long` | `/v1/automatons/register` | the registration body does not hold up |
| 400 | `invalid_body`, `model and messages are required`, `streaming_not_supported` | `/v1/chat/completions` | the request body does not hold up |
| 400 | `provider_rejected_request` | `/v1/chat/completions` | the upstream model provider refused the body |
| 400 | `invalid_tier`, `invalid_address` | `/pay/{usd}/{address}` | the URL asks for something that is not sold here |
| 401 | `Invalid API key`, `Bearer token required`, SIWE wording | `/v1/*`, `/v1/auth/*` | authentication |
| 401 | `invalid_signature` | `/v1/automatons/register` | the EIP-712 signature does not match |
| 402 | `INSUFFICIENT_CREDITS` | `/v1/chat/completions` | not enough credits for this call |
| 402 | offer, or one of the x402 reasons below | `/pay/{usd}/{address}` | payment required, or the payment was rejected |
| 403 | `address_mismatch` | `/v1/automatons/register` | the key belongs to a different wallet |
| 404 | `model_not_found` | `/v1/chat/completions` | no such model on this instance |
| 404 | `not_found` | any | no such endpoint |
| 409 | `automaton_id_conflict` | `/v1/automatons/register` | the id belongs to another wallet |
| 409 | `settlement_in_progress` | `/pay/{usd}/{address}` | the same authorization is already being settled |
| 429 | `rate_limited` | open endpoints | too many requests without an API key |
| 429 | `too_many_automatons` | `/v1/automatons/register` | this wallet hit the registration cap |
| 500 | `internal_error` | any | our fault, nothing charged |
| 501 | `not_implemented` | sandboxes, credit transfers | deliberately not offered, see below |
| 503 | `payments_unavailable`, `inference_unavailable` | `/pay`, inference | this instance does not offer it |
| 503 | `provider_unavailable` | `/v1/chat/completions` | the upstream model provider did not answer |

## sandboxes

`POST /v1/sandboxes` and everything under `/v1/sandboxes/...` answer `501 not_implemented`, and
that is the intended answer rather than a gap to be fixed.

This control plane sells three things: provisioning, prepaid credits, and inference. It runs no
VMs, so there is no sandbox to boot, exec in, copy files to, or expose a port from. The unmodified
automaton runtime already handles this: when sandbox creation fails it logs `Conway sandbox
unavailable, spawning local worker` and spawns a local worker instead, which keeps the task running
and keeps its inference billed here.

A friendly `200` with a fake sandbox id would be worse than the 501. The runtime would then treat
the sandbox as real, `spawnChild` would create half a child, and the next call against that id
would fail somewhere less obvious.

What you can do: nothing, if you just want your automaton to keep working. To skip the attempt
altogether, set `"sandboxId": ""` in `~/.automaton/automaton.json`, which makes local execution the
normal path.

`GET /v1/sandboxes` answers `200 {"sandboxes": []}`, because an empty list is the truthful answer
to "which sandboxes do I have here".

## credit_transfers

`POST /v1/credits/transfer` and `POST /v1/credits/transfers` answer `501 not_implemented` with
`reason: "credit transfers are disabled in phase 1"`.

This is a regulatory decision, not a missing feature. Credits bought here pay for usage of this
service. They are not money, not redeemable, and not transferable. Credits that can be moved
between wallets on request are close to a payment service, and this instance is run by one person,
not by a licensed institution. The line is drawn where it is cheap to draw it: at the transfer
endpoint.

What you can do instead: send USDC to the other automaton's own wallet and let its runtime buy its
own credits. The runtime bootstraps a $5 topup on its own when its balance runs low and the wallet
holds enough USDC, so funding a child is a wallet-to-wallet transfer plus patience, not an API
call. The runtime tools `transfer_credits` and `fund_child` report this error to the agent and keep
running.

## rate_limited

The endpoints that work without an API key are capped per client address: `/v1/auth/nonce`,
`/v1/auth/verify`, `/v1/auth/api-keys` and `/pay/...`. The default is 60 requests per minute.

The cap exists because each of those calls writes to the database and `/pay` additionally calls a
payment facilitator that charges per settlement. An API key costs nothing to create, so a cap that
sits behind authentication would not help.

The response carries `retry_after_seconds` and a `Retry-After` header; both say how long the
current window still runs. Calls to `/v1/*` with a valid API key are not capped.

## authentication

Three steps, in this order, and the runtime does all of them for you with `automaton --provision`:

1. `POST /v1/auth/nonce` returns a nonce. It is valid for ten minutes and for exactly one verify.
2. `POST /v1/auth/verify` takes the SIWE message and its EIP-191 signature and returns an
   `access_token` that lives ten minutes. The message must use domain `conway.tech` and chainId
   `8453`; the runtime hard-codes both.
3. `POST /v1/auth/api-keys` with `Authorization: Bearer <access_token>` returns the API key
   (`cnwy_k_...`).

On every other `/v1/*` call the API key goes into the `Authorization` header **raw**, without the
`Bearer` prefix. A key from another control plane is not valid here.

The wording in `error` follows what Conway itself returns ("Invalid or expired nonce", "Invalid
signature"), so clients that match on it keep working. The `message` next to it says which of the
three steps to repeat.

## payments

`GET /pay/{usd}/{address}` is an x402 v1 seller. Without an `X-Payment` header it answers `402`
with the offer in `accepts[0]` and in the `X-Payment-Required` header; that 402 is the protocol
working, not an error. Signing the offer and repeating the request settles the payment and credits
the wallet.

Rejections come back as `402` as well, with the reason in `error`:

| `error` | What it means |
| --- | --- |
| `malformed_payment` | the `X-Payment` header is not base64 of the expected x402 v1 JSON |
| `unsupported_scheme` | only the `exact` scheme is settled |
| `wrong_network` | signed for a different network than this instance settles on |
| `wrong_recipient` | the authorization pays an address other than the offer's `payTo` |
| `recipient_must_match_payer` | the signer is not the address in the URL, see below |
| `wrong_amount: expected N` | the signed value is not the tier's amount in atomic USDC units |
| `authorization_expired` | `validBefore` is in the past |
| `authorization_not_yet_valid` | `validAfter` is more than a minute in the future |
| `invalid_signature` | the EIP-3009 signature does not verify against `from` |
| `settlement_failed: ...` | the signed authorization could not be settled on chain |

`recipient_must_match_payer` deserves its own paragraph, because it is a rule and not a bug: the
credits go to the wallet that signed the payment. An EIP-3009 authorization covers the amount, the
receiving address of the USDC and the nonce, but not the URL path that decides who gets the
credits. Without this check, anyone who got hold of a signed header could redirect the credits to
their own address while the USDC kept leaving the signer. The runtime always tops up its own
wallet, so no real flow is restricted.

`settlement_in_progress` (409) means the same authorization nonce is already being settled by
another request. Nothing is lost: the nonce is the idempotency key, a repeat never credits twice.
Wait a few seconds and repeat the identical request to see the result.

`payments_unavailable` (503) means this instance has no payment wallet or no settler configured.
`GET /.well-known/x402` shows whether topups are available before you sign anything.

## model_not_found

`404 model_not_found` means this instance does not serve a model under that id. The `message`
lists the ids it does serve, and `GET /v1/models` has the full catalogue with prices.

Model ids differ between instances on purpose. The runtime does not ask for the model configured in
`automaton.json`; it asks for the candidates of its own routing matrix (`gpt-5.2`, `gpt-5-mini`,
`gpt-5.3`). An operator maps those ids onto the models actually bought upstream, so the same id can
mean different things on two instances, and an id that exists on one can be missing on the other.

## inference

- `402 INSUFFICIENT_CREDITS` carries `details.required_cents` and `details.current_balance_cents`;
  the runtime reads them to pick a topup tier. Nothing is charged for the rejected call. Buy
  credits at `/pay/{usd}/{your wallet}`, or send USDC to the wallet and let the bootstrap topup
  handle it.
- `400 streaming_not_supported`: usage is metered and charged server side from the provider's usage
  report once the answer is complete, which a stream does not give us. Send `"stream": false`.
- `400 provider_rejected_request`: the upstream provider refused the body. Its answer is in
  `details`, usually an unsupported parameter or a malformed tool schema. Nothing was charged;
  retrying unchanged fails the same way.
- `503 provider_unavailable`: the upstream provider did not answer. Nothing was charged and the
  reserved amount was released, so this is never a credit problem. It is retryable with backoff,
  and the runtime does that on its own. The upstream detail stays in the operator's log.
- `503 inference_unavailable`: this instance has no inference provider configured at all.
  `GET /v1/status` lists the models an instance actually serves.

## registration

`POST /v1/automatons/register` is called once by the runtime on its first start. It carries the
identity fields, a `payload_hash` and an EIP-712 signature.

- `payload_hash` is the keccak256 of the JSON of `{automaton_id, automaton_address,
  creator_address, name, bio}` plus `genesis_prompt_hash` when present, keys sorted alphabetically,
  no extra whitespace.
- The signature uses domain `{name: "AIWS Automaton", version: "1", chainId: 8453}` and type
  `Register(string automatonId, string nonce, bytes32 payloadHash)`, signed by the automaton's own
  key.
- `automaton_address` must be the wallet of the API key used for the call: an automaton registers
  itself.
- `field_too_long` names the field and its cap. Registration is free and everything sent here is
  stored, so every stored field has a length limit.
- `too_many_automatons` (429) is the cap of 25 registrations per wallet, for the same reason.
  Each automaton has its own wallet and its own API key, so register the next one from that wallet.
- `automaton_id_conflict` (409) means the id already belongs to a different wallet. Ids are not
  reassigned; pick a new one.

## service errors

`500 internal_error` is our fault. The detail is in the operator's log, the body says only that the
call failed inside the control plane and was not charged. Retry with backoff; if it keeps failing,
the operator wants to know at <https://github.com/matthiashippe/control-plane/issues>.

`404 not_found` means the endpoint does not exist here. This control plane implements the part of
the Conway API that the automaton runtime actually calls; `GET /.well-known/x402` lists it.
