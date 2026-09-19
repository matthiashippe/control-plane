/**
 * Fehlerantworten, die einem Menschen sagen, was los ist und was er tun kann (Aufgabe A3).
 *
 * Jeder Test hält fest: der Statuscode bleibt, das Feld `error` bleibt Wort für Wort, dazu kommt
 * eine `message`, die den Fall benennt und einen nächsten Schritt nennt, und eine `docs`-URL.
 * Am Ende steht die Gegenprobe, dass keine dieser Antworten Interna preisgibt.
 */

import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import type { Address, Hex } from "viem";
import { createApp } from "../src/app.js";
import { openDb, postLedger, type Db } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";
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

type Fehlerkoerper = { error: string; message: string; docs?: string; [k: string]: unknown };

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
  const mitKey = (path: string, init: RequestInit = {}) =>
    app.request(path, { ...init, headers: { "content-type": "application/json", authorization: key, ...(init.headers ?? {}) } });
  return { db, app, account, address, key, mitKey };
}

/** Liest den Körper und prüft die Form, die jede sprechende Fehlerantwort hat. */
async function fehler(res: Response, erwarteterCode: string): Promise<Fehlerkoerper> {
  const body = (await res.json()) as Fehlerkoerper;
  expect(body.error, "das Feld error bleibt unverändert").toBe(erwarteterCode);
  expect(typeof body.message, `message fehlt bei ${erwarteterCode}`).toBe("string");
  expect(body.message.length).toBeGreaterThan(40);
  return body;
}

describe("Sandboxes: der 501 bleibt und sagt jetzt, dass er Absicht ist", () => {
  it("POST /v1/sandboxes nennt den Grund, den Ausweg der Runtime und den Schalter in der Config", async () => {
    const { mitKey } = setup();
    const res = await mitKey("/v1/sandboxes", { method: "POST", body: JSON.stringify({ name: "kind" }) });
    expect(res.status, "der Statuscode bleibt 501: die Runtime weicht darauf auf einen lokalen Worker aus").toBe(501);
    const body = await fehler(res, "not_implemented");
    // Der Erstellungsversuch bekommt die Antwort auf seine eigene Frage, nicht die der Unterpfade.
    expect(body.message).toMatch(/^This control plane runs no sandboxes/);
    expect(body.message).not.toContain("exec in");
    expect(body.message).toContain("intended answer");
    expect(body.message).toContain("local worker");
    expect(body.message).toContain("sandboxId");
    expect(body.docs).toContain("docs/errors.md#sandboxes");
  });

  it("die Unterpfade sagen, dass es nichts gibt, worin man etwas ausführen könnte", async () => {
    const { mitKey } = setup();
    for (const pfad of ["/v1/sandboxes/abc/exec", "/v1/sandboxes/abc/files/tmp", "/v1/sandboxes/abc/ports/80"]) {
      const res = await mitKey(pfad, { method: "POST", body: "{}" });
      expect(res.status).toBe(501);
      const body = await fehler(res, "not_implemented");
      expect(body.message).toMatch(/no sandbox to exec in/i);
      expect(body.docs).toContain("#sandboxes");
    }
  });

  it("GET /v1/sandboxes bleibt die leere Liste, damit die Runtime nicht in den Fehlerpfad läuft", async () => {
    const { mitKey } = setup();
    const res = await mitKey("/v1/sandboxes");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sandboxes: [] });
  });
});

describe("Credit-Transfers: 501 mit der Regulatorik als Grund", () => {
  it("nennt beide Routen den Grund und den gangbaren Weg, ein anderes Automaton zu finanzieren", async () => {
    const { mitKey } = setup();
    for (const pfad of ["/v1/credits/transfer", "/v1/credits/transfers"]) {
      const res = await mitKey(pfad, { method: "POST", body: JSON.stringify({ to_address: PAY_TO, amount_cents: 100 }) });
      expect(res.status).toBe(501);
      const body = await fehler(res, "not_implemented");
      expect(body.reason, "das Feld reason bleibt, es stand vorher schon da").toBe("credit transfers are disabled in phase 1");
      expect(body.message).toMatch(/not money, not redeemable and not transferable/);
      expect(body.message).toMatch(/send USDC to that automaton's own wallet/i);
      expect(body.docs).toContain("#credit_transfers");
    }
  });
});

describe("Rate Limit: wie lange und warum", () => {
  it("sagt im 429, welche Grenze gilt, warum es sie gibt und wann es weitergeht", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, rateLimit: { limit: 3, fensterMs: 60_000 } });
    const ruf = () => app.request("/v1/auth/nonce", { method: "POST", headers: { "x-forwarded-for": "203.0.113.42" } });
    for (let i = 0; i < 3; i++) expect((await ruf()).status).toBe(200);

    const res = await ruf();
    expect(res.status).toBe(429);
    const body = await fehler(res, "rate_limited");
    expect(body.retry_after_seconds, "das Feld bleibt, die Runtime und curl-Nutzer lesen es").toBeGreaterThan(0);
    expect(body.message).toContain("3 requests in 60 seconds");
    expect(body.message, "der Grund gehört dazu: diese Pfade kosten uns Platte und Facilitator-Gebühren").toMatch(
      /facilitator/,
    );
    expect(body.message).toContain(`Wait ${body.retry_after_seconds} seconds`);
    expect(body.message, "der Weg heraus: mit API-Key gilt die Grenze nicht").toMatch(/not capped/);
    expect(body.docs).toContain("#rate_limited");
  });
});

