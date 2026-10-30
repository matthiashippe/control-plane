/**
 * Two weeks of notice instead of none (HAN-62, HAN-63, 2026-09-30).
 *
 * 1d65aac stopped selling OpenRouter the moment it was deployed. /terms promises at least two weeks
 * before anything is shut down, and two paying strangers held credit bought for inference that day:
 * 999,481 mc and 500,000 mc. So the sale runs until `inferenceSunsetAt` and every answer says when
 * it ends; from then on it is the refusal of 1d65aac. The topups close at once, whatever the date,
 * because credit bought today for inference that ends on the 17th is the same broken promise again.
 *
 * Every case is run on both sides of the sunset, and the doc cases with two different dates, so a
 * date that is hard-coded somewhere cannot pass.
 */
import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import type { Address, Hex } from "viem";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { OpenRouterProvider } from "../src/inference/openrouter.js";
import { MockProvider } from "../src/inference/mock.js";
import { Catalog } from "../src/inference/proxy.js";
import type { PayConfig } from "../src/payments/pay.js";
import type { Authorization, Settler, SettleResult } from "../src/payments/settler.js";

const SUNSET = new Date("2026-10-17T00:00:00Z");
const BEFORE = () => new Date("2026-10-01T12:00:00Z");
const AFTER = () => new Date(SUNSET.getTime() + 1000);

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const PAY_TO = "0x914102284463f4f58b1d2f6db9ac80bfcaa7d614" as Address;
const PAY: PayConfig = {
  payTo: PAY_TO,
  network: "base",
  chainId: 8453,
  usdcAddress: USDC,
  maxTimeoutSeconds: 300,
  tiers: [5, 25, 100],
  publicOrigin: "https://postyourprice.com",
};

class FakeSettler implements Settler {
  readonly kind = "fake";
  calls = 0;
  async settle(_a: Authorization, _s: Hex): Promise<SettleResult> {
    this.calls++;
    return { ok: true, txHash: `0x${"ab".repeat(32)}` as Hex };
  }
}

