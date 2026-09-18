import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import { MockProvider, MOCK_MODEL } from "../src/inference/mock.js";
import { Catalog, costMc, MARKUP, sellPrice } from "../src/inference/proxy.js";
import type { ChatProvider } from "../src/inference/provider.js";
import { hashApiKey } from "../src/auth/siwe.js";

const TOOLS = ["check_credits", "system_synopsis", "list_models", "view_soul", "sleep", "exec"].map((name) => ({
  type: "function" as const,
  function: { name, description: name, parameters: { type: "object", properties: {} } },
}));

/** Legt Wallet und API-Key direkt in der DB an (Provisionierung ist in auth.test.ts geprüft). */
function setup(balanceMc = 500_000) {
  const db = openDb(":memory:");
  const provider = new MockProvider();
  const app = createApp({ db, catalog: new Catalog([provider]) });
  const account = privateKeyToAccount(generatePrivateKey());
  const address = account.address.toLowerCase();
  const key = "cnwy_k_" + "ab".repeat(16);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, ?, ?)").run(address, 0, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address,
    hashApiKey(key),
    key.slice(0, 15),
    "test",
    new Date().toISOString(),
  );
  if (balanceMc > 0) postLedger(db, { address, kind: "topup", deltaMc: balanceMc, ref: "seed" });

  const chat = (body: unknown) =>
    app.request("/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: key },
      body: JSON.stringify(body),
    });
  const balance = () => (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(address) as { balance_mc: number }).balance_mc;
  const inferenceRows = () =>
    db.prepare("SELECT delta_mc, ref, meta FROM ledger WHERE address = ? AND kind = 'inference' ORDER BY id").all(address) as {
      delta_mc: number;
      ref: string;
      meta: string;
    }[];
  const request = (n = 1) => ({
    model: MOCK_MODEL.id,
    messages: [
      { role: "system", content: "You are a harness automaton." },
      { role: "user", content: `Turn ${n}. Do something useful.` },
    ],
    tools: TOOLS,
    tool_choice: "auto",
    max_tokens: 512,
    stream: false,
  });
  return { db, app, key, address, chat, balance, inferenceRows, request, provider };
}

