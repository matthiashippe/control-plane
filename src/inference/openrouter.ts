/**
 * OpenRouter as the purchasing source: OpenAI-compatible chat completions, one key for every
 * provider.
 *
 * Catalogue IDs are the OpenRouter IDs (`openai/gpt-5.2`); the IDs the runtime hard-codes sit in
 * front of them as aliases (`defaultAliases`). Prices are read from `/models` on start and renewed
 * hourly; `usage.cost` in the answer gives the actual purchase cost per call.
 */

import type { ChatProvider, ChatRequest, ChatResponse, ModelSpec, ToolCall } from "./provider.js";
import { ProviderBadRequestError, ProviderUnavailableError } from "./provider.js";

export interface OpenRouterOptions {
  apiKey: string;
  /** OpenRouter IDs that end up in the catalogue. */
  models: string[];
  baseUrl?: string;
  fetch?: typeof fetch;
  referer?: string;
  title?: string;
  timeoutMs?: number;
  /** Timeout for the price fetch. Short, because it blocks the start. Default 15 s. */
  priceFetchTimeoutMs?: number;
  /**
   * Called after every successful price fetch, the hourly one included. The caller uses it to
   * persist the catalogue. Without this hook the stored state goes stale while the process runs on
   * fresh prices, and after a restart without a reachable provider the service bills with numbers
   * from the day before yesterday.
   */
  onRefresh?: (specs: ModelSpec[]) => void;
  priceRefreshMs?: number;
  now?: () => number;
}

export const DEFAULT_OPENROUTER_MODELS = ["openai/gpt-5.2", "openai/gpt-5-mini"];

/** Runtime baseline IDs -> OpenRouter IDs. `gpt-5.3` is missing on purpose: OpenRouter only has the Codex variant. */
export const DEFAULT_OPENROUTER_ALIASES: Record<string, string> = {
  "gpt-5.2": "openai/gpt-5.2",
  "gpt-5-mini": "openai/gpt-5-mini",
};

interface OpenRouterModelRow {
  id: string;
  context_length?: number;
  pricing?: { prompt?: string | number; completion?: string | number };
  supported_parameters?: string[];
}

