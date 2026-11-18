/**
 * goals/konto/05, point 19: a payout goes only over the forwarder that fits today's values. The bank step stores the forwarder
 * computed with the gas key of that day as `caller`; when the key (or token and chain) changed since, sendPayout would deploy the
 * contract at another address and send `payout` to the stored one, which has no code. Then no transaction may go out at all.
 */
import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createApp } from "../src/app.js";
import { forwarderFixed, PayoutFailed, runPayoutRules, sendPayout, type PayoutChain, type PayoutDeps } from "../src/konto/payout.js";
import { START } from "./handoff-helpers.js";
import { account, json, moneySetup, payoutPermission, toPasskey, type MoneySetup } from "./money-helpers.js";

const USD = 1_000_000n;
const MONDAY = Date.parse("2026-11-16T09:00:00Z");

/** An account whose bank step ran with the gas key of the setup (caller A), with `usd` dollars in its smart wallet. */
async function ready(s: MoneySetup, usd = 30n) {
  const a = await account(s);
  const p = await toPasskey(s, a);
  expect((await json(s, `/h/${p.h.code}/payout`, await payoutPermission(a.owner, a.address, p.spender))).status).toBe(200);
  s.node.balances.set(a.address, usd * USD);
  return a;
}

/** Another gas key: caller B. */
const otherCaller = () => privateKeyToAccount(generatePrivateKey()).address;

describe("the forwarder of a payout fits today's values", () => {
  it("answers 409 payout_needs_phone without a transaction when the gas key changed after the bank step", async () => {
    const s = moneySetup();
    const a = await ready(s);
    const before = s.node.sent.length;
    // The same database and Bridge, but the service now runs with another gas key.
    const app = createApp({ db: s.db, now: () => new Date(START), rateLimit: null, konto: { ...s.konto!, spender: otherCaller() }, bridge: s.bridge.bridge, handoff: { pollMs: 5, missLimit: null } });
    const res = await app.request("/v1/konto/payout", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${a.key}` },
      body: JSON.stringify({ amount_usd: "10.00" }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "payout_needs_phone" });
    expect(s.node.sent.length).toBe(before);
    expect(s.node.balances.get(a.address)).toBe(30n * USD);
  });

  it("lets the rule log payout_needs_phone, send nothing and leave last_paid_day empty when the gas key changed", async () => {
    const s = moneySetup();
    const a = await ready(s);
    expect((await json(s, "/v1/konto/payout-rule", { keep_usd: "20.00", weekday: "monday" }, a.key)).status).toBe(200);
    const before = s.node.sent.length;
    const lines: string[] = [];
    const d: PayoutDeps = { db: s.db, chain: s.konto!.payoutChain!, fixed: forwarderFixed({ ...s.konto!, spender: otherCaller() }), log: (l) => lines.push(l) };
    const out = await runPayoutRules(d, MONDAY);
    expect(out).toEqual([{ address: a.address, outcome: "payout_needs_phone" }]);
    expect(lines.some((l) => l.includes("payout_needs_phone"))).toBe(true);
    expect(s.node.sent.length).toBe(before);
    const rule = s.db.prepare("SELECT last_paid_day FROM konto_payout_rules WHERE address = ?").get(a.address) as { last_paid_day: string | null };
    expect(rule.last_paid_day).toBeNull();
  });

  it("stops at deploy without a payout when the stored forwarder still has no code after the deployment went through", async () => {
    const s = moneySetup();
    const a = await ready(s);
    const real = s.konto!.payoutChain!;
    // The deployment goes through, but nothing appears at the stored address.
    const chain: PayoutChain = { ...real, code: async () => "0x" };
    const d: PayoutDeps = { db: s.db, chain, fixed: forwarderFixed(s.konto!) };
    const err = await sendPayout(d, a.address, 10n * USD).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PayoutFailed);
    expect((err as PayoutFailed).stage).toBe("deploy");
    expect(s.node.sent.filter((t) => t.kind === "deploy")).toHaveLength(1);
    expect(s.node.sent.filter((t) => t.kind === "payout")).toHaveLength(0);
  });
});
