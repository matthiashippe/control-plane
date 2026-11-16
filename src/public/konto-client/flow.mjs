// The passkey step of /h/{code} in the browser (goals/konto/03, docs/konto/konto.md "Ablauf", step 3).
//
// One tap: the phone creates a passkey, Turnkey's Auth Proxy creates a sub-organization with that passkey, one Ethereum wallet
// and a P-256 key that lives only in this tab and expires after two minutes. That key signs, once, the spend permission for the
// Coinbase Smart Wallet whose owners are the Turnkey wallet and SpendPermissionManager. Nothing here talks to a chain: the address
// of the smart wallet follows from the factory by CREATE2, and a wallet whose owner was created a second ago has no code yet, so
// the signature is ERC-6492. Only Turnkey is called from here; everything else goes to our own address.
//
// Every outside dependency is passed in (`create`, `fetch`, `subtle`, `random`, `now`), so test/konto-client.test.ts runs the
// whole flow in Node against a stand-in for Turnkey. main.mjs wires it to the page; ops/konto/build-client.mjs bundles both into
// konto.js next to this file.
import { encodeAbiParameters, getContractAddress, hashTypedData, keccak256, pad, createClient, custom } from "viem";
import { toAccount } from "viem/accounts";
import { toCoinbaseSmartAccount } from "viem/account-abstraction";

/** CoinbaseSmartWalletFactory v1, the same address on Base and Base Sepolia (harness/chain/konto/README.md). */
export const FACTORY = "0x0ba5ed0c6aa8c49038f819e587e2633c4a9f428a";
/** initCodeHash() of that factory, read from Base Sepolia on 15.11.2026; getAddress() of the factory gives the same address. */
export const FACTORY_INIT_CODE_HASH = "0x5153041b4b8e36c84ca233b2fb610f85b8831b5e56a365618f507f8784fe034e";
export const SPEND_PERMISSION_MANAGER = "0xf85210b21cc50302f477ba56686d2019dc9b67ad";
export const PERIOD_SECONDS = 86400;
/** The largest uint48: a permission without an end date, as the daily limit is the only bound we ask for. */
export const END_NEVER = 281474976710655;
export const AUTH_PROXY_URL = "https://authproxy.turnkey.com";
export const TURNKEY_API_URL = "https://api.turnkey.com";
/** How long the key of this tab may sign at Turnkey. It signs once, right after the signup. */
export const SESSION_KEY_SECONDS = "120";

const ETHEREUM_ACCOUNT = {
  curve: "CURVE_SECP256K1",
  pathFormat: "PATH_FORMAT_BIP32",
  path: "m/44'/60'/0'/0/0",
  addressFormat: "ADDRESS_FORMAT_ETHEREUM",
};

const PERMISSION_TYPES = {
  SpendPermission: [
    { name: "account", type: "address" },
    { name: "spender", type: "address" },
    { name: "token", type: "address" },
    { name: "allowance", type: "uint160" },
    { name: "period", type: "uint48" },
    { name: "start", type: "uint48" },
    { name: "end", type: "uint48" },
    { name: "salt", type: "uint256" },
    { name: "extraData", type: "bytes" },
  ],
};

/** Why no account came into being; the names are the reasons of POST /h/{code}/fehlgeschlagen. */
export class KontoError extends Error {
  /** @param {"cancelled" | "unreachable" | "refused"} reason */
  constructor(reason, detail) {
    super(`${reason}: ${detail}`);
    this.reason = reason;
  }
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Base64url without padding, as WebAuthn and Turnkey write it. */
export function base64url(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64[n & 63];
  }
  return out;
}

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** The 33-byte compressed form of an uncompressed P-256 point (0x04 || x || y), as Turnkey names API keys. */
export function compressP256(raw) {
  if (raw.length !== 65 || raw[0] !== 4) throw new Error("not an uncompressed P-256 point");
  return (raw[64] & 1 ? "03" : "02") + hex(raw.subarray(1, 33));
}

function derInt(bytes) {
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i++;
  const v = bytes.subarray(i);
  return v[0] & 0x80 ? Uint8Array.of(0, ...v) : v;
}

/** WebCrypto signs P-256 as r || s (IEEE P1363); Turnkey's stamp wants ASN.1 DER. */
export function p1363ToDer(sig) {
  if (sig.length !== 64) throw new Error("not a P-256 signature");
  const r = derInt(sig.subarray(0, 32));
  const s = derInt(sig.subarray(32));
  return Uint8Array.of(0x30, 4 + r.length + s.length, 2, r.length, ...r, 2, s.length, ...s);
}

