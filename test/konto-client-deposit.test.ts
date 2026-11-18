/**
 * goals/konto/05, point 12 (client): the script of the page /h/{code} for money. On `deposit-card` the passkey the account
 * already has stamps one INIT_FIAT_ON_RAMP at Turnkey with exactly the address the server set on the page, Base, USDC and the
 * amount; the page then reports the card payment open and opens it. On `payout-passkey` the same passkey signs the second
 * permission for the forwarder the server named. The server side is test/konto-deposit.test.ts and test/konto-payout.test.ts.
 */
import { createHash, generateKeyPairSync, sign as nodeSign, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decodeAbiParameters, hashTypedData, parseErc6492Signature, recoverAddress, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SEPOLIA_USDC } from "../src/konto/config.js";
import { parsePermission, SPEND_PERMISSION_TYPES, spendPermissionDomain } from "../src/konto/permission.js";
import { payoutPermissionMatches } from "../src/konto/payout.js";
// @ts-expect-error plain browser module without types
import * as flow from "../src/public/konto-client/flow.mjs";
// @ts-expect-error plain browser module without types
import { wirePage } from "../src/public/konto-client/main.mjs";
import { START, tap } from "./handoff-helpers.js";
import { account, dataOf, json, moneySetup, stateOf } from "./money-helpers.js";

const ONRAMP = "https://api.turnkey.com/public/v1/submit/init_fiat_on_ramp";
const SIGN = "https://api.turnkey.com/public/v1/submit/sign_raw_payload";
const SIGN_MANY = "https://api.turnkey.com/public/v1/submit/sign_raw_payloads";
const CARD_PAGE = "https://buy.moonpay.example/?txn=onramp-1";
const b64url = (b: Uint8Array | Buffer) => Buffer.from(b).toString("base64url");

/** The passkey on the phone: a P-256 key that signs authenticatorData || SHA-256(clientDataJSON), as WebAuthn does. */
function fakePasskey() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  let used = 0;
  const get = async (options: { publicKey: { challenge: Uint8Array; rpId: string } }) => {
    used++;
    const clientData = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: b64url(options.publicKey.challenge), origin: "https://localhost" }));
    const authenticatorData = Buffer.concat([createHash("sha256").update(options.publicKey.rpId).digest(), Buffer.from([5, 0, 0, 0, 1])]);
    const signature = nodeSign("sha256", Buffer.concat([authenticatorData, createHash("sha256").update(clientData).digest()]), privateKey);
    return { rawId: new Uint8Array([7, 7, 7]).buffer, response: { authenticatorData, clientDataJSON: clientData, signature } };
  };
  return { get, publicKey, used: () => used };
}

/**
 * Turnkey for one group `org`: every request must carry a WebAuthn stamp of the passkey over exactly its body. The card payment
 * answers with a MoonPay address, a signature request with a signature of `owner`.
 */
