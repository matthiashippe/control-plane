/**
 * goals/konto/13, points 3 and 4: the page client signs as the revoke of an earlier permission only the user operation it builds
 * itself from data-revoke-permission and the nonce, and only for a payout permission of this account. A data-revoke-hash of the
 * page is a cross-check: when it differs from the hash the client built, nothing is signed and nothing is sent. On the real
 * payout-passkey page client and server mean the same revoke.
 */
import { describe, expect, it } from "vitest";
import { recoverAddress, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { permissionFromJson, permissionJson } from "../src/konto/account.js";
import { SEPOLIA_USDC } from "../src/konto/config.js";
import { parsePermission, type SpendPermission } from "../src/konto/permission.js";
import { payoutPermissionMatches, readPayout, revokeHash } from "../src/konto/payout.js";
import { esc } from "../src/public/market.js";
// @ts-expect-error plain browser module without types
import * as flow from "../src/public/konto-client/flow.mjs";
// @ts-expect-error plain browser module without types
import { wirePage } from "../src/public/konto-client/main.mjs";
import { ATLAS, create, START, tap } from "./handoff-helpers.js";
import { buttonOf, deps, fakePasskey, fakeTurnkey, SIGN_MANY, smartWalletChain } from "./konto-client-helpers.js";
import { allEvents, DAY, dataOf, moneySetup, payoutPermission, signed, START_SEC, stateOf, toPasskey, type MoneySetup } from "./money-helpers.js";

const NOW_SEC = Math.floor(START / 1000);

/** A payout permission of `account` as the row keeps it: some forwarder, USDC, no cap, 30 days, no end. */
function payoutOf(account: string, over: Partial<SpendPermission> = {}): SpendPermission {
  return {
    account: account.toLowerCase() as Hex,
    spender: privateKeyToAccount(generatePrivateKey()).address.toLowerCase() as Hex,
    token: SEPOLIA_USDC as Hex,
    allowance: 2n ** 160n - 1n,
    period: 2_592_000,
    start: NOW_SEC - DAY,
    end: 2 ** 48 - 1,
    salt: 99n,
    extraData: "0x",
    ...over,
  };
}

/**
 * The phone on a payout-passkey button with the given data: the script of the page wired to it, Turnkey for `org-1`, the posts
 * to our own address answered 200. Returns what happened after one tap.
 */
async function tapPayout(extra: (account: string) => { permission?: SpendPermission; nonce?: string; hash?: string }) {
  const passkey = fakePasskey();
  const turnkey = fakeTurnkey(passkey, "org-1");
  const owner = turnkey.owner;
  const account = (flow.smartWalletAddress(owner.address.toLowerCase()) as string).toLowerCase();
  const spender = privateKeyToAccount(generatePrivateKey()).address;
  const posts: { url: string; body: string }[] = [];
  const fetch = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    if (!url.startsWith("/h/")) return turnkey.fetch(url, init);
    posts.push({ url, body: init.body });
    return new Response('{"state":"done"}', { status: 200 });
  };
  const e = extra(account);
  const data = [
    e.permission ? `data-revoke-permission="${esc(permissionJson(e.permission))}"` : "",
    e.hash ? `data-revoke-hash="${e.hash}"` : "",
    e.nonce ? `data-revoke-nonce="${e.nonce}"` : "",
  ].join(" ");
  const html = `<button class="btn btn-1" type="button" id="konto-passkey" data-mode="payout" data-code="AB12" data-chain="84532" data-spender="${spender}" data-token="${SEPOLIA_USDC}" data-account="${account}" data-owner="${owner.address}" data-org="org-1" ${data}>`;
  const button = buttonOf(html, "konto-passkey")!;
  const replaced: string[] = [];
  const failed: string[] = [];
  wirePage({
    ...deps(passkey, fetch),
    document: {
      getElementById: (id: string) => (id === "konto-passkey" ? button : null),
      createElement: () => ({ append: () => {}, submit: () => failed.push("submit") }),
      body: { append: () => {} },
    },
    location: { hostname: "localhost", assign: () => {}, replace: (u: string) => replaced.push(u) },
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    console: { error: (m: string) => failed.push(m) },
  });
  for (const listener of button.listeners) await listener();
  return { passkey, turnkey, owner, account, spender, posts, replaced, failed };
}

/** An account of konto 03 whose smart wallet is the one of `owner` as the page client computes it, and its API key. */
async function smartAccount(s: MoneySetup, chain: ReturnType<typeof smartWalletChain>, owner: ReturnType<typeof privateKeyToAccount>) {
  const wallet = (flow.smartWalletAddress(owner.address.toLowerCase()) as string).toLowerCase();
  chain.owners.set(wallet, owner.address.toLowerCase());
  s.verify.owners.set(wallet, owner.address.toLowerCase());
  const h = await create(s.app, { ...ATLAS, step: "konto" });
  await tap(s.app, h.code, h.match);
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
  const res = await s.app.request(`/h/${h.code}/konto`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account: wallet, owner: owner.address, organization_id: "org-test-1", ...body }),
  });
  expect(res.status).toBe(200);
  const done = (await allEvents(await s.app.request(`/v1/handoff/${h.code}`, { headers: { authorization: `Bearer ${h.poll_token}` } }))).at(-1)!;
  expect(done.state).toBe("done");
  return { owner, address: wallet, key: done.api_key };
}