export class OpenRouterProvider implements ChatProvider {
  readonly id = "openrouter";
  private readonly specs = new Map<string, ModelSpec>();
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly priceFetchTimeoutMs: number;
  private onRefresh?: (specs: ModelSpec[]) => void;
  private readonly priceRefreshMs: number;
  private readonly now: () => number;
  private lastRefresh = 0;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly opts: OpenRouterOptions) {
    if (!opts.apiKey) throw new Error("OpenRouter: apiKey is missing");
    this.baseUrl = (opts.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.priceFetchTimeoutMs = opts.priceFetchTimeoutMs ?? 15_000;
    this.onRefresh = opts.onRefresh;
    this.priceRefreshMs = opts.priceRefreshMs ?? 60 * 60 * 1000;
    this.now = opts.now ?? Date.now;
  }

  /** Loads the prices. Without prices the control plane does not start (the estimate would be blind). */
  async init(): Promise<void> {
    await this.refreshPrices();
    if (this.priceRefreshMs > 0) {
      this.refreshTimer = setInterval(() => {
        this.refreshPrices().catch((err) => console.error(`[openrouter] price refresh failed: ${err.message}`));
      }, this.priceRefreshMs);
      this.refreshTimer.unref?.();
    }
  }

  close(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  async refreshPrices(): Promise<void> {
    // With a timeout, because this call blocks the start: without one the process hangs silently,
    // the health check fails and the service does not answer, without a single line in the log. The
    // timer explicitly ALSO covers reading the body: OpenRouter's model list is more than a
    // megabyte, and a stalled download stalls just like a stalled connection setup. The first
    // version cleared the timer right after the `fetch` and left exactly half of it unprotected.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.priceFetchTimeoutMs);
    let body: { data?: OpenRouterModelRow[] };
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/models`, { headers: this.headers(), signal: controller.signal });
      if (!res.ok) throw new Error(`GET /models -> ${res.status}`);
      body = (await res.json()) as { data?: OpenRouterModelRow[] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith("GET /models ->")) throw err;
      throw new Error(
        controller.signal.aborted ? `GET /models: timeout after ${this.priceFetchTimeoutMs} ms` : `GET /models: ${msg}`,
      );
    } finally {
      clearTimeout(timer);
    }
    const rows = new Map((body.data ?? []).map((m) => [m.id, m]));
    const missing: string[] = [];
    for (const id of this.opts.models) {
      const row = rows.get(id);
      if (!row) {
        missing.push(id);
        continue;
      }
      // OpenRouter quotes USD per token; we keep USD per million.
      const inputPerMillion = Number(row.pricing?.prompt ?? 0) * 1_000_000;
      const outputPerMillion = Number(row.pricing?.completion ?? 0) * 1_000_000;
      const existing = this.specs.get(id);
      if (existing) {
        existing.inputPerMillion = inputPerMillion;
        existing.outputPerMillion = outputPerMillion;
        existing.contextWindow = row.context_length ?? existing.contextWindow;
      } else {
        this.specs.set(id, {
          id,
          provider: "openrouter",
          inputPerMillion,
          outputPerMillion,
          contextWindow: row.context_length ?? 128_000,
        });
      }
    }
    if (missing.length) throw new Error(`OpenRouter does not know these models: ${missing.join(", ")}`);
    this.lastRefresh = this.now();
    // The hourly fetch reports here too, not just the one on start. Otherwise the process runs on
    // fresh prices while the stored state goes stale, and after a restart without a reachable
    // provider the service bills with numbers from the day before yesterday.
    this.onRefresh?.(this.snapshot());
  }

  models(): ModelSpec[] {
    return [...this.specs.values()];
  }

  /** Set after construction, so the fetch on start is persisted as well. */
  setOnRefresh(cb: (specs: ModelSpec[]) => void): void {
    this.onRefresh = cb;
  }

  /**
   * The loaded prices, so the caller can cache them. A start path that has to reach a third party
   * is a reason for an outage: on 19.09.2026 the start hung twice on exactly this call and the
   * service was gone.
   */
  snapshot(): ModelSpec[] {
    return [...this.specs.values()];
  }

  /** Loads prices from a snapshot when the fetch on start did not get through. */
  loadSnapshot(specs: ModelSpec[]): void {
    this.specs.clear();
    for (const spec of specs) this.specs.set(spec.id, spec);
  }

  /** Aliases whose target is in the catalogue. */
  defaultAliases(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [alias, target] of Object.entries(DEFAULT_OPENROUTER_ALIASES)) {
      if (this.specs.has(target)) out[alias] = target;
    }
    return out;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.opts.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": this.opts.referer ?? "https://github.com/matthiashippe/control-plane",
      "X-Title": this.opts.title ?? "control-plane",
    };
  }

  async chat(req: ChatRequest & { maxTokens: number; apiKeyId: string }): Promise<ChatResponse> {
    const body: Record<string, unknown> = {
      model: req.model,
      messages: req.messages,
      max_tokens: req.maxTokens,
      stream: false,
      usage: { include: true },
    };
    if (req.tools?.length) {
      body.tools = req.tools;
      body.tool_choice = req.tool_choice ?? "auto";
    }
    if (req.temperature !== undefined) body.temperature = req.temperature;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ProviderUnavailableError(this.id, null, controller.signal.aborted ? `timeout after ${this.timeoutMs} ms` : msg);
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 400) {
      throw new ProviderBadRequestError(this.id, await res.json().catch(() => ({ error: "unparseable" })));
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ProviderUnavailableError(this.id, res.status, `OpenRouter ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      id?: string;
      model?: string;
      created?: number;
      choices?: Array<{
        index?: number;
        message?: { role?: string; content?: string | null; tool_calls?: ToolCall[] };
        finish_reason?: string;
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };
      error?: { message?: string; code?: number };
    };
    // OpenRouter can answer 200 with an error object (upstream provider error).
    if (data.error) {
      throw new ProviderUnavailableError(this.id, data.error.code ?? 200, data.error.message ?? "upstream error");
    }
    const choice = data.choices?.[0];
    if (!choice?.message) throw new ProviderUnavailableError(this.id, 200, "no choices in response");

    const toolCalls = choice.message.tool_calls?.map((tc) => ({
      id: tc.id,
      type: "function" as const,
      function: { name: tc.function.name, arguments: tc.function.arguments ?? "{}" },
    }));
    const finish = choice.finish_reason === "tool_calls" || (toolCalls?.length ? "tool_calls" : null)
      ? "tool_calls"
      : choice.finish_reason === "length"
        ? "length"
        : "stop";
    const promptTokens = data.usage?.prompt_tokens ?? 0;
    const completionTokens = data.usage?.completion_tokens ?? 0;
    return {
      id: data.id ?? `chatcmpl-openrouter-${Date.now()}`,
      object: "chat.completion",
      created: data.created ?? Math.floor(Date.now() / 1000),
      model: data.model ?? req.model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: choice.message.content ?? null, ...(toolCalls?.length ? { tool_calls: toolCalls } : {}) },
          finish_reason: finish,
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: data.usage?.total_tokens ?? promptTokens + completionTokens,
        ...(typeof data.usage?.cost === "number" ? { cost_usd: data.usage.cost } : {}),
      },
    };
  }
}

export function openRouterFromEnv(env: NodeJS.ProcessEnv): OpenRouterProvider {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("CP_PROVIDER=openrouter needs OPENROUTER_API_KEY");
  const models = (env.CP_OPENROUTER_MODELS || DEFAULT_OPENROUTER_MODELS.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new OpenRouterProvider({ apiKey, models, baseUrl: env.CP_OPENROUTER_BASE_URL });
}