describe("Inferenz-Proxy", () => {
  it("antwortet im OpenAI-Format mit usage und einem Tool-Call", async () => {
    const { chat, request } = setup();
    const res = await chat(request());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      object: string;
      model: string;
      choices: { message: { role: string; tool_calls?: { function: { name: string; arguments: string } }[] }; finish_reason: string }[];
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };
    expect(body.object).toBe("chat.completion");
    expect(body.model).toBe("mock-1");
    expect(body.choices[0].message.role).toBe("assistant");
    expect(body.choices[0].finish_reason).toBe("tool_calls");
    expect(body.choices[0].message.tool_calls?.[0].function.name).toBe("check_credits");
    expect(JSON.parse(body.choices[0].message.tool_calls![0].function.arguments)).toEqual({});
    expect(body.usage.prompt_tokens).toBeGreaterThan(0);
    expect(body.usage.total_tokens).toBe(body.usage.prompt_tokens + body.usage.completion_tokens);
  });

  it("bucht je Call genau die Kosten aus usage x Listenpreis x 1,3 in Millicents ab", async () => {
    const { chat, request, balance, inferenceRows } = setup();
    const before = balance();
    const body = (await (await chat(request())).json()) as { id: string; usage: { prompt_tokens: number; completion_tokens: number } };
    const expected = Math.ceil((body.usage.prompt_tokens * MOCK_MODEL.inputPerMillion + body.usage.completion_tokens * MOCK_MODEL.outputPerMillion) * 0.1 * MARKUP);
    expect(costMc(MOCK_MODEL, body.usage)).toBe(expected);
    expect(balance()).toBe(before - expected);
    const rows = inferenceRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].delta_mc).toBe(-expected);
    expect(rows[0].ref).toBe(body.id);
    expect(JSON.parse(rows[0].meta)).toMatchObject({ model: "mock-1", cost_mc: expected, uncollected_mc: 0 });
  });

  it("senkt den Saldo über fünf Calls exakt um die Summe der Ledger-Zeilen und schickt am fünften den sleep-Call", async () => {
    const { chat, request, balance, inferenceRows } = setup();
    const start = balance();
    const names: string[] = [];
    for (let n = 1; n <= 5; n++) {
      const body = (await (await chat(request(n))).json()) as { choices: { message: { tool_calls?: { function: { name: string; arguments: string } }[] } }[] };
      names.push(body.choices[0].message.tool_calls?.[0].function.name ?? "text");
    }
    expect(names).toEqual(["check_credits", "system_synopsis", "list_models", "view_soul", "sleep"]);
    const rows = inferenceRows();
    expect(rows).toHaveLength(5);
    const sum = rows.reduce((acc, r) => acc + r.delta_mc, 0);
    expect(balance()).toBe(start + sum);
    expect(sum).toBeLessThan(0);
  });

  it("antwortet bei leerem Konto mit dem 402-Format, das die Runtime parst, und bucht nichts", async () => {
    const { chat, request, inferenceRows } = setup(0);
    const res = await chat(request());
    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: string; details: { required_cents: number; current_balance_cents: number } };
    expect(body.error).toBe("INSUFFICIENT_CREDITS");
    expect(body.details.current_balance_cents).toBe(0);
    expect(body.details.required_cents).toBeGreaterThan(0);
    expect(inferenceRows()).toHaveLength(0);
  });

  it("bucht nie mehr ab als den Saldo und vermerkt den Rest als uncollected_mc", async () => {
    // Provider, dessen gemeldete usage die Vorprüfung weit übersteigt (Tokenizer-Drift im Extrem).
    const greedy: ChatProvider = {
      id: "greedy",
      models: () => [{ ...MOCK_MODEL, id: "greedy-1", provider: "greedy" }],
      chat: async () => ({
        id: "chatcmpl-greedy",
        object: "chat.completion",
        created: 0,
        model: "greedy-1",
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1_000_000, completion_tokens: 0, total_tokens: 1_000_000 },
      }),
    };
    const { db, key, address } = setup(5_000);
    const app = createApp({ db, catalog: new Catalog([greedy]) });
    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: key },
      body: JSON.stringify({ model: "greedy-1", messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
    });
    expect(res.status).toBe(200);
    const balance = (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(address) as { balance_mc: number }).balance_mc;
    expect(balance).toBe(0);
    const row = db.prepare("SELECT delta_mc, meta FROM ledger WHERE address = ? AND kind = 'inference'").get(address) as { delta_mc: number; meta: string };
    expect(row.delta_mc).toBe(-5_000);
    const meta = JSON.parse(row.meta) as { cost_mc: number; uncollected_mc: number };
    expect(meta.cost_mc).toBe(130_000);
    expect(meta.uncollected_mc).toBe(125_000);
  });

  it("lehnt ein unbekanntes Modell mit 404 ab", async () => {
    const { chat, request } = setup();
    const res = await chat({ ...request(), model: "gpt-5.2" });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe("model_not_found");
  });

  it("liefert /v1/models mit Verkaufspreisen = Listenpreis x 1,3", async () => {
    const { app, key } = setup();
    const res = await app.request("/v1/models", { headers: { authorization: key } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string; provider: string; available: boolean; pricing: { input_per_million: number; output_per_million: number } }[] };
    expect(body.data).toHaveLength(1);
    // provider "other": einziger Wert, den die Upstream-Registry beim Neustart nicht deaktiviert
    // und der sicher über das Control Plane geroutet wird.
    expect(body.data[0]).toMatchObject({ id: "mock-1", provider: "other", owned_by: "mock", available: true });
    expect((body.data[0] as unknown as { pricing: { input_per_1k: number } }).pricing.input_per_1k).toBeCloseTo(
      sellPrice(MOCK_MODEL.inputPerMillion) / 1000,
      9,
    );
    expect(body.data[0].pricing.input_per_million).toBe(sellPrice(MOCK_MODEL.inputPerMillion));
    expect(body.data[0].pricing.input_per_million).toBeCloseTo(MOCK_MODEL.inputPerMillion * 1.3, 6);
    expect(body.data[0].pricing.output_per_million).toBeCloseTo(MOCK_MODEL.outputPerMillion * 1.3, 6);
  });

  it("bedient die IDs der Upstream-Routing-Matrix per Alias und antwortet mit der angefragten ID", async () => {
    const { db, key, address } = setup();
    const app = createApp({ db, catalog: new Catalog([new MockProvider()], { "gpt-5.2": "mock-1", "gpt-5-mini": "mock-1" }) });
    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: key },
      body: JSON.stringify({ model: "gpt-5.2", messages: [{ role: "user", content: "hi" }], tools: TOOLS, max_completion_tokens: 256 }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { model: string }).model).toBe("gpt-5.2");
    const meta = JSON.parse(
      (db.prepare("SELECT meta FROM ledger WHERE address = ? AND kind = 'inference'").get(address) as { meta: string }).meta,
    ) as { model: string; requested_model: string };
    expect(meta).toMatchObject({ model: "mock-1", requested_model: "gpt-5.2" });
    const models = (await (await app.request("/v1/models", { headers: { authorization: key } })).json()) as { data: { id: string }[] };
    expect(models.data.map((m) => m.id).sort()).toEqual(["gpt-5-mini", "gpt-5.2", "mock-1"]);
    expect(() => new Catalog([new MockProvider()], { "gpt-5.2": "nope" })).toThrow(/unbekanntes Modell/);
  });

  it("akzeptiert max_completion_tokens und lehnt stream ab", async () => {
    const { chat, request } = setup();
    const ok = await chat({ ...request(), max_tokens: undefined, max_completion_tokens: 256 });
    expect(ok.status).toBe(200);
    const bad = await chat({ ...request(), stream: true });
    expect(bad.status).toBe(400);
  });

  it("verlangt einen API-Key", async () => {
    const { app, request } = setup();
    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request()),
    });
    expect(res.status).toBe(401);
  });
});
