/**
 * goals/konto/03, Punkt 6: a handoff with step "konto" ends `done` only with a matching, validly signed spend permission; the
 * terminal gets the account and its API key exactly once, and the database keeps the key only as a hash.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createPublicClient, custom, type Hex, type PublicClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { hashApiKey } from "../src/auth/siwe.js";
import type { KontoDeps } from "../src/handoff/routes.js";
import { SEPOLIA_USDC } from "../src/konto/config.js";
import { SPEND_PERMISSION_TYPES, spendPermissionDomain } from "../src/konto/permission.js";
import { ATLAS, create, handoffApp, post, tap } from "./handoff-helpers.js";

const KONTO = { ...ATLAS, step: "konto" };
const DAY = 86_400;

/**
 * A chain that is not there: every eth_call fails, so the ERC-6492 check of viem falls back to ecrecover. The account of these
 * tests is a plain key standing in for the smart wallet; the signature path of a real smart wallet runs in harness/e2e/konto-chain.mjs.
 */
const noChain = createPublicClient({ chain: baseSepolia, transport: custom({ request: async () => { throw new Error("no chain in unit tests"); } }), }) as unknown as PublicClient;

const spender = privateKeyToAccount(generatePrivateKey()).address;
const kontoDeps = (over: Partial<KontoDeps> = {}): KontoDeps => ({
  chainId: 84532,
  spender,
  token: SEPOLIA_USDC,
  verifyClient: noChain,
  renderPasskey: (v) => `<!doctype html><p data-step="passkey">${v.automatonName} ${v.code}</p>`,
  ...over,
});

const opened: ReadableStreamDefaultReader<Uint8Array>[] = [];
afterEach(async () => {
  for (const r of opened.splice(0)) await r.cancel().catch(() => {});
});

/** All events of a stream until it ends, each read raced against 10 s. */
async function allEvents(res: Response): Promise<Record<string, string>[]> {
  const reader = res.body!.getReader();
  opened.push(reader);
  let text = "";
  for (;;) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const r = await Promise.race([
      reader.read(),
      new Promise<never>((_, fail) => { timer = setTimeout(() => fail(new Error("stream did not end within 10 s")), 10_000); }),
    ]).finally(() => clearTimeout(timer));
    if (r.done) break;
    text += new TextDecoder().decode(r.value);
  }
  return [...text.matchAll(/^data: (.*)$/gm)].map((m) => JSON.parse(m[1]) as Record<string, string>);
}

function setup(konto: KontoDeps | null = kontoDeps()) {
  return handoffApp({ konto });
}

type App = ReturnType<typeof setup>["app"];

async function matched(app: App) {
  const h = await create(app, KONTO);
  const res = await tap(app, h.code, h.match);
  return { h, res };
}

async function permit(over: Record<string, unknown> = {}, signer = privateKeyToAccount(generatePrivateKey())) {
  const owner = signer;
  const start = Math.floor(Date.parse("2026-11-13T12:00:00Z") / 1000);
  const permission = {
    account: owner.address.toLowerCase() as Hex,
    spender: spender.toLowerCase() as Hex,
    token: SEPOLIA_USDC as Hex,
    allowance: 5_000_000n,
    period: DAY,
    start,
    end: start + 365 * DAY,
    salt: 7n,
    extraData: "0x" as Hex,
    ...over,
  };
  const signature = await owner.signTypedData({
    domain: spendPermissionDomain(84532),
    types: SPEND_PERMISSION_TYPES,
    primaryType: "SpendPermission",
    message: permission as never,
  });
  const json = { ...permission, allowance: String(permission.allowance), salt: String(permission.salt) };
  return { account: permission.account as string, permission: json, signature };
}