function fakeTurnkey(passkey: ReturnType<typeof fakePasskey>, org: string, owner = privateKeyToAccount(generatePrivateKey())) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetch = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    calls.push({ url, body });
    const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    const stamp = JSON.parse(init.headers["X-Stamp-WebAuthn"] ?? "{}") as Record<string, string>;
    const clientData = Buffer.from(stamp.clientDataJson ?? "", "base64url");
    const challenge = JSON.parse(clientData.toString("utf8") || "{}").challenge as string;
    const want = Buffer.from(createHash("sha256").update(init.body).digest("hex")).toString("base64url");
    const signed = Buffer.concat([Buffer.from(stamp.authenticatorData ?? "", "base64url"), createHash("sha256").update(clientData).digest()]);
    if (challenge !== want || !verify("sha256", signed, passkey.publicKey, Buffer.from(stamp.signature ?? "", "base64url"))) return reply(401, { message: "bad stamp" });
    if (body.organizationId !== org) return reply(404, { message: "no such organization" });
    if (url === ONRAMP) {
      return reply(200, { activity: { id: "a-2", status: "ACTIVITY_STATUS_COMPLETED", result: { initFiatOnRampResult: { onRampUrl: CARD_PAGE, onRampTransactionId: "onramp-1" } } } });
    }
    if (url === SIGN) {
      const p = body.parameters as { signWith: string; payload: Hex };
      if (p.signWith !== owner.address) return reply(404, { message: "no such wallet" });
      const sig = await owner.sign({ hash: p.payload });
      const v = parseInt(sig.slice(130, 132), 16) === 27 ? "00" : "01";
      return reply(200, { activity: { id: "a-1", status: "ACTIVITY_STATUS_COMPLETED", result: { signRawPayloadResult: { r: sig.slice(2, 66), s: sig.slice(66, 130), v } } } });
    }
    if (url === SIGN_MANY) {
      const p = body.parameters as { signWith: string; payloads: Hex[] };
      if (p.signWith !== owner.address) return reply(404, { message: "no such wallet" });
      const signatures = [];
      for (const payload of p.payloads) {
        const sig = await owner.sign({ hash: payload });
        signatures.push({ r: sig.slice(2, 66), s: sig.slice(66, 130), v: parseInt(sig.slice(130, 132), 16) === 27 ? "00" : "01" });
      }
      return reply(200, { activity: { id: "a-3", status: "ACTIVITY_STATUS_COMPLETED", result: { signRawPayloadsResult: { signatures } } } });
    }
    return reply(404, {});
  };
  return { fetch, calls, owner };
}

const deps = (passkey: ReturnType<typeof fakePasskey>, fetch: unknown, opened: string[] = []) => ({
  get: passkey.get,
  fetch,
  subtle: globalThis.crypto.subtle,
  random: (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n)),
  now: () => START,
  rpId: "localhost",
  open: (url: string) => opened.push(url),
});

/** The button `id` of a page as the script sees it: its data attributes, read from the HTML the server sent. */
function buttonOf(html: string, id: string) {
  const tag = new RegExp(`<button[^>]*\\bid="${id}"[^>]*>`).exec(html)?.[0];
  if (!tag) return null;
  const dataset: Record<string, string> = {};
  for (const m of tag.matchAll(/\bdata-([a-z-]+)="([^"]*)"/g)) dataset[m[1].replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = m[2];
  const listeners: (() => Promise<void>)[] = [];
  return { dataset, disabled: false, listeners, addEventListener: (_t: string, f: () => Promise<void>) => listeners.push(f) };
}

