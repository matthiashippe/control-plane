/**
 * A shortened answer shows in the ledger whether it stayed empty (abrechnung 09).
 *
 * Since abrechnung 08 a wallet with a remainder gets an answer with `max_tokens` cut to at least
 * MIN_SHORTENED_TOKENS. A reasoning model can spend that whole budget on reasoning and come back with
 * `finish_reason: "length"`, no content and no tool call, and the runtime at the pin then runs into
 * its next turn. Whether that happens could not be measured, because the ledger row carried neither
 * the finish reason nor whether the answer was empty. Now the row of every shortened answer carries
 * `shortened_finish` and `shortened_empty`; the row of a full answer carries neither.
 *
 * The provider here answers with exactly the choice a test hands it, so each case is one shape of
 * answer and nothing else differs. The last case goes the way production goes, through
 * OpenRouterProvider with a stubbed fetch, because that provider reshapes the answer before the
 * ledger sees it.
 */
import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { openDb, postLedger } from "../src/db.js";
import { OpenRouterProvider } from "../src/inference/openrouter.js";
import { Catalog, costMc, handleChat } from "../src/inference/proxy.js";
import {
  estimateTokens,
  type ChatProvider,
  type ChatRequest,
  type ChatResponse,
  type ModelSpec,
} from "../src/inference/provider.js";

const PRICED: ModelSpec = {
  id: "priced-1",
  provider: "mock",
  inputPerMillion: 10,
  outputPerMillion: 100,
  contextWindow: 128_000,
};

type Choices = ChatResponse["choices"];