/** A P-256 key that cannot leave this tab (not extractable) and stamps requests to Turnkey. */
export async function sessionKey(subtle) {
  const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const publicKey = compressP256(new Uint8Array(await subtle.exportKey("raw", pair.publicKey)));
  return {
    publicKey,
    /** The value of the X-Stamp header for exactly this body. */
    async stamp(body) {
      const sig = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(body)));
      const stamp = JSON.stringify({ publicKey, scheme: "SIGNATURE_SCHEME_TK_API_P256", signature: hex(p1363ToDer(sig)) });
      return base64url(new TextEncoder().encode(stamp));
    },
  };
}

const TRANSPORTS = {
  internal: "AUTHENTICATOR_TRANSPORT_INTERNAL",
  usb: "AUTHENTICATOR_TRANSPORT_USB",
  nfc: "AUTHENTICATOR_TRANSPORT_NFC",
  ble: "AUTHENTICATOR_TRANSPORT_BLE",
  hybrid: "AUTHENTICATOR_TRANSPORT_HYBRID",
};

/** The passkey on this phone, for this site, in the shape Turnkey's signup takes. */
export async function createPasskey({ create, random, rpId, name }) {
  const challenge = random(32);
  let cred;
  try {
    cred = await create({
      publicKey: {
        rp: { id: rpId, name: "PostYourPrice" },
        user: { id: random(32), name, displayName: name },
        challenge,
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "preferred" },
        timeout: 300000,
      },
    });
  } catch (err) {
    throw new KontoError("cancelled", err && err.name ? err.name : "passkey not created");
  }
  if (!cred) throw new KontoError("cancelled", "no passkey");
  const transports = typeof cred.response.getTransports === "function" ? cred.response.getTransports() : [];
  return {
    challenge: base64url(challenge),
    attestation: {
      credentialId: base64url(new Uint8Array(cred.rawId)),
      clientDataJson: base64url(new Uint8Array(cred.response.clientDataJSON)),
      attestationObject: base64url(new Uint8Array(cred.response.attestationObject)),
      transports: transports.map((t) => TRANSPORTS[t]).filter(Boolean),
    },
  };
}

async function postJson(fetchFn, url, headers, body) {
  let res;
  try {
    res = await fetchFn(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body });
  } catch (err) {
    throw new KontoError("unreachable", `${url}: ${err && err.message ? err.message : "no answer"}`);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    const why = data && typeof data.message === "string" ? ` ${data.message.slice(0, 160)}` : "";
    throw new KontoError("unreachable", `${url}: ${res.status}${why}`);
  }
  return data;
}

/** A new sub-organization with the passkey, the key of this tab and one Ethereum wallet. */
export async function signup({ fetch: fetchFn, proxyId, passkey, sessionPublicKey, nowMs }) {
  const body = JSON.stringify({
    userName: "Account",
    organizationName: `account-${nowMs}`,
    authenticators: [{ authenticatorName: `passkey-${nowMs}`, challenge: passkey.challenge, attestation: passkey.attestation }],
    apiKeys: [{ apiKeyName: `tab-${nowMs}`, publicKey: sessionPublicKey, curveType: "API_KEY_CURVE_P256", expirationSeconds: SESSION_KEY_SECONDS }],
    oauthProviders: [],
    wallet: { walletName: "PostYourPrice", accounts: [ETHEREUM_ACCOUNT] },
  });
  const data = await postJson(fetchFn, `${AUTH_PROXY_URL}/v1/signup_v2`, { "X-Auth-Proxy-Config-ID": proxyId }, body);
  const owner = data.wallet && Array.isArray(data.wallet.addresses) ? data.wallet.addresses[0] : null;
  if (typeof data.organizationId !== "string" || typeof owner !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(owner)) {
    throw new KontoError("unreachable", "signup answered without organization or wallet");
  }
  // `wallet` as Turnkey wrote it: signWith is case-sensitive there. `owner` in lower case for everything on our side.
  return { organizationId: data.organizationId, owner: owner.toLowerCase(), wallet: owner };
}

