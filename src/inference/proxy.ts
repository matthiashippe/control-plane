/**
 * Inference proxy with server-side charging (docs/protocol.md, section Inferenz).
 *
 * Sale price = list price x MARKUP. Before the call the balance is checked against an estimate
 * (estimated prompt plus maximum output), after the call the actual `usage` is charged, in one
 * transaction together with the ledger row. The charge never exceeds the balance; any remainder is
 * recorded as `uncollected_mc` in the meta, so the agent ends up at 0 (critical) rather than
 * negative (dead).
 */

import { getAvailableMc, getBalanceMc, mcToCents, postLedger, releaseMc, reserveMc, type Db } from "../db.js";
import { RequestCoalescer, requestKey } from "./dedupe.js";
import { DOC } from "../errors.js";
import type { ChatProvider, ChatRequest, ChatResponse, ModelSpec, Usage } from "./provider.js";
import { estimateTokens, ProviderBadRequestError, ProviderUnavailableError } from "./provider.js";
import { grantOnFirstUse } from "../credits/starter.js";

export const MARKUP = 1.3;
const DEFAULT_MAX_TOKENS = 4096;
const HARD_MAX_TOKENS = 32_768;

export interface CatalogEntry {
  spec: ModelSpec;
  provider: ChatProvider;
}

/**
 * Model catalogue with aliases. For agent turns the upstream runtime does not ask for the
 * configured `inferenceModel` but for the candidates of its routing matrix ("gpt-5.2",
 * "gpt-5-mini", "gpt-5.3"; src/inference/types.ts upstream). A drop-in has to serve those IDs, so
 * the operator maps them onto a real model with an alias (`CP_MODEL_ALIASES`).
 */
export class Catalog {
  private readonly entries = new Map<string, CatalogEntry>();
  private readonly aliases = new Map<string, string>();

  constructor(providers: ChatProvider[], aliases: Record<string, string> = {}) {
    for (const provider of providers) {
      for (const spec of provider.models()) this.entries.set(spec.id, { spec, provider });
    }
    for (const [alias, target] of Object.entries(aliases)) {
      if (!this.entries.has(target)) throw new Error(`alias ${alias} points at unknown model ${target}`);
      if (this.entries.has(alias)) throw new Error(`alias ${alias} collides with a model`);
      this.aliases.set(alias, target);
    }
  }

  get(model: string): CatalogEntry | undefined {
    return this.entries.get(this.aliases.get(model) ?? model);
  }

  /** Every requestable ID, real models first, aliases after. For error messages. */
  modelIds(): string[] {
    return [...this.entries.keys(), ...this.aliases.keys()];
  }

  /**
   * Answer for GET /v1/models with sale prices. Two readers upstream: the Conway client reads
   * `input_per_million`, the model registry (refreshFromApi) reads `input_per_1k`; both get their
   * field. `provider` is "other" because on start the runtime disables every model that is neither
   * in its baseline nor has provider "ollama"/"other", and because "other" is reliably routed
   * through the control plane (no direct OpenAI/Anthropic path).
   */
  listModels(): { data: Array<Record<string, unknown>> } {
    const rows: Array<Record<string, unknown>> = [];
    const describe = (id: string, spec: ModelSpec, provider: ChatProvider) => ({
      id,
      object: "model",
      provider: "other",
      owned_by: provider.id,
      upstream_model: spec.id,
      available: true,
      context_window: spec.contextWindow,
      max_tokens: HARD_MAX_TOKENS,
      supports_tools: true,
      parameter_style: /^(o[1-9]|gpt-5|gpt-4\.1)/.test(id) ? "max_completion_tokens" : "max_tokens",
      pricing: {
        input_per_million: sellPrice(spec.inputPerMillion),
        output_per_million: sellPrice(spec.outputPerMillion),
        input_per_1k: sellPrice(spec.inputPerMillion) / 1000,
        output_per_1k: sellPrice(spec.outputPerMillion) / 1000,
      },
    });
    for (const [id, { spec, provider }] of this.entries) rows.push(describe(id, spec, provider));
    for (const [alias, target] of this.aliases) {
      const entry = this.entries.get(target)!;
      rows.push(describe(alias, entry.spec, entry.provider));
    }
    return { data: rows };
  }
}

/** `CP_MODEL_ALIASES="gpt-5.2=claude-sonnet-5,gpt-5-mini=claude-haiku-4-5"` */
export function aliasesFromEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (env.CP_MODEL_ALIASES || "").split(",")) {
    const [alias, target] = pair.split("=").map((s) => s.trim());
    if (alias && target) out[alias] = target;
  }
  return out;
}

export function sellPrice(listUsdPerMillion: number): number {
  return Math.round(listUsdPerMillion * MARKUP * 10_000) / 10_000;
}

const MC_PER_USD = 100_000;

/**
 * Cost in millicents. If the provider reports the actual purchase cost (`cost_usd`), that one
 * times the markup applies; otherwise the list price: USD per 1M tokens is also micro-USD per
 * token, 1 micro-USD = 0.1 mc, times the markup.
 */
