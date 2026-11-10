/**
 * Faster providers through OpenRouter's provider routing (abrechnung 02).
 *
 * The service asks OpenRouter to sort the endpoints of a model by throughput, so fewer answers run
 * into the runtime's 60 second timeout. These tests read the request OpenRouter actually receives:
 * the routing is on every call, a `provider` object from the client's body never reaches it, and
 * the price stays the actual purchase times the markup whichever provider answered. Each call also
 * leaves its duration and the provider that answered in the database, so the timeout quote can be
 * counted per model from our own data after the rollout.
 */

import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { openDb, postLedger } from "../src/db.js";
import { OpenRouterProvider, PROVIDER_ROUTING } from "../src/inference/openrouter.js";
import { Catalog, handleChat, MARKUP } from "../src/inference/proxy.js";
import type { ChatProvider, ChatRequest, ChatResponse, ModelSpec } from "../src/inference/provider.js";

const MODELS = ["openai/gpt-5.2", "openai/gpt-5-mini"];
const SPECS: ModelSpec[] = [
  { id: "openai/gpt-5.2", provider: "openrouter", inputPerMillion: 1.75, outputPerMillion: 14, contextWindow: 400_000 },
  { id: "openai/gpt-5-mini", provider: "openrouter", inputPerMillion: 0.25, outputPerMillion: 2, contextWindow: 400_000 },
];

interface Upstream {
  provider: string;
  costUsd: number;
  delayMs?: number;
}

/** A fake OpenRouter that records every body it receives and answers as the given upstream. */
function fakeOpenRouter(next: () => Upstream) {
  const bodies: Array<Record<string, unknown>> = [];
  let n = 0;
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.endsWith("/chat/completions")) return new Response("{}", { status: 404 });
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    bodies.push(body);
    const up = next();
    if (up.delayMs) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, up.delayMs);
        init?.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new Error("The operation was aborted"));
          },
          { once: true },
        );
      });
    }
    n += 1;
    return new Response(
      JSON.stringify({
        id: `gen-routing-${n}`,
        model: body.model,
        provider: up.provider,
        created: Math.floor(Date.now() / 1000),
        choices: [{ index: 0, message: { role: "assistant", content: "Four arrivals, no incidents." }, finish_reason: "stop" }],
        usage: { prompt_tokens: 900, completion_tokens: 300, total_tokens: 1200, cost: up.costUsd },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  const provider = new OpenRouterProvider({ apiKey: "sk-or-v1-test", models: MODELS, fetch: impl, priceRefreshMs: 0 });
  provider.loadSnapshot(SPECS);
  return { provider, bodies };
}

function tenant(providers: ChatProvider[], aliases: Record<string, string> = {}) {
  const db = openDb(":memory:");
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  postLedger(db, { address, kind: "topup", deltaMc: 1_000_000, ref: "seed" });
  const catalog = new Catalog(providers, aliases);
  const chat = (body: Record<string, unknown>, signal?: AbortSignal) => handleChat(db, catalog, address, body, { signal });
  const ledger = () =>
    (db.prepare("SELECT delta_mc, meta FROM ledger WHERE address = ? AND kind = 'inference' ORDER BY id").all(address) as {
      delta_mc: number;
      meta: string;
    }[]).map((r) => ({ delta: r.delta_mc, meta: JSON.parse(r.meta) as Record<string, unknown> }));
  const aborts = () => db.prepare("SELECT * FROM inference_aborts ORDER BY id").all() as Record<string, unknown>[];
  return { db, address, chat, ledger, aborts };
}

const ask = (model: string, extra: Record<string, unknown> = {}) => ({
  model,
  messages: [{ role: "user", content: "Summarise the harbour log of the night." }],
  max_tokens: 256,
  stream: false,
  ...extra,
});

describe("provider routing on every OpenRouter call", () => {
  it("sends the chosen routing to OpenRouter on every call, alias or real model ID", async () => {
    const { provider, bodies } = fakeOpenRouter(() => ({ provider: "OpenAI", costUsd: 0.001 }));
    const t = tenant([provider], provider.defaultAliases());
    expect((await t.chat(ask("openai/gpt-5.2"))).status).toBe(200);
    expect((await t.chat(ask("gpt-5-mini"))).status).toBe(200);
    expect(bodies).toHaveLength(2);
    for (const body of bodies) expect(body.provider).toEqual({ sort: "throughput", allow_fallbacks: true });
    expect(PROVIDER_ROUTING).toEqual({ sort: "throughput", allow_fallbacks: true });
  });

  it("does not pass a provider object from the client's body through to OpenRouter", async () => {
    const { provider, bodies } = fakeOpenRouter(() => ({ provider: "OpenAI", costUsd: 0.001 }));
    const t = tenant([provider]);
    const smuggled = {
      provider: { order: ["anthropic"], only: ["anthropic"], allow_fallbacks: false, sort: "price", zdr: true, max_price: { prompt: 999 } },
    };
    expect((await t.chat(ask("openai/gpt-5-mini", smuggled))).status).toBe(200);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].provider).toEqual({ sort: "throughput", allow_fallbacks: true });
    expect(JSON.stringify(bodies[0]).toLowerCase()).not.toContain("anthropic");
  });

  it("keeps zero data retention next to the routing when the delivery asks for it", async () => {
    const { provider, bodies } = fakeOpenRouter(() => ({ provider: "Azure", costUsd: 0.001 }));
    await provider.chat({ model: "openai/gpt-5.2", messages: [{ role: "user", content: "hi" }], maxTokens: 16, apiKeyId: "x", zdr: true });
    expect(bodies[0].provider).toEqual({ sort: "throughput", allow_fallbacks: true, zdr: true });
  });

  it("charges the actual purchase times 1.3 when two upstream providers answer at different prices", async () => {
    const answers: Upstream[] = [
      { provider: "FastCloud", costUsd: 0.00731 },
      { provider: "SlowCloud", costUsd: 0.00119 },
    ];
    const { provider, bodies } = fakeOpenRouter(() => answers.shift()!);
    const t = tenant([provider]);
    expect((await t.chat(ask("openai/gpt-5.2"))).status).toBe(200);
    expect((await t.chat(ask("openai/gpt-5.2", { temperature: 0.2 }))).status).toBe(200);
    expect(bodies).toHaveLength(2);
    const [fast, slow] = t.ledger();
    expect(MARKUP).toBe(1.3);
    expect(fast.delta).toBe(-Math.ceil(0.00731 * 100_000 * 1.3));
    expect(slow.delta).toBe(-Math.ceil(0.00119 * 100_000 * 1.3));
    expect(fast.meta.purchase_mc).toBe(Math.ceil(0.00731 * 100_000));
    expect(slow.meta.purchase_mc).toBe(Math.ceil(0.00119 * 100_000));
    expect(fast.meta.cost_usd).toBe(0.00731);
    expect(slow.meta.cost_usd).toBe(0.00119);
  });
});

