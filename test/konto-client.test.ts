/**
 * goals/konto/03, Punkt 10: the script of the passkey step (src/public/konto-client/). The whole flow runs here against a
 * stand-in for Turnkey: passkey, signup through the Auth Proxy with a key of the tab, one signature of the Turnkey wallet over the
 * replay-safe hash of the smart wallet, and the body of POST /h/{code}/konto that the server accepts. The real Turnkey and the
 * real chain are the run on Base Sepolia (ops/konto/sepolia-run.mjs, docs/konto/sepolia.md).
 */
import { createPublicKey, ECDH, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  decodeAbiParameters,
  decodeFunctionData,
  hashTypedData,
  isErc6492Signature,
  pad,
  parseErc6492Signature,
  recoverAddress,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SEPOLIA_USDC } from "../src/konto/config.js";
import { parsePermission, permissionMatches, SPEND_PERMISSION_TYPES, spendPermissionDomain } from "../src/konto/permission.js";
// @ts-expect-error plain browser module without types
import * as flow from "../src/public/konto-client/flow.mjs";
// @ts-expect-error build script without types
import { bundle, BUNDLE } from "../ops/konto/build-client.mjs";
import { ATLAS, create, handoffApp, START, tap } from "./handoff-helpers.js";

const SPM = "0xf85210b21cc50302f477ba56686d2019dc9b67ad";
const FACTORY_ABI = [
  {
    type: "function",
    name: "createAccount",
    stateMutability: "payable",
    inputs: [{ name: "owners", type: "bytes[]" }, { name: "nonce", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
] as const;

const b64urlToBuffer = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** Checks a Turnkey stamp the way Turnkey does: DER ECDSA over SHA-256 of the body, by the compressed P-256 key it names. */
function stampValid(stampHeader: string, body: string, wantKey?: string): boolean {
  const stamp = JSON.parse(b64urlToBuffer(stampHeader).toString("utf8")) as { publicKey: string; scheme: string; signature: string };
  if (stamp.scheme !== "SIGNATURE_SCHEME_TK_API_P256") return false;
  if (wantKey && stamp.publicKey !== wantKey) return false;
  const raw = ECDH.convertKey(stamp.publicKey, "prime256v1", "hex", "buffer", "uncompressed") as Buffer;
  const key = createPublicKey({
    key: { kty: "EC", crv: "P-256", x: raw.subarray(1, 33).toString("base64url"), y: raw.subarray(33).toString("base64url") },
    format: "jwk",
  });
  return verify("sha256", Buffer.from(body), { key, dsaEncoding: "der" }, Buffer.from(stamp.signature, "hex"));
}

/** A stand-in for Turnkey: the Auth Proxy creates the sub-organization, the API signs with `owner` after checking the stamp. */
function fakeTurnkey(owner = privateKeyToAccount(generatePrivateKey()), opts: { signupStatus?: number } = {}) {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  let sessionKey = "";
  const fetch = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    calls.push({ url, headers: init.headers, body });
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    if (url === "https://authproxy.turnkey.com/v1/signup_v2") {
      if (opts.signupStatus) return json(opts.signupStatus, { message: "no" });
      sessionKey = (body.apiKeys as { publicKey: string }[])[0].publicKey;
      return json(200, { organizationId: "sub-org-1", userId: "user-1", wallet: { walletId: "w-1", addresses: [owner.address] } });
    }
    if (url === "https://api.turnkey.com/public/v1/submit/sign_raw_payload") {
      if (!stampValid(init.headers["X-Stamp"], init.body, sessionKey)) return json(401, { message: "bad stamp" });
      const p = body.parameters as { signWith: string; payload: Hex; hashFunction: string };
      // Turnkey names the wallet case-sensitively, exactly as the signup returned it (checksummed).
      if (p.signWith !== owner.address || p.hashFunction !== "HASH_FUNCTION_NO_OP") {
        return json(404, { message: "Could not find any resource to sign with. Addresses are case sensitive." });
      }
      const sig = await owner.sign({ hash: p.payload });
      const v = parseInt(sig.slice(130, 132), 16) === 27 ? "00" : "01";
      return json(200, {
        activity: { id: "a-1", status: "ACTIVITY_STATUS_COMPLETED", result: { signRawPayloadResult: { r: sig.slice(2, 66), s: sig.slice(66, 130), v } } },
      });
    }
    return json(404, {});
  };
  return { fetch, calls, owner };
}

/** A passkey on a phone: what navigator.credentials.create gives, as far as the flow reads it. */
function fakeCreate(seen: unknown[] = []) {
  return async (options: unknown) => {
    seen.push(options);
    return {
      rawId: new Uint8Array([1, 2, 3, 4]).buffer,
      response: {
        clientDataJSON: new TextEncoder().encode('{"type":"webauthn.create"}').buffer,
        attestationObject: new Uint8Array([9, 9, 9]).buffer,
        getTransports: () => ["internal", "carrier-pigeon"],
      },
    };
  };
}

const spender = privateKeyToAccount(generatePrivateKey()).address;
const PAGE = { proxyId: "proxy-config-1", limit: "5000000", chainId: 84532, spender, token: SEPOLIA_USDC };
const deps = (turnkey: ReturnType<typeof fakeTurnkey>, create = fakeCreate()) => ({
  create,
  fetch: turnkey.fetch,
  subtle: globalThis.crypto.subtle,
  random: (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n)),
  now: () => START,
  rpId: "localhost",
  sleep: async () => {},
});

describe("konto client", () => {
  it("predicts the smart wallet the factory on Base Sepolia names for an owner", () => {
    // getAddress([pad(owner), pad(SpendPermissionManager)], 0) of CoinbaseSmartWalletFactory on Base Sepolia, block 59208510.
    expect(flow.smartWalletAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")).toBe("0x9629d2d1cedc9c2b4b312acdf92abf9b9fecdd06");
  });

  it("stamps requests so that the named P-256 key verifies them, and only them", async () => {
    const key = await flow.sessionKey(globalThis.crypto.subtle);
    expect(key.publicKey).toMatch(/^0[23][0-9a-f]{64}$/);
    for (let i = 0; i < 20; i++) {
      const body = JSON.stringify({ n: i, pad: "x".repeat(i) });
      const stamp = await key.stamp(body);
      expect(stampValid(stamp, body, key.publicKey)).toBe(true);
      expect(stampValid(stamp, body + " ", key.publicKey)).toBe(false);
    }
  });

  it("creates the account in one go and sends a permission the server accepts, signed by the Turnkey wallet", async () => {
    const turnkey = fakeTurnkey();
    const seen: unknown[] = [];
    const { body, owner, organizationId } = await flow.runKonto(deps(turnkey, fakeCreate(seen)), PAGE);
    expect(owner).toBe(turnkey.owner.address.toLowerCase());
    expect(organizationId).toBe("sub-org-1");

    // One passkey, for this site.
    expect(seen).toHaveLength(1);
    expect((seen[0] as { publicKey: { rp: { id: string } } }).publicKey.rp.id).toBe("localhost");
    // Named after the site the person created it on, so the key chain shows it under that name.
    const publicKey = (seen[0] as { publicKey: { rp: { name: string }; user: { name: string; displayName: string } } }).publicKey;
    expect(publicKey.rp.name).toBe("automatonhost.com");
    expect(publicKey.user.name).toMatch(/^automatonhost\.com \d{4}-\d{2}-\d{2}$/);
    expect(publicKey.user.displayName).toBe(publicKey.user.name);

    // The signup: the Auth Proxy configuration in its header, the passkey, a key of the tab for two minutes, one Ethereum wallet.
    const signup = turnkey.calls[0];
    expect(signup.url).toBe("https://authproxy.turnkey.com/v1/signup_v2");
    expect(signup.headers["X-Auth-Proxy-Config-ID"]).toBe("proxy-config-1");
    const auth = (signup.body.authenticators as { attestation: { credentialId: string; transports: string[] }; challenge: string }[])[0];
    expect(auth.attestation.credentialId).toBe("AQIDBA");
    expect(auth.attestation.transports).toEqual(["AUTHENTICATOR_TRANSPORT_INTERNAL"]);
    expect(auth.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(signup.body.apiKeys).toEqual([expect.objectContaining({ curveType: "API_KEY_CURVE_P256", expirationSeconds: "120" })]);
    expect(signup.body.wallet).toEqual({
      walletName: "automatonhost.com",
      accounts: [{ curve: "CURVE_SECP256K1", pathFormat: "PATH_FORMAT_BIP32", path: "m/44'/60'/0'/0/0", addressFormat: "ADDRESS_FORMAT_ETHEREUM" }],
    });
    expect(turnkey.calls).toHaveLength(2);

    // The permission is the one the handoff asked for, so the server's own check lets it through.
    const permission = parsePermission(body.permission)!;
    expect(permission).not.toBeNull();
    expect(body.account).toBe(flow.smartWalletAddress(owner));
    expect(permission.account).toBe(body.account);
    expect(
      permissionMatches(permission, { account: body.account, spender, token: SEPOLIA_USDC, allowance: 5_000_000n, nowSec: Math.floor(START / 1000) }),
    ).toBe(true);
    expect(permission.end).toBe(2 ** 48 - 1);

    // ERC-6492: the factory creates the wallet with the Turnkey wallet and SpendPermissionManager as owners.
    expect(isErc6492Signature(body.signature)).toBe(true);
    const wrapped = parseErc6492Signature(body.signature);
    expect(wrapped.address?.toLowerCase()).toBe("0x0ba5ed0c6aa8c49038f819e587e2633c4a9f428a");
    const call = decodeFunctionData({ abi: FACTORY_ABI, data: wrapped.data! });
    expect(call.args).toEqual([[pad(owner as Hex), pad(SPM)], 0n]);

    // Inside: owner 0 signed the replay-safe hash of the smart wallet over the permission.
    const [wrapper] = decodeAbiParameters(
      [{ type: "tuple", components: [{ name: "ownerIndex", type: "uint8" }, { name: "signatureData", type: "bytes" }] }],
      wrapped.signature,
    ) as [{ ownerIndex: number; signatureData: Hex }];
    expect(wrapper.ownerIndex).toBe(0);
    const permissionHash = hashTypedData({
      domain: spendPermissionDomain(84532),
      types: SPEND_PERMISSION_TYPES,
      primaryType: "SpendPermission",
      message: permission,
    });
    const replaySafe = hashTypedData({
      domain: { name: "Coinbase Smart Wallet", version: "1", chainId: 84532, verifyingContract: body.account },
      types: { CoinbaseSmartWalletMessage: [{ name: "hash", type: "bytes32" }] },
      primaryType: "CoinbaseSmartWalletMessage",
      message: { hash: permissionHash },
    });
    expect((await recoverAddress({ hash: replaySafe, signature: wrapper.signatureData })).toLowerCase()).toBe(owner);
  });

  it("reports a cancelled passkey as cancelled, before anything goes to Turnkey", async () => {
    const turnkey = fakeTurnkey();
    const cancel = async () => { throw Object.assign(new Error("The operation either timed out or was not allowed."), { name: "NotAllowedError" }); };
    await expect(flow.runKonto(deps(turnkey, cancel as never), PAGE)).rejects.toMatchObject({ reason: "cancelled" });
    expect(turnkey.calls).toHaveLength(0);
  });

  it("reports a signup Turnkey refuses, and a page without Auth Proxy, as unreachable", async () => {
    await expect(flow.runKonto(deps(fakeTurnkey(undefined, { signupStatus: 403 })), PAGE)).rejects.toMatchObject({ reason: "unreachable" });
    const turnkey = fakeTurnkey();
    await expect(flow.runKonto(deps(turnkey), { ...PAGE, proxyId: "" })).rejects.toMatchObject({ reason: "unreachable" });
    expect(turnkey.calls).toHaveLength(0);
  });

  it("is committed as the bundle of its sources", async () => {
    expect(readFileSync(BUNDLE, "utf8")).toBe(await bundle());
  });
});

describe("the page serves the script", () => {
  const konto = {
    chainId: 84532,
    spender,
    token: SEPOLIA_USDC,
    verifyClient: null as never,
    authProxyId: "proxy-config-1",
  };

  it("loads /h/konto.js from our own address and hands it the Auth Proxy configuration", async () => {
    const { app } = handoffApp({ konto });
    const h = await create(app, { ...ATLAS, step: "konto" });
    const html = await (await tap(app, h.code, h.match)).text();
    expect(html).toContain('<script type="module" src="/h/konto.js"></script>');
    expect(html).toContain('data-proxy="proxy-config-1"');
    const js = await app.request("/h/konto.js");
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toMatch(/^text\/javascript/);
    expect(await js.text()).toBe(readFileSync(BUNDLE, "utf8"));
  });

  it("has no script while the account is off", async () => {
    const { app } = handoffApp({ konto: null });
    expect((await app.request("/h/konto.js")).status).toBe(404);
  });
});
