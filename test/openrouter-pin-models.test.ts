import { afterEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { openDb, postLedger } from "../src/db.js";
import { openRouterFromEnv, RUNTIME_PIN_MODELS, type OpenRouterProvider } from "../src/inference/openrouter.js";
import { Catalog, handleChat, MARKUP, sellPrice } from "../src/inference/proxy.js";

// The models the unchanged runtime at pin d8f8168 asks us for without its own OpenAI key: workers
// and planner (src/inference/provider-registry.ts:79, :90, :101 upstream). Production names only
// gpt-5.2 and gpt-5-mini in CP_OPENROUTER_MODELS, so before goals/fehler/17 every request for these
// got 404 model_not_found.
const PROD_MODELS = "openai/gpt-5.2,openai/gpt-5-mini";

// Rows as OpenRouter's public /models listed them on 2026-11-28T07:47:14Z: prices in USD per token,
// and supported_parameters as read. gpt-4.1-nano lists max_completion_tokens but not max_tokens.
const ROW = {
  "openai/gpt-5.2": { id: "openai/gpt-5.2", context_length: 400000, pricing: { prompt: "0.00000175", completion: "0.000014" } },
  "openai/gpt-5-mini": { id: "openai/gpt-5-mini", context_length: 400000, pricing: { prompt: "0.00000025", completion: "0.000002" } },
  "openai/gpt-4.1": {
    id: "openai/gpt-4.1",
    context_length: 1047576,
    pricing: { prompt: "0.000002", completion: "0.000008" },
    supported_parameters: ["max_completion_tokens", "max_tokens", "temperature", "tool_choice", "tools"],
  },
  "openai/gpt-4.1-mini": {
    id: "openai/gpt-4.1-mini",
    context_length: 1047576,
    pricing: { prompt: "0.0000004", completion: "0.0000016" },
    supported_parameters: ["max_completion_tokens", "max_tokens", "temperature", "tool_choice", "tools"],
  },
  "openai/gpt-4.1-nano": {
    id: "openai/gpt-4.1-nano",
    context_length: 1047576,
    pricing: { prompt: "0.0000001", completion: "0.0000004" },
    supported_parameters: ["max_completion_tokens", "temperature", "tool_choice", "tools"],
  },
} as const;
type RowId = keyof typeof ROW;
const ALL = Object.keys(ROW) as RowId[];

interface Recorded {
  path: string;
  body: Record<string, unknown> | null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function answer(model: string, usage: Record<string, number> = { prompt_tokens: 1000, completion_tokens: 20, total_tokens: 1020 }) {
  return {
    id: "gen-pin-1",
    model,
    created: 1700000000,
    choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
    usage,
  };
}

/** Stubs the global fetch, which openRouterFromEnv picks up, with a catalogue made of `offered`. */
function stubOpenRouter(offered: RowId[], chatUsage?: Record<string, number>) {
  const calls: Recorded[] = [];
  vi.stubGlobal("fetch", (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url).pathname.replace(/^\/api\/v1/, "");
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ path, body });
    if (path === "/models") return json({ data: offered.map((id) => ROW[id]) });
    if (path === "/chat/completions") return json(answer(String(body?.model), chatUsage));
    return json({ error: "no stub for " + path }, 500);
  }) as typeof fetch);
  return calls;
}

function fromEnv(models: string): OpenRouterProvider {
  return openRouterFromEnv({ OPENROUTER_API_KEY: "sk-or-v1-test", CP_OPENROUTER_MODELS: models } as NodeJS.ProcessEnv);
}

function walletWith(balanceMc = 500_000) {
  const db = openDb(":memory:");
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  postLedger(db, { address, kind: "topup", deltaMc: balanceMc, ref: "seed" });
  const balance = () => (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(address) as { balance_mc: number }).balance_mc;
  const rows = () => db.prepare("SELECT delta_mc, meta FROM ledger WHERE kind = 'inference'").all() as { delta_mc: number; meta: string }[];
  return { db, address, balance, rows };
}

