/**
 * goals/konto/05, point 7: a failure of the RPC while the signature is checked no longer burns the handoff. The route answers 503
 * signature_check_unavailable, the handoff stays matched, the old permission holds, and the same body sent again once the chain
 * answers ends it as if nothing had happened. A signature that the chain says no to still burns it.
 *
 * The smart wallet of these tests is owned by a plain key (test/money-helpers.ts, walletChain), so viem's fallback to ecrecover
 * cannot say yes on its own and only the chain decides, as for a real smart wallet.
 */
import { describe, expect, it } from "vitest";
import {
  createPublicClient,
  custom,
  decodeAbiParameters,
  erc6492SignatureValidatorByteCode,
  hashTypedData,
  HttpRequestError,
  parseErc6492Signature,
  recoverAddress,
  type Hex,
  type PublicClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { SEPOLIA_USDC } from "../src/konto/config.js";
import { permissionFromJson } from "../src/konto/account.js";
import { SignatureCheckUnavailable, signatureValid, type SpendPermission } from "../src/konto/permission.js";
// @ts-expect-error plain browser module without types
import * as flow from "../src/public/konto-client/flow.mjs";
// @ts-expect-error plain browser module without types
import { wirePage } from "../src/public/konto-client/main.mjs";
import { ATLAS, create, post, START, tap } from "./handoff-helpers.js";
import { account, allEvents, DAY, json, moneySetup, payoutPermission, readKonto, START_SEC, signed, stateOf, toPasskey } from "./money-helpers.js";

const kontoBody = async (s: ReturnType<typeof moneySetup>) => {
  const owner = privateKeyToAccount(generatePrivateKey());
  const wallet = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  s.verify.owners.set(wallet, owner.address.toLowerCase());
  const body = await signed(owner, {
    account: wallet,
    spender: s.gas.address.toLowerCase(),
    token: SEPOLIA_USDC,
    allowance: 5_000_000n,
    period: DAY,
    start: START_SEC,
    end: START_SEC + 365 * DAY,
    salt: 7n,
  });
  return { owner, wallet, body: { account: wallet, owner: owner.address, organization_id: "org-test-1", ...body } };
};

describe("a signature the chain could not check", () => {
  it("answers 503 signature_check_unavailable on step konto while the chain is down, and the handoff stays matched", async () => {
    const s = moneySetup();
    const h = await create(s.app, { ...ATLAS, step: "konto" });
    await tap(s.app, h.code, h.match);
    const { body } = await kontoBody(s);
    s.verify.mode.down = true;
    const res = await json(s, `/h/${h.code}/konto`, body);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "signature_check_unavailable" });
    expect(stateOf(s, h.code)).toBe("matched");
    expect(s.db.prepare("SELECT count(*) AS n FROM konto_accounts").get()).toEqual({ n: 0 });
    // The retry page of the phone renders for exactly this handoff.
    const retry = await s.app.request(`/h/${h.code}/retry`);
    expect(retry.status).toBe(200);
    const html = await retry.text();
    expect(html).toContain('data-soll="retry"');
    expect(html).toContain('id="konto-retry"');
  });

  it("ends done with the same body once the chain answers, and the stream carries the API key exactly once", async () => {
    const s = moneySetup();
    const h = await create(s.app, { ...ATLAS, step: "konto" });
    await tap(s.app, h.code, h.match);
    const { body, wallet } = await kontoBody(s);
    s.verify.mode.down = true;
    expect((await json(s, `/h/${h.code}/konto`, body)).status).toBe(503);
    s.verify.mode.down = false;
    const again = await json(s, `/h/${h.code}/konto`, body);
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ state: "done", account: wallet });
    const events = await allEvents(await s.app.request(`/v1/handoff/${h.code}`, { headers: { authorization: `Bearer ${h.poll_token}` } }));
    expect(events.filter((e) => e.api_key)).toHaveLength(1);
    const second = await allEvents(await s.app.request(`/v1/handoff/${h.code}`, { headers: { authorization: `Bearer ${h.poll_token}` } }));
    expect(second.filter((e) => e.api_key)).toHaveLength(0);
    // One account, one key: the retry made no second one.
    expect(s.db.prepare("SELECT count(*) AS n FROM konto_accounts").get()).toEqual({ n: 1 });
    expect(s.db.prepare("SELECT count(*) AS n FROM api_keys WHERE address = ?").get(wallet)).toEqual({ n: 1 });
  });

  it("still refuses a signature the chain says no to with 400 and burns the handoff", async () => {
    const s = moneySetup();
    const h = await create(s.app, { ...ATLAS, step: "konto" });
    await tap(s.app, h.code, h.match);
    const { body, wallet } = await kontoBody(s);
    // Another key owns the wallet now: the chain answers, and it answers no.
    s.verify.owners.set(wallet, privateKeyToAccount(generatePrivateKey()).address.toLowerCase());
    const res = await json(s, `/h/${h.code}/konto`, body);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "permission_refused" });
    expect(stateOf(s, h.code)).toBe("burned");
    // signatureValid itself: false when the chain says no, SignatureCheckUnavailable when it cannot be asked.
    const p = { ...body.permission, allowance: BigInt(body.permission.allowance as string), salt: BigInt(body.permission.salt as string) } as unknown as SpendPermission;
    expect(await signatureValid(s.verify.client, 84532, p, body.signature)).toBe(false);
    s.verify.mode.down = true;
    await expect(signatureValid(s.verify.client, 84532, p, body.signature)).rejects.toBeInstanceOf(SignatureCheckUnavailable);
  });

  it("answers 503 on step limit while the chain is down, the handoff stays matched and the old permission holds", async () => {
    const s = moneySetup();
    const a = await account(s);
    const before = readKonto(s, a.address);
    const res = await post(s.app, { automaton_name: "Atlas", daily_limit_usdc: "10000000", step: "limit" }, { authorization: `Bearer ${a.key}` });
    expect(res.status).toBe(201);
    const h = (await res.json()) as { code: string; match: number };
    await tap(s.app, h.code, h.match);
    const body = await signed(a.owner, {
      account: a.address,
      spender: s.gas.address.toLowerCase(),
      token: SEPOLIA_USDC,
      allowance: 10_000_000n,
      period: DAY,
      start: START_SEC,
      end: START_SEC + 365 * DAY,
      salt: 8n,
    });
    s.verify.mode.down = true;
    const down = await json(s, `/h/${h.code}/limit`, body);
    expect(down.status).toBe(503);
    expect(await down.json()).toMatchObject({ error: "signature_check_unavailable" });
    expect(stateOf(s, h.code)).toBe("matched");
    expect(readKonto(s, a.address)).toEqual(before);
    expect(before.next_permission).toBeNull();
    s.verify.mode.down = false;
    const up = await json(s, `/h/${h.code}/limit`, body);
    expect(up.status).toBe(200);
    expect(permissionFromJson(readKonto(s, a.address).next_permission!).salt).toBe(8n);
  });

  it("answers 503 on the passkey step of a payout while the chain is down, and the payout permission before it holds", async () => {
    const s = moneySetup();
    const a = await account(s);
    // A first payout setup, so that a second one has something to keep.
    const first = await toPasskey(s, a);
    expect((await json(s, `/h/${first.h.code}/payout`, await payoutPermission(a.owner, a.address, first.spender, { salt: 98n }))).status).toBe(200);
    const before = s.db.prepare("SELECT * FROM konto_payouts WHERE address = ?").get(a.address);
    const next = await toPasskey(s, a);
    const body = await payoutPermission(a.owner, a.address, next.spender);
    s.verify.mode.down = true;
    const down = await json(s, `/h/${next.h.code}/payout`, body);
    expect(down.status).toBe(503);
    expect(await down.json()).toMatchObject({ error: "signature_check_unavailable" });
    expect(stateOf(s, next.h.code)).toBe("matched");
    expect(s.db.prepare("SELECT * FROM konto_payouts WHERE address = ?").get(a.address)).toEqual(before);
    expect((await s.app.request(`/h/${next.h.code}/retry`)).status).toBe(200);
    s.verify.mode.down = false;
    const up = await json(s, `/h/${next.h.code}/payout`, body);
    expect(up.status).toBe(200);
    expect(stateOf(s, next.h.code)).toBe("done");
  });

