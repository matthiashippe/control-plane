/**
 * The proxy is off, and only the proxy (HAN-55, decided 2026-09-29 in HAN-22).
 *
 * /v1/chat/completions had sold OpenRouter: 95 `inference` ledger rows from 19.09. to 29.09.,
 * every one with provider "openrouter". The same account writes the drafts of Goal 23, so the
 * provider stays in the catalogue and only the sale stops.
 *
 * The other direction, a provider that may be sold, is every existing test with the mock: they run
 * unchanged. This file is the direction the mock cannot show: OpenRouter configured, every route
 * that sold it refuses without buying anything, and every page that described it stops.
 *
 * Since HAN-62 (2026-09-30) that is the state from the sunset on, so the clock here stands one
 * second after it. The two weeks before it are test/inference-sunset.test.ts.
 */
import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { OpenRouterProvider } from "../src/inference/openrouter.js";
import { MockProvider } from "../src/inference/mock.js";
import { Catalog } from "../src/inference/proxy.js";

const SUNSET = new Date("2026-10-17T00:00:00Z");
const AFTER = () => new Date(SUNSET.getTime() + 1000);

const MODELS_BODY = {
  data: [
    { id: "openai/gpt-5.2", context_length: 400000, pricing: { prompt: "0.00000175", completion: "0.000014" } },
    { id: "openai/gpt-5-mini", context_length: 400000, pricing: { prompt: "0.00000025", completion: "0.000002" } },
  ],
};
const OK_RESPONSE = {
  id: "gen-1",
  model: "openai/gpt-5-mini",
  created: 1700000000,
  choices: [{ index: 0, message: { role: "assistant", content: "{\"findings\":[]}" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.00001 },
};

async function openRouter() {
  const chatCalls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
    if (url.endsWith("/models")) return json(MODELS_BODY);
    chatCalls.push(url);
    return json(OK_RESPONSE);
  }) as typeof fetch;
  const provider = new OpenRouterProvider({
    apiKey: "sk-or-v1-test",
    models: ["openai/gpt-5.2", "openai/gpt-5-mini"],
    fetch: impl,
    priceRefreshMs: 0,
    baseUrl: "https://openrouter.ai/api/v1",
  });
  await provider.init();
  return { provider, chatCalls };
}

function setup(catalog: Catalog) {
  const db = openDb(":memory:");
  const app = createApp({
    db,
    catalog,
    pay: { payTo: "0x" + "1".repeat(40), tiers: [5, 25, 100] } as never,
    inferenceSunsetAt: SUNSET,
    now: AFTER,
  });
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const key = "cnwy_k_" + "34".repeat(16);
  const now = new Date().toISOString();
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, now);
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address, hashApiKey(key), key.slice(0, 15), "t", now,
  );
  postLedger(db, { address, kind: "topup", deltaMc: 500_000, ref: "seed" });
  const post = (path: string, body: unknown) =>
    app.request(path, { method: "POST", headers: { "content-type": "application/json", authorization: key }, body: JSON.stringify(body) });
  const balance = () => (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(address) as { balance_mc: number }).balance_mc;
  const inferenceRows = () => (db.prepare("SELECT count(*) AS n FROM ledger WHERE kind = 'inference'").get() as { n: number }).n;
  return { app, key, post, balance, inferenceRows };
}

const CHAT = { model: "gpt-5-mini", messages: [{ role: "user", content: "hi" }] };
const CHECK = { briefing: "Write 50 words about tea.", submission: "Tea is a drink." };