export function costMc(spec: ModelSpec, usage: Pick<Usage, "prompt_tokens" | "completion_tokens" | "cost_usd">): number {
  if (typeof usage.cost_usd === "number" && Number.isFinite(usage.cost_usd) && usage.cost_usd >= 0) {
    return Math.ceil(usage.cost_usd * MC_PER_USD * MARKUP);
  }
  const microUsd = usage.prompt_tokens * spec.inputPerMillion + usage.completion_tokens * spec.outputPerMillion;
  return Math.ceil(microUsd * 0.1 * MARKUP);
}

/** Purchase cost in mc (without markup), for the margin column in the ledger. */
export function purchaseMc(spec: ModelSpec, usage: Pick<Usage, "prompt_tokens" | "completion_tokens" | "cost_usd">): number {
  if (typeof usage.cost_usd === "number" && Number.isFinite(usage.cost_usd) && usage.cost_usd >= 0) {
    return Math.ceil(usage.cost_usd * MC_PER_USD);
  }
  const microUsd = usage.prompt_tokens * spec.inputPerMillion + usage.completion_tokens * spec.outputPerMillion;
  return Math.ceil(microUsd * 0.1);
}

export interface ChatResult {
  status: number;
  body: Record<string, unknown> | ChatResponse;
}

/**
 * Process-wide, because the service runs as a single container (see `src/ratelimit.ts` for the
 * same assumption). A second process on the same database is ruled out anyway, which
 * `deploy/README.md` explains under "Warum kein echtes Blau/Gruen".
 */
const coalescer = new RequestCoalescer<ChatResult>();

/** For tests only: how many requests are running right now. */
export function inflightRequests(): number {
  return coalescer.inflightCount();
}

export async function handleChat(db: Db, catalog: Catalog, address: string, body: unknown): Promise<ChatResult> {
  // If an identical request for the same address is already running, wait for its result instead
  // of buying and charging a second time. See `dedupe.ts` for the reason.
  const key = requestKey(address, body);
  const { value, coalesced } = await coalescer.run(key, () =>
    handleChatUncoalesced(db, catalog, address, body),
  );
  if (coalesced) {
    console.log(`[inference] coalesced an identical request into one already running (${key.slice(0, 12)})`);
  }
  return value;
}

