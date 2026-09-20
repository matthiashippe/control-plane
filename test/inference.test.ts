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

/** Creates wallet and API key straight in the DB (provisioning is covered in auth.test.ts). */
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

describe("inference proxy", () => {
  it("answers in the OpenAI format with usage and a tool call", async () => {
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

  it("charges exactly usage x list price x 1.3 in millicents per call", async () => {
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

  it("lowers the balance over five calls by exactly the sum of the ledger rows and sends the sleep call on the fifth", async () => {
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

  it("answers an empty account with the 402 shape the runtime parses, and charges nothing", async () => {
    const { chat, request, inferenceRows } = setup(0);
    const res = await chat(request());
    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: string; details: { required_cents: number; current_balance_cents: number } };
    expect(body.error).toBe("INSUFFICIENT_CREDITS");
    expect(body.details.current_balance_cents).toBe(0);
    expect(body.details.required_cents).toBeGreaterThan(0);
    expect(inferenceRows()).toHaveLength(0);
  });

  it("never charges more than the balance and records the rest as uncollected_mc", async () => {
    // A provider whose reported usage far exceeds the up-front estimate (tokenizer drift, extreme case).
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

  it("rejects an unknown model with 404", async () => {
    const { chat, request } = setup();
    const res = await chat({ ...request(), model: "gpt-5.2" });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe("model_not_found");
  });

  it("serves /v1/models with sale prices = list price x 1.3", async () => {
    const { app, key } = setup();
    const res = await app.request("/v1/models", { headers: { authorization: key } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string; provider: string; available: boolean; pricing: { input_per_million: number; output_per_million: number } }[] };
    expect(body.data).toHaveLength(1);
    // provider "other": the only value the upstream registry does not disable on restart and that
    // is reliably routed through the control plane.
    expect(body.data[0]).toMatchObject({ id: "mock-1", provider: "other", owned_by: "mock", available: true });
    expect((body.data[0] as unknown as { pricing: { input_per_1k: number } }).pricing.input_per_1k).toBeCloseTo(
      sellPrice(MOCK_MODEL.inputPerMillion) / 1000,
      9,
    );
    expect(body.data[0].pricing.input_per_million).toBe(sellPrice(MOCK_MODEL.inputPerMillion));
    expect(body.data[0].pricing.input_per_million).toBeCloseTo(MOCK_MODEL.inputPerMillion * 1.3, 6);
    expect(body.data[0].pricing.output_per_million).toBeCloseTo(MOCK_MODEL.outputPerMillion * 1.3, 6);
  });

  it("serves the IDs of the upstream routing matrix via aliases and answers with the requested ID", async () => {
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
    expect(() => new Catalog([new MockProvider()], { "gpt-5.2": "nope" })).toThrow(/unknown model/);
  });

  it("accepts max_completion_tokens and rejects stream", async () => {
    const { chat, request } = setup();
    const ok = await chat({ ...request(), max_tokens: undefined, max_completion_tokens: 256 });
    expect(ok.status).toBe(200);
    const bad = await chat({ ...request(), stream: true });
    expect(bad.status).toBe(400);
  });

  it("requires an API key", async () => {
    const { app, request } = setup();
    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request()),
    });
    expect(res.status).toBe(401);
  });
});

/**
 * Like setup(), but with a provider that really waits on I/O before answering. Only then do the
 * requests overlap in the event loop the way they do with a real provider.
 */
function setupSlow(balanceMc: number) {
  const base = setup(balanceMc);
  const real = base.provider.chat.bind(base.provider);
  base.provider.chat = async (req: Parameters<typeof real>[0]) => {
    await new Promise((r) => setTimeout(r, 15));
    return real(req);
  };
  return base;
}

describe("credit coverage under concurrency", () => {
  it("does not let parallel calls spend the same credit twice", async () => {
    // Security finding 19.09.2026: between the balance check and the charge sits the provider call.
    // Before, every concurrent request read the same balance, all of them went through, and in the
    // end only what was left got charged. With 1 USD of credit roughly 65 USD of real purchase cost
    // was reachable that way. The provider counts along here: what matters is not only the final
    // balance but how often anything was bought at all.
    // The provider has to really wait, otherwise there is no race: a mock answering synchronously
    // runs one after the other in the event loop and the bug stays invisible.
    // 500 mc cover exactly three calls at 160 mc. With 40 concurrent requests the overdraft is
    // thirteen times the credit if coverage is not checked atomically.
    const { chat, request, balance, inferenceRows, provider } = setupSlow(500);

    const answers = await Promise.all(Array.from({ length: 40 }, (_, i) => chat(request(i))));
    const codes = answers.map((r) => r.status);
    const ok = codes.filter((c) => c === 200).length;
    const rejected = codes.filter((c) => c === 402).length;

    expect(ok + rejected, "status codes other than 200/402 are a bug here").toBe(40);
    expect(balance(), "the balance must never fall below zero").toBeGreaterThanOrEqual(0);

    const charged = inferenceRows().reduce((sum, r) => sum + Math.abs(r.delta_mc), 0);
    expect(charged, "no more may be charged than was paid in").toBeLessThanOrEqual(500);
    expect(ok, "500 mc cover at most three calls at 160 mc").toBeLessThanOrEqual(3);
    expect(inferenceRows(), "every successful call writes exactly one ledger row").toHaveLength(ok);

    // The real damage was not the balance but the purchase at the provider: every call let through
    // costs real money, even when it cannot be billed.
    const unpaid = inferenceRows()
      .map((r) => JSON.parse(r.meta) as { uncollected_mc: number })
      .reduce((sum, m) => sum + (m.uncollected_mc || 0), 0);
    expect(unpaid, "no call may run through unpaid").toBe(0);
    expect(provider.totalCalls, "every provider call costs real money, even one that cannot be billed").toBe(ok);
  });

  it("gives the reservation back when the provider fails", async () => {
    // Otherwise credit stays blocked for good after a provider error and the tenant can no longer
    // reach their own money.
    const { db, chat, request, address } = setup(50_000);
    const reserved = () =>
      (db.prepare("SELECT reserved_mc FROM wallets WHERE address = ?").get(address) as { reserved_mc: number }).reserved_mc;

    expect(reserved()).toBe(0);
    const res = await chat({ ...request(1), model: "does-not-exist" });
    expect(res.status).toBe(404);
    expect(reserved(), "a rejected call must not reserve anything").toBe(0);

    const ok = await chat(request(2));
    expect(ok.status).toBe(200);
    expect(reserved(), "after a successful call nothing is reserved any more").toBe(0);
  });
});

describe("coalescing of concurrent identical requests", () => {
  it("does not buy twice for a retry that arrives during the first call", async () => {
    // The upstream runtime aborts after 60 seconds (INFERENCE_TIMEOUT_MS) and retries on 429, 500,
    // 502, 503 and 504. Our call at the purchasing provider runs for up to 120 seconds. If an answer
    // takes somewhere in between, the client sees a timeout and sends the same request again while
    // the first one is still running. Without coalescing the customer pays twice for an answer they
    // get once. That is exactly the bug we document about Conway (issue #393, retry-driven
    // duplicate topups).
    const { chat, request, balance, inferenceRows, provider } = setupSlow(500_000);
    const req = request(1);

    const [a, b] = await Promise.all([chat(req), chat(req)]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(provider.totalCalls, "the purchase may happen only once").toBe(1);
    expect(inferenceRows(), "and it may be charged only once").toHaveLength(1);

    const both = [(await a.json()) as { id: string }, (await b.json()) as { id: string }];
    expect(both[0].id, "both get the same answer").toBe(both[1].id);
    expect(500_000 - balance()).toBe(Math.abs(inferenceRows()[0].delta_mc));
  });

  it("never coalesces requests from different tenants", async () => {
    // The key contains the address. Two customers who happen to send the same prompt must share
    // neither the answer nor the charge.
    const first = setupSlow(500_000);
    const second = setupSlow(500_000);
    const same = first.request(7);

    const [a, b] = await Promise.all([first.chat(same), second.chat(same)]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(first.provider.totalCalls).toBe(1);
    expect(second.provider.totalCalls).toBe(1);
    expect(first.inferenceRows()).toHaveLength(1);
    expect(second.inferenceRows()).toHaveLength(1);
  });

  it("does NOT coalesce identical requests sent one after the other", async () => {
    // Only what runs at the same time is coalesced. Whoever asks the same thing twice and waited
    // for the first answer gets a second answer and pays for it. Otherwise the variance at
    // temperature > 0 would be gone, and an agent repeating on purpose would get canned answers.
    const { chat, request, inferenceRows, provider } = setupSlow(500_000);
    const req = request(2);

    expect((await chat(req)).status).toBe(200);
    expect((await chat(req)).status).toBe(200);

    expect(provider.totalCalls).toBe(2);
    expect(inferenceRows()).toHaveLength(2);
  });
});

/**
 * The last exit without a booking: the purchase at the provider has happened, the answer is there,
 * and only afterwards something goes wrong. The code keeps a release in the `finally` for that,
 * ever since such a case surfaced on 19.09.2026. A counter-check on 20.09. showed that this
 * release can be removed without a single test turning red: the path was unprotected.
 *
 * It costs the customer more than a provider outage does. On an outage nothing is bought and
 * nothing is reserved. Here something is bought, and without the release their credit stays
 * blocked until the process restarts.
 */
describe("errors after the provider's answer", () => {
  it("releases the reservation when billing fails on broken numbers", async () => {
    const { db, provider, chat, request, address, balance, inferenceRows } = setup(500_000);
    const reserved = () =>
      (db.prepare("SELECT reserved_mc FROM wallets WHERE address = ?").get(address) as { reserved_mc: number }).reserved_mc;
    const before = balance();

    // A provider that answers but delivers unusable usage numbers. NaN makes it all the way into
    // the booking and SQLite rejects it, so postLedger throws after the purchase.
    const real = provider.chat.bind(provider);
    provider.chat = async (req: Parameters<typeof real>[0]) => {
      const answer = await real(req);
      return { ...answer, usage: { ...answer.usage, prompt_tokens: NaN, completion_tokens: NaN, cost_usd: NaN } };
    };

    const res = await chat(request(1));
    expect(res.status, "an error after the purchase must not be a 200").toBeGreaterThanOrEqual(400);
    expect(reserved(), "otherwise the credit stays blocked until the process restarts").toBe(0);
    expect(balance(), "nothing can be charged when the numbers are broken").toBe(before);
    expect(inferenceRows()).toHaveLength(0);
  });
});
