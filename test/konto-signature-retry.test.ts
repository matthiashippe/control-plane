/**
 * goals/konto/05, point 7: a failure of the RPC while the signature is checked no longer burns the handoff. The route answers 503
 * signature_check_unavailable, the handoff stays matched, the old permission holds, and the same body sent again once the chain
 * answers ends it as if nothing had happened. A signature that the chain says no to still burns it.
 *
 * The smart wallet of these tests is owned by a plain key (test/money-helpers.ts, walletChain), so viem's fallback to ecrecover
 * cannot say yes on its own and only the chain decides, as for a real smart wallet.
 */
import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SEPOLIA_USDC } from "../src/konto/config.js";
import { permissionFromJson } from "../src/konto/account.js";
import { SignatureCheckUnavailable, signatureValid, type SpendPermission } from "../src/konto/permission.js";
import { ATLAS, create, post, tap } from "./handoff-helpers.js";
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

  // The sixth case of point 7 (the page client shows `retry` after a 503, sends the same signature on the tap and calls
  // signUpWithPasskey exactly once) belongs to the script of the page under src/public/konto-client/ and is added here by the
  // maker together with that script.
});