describe("the client signs only the revoke it builds itself", () => {
  it("signs the hash of the revoke it builds from data-revoke-permission and the nonce", async () => {
    let earlier: SpendPermission | null = null;
    const r = await tapPayout((account) => {
      earlier = payoutOf(account);
      return { permission: earlier, nonce: "3" };
    });
    expect(r.failed).toEqual([]);
    expect(r.passkey.used()).toBe(1);
    expect(r.turnkey.calls.map((c) => c.url)).toEqual([SIGN_MANY]);
    const activity = r.turnkey.calls[0].body as { type: string; parameters: { payloads: Hex[] } };
    expect(activity.type).toBe("ACTIVITY_TYPE_SIGN_RAW_PAYLOADS");
    const want = revokeHash(earlier!, 3n, 84532);
    expect(activity.parameters.payloads).toHaveLength(2);
    expect(activity.parameters.payloads[1]).toBe(want);
    expect(r.posts.map((p) => p.url)).toEqual(["/h/AB12/payout"]);
    expect(r.replaced).toEqual(["/h/AB12"]);
    const body = JSON.parse(r.posts[0].body) as { permission: unknown; revoke: { nonce: string; signature: Hex } };
    expect(body.revoke.nonce).toBe("3");
    expect((await recoverAddress({ hash: want, signature: body.revoke.signature })).toLowerCase()).toBe(r.owner.address.toLowerCase());
    expect(payoutPermissionMatches(parsePermission(body.permission)!, { account: r.account, forwarder: r.spender, token: SEPOLIA_USDC, nowSec: NOW_SEC })).toBe(true);
  });

  it("signs nothing when the page carries another hash than the one it builds", async () => {
    const other = `0x${"ab".repeat(32)}`;
    const r = await tapPayout((account) => ({ permission: payoutOf(account), nonce: "3", hash: other }));
    expect(r.passkey.used()).toBe(0);
    expect(r.turnkey.calls).toEqual([]);
    expect(r.posts).toEqual([]);
    expect(r.replaced).toEqual([]);
    expect(r.failed).toContain("submit");
  });

  it("signs nothing for a permission of another account or of the daily limit", async () => {
    const stranger = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    const foreign = await tapPayout(() => {
      const p = payoutOf(stranger);
      return { permission: p, nonce: "3", hash: revokeHash(p, 3n, 84532) };
    });
    const limit = await tapPayout((account) => {
      const p = payoutOf(account, { allowance: 5_000_000n, period: DAY, end: START_SEC + 365 * DAY });
      return { permission: p, nonce: "3", hash: revokeHash(p, 3n, 84532) };
    });
    for (const r of [foreign, limit]) {
      expect(r.passkey.used()).toBe(0);
      expect(r.turnkey.calls).toEqual([]);
      expect(r.posts).toEqual([]);
      expect(r.replaced).toEqual([]);
      expect(r.failed).toContain("submit");
    }
  });

  it("agrees with the server on the real payout-passkey page and ends the setup", async () => {
    const chain = smartWalletChain();
    const s = moneySetup({ konto: { verifyClient: chain.client } });
    const passkey = fakePasskey();
    const turnkey = fakeTurnkey(passkey, "org-test-1");
    const a = await smartAccount(s, chain, turnkey.owner);
    // The first setup, signed as test/money-helpers.ts does; its permission is the one the second one replaces.
    const first = await toPasskey(s, a);
    const done = await s.app.request(`/h/${first.h.code}/payout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(await payoutPermission(a.owner, a.address, first.spender)),
    });
    expect(done.status).toBe(200);
    const p1 = readPayout(s.db, a.address)!.permission!;

    const second = await toPasskey(s, a);
    // The page of state payout-passkey: the passkey button of the payout, with the revoke of the earlier permission.
    expect(dataOf(second.html, "konto-passkey", "mode")).toBe("payout");
    expect(dataOf(second.html, "konto-passkey", "revoke-hash")).toMatch(/^0x[0-9a-f]{64}$/);
    const button = buttonOf(second.html, "konto-passkey")!;
    const posts: { url: string; body: string; status: number }[] = [];
    const fetch = async (url: string, init: { headers: Record<string, string>; body: string }) => {
      if (!url.startsWith("/h/")) return turnkey.fetch(url, init);
      const res = await s.app.request(url, init as RequestInit);
      posts.push({ url, body: init.body, status: res.status });
      return res;
    };
    const replaced: string[] = [];
    const failed: string[] = [];
    wirePage({
      ...deps(passkey, fetch),
      document: {
        getElementById: (id: string) => (id === "konto-passkey" ? button : null),
        createElement: () => ({ append: () => {}, submit: () => failed.push("submit") }),
        body: { append: () => {} },
      },
      location: { hostname: "localhost", assign: () => {}, replace: (u: string) => replaced.push(u) },
      storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      console: { error: (m: string) => failed.push(m) },
    });
    for (const listener of button.listeners) await listener();

    expect(failed).toEqual([]);
    expect(passkey.used()).toBe(1);
    expect(posts.map((p) => [p.url, p.status])).toEqual([[`/h/${second.h.code}/payout`, 200]]);
    expect(replaced).toEqual([`/h/${second.h.code}`]);
    expect(stateOf(s, second.h.code)).toBe("done");
    const body = JSON.parse(posts[0].body) as { revoke: { nonce: string; signature: Hex } };
    const row = readPayout(s.db, a.address)!;
    expect(row.retire_permission).toBe(p1);
    expect(JSON.parse(row.retire_revoke!)).toEqual({ nonce: body.revoke.nonce, signature: body.revoke.signature });
    const hash = revokeHash(permissionFromJson(p1), BigInt(body.revoke.nonce), 84532);
    expect(dataOf(second.html, "konto-passkey", "revoke-hash")).toBe(hash);
    expect((await recoverAddress({ hash, signature: body.revoke.signature })).toLowerCase()).toBe(turnkey.owner.address.toLowerCase());
  });
});