describe("Authentifizierung: der Conway-Wortlaut bleibt, der Weg steht daneben", () => {
  it("nennt beim ungültigen API-Key das Format und den Weg zum Key", async () => {
    const { app } = setup();
    const res = await app.request("/v1/credits/balance", { headers: { authorization: "Bearer nicht-unser-key" } });
    expect(res.status).toBe(401);
    const body = await fehler(res, "Invalid API key");
    expect(body.message).toContain("cnwy_k_");
    expect(body.message).toMatch(/without the Bearer prefix/);
    expect(body.message).toContain("automaton --provision");
    expect(body.docs).toContain("#authentication");
  });

  it("sagt bei /v1/auth/api-keys ohne Bearer, welches der beiden Token gemeint ist", async () => {
    const { app } = setup();
    const res = await app.request("/v1/auth/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(res.status).toBe(401);
    const body = await fehler(res, "Bearer token required");
    expect(body.message).toContain("access_token");
    expect(body.message).toContain("POST /v1/auth/verify");
  });

  it("erklärt eine abgelehnte SIWE-Signatur, ohne den Wortlaut in error zu ändern", async () => {
    const { app } = setup();
    const nonce = ((await (await app.request("/v1/auth/nonce", { method: "POST" })).json()) as { nonce: string }).nonce;
    const account = privateKeyToAccount(generatePrivateKey());
    const fremder = privateKeyToAccount(generatePrivateKey());
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
    const signature = await fremder.signMessage({ message });
    const res = await app.request("/v1/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    expect(res.status).toBe(401);
    const body = await fehler(res, "Invalid signature");
    expect(body.message).toMatch(/does not recover to the address/);
  });

  it("weist chain_type solana mit dem Grund ab", async () => {
    const { app } = setup();
    const res = await app.request("/v1/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "x", signature: "0x", chain_type: "solana" }),
    });
    expect(res.status).toBe(400);
    const body = await fehler(res, "chain_type solana not supported");
    expect(body.message).toMatch(/EVM wallets only/);
  });
});

describe("Zahlungspfad: jeder 402 sagt, was zu signieren ist", () => {
  const signiere = async (params: {
    account: ReturnType<typeof privateKeyToAccount>;
    to?: Address;
    from?: Address;
    value?: bigint;
    chainId?: number;
    network?: string;
    validBefore?: bigint;
    validAfter?: bigint;
    kaputteSignatur?: boolean;
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
        signature: params.kaputteSignatur ? (`0x${"11".repeat(65)}` as Hex) : signature,
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

  const zahle = (app: ReturnType<typeof createApp>, usd: number | string, adresse: string, header?: string) =>
    app.request(`/pay/${usd}/${adresse}`, { headers: header ? { "x-payment": header } : {} });

  it("erklärt das erste 402 als Angebot, nicht als Fehler", async () => {
    const { app, account } = setup();
    const res = await zahle(app, 5, account.address);
    expect(res.status).toBe(402);
    const body = (await res.json()) as { message: string; docs: string; accepts: unknown[]; x402Version: number };
    expect(body.x402Version, "das Angebot selbst bleibt unangetastet").toBe(1);
    expect(body.accepts).toHaveLength(1);
    expect(body.message).toContain("500 credit cents");
    expect(body.message).toContain("X-Payment");
    expect(body.docs).toContain("#payments");
  });

  it("invalid_signature nennt Domain, chainId und USDC-Adresse, gegen die geprüft wurde", async () => {
    const { app, account } = setup();
    const header = await signiere({ account, kaputteSignatur: true });
    const res = await zahle(app, 5, account.address, header);
    expect(res.status).toBe(402);
    const body = await fehler(res, "invalid_signature");
    expect(body.message).toContain("TransferWithAuthorization");
    expect(body.message).toContain("8453");
    expect(body.message).toContain(USDC);
    expect(body.message).toMatch(/Nothing was charged/);
  });

  it("recipient_must_match_payer erklärt die Regel und nennt den Weg, ein Kind zu finanzieren", async () => {
    const { app, account } = setup();
    const fremder = privateKeyToAccount(generatePrivateKey());
    const header = await signiere({ account });
    const res = await zahle(app, 5, fremder.address, header);
    expect(res.status).toBe(402);
    const body = await fehler(res, "recipient_must_match_payer");
    expect(body.message).toMatch(/wallet that signed the payment/);
    expect(body.message).toMatch(/replayable|redirect the credits/);
    expect(body.message).toMatch(/send USDC to its wallet/i);
  });

  it("wrong_amount behält den erwarteten Betrag in error und erklärt ihn in message", async () => {
    const { app, account } = setup();
    const header = await signiere({ account, value: 1_000_000n });
    const res = await zahle(app, 5, account.address, header);
    expect(res.status).toBe(402);
    const body = (await res.json()) as Fehlerkoerper;
    expect(body.error, "der erwartete Betrag stand schon in error und bleibt dort").toBe("wrong_amount: expected 5000000");
    expect(body.message).toContain("5000000 atomic USDC units");
  });

  it("wrong_recipient nennt die Adresse, an die die USDC gehen müssen", async () => {
    const { app, account } = setup();
    const header = await signiere({ account, to: "0x000000000000000000000000000000000000dEaD" as Address });
    const body = await fehler(await zahle(app, 5, account.address, header), "wrong_recipient");
    expect(body.message).toContain(PAY_TO);
  });

  it("wrong_network sagt, auf welchem Netz diese Instanz settlet", async () => {
    const { app, account } = setup();
    const header = await signiere({ account, network: "base-sepolia", chainId: 84532 });
    const body = await fehler(await zahle(app, 5, account.address, header), "wrong_network");
    expect(body.message).toContain("base");
    expect(body.message).toContain("8453");
  });

  it("malformed_payment beschreibt den Aufbau des X-Payment-Headers", async () => {
    const { app, account } = setup();
    const body = await fehler(await zahle(app, 5, account.address, "kein-base64-json"), "malformed_payment");
    expect(body.message).toContain("base64");
    expect(body.message).toContain("validBefore");
  });

  it("authorization_expired und authorization_not_yet_valid sagen, wie die Zeitfenster gemeint sind", async () => {
    const { app, account } = setup();
    const alt = await signiere({ account, validBefore: BigInt(Math.floor(Date.now() / 1000) - 10) });
    const abgelaufen = await fehler(await zahle(app, 5, account.address, alt), "authorization_expired");
    expect(abgelaufen.message).toContain("300 s");

    const zukunft = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const frueh = await signiere({ account, validAfter: zukunft, validBefore: zukunft + 300n });
    const zuFrueh = await fehler(await zahle(app, 5, account.address, frueh), "authorization_not_yet_valid");
    expect(zuFrueh.message).toMatch(/now minus 60 seconds/);
  });

  it("invalid_tier und invalid_address sagen, was stattdessen zu tun ist", async () => {
    const { app, account } = setup();
    const tier = await fehler(await zahle(app, 7, account.address), "invalid_tier");
    expect(tier.tiers, "die Tier-Liste bleibt als Feld erhalten").toEqual([5, 25, 100, 500, 1000, 2500]);
    expect(tier.message).toContain("5, 25, 100, 500, 1000, 2500");

    const adresse = await fehler(await zahle(app, 5, "0xabc"), "invalid_address");
    expect(adresse.message).toMatch(/40 hex characters/);
  });

  it("payments_unavailable sagt, dass hier nichts zu signieren ist", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db });
    const body = await fehler(await app.request("/pay/5/" + PAY_TO), "payments_unavailable");
    expect(body.message).toContain("/.well-known/x402");
    expect(body.docs).toContain("#payments");
  });
});

