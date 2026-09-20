import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { OpenRouterProvider, DEFAULT_OPENROUTER_ALIASES } from "../src/inference/openrouter.js";
import { Catalog, costMc, MARKUP } from "../src/inference/proxy.js";
import { ProviderUnavailableError } from "../src/inference/provider.js";

const KEY = "sk-or-v1-test";
const MODELS_BODY = {
  data: [
    { id: "openai/gpt-5.2", context_length: 400000, pricing: { prompt: "0.00000175", completion: "0.000014" } },
    { id: "openai/gpt-5-mini", context_length: 400000, pricing: { prompt: "0.00000025", completion: "0.000002" } },
    { id: "z-ai/glm-5.3-flash", context_length: 1310720, pricing: { prompt: "0.00000009", completion: "0.0000003" } },
  ],
};

interface Recorded {
  url: string;
  init: RequestInit;
  body: Record<string, unknown> | null;
}

/** fetch-Stub: nimmt Antworten je Pfad entgegen und zeichnet Requests auf. */
function stubFetch(handlers: Record<string, (rec: Recorded) => Response | Promise<Response>>) {
  const calls: Recorded[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url).pathname.replace(/^\/api\/v1/, "");
    const rec: Recorded = { url, init: init ?? {}, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null };
    calls.push(rec);
    const handler = handlers[path];
    if (!handler) return new Response(JSON.stringify({ error: "no stub for " + path }), { status: 500 });
    return handler(rec);
  }) as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function makeProvider(chatHandler: (rec: Recorded) => Response | Promise<Response>, models = ["openai/gpt-5.2", "openai/gpt-5-mini"]) {
  const { impl, calls } = stubFetch({ "/models": () => json(MODELS_BODY), "/chat/completions": chatHandler });
  const provider = new OpenRouterProvider({ apiKey: KEY, models, fetch: impl, priceRefreshMs: 0, baseUrl: "https://openrouter.ai/api/v1" });
  await provider.init();
  return { provider, calls };
}

function appWith(provider: OpenRouterProvider, balanceMc = 500_000) {
  const db = openDb(":memory:");
  const app = createApp({ db, catalog: new Catalog([provider], provider.defaultAliases()) });
  const account = privateKeyToAccount(generatePrivateKey());
  const address = account.address.toLowerCase();
  const key = "cnwy_k_" + "12".repeat(16);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(address, hashApiKey(key), key.slice(0, 15), "t", new Date().toISOString());
  if (balanceMc > 0) postLedger(db, { address, kind: "topup", deltaMc: balanceMc, ref: "seed" });
  const chat = (body: unknown) =>
    app.request("/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: key }, body: JSON.stringify(body) });
  const balance = () => (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(address) as { balance_mc: number }).balance_mc;
  const rows = () => db.prepare("SELECT delta_mc, meta FROM ledger WHERE kind = 'inference'").all() as { delta_mc: number; meta: string }[];
  return { db, app, key, chat, balance, rows };
}

const OK_RESPONSE = {
  id: "gen-123",
  model: "openai/gpt-5-mini",
  created: 1700000000,
  choices: [{ index: 0, message: { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "check_credits", arguments: "{}" } }] }, finish_reason: "tool_calls" }],
  usage: { prompt_tokens: 1000, completion_tokens: 20, total_tokens: 1020, cost: 0.00029 },
};