/** Answers after the client has gone, as the upstream that already bought the answer. */
class LateProvider implements ChatProvider {
  readonly id = "late";
  readonly resale = true;
  calls = 0;
  private open: (() => void) | null = null;
  models(): ModelSpec[] {
    return [{ id: "late-1", provider: "late", inputPerMillion: 1, outputPerMillion: 2, contextWindow: 128_000 }];
  }
  release(): void {
    this.open?.();
  }
  async chat(_req: ChatRequest & { maxTokens: number; apiKeyId: string; signal?: AbortSignal }): Promise<ChatResponse> {
    this.calls += 1;
    await new Promise<void>((resolve) => (this.open = resolve));
    return {
      id: "gen-late-1",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "late-1",
      choices: [{ index: 0, message: { role: "assistant", content: "late" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost_usd: 0.0001 },
      upstream: "Parasail",
    };
  }
}

async function until(what: string, ok: () => boolean, ms = 10_000): Promise<void> {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out waiting for: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("duration and answering provider in the database", () => {
  it("duration: a booked call keeps its duration in ms and the provider that answered in the ledger meta", async () => {
    const { provider } = fakeOpenRouter(() => ({ provider: "Azure", costUsd: 0.002, delayMs: 60 }));
    const t = tenant([provider]);
    const before = Date.now();
    expect((await t.chat(ask("openai/gpt-5-mini"))).status).toBe(200);
    const took = Date.now() - before;
    const [row] = t.ledger();
    expect(row.meta.upstream).toBe("Azure");
    expect(Number.isInteger(row.meta.duration_ms)).toBe(true);
    expect(row.meta.duration_ms as number).toBeGreaterThanOrEqual(55);
    expect(row.meta.duration_ms as number).toBeLessThanOrEqual(took + 5);
  });

  it("duration: an aborted call whose answer still arrived records duration and the answering provider", async () => {
    const late = new LateProvider();
    const t = tenant([late]);
    const ctl = new AbortController();
    const pending = t.chat(ask("late-1"), ctl.signal);
    await until("the provider call", () => late.calls === 1);
    await new Promise((resolve) => setTimeout(resolve, 40));
    ctl.abort();
    expect((await pending).status).toBe(499);
    late.release();
    await until("the abort row", () => t.aborts().length === 1);
    const [row] = t.aborts();
    expect(row.upstream).toBe("Parasail");
    expect(row.answered).toBe(1);
    expect(row.duration_ms as number).toBeGreaterThanOrEqual(35);
    expect(t.ledger()).toHaveLength(0);
  });

  it("duration: an aborted OpenRouter call without an answer records its duration and no provider", async () => {
    const { provider } = fakeOpenRouter(() => ({ provider: "Azure", costUsd: 0.002, delayMs: 5_000 }));
    const t = tenant([provider]);
    const ctl = new AbortController();
    const pending = t.chat(ask("openai/gpt-5.2"), ctl.signal);
    await new Promise((resolve) => setTimeout(resolve, 50));
    ctl.abort();
    expect((await pending).status).toBe(499);
    await until("the abort row", () => t.aborts().length === 1);
    const [row] = t.aborts();
    expect(row.upstream).toBeNull();
    expect(row.answered).toBe(0);
    expect(row.duration_ms as number).toBeGreaterThanOrEqual(40);
    expect(row.duration_ms as number).toBeLessThan(5_000);
  });
});
