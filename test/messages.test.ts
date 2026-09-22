/**
 * Error answers that tell a human what happened and what they can do (task A3).
 *
 * Every test pins down: the status code stays, the `error` field stays word for word, on top comes
 * a `message` that names the case and names a next step, plus a `docs` URL. At the end stands the
 * counter-check that none of these answers gives away internals.
 */

import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import type { Address, Hex } from "viem";
import { createApp } from "../src/app.js";
import { openDb, postLedger, type Db } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { claimStarter, poolLeftMc, GRANT_MC } from "../src/credits/starter.js";
import { MockProvider } from "../src/inference/mock.js";
import { Catalog } from "../src/inference/proxy.js";
import type { PayConfig } from "../src/payments/pay.js";
import type { Authorization, Settler, SettleResult } from "../src/payments/settler.js";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const PAY_TO = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
const PAY_CFG: PayConfig = {
  payTo: PAY_TO,
  network: "base",
  chainId: 8453,
  usdcAddress: USDC,
  maxTimeoutSeconds: 300,
  tiers: [5, 25, 100, 500, 1000, 2500],
};

class FakeSettler implements Settler {
  readonly kind = "fake";
  async settle(_auth: Authorization): Promise<SettleResult> {
    return { ok: true, txHash: `0x${"ab".repeat(32)}` as Hex };
  }
}

type ErrorBody = { error: string; message: string; docs?: string; [k: string]: unknown };

function setup() {
  const db = openDb(":memory:");
  const app = createApp({
    db,
    pay: PAY_CFG,
    settler: new FakeSettler(),
    catalog: new Catalog([new MockProvider()], { "gpt-5.2": "mock-1", "gpt-5-mini": "mock-1" }),
  });
  const account = privateKeyToAccount(generatePrivateKey());
  const address = account.address.toLowerCase();
  const key = "cnwy_k_" + "ef".repeat(16);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address,
    hashApiKey(key),
    key.slice(0, 15),
    "test",
    new Date().toISOString(),
  );
  const withKey = (path: string, init: RequestInit = {}) =>
    app.request(path, { ...init, headers: { "content-type": "application/json", authorization: key, ...(init.headers ?? {}) } });
  return { db, app, account, address, key, withKey };
}

/** Reads the body and checks the shape every speaking error answer has. */
async function expectError(res: Response, expectedCode: string): Promise<ErrorBody> {
  const body = (await res.json()) as ErrorBody;
  expect(body.error, "the error field stays unchanged").toBe(expectedCode);
  expect(typeof body.message, `message is missing for ${expectedCode}`).toBe("string");
  expect(body.message.length).toBeGreaterThan(40);
  return body;
}

describe("sandboxes: the 501 stays and now says that it is intentional", () => {
  it("POST /v1/sandboxes names the reason, the runtime's way out and the switch in the config", async () => {
    const { withKey } = setup();
    const res = await withKey("/v1/sandboxes", { method: "POST", body: JSON.stringify({ name: "child" }) });
    expect(res.status, "the status code stays 501: on it the runtime falls back to a local worker").toBe(501);
    const body = await expectError(res, "not_implemented");
    // The creation attempt gets the answer to its own question, not the one for the sub-paths.
    expect(body.message).toMatch(/^This control plane runs no sandboxes/);
    expect(body.message).not.toContain("exec in");
    expect(body.message).toContain("intended answer");
    expect(body.message).toContain("local worker");
    expect(body.message).toContain("sandboxId");
    expect(body.docs).toContain("docs/errors.md#sandboxes");
  });

  it("the sub-paths say that there is nothing to exec anything in", async () => {
    const { withKey } = setup();
    for (const path of ["/v1/sandboxes/abc/exec", "/v1/sandboxes/abc/files/tmp", "/v1/sandboxes/abc/ports/80"]) {
      const res = await withKey(path, { method: "POST", body: "{}" });
      expect(res.status).toBe(501);
      const body = await expectError(res, "not_implemented");
      expect(body.message).toMatch(/no sandbox to exec in/i);
      expect(body.docs).toContain("#sandboxes");
    }
  });

  it("GET /v1/sandboxes stays the empty list, so the runtime does not run into the error path", async () => {
    const { withKey } = setup();
    const res = await withKey("/v1/sandboxes");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sandboxes: [] });
  });
});