describe("Registrierung: Grenzen mit Begründung", () => {
  it("field_too_long nennt Feld, Grenze, gemessene Länge und den Grund für die Grenze", async () => {
    const { mitKey, account } = setup();
    const res = await mitKey("/v1/automatons/register", {
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
    const body = await fehler(res, "field_too_long");
    expect(body.field, "Feld und Grenze standen schon im Körper und bleiben").toBe("bio");
    expect(body.max_length).toBe(2000);
    expect(body.message).toContain("2100 characters long");
    expect(body.message).toContain("limit is 2000");
    expect(body.message, "der Grund: Registrierung ist kostenlos, alles hier landet auf der Platte").toMatch(
      /costs nothing and everything sent here is stored/,
    );
  });

  it("too_many_automatons nennt die Grenze, ihren Grund und den Weg für weitere Automatons", async () => {
    const { db, mitKey, account, address } = setup();
    for (let i = 0; i < 25; i++) {
      db.prepare(
        "INSERT INTO automatons (automaton_id, address, creator_address, name, bio, genesis_prompt_hash, registered_at) VALUES (?, ?, ?, ?, '', NULL, ?)",
      ).run(`id-${i}`, address, address, `A${i}`, new Date().toISOString());
    }
    const res = await mitKey("/v1/automatons/register", {
      method: "POST",
      body: JSON.stringify({
        automaton_id: crypto.randomUUID(),
        automaton_address: account.address,
        creator_address: PAY_TO,
        name: "Nummer 26",
        nonce: crypto.randomUUID(),
        signature: `0x${"11".repeat(65)}`,
        payload_hash: `0x${"22".repeat(32)}`,
      }),
    });
    expect(res.status).toBe(429);
    const body = await fehler(res, "too_many_automatons");
    expect(body.limit).toBe(25);
    expect(body.message).toContain("25 automatons");
    expect(body.message).toMatch(/keeps a single key from filling/);
    expect(body.message).toMatch(/its own wallet and its own API key/);
  });

  it("missing_fields sagt, welche Felder fehlen", async () => {
    const { mitKey, account } = setup();
    const res = await mitKey("/v1/automatons/register", {
      method: "POST",
      body: JSON.stringify({ automaton_address: account.address, name: "Ohne alles" }),
    });
    const body = await fehler(res, "missing_fields");
    const aufzaehlung = body.message.split(". ")[0];
    expect(aufzaehlung).toContain("automaton_id");
    expect(aufzaehlung).toContain("signature");
    expect(aufzaehlung, "mitgeschickte Felder werden nicht als fehlend gemeldet").not.toContain("name");
    expect(aufzaehlung, "mitgeschickte Felder werden nicht als fehlend gemeldet").not.toContain("automaton_address");
  });

  it("payload_hash_mismatch beschreibt, wie der Hash gebildet wird", async () => {
    const { mitKey, account } = setup();
    const res = await mitKey("/v1/automatons/register", {
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
    const body = await fehler(res, "payload_hash_mismatch");
    expect(body.message).toContain("keccak256");
    expect(body.message).toMatch(/sorted alphabetically/);
  });
});

describe("Inferenz: Modelle, Guthaben, Provider", () => {
  it("model_not_found nennt die Modelle, die es hier gibt", async () => {
    const { mitKey } = setup();
    const res = await mitKey("/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: "hi" }] }),
    });
    expect(res.status).toBe(404);
    const body = await fehler(res, "model_not_found");
    expect(body.model, "das Feld model bleibt").toBe("gpt-4o");
    expect(body.message).toContain("mock-1");
    expect(body.message).toContain("gpt-5.2");
    expect(body.message).toContain("gpt-5-mini");
    expect(body.message).toContain("GET /v1/models");
    expect(body.docs).toContain("#model_not_found");
  });

  it("kürzt die Modellliste, statt einen Katalog mit vielen Modellen auszuschütten", async () => {
    const db = openDb(":memory:");
    const viele = Array.from({ length: 20 }, (_, i) => `alias-${i}`).reduce<Record<string, string>>((acc, alias) => {
      acc[alias] = "mock-1";
      return acc;
    }, {});
    const app = createApp({ db, catalog: new Catalog([new MockProvider()], viele) });
    const key = "cnwy_k_" + "aa".repeat(16);
    const adresse = "0x" + "1".repeat(40);
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(adresse, new Date().toISOString());
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
      adresse,
      hashApiKey(key),
      key.slice(0, 15),
      "t",
      new Date().toISOString(),
    );
    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: key },
      body: JSON.stringify({ model: "gibtsnicht", messages: [{ role: "user", content: "hi" }] }),
    });
    const body = await fehler(res, "model_not_found");
    expect(body.message).toMatch(/and \d+ more/);
    expect(body.message.length).toBeLessThan(600);
  });

  it("streaming_not_supported erklärt, warum nicht gestreamt wird", async () => {
    const { mitKey } = setup();
    const res = await mitKey("/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-5.2", messages: [{ role: "user", content: "hi" }], stream: true }),
    });
    expect(res.status).toBe(400);
    const body = await fehler(res, "streaming_not_supported");
    expect(body.message).toMatch(/metered and charged server side/);
    expect(body.message).toContain('"stream": false');
  });

  it("INSUFFICIENT_CREDITS behält Wortlaut und details und ergänzt den Weg zum Guthaben", async () => {
    const { mitKey } = setup();
    const res = await mitKey("/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-5.2", messages: [{ role: "user", content: "hi" }] }),
    });
    expect(res.status).toBe(402);
    const body = (await res.json()) as Fehlerkoerper & { details: { required_cents: number; current_balance_cents: number } };
    expect(body.error).toBe("INSUFFICIENT_CREDITS");
    // Die Runtime sucht diesen Marker im ganzen Körper und liest `details`, um den Tier zu wählen.
    expect(body.message).toMatch(/^Insufficient credits: need \d+ cents, have 0 cents\./);
    expect(body.details.required_cents).toBeGreaterThan(0);
    expect(body.details.current_balance_cents).toBe(0);
    expect(body.message).toContain("/pay/{usd}/{this wallet}");
  });

  it("inference_unavailable sagt, dass diese Instanz gar keine Inferenz verkauft", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db });
    const key = "cnwy_k_" + "bb".repeat(16);
    const adresse = "0x" + "2".repeat(40);
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(adresse, new Date().toISOString());
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
      adresse,
      hashApiKey(key),
      key.slice(0, 15),
      "t",
      new Date().toISOString(),
    );
    const body = await fehler(await app.request("/v1/models", { headers: { authorization: key } }), "inference_unavailable");
    expect(body.message).toContain("/v1/status");
    expect(body.docs).toContain("#inference");
  });
});

