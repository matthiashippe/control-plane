/**
 * goals/konto/04, Punkt 6 and 10: the script of the step limit (src/public/konto-client/flow.mjs, runLimit). The account exists,
 * so there is no signup: the passkey already on the phone stamps one request to Turnkey (X-Stamp-WebAuthn, the challenge being
 * the hex SHA-256 of the body), Turnkey's wallet of the account signs the replay-safe hash of the new permission, and the body of
 * POST /h/{code}/limit is accepted by the server. The real Turnkey and the real chain are ops/konto/sepolia-limit-run.mjs.
 */
import { createHash, generateKeyPairSync, sign as nodeSign, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decodeAbiParameters, hashTypedData, parseErc6492Signature, recoverAddress, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SEPOLIA_USDC } from "../src/konto/config.js";
import { parsePermission, permissionMatches, SPEND_PERMISSION_TYPES, spendPermissionDomain } from "../src/konto/permission.js";
// @ts-expect-error plain browser module without types
import * as flow from "../src/public/konto-client/flow.mjs";
// @ts-expect-error bundle without types
import { bundle } from "../ops/konto/build-client.mjs";
import { START } from "./handoff-helpers.js";

const b64url = (b: Uint8Array | Buffer) => Buffer.from(b).toString("base64url");

/** The passkey on the phone: a P-256 key that signs authenticatorData || SHA-256(clientDataJSON), as WebAuthn does. */
function fakePasskey() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const seen: { publicKey: { challenge: Uint8Array; rpId: string; allowCredentials?: unknown } }[] = [];
  const get = async (options: { publicKey: { challenge: Uint8Array; rpId: string } }) => {
    seen.push(options);
    const clientData = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: b64url(options.publicKey.challenge), origin: "https://localhost" }));
    const authenticatorData = Buffer.concat([createHash("sha256").update(options.publicKey.rpId).digest(), Buffer.from([5, 0, 0, 0, 1])]);
    const signature = nodeSign("sha256", Buffer.concat([authenticatorData, createHash("sha256").update(clientData).digest()]), privateKey);
    return { rawId: new Uint8Array([7, 7, 7]).buffer, response: { authenticatorData, clientDataJSON: clientData, signature } };
  };
  return { get, seen, publicKey };
}

/** Turnkey as far as the step limit uses it: a WebAuthn stamp by the passkey of the group, then a signature by its wallet. */
function fakeTurnkey(owner: ReturnType<typeof privateKeyToAccount>, passkey: ReturnType<typeof fakePasskey>) {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const fetch = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    calls.push({ url, headers: init.headers, body });
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    if (url !== "https://api.turnkey.com/public/v1/submit/sign_raw_payload") return json(404, {});
    const stamp = JSON.parse(init.headers["X-Stamp-WebAuthn"] ?? "{}") as Record<string, string>;
    const clientData = Buffer.from(stamp.clientDataJson ?? "", "base64url");
    const challenge = JSON.parse(clientData.toString("utf8") || "{}").challenge as string;
    const want = Buffer.from(createHash("sha256").update(init.body).digest("hex")).toString("base64url");
    const signed = Buffer.concat([Buffer.from(stamp.authenticatorData ?? "", "base64url"), createHash("sha256").update(clientData).digest()]);
    if (challenge !== want || !verify("sha256", signed, passkey.publicKey, Buffer.from(stamp.signature ?? "", "base64url"))) {
      return json(401, { message: "bad stamp" });
    }
    const p = body.parameters as { signWith: string; payload: Hex };
    if (body.organizationId !== "sub-org-1" || p.signWith !== owner.address) return json(404, { message: "no such wallet" });
    const sig = await owner.sign({ hash: p.payload });
    const v = parseInt(sig.slice(130, 132), 16) === 27 ? "00" : "01";
    return json(200, { activity: { id: "a-1", status: "ACTIVITY_STATUS_COMPLETED", result: { signRawPayloadResult: { r: sig.slice(2, 66), s: sig.slice(66, 130), v } } } });
  };
  return { fetch, calls };
}

const spender = privateKeyToAccount(generatePrivateKey()).address;

