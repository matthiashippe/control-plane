/**
 * An answer that does not reach the client is not charged (abrechnung 01, Matthias 2026-11-10).
 *
 * On 2026-11-10 three calls of a foreign automaton ran into its 60 second timeout and were charged
 * anyway, because the proxy booked as soon as the provider answered. These tests hold the other
 * direction: a provider that answers only after the client has gone, a closed socket on the real
 * node server, and the coalescer, where one caller leaving must not cost the one who stays.
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { serve } from "@hono/node-server";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import { Catalog, purchaseMc } from "../src/inference/proxy.js";
import { OpenRouterProvider } from "../src/inference/openrouter.js";
import type { ChatProvider, ChatRequest, ChatResponse, ModelSpec } from "../src/inference/provider.js";
import { ProviderUnavailableError } from "../src/inference/provider.js";
import { hashApiKey } from "../src/auth/siwe.js";

const MODEL: ModelSpec = { id: "gated-1", provider: "gated", inputPerMillion: 1, outputPerMillion: 2, contextWindow: 128_000 };
const PROMPT = "Turn 1. Summarise the harbour log of the night.";
const ANSWER = "The harbour log of the night shows four arrivals and no incidents.";
const USAGE = { prompt_tokens: 1200, completion_tokens: 800, total_tokens: 2000, cost_usd: 0.0123 };

type ChatArgs = ChatRequest & { maxTokens: number; apiKeyId: string; signal?: AbortSignal };

/**
 * Answers only when the test says so, whatever happened to the client in between: the provider
 * that already bought the answer when the caller gave up. With `honourAbort` it throws on abort
 * instead, like OpenRouter's fetch does.
 */
