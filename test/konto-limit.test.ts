/**
 * goals/konto/04, Punkt 6: the daily limit of an account goes down with the API key at once and up only over a handoff that
 * brings a new, validly signed permission for exactly this account; the old one is revoked before the new one is spent from.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeAbiParameters,
  parseTransaction,
  type Hex,
  type PrivateKeyAccount,
  type PublicClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import type { Db } from "../src/db.js";
import { postLedger } from "../src/db.js";
import type { KontoDeps } from "../src/handoff/routes.js";
import { permissionFromJson } from "../src/konto/account.js";
import { SEPOLIA_USDC } from "../src/konto/config.js";
import { isLowering } from "../src/konto/limit.js";
import { SPEND_PERMISSION_TYPES, spendPermissionDomain } from "../src/konto/permission.js";
import { createKontoChain, SPEND_PERMISSION_MANAGER_ABI, topUpIfLow, type KontoChain } from "../src/konto/topup.js";
import { ATLAS, create, handoffApp, post, tap } from "./handoff-helpers.js";

const DAY = 86_400;
const START = Math.floor(Date.parse("2026-11-13T12:00:00Z") / 1000);

/**
 * A chain that counts every request and answers only eth_call, with the false of the ERC-6492 validator for an address without
 * code: viem then falls back to ecrecover. Since goals/konto/05 (point 7) a chain that cannot be asked is a 503, not a no.
 */
function countingChain() {
  const calls: string[] = [];
  const client = createPublicClient({
    chain: baseSepolia,
    transport: custom({
      request: async ({ method }: { method: string }) => {
        calls.push(method);
        if (method === "eth_call") return "0x0000000000000000000000000000000000000000000000000000000000000000";
        throw new Error("no chain in unit tests");
      },
    }),
  }) as unknown as PublicClient;
  return { calls, client };
}

const spender = privateKeyToAccount(generatePrivateKey()).address;

function setup(over: Partial<KontoDeps> | null = {}) {
  const chain = countingChain();
  const konto: KontoDeps | null = over === null ? null : { chainId: 84532, spender, token: SEPOLIA_USDC, verifyClient: chain.client, ...over };
  return { ...handoffApp({ konto }), calls: chain.calls };
}
type Setup = ReturnType<typeof setup>;

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

/** A permission signed by `owner` (a plain key standing in for the smart wallet, as in test/konto-account.test.ts). */
async function permit(owner: PrivateKeyAccount, over: Record<string, unknown> = {}) {
  const permission = {
    account: owner.address.toLowerCase() as Hex,
    spender: spender.toLowerCase() as Hex,
    token: SEPOLIA_USDC as Hex,
    allowance: 5_000_000n,
    period: DAY,
    start: START,
    end: START + 365 * DAY,
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
  return { account: permission.account as string, permission: { ...permission, allowance: String(permission.allowance), salt: String(permission.salt) }, signature };
}

/** An account of konto 03 with a daily limit of $5.00, made through the handoff, and the API key the terminal got for it. */
async function account(s: Setup) {
  const owner = privateKeyToAccount(generatePrivateKey());
  const h = await create(s.app, { ...ATLAS, step: "konto" });
  await tap(s.app, h.code, h.match);
  const res = await s.app.request(`/h/${h.code}/konto`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(await permit(owner)),
  });
  expect(res.status).toBe(200);
  const done = (await allEvents(await s.app.request(`/v1/handoff/${h.code}`, { headers: { authorization: `Bearer ${h.poll_token}` } }))).at(-1)!;
  expect(done.state).toBe("done");
  return { owner, address: owner.address.toLowerCase(), key: done.api_key };
}

const setLimit = (s: Setup, key: string | null, value: string) =>
  s.app.request("/v1/konto/limit", {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ daily_limit_usdc: value }),
  });

const raise = (s: Setup, key: string | null, value: string) =>
  post(s.app, { automaton_name: "Atlas", daily_limit_usdc: value, step: "limit" }, key ? { authorization: `Bearer ${key}` } : {});

const row = (db: Db, address: string) =>
  db.prepare("SELECT permission, cap_usdc, next_permission FROM konto_accounts WHERE address = ?").get(address) as {
    permission: string;
    cap_usdc: string | null;
    next_permission: string | null;
  };
