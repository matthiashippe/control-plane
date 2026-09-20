import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";

/** Builds the SIWE message the way the runtime's provision.ts builds it. */
function buildMessage(params: {
  address: `0x${string}`;
  nonce: string;
  domain?: string;
  chainId?: number;
  apiUrl?: string;
}): string {
  const apiUrl = params.apiUrl ?? "https://cp.test:8443";
  return createSiweMessage({
    domain: params.domain ?? "conway.tech",
    address: params.address,
    statement: "Sign in to Conway as an Automaton to provision an API key.",
    uri: `${apiUrl}/v1/auth/verify`,
    version: "1",
    chainId: params.chainId ?? 8453,
    nonce: params.nonce,
    issuedAt: new Date(),
  });
}

function setup() {
  const db = openDb(":memory:");
  const app = createApp({ db });
  const account = privateKeyToAccount(generatePrivateKey());
  const req = (path: string, init?: RequestInit) => app.request(path, init);
  const json = (body: unknown, headers: Record<string, string> = {}) => ({
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { db, app, account, req, json };
}

async function nonceOf(req: ReturnType<typeof setup>["req"]): Promise<string> {
  const res = await req("/v1/auth/nonce", { method: "POST" });
  expect(res.status).toBe(200);
  const { nonce } = (await res.json()) as { nonce: string };
  expect(nonce.length).toBeGreaterThanOrEqual(8);
  return nonce;
}

describe("SIWE provisioning", () => {
  it("complete client flow: nonce -> verify -> api-keys -> balance", async () => {
    const { req, json, account } = setup();
    const nonce = await nonceOf(req);
    const message = buildMessage({ address: account.address, nonce });
    const signature = await account.signMessage({ message });

    const verify = await req("/v1/auth/verify", json({ message, signature }));
    expect(verify.status).toBe(200);
    const { access_token } = (await verify.json()) as { access_token: string };
    expect(access_token).toBeTruthy();

    const keys = await req(
      "/v1/auth/api-keys",
      json({ name: "conway-automaton" }, { authorization: `Bearer ${access_token}` }),
    );
    expect(keys.status).toBe(200);
    const { key, key_prefix } = (await keys.json()) as { key: string; key_prefix: string };
    expect(key).toMatch(/^cnwy_k_[0-9a-f]{32}$/);
    expect(key_prefix).toBe(key.slice(0, 15));

    const balance = await req("/v1/credits/balance", { headers: { authorization: key } });
    expect(balance.status).toBe(200);
    expect(await balance.json()).toEqual({ balance_cents: 0 });
  });

  it("stores the key only hashed and links it to the wallet", async () => {
    const { req, json, account, db } = setup();
    const nonce = await nonceOf(req);
    const message = buildMessage({ address: account.address, nonce });
    const signature = await account.signMessage({ message });
    const { access_token } = (await (await req("/v1/auth/verify", json({ message, signature }))).json()) as {
      access_token: string;
    };
    const { key } = (await (
      await req("/v1/auth/api-keys", json({}, { authorization: `Bearer ${access_token}` }))
    ).json()) as { key: string };

    const rows = db.prepare("SELECT address, key_hash, key_prefix FROM api_keys").all() as {
      address: string;
      key_hash: string;
      key_prefix: string;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].address).toBe(account.address.toLowerCase());
    expect(rows[0].key_hash).not.toContain(key);
    expect(rows[0].key_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(key.startsWith(rows[0].key_prefix)).toBe(true);
  });

  it("rejects a wrong signature", async () => {
    const { req, json, account } = setup();
    const other = privateKeyToAccount(generatePrivateKey());
    const nonce = await nonceOf(req);
    const message = buildMessage({ address: account.address, nonce });
    const signature = await other.signMessage({ message });
    const res = await req("/v1/auth/verify", json({ message, signature }));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toMatch(/signature/i);
  });

  it("rejects a foreign domain", async () => {
    const { req, json, account } = setup();
    const nonce = await nonceOf(req);
    const message = buildMessage({ address: account.address, nonce, domain: "evil.example" });
    const signature = await account.signMessage({ message });
    const res = await req("/v1/auth/verify", json({ message, signature }));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toMatch(/domain/i);
  });

  it("rejects an unknown nonce", async () => {
    const { req, json, account } = setup();
    const message = buildMessage({ address: account.address, nonce: "deadbeefdeadbeef" });
    const signature = await account.signMessage({ message });
    const res = await req("/v1/auth/verify", json({ message, signature }));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; message: string; docs: string };
    // The wording in `error` stays the one Conway serves; next to it stands what to do.
    expect(body.error).toBe("Invalid or expired nonce");
    expect(body.message).toContain("POST /v1/auth/nonce");
    expect(body.docs).toContain("docs/errors.md#authentication");
  });

  it("rejects a consumed nonce on the second try", async () => {
    const { req, json, account } = setup();
    const nonce = await nonceOf(req);
    const message = buildMessage({ address: account.address, nonce });
    const signature = await account.signMessage({ message });
    expect((await req("/v1/auth/verify", json({ message, signature }))).status).toBe(200);
    const again = await req("/v1/auth/verify", json({ message, signature }));
    expect(again.status).toBe(401);
    const body = (await again.json()) as { error: string; message: string };
    expect(body.error).toBe("Invalid or expired nonce");
    expect(body.message).toMatch(/ten minutes and exactly one verify/);
  });

  it("rejects a wrong chainId", async () => {
    const { req, json, account } = setup();
    const nonce = await nonceOf(req);
    const message = buildMessage({ address: account.address, nonce, chainId: 1 });
    const signature = await account.signMessage({ message });
    const res = await req("/v1/auth/verify", json({ message, signature }));
    expect(res.status).toBe(401);
  });

  it("issues api-keys only with a valid access_token", async () => {
    const { req, json } = setup();
    expect((await req("/v1/auth/api-keys", json({}))).status).toBe(401);
    expect(
      (await req("/v1/auth/api-keys", json({}, { authorization: "Bearer nope" }))).status,
    ).toBe(401);
  });

  it("requires an API key for /v1/*", async () => {
    const { req } = setup();
    expect((await req("/v1/credits/balance")).status).toBe(401);
    expect((await req("/v1/credits/balance", { headers: { authorization: "cnwy_k_00" } })).status).toBe(401);
  });

  it("answers on /health", async () => {
    const { req } = setup();
    const res = await req("/health");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });
});

/** One complete first run with its own wallet: nonce, verify, api-keys. */
async function provision(app: ReturnType<typeof setup>["app"]): Promise<{ ok: boolean; keyPrefix?: string }> {
  const account = privateKeyToAccount(generatePrivateKey());
  const nonceRes = await app.request("/v1/auth/nonce", { method: "POST" });
  if (nonceRes.status !== 200) return { ok: false };
  const { nonce } = (await nonceRes.json()) as { nonce: string };

  const message = buildMessage({ address: account.address, nonce });
  const signature = await account.signMessage({ message });
  const verifyRes = await app.request("/v1/auth/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  if (verifyRes.status !== 200) return { ok: false };
  const { access_token } = (await verifyRes.json()) as { access_token: string };

  const keyRes = await app.request("/v1/auth/api-keys", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${access_token}` },
    body: JSON.stringify({ name: "last" }),
  });
  if (keyRes.status !== 200) return { ok: false };
  const { key } = (await keyRes.json()) as { key: string };
  return { ok: true, keyPrefix: key };
}

describe("provisioning under load", () => {
  it("survives twenty concurrent first runs without losing one", async () => {
    // An article with reach brings first runs in a crowd, and each of them writes to the SQLite
    // four times (nonce, session, wallet, key). better-sqlite3 works synchronously, so it blocks
    // the event loop, and a change that accidentally serialises the path or holds a lock would show
    // up here. Measured on 19.09.2026, 100 concurrent provisionings were through in 206 ms; this
    // test only checks that none of them gets lost.
    const { app, db } = setup();

    const runs = await Promise.all(Array.from({ length: 20 }, () => provision(app)));

    expect(runs.filter((r) => r.ok), "every first run has to get through").toHaveLength(20);
    const keys = new Set(runs.map((r) => r.keyPrefix));
    expect(keys.size, "everybody gets their own key").toBe(20);
    const inDb = (db.prepare("SELECT count(*) AS n FROM api_keys").get() as { n: number }).n;
    expect(inDb).toBe(20);
    const wallets = (db.prepare("SELECT count(*) AS n FROM wallets").get() as { n: number }).n;
    expect(wallets).toBe(20);
  });
});