async function handleChatUncoalesced(
  db: Db,
  catalog: Catalog,
  address: string,
  body: unknown,
): Promise<ChatResult> {
  if (typeof body !== "object" || body === null) {
    return {
      status: 400,
      body: {
        error: "invalid_body",
        message:
          "The body must be JSON in the OpenAI chat completions format: " +
          '{"model": "...", "messages": [...]}. Check the Content-Type header as well.',
        docs: DOC.inference,
      },
    };
  }
  const req = body as Partial<ChatRequest>;
  if (typeof req.model !== "string" || !Array.isArray(req.messages)) {
    return {
      status: 400,
      body: {
        error: "model and messages are required",
        message:
          'Send "model" as a string and "messages" as an array of {role, content} objects, like ' +
          "any OpenAI-compatible endpoint. GET /v1/models lists the model IDs this instance serves.",
        docs: DOC.inference,
      },
    };
  }
  if (req.stream) {
    return {
      status: 400,
      body: {
        error: "streaming_not_supported",
        message:
          "This endpoint does not stream. Usage is metered and charged server side from the " +
          "provider's usage report once the answer is complete, which a stream does not give us. " +
          'Send "stream": false, as the automaton runtime does.',
        docs: DOC.inference,
      },
    };
  }

  const entry = catalog.get(req.model);
  if (!entry) {
    // Which IDs exist belongs in the answer: the runtime asks for the candidates of its routing
    // matrix ("gpt-5.2", "gpt-5-mini", "gpt-5.3") and not for the configured model, and whoever
    // does not serve one of them would otherwise search at the wrong end.
    const available = catalog.modelIds();
    const shown = available.slice(0, 12);
    const rest = available.length - shown.length;
    return {
      status: 404,
      body: {
        error: "model_not_found",
        model: req.model,
        message:
          `This instance does not serve a model called "${req.model}". Available: ` +
          `${shown.join(", ")}${rest > 0 ? ` and ${rest} more` : ""}. ` +
          "GET /v1/models has the full catalogue with prices; the IDs the runtime asks for are " +
          "mapped to real models by the operator, so the list differs between instances.",
        docs: DOC.models,
      },
    };
  }

  const requested = req.max_completion_tokens ?? req.max_tokens ?? DEFAULT_MAX_TOKENS;
  const maxTokens = Math.max(1, Math.min(HARD_MAX_TOKENS, Math.floor(Number(requested) || DEFAULT_MAX_TOKENS)));

  const estimatedPrompt = estimateTokens(req.messages, req.tools);
  const requiredMc = costMc(entry.spec, { prompt_tokens: estimatedPrompt, completion_tokens: maxTokens });

  // Reserve instead of merely checking. Between the check and the charge sits the provider call,
  // that is an `await`: whoever only reads the balance here lets any number of concurrent calls see
  // the same funds. With 1 USD of credit and 200 parallel requests roughly 65 USD of real purchase
  // cost was reachable that way (security review 19.09.2026). `reserveMc` decides atomically in the
  // database and is therefore closed against that race.
  // A call that cannot pay for itself takes the starter credit first, and only bounces if that
  // does not exist or does not cover it. `grantOnFirstUse` says why the grant is taken here and
  // not at the endpoint built for it: a Conway runtime speaks the upstream API and never calls it,
  // so for the agents this service is trying to attract the free tier was invisible.
  let reserved = reserveMc(db, address, requiredMc);
  if (!reserved && grantOnFirstUse(db, address)) {
    reserved = reserveMc(db, address, requiredMc);
  }

  if (!reserved) {
    const availableMc = getAvailableMc(db, address);
    return {
      status: 402,
      body: {
        error: "INSUFFICIENT_CREDITS",
        // Wording and `details` stay as they are: the runtime looks for the marker anywhere in the
        // body and reads `details.required_cents`/`details.current_balance_cents` to pick the topup
        // tier (upstream `src/conway/topup.ts:103`). Only the way to buy more is appended.
        message:
          `Insufficient credits: need ${mcToCents(requiredMc) + 1} cents, have ${mcToCents(availableMc)} cents. ` +
          "Buy credits with GET /pay/{usd}/{this wallet} and sign the x402 offer, or send USDC to " +
          "the wallet and let the runtime's bootstrap topup do it. Nothing was charged for this call.",
        docs: DOC.inference,
        details: {
          required_cents: Math.ceil(requiredMc / 1000),
          current_balance_cents: mcToCents(availableMc),
          model: req.model,
        },
      },
    };
  }

  let response: ChatResponse;
  try {
    response = await entry.provider.chat({ ...(req as ChatRequest), model: entry.spec.id, maxTokens, apiKeyId: address });
  } catch (err) {
    // Every exit without a booking has to give the reservation back, otherwise the tenant's credit
    // stays blocked for good.
    releaseMc(db, address, requiredMc);
    if (err instanceof ProviderUnavailableError) {
      // The upstream text stays in the log. It used to go out with the answer, and that is wrong
      // twice over: it leaks the state of our purchasing, and it does not tell the reader what they
      // can do. What they need to know is that it is not their credit.
      console.error(`[inference] provider ${err.provider} unavailable (status ${err.upstreamStatus ?? "none"}): ${err.message}`);
      return {
        status: 503,
        body: {
          error: "provider_unavailable",
          provider: err.provider,
          message:
            "The upstream model provider did not answer this request. Nothing was charged and the " +
            "reserved amount was released, so this is not a credit problem. It is retryable: back " +
            "off and try again, the runtime does that on its own. If it holds for more than a few " +
            "minutes, GET /v1/status tells you which models the instance still serves.",
          docs: DOC.inference,
        },
      };
    }
    if (err instanceof ProviderBadRequestError) {
      return {
        status: 400,
        body: {
          error: "provider_rejected_request",
          provider: err.provider,
          details: err.body,
          message:
            "The model provider rejected this request body; its answer is in `details`. Usually a " +
            "parameter it does not support or a malformed tool schema. Nothing was charged. Fix " +
            "the body and retry; retrying unchanged will fail the same way.",
          docs: DOC.inference,
        },
      };
    }
    throw err;
  }
  // From here on nothing may end without releasing the reservation. The counter-check of
  // 19.09.2026 showed that an error after the provider answer (incomplete `usage`, a database write
  // failing on a full disk) otherwise blocks the tenant's credit until the process restarts.
  let booked = false;
  try {
    // The client should see the ID it asked for again (alias or real ID).
    response.model = req.model;

    const actualMc = costMc(entry.spec, response.usage);
    const boughtMc = purchaseMc(entry.spec, response.usage);
    // The balance covers at least the reservation; more can only come up if the prompt estimate was
    // too low. Then what is there gets charged and the remainder is recorded as `uncollected_mc`.
    const balanceNow = getBalanceMc(db, address);
    const chargeMc = Math.min(actualMc, balanceNow);
    postLedger(db, {
      address,
      kind: "inference",
      deltaMc: -chargeMc,
      releaseReservedMc: requiredMc,
      ref: response.id,
      meta: {
        model: entry.spec.id,
        requested_model: req.model,
        provider: entry.provider.id,
        usage: response.usage,
        cost_mc: actualMc,
        cost_usd: response.usage.cost_usd ?? null,
        purchase_mc: boughtMc,
        margin_mc: chargeMc - boughtMc,
        uncollected_mc: actualMc - chargeMc,
      },
    });
    booked = true;
  } finally {
    // postLedger releases the reservation itself. Only if it never got that far does it have to be
    // released here.
    if (!booked) releaseMc(db, address, requiredMc);
  }

  return { status: 200, body: response };
}

export function providersFromEnv(env: NodeJS.ProcessEnv, factories: Record<string, () => ChatProvider>): ChatProvider[] {
  const ids = (env.CP_PROVIDER || "").split(",").map((s) => s.trim()).filter(Boolean);
  return ids.map((id) => {
    const make = factories[id];
    if (!make) throw new Error(`unknown CP_PROVIDER: ${id}`);
    return make();
  });
}
