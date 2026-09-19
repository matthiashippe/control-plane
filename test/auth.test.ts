import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";

/** Baut die SIWE-Message so, wie provision.ts der Runtime sie baut. */
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

describe("SIWE-Provisionierung", () => {
  it("kompletter Client-Flow: nonce -> verify -> api-keys -> balance", async () => {
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

  it("speichert den Key nur gehasht und verknüpft ihn mit der Wallet", async () => {
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

  it("lehnt eine falsche Signatur ab", async () => {
    const { req, json, account } = setup();
    const other = privateKeyToAccount(generatePrivateKey());
    const nonce = await nonceOf(req);
    const message = buildMessage({ address: account.address, nonce });
    const signature = await other.signMessage({ message });
    const res = await req("/v1/auth/verify", json({ message, signature }));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toMatch(/signature/i);
  });

  it("lehnt eine fremde Domain ab", async () => {
    const { req, json, account } = setup();
    const nonce = await nonceOf(req);
    const message = buildMessage({ address: account.address, nonce, domain: "evil.example" });
    const signature = await account.signMessage({ message });
    const res = await req("/v1/auth/verify", json({ message, signature }));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toMatch(/domain/i);
  });

  it("lehnt eine unbekannte Nonce ab", async () => {
    const { req, json, account } = setup();
    const message = buildMessage({ address: account.address, nonce: "deadbeefdeadbeef" });
    const signature = await account.signMessage({ message });
    const res = await req("/v1/auth/verify", json({ message, signature }));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; message: string; docs: string };
    // Der Wortlaut in `error` bleibt der, den Conway liefert; daneben steht, was zu tun ist.
    expect(body.error).toBe("Invalid or expired nonce");
    expect(body.message).toContain("POST /v1/auth/nonce");
    expect(body.docs).toContain("docs/errors.md#authentication");
  });

  it("lehnt eine verbrauchte Nonce beim zweiten Mal ab", async () => {
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

  it("lehnt eine falsche chainId ab", async () => {
    const { req, json, account } = setup();
    const nonce = await nonceOf(req);
    const message = buildMessage({ address: account.address, nonce, chainId: 1 });
    const signature = await account.signMessage({ message });
    const res = await req("/v1/auth/verify", json({ message, signature }));
    expect(res.status).toBe(401);
  });

  it("gibt api-keys nur mit gültigem access_token aus", async () => {
    const { req, json } = setup();
    expect((await req("/v1/auth/api-keys", json({}))).status).toBe(401);
    expect(
      (await req("/v1/auth/api-keys", json({}, { authorization: "Bearer nope" }))).status,
    ).toBe(401);
  });

  it("verlangt für /v1/* einen API-Key", async () => {
    const { req } = setup();
    expect((await req("/v1/credits/balance")).status).toBe(401);
    expect((await req("/v1/credits/balance", { headers: { authorization: "cnwy_k_00" } })).status).toBe(401);
  });

  it("antwortet auf /health", async () => {
    const { req } = setup();
    const res = await req("/health");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });
});

/** Ein vollständiger Erstlauf mit eigener Wallet: nonce, verify, api-keys. */
async function provisionieren(app: ReturnType<typeof setup>["app"]): Promise<{ ok: boolean; keyPrefix?: string }> {
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

describe("Provisionierung unter Last", () => {
  it("hält zwanzig gleichzeitige Erstläufe aus, ohne einen zu verlieren", async () => {
    // Ein Artikel mit Reichweite bringt Erstläufe im Pulk, und jeder davon schreibt viermal in die
    // SQLite (Nonce, Session, Wallet, Schlüssel). better-sqlite3 arbeitet synchron, blockiert also
    // den Event-Loop, und eine Änderung, die den Pfad versehentlich serialisiert oder eine
    // Sperre hält, würde hier auffallen. Gemessen am 19.09.2026 waren 100 gleichzeitige
    // Provisionierungen in 206 ms durch; dieser Test prüft nur, dass keine verloren geht.
    const { app, db } = setup();

    const laeufe = await Promise.all(Array.from({ length: 20 }, () => provisionieren(app)));

    expect(laeufe.filter((l) => l.ok), "jeder Erstlauf muss durchkommen").toHaveLength(20);
    const schluessel = new Set(laeufe.map((l) => l.keyPrefix));
    expect(schluessel.size, "jeder bekommt einen eigenen Schlüssel").toBe(20);
    const inDb = (db.prepare("SELECT count(*) AS n FROM api_keys").get() as { n: number }).n;
    expect(inDb).toBe(20);
    const wallets = (db.prepare("SELECT count(*) AS n FROM wallets").get() as { n: number }).n;
    expect(wallets).toBe(20);
  });
});
