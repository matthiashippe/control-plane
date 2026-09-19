/**
 * Mock-Provider für Harness und Unit-Tests: kein Netz, deterministisch.
 *
 * Je API-Key zählt er Requests. Request 1 bis 4 antwortet er mit je einem harmlosen Tool-Call
 * aus TOOL_SEQUENCE (nur wenn das Tool angeboten wird), Request 5 mit einem `sleep`-Tool-Call,
 * damit die Runtime den Zyklus sauber beendet. Danach Text. Die Runtime legt SOUL.md, Skills und
 * Register an, bevor sie die Turns fährt; das beeinflusst den Zähler nicht.
 */

import { randomUUID } from "node:crypto";
import type { ChatProvider, ChatRequest, ChatResponse, ModelSpec, ToolCall, ToolDef } from "./provider.js";
import { estimateTokens } from "./provider.js";

export const MOCK_MODEL: ModelSpec = {
  id: "mock-1",
  provider: "mock",
  inputPerMillion: 1,
  outputPerMillion: 2,
  contextWindow: 128_000,
};

const TOOL_SEQUENCE = ["check_credits", "system_synopsis", "list_models", "view_soul"];
const SLEEP_AT_REQUEST = 5;

export class MockProvider implements ChatProvider {
  readonly id = "mock";
  private readonly counts = new Map<string, number>();
  /**
   * Alle Aufrufe über alle Keys. Beim echten Provider entspricht jeder davon einem Einkauf, der
   * Geld kostet, auch wenn er hinterher nicht abgerechnet werden kann. Tests, die Guthabendeckung
   * prüfen, müssen genau das messen und nicht nur den Endsaldo.
   */
  totalCalls = 0;

  models(): ModelSpec[] {
    return [MOCK_MODEL];
  }

  requestCount(apiKeyId: string): number {
    return this.counts.get(apiKeyId) ?? 0;
  }

  async chat(req: ChatRequest & { maxTokens: number; apiKeyId: string }): Promise<ChatResponse> {
    const n = this.requestCount(req.apiKeyId) + 1;
    this.counts.set(req.apiKeyId, n);
    this.totalCalls += 1;
    const offered = new Set((req.tools ?? []).map((t: ToolDef) => t.function.name));

    let content: string | null = null;
    let toolCalls: ToolCall[] | undefined;
    if (n < SLEEP_AT_REQUEST) {
      const name = TOOL_SEQUENCE[(n - 1) % TOOL_SEQUENCE.length];
      if (offered.has(name)) {
        toolCalls = [{ id: `call_${n}_${randomUUID().slice(0, 8)}`, type: "function", function: { name, arguments: "{}" } }];
      } else {
        content = `Mock turn ${n}: tool ${name} not offered, answering with text.`;
      }
    } else if (n === SLEEP_AT_REQUEST && offered.has("sleep")) {
      content = "Mock turn 5 complete, sleeping.";
      toolCalls = [
        {
          id: `call_${n}_${randomUUID().slice(0, 8)}`,
          type: "function",
          function: { name: "sleep", arguments: JSON.stringify({ duration_seconds: 600, reason: "harness done" }) },
        },
      ];
    } else {
      content = `Mock turn ${n}: nothing to do.`;
    }

    const promptTokens = estimateTokens(req.messages, req.tools);
    const completionChars = (content?.length ?? 0) + (toolCalls ? JSON.stringify(toolCalls).length : 0);
    const completionTokens = Math.max(1, Math.ceil(completionChars / 4));
    return {
      id: `chatcmpl-mock-${randomUUID()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: MOCK_MODEL.id,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content, ...(toolCalls ? { tool_calls: toolCalls } : {}) },
          finish_reason: toolCalls ? "tool_calls" : "stop",
        },
      ],
      usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
    };
  }
}
