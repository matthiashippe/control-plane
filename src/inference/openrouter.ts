/**
 * OpenRouter als Einkaufsquelle: OpenAI-kompatible Chat-Completions, ein Key für alle Anbieter.
 *
 * Katalog-IDs sind die OpenRouter-IDs (`openai/gpt-5.2`); die IDs, die die Runtime hart anfragt,
 * kommen als Aliase davor (`defaultAliases`). Preise werden beim Start aus `/models` gelesen und
 * stündlich erneuert; `usage.cost` in der Antwort liefert die tatsächlichen Einkaufskosten je Call.
 */

import type { ChatProvider, ChatRequest, ChatResponse, ModelSpec, ToolCall } from "./provider.js";
import { ProviderBadRequestError, ProviderUnavailableError } from "./provider.js";

export interface OpenRouterOptions {
  apiKey: string;
  /** OpenRouter-IDs, die im Katalog landen. */
  models: string[];
  baseUrl?: string;
  fetch?: typeof fetch;
  referer?: string;
  title?: string;
  timeoutMs?: number;
  priceRefreshMs?: number;
  now?: () => number;
}

export const DEFAULT_OPENROUTER_MODELS = ["openai/gpt-5.2", "openai/gpt-5-mini"];

/** Runtime-Baseline-IDs -> OpenRouter-IDs. `gpt-5.3` fehlt bewusst: OpenRouter hat nur die Codex-Variante. */
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
  private readonly priceRefreshMs: number;
  private readonly now: () => number;
  private lastRefresh = 0;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly opts: OpenRouterOptions) {
    if (!opts.apiKey) throw new Error("OpenRouter: apiKey fehlt");
    this.baseUrl = (opts.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.priceRefreshMs = opts.priceRefreshMs ?? 60 * 60 * 1000;
    this.now = opts.now ?? Date.now;
  }

  /** Lädt die Preise. Ohne Preise startet das Control Plane nicht (Vorprüfung wäre blind). */
  async init(): Promise<void> {
    await this.refreshPrices();
    if (this.priceRefreshMs > 0) {
      this.refreshTimer = setInterval(() => {
        this.refreshPrices().catch((err) => console.error(`[openrouter] Preis-Refresh fehlgeschlagen: ${err.message}`));
      }, this.priceRefreshMs);
      this.refreshTimer.unref?.();
    }
  }

  close(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  async refreshPrices(): Promise<void> {
    const res = await this.fetchImpl(`${this.baseUrl}/models`, { headers: this.headers() });
    if (!res.ok) throw new Error(`GET /models -> ${res.status}`);
    const body = (await res.json()) as { data?: OpenRouterModelRow[] };
    const rows = new Map((body.data ?? []).map((m) => [m.id, m]));
    const missing: string[] = [];
    for (const id of this.opts.models) {
      const row = rows.get(id);
      if (!row) {
        missing.push(id);
        continue;
      }
      // OpenRouter nennt USD je Token; wir führen USD je Million.
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
    if (missing.length) throw new Error(`OpenRouter kennt diese Modelle nicht: ${missing.join(", ")}`);
    this.lastRefresh = this.now();
  }

  models(): ModelSpec[] {
    return [...this.specs.values()];
  }

  /** Aliase, deren Ziel im Katalog liegt. */
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
    // OpenRouter kann 200 mit einem Fehlerobjekt antworten (Upstream-Provider-Fehler).
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
  if (!apiKey) throw new Error("CP_PROVIDER=openrouter braucht OPENROUTER_API_KEY");
  const models = (env.CP_OPENROUTER_MODELS || DEFAULT_OPENROUTER_MODELS.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new OpenRouterProvider({ apiKey, models, baseUrl: env.CP_OPENROUTER_BASE_URL });
}
