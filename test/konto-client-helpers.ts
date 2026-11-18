/**
 * The phone and Turnkey as the page client of /h/{code} meets them (goals/konto/05, 11 and 13): a passkey that stamps like
 * WebAuthn, Turnkey that checks the stamp and signs with the wallet of the account, the buttons of a page as the script reads
 * them, and a chain that checks the signatures of the account's smart wallet. Shared by test/konto-client-deposit.test.ts and
 * test/konto-client-revoke.test.ts.
 */
import { createHash, generateKeyPairSync, sign as nodeSign, verify } from "node:crypto";
import {
  createPublicClient,
  custom,
  decodeAbiParameters,
  erc6492SignatureValidatorByteCode,
  hashTypedData,
  parseErc6492Signature,
  recoverAddress,
  type Hex,
  type PublicClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { START } from "./handoff-helpers.js";

export const ONRAMP = "https://api.turnkey.com/public/v1/submit/init_fiat_on_ramp";
export const SIGN = "https://api.turnkey.com/public/v1/submit/sign_raw_payload";
export const SIGN_MANY = "https://api.turnkey.com/public/v1/submit/sign_raw_payloads";
export const CARD_PAGE = "https://buy.moonpay.example/?txn=onramp-1";
const b64url = (b: Uint8Array | Buffer) => Buffer.from(b).toString("base64url");

/** The passkey on the phone: a P-256 key that signs authenticatorData || SHA-256(clientDataJSON), as WebAuthn does. */
export function fakePasskey() {
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
export function fakeTurnkey(passkey: ReturnType<typeof fakePasskey>, org: string, owner = privateKeyToAccount(generatePrivateKey())) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const isOwner = (signWith: string) => signWith.toLowerCase() === owner.address.toLowerCase();
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
      if (!isOwner(p.signWith)) return reply(404, { message: "no such wallet" });
      const sig = await owner.sign({ hash: p.payload });
      const v = parseInt(sig.slice(130, 132), 16) === 27 ? "00" : "01";
      return reply(200, { activity: { id: "a-1", status: "ACTIVITY_STATUS_COMPLETED", result: { signRawPayloadResult: { r: sig.slice(2, 66), s: sig.slice(66, 130), v } } } });
    }
    if (url === SIGN_MANY) {
      const p = body.parameters as { signWith: string; payloads: Hex[] };
      if (!isOwner(p.signWith)) return reply(404, { message: "no such wallet" });
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

/** What the browser hands the script besides the page: passkey, fetch, crypto and the clock of the handoff tests. */
export const deps = (passkey: ReturnType<typeof fakePasskey>, fetch: unknown, opened: string[] = []) => ({
  get: passkey.get,
  fetch,
  subtle: globalThis.crypto.subtle,
  random: (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n)),
  now: () => START,
  rpId: "localhost",
  open: (url: string) => opened.push(url),
});

/** The text of an attribute as the browser hands it to the script: the entities the server escaped with, decoded. */
const unescape = (v: string) =>
  v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** The button `id` of a page as the script sees it: its data attributes, read from the HTML the server sent. */
export function buttonOf(html: string, id: string) {
  const tag = new RegExp(`<button[^>]*\\bid="${id}"[^>]*>`).exec(html)?.[0];
  if (!tag) return null;
  const dataset: Record<string, string> = {};
  for (const m of tag.matchAll(/\bdata-([a-z-]+)="([^"]*)"/g)) dataset[m[1].replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = unescape(m[2]);
  const listeners: (() => Promise<void>)[] = [];
  return { dataset, disabled: false, listeners, addEventListener: (_t: string, f: () => Promise<void>) => listeners.push(f) };
}

/**
 * A chain on which `owners` maps smart wallets to the key that owns them, and eth_call of the ERC-6492 validator says whether that
 * key signed: either as the smart wallet's own signature of the page client (ERC-6492 around SignatureWrapper, the owner's
 * signature over the replay-safe hash) or as a plain signature of the owner over the hash, as test/money-helpers.ts sends it.
 */
export function smartWalletChain() {
  const owners = new Map<string, string>();
  const client = createPublicClient({
    chain: baseSepolia,
    transport: custom(
      {
        async request({ method, params }: { method: string; params?: unknown[] }) {
          if (method !== "eth_call") throw new Error(`unexpected ${method}`);
          const data = (params?.[0] as { data: Hex }).data;
          const [wallet, hash, signature] = decodeAbiParameters(
            [{ type: "address" }, { type: "bytes32" }, { type: "bytes" }],
            `0x${data.slice(erc6492SignatureValidatorByteCode.length)}` as Hex,
          );
          const owner = owners.get(wallet.toLowerCase());
          const signers: string[] = [];
          try {
            const [inner] = decodeAbiParameters(
              [{ type: "tuple", components: [{ name: "ownerIndex", type: "uint8" }, { name: "signatureData", type: "bytes" }] }],
              parseErc6492Signature(signature).signature,
            ) as [{ ownerIndex: number; signatureData: Hex }];
            const replaySafe = hashTypedData({
              domain: { name: "Coinbase Smart Wallet", version: "1", chainId: 84532, verifyingContract: wallet },
              types: { CoinbaseSmartWalletMessage: [{ name: "hash", type: "bytes32" }] },
              primaryType: "CoinbaseSmartWalletMessage",
              message: { hash },
            });
            signers.push((await recoverAddress({ hash: replaySafe, signature: inner.signatureData })).toLowerCase());
          } catch {
            // not a signature of the smart wallet; the plain one below may still be the owner's
          }
          await recoverAddress({ hash, signature }).then((a) => signers.push(a.toLowerCase()), () => {});
          return Boolean(owner) && signers.includes(owner!) ? "0x01" : "0x00";
        },
      },
      { retryCount: 0 },
    ),
  }) as unknown as PublicClient;
  return { owners, client };
}
