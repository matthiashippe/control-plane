/**
 * Provider-Naht für Inferenz. Das Control Plane spricht nach außen OpenAI-Chat-Completions
 * (so ruft die Runtime `/v1/chat/completions` auf) und kauft nach innen bei einem Provider ein.
 * Preise sind Listenpreise in USD je Million Tokens; der Verkaufsaufschlag liegt im Katalog.
 */

export interface ModelSpec {
  /** ID, wie sie die Runtime in `model` schickt. */
  id: string;
  provider: string;
  /** Listenpreis USD / 1M Tokens. */
  inputPerMillion: number;
  outputPerMillion: number;
  contextWindow: number;
}

/** Untermenge des OpenAI-Chat-Formats, die die Runtime sendet (docs/protocol.md, Inferenz). */
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
  /** Tatsächliche Einkaufskosten in USD, wenn der Provider sie meldet (OpenRouter `usage.cost`). */
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

/** Provider-Ausfall (kein Guthaben, Rate-Limit, 5xx, Timeout): nicht dem Automaton anlasten. */
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

/** Unser Request war fehlerhaft (Provider antwortet 400): durchreichen. */
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
  /** Der Aufrufer schickt nur Modelle, die models() kennt. Max-Tokens sind bereits normalisiert. */
  chat(req: ChatRequest & { maxTokens: number; apiKeyId: string }): Promise<ChatResponse>;
}

/** Grobe Token-Schätzung ohne Tokenizer: vier Zeichen je Token, plus ein Token je Nachricht. */
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