describe("OpenRouter is not sold on", () => {
  it("refuses /v1/chat/completions and /v1/check with 503, buys nothing and books nothing", async () => {
    const { provider, chatCalls } = await openRouter();
    const s = setup(new Catalog([provider], provider.defaultAliases()));
    const before = s.balance();
    for (const [path, body] of [["/v1/chat/completions", CHAT], ["/v1/check", CHECK]] as const) {
      const res = await s.post(path, body);
      expect(res.status, path).toBe(503);
      const out = (await res.json()) as { error: string; message: string };
      expect(out.error, path).toBe("inference_not_for_sale");
      expect(out.message, "the holder needs to hear the credit is still there").toMatch(/stay on your balance/);
      expect(out.message).toMatch(/not redeemable/);
    }
    expect(chatCalls, "not one request may reach OpenRouter").toHaveLength(0);
    expect(s.inferenceRows()).toBe(0);
    expect(s.balance()).toBe(before);
  });

  it("answers /v1/models with 503 and lists no model in /v1/status", async () => {
    const { provider } = await openRouter();
    const s = setup(new Catalog([provider], provider.defaultAliases()));
    const models = await s.app.request("/v1/models");
    expect(models.status).toBe(503);
    expect(((await models.json()) as { error: string }).error).toBe("inference_not_for_sale");
    const status = (await (await s.app.request("/v1/status")).json()) as { models: unknown[]; markup: unknown };
    expect(status.models).toEqual([]);
    expect(status.markup, "no markup on a sale that does not happen").toBeNull();
  });

  it("takes the sale out of /openapi.json, /llms.txt, /.well-known/x402, /terms and /post", async () => {
    const { provider } = await openRouter();
    const s = setup(new Catalog([provider], provider.defaultAliases()));
    const openapi = (await (await s.app.request("/openapi.json")).json()) as { paths: Record<string, unknown>; info: { summary: string; description: string } };
    expect(Object.keys(openapi.paths)).not.toContain("/v1/chat/completions");
    expect(Object.keys(openapi.paths)).not.toContain("/v1/models");
    expect(openapi.info.description).toMatch(/does not sell access to language models/);
    const llms = await (await s.app.request("/llms.txt")).text();
    expect(llms).not.toContain("/v1/chat/completions");
    expect(llms).not.toMatch(/Inference is\s+billed/);
    const x402 = (await (await s.app.request("/.well-known/x402")).json()) as { endpoints: Record<string, string>; description: string; markup: unknown };
    expect(x402.endpoints.inference).toBeUndefined();
    expect(x402.endpoints.models).toBeUndefined();
    expect(x402.description).not.toMatch(/inference billed/);
    expect(x402.markup).toBeNull();
    const terms = await (await s.app.request("/terms")).text();
    expect(terms).not.toMatch(/Inference is\s+billed at purchase cost/);
    expect(terms).toMatch(/no longer sells\s+access to language models/);
    const post = await (await s.app.request("/post")).text();
    expect(post).not.toContain("Billed like any other inference call");
  });

  it("keeps OpenRouter callable inside the service, so Goal 23 is not switched off with the sale", async () => {
    const { provider, chatCalls } = await openRouter();
    const catalog = new Catalog([provider], provider.defaultAliases());
    expect(catalog.forSale()).toBeNull();
    expect(catalog.get("gpt-5-mini")?.provider, "the whole catalogue still resolves the model").toBe(provider);
    const res = await provider.chat({ model: "openai/gpt-5-mini", messages: [{ role: "user", content: "hi" }], maxTokens: 64, apiKeyId: "goal-23" } as never);
    expect(res.choices.length).toBe(1);
    expect(chatCalls).toHaveLength(1);
  });
});

describe("a provider that may be sold is still sold", () => {
  // The same assertions against the mock, so the refusals above are the provider and not the setup.
  it("answers /v1/chat/completions with 200, books it, and documents it", async () => {
    const s = setup(new Catalog([new MockProvider()], { "gpt-5-mini": "mock-1" }));
    const res = await s.post("/v1/chat/completions", CHAT);
    expect(res.status).toBe(200);
    expect(s.inferenceRows()).toBe(1);
    expect((await s.app.request("/v1/models")).status).toBe(200);
    const openapi = (await (await s.app.request("/openapi.json")).json()) as { paths: Record<string, unknown> };
    expect(Object.keys(openapi.paths)).toContain("/v1/chat/completions");
    const x402 = (await (await s.app.request("/.well-known/x402")).json()) as { endpoints: Record<string, string> };
    expect(x402.endpoints.inference).toBe("/v1/chat/completions");
    expect(await (await s.app.request("/llms.txt")).text()).toContain("/v1/chat/completions");
    expect(await (await s.app.request("/terms")).text()).toMatch(/Inference is\s+billed at purchase cost/);
  });

  it("keeps the OpenRouter models out of a mixed catalogue, aliases included", async () => {
    const { provider } = await openRouter();
    const sold = new Catalog([provider, new MockProvider()], { ...provider.defaultAliases(), "gpt-5.2": "mock-1" }).forSale()!;
    expect(sold.modelIds().sort(), "the mock model and the one alias that points into it").toEqual(["gpt-5.2", "mock-1"]);
    expect(sold.get("gpt-5.2")?.spec.id).toBe("mock-1");
    expect(sold.get("gpt-5-mini"), "an alias into OpenRouter goes with it").toBeUndefined();
  });
});