/** A real, valid X-Payment header for 5 USD, so a refusal is the gate and not a bad signature. */
async function signedPayment(account: ReturnType<typeof privateKeyToAccount>) {
  const now = Math.floor(Date.now() / 1000);
  const validAfter = BigInt(now - 60);
  const validBefore = BigInt(now + 300);
  const value = 5_000_000n;
  const nonce = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}` as Hex;
  const signature = await account.signTypedData({
    domain: { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: USDC },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: { from: account.address, to: PAY_TO, value, validAfter, validBefore, nonce },
  });
  return Buffer.from(
    JSON.stringify({
      x402Version: 1,
      scheme: "exact",
      network: "eip155:8453",
      payload: {
        signature,
        authorization: {
          from: account.address,
          to: PAY_TO,
          value: value.toString(),
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce,
        },
      },
    }),
  ).toString("base64");
}

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

async function openRouterCatalog() {
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
    // The mechanism under test is a provider that may not be sold; OpenRouter is one again
    // only when CP_OPENROUTER_RESALE=0.
    resale: false,
  });
  await provider.init();
  return { catalog: new Catalog([provider], provider.defaultAliases()), chatCalls };
}

function setup(catalog: Catalog, now: () => Date, sunsetAt: Date = SUNSET, balanceMc = 500_000) {
  const db = openDb(":memory:");
  const settler = new FakeSettler();
  const app = createApp({ db, catalog, pay: PAY, settler, inferenceSunsetAt: sunsetAt, now, rateLimit: null });
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const key = "cnwy_k_" + "56".repeat(16);
  const stamp = new Date().toISOString();
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, stamp);
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address, hashApiKey(key), key.slice(0, 15), "t", stamp,
  );
  if (balanceMc > 0) postLedger(db, { address, kind: "topup", deltaMc: balanceMc, ref: "seed" });
  const post = (path: string, body: unknown) =>
    app.request(path, { method: "POST", headers: { "content-type": "application/json", authorization: key }, body: JSON.stringify(body) });
  const balance = () => (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(address) as { balance_mc: number }).balance_mc;
  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  const inferenceRows = () => count("SELECT count(*) AS n FROM ledger WHERE kind = 'inference'");
  const ledgerRows = () => count("SELECT count(*) AS n FROM ledger");
  const paymentRows = () => count("SELECT count(*) AS n FROM payments");
  return { app, db, settler, address, key, post, balance, inferenceRows, ledgerRows, paymentRows };
}

const startJob = (app: ReturnType<typeof createApp>) =>
  app.request("/start", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "brief=" + encodeURIComponent("Write 50 words about tea for a cafe menu.") + "&kind=factual",
  });

const CHAT = { model: "gpt-5-mini", messages: [{ role: "user", content: "hi" }] };
const CHECK = { briefing: "Write 50 words about tea.", submission: "Tea is a drink." };
const HTTP_DATE = "Sat, 17 Oct 2026 00:00:00 GMT";

type Notice = { handsel_notice?: { inference_ends_at: string; message: string } };

function expectNotice(res: Response, body: Notice, what: string) {
  expect(res.headers.get("sunset"), what).toBe(HTTP_DATE);
  expect(res.headers.get("link"), what).toBe('</terms>; rel="sunset"');
  expect(body.handsel_notice?.inference_ends_at, what).toBe(SUNSET.toISOString());
  expect(body.handsel_notice?.message, what).toMatch(/17 October 2026/);
  expect(body.handsel_notice?.message, what).toMatch(/pay only\s+for jobs on the board/);
}

describe("before the sunset inference is sold, and every answer says until when", () => {
  it("sells a chat completion, books one inference row, and carries the notice", async () => {
    const { catalog, chatCalls } = await openRouterCatalog();
    const s = setup(catalog, BEFORE);
    const before = s.balance();
    const res = await s.post("/v1/chat/completions", CHAT);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Notice & { choices: unknown[] };
    expect(body.choices).toHaveLength(1);
    expectNotice(res, body, "chat 200");
    expect(chatCalls).toHaveLength(1);
    expect(s.inferenceRows()).toBe(1);
    expect(s.balance()).toBeLessThan(before);
  });

  it("sells /v1/check and lists /v1/models, both with the notice", async () => {
    const { catalog, chatCalls } = await openRouterCatalog();
    const s = setup(catalog, BEFORE);
    const check = await s.post("/v1/check", CHECK);
    expect(check.status).toBe(200);
    expectNotice(check, (await check.json()) as Notice, "check 200");
    expect(chatCalls).toHaveLength(1);
    expect(s.inferenceRows()).toBe(1);
    const models = await s.app.request("/v1/models");
    expect(models.status).toBe(200);
    const list = (await models.json()) as Notice & { data: unknown[] };
    expect(list.data.length).toBeGreaterThan(0);
    expectNotice(models, list, "models 200");
  });

  it("puts the notice on the 402 and the 400 too, and the 402 names no topup and hands out no grant", async () => {
    const { catalog, chatCalls } = await openRouterCatalog();
    const s = setup(catalog, BEFORE, SUNSET, 0);
    const ledgerBefore = s.ledgerRows();
    const poor = await s.post("/v1/chat/completions", CHAT);
    expect(poor.status).toBe(402);
    const body = (await poor.json()) as Notice & { error: string; message: string; details: Record<string, unknown> };
    expect(body.error).toBe("INSUFFICIENT_CREDITS");
    expectNotice(poor, body, "chat 402");
    expect(body.message).not.toContain("/pay/");
    expect(body.details.topup_url).toBeUndefined();
    expect(body.details.required_cents).toBeGreaterThan(0);
    expect(s.ledgerRows(), "no starter grant taken while intake is closed").toBe(ledgerBefore);
    expect(chatCalls).toHaveLength(0);
    const bad = await s.post("/v1/check", { briefing: "" });
    expect(bad.status).toBe(400);
    expectNotice(bad, (await bad.json()) as Notice, "check 400");
  });

  it("carries no notice where nothing leaves the shelf: the mock catalogue sells on as before", async () => {
    const s = setup(new Catalog([new MockProvider()], { "gpt-5-mini": "mock-1" }), BEFORE);
    const res = await s.post("/v1/chat/completions", CHAT);
    expect(res.status).toBe(200);
    expect(res.headers.get("sunset")).toBeNull();
    expect(((await res.json()) as Notice).handsel_notice).toBeUndefined();
  });
});

describe("from the sunset on it is the refusal of 1d65aac", () => {
  it("answers chat, check and models with 503, buys nothing, books nothing, says no sunset", async () => {
    const { catalog, chatCalls } = await openRouterCatalog();
    const s = setup(catalog, AFTER);
    const before = s.balance();
    const ledgerBefore = s.ledgerRows();
    for (const [path, body] of [["/v1/chat/completions", CHAT], ["/v1/check", CHECK]] as const) {
      const res = await s.post(path, body);
      expect(res.status, path).toBe(503);
      expect(((await res.json()) as { error: string }).error, path).toBe("inference_not_for_sale");
      expect(res.headers.get("sunset"), path).toBeNull();
    }
    const models = await s.app.request("/v1/models");
    expect(models.status).toBe(503);
    expect(((await models.json()) as { error: string }).error).toBe("inference_not_for_sale");
    expect(chatCalls, "not one request may reach OpenRouter").toHaveLength(0);
    expect(s.inferenceRows()).toBe(0);
    expect(s.ledgerRows()).toBe(ledgerBefore);
    expect(s.balance()).toBe(before);
  });
});

describe("intake is closed on both sides of the sunset", () => {
  for (const [side, now] of [["before", BEFORE], ["after", AFTER]] as const) {
    it(`refuses a valid, signed topup on both pay routes ${side} the sunset, and settles nothing`, async () => {
      const { catalog } = await openRouterCatalog();
      const s = setup(catalog, now);
      const payer = privateKeyToAccount(generatePrivateKey());
      const payments = s.paymentRows();
      const ledger = s.ledgerRows();
      for (const path of ["/pay/5", `/pay/5/${payer.address.toLowerCase()}`]) {
        const res = await s.app.request(path, { headers: { "x-payment": await signedPayment(payer) } });
        expect(res.status, path).toBe(410);
        expect(((await res.json()) as { error: string }).error, path).toBe("topups_closed");
        // Without the header too: a 402 would be an offer to pay.
        expect((await s.app.request(path)).status, path).toBe(410);
      }
      expect(s.settler.calls).toBe(0);
      expect(s.paymentRows()).toBe(payments);
      expect(s.ledgerRows()).toBe(ledger);
    });

    it(`refuses the starter credit and the free first job ${side} the sunset, and books nothing`, async () => {
      const { catalog } = await openRouterCatalog();
      const s = setup(catalog, now, SUNSET, 0);
      const ledger = s.ledgerRows();
      const starter = await s.post("/v1/credits/starter", {});
      expect(starter.status).toBe(410);
      expect(((await starter.json()) as { error: string }).error).toBe("starter_closed");
      const start = await startJob(s.app);
      expect(start.status).toBe(503);
      const bal = (await (await s.app.request("/v1/credits/balance", { headers: { authorization: s.key } })).json()) as Record<string, unknown>;
      expect(bal.starter_available_cents, "no offer the starter route would refuse").toBeUndefined();
      expect(s.ledgerRows()).toBe(ledger);
      expect((s.db.prepare("SELECT count(*) AS n FROM bounties").get() as { n: number }).n).toBe(0);
      expect(s.balance()).toBe(0);
    });
  }

  it("the same signed topup settles where nothing leaves the shelf, so the refusal above is the gate", async () => {
    const s = setup(new Catalog([new MockProvider()]), BEFORE);
    const payer = privateKeyToAccount(generatePrivateKey());
    const res = await s.app.request("/pay/5", { headers: { "x-payment": await signedPayment(payer) } });
    expect(res.status).toBe(200);
    expect(s.settler.calls).toBe(1);
    expect(s.paymentRows()).toBe(1);
    const bal = (await (await s.app.request("/v1/credits/balance", { headers: { authorization: s.key } })).json()) as Record<string, unknown>;
    expect(bal.starter_available_cents).toBeGreaterThan(0);
    const starter = await s.post("/v1/credits/starter", {});
    expect(starter.status).toBe(201);
    const start = await startJob(s.app);
    expect(start.status).toBe(201);
    expect((s.db.prepare("SELECT count(*) AS n FROM bounties").get() as { n: number }).n).toBe(1);
  });
});

describe("the docs say the configured date, not a constant", () => {
  const OTHER = new Date("2026-11-03T00:00:00Z");
  const surfaces = async (sunsetAt: Date) => {
    const { catalog } = await openRouterCatalog();
    const s = setup(catalog, BEFORE, sunsetAt);
    const text = async (p: string) => (await s.app.request(p)).text();
    return {
      terms: await text("/terms"),
      llms: await text("/llms.txt"),
      post: await text("/post"),
      openapi: await text("/openapi.json"),
      status: await text("/v1/status"),
      x402: await text("/.well-known/x402"),
    };
  };

  it("renders each date on every surface, and never the other one", async () => {
    const oct = await surfaces(SUNSET);
    const nov = await surfaces(OTHER);
    for (const name of ["terms", "llms", "post"] as const) {
      expect(oct[name], name).toContain("17 October 2026");
      expect(oct[name], name).not.toContain("3 November 2026");
      expect(nov[name], name).toContain("3 November 2026");
      expect(nov[name], name).not.toContain("17 October 2026");
    }
    for (const name of ["openapi", "status", "x402"] as const) {
      expect(oct[name], name).toContain(SUNSET.toISOString());
      expect(oct[name], name).not.toContain(OTHER.toISOString());
      expect(nov[name], name).toContain(OTHER.toISOString());
      expect(nov[name], name).not.toContain(SUNSET.toISOString());
    }
    expect(oct.terms).toMatch(/No more credits are\s+sold/);
    // Matthias decides this sentence (HAN-62, part 2), so it stays word for word.
    expect(oct.terms).toContain("by e-mail to every address that");
  });

  it("drops the announcement after the sunset and keeps the text of 1d65aac", async () => {
    const { catalog } = await openRouterCatalog();
    const s = setup(catalog, AFTER);
    const terms = await (await s.app.request("/terms")).text();
    expect(terms).not.toContain("Inference ends on");
    expect(terms).toMatch(/no longer sells\s+access to language models/);
    const status = (await (await s.app.request("/v1/status")).json()) as Notice;
    expect(status.handsel_notice).toBeUndefined();
  });

  for (const [side, now] of [["before", BEFORE], ["after", AFTER]] as const) {
    it(`documents no topup tier and no x402 offer ${side} the sunset`, async () => {
      const { catalog } = await openRouterCatalog();
      const s = setup(catalog, now);
      const status = (await (await s.app.request("/v1/status")).json()) as { topup_tiers_usd: number[] };
      expect(status.topup_tiers_usd).toEqual([]);
      const pricing = (await (await s.app.request("/v1/credits/pricing", { headers: { authorization: s.key } })).json()) as { topup_tiers_usd: number[] };
      expect(pricing.topup_tiers_usd).toEqual([]);
      const x402 = (await (await s.app.request("/.well-known/x402")).json()) as { accepts: unknown[]; endpoints: Record<string, string> };
      expect(x402.accepts).toEqual([]);
      expect(x402.endpoints.topup).toBeUndefined();
      expect(x402.endpoints.topup_for_wallet).toBeUndefined();
      const openapi = (await (await s.app.request("/openapi.json")).json()) as { paths: Record<string, unknown> };
      expect(Object.keys(openapi.paths).filter((p) => p.startsWith("/pay"))).toEqual([]);
      const llms = await (await s.app.request("/llms.txt")).text();
      expect(llms).not.toContain("Topup tiers");
      expect(llms).not.toContain("/pay/{usd}");
      expect(llms).not.toContain("/v1/credits/starter");
      const terms = await (await s.app.request("/terms")).text();
      expect(terms).not.toContain("5 USD top-up");
    });
  }

  it("documents the tiers where nothing leaves the shelf, so the empty lists above are the gate", async () => {
    const s = setup(new Catalog([new MockProvider()]), BEFORE);
    const status = (await (await s.app.request("/v1/status")).json()) as { topup_tiers_usd: number[] };
    expect(status.topup_tiers_usd).toEqual([5, 25, 100]);
    const x402 = (await (await s.app.request("/.well-known/x402")).json()) as { accepts: unknown[] };
    expect(x402.accepts).toHaveLength(1);
    const openapi = (await (await s.app.request("/openapi.json")).json()) as { paths: Record<string, unknown> };
    expect(Object.keys(openapi.paths)).toContain("/pay/{usd}");
    expect(await (await s.app.request("/llms.txt")).text()).toContain("Topup tiers");
    expect(await (await s.app.request("/terms")).text()).toContain("5 USD top-up");
  });
});