function setup() {
  const owner = privateKeyToAccount(generatePrivateKey());
  const passkey = fakePasskey();
  const turnkey = fakeTurnkey(owner, passkey);
  const page = {
    limit: "10000000",
    chainId: 84532,
    spender,
    token: SEPOLIA_USDC,
    account: flow.smartWalletAddress(owner.address.toLowerCase()) as string,
    owner: owner.address,
    org: "sub-org-1",
  };
  const deps = {
    get: passkey.get,
    fetch: turnkey.fetch,
    subtle: globalThis.crypto.subtle,
    random: (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n)),
    now: () => START,
    rpId: "localhost",
  };
  return { owner, passkey, turnkey, page, deps };
}

describe("konto client, step limit", () => {
  it("signs the new limit with one passkey dialog and the wallet of the account, as the server expects it", async () => {
    const s = setup();
    const { body } = await flow.runLimit(s.deps, s.page);
    expect(s.passkey.seen).toHaveLength(1);
    expect(s.passkey.seen[0].publicKey.allowCredentials).toBeUndefined();
    expect(s.turnkey.calls.map((c) => c.url)).toEqual(["https://api.turnkey.com/public/v1/submit/sign_raw_payload"]);
    expect(s.turnkey.calls[0].headers["X-Stamp"]).toBeUndefined();
    const permission = parsePermission(body.permission)!;
    expect(body.account).toBe(s.page.account);
    const now = Math.floor(START / 1000);
    expect(permissionMatches(permission, { account: s.page.account as Hex, spender, token: SEPOLIA_USDC, allowance: 10_000_000n, nowSec: now })).toBe(true);
    // Inside the ERC-6492 wrapper: owner 0 signed the replay-safe hash of the smart wallet over the new permission.
    const wrapped = parseErc6492Signature(body.signature);
    const [wrapper] = decodeAbiParameters(
      [{ type: "tuple", components: [{ name: "ownerIndex", type: "uint8" }, { name: "signatureData", type: "bytes" }] }],
      wrapped.signature,
    ) as [{ ownerIndex: number; signatureData: Hex }];
    const hash = hashTypedData({ domain: spendPermissionDomain(84532), types: SPEND_PERMISSION_TYPES, primaryType: "SpendPermission", message: permission });
    const replaySafe = hashTypedData({
      domain: { name: "Coinbase Smart Wallet", version: "1", chainId: 84532, verifyingContract: body.account },
      types: { CoinbaseSmartWalletMessage: [{ name: "hash", type: "bytes32" }] },
      primaryType: "CoinbaseSmartWalletMessage",
      message: { hash },
    });
    expect((await recoverAddress({ hash: replaySafe, signature: wrapper.signatureData })).toLowerCase()).toBe(s.owner.address.toLowerCase());
  });

  it("uses a new salt on every raise", async () => {
    const s = setup();
    const a = parsePermission((await flow.runLimit(s.deps, s.page)).body.permission)!;
    const b = parsePermission((await flow.runLimit(s.deps, s.page)).body.permission)!;
    expect(a.salt).not.toBe(b.salt);
  });

  it("reports a cancelled passkey as cancelled, before anything goes to Turnkey", async () => {
    const s = setup();
    const cancel = async () => { throw Object.assign(new Error("not allowed"), { name: "NotAllowedError" }); };
    await expect(flow.runLimit({ ...s.deps, get: cancel }, s.page)).rejects.toMatchObject({ reason: "cancelled" });
    expect(s.turnkey.calls).toHaveLength(0);
  });

  it("refuses a page whose account the wallet of the passkey does not own, and a page without the passkey on record", async () => {
    const s = setup();
    const other = flow.smartWalletAddress(privateKeyToAccount(generatePrivateKey()).address.toLowerCase());
    await expect(flow.runLimit(s.deps, { ...s.page, account: other })).rejects.toMatchObject({ reason: "refused" });
    await expect(flow.runLimit(s.deps, { ...s.page, org: "" })).rejects.toMatchObject({ reason: "unreachable" });
    expect(s.turnkey.calls).toHaveLength(0);
  });

  it("is in the committed bundle the page loads", async () => {
    const text: string = await bundle();
    expect(text).toContain("X-Stamp-WebAuthn");
    expect(text).toMatch(/"limit"/);
  });
});
