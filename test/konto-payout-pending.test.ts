/**
 * goals/konto/05, point 20: a sent payout whose receipt is missing is never sent a second time. Its hash and amount are stored
 * before the wait; the route answers 202 pending, and the next payout of the account clears that hash first.
 */
import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { createPayoutChain, forwarderFixed, runPayoutRules, type PayoutChain, type PayoutDeps } from "../src/konto/payout.js";
import { SEPOLIA_USDC } from "../src/konto/config.js";
import { account, json, moneySetup, payoutPermission, toPasskey, type MoneySetup } from "./money-helpers.js";

const USD = 1_000_000n;
const MONDAY = Date.parse("2026-11-16T09:00:00Z");

/**
 * A payout chain around the fake node of the setup whose receipts can be held back: `mode.lost` makes the receipt of a payout
 * throw (a wait that broke off), `mode.reverted` holds hashes whose receipt says reverted.
 */
function setup() {
  const mode = { lost: false, reverted: new Set<string>() };
  const inner: { chain: PayoutChain | null } = { chain: null };
  const lastWasPayout = () => s.node.sent.at(-1)?.kind === "payout";
  const chain: PayoutChain = {
    code: (a) => inner.chain!.code(a),
    balanceOf: (a) => inner.chain!.balanceOf(a),
    isApproved: (p) => inner.chain!.isApproved(p),
    callerOf: (f) => inner.chain!.callerOf(f),
    send: (tx) => inner.chain!.send(tx),
    async receipt(hash: Hex) {
      if (mode.reverted.has(hash)) return { status: "reverted" };
      if (mode.lost && lastWasPayout()) throw new Error("timed out waiting for the receipt");
      return inner.chain!.receipt(hash);
    },
  };
  const s = moneySetup({ konto: { payoutChain: chain } });
  inner.chain = createPayoutChain({ chainId: 84532, account: s.gas, transport: s.node.transport, token: SEPOLIA_USDC });
  return { s, mode, chain };
}

async function ready(s: MoneySetup, usd = 30n) {
  const a = await account(s);
  const p = await toPasskey(s, a);
  expect((await json(s, `/h/${p.h.code}/payout`, await payoutPermission(a.owner, a.address, p.spender))).status).toBe(200);
  s.node.balances.set(a.address, usd * USD);
  return a;
}

const payouts = (s: MoneySetup) => s.node.sent.filter((t) => t.kind === "payout");
const pay = async (s: MoneySetup, key: string, usd: string) => {
  const res = await json(s, "/v1/konto/payout", { amount_usd: usd }, key);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

describe("a payout whose receipt is missing", () => {
  it("answers 202 pending with the hash, and a second request with the same amount sends nothing and answers pending again", async () => {
    const { s, mode } = setup();
    const a = await ready(s);
    mode.lost = true;
    const first = await pay(s, a.key, "10.00");
    expect(first.status).toBe(202);
    expect(first.body).toMatchObject({ state: "pending", amount_usd: "10.00" });
    expect(first.body.tx).toMatch(/^0x[0-9a-f]{64}$/);
    expect(payouts(s)).toHaveLength(1);
    const second = await pay(s, a.key, "10.00");
    expect(second.status).toBe(202);
    expect(second.body).toMatchObject({ state: "pending", tx: first.body.tx, amount_usd: "10.00" });
    expect(payouts(s)).toHaveLength(1);
  });

  it("answers sent with the first hash and no new transaction once the receipt says success", async () => {
    const { s, mode } = setup();
    const a = await ready(s);
    mode.lost = true;
    const first = await pay(s, a.key, "10.00");
    expect(first.status).toBe(202);
    mode.lost = false;
    const before = s.node.sent.length;
    const next = await pay(s, a.key, "10.00");
    expect(next.status).toBe(200);
    expect(next.body).toMatchObject({ state: "sent", tx: first.body.tx, amount_usd: "10.00" });
    expect(s.node.sent.length).toBe(before);
    // Cleared: the request after that is a new payout.
    expect((await pay(s, a.key, "5.00")).body).toMatchObject({ state: "sent", amount_usd: "5.00" });
    expect(payouts(s)).toHaveLength(2);
  });

  it("sends exactly one new payout once the receipt says reverted", async () => {
    const { s, mode } = setup();
    const a = await ready(s);
    mode.lost = true;
    const first = await pay(s, a.key, "10.00");
    expect(first.status).toBe(202);
    mode.lost = false;
    mode.reverted.add(String(first.body.tx));
    const next = await pay(s, a.key, "10.00");
    expect(next.status).toBe(200);
    expect(next.body).toMatchObject({ state: "sent", amount_usd: "10.00" });
    expect(next.body.tx).not.toBe(first.body.tx);
    expect(payouts(s)).toHaveLength(2);
  });

  it("lets runPayoutRules send nothing and leave last_paid_day empty while a hash is open", async () => {
    const { s, mode, chain } = setup();
    const a = await ready(s);
    expect((await json(s, "/v1/konto/payout-rule", { keep_usd: "5.00", weekday: "monday" }, a.key)).status).toBe(200);
    mode.lost = true;
    expect((await pay(s, a.key, "10.00")).status).toBe(202);
    const before = s.node.sent.length;
    const lines: string[] = [];
    const d: PayoutDeps = { db: s.db, chain, fixed: forwarderFixed(s.konto!), log: (l) => lines.push(l) };
    const out = await runPayoutRules(d, MONDAY);
    expect(out).toEqual([{ address: a.address, outcome: "pending" }]);
    expect(s.node.sent.length).toBe(before);
    const rule = s.db.prepare("SELECT last_paid_day FROM konto_payout_rules WHERE address = ?").get(a.address) as { last_paid_day: string | null };
    expect(rule.last_paid_day).toBeNull();
  });
});