describe("credit transfers: 501 with regulation as the reason", () => {
  it("has both routes name the reason and the workable way to fund another automaton", async () => {
    const { withKey } = setup();
    for (const path of ["/v1/credits/transfer", "/v1/credits/transfers"]) {
      const res = await withKey(path, { method: "POST", body: JSON.stringify({ to_address: PAY_TO, amount_cents: 100 }) });
      expect(res.status).toBe(501);
      const body = await expectError(res, "not_implemented");
      expect(body.reason, "the reason field stays, it was there before").toBe("credit transfers are disabled in phase 1");
      expect(body.message, "credits are not redeemable, and that has to stay said").toMatch(/not redeemable/);
      expect(body.message, "nothing may leave here as money").toMatch(/never money|nothing leaves here as money/);
      expect(body.message).toMatch(/send USDC to that automaton's own wallet/i);
      // The message used to claim credits were "not transferable". Awarding a bounty moves them
      // between wallets, so that claim became false on 2026-09-20. It may not come back, and the
      // one movement that does exist has to be named here rather than hidden.
      expect(body.message, "a claim the bounty market makes untrue").not.toMatch(/not transferable/);
      expect(body.message, "the award exception must be named").toMatch(/awarding a bounty/i);
      expect(body.docs).toContain("#credit_transfers");
    }
  });
});

describe("rate limit: how long and why", () => {
  it("says in the 429 which limit applies, why it exists and when it continues", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, rateLimit: { limit: 3, windowMs: 60_000 } });
    const call = () => app.request("/v1/auth/nonce", { method: "POST", headers: { "x-forwarded-for": "203.0.113.42" } });
    for (let i = 0; i < 3; i++) expect((await call()).status).toBe(200);

    const res = await call();
    expect(res.status).toBe(429);
    const body = await expectError(res, "rate_limited");
    expect(body.retry_after_seconds, "the field stays, the runtime and curl users read it").toBeGreaterThan(0);
    expect(body.message).toContain("3 requests in 60 seconds");
    expect(body.message, "the reason belongs with it: these paths cost us disk and facilitator fees").toMatch(
      /facilitator/,
    );
    expect(body.message).toContain(`Wait ${body.retry_after_seconds} seconds`);
    expect(body.message, "the way out: with an API key the limit does not apply").toMatch(/not capped/);
    expect(body.docs).toContain("#rate_limited");
  });
});