describe("the page client of the deposit", () => {
  it("calls the card payment with exactly the address of the page, Base and the amount, reports it opened and opens it", async () => {
    const s = moneySetup();
    const a = await account(s);
    const created = await json(s, "/v1/handoff", { automaton_name: "Atlas", step: "deposit", amount_usd: "25.00" }, a.key);
    const h = (await created.json()) as { code: string; match: number };
    const html = await (await tap(s.app, h.code, h.match)).text();
    const button = buttonOf(html, "money-card")!;
    expect(button.dataset.address).toBe(a.address);

    const passkey = fakePasskey();
    const turnkey = fakeTurnkey(passkey, "org-test-1");
    const order: string[] = [];
    const opened: string[] = [];
    const failed: string[] = [];
    const fetch = async (url: string, init: { headers: Record<string, string>; body: string }) => {
      order.push(url);
      if (url.startsWith("/h/")) return s.app.request(url, init as RequestInit);
      return turnkey.fetch(url, init);
    };
    wirePage({
      ...deps(passkey, fetch, opened),
      document: {
        getElementById: (id: string) => (id === "money-card" ? button : null),
        createElement: () => ({ append: () => {}, submit: () => failed.push("submit") }),
        body: { append: () => {} },
      },
      location: { hostname: "localhost", assign: () => {}, replace: () => {} },
      storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      console: { error: (m: string) => failed.push(m) },
    });
    for (const listener of button.listeners) await listener();

    expect(failed).toEqual([]);
    expect(passkey.used()).toBe(1);
    const onramp = turnkey.calls.filter((c) => c.url === ONRAMP);
    expect(onramp).toHaveLength(1);
    expect(onramp[0].body).toMatchObject({ type: "ACTIVITY_TYPE_INIT_FIAT_ON_RAMP", organizationId: "org-test-1" });
    expect(onramp[0].body.parameters).toEqual({
      onrampProvider: "FIAT_ON_RAMP_PROVIDER_MOONPAY",
      walletAddress: a.address,
      network: "FIAT_ON_RAMP_BLOCKCHAIN_NETWORK_BASE",
      cryptoCurrencyCode: "FIAT_ON_RAMP_CRYPTO_CURRENCY_USDC",
      fiatCurrencyCode: "FIAT_ON_RAMP_CURRENCY_USD",
      fiatCurrencyAmount: "25.00",
      paymentMethod: "FIAT_ON_RAMP_PAYMENT_METHOD_CREDIT_DEBIT_CARD",
    });
    // First Turnkey, then the report to our own address, then the card payment opens; the handoff is done.
    expect(order).toEqual([ONRAMP, `/h/${h.code}/deposit`]);
    expect(opened).toEqual([CARD_PAGE]);
    expect(stateOf(s, h.code)).toBe("done");
  });

  it("leaves the amount out at 20.00, where Turnkey takes none and MoonPay asks for it", async () => {
    const passkey = fakePasskey();
    const turnkey = fakeTurnkey(passkey, "org-1");
    const fetch = async (url: string, init: { headers: Record<string, string>; body: string }) =>
      url.startsWith("/h/") ? new Response('{"state":"done"}', { status: 200 }) : turnkey.fetch(url, init);
    const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    await flow.runDeposit(deps(passkey, fetch), { code: "AB12", amount: "20000000", address, chainId: 84532, org: "org-1" });
    const p = turnkey.calls[0].body.parameters as Record<string, unknown>;
    expect(p.walletAddress).toBe(address);
    expect(p).not.toHaveProperty("fiatCurrencyAmount");
  });

  it("tells the server nothing and opens nothing when the passkey is cancelled or Turnkey sends no card payment", async () => {
    const passkey = fakePasskey();
    const reports: string[] = [];
    const opened: string[] = [];
    const page = { code: "AB12", amount: "25000000", address: privateKeyToAccount(generatePrivateKey()).address, chainId: 84532, org: "org-1" };
    const cancel = async () => { throw Object.assign(new Error("not allowed"), { name: "NotAllowedError" }); };
    const fetch = async (url: string) => {
      reports.push(url);
      return new Response(JSON.stringify({ activity: { status: "ACTIVITY_STATUS_FAILED" } }), { status: 200 });
    };
    await expect(flow.runDeposit({ ...deps(passkey, fetch, opened), get: cancel }, page)).rejects.toMatchObject({ reason: "cancelled" });
    await expect(flow.runDeposit(deps(passkey, fetch, opened), page)).rejects.toMatchObject({ reason: "unreachable" });
    expect(reports).toEqual([ONRAMP]);
    expect(opened).toEqual([]);
  });
});

