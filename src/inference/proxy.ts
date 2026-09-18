/**
 * Inferenz-Proxy mit serverseitiger Abbuchung (docs/protocol.md, Abschnitt Inferenz).
 *
 * Verkaufspreis = Listenpreis x MARKUP. Vor dem Call wird gegen den Saldo geschätzt (Prompt-
 * Schätzung plus maximale Ausgabe), nach dem Call nach tatsächlicher `usage` abgebucht, in einer
 * Transaktion mit der Ledger-Zeile. Die Abbuchung übersteigt nie den Saldo; ein Rest landet als
 * `uncollected_mc` im meta, damit der Agent bei 0 stehen bleibt (critical) statt negativ (dead).
 */

import { getBalanceMc, mcToCents, postLedger, type Db } from "../db.js";
import type { ChatProvider, ChatRequest, ChatResponse, ModelSpec, Usage } from "./provider.js";
import { estimateTokens } from "./provider.js";

export const MARKUP = 1.3;
const DEFAULT_MAX_TOKENS = 4096;
const HARD_MAX_TOKENS = 32_768;

export interface CatalogEntry {
  spec: ModelSpec;
  provider: ChatProvider;
}

/**
 * Modellkatalog mit Aliasen. Die Upstream-Runtime fragt für Agent-Turns nicht das konfigurierte
 * `inferenceModel`, sondern die Kandidaten ihrer Routing-Matrix ("gpt-5.2", "gpt-5-mini",
 * "gpt-5.3"; src/inference/types.ts im Upstream). Ein Drop-in muss diese IDs bedienen, also
 * bildet der Betreiber sie per Alias auf ein reales Modell ab (`CP_MODEL_ALIASES`).
 */
export class Catalog {
  private readonly entries = new Map<string, CatalogEntry>();
  private readonly aliases = new Map<string, string>();

  constructor(providers: ChatProvider[], aliases: Record<string, string> = {}) {
    for (const provider of providers) {
      for (const spec of provider.models()) this.entries.set(spec.id, { spec, provider });
    }
    for (const [alias, target] of Object.entries(aliases)) {
      if (!this.entries.has(target)) throw new Error(`Alias ${alias} zeigt auf unbekanntes Modell ${target}`);
      if (this.entries.has(alias)) throw new Error(`Alias ${alias} kollidiert mit einem Modell`);
      this.aliases.set(alias, target);
    }
  }

  get(model: string): CatalogEntry | undefined {
    return this.entries.get(this.aliases.get(model) ?? model);
  }

  /**
   * Antwort für GET /v1/models mit Verkaufspreisen. Zwei Leser im Upstream: der Conway-Client
   * liest `input_per_million`, die Model-Registry (refreshFromApi) `input_per_1k`; beide bekommen
   * ihr Feld. `provider` ist "other", weil die Runtime beim Start alle Modelle deaktiviert, die
   * weder in ihrer Baseline stehen noch Provider "ollama"/"other" haben, und weil "other" sicher
   * über das Control Plane geroutet wird (kein direkter OpenAI-/Anthropic-Pfad).
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

/**
 * Kosten in Millicents. Listenpreis USD/1M Tokens ist zugleich Micro-USD je Token;
 * 1 Micro-USD = 0,1 mc, mal Markup.
 */
export function costMc(spec: ModelSpec, usage: Pick<Usage, "prompt_tokens" | "completion_tokens">): number {
  const microUsd = usage.prompt_tokens * spec.inputPerMillion + usage.completion_tokens * spec.outputPerMillion;
  return Math.ceil(microUsd * 0.1 * MARKUP);
}

export interface ChatResult {
  status: number;
  body: Record<string, unknown> | ChatResponse;
}

export async function handleChat(
  db: Db,
  catalog: Catalog,
  address: string,
  body: unknown,
): Promise<ChatResult> {
  if (typeof body !== "object" || body === null) return { status: 400, body: { error: "invalid_body" } };
  const req = body as Partial<ChatRequest>;
  if (typeof req.model !== "string" || !Array.isArray(req.messages)) {
    return { status: 400, body: { error: "model and messages are required" } };
  }
  if (req.stream) return { status: 400, body: { error: "streaming_not_supported" } };

  const entry = catalog.get(req.model);
  if (!entry) return { status: 404, body: { error: "model_not_found", model: req.model } };

  const requested = req.max_completion_tokens ?? req.max_tokens ?? DEFAULT_MAX_TOKENS;
  const maxTokens = Math.max(1, Math.min(HARD_MAX_TOKENS, Math.floor(Number(requested) || DEFAULT_MAX_TOKENS)));

  const estimatedPrompt = estimateTokens(req.messages, req.tools);
  const requiredMc = costMc(entry.spec, { prompt_tokens: estimatedPrompt, completion_tokens: maxTokens });
  const balanceBefore = getBalanceMc(db, address);
  if (balanceBefore < requiredMc) {
    return {
      status: 402,
      body: {
        error: "INSUFFICIENT_CREDITS",
        message: `Insufficient credits: need ${mcToCents(requiredMc) + 1} cents, have ${mcToCents(balanceBefore)} cents`,
        details: {
          required_cents: Math.ceil(requiredMc / 1000),
          current_balance_cents: mcToCents(balanceBefore),
          model: req.model,
        },
      },
    };
  }

  const response = await entry.provider.chat({ ...(req as ChatRequest), model: entry.spec.id, maxTokens, apiKeyId: address });
  // Der Client soll die ID wiedersehen, die er angefragt hat (Alias oder echte ID).
  response.model = req.model;

  const actualMc = costMc(entry.spec, response.usage);
  const balanceNow = getBalanceMc(db, address);
  const chargeMc = Math.min(actualMc, balanceNow);
  postLedger(db, {
    address,
    kind: "inference",
    deltaMc: -chargeMc,
    ref: response.id,
    meta: {
      model: entry.spec.id,
      requested_model: req.model,
      provider: entry.provider.id,
      usage: response.usage,
      cost_mc: actualMc,
      uncollected_mc: actualMc - chargeMc,
    },
  });

  return { status: 200, body: response };
}

export function providersFromEnv(env: NodeJS.ProcessEnv, factories: Record<string, () => ChatProvider>): ChatProvider[] {
  const ids = (env.CP_PROVIDER || "").split(",").map((s) => s.trim()).filter(Boolean);
  return ids.map((id) => {
    const make = factories[id];
    if (!make) throw new Error(`Unbekannter CP_PROVIDER: ${id}`);
    return make();
  });
}