describe("authentication: the Conway wording stays, the way stands next to it", () => {
  it("names the format and the way to a key on an invalid API key", async () => {
    const { app } = setup();
    const res = await app.request("/v1/credits/balance", { headers: { authorization: "Bearer not-our-key" } });
    expect(res.status).toBe(401);
    const body = await expectError(res, "Invalid API key");
    expect(body.message).toContain("cnwy_k_");
    // Said "without the Bearer prefix" until 2026-09-22, and this test held it there while
    // resolveApiKey accepted both forms all along. The message has to name the way in, not a
    // prefix that was never the problem.
    expect(body.message).toMatch(/raw or with the Bearer prefix/);
    expect(body.message).toMatch(/automaton --provision/);
    // A path they can call, not three words they have to look up. ops/fremder-client.sh walks in
    // from outside and stopped here: "(nonce, verify, api-keys)" names the steps and no URL.
    expect(body.message, "somebody with no runtime needs a path to start at").toMatch(/\/v1\/auth\/nonce/);
    expect(body.message).toContain("automaton --provision");
    expect(body.docs).toContain("#authentication");
  });

  it("says on /v1/auth/api-keys without a Bearer which of the two tokens is meant", async () => {
    const { app } = setup();
    const res = await app.request("/v1/auth/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(res.status).toBe(401);
    const body = await expectError(res, "Bearer token required");
    expect(body.message).toContain("access_token");
    expect(body.message).toContain("POST /v1/auth/verify");
  });

  it("explains a rejected SIWE signature without changing the wording in error", async () => {
    const { app } = setup();
    const nonce = ((await (await app.request("/v1/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
    const account = privateKeyToAccount(generatePrivateKey());
    const stranger = privateKeyToAccount(generatePrivateKey());
    const message = [
      `conway.tech wants you to sign in with your Ethereum account:`,
      account.address,
      "",
      "Sign in to Conway as an Automaton to provision an API key.",
      "",
      "URI: https://cp.hippe.eu/v1/auth/verify",
      "Version: 1",
      "Chain ID: 8453",
      `Nonce: ${nonce}`,
      `Issued At: ${new Date().toISOString()}`,
    ].join("\n");
    const signature = await stranger.signMessage({ message });
    const res = await app.request("/v1/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    expect(res.status).toBe(401);
    const body = await expectError(res, "Invalid signature");
    expect(body.message).toMatch(/does not recover to the address/);
  });

  it("rejects chain_type solana with the reason", async () => {
    const { app } = setup();
    const res = await app.request("/v1/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "x", signature: "0x", chain_type: "solana" }),
    });
    expect(res.status).toBe(400);
    const body = await expectError(res, "chain_type solana not supported");
    expect(body.message).toMatch(/EVM wallets only/);
  });
});

describe("payment path: every 402 says what has to be signed", () => {
  const sign = async (params: {
    account: ReturnType<typeof privateKeyToAccount>;
    to?: Address;
    from?: Address;
    value?: bigint;
    chainId?: number;
    network?: string;
    validBefore?: bigint;
    validAfter?: bigint;
    brokenSignature?: boolean;
  }) => {
    const now = Math.floor(Date.now() / 1000);
    const validAfter = params.validAfter ?? BigInt(now - 60);
    const validBefore = params.validBefore ?? BigInt(now + 300);
    const value = params.value ?? 5_000_000n;
    const to = params.to ?? PAY_TO;
    const from = params.from ?? (params.account.address as Address);
    const nonce = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}` as Hex;
    const signature = await params.account.signTypedData({
      domain: { name: "USD Coin", version: "2", chainId: params.chainId ?? 8453, verifyingContract: USDC },
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
      message: { from, to, value, validAfter, validBefore, nonce },
    });
    const payment = {
      x402Version: 1,
      scheme: "exact",
      network: params.network ?? "base",
      payload: {
        signature: params.brokenSignature ? (`0x${"11".repeat(65)}` as Hex) : signature,
        authorization: {
          from,
          to,
          value: value.toString(),
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce,
        },
      },
    };
    return Buffer.from(JSON.stringify(payment)).toString("base64");
  };

  const pay = (app: ReturnType<typeof createApp>, usd: number | string, address: string, header?: string) =>
    app.request(`/pay/${usd}/${address}`, { headers: header ? { "x-payment": header } : {} });

  it("explains the first 402 as an offer, not as an error", async () => {
    const { app, account } = setup();
    const res = await pay(app, 5, account.address);
    expect(res.status).toBe(402);
    const body = (await res.json()) as { message: string; docs: string; accepts: unknown[]; x402Version: number };
    expect(body.x402Version, "the offer itself stays untouched").toBe(1);
    expect(body.accepts).toHaveLength(1);
    expect(body.message).toContain("500 credit cents");
    expect(body.message).toContain("X-Payment");
    expect(body.docs).toContain("#payments");
  });

  it("invalid_signature names the domain, chainId and USDC address it was checked against", async () => {
    const { app, account } = setup();
    const header = await sign({ account, brokenSignature: true });
    const res = await pay(app, 5, account.address, header);
    expect(res.status).toBe(402);
    const body = await expectError(res, "invalid_signature");
    expect(body.message).toContain("TransferWithAuthorization");
    expect(body.message).toContain("8453");
    expect(body.message).toContain(USDC);
    expect(body.message).toMatch(/Nothing was charged/);
  });

  it("recipient_must_match_payer explains the rule and names the way to fund a child", async () => {
    const { app, account } = setup();
    const stranger = privateKeyToAccount(generatePrivateKey());
    const header = await sign({ account });
    const res = await pay(app, 5, stranger.address, header);
    expect(res.status).toBe(402);
    const body = await expectError(res, "recipient_must_match_payer");
    expect(body.message).toMatch(/wallet that signed the payment/);
    expect(body.message).toMatch(/replayable|redirect the credits/);
    expect(body.message).toMatch(/send USDC to its wallet/i);
  });

  it("wrong_amount keeps the expected amount in error and explains it in message", async () => {
    const { app, account } = setup();
    const header = await sign({ account, value: 1_000_000n });
    const res = await pay(app, 5, account.address, header);
    expect(res.status).toBe(402);
    const body = (await res.json()) as ErrorBody;
    expect(body.error, "the expected amount was already in error and stays there").toBe("wrong_amount: expected 5000000");
    expect(body.message).toContain("5000000 atomic USDC units");
  });

  it("wrong_recipient names the address the USDC have to go to", async () => {
    const { app, account } = setup();
    const header = await sign({ account, to: "0x000000000000000000000000000000000000dEaD" as Address });
    const body = await expectError(await pay(app, 5, account.address, header), "wrong_recipient");
    expect(body.message).toContain(PAY_TO);
  });

  it("wrong_network says which network this instance settles on", async () => {
    const { app, account } = setup();
    const header = await sign({ account, network: "base-sepolia", chainId: 84532 });
    const body = await expectError(await pay(app, 5, account.address, header), "wrong_network");
    expect(body.message).toContain("base");
    expect(body.message).toContain("8453");
  });

  it("malformed_payment describes how the X-Payment header is built", async () => {
    const { app, account } = setup();
    const body = await expectError(await pay(app, 5, account.address, "not-base64-json"), "malformed_payment");
    expect(body.message).toContain("base64");
    expect(body.message).toContain("validBefore");
  });

  it("authorization_expired and authorization_not_yet_valid say how the time windows are meant", async () => {
    const { app, account } = setup();
    const expiredHeader = await sign({ account, validBefore: BigInt(Math.floor(Date.now() / 1000) - 10) });
    const expired = await expectError(await pay(app, 5, account.address, expiredHeader), "authorization_expired");
    expect(expired.message).toContain("300 s");

    const future = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const earlyHeader = await sign({ account, validAfter: future, validBefore: future + 300n });
    const tooEarly = await expectError(await pay(app, 5, account.address, earlyHeader), "authorization_not_yet_valid");
    expect(tooEarly.message).toMatch(/now minus 60 seconds/);
  });

  it("invalid_tier and invalid_address say what to do instead", async () => {
    const { app, account } = setup();
    const tier = await expectError(await pay(app, 7, account.address), "invalid_tier");
    expect(tier.tiers, "the tier list is kept as a field").toEqual([5, 25, 100, 500, 1000, 2500]);
    expect(tier.message).toContain("5, 25, 100, 500, 1000, 2500");

    const address = await expectError(await pay(app, 5, "0xabc"), "invalid_address");
    expect(address.message).toMatch(/40 hex characters/);
  });

  it("payments_unavailable says that there is nothing to sign here", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db });
    const body = await expectError(await app.request("/pay/5/" + PAY_TO), "payments_unavailable");
    expect(body.message).toContain("/.well-known/x402");
    expect(body.docs).toContain("#payments");
  });
});

describe("registration: limits with a reason", () => {
  it("field_too_long names the field, the limit, the measured length and the reason for the limit", async () => {
    const { withKey, account } = setup();
    const res = await withKey("/v1/automatons/register", {
      method: "POST",
      body: JSON.stringify({
        automaton_id: crypto.randomUUID(),
        automaton_address: account.address,
        creator_address: PAY_TO,
        name: "Harness",
        bio: "x".repeat(2100),
        nonce: crypto.randomUUID(),
        signature: `0x${"11".repeat(65)}`,
        payload_hash: `0x${"22".repeat(32)}`,
      }),
    });
    expect(res.status).toBe(400);
    const body = await expectError(res, "field_too_long");
    expect(body.field, "the field and the limit were already in the body and stay").toBe("bio");
    expect(body.max_length).toBe(2000);
    expect(body.message).toContain("2100 characters long");
    expect(body.message).toContain("limit is 2000");
    expect(body.message, "the reason: registration is free and everything here lands on the disk").toMatch(
      /costs nothing and everything sent here is stored/,
    );
  });

  it("too_many_automatons names the limit, its reason and the way to more automatons", async () => {
    const { db, withKey, account, address } = setup();
    for (let i = 0; i < 25; i++) {
      db.prepare(
        "INSERT INTO automatons (automaton_id, address, creator_address, name, bio, genesis_prompt_hash, registered_at) VALUES (?, ?, ?, ?, '', NULL, ?)",
      ).run(`id-${i}`, address, address, `A${i}`, new Date().toISOString());
    }
    const res = await withKey("/v1/automatons/register", {
      method: "POST",
      body: JSON.stringify({
        automaton_id: crypto.randomUUID(),
        automaton_address: account.address,
        creator_address: PAY_TO,
        name: "Number 26",
        nonce: crypto.randomUUID(),
        signature: `0x${"11".repeat(65)}`,
        payload_hash: `0x${"22".repeat(32)}`,
      }),
    });
    expect(res.status).toBe(429);
    const body = await expectError(res, "too_many_automatons");
    expect(body.limit).toBe(25);
    expect(body.message).toContain("25 automatons");
    expect(body.message).toMatch(/keeps a single key from filling/);
    expect(body.message).toMatch(/its own wallet and its own API key/);
  });

  it("missing_fields says which fields are missing", async () => {
    const { withKey, account } = setup();
    const res = await withKey("/v1/automatons/register", {
      method: "POST",
      body: JSON.stringify({ automaton_address: account.address, name: "Without anything" }),
    });
    const body = await expectError(res, "missing_fields");
    const listing = body.message.split(". ")[0];
    expect(listing).toContain("automaton_id");
    expect(listing).toContain("signature");
    expect(listing, "fields that were sent are not reported as missing").not.toContain("name");
    expect(listing, "fields that were sent are not reported as missing").not.toContain("automaton_address");
  });

  it("payload_hash_mismatch describes how the hash is built", async () => {
    const { withKey, account } = setup();
    const res = await withKey("/v1/automatons/register", {
      method: "POST",
      body: JSON.stringify({
        automaton_id: crypto.randomUUID(),
        automaton_address: account.address,
        creator_address: PAY_TO,
        name: "Harness",
        nonce: crypto.randomUUID(),
        signature: `0x${"11".repeat(65)}`,
        payload_hash: `0x${"22".repeat(32)}`,
      }),
    });
    const body = await expectError(res, "payload_hash_mismatch");
    expect(body.message).toContain("keccak256");
    expect(body.message).toMatch(/sorted alphabetically/);
  });
});

describe("inference: models, credit, provider", () => {
  it("model_not_found names the models that exist here", async () => {
    const { withKey } = setup();
    const res = await withKey("/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: "hi" }] }),
    });
    expect(res.status).toBe(404);
    const body = await expectError(res, "model_not_found");
    expect(body.model, "the model field stays").toBe("gpt-4o");
    expect(body.message).toContain("mock-1");
    expect(body.message).toContain("gpt-5.2");
    expect(body.message).toContain("gpt-5-mini");
    expect(body.message).toContain("GET /v1/models");
    expect(body.docs).toContain("#model_not_found");
  });

  it("shortens the model list instead of pouring out a catalogue of many models", async () => {
    const db = openDb(":memory:");
    const many = Array.from({ length: 20 }, (_, i) => `alias-${i}`).reduce<Record<string, string>>((acc, alias) => {
      acc[alias] = "mock-1";
      return acc;
    }, {});
    const app = createApp({ db, catalog: new Catalog([new MockProvider()], many) });
    const key = "cnwy_k_" + "aa".repeat(16);
    const address = "0x" + "1".repeat(40);
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
      address,
      hashApiKey(key),
      key.slice(0, 15),
      "t",
      new Date().toISOString(),
    );
    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: key },
      body: JSON.stringify({ model: "does-not-exist", messages: [{ role: "user", content: "hi" }] }),
    });
    const body = await expectError(res, "model_not_found");
    expect(body.message).toMatch(/and \d+ more/);
    expect(body.message.length).toBeLessThan(600);
  });

  it("streaming_not_supported explains why nothing is streamed", async () => {
    const { withKey } = setup();
    const res = await withKey("/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-5.2", messages: [{ role: "user", content: "hi" }], stream: true }),
    });
    expect(res.status).toBe(400);
    const body = await expectError(res, "streaming_not_supported");
    expect(body.message).toMatch(/metered and charged server side/);
    expect(body.message).toContain('"stream": false');
  });

  it("INSUFFICIENT_CREDITS keeps the wording and details and adds the way to more credit", async () => {
    const { db, withKey } = setup();
    // Since 2026-09-21 a first call that cannot pay for itself is covered by the starter credit,
    // so this answer only exists once the free tier is behind the agent. That is the state it
    // spends its life in, and the wording is a contract the runtime parses, so it stays pinned.
    while (poolLeftMc(db) >= GRANT_MC) claimStarter(db, privateKeyToAccount(generatePrivateKey()).address.toLowerCase());
    const res = await withKey("/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-5.2", messages: [{ role: "user", content: "hi" }] }),
    });
    expect(res.status).toBe(402);
    const body = (await res.json()) as ErrorBody & { details: { required_cents: number; current_balance_cents: number } };
    expect(body.error).toBe("INSUFFICIENT_CREDITS");
    // The runtime looks for this marker anywhere in the body and reads `details` to pick the tier.
    expect(body.message).toMatch(/^Insufficient credits: need \d+ cents, have 0 cents\./);
    expect(body.details.required_cents).toBeGreaterThan(0);
    expect(body.details.current_balance_cents).toBe(0);
    expect(body.message).toContain("/pay/{usd}/{this wallet}");
  });

  it("inference_unavailable says that this instance sells no inference at all", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db });
    const key = "cnwy_k_" + "bb".repeat(16);
    const address = "0x" + "2".repeat(40);
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
      address,
      hashApiKey(key),
      key.slice(0, 15),
      "t",
      new Date().toISOString(),
    );
    const body = await expectError(await app.request("/v1/models", { headers: { authorization: key } }), "inference_unavailable");
    expect(body.message).toContain("/v1/status");
    expect(body.docs).toContain("#inference");
  });
});

describe("errors on our side", () => {
  it("the 500 names no stack trace but says that nothing was charged", async () => {
    const broken = {
      prepare() {
        throw new Error("SQLITE_CORRUPT: /var/lib/control-plane/data.db is malformed");
      },
    } as unknown as Db;
    const app = createApp({ db: broken, rateLimit: null });
    const res = await app.request("/v1/status");
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("SQLITE_CORRUPT");
    expect(text).not.toContain("/var/lib");
    const body = JSON.parse(text) as ErrorBody;
    expect(body.error).toBe("internal_error");
    expect(body.message).toMatch(/Nothing was charged/);
    expect(body.message).toContain("github.com/matthiashippe/control-plane/issues");
  });
});

describe("counter-check: no internals in the bodies", () => {
  it("no answer gives away paths, stack traces, keys or other tenants", async () => {
    const { app, db, withKey, account } = setup();
    // Another tenant with a balance and a key that must not appear in any answer.
    const other = "0xfeed" + "0".repeat(36);
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, ?, ?)").run(other, 777_000, new Date().toISOString());
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
      other,
      hashApiKey("cnwy_k_" + "99".repeat(16)),
      "cnwy_k_99999999",
      "other",
      new Date().toISOString(),
    );
    postLedger(db, { address: other, kind: "topup", deltaMc: 777_000, ref: "other-1" });

    const answers = await Promise.all([
      app.request("/does-not-exist"),
      app.request("/pay/7/" + account.address),
      app.request("/v1/credits/balance", { headers: { authorization: "cnwy_k_wrong" } }),
      withKey("/v1/sandboxes", { method: "POST", body: "{}" }),
      withKey("/v1/credits/transfer", { method: "POST", body: JSON.stringify({ to_address: other, amount_cents: 1 }) }),
      withKey("/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "nothing", messages: [] }) }),
      withKey("/v1/automatons/register", { method: "POST", body: JSON.stringify({ name: "x" }) }),
    ]);

    for (const res of answers) {
      const text = await res.text();
      expect(text, "no other tenant").not.toContain(other);
      expect(text, "no key material").not.toContain("cnwy_k_9");
      expect(text, "no stack trace").not.toMatch(/\bat [A-Za-z0-9_.]+ \(/);
      expect(text, "no file path from the server").not.toMatch(/\/(?:home|var|opt|usr|root)\//);
      expect(text, "no hint about the database").not.toMatch(/sqlite|SELECT |INSERT /i);
    }
  });
});

describe("wrong HTTP method", () => {
  it("answers 405 instead of 401 on a keyless path", async () => {
    // Seen on 20.09.2026: a GET on /v1/auth/verify fell through the route into the auth middleware
    // and was rejected as "no API key". The message asked for a key this path does not need at all.
    // Whoever mixed up the method ended up in a dead end.
    const { app } = setup();
    for (const path of ["/v1/auth/nonce", "/v1/auth/verify"]) {
      const res = await app.request(path, { method: "GET" });
      expect(res.status, `${path} with GET`).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
      const body = (await res.json()) as { error: string; message: string; allow: string[] };
      expect(body.error).toBe("method_not_allowed");
      expect(body.message, "the message has to say that no key is needed here").toMatch(/no API key/i);
      expect(body.allow).toEqual(["POST"]);
    }

    // /v1/auth/api-keys left this list on 2026-09-22, when GET became a real method on it: it
    // lists your own keys and therefore needs one. A GET without a key is a 401 and that is the
    // right answer. What still has to be a 405 is a method the path does not have at all.
    const getNeedsKey = await app.request("/v1/auth/api-keys", { method: "GET" });
    expect(getNeedsKey.status, "GET now exists there and needs a key").toBe(401);
    const wrongMethod = await app.request("/v1/auth/api-keys", { method: "DELETE" });
    expect(wrongMethod.status, "a method it does not have is still a 405").toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("GET, POST");
  });

  it("lets the right method through unchanged", async () => {
    const { app } = setup();
    const res = await app.request("/v1/auth/nonce", { method: "POST" });
    expect(res.status).toBe(200);
    expect((await res.json()) as { nonce: string }).toHaveProperty("nonce");
  });

  it("still answers 401 on protected paths, not 405", async () => {
    // There a 401 is right: without a key there is no access, whatever the method. Anything else
    // would give away which paths exist.
    const { app } = setup();
    expect((await app.request("/v1/credits/balance", { method: "DELETE" })).status).toBe(401);
  });
});

/**
 * Observed on 20.09.2026 at 09:26 UTC, four minutes after three issue comments: a caller from
 * Helsinki (python-httpx) fetched `/v1/status/v1/models` and `/v1/auth/verify/v1/models`. Both
 * times a 401 "Invalid API key" came back, because the auth middleware takes effect before the
 * routing. The caller then searches at their key while their base URL is the problem.
 */
describe("a path that does not exist is not a key problem", () => {
  it("never answers a joined path with 401, because that sends the caller to the wrong end", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db });
    const res = await app.request("/v1/status/v1/models");
    // The original intent of this test stands: a wrong path must not look like a wrong key. Since
    // 2026-09-20 the answer goes one step further and redirects to the real path, because being
    // right was not enough: the runtime retries a 404 by itself, so nobody ever read the
    // explanation, and one address kept trying for fourteen hours.
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("/v1/models");
  });

  it("names the cause on a doubled /v1/, in a header the redirect carries", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db });
    const res = await app.request("/v1/auth/verify/v1/models");
    expect(res.status).toBe(308);
    expect(res.headers.get("x-handsel-hint"), "the cause still has to be named").toMatch(/base URL/i);
  });

  it("puts the explanation in the redirect body, for the client that does not follow it", async () => {
    // The header and the Location are only read by a client that follows the redirect, and the
    // client that needs this one does not: httpx, which the OpenAI Python SDK is built on, has
    // follow_redirects off by default. On 2026-09-21 three 308s went to one address and no
    // request for the target ever arrived, so after two days of trying they had seen nothing but
    // an empty response. A 3xx may carry a body, and this one has to.
    const db = openDb(":memory:");
    const app = createApp({ db });
    const res = await app.request("/v1/auth/api-keys/v1/models");
    expect(res.status).toBe(308);
    const body = (await res.json()) as { error: string; message: string; endpoint: string; docs: string };
    expect(body.error).toBe("base_url_contains_a_path");
    expect(body.endpoint, "the endpoint they actually wanted").toBe("/v1/models");
    expect(body.message, "what to change, not what went wrong").toMatch(/bare origin/i);
    expect(body.message, "and that the redirect may not be followed for them").toMatch(/follow redirects/i);
    expect(body.docs).toBeTruthy();
  });

  it("still explains a path that is merely unknown, because nothing can be guessed there", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db });
    const body = (await (await app.request("/v1/nonsense")).json()) as { error: string; message: string; docs: string };
    expect(body.error).toBe("not_found");
    expect(body.docs).toContain("#service-errors");
  });

  it("leaves an unknown path without a doubling on the general answer", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db });
    const body = (await (await app.request("/v1/does-not-exist")).json()) as { message: string };
    expect(body.message).toMatch(/No such endpoint here/);
    expect(body.message).not.toMatch(/twice/);
  });

  it("still protects the real routes, and /v1/models is the one deliberate exception", async () => {
    // This test read "/v1/models without a key stays 401" until 2026-09-22, to make sure the
    // redirect above had not punched a hole in the auth check. The hole it guards against is
    // real and still guarded: /v1/credits/balance is the same kind of path and stays shut.
    // /v1/models was opened on purpose, because /v1/status already hands the same catalogue to
    // anybody, and a wrong key there is still a wrong key.
    const db = openDb(":memory:");
    const app = createApp({ db });
    expect((await app.request("/v1/credits/balance")).status, "a protected path is still shut").toBe(401);
    expect((await app.request("/v1/submissions")).status, "and so is this one").toBe(401);
    expect(
      (await app.request("/v1/models", { headers: { authorization: "cnwy_k_nope" } })).status,
      "a wrong key on the open path is still a wrong key",
    ).toBe(401);
    expect(
      (await app.request("/v1/models")).status,
      "and no key at all gets the catalogue, or 503 when there is none configured",
    ).not.toBe(401);
  });
});

describe("the self-description names its own base", () => {
  it("serves base_url, so a script does not have to guess the paths", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db });
    const body = (await (
      await app.request("/.well-known/x402", { headers: { host: "cp.hippe.eu", "x-forwarded-proto": "https" } })
    ).json()) as { base_url: string; endpoints: Record<string, string> };
    expect(body.base_url).toBe("https://cp.hippe.eu");
    // The paths stay relative: base_url put in front gives exactly one valid URL.
    expect(body.base_url + body.endpoints.models).toBe("https://cp.hippe.eu/v1/models");
  });
});

/**
 * What the 401 says about the Bearer prefix has to be what the code does about it.
 *
 * `resolveApiKey` has accepted both forms since it was written, and until 2026-09-22 the 401 said
 * the key goes "raw in the Authorization header, without the Bearer prefix". Every OpenAI-compatible
 * SDK sends Bearer and cannot be told not to, so a caller who had done nothing wrong read that they
 * had, and went to rebuild their client instead of looking at their key. Same shape as the joined
 * base URL above: the answer was about the wrong thing, so the time went into the wrong place. One
 * address spent 32 hours in that loop.
 */
describe("the key formats the message names are the key formats that work", () => {
  const makeKey = (db: Db, address: Address): string => {
    const key = `cnwy_k_${"ab".repeat(16)}`;
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(
      address,
      new Date().toISOString(),
    );
    db.prepare(
      "INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(address, hashApiKey(key), key.slice(0, 15), "test", new Date().toISOString());
    return key;
  };

  it.each(["raw", "Bearer"] as const)("accepts a valid key sent %s", async (how) => {
    const db = openDb(":memory:");
    const app = createApp({ db });
    const address = "0x1111111111111111111111111111111111111111" as Address;
    const key = makeKey(db, address);
    const res = await app.request("/v1/credits/balance", {
      headers: { authorization: how === "raw" ? key : `Bearer ${key}` },
    });
    expect(res.status, `a valid key sent ${how} has to be a valid key`).toBe(200);
  });

  it("does not blame the Bearer prefix, because the prefix is fine", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db });
    const res = await app.request("/v1/credits/balance", {
      headers: { authorization: "Bearer cnwy_k_nope" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { message: string };
    expect(body.message, "it must not tell them to drop a prefix that works").not.toMatch(/without the Bearer/i);
    expect(body.message, "and it has to say what is actually wrong").toMatch(/no key|not a key/i);
  });
});

/**
 * A path that exists but not for this method says so, everywhere and not on a list.
 *
 * Two hand-written lists in src/app.ts answer 405 for /v1/auth/* and /v1/briefs/*. Everything else
 * answered "No such endpoint here", including `/`: on 2026-09-20 at 08:56 one address sent four
 * POSTs to the landing page and was told four times that there is no such thing, about the one URL
 * this service is reachable at. A scanner that time. The answer is still wrong for anybody who
 * mixes up the method, and it is the same shape as the joined base URL that cost a real caller 32
 * hours: a correct sentence about something they did not ask.
 */
describe("wrong method, existing path", () => {
  it("answers 405 with Allow on the pages, not 404", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db });
    for (const path of ["/", "/jobs", "/post", "/receipts", "/x402"]) {
      const res = await app.request(path, { method: "POST" });
      expect(res.status, `POST ${path}`).toBe(405);
      expect(res.headers.get("allow"), `Allow on ${path}`).toBe("GET");
      const body = (await res.json()) as { error: string; message: string; allow: string[] };
      expect(body.error).toBe("method_not_allowed");
      expect(body.message, "it has to name the method that works").toContain("accepts GET");
      expect(body.allow).toEqual(["GET"]);
    }
  });

  it("still answers 404 for a path that really is not there", async () => {
    // The guard must not turn every 404 into a 405. A pattern route cannot be compared by string,
    // so those stay 404 too, which is the safe direction.
    const db = openDb(":memory:");
    const app = createApp({ db });
    for (const path of ["/doesnotexist", "/v1/nonsense"]) {
      const res = await app.request(path, { method: "POST" });
      expect(res.status, `POST ${path}`).toBe(404);
    }
  });

  it("leaves the protected /v1 paths alone, where a 401 is the right answer", async () => {
    // A path behind the auth middleware answers 401 whatever the method, and that stays: without
    // a key there is no access, and a 405 there would tell a stranger which paths exist. It is
    // also what keeps HEAD working, which Hono serves from the GET route and which would reach
    // the handler without an address if the middleware handed it on.
    const db = openDb(":memory:");
    const app = createApp({ db });
    expect((await app.request("/v1/credits/balance", { method: "DELETE" })).status).toBe(401);
    expect((await app.request("/v1/submissions", { method: "HEAD" })).status).toBe(401);
  });

  it("keeps the tailored message where a path has one", async () => {
    // /v1/auth/verify is on the hand-written list and says more than the generic answer does.
    const db = openDb(":memory:");
    const app = createApp({ db });
    const body = (await (await app.request("/v1/auth/verify", { method: "GET" })).json()) as { message: string };
    expect(body.message).toMatch(/needs no API key/i);
  });
});