describe("OpenRouterProvider", () => {
  it("lädt Katalog und Preise aus /models (USD je Token -> je Million) und liefert Default-Aliase", async () => {
    const { provider, calls } = await makeProvider(() => json(OK_RESPONSE));
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/models");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    const specs = provider.models();
    expect(specs.map((s) => s.id).sort()).toEqual(["openai/gpt-5-mini", "openai/gpt-5.2"]);
    const gpt52 = specs.find((s) => s.id === "openai/gpt-5.2")!;
    expect(gpt52.inputPerMillion).toBeCloseTo(1.75, 6);
    expect(gpt52.outputPerMillion).toBeCloseTo(14, 6);
    expect(gpt52.contextWindow).toBe(400000);
    expect(provider.defaultAliases()).toEqual(DEFAULT_OPENROUTER_ALIASES);
  });

  it("bricht beim Start ab, wenn ein konfiguriertes Modell bei OpenRouter fehlt", async () => {
    await expect(makeProvider(() => json(OK_RESPONSE), ["openai/gpt-5.2", "openai/does-not-exist"])).rejects.toThrow(/does-not-exist/);
  });

  it("schickt den Request 1:1 mit usage.include und Bearer-Header; Alias gpt-5-mini wird zur OpenRouter-ID", async () => {
    const { provider, calls } = await makeProvider(() => json(OK_RESPONSE));
    const { chat } = appWith(provider);
    const tools = [{ type: "function", function: { name: "check_credits", parameters: { type: "object", properties: {} } } }];
    const res = await chat({ model: "gpt-5-mini", messages: [{ role: "user", content: "hi" }], tools, tool_choice: "auto", max_completion_tokens: 256, temperature: 0.2 });
    expect(res.status).toBe(200);
    const req = calls.find((c) => c.url.endsWith("/chat/completions"))!;
    expect(req.body).toMatchObject({ model: "openai/gpt-5-mini", max_tokens: 256, stream: false, usage: { include: true }, tool_choice: "auto", temperature: 0.2 });
    expect((req.body!.tools as unknown[]).length).toBe(1);
    const headers = req.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(headers["HTTP-Referer"]).toBeTruthy();
    expect(headers["X-Title"]).toBeTruthy();
    const body = (await res.json()) as { model: string; choices: { message: { tool_calls: { function: { name: string } }[] }; finish_reason: string }[]; usage: { cost_usd: number } };
    expect(body.model).toBe("gpt-5-mini");
    expect(body.choices[0].message.tool_calls[0].function.name).toBe("check_credits");
    expect(body.choices[0].finish_reason).toBe("tool_calls");
    expect(body.usage.cost_usd).toBe(0.00029);
  });

  it("bucht nach usage.cost x 1,3 ab und schreibt cost_usd, purchase_mc und margin_mc ins Ledger", async () => {
    const { provider } = await makeProvider(() => json(OK_RESPONSE));
    const { chat, balance, rows } = appWith(provider);
    const before = balance();
    await chat({ model: "gpt-5.2", messages: [{ role: "user", content: "hi" }] });
    const expected = Math.ceil(0.00029 * 100_000 * MARKUP); // 38 mc
    expect(expected).toBe(38);
    expect(balance()).toBe(before - expected);
    const [row] = rows();
    expect(row.delta_mc).toBe(-expected);
    const meta = JSON.parse(row.meta) as { cost_usd: number; purchase_mc: number; margin_mc: number; cost_mc: number };
    expect(meta.cost_usd).toBe(0.00029);
    expect(meta.purchase_mc).toBe(29);
    expect(meta.margin_mc).toBe(expected - 29);
    expect(meta.cost_mc).toBe(expected);
  });

  it("fällt ohne usage.cost auf die Listenpreis-Formel zurück", async () => {
    const noCost = { ...OK_RESPONSE, usage: { prompt_tokens: 1000, completion_tokens: 20, total_tokens: 1020 } };
    const { provider } = await makeProvider(() => json(noCost));
    const { chat, balance, rows } = appWith(provider);
    const before = balance();
    await chat({ model: "gpt-5-mini", messages: [{ role: "user", content: "hi" }] });
    const spec = provider.models().find((s) => s.id === "openai/gpt-5-mini")!;
    const expected = costMc(spec, { prompt_tokens: 1000, completion_tokens: 20 });
    expect(expected).toBe(Math.ceil((1000 * 0.25 + 20 * 2) * 0.1 * MARKUP));
    expect(balance()).toBe(before - expected);
    expect(JSON.parse(rows()[0].meta).cost_usd).toBeNull();
  });

  it("meldet OpenRouter 402/429/5xx als 503 provider_unavailable ohne Ledger-Zeile", async () => {
    for (const status of [402, 429, 502]) {
      const { provider } = await makeProvider(() => json({ error: { message: "nope", code: status } }, status));
      const { chat, balance, rows } = appWith(provider);
      const before = balance();
      const res = await chat({ model: "gpt-5.2", messages: [{ role: "user", content: "hi" }] });
      expect(res.status).toBe(503);
      const text = await res.text();
      const body = JSON.parse(text) as { error: string; provider: string; message: string; docs: string };
      expect(body.error).toBe("provider_unavailable");
      expect(body.provider, "das Feld provider bleibt").toBe("openrouter");
      // Der Upstream-Text gehört ins Log, nicht in die Antwort: er sagt dem Leser nichts und
      // verrät den Zustand unseres Einkaufs.
      expect(text).not.toContain("nope");
      expect(text).not.toContain(String(status));
      expect(body.message, "der Leser muss wissen, dass es nicht an seinem Guthaben liegt").toMatch(
        /not a credit problem/,
      );
      expect(body.message).toMatch(/retryable/);
      expect(body.docs).toContain("docs/errors.md#inference");
      expect(balance()).toBe(before);
      expect(rows()).toHaveLength(0);
    }
  });

  it("meldet ein 200 mit Fehlerobjekt (Upstream-Fehler) ebenfalls als 503", async () => {
    const { provider } = await makeProvider(() => json({ error: { message: "provider overloaded", code: 502 } }));
    const { chat, rows } = appWith(provider);
    const res = await chat({ model: "gpt-5.2", messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(503);
    expect(rows()).toHaveLength(0);
  });

  it("reicht OpenRouter 400 als 400 provider_rejected_request durch", async () => {
    const { provider } = await makeProvider(() => json({ error: { message: "bad tools schema" } }, 400));
    const { chat } = appWith(provider);
    const res = await chat({ model: "gpt-5.2", messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details: { error: { message: string } }; message: string };
    expect(body.error).toBe("provider_rejected_request");
    expect(body.details.error.message, "die Antwort des Providers auf den eigenen Body bleibt erhalten").toBe(
      "bad tools schema",
    );
    expect(body.message, "und daneben steht, was das heißt und dass nichts abgebucht wurde").toMatch(
      /Nothing was charged/,
    );
  });

  it("bricht bei Timeout mit ProviderUnavailableError ab", async () => {
    const { impl } = stubFetch({
      "/models": () => json(MODELS_BODY),
      "/chat/completions": (rec) =>
        new Promise((_, reject) => {
          (rec.init.signal as AbortSignal).addEventListener("abort", () => reject(new Error("aborted")));
        }),
    });
    const provider = new OpenRouterProvider({ apiKey: KEY, models: ["openai/gpt-5.2"], fetch: impl, priceRefreshMs: 0, timeoutMs: 20 });
    await provider.init();
    await expect(provider.chat({ model: "openai/gpt-5.2", messages: [{ role: "user", content: "hi" }], maxTokens: 10, apiKeyId: "x" })).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("bricht den Preisabruf beim Start nach dem Timeout ab, statt still zu hängen", async () => {
    // Regression: am 19.09.2026 blieb der Start unbegrenzt in GET /models stehen. Der Prozess gab
    // keine Zeile aus, der Healthcheck schlug an, Compose brach ab und der Dienst war 502.
    const { impl } = stubFetch({
      "/models": (rec) =>
        new Promise((_, reject) => {
          (rec.init.signal as AbortSignal).addEventListener("abort", () => reject(new Error("aborted")));
        }),
    });
    const provider = new OpenRouterProvider({
      apiKey: KEY,
      models: ["openai/gpt-5.2"],
      fetch: impl,
      priceRefreshMs: 0,
      priceFetchTimeoutMs: 20,
    });
    const started = Date.now();
    await expect(provider.init()).rejects.toThrow(/timeout after 20 ms/);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("nennt den Grund, wenn der Preisabruf beim Start aus einem anderen Grund scheitert", async () => {
    const { impl } = stubFetch({ "/models": () => Promise.reject(new Error("ECONNREFUSED")) });
    const provider = new OpenRouterProvider({ apiKey: KEY, models: ["openai/gpt-5.2"], fetch: impl, priceRefreshMs: 0 });
    await expect(provider.init()).rejects.toThrow(/GET \/models: ECONNREFUSED/);
  });
});

describe("Start ohne erreichbaren OpenRouter", () => {
  it("liefert einen Snapshot der Preise und lädt ihn zurück", async () => {
    // Das ist die Grundlage dafür, dass der Start nicht an einem Drittanbieter hängt.
    const { impl } = stubFetch({ "/models": () => json(MODELS_BODY) });
    const a = new OpenRouterProvider({ apiKey: KEY, models: ["openai/gpt-5.2", "openai/gpt-5-mini"], fetch: impl, priceRefreshMs: 0 });
    await a.init();
    const snapshot = a.snapshot();
    expect(snapshot.length).toBe(2);

    // Ein zweiter Provider, dessen Abruf scheitert, kommt über den Snapshot trotzdem hoch.
    const { impl: kaputt } = stubFetch({ "/models": () => Promise.reject(new Error("ECONNREFUSED")) });
    const b = new OpenRouterProvider({ apiKey: KEY, models: ["openai/gpt-5.2"], fetch: kaputt, priceRefreshMs: 0 });
    await expect(b.init()).rejects.toThrow();
    b.loadSnapshot(JSON.parse(JSON.stringify(snapshot)));

    expect(b.models().map((m) => m.id).sort()).toEqual(snapshot.map((m) => m.id).sort());
    const preis = b.models().find((m) => m.id === "openai/gpt-5.2");
    expect(preis?.inputPerMillion, "die Preise müssen den Neustart überleben").toBe(
      snapshot.find((m) => m.id === "openai/gpt-5.2")?.inputPerMillion,
    );
  });

  it("deckt den Timeout auch das Lesen der Antwort ab, nicht nur den Verbindungsaufbau", async () => {
    // Die erste Fassung löschte den Timer direkt nach dem `fetch`. Die Modellliste von OpenRouter
    // ist über ein Megabyte groß; ein hängender Download hängt genauso wie ein hängender
    // Verbindungsaufbau, und genau das kostete den Dienst am 19.09.2026 zweimal die Erreichbarkeit.
    const { impl } = stubFetch({
      "/models": (rec) => {
        const signal = rec.init.signal as AbortSignal;
        return Promise.resolve({
          ok: true,
          status: 200,
          // Antwort kommt sofort, aber der Body niemals.
          json: () =>
            new Promise((_, reject) => {
              signal.addEventListener("abort", () => reject(new Error("aborted")));
            }),
        } as unknown as Response);
      },
    });
    const p = new OpenRouterProvider({ apiKey: KEY, models: ["openai/gpt-5.2"], fetch: impl, priceRefreshMs: 0, priceFetchTimeoutMs: 30 });
    const start = Date.now();
    await expect(p.init()).rejects.toThrow(/timeout after 30 ms/);
    expect(Date.now() - start, "der Start darf nicht hängen bleiben").toBeLessThan(2000);
  });
});

describe("Katalog speichern", () => {
  it("meldet auch den stündlichen Abruf, nicht nur den beim Start", async () => {
    // Vorher wurde der Katalog nur beim Start gespeichert. Der Prozess lief dann mit frischen
    // Preisen weiter, während der gespeicherte Stand veraltete, und nach einem Neustart ohne
    // erreichbaren Anbieter hätte der Dienst mit Zahlen von vorgestern gerechnet. Gefunden am
    // 20.09.2026: Der Cache war elf Stunden alt, obwohl der Prozess seit zwei Stunden lief.
    const gespeichert: number[] = [];
    let jetzt = 0;
    const { impl } = stubFetch({ "/models": () => json(MODELS_BODY) });
    const p = new OpenRouterProvider({
      apiKey: KEY,
      models: ["openai/gpt-5.2"],
      fetch: impl,
      priceRefreshMs: 0,
      now: () => jetzt,
      onRefresh: (specs) => gespeichert.push(specs.length),
    });

    await p.init();
    expect(gespeichert, "der Abruf beim Start meldet sich").toEqual([1]);

    jetzt += 3_600_000;
    await p.refreshPrices();
    expect(gespeichert, "der stündliche Abruf ebenfalls").toEqual([1, 1]);
  });

  it("meldet einen fehlgeschlagenen Abruf nicht als Erfolg", async () => {
    const gespeichert: number[] = [];
    const { impl } = stubFetch({ "/models": () => Promise.reject(new Error("ECONNREFUSED")) });
    const p = new OpenRouterProvider({
      apiKey: KEY,
      models: ["openai/gpt-5.2"],
      fetch: impl,
      priceRefreshMs: 0,
      onRefresh: (specs) => gespeichert.push(specs.length),
    });
    await expect(p.init()).rejects.toThrow();
    expect(gespeichert, "ein gescheiterter Abruf darf nichts speichern").toEqual([]);
  });
});