it("the page client shows retry after a 503, sends the same signature on the tap and calls signUpWithPasskey exactly once", async () => {
  const verifier = smartWalletChain();
  const s = moneySetup({ konto: { verifyClient: verifier.client, authProxyId: "proxy-config-1" } });
  const turnkey = signupTurnkey();
  verifier.owners.set(turnkey.wallet, turnkey.owner.address.toLowerCase());
  const h = await create(s.app, { ...ATLAS, step: "konto" });
  const passkeyHtml = await (await tap(s.app, h.code, h.match)).text();
  const phone = phoneOf(s, turnkey);

  // The tap on the passkey step while the chain is down: one passkey, one signup, and the page goes to the retry page.
  verifier.mode.down = true;
  await phone.open(passkeyHtml).tap("konto-passkey");
  expect(phone.assigned).toEqual([`/h/${h.code}/retry`]);
  expect(stateOf(s, h.code)).toBe("matched");
  expect(phone.storage.has(`konto-retry:${h.code}`)).toBe(true);

  // The retry page, as the server renders it, and the tap there once the chain answers again.
  const retry = await s.app.request(`/h/${h.code}/retry`);
  expect(retry.status).toBe(200);
  verifier.mode.down = false;
  await phone.open(await retry.text()).tap("konto-retry");
  expect(phone.replaced).toEqual([`/h/${h.code}`]);
  expect(stateOf(s, h.code)).toBe("done");
  expect(phone.storage.size).toBe(0);
  expect(phone.failed).toEqual([]);

  // The same body twice, byte for byte, and exactly one passkey and one signup for both.
  const sent = phone.posts.filter((p) => p.url === `/h/${h.code}/konto`);
  expect(sent).toHaveLength(2);
  expect(sent[1].body).toBe(sent[0].body);
  expect(JSON.parse(sent[1].body).signature).toBe(JSON.parse(sent[0].body).signature);
  expect(phone.passkeysCreated).toBe(1);
  expect(turnkey.calls.filter((u) => u === "https://authproxy.turnkey.com/v1/signup_v2")).toHaveLength(1);
  expect(s.db.prepare("SELECT count(*) AS n FROM konto_accounts").get()).toEqual({ n: 1 });
});
});