const stateOf = (db: Db, code: string) => (db.prepare("SELECT state FROM handoffs WHERE code = ?").get(code) as { state: string }).state;

/** A chain for topUpIfLow that records what it was asked, in order. */
function recorder(spent = 0n) {
  const log: string[] = [];
  const c: KontoChain = {
    spentThisPeriod: async (p) => { log.push(`spent:${p.salt}`); return spent; },
    isApproved: async () => false,
    approve: async (p) => { log.push(`approve:${p.salt}`); return ("0x" + "a1".repeat(32)) as Hex; },
    revoke: async (p) => { log.push(`revoke:${p.salt}`); return ("0x" + "b2".repeat(32)) as Hex; },
    spend: async (p, v) => { log.push(`spend:${p.salt}:${v}`); return ("0x" + "c3".repeat(32)) as Hex; },
    receipt: async () => ({ status: "success" }),
  };
  return { c, log };
}
const LOW = 50_000; // 0.50 USD in mc, under the threshold of 1 USD
const low = (db: Db, address: string) => postLedger(db, { address, kind: "debit", deltaMc: -Math.max(0, Number((db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(address) as { balance_mc: number }).balance_mc) - LOW), ref: "spent-down" });

describe("the daily limit of an account", () => {
  it("lowers the limit with the API key, and topUpIfLow then spends at most the cap minus what the period spent", async () => {
    const s = setup();
    const a = await account(s);
    const res = await setLimit(s, a.key, "2000000");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ account: a.address, daily_limit_usdc: "2000000", signed_limit_usdc: "5000000" });
    expect(row(s.db, a.address).cap_usdc).toBe("2000000");
    low(s.db, a.address);
    const { c, log } = recorder(1_500_000n);
    const r = await topUpIfLow({ db: s.db, chain: c, topupBelowUsdc: 1_000_000n, topupUsdc: 2_000_000n }, a.address);
    expect(r.kind).toBe("booked");
    // The permission alone would allow 3.50 more today; the cap of 2.00 leaves 0.50.
    expect(log.filter((l) => l.startsWith("spend:"))).toEqual(["spend:7:500000"]);
  });

  it("accepts the limit that is already signed, unchanged", async () => {
    const s = setup();
    const a = await account(s);
    const res = await setLimit(s, a.key, "5000000");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ daily_limit_usdc: "5000000", signed_limit_usdc: "5000000" });
    expect(isLowering(5_000_000n, 5_000_000n)).toBe(true);
  });

  it("refuses a higher limit with the API key: 403 limit_raise_needs_phone, cap and permission unchanged, no call to the chain", async () => {
    const s = setup();
    const a = await account(s);
    const before = row(s.db, a.address);
    const callsBefore = s.calls.length;
    const res = await setLimit(s, a.key, "10000000");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "limit_raise_needs_phone" });
    expect(row(s.db, a.address)).toEqual(before);
    expect(before.cap_usdc).toBeNull();
    expect(s.calls.length).toBe(callsBefore);
    expect(isLowering(5_000_001n, 5_000_000n)).toBe(false);
  });

  it("answers 401 on POST /v1/konto/limit without a key", async () => {
    const s = setup();
    const res = await setLimit(s, null, "1000000");
    expect(res.status).toBe(401);
  });

  it("answers 401 on step limit without a key", async () => {
    const s = setup();
    await account(s);
    const res = await raise(s, null, "10000000");
    expect(res.status).toBe(401);
  });

  it("answers 400 on step limit with a limit not above today's", async () => {
    const s = setup();
    const a = await account(s);
    for (const v of ["5000000", "3000000"]) {
      const res = await raise(s, a.key, v);
      expect(res.status, v).toBe(400);
    }
    expect((await raise(s, a.key, "10000000")).status).toBe(201);
  });

  it("leads the right number to matched and the page limit-passkey, a wrong number burns the code", async () => {
    const s = setup();
    const a = await account(s);
    const h = (await (await raise(s, a.key, "10000000")).json()) as { code: string; match: number };
    const first = await (await s.app.request(`/h/${h.code}`)).text();
    expect(first).toContain('data-soll="approve"');
    expect(first).toContain("$5.00");
    expect(first).toContain("$10.00");
    const page = await tap(s.app, h.code, h.match);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('data-soll="limit"');
    expect(html).toContain(`data-account="${a.address}"`);
    expect(html).toContain('data-limit="10000000"');
    expect(stateOf(s.db, h.code)).toBe("matched");
    const other = (await (await raise(s, a.key, "10000000")).json()) as { code: string; match: number };
    await tap(s.app, other.code, other.match === 99 ? 98 : other.match + 1);
    expect(stateOf(s.db, other.code)).toBe("burned");
  });

  it("ends done with a matching permission: one event with daily_limit_usdc and without api_key", async () => {
    const s = setup();
    const a = await account(s);
    const h = (await (await raise(s, a.key, "10000000")).json()) as { code: string; match: number; poll_token: string };
    await tap(s.app, h.code, h.match);
    const res = await s.app.request(`/h/${h.code}/limit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(await permit(a.owner, { allowance: 10_000_000n, salt: 8n })),
    });
    expect(res.status).toBe(200);
    const events = await allEvents(await s.app.request(`/v1/handoff/${h.code}`, { headers: { authorization: `Bearer ${h.poll_token}` } }));
    const done = events.find((e) => e.state === "done")!;
    expect(done).toEqual({ state: "done", daily_limit_usdc: "10000000" });
    expect(JSON.stringify(events)).not.toContain("api_key");
    expect(permissionFromJson(row(s.db, a.address).next_permission!).allowance).toBe(10_000_000n);
    const limit = await (await s.app.request("/v1/konto/limit", { headers: { authorization: `Bearer ${a.key}` } })).json();
    expect(limit).toMatchObject({ signed_limit_usdc: "10000000" });
  });

  it("refuses a permission for another account or with another limit: 400, burned, the old one holds", async () => {
    const s = setup();
    const a = await account(s);
    const stranger = privateKeyToAccount(generatePrivateKey());
    const cases = [await permit(stranger, { allowance: 10_000_000n, salt: 8n }), await permit(a.owner, { allowance: 20_000_000n, salt: 8n })];
    for (const body of cases) {
      const h = (await (await raise(s, a.key, "10000000")).json()) as { code: string; match: number };
      await tap(s.app, h.code, h.match);
      const before = row(s.db, a.address);
      const res = await s.app.request(`/h/${h.code}/limit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      expect(res.status).toBe(400);
      expect(stateOf(s.db, h.code)).toBe("burned");
      expect(row(s.db, a.address)).toEqual(before);
      expect(before.next_permission).toBeNull();
      expect(permissionFromJson(before.permission).allowance).toBe(5_000_000n);
    }
  });

  it("refuses the matching permission with a foreign or broken signature: 400, burned, permission and cap unchanged", async () => {
    const s = setup();
    const a = await account(s);
    expect((await setLimit(s, a.key, "2000000")).status).toBe(200);
    const stranger = privateKeyToAccount(generatePrivateKey());
    // Account, spender, token and limit are the ones the code asked for; only the signature is not the account's.
    const foreign = await permit(stranger, { account: a.address, allowance: 10_000_000n, salt: 8n });
    expect(foreign.account).toBe(a.address);
    const broken = { ...(await permit(a.owner, { allowance: 10_000_000n, salt: 8n })), signature: ("0x" + "11".repeat(65)) as Hex };
    for (const body of [foreign, broken]) {
      const h = (await (await raise(s, a.key, "10000000")).json()) as { code: string; match: number };
      await tap(s.app, h.code, h.match);
      const before = row(s.db, a.address);
      const res = await s.app.request(`/h/${h.code}/limit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      expect(res.status).toBe(400);
      expect(stateOf(s.db, h.code)).toBe("burned");
      expect(row(s.db, a.address)).toEqual(before);
      expect(before.cap_usdc).toBe("2000000");
      expect(before.next_permission).toBeNull();
      expect(permissionFromJson(before.permission).allowance).toBe(5_000_000n);
    }
  });

  it("sends approveWithSignature of the new and revokeAsSpender of the old through sendKontoTx before spend() from the new", async () => {
    const s = setup();
    const a = await account(s);
    const h = (await (await raise(s, a.key, "10000000")).json()) as { code: string; match: number };
    await tap(s.app, h.code, h.match);
    await s.app.request(`/h/${h.code}/limit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(await permit(a.owner, { allowance: 10_000_000n, salt: 8n })),
    });
    low(s.db, a.address);
    // A Base Sepolia node: reads answer "not approved" and "nothing spent", receipts succeed, every sent transaction is recorded.
    const sent: { name: string; salt: bigint }[] = [];
    let n = 0;
    const transport = custom({
      async request({ method, params }: { method: string; params?: unknown[] }) {
        switch (method) {
          case "eth_chainId": return "0x14a34";
          case "eth_getTransactionCount": return "0x0";
          case "eth_estimateGas": return "0x5208";
          case "eth_maxPriorityFeePerGas": return "0x1";
          case "eth_gasPrice": return "0x2";
          case "eth_blockNumber": return "0x10";
          case "eth_getBlockByNumber": return { baseFeePerGas: "0x1", number: "0x10", hash: "0x" + "00".repeat(32), timestamp: "0x1", transactions: [] };
          case "eth_call": {
            const data = (params?.[0] as { data: Hex }).data;
            const call = decodeFunctionData({ abi: SPEND_PERMISSION_MANAGER_ABI, data });
            if (call.functionName === "isApproved") return encodeAbiParameters([{ type: "bool" }], [false]);
            return encodeAbiParameters([{ type: "uint48" }, { type: "uint48" }, { type: "uint160" }], [START, START + DAY, 0n]);
          }
          case "eth_sendRawTransaction": {
            const tx = parseTransaction(params?.[0] as Hex);
            const call = decodeFunctionData({ abi: SPEND_PERMISSION_MANAGER_ABI, data: tx.data! });
            sent.push({ name: call.functionName, salt: (call.args![0] as { salt: bigint }).salt });
            return ("0x" + String(++n).padStart(64, "0")) as Hex;
          }
          case "eth_getTransactionReceipt":
            return {
              status: "0x1", transactionHash: params?.[0], blockNumber: "0x10", blockHash: "0x" + "00".repeat(32), logs: [], cumulativeGasUsed: "0x1",
              gasUsed: "0x1", effectiveGasPrice: "0x1", from: spender, to: "0xf85210b21cc50302f477ba56686d2019dc9b67ad", transactionIndex: "0x0",
              type: "0x2", logsBloom: "0x" + "00".repeat(256), contractAddress: null,
            };
          default: throw new Error(`unexpected ${method}`);
        }
      },
    });
    const chain = createKontoChain({ chainId: 84532, account: privateKeyToAccount(generatePrivateKey()), transport });
    const r = await topUpIfLow({ db: s.db, chain, topupBelowUsdc: 1_000_000n, topupUsdc: 2_000_000n }, a.address);
    expect(r.kind).toBe("booked");
    expect(sent).toEqual([
      { name: "approveWithSignature", salt: 8n },
      { name: "revokeAsSpender", salt: 7n },
      { name: "spend", salt: 8n },
    ]);
    const after = row(s.db, a.address);
    expect(after.next_permission).toBeNull();
    expect(permissionFromJson(after.permission).salt).toBe(8n);
  }, 20_000);

  it("sets the first payment of step konto to the lower of CP_KONTO_TOPUP_USDC and the daily limit, and refuses another", async () => {
    const s = setup({ topupUsdc: 2_000_000n });
    const h = await create(s.app, { automaton_name: "Atlas", daily_limit_usdc: "5000000", step: "konto" });
    const html = await (await s.app.request(`/h/${h.code}`)).text();
    expect(html).toMatch(/\$2\.00<\/span><span class="l">First payment/);
    const small = await create(s.app, { automaton_name: "Atlas", daily_limit_usdc: "1000000", step: "konto" });
    expect(await (await s.app.request(`/h/${small.code}`)).text()).toMatch(/\$1\.00<\/span><span class="l">First payment/);
    const wrong = await post(s.app, { automaton_name: "Atlas", daily_limit_usdc: "5000000", amount_usdc: "5000000", step: "konto" });
    expect(wrong.status).toBe(400);
    expect((await post(s.app, { automaton_name: "Atlas", daily_limit_usdc: "5000000", amount_usdc: "2000000", step: "konto" })).status).toBe(201);
  });

  it("answers 503 for step limit, /h/{code}/limit and POST /v1/konto/limit while CP_KONTO_CHAIN_ID is unset", async () => {
    // An account and its key made while the account was on, then the same database without it.
    const on = setup();
    const a = await account(on);
    const { createApp } = await import("../src/app.js");
    const app = createApp({ db: on.db, now: () => new Date(Date.parse("2026-11-13T12:00:00Z")), rateLimit: null, handoff: { pollMs: 5, missLimit: null }, konto: null });
    const step = await post(app, { automaton_name: "Atlas", daily_limit_usdc: "10000000", step: "limit" }, { authorization: `Bearer ${a.key}` });
    expect(step.status).toBe(503);
    const page = await app.request("/h/0123456789AB/limit", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(page.status).toBe(503);
    const lower = await app.request("/v1/konto/limit", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${a.key}` },
      body: JSON.stringify({ daily_limit_usdc: "1000000" }),
    });
    expect(lower.status).toBe(503);
  });

  it("reads the limit: the effective one and the one signed on the phone", async () => {
    const s = setup();
    const a = await account(s);
    await setLimit(s, a.key, "3000000");
    const res = await s.app.request("/v1/konto/limit", { headers: { authorization: `Bearer ${a.key}` } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ account: a.address, daily_limit_usdc: "3000000", signed_limit_usdc: "5000000" });
  });

  it("answers 400 invalid_limit on POST /v1/konto/limit for amounts that are no positive whole cents, limit unchanged", async () => {
    const s = setup();
    const a = await account(s);
    const read = async () => (await s.app.request("/v1/konto/limit", { headers: { authorization: `Bearer ${a.key}` } })).json();
    const before = await read();
    const capBefore = row(s.db, a.address).cap_usdc;
    for (const v of ["0", "1.5", "-10000", "15000"]) {
      const res = await setLimit(s, a.key, v);
      expect(res.status, v).toBe(400);
      expect(await res.json(), v).toMatchObject({ error: "invalid_limit" });
    }
    expect(await read()).toEqual(before);
    expect(before).toMatchObject({ daily_limit_usdc: "5000000", signed_limit_usdc: "5000000" });
    expect(row(s.db, a.address).cap_usdc).toBe(capBefore);
  });

  it("answers 400 invalid_handoff with the message on the format for step limit, no handoff created, limit unchanged", async () => {
    const s = setup();
    const a = await account(s);
    const read = async () => (await s.app.request("/v1/konto/limit", { headers: { authorization: `Bearer ${a.key}` } })).json();
    const handoffs = () => (s.db.prepare("SELECT COUNT(*) AS n FROM handoffs").get() as { n: number }).n;
    const before = await read();
    const countBefore = handoffs();
    // "10005000" is above the signed 5000000 but no whole cent: without the rule it would become a handoff.
    for (const v of ["0", "1.5", "-10000", "15000", "10005000"]) {
      const res = await raise(s, a.key, v);
      expect(res.status, v).toBe(400);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.error, v).toBe("invalid_handoff");
      expect(body.message, v).toMatch(/positive whole number of atomic USDC/);
    }
    expect(handoffs()).toBe(countBefore);
    expect(await read()).toEqual(before);
    expect(row(s.db, a.address).cap_usdc).toBeNull();
  });

  it("answers 404 no_account on GET and POST /v1/konto/limit and on step limit for a key whose account is gone", async () => {
    const s = setup();
    const a = await account(s);
    s.db.prepare("DELETE FROM konto_accounts WHERE address = ?").run(a.address);
    const handoffs = () => (s.db.prepare("SELECT COUNT(*) AS n FROM handoffs").get() as { n: number }).n;
    const countBefore = handoffs();
    const read = await s.app.request("/v1/konto/limit", { headers: { authorization: `Bearer ${a.key}` } });
    expect(read.status).toBe(404);
    expect(await read.json()).toMatchObject({ error: "no_account" });
    const lower = await setLimit(s, a.key, "1000000");
    expect(lower.status).toBe(404);
    expect(await lower.json()).toMatchObject({ error: "no_account" });
    const up = await raise(s, a.key, "10000000");
    expect(up.status).toBe(404);
    expect(await up.json()).toMatchObject({ error: "no_account" });
    expect(handoffs()).toBe(countBefore);
    expect(s.db.prepare("SELECT COUNT(*) AS n FROM konto_accounts WHERE address = ?").get(a.address)).toEqual({ n: 0 });
  });
});