/** A provider that answers every call with the choices it was given, priced so one token shows. */
class ScriptedProvider implements ChatProvider {
  readonly id = "mock";
  readonly resale = true;
  maxTokensSent: number[] = [];
  constructor(private readonly choices: Choices) {}
  models(): ModelSpec[] {
    return [PRICED];
  }
  async chat(req: ChatRequest & { maxTokens: number; apiKeyId: string }): Promise<ChatResponse> {
    this.maxTokensSent.push(req.maxTokens);
    const promptTokens = estimateTokens(req.messages, req.tools);
    const completionTokens = Math.min(req.maxTokens, 120);
    return {
      id: `chatcmpl-scripted-${this.maxTokensSent.length}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: PRICED.id,
      choices: this.choices,
      usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
    };
  }
}

const MESSAGES = [
  { role: "system" as const, content: "You are an automaton. Keep going while you have credit." },
  { role: "user" as const, content: "What is the next step?" },
];
const PROMPT = estimateTokens(MESSAGES);
const mcFor = (completion: number) => costMc(PRICED, { prompt_tokens: PROMPT, completion_tokens: completion });

/** One call through handleChat with the given answer, returning the response and the ledger meta. */
async function callWith(choices: Choices, balanceMc: number) {
  const db = openDb(":memory:");
  const provider = new ScriptedProvider(choices);
  const catalog = new Catalog([provider]);
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  // Booked as the starter grant, so the call cannot draw a second one.
  postLedger(db, { address, kind: "grant", deltaMc: balanceMc, ref: `starter:${address}` });
  const res = await handleChat(db, catalog, address, { model: "priced-1", messages: MESSAGES, max_completion_tokens: 4096 });
  const rows = db.prepare("SELECT meta FROM ledger WHERE address = ? AND kind = 'inference'").all(address) as { meta: string }[];
  expect(rows).toHaveLength(1);
  return { res, provider, meta: JSON.parse(rows[0].meta) as Record<string, unknown> };
}

/** A balance that carries 300 answer tokens: the call goes out shortened to 300. */
const SHORT = () => mcFor(300);
/** A balance that carries the full 4096 tokens twice over: the call goes out unchanged. */
const FULL = () => mcFor(4096) * 2;

describe("the ledger row of a shortened answer (abrechnung 09)", () => {
  it("marks a shortened answer without content and without tool calls as empty", async () => {
    for (const content of [null, "", "  \n\t "]) {
      const { res, provider, meta } = await callWith(
        [{ index: 0, message: { role: "assistant", content }, finish_reason: "length" }],
        SHORT(),
      );
      expect(res.status).toBe(200);
      expect(res.headers?.["X-Max-Tokens-Shortened"]).toBe("300");
      expect(provider.maxTokensSent).toEqual([300]);
      expect(meta.shortened_to).toBe(300);
      expect(meta.shortened_empty, `content ${JSON.stringify(content)}`).toBe(true);
      // The client gets the answer as the provider sent it; nothing of it goes into the ledger.
      expect((res.body as ChatResponse).choices[0].message.content).toBe(content);
      expect(JSON.stringify(meta)).not.toContain("content");
    }
    // An empty list of tool calls is no tool call.
    const { meta } = await callWith(
      [{ index: 0, message: { role: "assistant", content: null, tool_calls: [] }, finish_reason: "length" }],
      SHORT(),
    );
    expect(meta.shortened_empty).toBe(true);
    // An answer without choices brought the client nothing either.
    const none = await callWith([], SHORT());
    expect(none.meta.shortened_empty).toBe(true);
    expect(none.meta.shortened_finish).toBeNull();
  });

  it("marks a shortened answer with content as not empty", async () => {
    const { res, meta } = await callWith(
      [{ index: 0, message: { role: "assistant", content: "Next I check my credits." }, finish_reason: "length" }],
      SHORT(),
    );
    expect(res.headers?.["X-Max-Tokens-Shortened"]).toBe("300");
    expect(meta.shortened_empty).toBe(false);
  });

  it("marks a shortened answer with only a tool call as not empty", async () => {
    const { res, meta } = await callWith(
      [
        {
          index: 0,
          message: {
            role: "assistant",
            content: null,
            tool_calls: [{ id: "call_1", type: "function", function: { name: "check_credits", arguments: "{}" } }],
          },
          finish_reason: "tool_calls",
        },
      ],
      SHORT(),
    );
    expect(res.headers?.["X-Max-Tokens-Shortened"]).toBe("300");
    expect(meta.shortened_empty).toBe(false);
  });

  it("records the finish reason of a shortened answer", async () => {
    for (const finish of ["length", "stop", "tool_calls"] as const) {
      const { meta } = await callWith(
        [{ index: 0, message: { role: "assistant", content: "Done." }, finish_reason: finish }],
        SHORT(),
      );
      expect(meta.shortened_finish).toBe(finish);
    }
    // Only the first choice counts.
    const { meta } = await callWith(
      [
        { index: 0, message: { role: "assistant", content: null }, finish_reason: "length" },
        { index: 1, message: { role: "assistant", content: "Second." }, finish_reason: "stop" },
      ],
      SHORT(),
    );
    expect(meta.shortened_finish).toBe("length");
    expect(meta.shortened_empty).toBe(true);
  });

  it("leaves the ledger row of a full answer without shortened_finish and shortened_empty", async () => {
    const keysBefore = ["cost_mc", "cost_usd", "duration_ms", "margin_mc", "model", "provider", "purchase_mc", "requested_model", "uncollected_mc", "upstream", "usage"];
    for (const choices of [
      [{ index: 0, message: { role: "assistant" as const, content: null }, finish_reason: "length" as const }],
      [{ index: 0, message: { role: "assistant" as const, content: "Full answer." }, finish_reason: "stop" as const }],
    ]) {
      // The same answer, shortened, carries the two keys next to shortened_to: they tell the rows apart.
      const short = await callWith(choices, SHORT());
      expect(Object.keys(short.meta).sort()).toEqual([...keysBefore, "shortened_to", "shortened_finish", "shortened_empty"].sort());

      const { res, provider, meta } = await callWith(choices, FULL());
      expect(res.status).toBe(200);
      expect(res.headers).toBeUndefined();
      expect(provider.maxTokensSent).toEqual([4096]);
      expect(Object.keys(meta)).not.toContain("shortened_finish");
      expect(Object.keys(meta)).not.toContain("shortened_empty");
      // The row of a full answer keeps exactly the keys it had before this goal.
      expect(Object.keys(meta).sort()).toEqual([...keysBefore].sort());
    }
  });

  it("marks a shortened reasoning-only answer from OpenRouter as empty", async () => {
    const reasoning = "Let me think about which tool to call first and how many credits remain for it.";
    for (const content of ["", null]) {
      const { res, sentMaxTokens, meta } = await callOpenRouterWith(
        {
          id: "gen-reasoning-only",
          model: OR_MODEL,
          provider: "OpenAI",
          created: 1700000000,
          choices: [{ index: 0, message: { role: "assistant", content, reasoning }, finish_reason: "length" }],
          usage: {
            prompt_tokens: PROMPT,
            completion_tokens: 300,
            total_tokens: PROMPT + 300,
            completion_tokens_details: { reasoning_tokens: 300 },
          },
        },
        300,
      );
      expect(res.status, `content ${JSON.stringify(content)}`).toBe(200);
      // Rounding up to whole mc lets one more token fit at OpenRouter prices, so the cut is 300 or 301.
      const shortenedTo = meta.shortened_to as number;
      expect(shortenedTo).toBeGreaterThanOrEqual(300);
      expect(shortenedTo).toBeLessThanOrEqual(301);
      expect(res.headers?.["X-Max-Tokens-Shortened"]).toBe(String(shortenedTo));
      expect(sentMaxTokens).toEqual([shortenedTo]);
      expect(meta.shortened_empty, `content ${JSON.stringify(content)}`).toBe(true);
      expect(meta.shortened_finish).toBe("length");
      // Neither the reasoning nor any other text of the answer goes into the ledger.
      expect(JSON.stringify(meta)).not.toContain(reasoning);
      expect(JSON.stringify(meta)).not.toContain("reasoning");
    }
  });
});

const OR_MODEL = "openai/gpt-5-mini";

/**
 * One call through handleChat to an OpenRouterProvider whose fetch answers the chat call with the
 * given body in the shape OpenRouter sends, with a balance that carries `answerTokens` answer tokens.
 */
async function callOpenRouterWith(chatBody: unknown, answerTokens: number) {
  const sentMaxTokens: unknown[] = [];
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url).pathname.replace(/^\/api\/v1/, "");
    if (path === "/models") {
      return json({ data: [{ id: OR_MODEL, context_length: 400000, pricing: { prompt: "0.00000025", completion: "0.000002" } }] });
    }
    if (path === "/chat/completions") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      sentMaxTokens.push(body.max_tokens ?? body.max_completion_tokens);
      return json(chatBody);
    }
    return new Response(JSON.stringify({ error: "no stub for " + path }), { status: 500 });
  }) as typeof fetch;
  const provider = new OpenRouterProvider({ apiKey: "sk-or-v1-test", models: [OR_MODEL], fetch: fetchStub, priceRefreshMs: 0, baseUrl: "https://openrouter.ai/api/v1" });
  await provider.init();
  const spec = provider.models().find((m) => m.id === OR_MODEL);
  expect(spec).toBeDefined();

  const db = openDb(":memory:");
  const catalog = new Catalog([provider], provider.defaultAliases());
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  postLedger(db, { address, kind: "grant", deltaMc: costMc(spec!, { prompt_tokens: PROMPT, completion_tokens: answerTokens }), ref: `starter:${address}` });
  const res = await handleChat(db, catalog, address, { model: OR_MODEL, messages: MESSAGES, max_completion_tokens: 4096 });
  const rows = db.prepare("SELECT meta FROM ledger WHERE address = ? AND kind = 'inference'").all(address) as { meta: string }[];
  expect(rows).toHaveLength(1);
  return { res, sentMaxTokens, meta: JSON.parse(rows[0].meta) as Record<string, unknown> };
}