class GatedProvider implements ChatProvider {
  readonly id = "gated";
  readonly resale = true;
  calls = 0;
  answered = 0;
  sawAbort = false;
  private gates: Array<() => void> = [];
  constructor(private readonly honourAbort = false) {}
  models(): ModelSpec[] {
    return [MODEL];
  }
  release(): void {
    for (const open of this.gates.splice(0)) open();
  }
  async chat(req: ChatArgs): Promise<ChatResponse> {
    this.calls += 1;
    const gate = new Promise<void>((resolve, reject) => {
      this.gates.push(resolve);
      const onAbort = () => {
        this.sawAbort = true;
        if (this.honourAbort) reject(new ProviderUnavailableError(this.id, null, "aborted by the client"));
      };
      if (req.signal?.aborted) onAbort();
      else req.signal?.addEventListener("abort", onAbort, { once: true });
    });
    await gate;
    this.answered += 1;
    return {
      id: `gen-test-${this.calls}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: MODEL.id,
      choices: [{ index: 0, message: { role: "assistant", content: ANSWER }, finish_reason: "stop" }],
      usage: { ...USAGE },
    };
  }
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

async function until(what: string, ok: () => boolean, ms = 30_000): Promise<void> {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out waiting for: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function setup(opts: { honourAbort?: boolean } = {}) {
  const db = openDb(":memory:");
  const provider = new GatedProvider(opts.honourAbort);
  const app = createApp({ db, catalog: new Catalog([provider]) });
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const key = "cnwy_k_" + "cd".repeat(16);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address,
    hashApiKey(key),
    key.slice(0, 15),
    "test",
    new Date().toISOString(),
  );
  const startMc = 500_000;
  postLedger(db, { address, kind: "topup", deltaMc: startMc, ref: "seed" });

  const body = { model: MODEL.id, messages: [{ role: "user", content: PROMPT }], max_tokens: 512, stream: false };
  const chat = (signal?: AbortSignal) =>
    app.request(
      new Request("http://local/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: key },
        body: JSON.stringify(body),
        signal,
      }),
    );
  const wallet = () =>
    db.prepare("SELECT balance_mc, reserved_mc FROM wallets WHERE address = ?").get(address) as { balance_mc: number; reserved_mc: number };
  const available = () => wallet().balance_mc - wallet().reserved_mc;
  const inferenceRows = () =>
    db.prepare("SELECT delta_mc, ref FROM ledger WHERE address = ? AND kind = 'inference'").all(address) as { delta_mc: number; ref: string }[];
  const aborts = () => db.prepare("SELECT * FROM inference_aborts ORDER BY id").all() as Record<string, unknown>[];
  return { db, app, provider, address, key, body, chat, wallet, available, inferenceRows, aborts, startMc };
}

describe("client abort before the answer", () => {
  it("charges nothing when the provider answers only after the client aborted", async () => {
    const t = setup();
    const ctl = new AbortController();
    const pending = t.chat(ctl.signal);
    await until("the provider call", () => t.provider.calls === 1);
    expect(t.wallet().reserved_mc, "the call holds a reservation while it runs").toBeGreaterThan(0);

    ctl.abort();
    const res = await pending;
    expect(res.status).toBe(499);

    // The provider has bought the answer by now and hands it over after the client left.
    t.provider.release();
    await until("the abandoned call to finish", () => t.aborts().length === 1);
    await tick();

    expect(t.inferenceRows(), "no inference row for an answer that never arrived").toHaveLength(0);
    expect(t.wallet().balance_mc, "the balance is untouched").toBe(t.startMc);
    expect(t.available(), "the reservation is back: free credit equals the balance").toBe(t.wallet().balance_mc);
    expect(t.provider.sawAbort, "the abort reached the provider").toBe(true);
    expect(t.provider.answered).toBe(1);
  });

  it("charges nothing when the provider gives up on the abort itself", async () => {
    const t = setup({ honourAbort: true });
    const ctl = new AbortController();
    const pending = t.chat(ctl.signal);
    await until("the provider call", () => t.provider.calls === 1);
    ctl.abort();
    expect((await pending).status).toBe(499);
    await until("the abort row", () => t.aborts().length === 1);

    expect(t.inferenceRows()).toHaveLength(0);
    expect(t.available()).toBe(t.startMc);
    expect(t.provider.sawAbort).toBe(true);
    expect(t.provider.answered, "the provider never answered").toBe(0);
  });

  it("charges exactly once, as before, when nobody aborts", async () => {
    const t = setup();
    const ctl = new AbortController();
    const pending = t.chat(ctl.signal);
    await until("the provider call", () => t.provider.calls === 1);
    t.provider.release();
    const res = await pending;
    expect(res.status).toBe(200);
    expect(((await res.json()) as { choices: { message: { content: string } }[] }).choices[0].message.content).toBe(ANSWER);

    const rows = t.inferenceRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].delta_mc).toBeLessThan(0);
    expect(t.wallet().balance_mc).toBe(t.startMc + rows[0].delta_mc);
    expect(t.wallet().reserved_mc).toBe(0);
    expect(t.provider.sawAbort).toBe(false);
  });

  it("charges nothing when the socket closes on the real node server", async () => {
    // app.request() hands the signal over by hand. In production it comes from @hono/node-server,
    // which aborts c.req.raw.signal when the connection closes early; this holds that wiring.
    const t = setup();
    const server = serve({ fetch: t.app.fetch, port: 0, hostname: "127.0.0.1" });
    try {
      await new Promise<void>((resolve) => (server.listening ? resolve() : server.once("listening", () => resolve())));
      const { port } = server.address() as AddressInfo;
      const payload = JSON.stringify(t.body);
      const req = http.request({
        host: "127.0.0.1",
        port,
        method: "POST",
        path: "/v1/chat/completions",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload), authorization: t.key },
      });
      req.on("error", () => undefined);
      req.end(payload);

      await until("the provider call", () => t.provider.calls === 1);
      req.destroy();
      await until("the abort to reach the provider", () => t.provider.sawAbort);
      t.provider.release();
      await until("the abort row", () => t.aborts().length === 1);
      await tick();

      expect(t.inferenceRows()).toHaveLength(0);
      expect(t.available()).toBe(t.startMc);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe("coalesced identical requests and aborts", () => {
  it("coalesced: when one of two callers aborts, the other gets the answer and pays once", async () => {
    const t = setup();
    const first = new AbortController();
    const second = new AbortController();
    const a = t.chat(first.signal);
    const b = t.chat(second.signal);
    await until("the provider call", () => t.provider.calls === 1);
    await tick();

    first.abort();
    expect((await a).status).toBe(499);
    t.provider.release();
    const res = await b;
    expect(res.status).toBe(200);
    expect(((await res.json()) as { id: string }).id).toBe("gen-test-1");

    expect(t.provider.calls, "one purchase for both").toBe(1);
    expect(t.provider.sawAbort, "the remaining caller keeps the purchase alive").toBe(false);
    expect(t.inferenceRows(), "exactly one inference row").toHaveLength(1);
    expect(t.wallet().reserved_mc).toBe(0);
    expect(t.aborts(), "a coalesced caller leaving is not an aborted purchase").toHaveLength(0);
  });

  it("coalesced: when both callers abort, nobody is charged", async () => {
    const t = setup();
    const first = new AbortController();
    const second = new AbortController();
    const a = t.chat(first.signal);
    const b = t.chat(second.signal);
    await until("the provider call", () => t.provider.calls === 1);
    await tick();

    first.abort();
    expect((await a).status).toBe(499);
    expect(t.provider.sawAbort, "one caller still waits, so the purchase goes on").toBe(false);
    second.abort();
    expect((await b).status).toBe(499);
    expect(t.provider.sawAbort, "the last caller gone cancels upstream").toBe(true);

    t.provider.release();
    await until("the abort row", () => t.aborts().length === 1);
    await tick();
    expect(t.provider.calls).toBe(1);
    expect(t.inferenceRows()).toHaveLength(0);
    expect(t.available()).toBe(t.startMc);
  });
});

describe("the abort is written down", () => {
  it("records model, duration, purchase price and time, without prompt, answer or address", async () => {
    const t = setup();
    const ctl = new AbortController();
    const before = Date.now();
    const pending = t.chat(ctl.signal);
    await until("the provider call", () => t.provider.calls === 1);
    await new Promise((resolve) => setTimeout(resolve, 40));
    ctl.abort();
    await pending;
    t.provider.release();
    await until("the abort row", () => t.aborts().length === 1);

    const [row] = t.aborts();
    expect(row.model).toBe(MODEL.id);
    expect(row.requested_model).toBe(MODEL.id);
    expect(row.provider).toBe("gated");
    expect(row.answered).toBe(1);
    expect(row.ref).toBe("gen-test-1");
    expect(row.purchase_mc, "what the answer cost us, in mc, without markup").toBe(purchaseMc(MODEL, USAGE));
    expect(Number.isInteger(row.purchase_mc)).toBe(true);
    expect(row.duration_ms as number).toBeGreaterThanOrEqual(35);
    expect(row.duration_ms as number).toBeLessThan(60_000);
    const at = Date.parse(row.created_at as string);
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());

    const flat = JSON.stringify(row).toLowerCase();
    expect(flat).not.toContain(PROMPT.toLowerCase());
    expect(flat).not.toContain("harbour");
    expect(flat).not.toContain(t.address.slice(2));
    const columns = (t.db.prepare("PRAGMA table_info(inference_aborts)").all() as { name: string }[]).map((c) => c.name);
    // Exactly these columns: none of them can carry an address, a prompt or an answer. `upstream`
    // (abrechnung 02) names the provider that answered, e.g. "Azure", never a customer.
    expect(columns).toEqual(["id", "model", "requested_model", "provider", "duration_ms", "purchase_mc", "answered", "ref", "created_at", "upstream"]);
  });

  it("records nothing when the client does not abort", async () => {
    const t = setup();
    const pending = t.chat(new AbortController().signal);
    await until("the provider call", () => t.provider.calls === 1);
    t.provider.release();
    expect((await pending).status).toBe(200);
    await tick();
    expect(t.aborts()).toHaveLength(0);
    expect(t.inferenceRows()).toHaveLength(1);
  });
});

describe("OpenRouter passes the client's abort to its request", () => {
  it("aborts the upstream fetch when the client signal fires", async () => {
    let upstreamSignal: AbortSignal | undefined;
    const fakeFetch = (async (_url: unknown, init?: RequestInit) => {
      upstreamSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        upstreamSignal?.addEventListener("abort", () => reject(new Error("The operation was aborted")), { once: true });
      });
    }) as typeof fetch;
    const provider = new OpenRouterProvider({ apiKey: "test", models: ["openai/gpt-5.2"], fetch: fakeFetch, priceRefreshMs: 0 });
    provider.loadSnapshot([{ id: "openai/gpt-5.2", provider: "openrouter", inputPerMillion: 1, outputPerMillion: 2, contextWindow: 1000 }]);
    const ctl = new AbortController();
    const call = provider.chat({
      model: "openai/gpt-5.2",
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 16,
      apiKeyId: "x",
      signal: ctl.signal,
    });
    await until("the upstream fetch", () => upstreamSignal !== undefined);
    expect(upstreamSignal?.aborted).toBe(false);
    ctl.abort();
    await expect(call).rejects.toThrow(/aborted by the client/);
    expect(upstreamSignal?.aborted).toBe(true);
  });
});