/** The Turnkey wallet signs a 32-byte hash as it is (no hashing on their side); 65 bytes r || s || v. */
export async function signHash({ fetch: fetchFn, key, organizationId, signWith, hash, now, sleep }) {
  const submit = JSON.stringify({
    type: "ACTIVITY_TYPE_SIGN_RAW_PAYLOAD_V2",
    timestampMs: String(now()),
    organizationId,
    parameters: { signWith, payload: hash, encoding: "PAYLOAD_ENCODING_HEXADECIMAL", hashFunction: "HASH_FUNCTION_NO_OP" },
  });
  let data = await postJson(fetchFn, `${TURNKEY_API_URL}/public/v1/submit/sign_raw_payload`, { "X-Stamp": await key.stamp(submit) }, submit);
  for (let i = 0; i < 10 && data.activity && data.activity.status !== "ACTIVITY_STATUS_COMPLETED"; i++) {
    if (/FAILED|REJECTED/.test(String(data.activity.status))) break;
    await sleep(500);
    const query = JSON.stringify({ organizationId, activityId: data.activity.id });
    data = await postJson(fetchFn, `${TURNKEY_API_URL}/public/v1/query/get_activity`, { "X-Stamp": await key.stamp(query) }, query);
  }
  const result = data.activity && data.activity.status === "ACTIVITY_STATUS_COMPLETED" && data.activity.result
    ? data.activity.result.signRawPayloadResult : null;
  if (!result || !/^[0-9a-fA-F]{1,64}$/.test(result.r) || !/^[0-9a-fA-F]{1,64}$/.test(result.s)) {
    throw new KontoError("unreachable", "no signature from the wallet");
  }
  const v = Number.parseInt(String(result.v), 16);
  return `0x${result.r.padStart(64, "0")}${result.s.padStart(64, "0")}${v === 0 || v === 27 ? "1b" : "1c"}`;
}

/** The Coinbase Smart Wallet of `owner` with SpendPermissionManager as second owner, nonce 0, by CREATE2. */
export function smartWalletAddress(owner) {
  const owners = [pad(owner), pad(SPEND_PERMISSION_MANAGER)];
  const salt = keccak256(encodeAbiParameters([{ type: "bytes[]" }, { type: "uint256" }], [owners, 0n]));
  return getContractAddress({ opcode: "CREATE2", from: FACTORY, salt, bytecodeHash: FACTORY_INIT_CODE_HASH }).toLowerCase();
}

/** A client without network: the wallet is brand new, so it has no code; anything else is a mistake. */
function offlineClient(chainId) {
  return createClient({
    chain: { id: chainId, name: "Base Sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [] } } },
    transport: custom({
      async request({ method }) {
        if (method === "eth_getCode") return "0x";
        if (method === "eth_chainId") return `0x${chainId.toString(16)}`;
        throw new Error(`no network on this page (${method})`);
      },
    }),
  });
}

/**
 * The permission for this handoff and the smart wallet's signature over it. `signRaw` signs a 32-byte hash as the owner.
 * Numbers go out as strings (docs/konto/konto.md, step 3).
 */
export async function signPermission({ owner, signRaw, chainId, spender, token, allowance, nowSec, salt }) {
  const ownerAccount = toAccount({
    address: owner,
    sign: ({ hash }) => signRaw(hash),
    signMessage: () => Promise.reject(new Error("not used")),
    signTransaction: () => Promise.reject(new Error("not used")),
    signTypedData: (typedData) => signRaw(hashTypedData(typedData)),
  });
  const address = smartWalletAddress(owner);
  const smart = await toCoinbaseSmartAccount({
    client: offlineClient(chainId),
    owners: [ownerAccount, SPEND_PERMISSION_MANAGER],
    ownerIndex: 0,
    version: "1",
    address,
  });
  const permission = {
    account: address,
    spender: spender.toLowerCase(),
    token: token.toLowerCase(),
    allowance: BigInt(allowance),
    period: PERIOD_SECONDS,
    start: nowSec,
    end: END_NEVER,
    salt,
    extraData: "0x",
  };
  const signature = await smart.signTypedData({
    domain: { name: "Spend Permission Manager", version: "1", chainId, verifyingContract: SPEND_PERMISSION_MANAGER },
    types: PERMISSION_TYPES,
    primaryType: "SpendPermission",
    message: permission,
  });
  const strings = { ...permission, allowance: String(permission.allowance), period: String(permission.period), start: String(permission.start), end: String(permission.end), salt: String(permission.salt) };
  return { account: address, permission: strings, signature };
}

/** The hex SHA-256 of a request body, as text: the challenge a Turnkey stamp by passkey signs (their WebAuthn stamper). */
export async function stampChallenge(subtle, body) {
  return new TextEncoder().encode(hex(new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(body)))));
}

/**
 * A stamp of a request body by the passkey that is already on this phone (konto 04): one passkey dialog, the value of the
 * header X-Stamp-WebAuthn. No allowCredentials, so the phone offers the passkey of this site that it has.
 */
export async function passkeyStamp({ get, subtle, rpId, body }) {
  let cred;
  try {
    cred = await get({ publicKey: { rpId, challenge: await stampChallenge(subtle, body), userVerification: "preferred", timeout: 300000 } });
  } catch (err) {
    throw new KontoError("cancelled", err && err.name ? err.name : "passkey not used");
  }
  if (!cred) throw new KontoError("cancelled", "no passkey");
  return JSON.stringify({
    authenticatorData: base64url(new Uint8Array(cred.response.authenticatorData)),
    clientDataJson: base64url(new Uint8Array(cred.response.clientDataJSON)),
    credentialId: base64url(new Uint8Array(cred.rawId)),
    signature: base64url(new Uint8Array(cred.response.signature)),
  });
}

