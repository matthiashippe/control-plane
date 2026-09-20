# Keeping an automaton running without a control plane

This page belongs to a paid control plane, and it describes how to keep the automaton runtime
working **without us** now that `api.conway.tech` no longer provisions anyone. It costs nothing but
effort. Both routes below were run end to end on a real machine, not just read out of the source.

Every code reference points at the pinned upstream revision
[`Conway-Research/automaton@d8f8168`](https://github.com/Conway-Research/automaton/tree/d8f8168).

## Why the agent does not think at all when it cannot reach a balance

The API key itself is never checked. `loadApiKeyFromConfig` (`src/identity/provision.ts:25`) reads
`apiKey` from `~/.automaton/config.json` and returns it, and the HTTP client attaches it as an
`Authorization` header without validating anything (`src/conway/client.ts:60`). Any string will do
to get the runtime started. Without the file it aborts with `No API key found. Run: automaton
--provision`.

The real stop is one layer down, at the money. If `/v1/credits/balance` is unreachable and no
balance is cached, `getFinancialState` returns the sentinel `creditsCents: -1`
(`src/agent/loop.ts:977-984`). `getSurvivalTier` maps every negative value to `"dead"`
(`src/conway/credits.ts:38-44`), and in the routing matrix `dead` has an empty candidate list for
every task type (`src/inference/types.ts:169-175`). The fallback below it only admits models whose
`tierMinimum` the current rank reaches, and `dead` has rank 0 (`src/inference/router.ts:193-196,
218-226`). No candidate, no request, zero tokens.

One detail worth knowing: **zero credits is not the dead state.** `getSurvivalTier` still returns
`"critical"` at a balance of 0 and only returns `"dead"` for a negative value
(`src/conway/credits.ts:38-44`). Being broke means you keep thinking, on the small model. Being
unable to reach your billing server means you do not think at all. That asymmetry is the whole
point of this page.

Reproduced on 19 September 2026 in a container, upstream `d8f8168`, with `conwayApiUrl` pointed at
`https://127.0.0.1:9`: `[THINK] Routing inference (tier: dead, model: gpt-5-mini)`, then turn after
turn of `0 tools, 0 tokens`, and not one outbound inference request.

## Route 1: local models through Ollama

This is the clean one. Ollama models are written into the registry at cost 0
(`src/ollama/discover.ts:70-90`), and the router lets free models through at any tier, including
`dead`, because the condition reads `isFree || tierOk` (`src/inference/router.ts:222-226`).

Three things in `~/.automaton/automaton.json`:

```json
{
  "ollamaBaseUrl": "http://127.0.0.1:11434",
  "modelStrategy": {
    "inferenceModel": "qwen2.5-coder:32b",
    "criticalModel": "qwen2.5-coder:32b",
    "lowComputeModel": "qwen2.5-coder:32b"
  }
}
```

The environment variable `OLLAMA_BASE_URL` works too and takes precedence over the config file
(`src/index.ts:281`).

**The trap everyone falls into:** there are two fields named `inferenceModel`. The top-level one is
not the one the router reads. The router takes `modelStrategy` (`src/inference/router.ts:211-216`),
and the setup wizard keeps writing `gpt-5.2` and `gpt-5-mini` in there even when the top-level
field already names your local model. We measured exactly this case: Ollama was reachable, the
model was registered (`Ollama: registered 1 model(s)`), and the runtime still went through every
turn at `tier: dead, model: gpt-5-mini` with 0 tokens. Only after `modelStrategy.inferenceModel`
pointed at the local model did the log read `Routing inference (tier: dead, model: <local model>)`
and the turn end with 18 tokens fetched from the local server.

After that the agent keeps thinking on your own hardware. What it can no longer do: paid inference,
sandboxes, and anything else that assumes a balance.

## Route 2: set the balance locally

If you want to use your own OpenAI key, you have to lift the tier, and the way in is the cache
path. When the balance call fails, the runtime reads the key `last_known_balance` from its local KV
table and uses that value instead of the sentinel (`src/agent/loop.ts:961-976`).

```bash
sqlite3 ~/.automaton/state.db \
  "INSERT OR REPLACE INTO kv (key, value, updated_at)
   VALUES ('last_known_balance', '{\"creditsCents\":5000,\"usdcBalance\":0}', datetime('now'));"
```

Then put your own key into `automaton.json` as `openaiApiKey`; the runtime copies it into
`OPENAI_API_KEY` at startup (`src/agent/loop.ts:139-140`).

Measured: after the insert, the log reads `Balance API failed, using cached balance` and
`Routing inference (tier: high, ...)` instead of `dead`, and the inference request actually leaves
the machine. In our test with a deliberately invalid key it came back as `Inference error (openai):
401: Incorrect API key provided`, which proves precisely the thing worth proving here: the request
gets out, and the billing layer is no longer standing in its way.

Said plainly, because it should be: this writes into the runtime's internal state. The entry is a
claim about money that nothing backs. As long as the runtime only spends your own key, it hurts
nobody but your OpenAI bill. If you set it, know that everything the agent believes about its own
finances from then on is fiction, including what it believes about its own survival.

## Route 3: a fork that has already packaged route 1

[`Kiwi172/automaton-local`](https://github.com/Kiwi172/automaton-local) takes the manual work of
route 1 off your hands: one `docker compose up`, and runtime, Ollama server and wallet daemon come
up together in a single container. The host needs Docker and nothing else, no Node, no Ollama
install. It changes 59 files against upstream and sits one commit behind `main` (checked
20 September 2026).

What you should know before spending time on it: the fork was built on 24 and 25 August 2026 and
has not been touched since. It has one star and no forks, so nobody outside its author has
demonstrably run it. The route is shorter than route 1, and if something breaks you are on your own
with it.

We name it anyway, because it solves the same problem we do and costs nothing.

## When you do not need us

If any of these is true, take one of the routes above and keep your money:

- You have hardware that runs a decent local model. Then routes 1 and 3 beat any paid service
  permanently, because they cost nothing and belong to nobody.
- You already hold an OpenAI or Anthropic key with credit and do not mind setting the balance
  locally. Then there is nothing here you need.
- You only want to watch an automaton start once and then move on.

What we are for: prepaid credit you top up with USDC on Base in one step, billing at real purchase
cost plus a fixed markup, and a SIWE provisioning that works. That is a convenience, not magic.
Prices and endpoints are at [cp.hippe.eu](https://cp.hippe.eu) and in `/v1/status`.

## What we do not know

How much work either route is in your particular case depends on your machine and on how far into
the runtime you are willing to read. Nobody can put an honest hour count on that. Neither route
appears in any upstream documentation; you find them by reading the code, or by reading this page.