const send = (app: App, code: string, body: unknown) =>
  app.request(`/h/${code}/konto`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const stateOf = (db: ReturnType<typeof setup>["db"], code: string) =>
  (db.prepare("SELECT state FROM handoffs WHERE code = ?").get(code) as { state: string }).state;

describe("handoff with step konto", () => {
  it("turns the right number into matched and shows the passkey step", async () => {
    const { app, db } = setup();
    const { h, res } = await matched(app);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('data-step="passkey"');
    expect(stateOf(db, h.code)).toBe("matched");
    const again = await app.request(`/h/${h.code}`);
    expect(again.status).toBe(200);
  });

  it("ends done with a matching permission; the first done event carries account and api_key, a second read none", async () => {
    const { app, db } = setup();
    const { h } = await matched(app);
    const body = await permit();
    const res = await send(app, h.code, body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "done", account: body.account });
    expect(stateOf(db, h.code)).toBe("done");
    const first = await allEvents(await app.request(`/v1/handoff/${h.code}`, { headers: { authorization: `Bearer ${h.poll_token}` } }));
    const done1 = first.find((e) => e.state === "done")!;
    expect(done1.account).toBe(body.account);
    expect(done1.api_key).toMatch(/^cnwy_k_[0-9a-f]{32}$/);
    const second = await allEvents(await app.request(`/v1/handoff/${h.code}`, { headers: { authorization: `Bearer ${h.poll_token}` } }));
    const done2 = second.find((e) => e.state === "done")!;
    expect(done2.account).toBe(body.account);
    expect(done2).not.toHaveProperty("api_key");
    // The key works for the account it was made for.
    const balance = await app.request("/v1/credits/balance", { headers: { authorization: `Bearer ${done1.api_key}` } });
    expect(balance.status).toBe(200);
  });

  it("keeps the key only as a hash once the terminal has read it", async () => {
    const { app, db } = setup();
    const { h } = await matched(app);
    const body = await permit();
    await send(app, h.code, body);
    const events = await allEvents(await app.request(`/v1/handoff/${h.code}`, { headers: { authorization: `Bearer ${h.poll_token}` } }));
    const key = events.find((e) => e.state === "done")!.api_key;
    const dump = JSON.stringify([
      db.prepare("SELECT * FROM handoffs").all(),
      db.prepare("SELECT * FROM api_keys").all(),
      db.prepare("SELECT * FROM sessions").all(),
      db.prepare("SELECT * FROM konto_accounts").all(),
    ]);
    expect(dump).not.toContain(key);
    expect(dump).toContain(hashApiKey(key));
    const row = db.prepare("SELECT address FROM api_keys WHERE key_hash = ?").get(hashApiKey(key)) as { address: string };
    expect(row.address).toBe(body.account);
  });

  async function expectRefused(over: Record<string, unknown>) {
    const { app, db } = setup();
    const { h } = await matched(app);
    const res = await send(app, h.code, await permit(over));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("permission_refused");
    expect(stateOf(db, h.code)).toBe("burned");
    expect(db.prepare("SELECT count(*) AS n FROM api_keys").get()).toEqual({ n: 0 });
  }

  it("refuses a foreign spender with 400 and burns the handoff", async () => {
    await expectRefused({ spender: privateKeyToAccount(generatePrivateKey()).address.toLowerCase() });
  });

  it("refuses another token with 400 and burns the handoff", async () => {
    await expectRefused({ token: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" });
  });

  it("refuses an allowance other than daily_limit_usdc with 400 and burns the handoff", async () => {
    await expectRefused({ allowance: 5_000_001n });
  });

  it("refuses a period other than 86400 with 400 and burns the handoff", async () => {
    await expectRefused({ period: 2 * DAY });
  });

  it("refuses a start more than five minutes ahead with 400 and burns the handoff", async () => {
    await expectRefused({ start: Math.floor(Date.parse("2026-11-13T12:00:00Z") / 1000) + 301 });
  });

  it("refuses a signature that is not the account's with 400 and burns the handoff", async () => {
    const { app, db } = setup();
    const { h } = await matched(app);
    const good = await permit();
    // Signed by another key over the same permission: the right permission, the wrong signer.
    const stranger = privateKeyToAccount(generatePrivateKey());
    const forged = await stranger.signTypedData({
      domain: spendPermissionDomain(84532),
      types: SPEND_PERMISSION_TYPES,
      primaryType: "SpendPermission",
      message: { ...good.permission, allowance: BigInt(good.permission.allowance), salt: BigInt(good.permission.salt) } as never,
    });
    const res = await send(app, h.code, { ...good, signature: forged });
    expect(res.status).toBe(400);
    expect(stateOf(db, h.code)).toBe("burned");
    expect(db.prepare("SELECT count(*) AS n FROM konto_accounts").get()).toEqual({ n: 0 });
  });

  it("answers 409 before the right number, 410 after done and 410 after the ten minutes", async () => {
    const { app, clock } = setup();
    const h = await create(app, KONTO);
    expect((await send(app, h.code, await permit())).status).toBe(409);
    await tap(app, h.code, h.match);
    expect((await send(app, h.code, await permit())).status).toBe(200);
    expect((await send(app, h.code, await permit())).status).toBe(410);
    const late = await create(app, KONTO);
    await tap(app, late.code, late.match);
    clock.now += 600_000;
    expect((await send(app, late.code, await permit())).status).toBe(410);
  });

  it("answers 503 for step konto and for /h/{code}/konto while CP_KONTO_CHAIN_ID is unset", async () => {
    const { app } = setup(null);
    const res = await post(app, KONTO);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("konto_unavailable");
    const h = await create(app, ATLAS);
    expect((await send(app, h.code, await permit())).status).toBe(503);
  });

  it("leaves step confirm and a handoff without step as in konto 02", async () => {
    for (const body of [ATLAS, { ...ATLAS, step: "confirm" }]) {
      const { app, db } = setup();
      const h = await create(app, body);
      const res = await tap(app, h.code, h.match);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("Done. Go back to your terminal.");
      expect(stateOf(db, h.code)).toBe("done");
      const events = await allEvents(await app.request(`/v1/handoff/${h.code}`, { headers: { authorization: `Bearer ${h.poll_token}` } }));
      expect(events.at(-1)).toEqual({ state: "done" });
    }
    const { app } = setup();
    expect((await post(app, { ...ATLAS, step: "other" })).status).toBe(400);
  });
});