/**
 * The step limit (goals/konto/04): the account exists, so there is no signup. Its passkey stamps one request to Turnkey that
 * signs the hash of the new permission with the wallet of the account (`owner`, as Turnkey wrote it, in the group `org`).
 * Returns the body of POST /h/{code}/limit. Throws KontoError with the reason the page shows.
 */
export async function runLimit(deps, page) {
  const { get, fetch: fetchFn, subtle, random, now, rpId } = deps;
  if (!/^0x[0-9a-fA-F]{40}$/.test(page.spender || "") || !/^0x[0-9a-fA-F]{40}$/.test(page.token || "") || !/^[0-9]+$/.test(page.limit || "")) {
    throw new KontoError("unreachable", "page data incomplete");
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(page.owner || "") || !page.org || !/^0x[0-9a-fA-F]{40}$/.test(page.account || "")) {
    throw new KontoError("unreachable", "the account has no passkey on record");
  }
  const owner = page.owner.toLowerCase();
  if (smartWalletAddress(owner) !== page.account.toLowerCase()) throw new KontoError("refused", "the passkey wallet does not own this account");
  const nowMs = now();
  const signRaw = async (hash) => {
    const body = JSON.stringify({
      type: "ACTIVITY_TYPE_SIGN_RAW_PAYLOAD_V2",
      timestampMs: String(now()),
      organizationId: page.org,
      parameters: { signWith: page.owner, payload: hash, encoding: "PAYLOAD_ENCODING_HEXADECIMAL", hashFunction: "HASH_FUNCTION_NO_OP" },
    });
    const stamp = await passkeyStamp({ get, subtle, rpId, body });
    const data = await postJson(fetchFn, `${TURNKEY_API_URL}/public/v1/submit/sign_raw_payload`, { "X-Stamp-WebAuthn": stamp }, body);
    const result = data.activity && data.activity.status === "ACTIVITY_STATUS_COMPLETED" && data.activity.result
      ? data.activity.result.signRawPayloadResult : null;
    if (!result || !/^[0-9a-fA-F]{1,64}$/.test(result.r) || !/^[0-9a-fA-F]{1,64}$/.test(result.s)) {
      throw new KontoError("unreachable", `no signature from the wallet (${data.activity ? data.activity.status : "no activity"})`);
    }
    const v = Number.parseInt(String(result.v), 16);
    return `0x${result.r.padStart(64, "0")}${result.s.padStart(64, "0")}${v === 0 || v === 27 ? "1b" : "1c"}`;
  };
  const signed = await signPermission({
    owner,
    signRaw,
    chainId: page.chainId,
    spender: page.spender,
    token: page.token,
    allowance: page.limit,
    nowSec: Math.floor(nowMs / 1000),
    salt: BigInt(`0x${hex(random(32))}`),
  });
  return { body: signed };
}

/**
 * The whole step: passkey, signup, signature. Returns the body of POST /h/{code}/konto and, for the run on Base Sepolia, the
 * Turnkey wallet that owns the account. Throws KontoError with the reason the page shows.
 */
export async function runKonto(deps, page) {
  const { create, fetch: fetchFn, subtle, random, now, rpId } = deps;
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  if (!page.proxyId) throw new KontoError("unreachable", "no Auth Proxy configured");
  if (!/^0x[0-9a-fA-F]{40}$/.test(page.spender || "") || !/^0x[0-9a-fA-F]{40}$/.test(page.token || "") || !/^[0-9]+$/.test(page.limit || "")) {
    throw new KontoError("unreachable", "page data incomplete");
  }
  const nowMs = now();
  const key = await sessionKey(subtle);
  const passkey = await createPasskey({ create, random, rpId, name: `PostYourPrice ${new Date(nowMs).toISOString().slice(0, 10)}` });
  const { organizationId, owner, wallet } = await signup({ fetch: fetchFn, proxyId: page.proxyId, passkey, sessionPublicKey: key.publicKey, nowMs });
  const salt = BigInt(`0x${hex(random(32))}`);
  const signed = await signPermission({
    owner,
    signRaw: (hash) => signHash({ fetch: fetchFn, key, organizationId, signWith: wallet, hash, now, sleep }),
    chainId: page.chainId,
    spender: page.spender,
    token: page.token,
    allowance: page.limit,
    nowSec: Math.floor(nowMs / 1000),
    salt,
  });
  // The passkey wallet as Turnkey wrote it and its group, so that a raise of the limit can ask the same passkey (konto 04).
  return { body: { ...signed, owner: wallet, organization_id: organizationId }, owner, organizationId };
}