/**
 * A chain that checks the ERC-6492 signature of a smart wallet that does not exist yet the way the factory would: the inner
 * signature is the owner's over the replay-safe hash of the wallet. `mode.down` makes every request fail like an RPC with 503.
 */
function smartWalletChain() {
  const owners = new Map<string, string>();
  const mode = { down: false };
  const client = createPublicClient({
    chain: baseSepolia,
    transport: custom(
      {
        async request({ method, params }: { method: string; params?: unknown[] }) {
          if (mode.down) throw new HttpRequestError({ url: "https://sepolia.base.org", status: 503, body: { method } });
          if (method !== "eth_call") throw new Error(`unexpected ${method}`);
          const data = (params?.[0] as { data: Hex }).data;
          const [wallet, hash, signature] = decodeAbiParameters(
            [{ type: "address" }, { type: "bytes32" }, { type: "bytes" }],
            `0x${data.slice(erc6492SignatureValidatorByteCode.length)}` as Hex,
          );
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
          const signer = (await recoverAddress({ hash: replaySafe, signature: inner.signatureData })).toLowerCase();
          return owners.get(wallet.toLowerCase()) === signer ? "0x01" : "0x00";
        },
      },
      { retryCount: 0 },
    ),
  }) as unknown as PublicClient;
  return { owners, mode, client };
}

