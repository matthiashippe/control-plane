/**
 * Provider seam for inference. Outwards the control plane speaks OpenAI chat completions (that is
 * how the runtime calls `/v1/chat/completions`) and inwards it buys from a provider. Prices are
 * list prices in USD per million tokens; the sales markup lives in the catalogue.
 */

export interface ModelSpec {
  /** ID exactly as the runtime sends it in `model`. */
  id: string;
  provider: string;
  /** List price in USD per 1M tokens. */
  inputPerMillion: number;
  outputPerMillion: number;
  contextWindow: number;
}

/** The subset of the OpenAI chat format the runtime sends (docs/protocol.md, section Inferenz). */
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null | Array<{ type: string; text?: string }>;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolDef {
  type: "function";
  function: { name: string; description?: string; parameters?: Record<string, unknown> };
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  tool_choice?: unknown;
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  /** Actual purchase cost in USD, when the provider reports it (OpenRouter `usage.cost`). */
  cost_usd?: number;
}

export interface ChatResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: "assistant"; content: string | null; tool_calls?: ToolCall[] };
    finish_reason: "stop" | "tool_calls" | "length";
  }>;
  usage: Usage;
}

/** Provider outage (no credit, rate limit, 5xx, timeout): do not blame the automaton for it. */
export class ProviderUnavailableError extends Error {
  constructor(
    public readonly provider: string,
    public readonly upstreamStatus: number | null,
    message: string,
  ) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

/** Our request was malformed (the provider answers 400): pass it through. */
export class ProviderBadRequestError extends Error {
  constructor(
    public readonly provider: string,
    public readonly body: unknown,
  ) {
    super("provider rejected request");
    this.name = "ProviderBadRequestError";
  }
}

export interface ChatProvider {
  readonly id: string;
  models(): ModelSpec[];
  /** The caller only sends models that models() knows. Max tokens are already normalised. */
  chat(req: ChatRequest & { maxTokens: number; apiKeyId: string }): Promise<ChatResponse>;
}

/** Rough token estimate without a tokenizer: four characters per token, plus one token per message. */
export function estimateTokens(messages: ChatMessage[], tools?: ToolDef[]): number {
  let chars = 0;
  for (const m of messages) {
    chars += 4;
    if (typeof m.content === "string") chars += m.content.length;
    else if (Array.isArray(m.content)) for (const part of m.content) chars += part.text?.length ?? 0;
    if (m.tool_calls) chars += JSON.stringify(m.tool_calls).length;
  }
  if (tools?.length) chars += JSON.stringify(tools).length;
  return Math.ceil(chars / 4);
}