describe("Fehler auf unserer Seite", () => {
  it("der 500er nennt keinen Stacktrace, sondern dass nichts berechnet wurde", async () => {
    const kaputt = {
      prepare() {
        throw new Error("SQLITE_CORRUPT: /var/lib/control-plane/data.db is malformed");
      },
    } as unknown as Db;
    const app = createApp({ db: kaputt, rateLimit: null });
    const res = await app.request("/v1/status");
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("SQLITE_CORRUPT");
    expect(text).not.toContain("/var/lib");
    const body = JSON.parse(text) as Fehlerkoerper;
    expect(body.error).toBe("internal_error");
    expect(body.message).toMatch(/Nothing was charged/);
    expect(body.message).toContain("github.com/matthiashippe/control-plane/issues");
  });
});

describe("Gegenprobe: keine Interna in den Körpern", () => {
  it("keine Antwort verrät Pfade, Stacktraces, Schlüssel oder fremde Mandanten", async () => {
    const { app, db, mitKey, account } = setup();
    // Ein fremder Mandant mit Saldo und Key, der in keiner Antwort auftauchen darf.
    const fremd = "0xfeed" + "0".repeat(36);
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, ?, ?)").run(fremd, 777_000, new Date().toISOString());
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
      fremd,
      hashApiKey("cnwy_k_" + "99".repeat(16)),
      "cnwy_k_99999999",
      "fremd",
      new Date().toISOString(),
    );
    postLedger(db, { address: fremd, kind: "topup", deltaMc: 777_000, ref: "fremd-1" });

    const antworten = await Promise.all([
      app.request("/gibtsnicht"),
      app.request("/pay/7/" + account.address),
      app.request("/v1/credits/balance", { headers: { authorization: "cnwy_k_falsch" } }),
      mitKey("/v1/sandboxes", { method: "POST", body: "{}" }),
      mitKey("/v1/credits/transfer", { method: "POST", body: JSON.stringify({ to_address: fremd, amount_cents: 1 }) }),
      mitKey("/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "nix", messages: [] }) }),
      mitKey("/v1/automatons/register", { method: "POST", body: JSON.stringify({ name: "x" }) }),
    ]);

    for (const res of antworten) {
      const text = await res.text();
      expect(text, "kein fremder Mandant").not.toContain(fremd);
      expect(text, "kein Schlüsselmaterial").not.toContain("cnwy_k_9");
      expect(text, "kein Stacktrace").not.toMatch(/\bat [A-Za-z0-9_.]+ \(/);
      expect(text, "kein Dateipfad aus dem Server").not.toMatch(/\/(?:home|var|opt|usr|root)\//);
      expect(text, "kein Hinweis auf die Datenbank").not.toMatch(/sqlite|SELECT |INSERT /i);
    }
  });
});