/** Turnkey as far as the signup of konto 03 uses it: the Auth Proxy creates the group and its wallet, the wallet signs. */
function signupTurnkey() {
  const owner = privateKeyToAccount(generatePrivateKey());
  const calls: string[] = [];
  const fetch = async (url: string, init: { body: string }) => {
    calls.push(url);
    const reply = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
    if (url === "https://authproxy.turnkey.com/v1/signup_v2") {
      return reply({ organizationId: "sub-org-1", userId: "user-1", wallet: { walletId: "w-1", addresses: [owner.address] } });
    }
    if (url === "https://api.turnkey.com/public/v1/submit/sign_raw_payload") {
      const sig = await owner.sign({ hash: (JSON.parse(init.body).parameters as { payload: Hex }).payload });
      const v = parseInt(sig.slice(130, 132), 16) === 27 ? "00" : "01";
      return reply({ activity: { id: "a-1", status: "ACTIVITY_STATUS_COMPLETED", result: { signRawPayloadResult: { r: sig.slice(2, 66), s: sig.slice(66, 130), v } } } });
    }
    return new Response("{}", { status: 404 });
  };
  return { owner, calls, fetch, wallet: flow.smartWalletAddress(owner.address.toLowerCase()) as string };
}

/** The buttons of a page as the script sees them: id and data attributes, read from the HTML the server sent. */
function buttonsOf(html: string) {
  const found = new Map<string, { dataset: Record<string, string>; disabled: boolean; listeners: (() => Promise<void> | void)[]; addEventListener: (t: string, f: () => Promise<void>) => void }>();
  for (const [tag] of html.matchAll(/<button[^>]*\bid="[^"]+"[^>]*>/g)) {
    const id = /\bid="([^"]+)"/.exec(tag)![1];
    const dataset: Record<string, string> = {};
    for (const m of tag.matchAll(/\bdata-([a-z-]+)="([^"]*)"/g)) dataset[m[1].replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = m[2];
    const button = { dataset, disabled: false, listeners: [] as (() => Promise<void> | void)[], addEventListener: (_t: string, f: () => Promise<void>) => { button.listeners.push(f); } };
    found.set(id, button);
  }
  return found;
}

/** One phone tab: the script of the page (main.mjs) over the pages the server sends, sessionStorage kept across them. */
function phoneOf(s: ReturnType<typeof moneySetup>, turnkey: ReturnType<typeof signupTurnkey>) {
  const storage = new Map<string, string>();
  const phone = {
    storage,
    assigned: [] as string[],
    replaced: [] as string[],
    failed: [] as string[],
    posts: [] as { url: string; body: string }[],
    passkeysCreated: 0,
    open(html: string) {
      const buttons = buttonsOf(html);
      const element = () => {
        const el: Record<string, unknown> & { children: unknown[] } = { children: [], append: (c: unknown) => el.children.push(c) };
        el.submit = () => phone.failed.push(String(el.action));
        return el;
      };
      wirePage({
        document: { getElementById: (id: string) => buttons.get(id) ?? null, createElement: element, body: { append: () => {} } },
        location: { hostname: "localhost", assign: (u: string) => phone.assigned.push(u), replace: (u: string) => phone.replaced.push(u) },
        storage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) },
        console: { error: () => {} },
        create: async () => {
          phone.passkeysCreated++;
          return {
            rawId: new Uint8Array([1, 2, 3, 4]).buffer,
            response: { clientDataJSON: new TextEncoder().encode("{}").buffer, attestationObject: new Uint8Array([9]).buffer, getTransports: () => ["internal"] },
          };
        },
        get: async () => { throw new Error("no existing passkey on this phone"); },
        fetch: async (url: string, init: { body: string }) => {
          if (url.startsWith("/h/")) {
            phone.posts.push({ url, body: init.body });
            return s.app.request(url, init as RequestInit);
          }
          return turnkey.fetch(url, init);
        },
        subtle: globalThis.crypto.subtle,
        random: (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n)),
        now: () => START,
        rpId: "localhost",
        sleep: async () => {},
        open: () => {},
      });
      return {
        async tap(id: string) {
          const button = buttons.get(id);
          expect(button, `no button ${id} on the page`).toBeTruthy();
          for (const listener of button!.listeners) await listener();
        },
      };
    },
  };
  return phone;
}