/** Lines the provider wrote to either console stream. */
function captureLog() {
  const lines: string[] = [];
  const keep = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  vi.spyOn(console, "log").mockImplementation(keep);
  vi.spyOn(console, "error").mockImplementation(keep);
  return lines;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("models of the runtime at pin d8f8168", () => {
  it("serves gpt-4.1, gpt-4.1-mini and gpt-4.1-nano with CP_OPENROUTER_MODELS naming only gpt-5.2 and gpt-5-mini", async () => {
    const calls = stubOpenRouter(ALL);
    const provider = fromEnv(PROD_MODELS);
    await provider.init();
    provider.close();

    // The list from the environment first, then the pin models.
    expect(provider.models().map((m) => m.id)).toEqual([
      "openai/gpt-5.2",
      "openai/gpt-5-mini",
      "openai/gpt-4.1",
      "openai/gpt-4.1-mini",
      "openai/gpt-4.1-nano",
    ]);
    expect(provider.defaultAliases()).toEqual({
      "gpt-5.2": "openai/gpt-5.2",
      "gpt-5-mini": "openai/gpt-5-mini",
      "gpt-4.1": "openai/gpt-4.1",
      "gpt-4.1-mini": "openai/gpt-4.1-mini",
      "gpt-4.1-nano": "openai/gpt-4.1-nano",
    });

    const catalog = new Catalog([provider], provider.defaultAliases());
    const listed = catalog.listModels().data.map((r) => r.id);
    for (const id of ["gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano"]) expect(listed).toContain(id);

    const { db, address } = walletWith();
    for (const model of ["gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano"]) {
      const res = await handleChat(db, catalog, address, { model, messages: [{ role: "user", content: "hi" }], max_tokens: 256 });
      expect(res.status, model).toBe(200);
      expect((res.body as { model: string }).model, "the answer names the ID the runtime asked for").toBe(model);
    }

    const sent = calls.filter((c) => c.path === "/chat/completions").map((c) => c.body!);
    expect(sent.map((b) => b.model)).toEqual(["openai/gpt-4.1", "openai/gpt-4.1-mini", "openai/gpt-4.1-nano"]);
    // gpt-4.1 and gpt-4.1-mini list max_tokens at OpenRouter and get it like every other model.
    expect(sent[0]).toMatchObject({ max_tokens: 256 });
    expect(sent[1]).toMatchObject({ max_tokens: 256 });
    expect(sent[0]).not.toHaveProperty("max_completion_tokens");
    // gpt-4.1-nano lists only max_completion_tokens, so the cap goes there; a dropped max_tokens
    // would leave the answer longer than the reservation.
    expect(sent[2]).toMatchObject({ max_completion_tokens: 256 });
    expect(sent[2]).not.toHaveProperty("max_tokens");
  });

  it("leaves a pin model out when OpenRouter does not offer it and still starts", async () => {
    const lines = captureLog();
    stubOpenRouter(["openai/gpt-5.2", "openai/gpt-5-mini", "openai/gpt-4.1", "openai/gpt-4.1-mini"]);
    const provider = fromEnv(PROD_MODELS);
    await expect(provider.init()).resolves.toBeUndefined();
    provider.close();

    expect(provider.models().map((m) => m.id)).toEqual(["openai/gpt-5.2", "openai/gpt-5-mini", "openai/gpt-4.1", "openai/gpt-4.1-mini"]);
    expect(provider.defaultAliases()).not.toHaveProperty("gpt-4.1-nano");
    expect(provider.defaultAliases()).toMatchObject({ "gpt-4.1": "openai/gpt-4.1", "gpt-4.1-mini": "openai/gpt-4.1-mini" });

    // The hourly fetch does not repeat the line: exactly one per model and process.
    await provider.refreshPrices();
    expect(lines.filter((l) => l.includes("pin model not offered"))).toEqual(["[inference] pin model not offered model=openai/gpt-4.1-nano"]);

    // The catalogue builds, and the missing one is a plain 404 as before.
    const catalog = new Catalog([provider], provider.defaultAliases());
    const { db, address } = walletWith();
    const res = await handleChat(db, catalog, address, { model: "gpt-4.1-nano", messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe("model_not_found");
  });

  it("still aborts the start when a model from CP_OPENROUTER_MODELS is missing", async () => {
    captureLog();
    // Pin model gpt-4.1-nano is missing too: only the model from the environment is named.
    stubOpenRouter(["openai/gpt-5.2", "openai/gpt-5-mini", "openai/gpt-4.1", "openai/gpt-4.1-mini"]);
    const provider = fromEnv("openai/gpt-5.2,openai/does-not-exist");
    const err = await provider.init().then(
      () => null,
      (e: unknown) => e as Error,
    );
    provider.close();
    expect(err?.message).toBe("OpenRouter does not know these models: openai/does-not-exist");
    for (const id of RUNTIME_PIN_MODELS) expect(err?.message).not.toContain(id);

    // A pin model named in CP_OPENROUTER_MODELS is a configured model and stops the start like any.
    stubOpenRouter(["openai/gpt-5.2", "openai/gpt-5-mini"]);
    await expect(fromEnv("openai/gpt-5.2,openai/gpt-4.1-nano").init()).rejects.toThrow(
      /^OpenRouter does not know these models: openai\/gpt-4\.1-nano$/,
    );
  });

  it("lists no model twice when CP_OPENROUTER_MODELS names a pin model", async () => {
    const calls = stubOpenRouter(ALL);
    const provider = fromEnv("openai/gpt-5.2,openai/gpt-4.1-mini,openai/gpt-5.2");
    await provider.init();
    provider.close();
    expect(calls.filter((c) => c.path === "/models")).toHaveLength(1);
    expect(provider.models().map((m) => m.id)).toEqual(["openai/gpt-5.2", "openai/gpt-4.1-mini", "openai/gpt-4.1", "openai/gpt-4.1-nano"]);

    const ids = new Catalog([provider], provider.defaultAliases()).listModels().data.map((r) => String(r.id));
    expect(ids).toHaveLength(new Set(ids).size);
    expect(ids.filter((id) => id === "openai/gpt-4.1-mini")).toHaveLength(1);
    expect(ids.filter((id) => id === "gpt-4.1-mini")).toHaveLength(1);
  });

  it("charges a pin model at the catalogue price times 1.3", async () => {
    expect(MARKUP).toBe(1.3);
    // No usage.cost in the answer: the charge is the list price formula on the catalogue price.
    const calls = stubOpenRouter(ALL);
    const provider = fromEnv(PROD_MODELS);
    await provider.init();
    provider.close();
    const catalog = new Catalog([provider], provider.defaultAliases());

    const row = catalog.listModels().data.find((r) => r.id === "gpt-4.1-mini")!;
    const pricing = row.pricing as { input_per_million: number; output_per_million: number };
    expect(pricing.input_per_million).toBe(sellPrice(0.4));
    expect(pricing.output_per_million).toBe(sellPrice(1.6));
    expect(pricing.input_per_million).toBeCloseTo(0.52, 10);
    expect(pricing.output_per_million).toBeCloseTo(2.08, 10);

    const { db, address, balance, rows } = walletWith();
    const before = balance();
    const res = await handleChat(db, catalog, address, { model: "gpt-4.1-mini", messages: [{ role: "user", content: "hi" }], max_tokens: 64 });
    expect(res.status).toBe(200);
    // 1000 prompt tokens at 0.4 USD and 20 completion tokens at 1.6 USD per million, 100000 mc per USD.
    const expected = Math.ceil((1000 * 0.4 + 20 * 1.6) * 0.1 * 1.3);
    expect(expected).toBe(57);
    expect(balance()).toBe(before - expected);
    expect(rows().map((r) => r.delta_mc)).toEqual([-expected]);

    // The price cap sent to OpenRouter is the purchase price, not the sale price.
    const sent = calls.find((c) => c.path === "/chat/completions")!.body!;
    expect(sent.provider).toMatchObject({ max_price: { prompt: 0.4, completion: 1.6 } });
  });
});