describe("the page client of the payout passkey", () => {
  it("signs the second permission for the forwarder of the page: USDC, no cap, 30 days, no end, with the existing passkey", async () => {
    const passkey = fakePasskey();
    const turnkey = fakeTurnkey(passkey, "org-1");
    const owner = turnkey.owner;
    const page = {
      chainId: 84532,
      spender: privateKeyToAccount(generatePrivateKey()).address,
      token: SEPOLIA_USDC,
      account: flow.smartWalletAddress(owner.address.toLowerCase()) as string,
      owner: owner.address,
      org: "org-1",
    };
    const posts: { url: string; body: string }[] = [];
    const fetch = async (url: string, init: { headers: Record<string, string>; body: string }) => {
      if (!url.startsWith("/h/")) return turnkey.fetch(url, init);
      posts.push({ url, body: init.body });
      return new Response('{"state":"done"}', { status: 200 });
    };
    const html = `<button class="btn btn-1" type="button" id="konto-passkey" data-mode="payout" data-code="AB12" data-chain="84532" data-spender="${page.spender}" data-token="${page.token}" data-account="${page.account}" data-owner="${page.owner}" data-org="org-1">`;
    const button = buttonOf(html, "konto-passkey")!;
    const replaced: string[] = [];
    wirePage({
      ...deps(passkey, fetch),
      document: { getElementById: (id: string) => (id === "konto-passkey" ? button : null), createElement: () => ({}), body: { append: () => {} } },
      location: { hostname: "localhost", assign: () => {}, replace: (u: string) => replaced.push(u) },
      storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      console: { error: () => {} },
    });
    for (const listener of button.listeners) await listener();
    expect(passkey.used()).toBe(1);
    expect(posts.map((p) => p.url)).toEqual(["/h/AB12/payout"]);
    expect(replaced).toEqual(["/h/AB12"]);
    const body = JSON.parse(posts[0].body) as { account: Hex; permission: unknown; signature: Hex };
    const permission = parsePermission(body.permission)!;
    expect(permissionFields(permission)).toEqual({ allowance: 2n ** 160n - 1n, period: 2_592_000, end: 2 ** 48 - 1 });
    expect(payoutPermissionMatches(permission, { account: page.account, forwarder: page.spender, token: SEPOLIA_USDC, nowSec: Math.floor(START / 1000) })).toBe(true);
    const [wrapper] = decodeAbiParameters(
      [{ type: "tuple", components: [{ name: "ownerIndex", type: "uint8" }, { name: "signatureData", type: "bytes" }] }],
      parseErc6492Signature(body.signature).signature,
    ) as [{ ownerIndex: number; signatureData: Hex }];
    const replaySafe = hashTypedData({
      domain: { name: "Coinbase Smart Wallet", version: "1", chainId: 84532, verifyingContract: body.account },
      types: { CoinbaseSmartWalletMessage: [{ name: "hash", type: "bytes32" }] },
      primaryType: "CoinbaseSmartWalletMessage",
      message: { hash: hashTypedData({ domain: spendPermissionDomain(84532), types: SPEND_PERMISSION_TYPES, primaryType: "SpendPermission", message: permission }) },
    });
    expect((await recoverAddress({ hash: replaySafe, signature: wrapper.signatureData })).toLowerCase()).toBe(owner.address.toLowerCase());
  });

  it("signs the new permission and the revoke of the earlier one with one passkey dialog and one SIGN_RAW_PAYLOADS (goals/konto/11)", async () => {
    const passkey = fakePasskey();
    const turnkey = fakeTurnkey(passkey, "org-1");
    const owner = turnkey.owner;
    const spender = privateKeyToAccount(generatePrivateKey()).address;
    const account = flow.smartWalletAddress(owner.address.toLowerCase()) as string;
    const revokeHash = `0x${createHash("sha256").update("the revoke of the earlier permission").digest("hex")}` as Hex;
    const posts: { url: string; body: string }[] = [];
    const fetch = async (url: string, init: { headers: Record<string, string>; body: string }) => {
      if (!url.startsWith("/h/")) return turnkey.fetch(url, init);
      posts.push({ url, body: init.body });
      return new Response('{"state":"done"}', { status: 200 });
    };
    const html = `<button class="btn btn-1" type="button" id="konto-passkey" data-mode="payout" data-code="AB12" data-chain="84532" data-spender="${spender}" data-token="${SEPOLIA_USDC}" data-account="${account}" data-owner="${owner.address}" data-org="org-1" data-revoke-hash="${revokeHash}" data-revoke-nonce="3">`;
    const button = buttonOf(html, "konto-passkey")!;
    const replaced: string[] = [];
    wirePage({
      ...deps(passkey, fetch),
      document: { getElementById: (id: string) => (id === "konto-passkey" ? button : null), createElement: () => ({}), body: { append: () => {} } },
      location: { hostname: "localhost", assign: () => {}, replace: (u: string) => replaced.push(u) },
      storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      console: { error: () => {} },
    });
    for (const listener of button.listeners) await listener();
    expect(passkey.used()).toBe(1);
    expect(turnkey.calls.map((c) => c.url)).toEqual([SIGN_MANY]);
    const activity = turnkey.calls[0].body as { type: string; parameters: { payloads: Hex[]; hashFunction: string } };
    expect(activity.type).toBe("ACTIVITY_TYPE_SIGN_RAW_PAYLOADS");
    expect(activity.parameters.payloads).toHaveLength(2);
    expect(activity.parameters.payloads[1]).toBe(revokeHash);
    expect(activity.parameters.hashFunction).toBe("HASH_FUNCTION_NO_OP");
    expect(posts.map((p) => p.url)).toEqual(["/h/AB12/payout"]);
    expect(replaced).toEqual(["/h/AB12"]);
    const body = JSON.parse(posts[0].body) as { account: Hex; permission: unknown; signature: Hex; revoke: { nonce: string; signature: Hex } };
    expect(body.revoke.nonce).toBe("3");
    expect((await recoverAddress({ hash: revokeHash, signature: body.revoke.signature })).toLowerCase()).toBe(owner.address.toLowerCase());
    const permission = parsePermission(body.permission)!;
    expect(payoutPermissionMatches(permission, { account, forwarder: spender, token: SEPOLIA_USDC, nowSec: Math.floor(START / 1000) })).toBe(true);
    const [wrapper] = decodeAbiParameters(
      [{ type: "tuple", components: [{ name: "ownerIndex", type: "uint8" }, { name: "signatureData", type: "bytes" }] }],
      parseErc6492Signature(body.signature).signature,
    ) as [{ ownerIndex: number; signatureData: Hex }];
    const replaySafe = hashTypedData({
      domain: { name: "Coinbase Smart Wallet", version: "1", chainId: 84532, verifyingContract: body.account },
      types: { CoinbaseSmartWalletMessage: [{ name: "hash", type: "bytes32" }] },
      primaryType: "CoinbaseSmartWalletMessage",
      message: { hash: hashTypedData({ domain: spendPermissionDomain(84532), types: SPEND_PERMISSION_TYPES, primaryType: "SpendPermission", message: permission }) },
    });
    expect(activity.parameters.payloads[0]).toBe(replaySafe);
    expect((await recoverAddress({ hash: replaySafe, signature: wrapper.signatureData })).toLowerCase()).toBe(owner.address.toLowerCase());
  });

  it("carries the forwarder and the passkey of the account on the real payout-passkey page, counting two steps after an earlier check", async () => {
    const s = moneySetup();
    const a = await account(s);
    s.bridge.state.kycStatus = "approved";
    const h = (await (await json(s, "/v1/handoff", { automaton_name: "Atlas", step: "payout" }, a.key)).json()) as { code: string; match: number };
    // Bridge had checked the person already, so the page counts two steps instead of three (note of the Design Reviewer).
    expect(await (await tap(s.app, h.code, h.match)).text()).toContain("Step 1 of 2");
    const res = await s.app.request(`/h/${h.code}/payout-bank`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ iban: "DE89 3704 0044 0532 0130 00", owner_name: "Erika Mustermann" }).toString(),
    });
    const html = await res.text();
    expect(dataOf(html, "konto-passkey", "mode")).toBe("payout");
    expect(dataOf(html, "konto-passkey", "account")).toBe(a.address);
    expect(dataOf(html, "konto-passkey", "org")).toBe("org-test-1");
    expect(dataOf(html, "konto-passkey", "spender")).toMatch(/^0x[0-9a-f]{40}$/);
    expect(html).toContain('<script type="module" src="/h/konto.js"></script>');
    expect(html).toContain("Step 2 of 2");
  });
});

const permissionFields = (p: { allowance: bigint; period: number; end: number }) => ({ allowance: p.allowance, period: p.period, end: p.end });
