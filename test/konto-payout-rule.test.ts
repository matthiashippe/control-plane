/**
 * goals/konto/05, point 11: a payout rule pays on its weekday (UTC) once a day everything above the amount the person wants to
 * keep, only to the fixed payout address, and nothing without the second permission. runPayoutRules gets the clock from outside.
 */
import { describe, expect, it } from "vitest";
import { forwarderFixed, runPayoutRules, type PayoutDeps } from "../src/konto/payout.js";
import { account, expectedForwarder, json, moneySetup, payoutPermission, toPasskey, type MoneySetup } from "./money-helpers.js";

const USD = 1_000_000n;
const MONDAY = Date.parse("2026-11-16T09:00:00Z");
const HOUR = 3_600_000;

async function ready(s: MoneySetup, usd: bigint) {
  const a = await account(s);
  const p = await toPasskey(s, a);
  expect((await json(s, `/h/${p.h.code}/payout`, await payoutPermission(a.owner, a.address, p.spender))).status).toBe(200);
  s.node.balances.set(a.address, usd * USD);
  return { ...a, destination: s.bridge.state.liquidation.at(-1)! };
}

const rule = (s: MoneySetup, key: string | null, body: unknown) => json(s, "/v1/konto/payout-rule", body, key ?? undefined);

function deps(s: MoneySetup) {
  const lines: string[] = [];
  const d: PayoutDeps = { db: s.db, chain: s.konto!.payoutChain!, fixed: forwarderFixed(s.konto!), log: (l) => lines.push(l) };
  return { d, lines };
}

const payouts = (s: MoneySetup) => s.node.sent.filter((t) => t.kind === "payout");

describe("the payout rule", () => {
  it("sets a rule with the API key (200) and refuses one without (401)", async () => {
    const s = moneySetup();
    const a = await account(s);
    const res = await rule(s, a.key, { keep_usd: "20.00", weekday: "monday" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rule: { keep_usd: "20.00", weekday: "monday" } });
    expect((await rule(s, null, { keep_usd: "20.00", weekday: "monday" })).status).toBe(401);
    const status = await s.app.request("/v1/konto/payout", { headers: { authorization: `Bearer ${a.key}` } });
    expect(await status.json()).toMatchObject({ account: a.address, balance_usd: "0.00", payout_ready: false, bank_last4: null, rule: { keep_usd: "20.00", weekday: "monday" } });
  });

  it("pays exactly one payout of 10 USD on a Monday with 30 USD and keep_usd 20, to the fixed forwarder", async () => {
    const s = moneySetup();
    const a = await ready(s, 30n);
    await rule(s, a.key, { keep_usd: "20.00", weekday: "monday" });
    const { d, lines } = deps(s);
    const out = await runPayoutRules(d, MONDAY);
    expect(out).toEqual([{ address: a.address, outcome: "sent" }]);
    expect(payouts(s)).toHaveLength(1);
    expect(payouts(s)[0]).toMatchObject({ to: expectedForwarder(a.address, a.destination, s.gas.address), value: 10n * USD });
    expect(s.node.balances.get(a.destination)).toBe(10n * USD);
    expect(lines.some((l) => l.includes("10.00"))).toBe(true);
  });

  it("pays nothing on another day", async () => {
    const s = moneySetup();
    const a = await ready(s, 30n);
    await rule(s, a.key, { keep_usd: "20.00", weekday: "monday" });
    const { d } = deps(s);
    for (let day = 1; day < 7; day++) expect(await runPayoutRules(d, MONDAY + day * 24 * HOUR)).toEqual([]);
    expect(s.node.sent).toEqual([]);
  });

  it("pays once when two runs come on the same day", async () => {
    const s = moneySetup();
    const a = await ready(s, 30n);
    await rule(s, a.key, { keep_usd: "20.00", weekday: "monday" });
    const { d } = deps(s);
    await runPayoutRules(d, MONDAY);
    s.node.balances.set(a.address, 40n * USD);
    expect(await runPayoutRules(d, MONDAY + 5 * HOUR)).toEqual([]);
    expect(payouts(s)).toHaveLength(1);
    // A week later it pays again.
    await runPayoutRules(d, MONDAY + 7 * 24 * HOUR);
    expect(payouts(s)).toHaveLength(2);
    expect(payouts(s)[1].value).toBe(20n * USD);
  });

  it("pays nothing when the balance minus keep_usd is below 1.00 USD", async () => {
    const s = moneySetup();
    const a = await ready(s, 20n);
    s.node.balances.set(a.address, 20n * USD + 990_000n);
    await rule(s, a.key, { keep_usd: "20.00", weekday: "monday" });
    const { d } = deps(s);
    expect(await runPayoutRules(d, MONDAY)).toEqual([{ address: a.address, outcome: "below_minimum" }]);
    expect(s.node.sent).toEqual([]);
  });

  it("pays nothing without the second permission and logs payout_needs_phone", async () => {
    const s = moneySetup();
    const a = await account(s);
    s.node.balances.set(a.address, 30n * USD);
    await rule(s, a.key, { keep_usd: "20.00", weekday: "monday" });
    const { d, lines } = deps(s);
    expect(await runPayoutRules(d, MONDAY)).toEqual([{ address: a.address, outcome: "payout_needs_phone" }]);
    expect(s.node.sent).toEqual([]);
    expect(lines.filter((l) => l.includes("payout_needs_phone"))).toHaveLength(1);
    expect(lines.join("\n")).not.toContain(a.key);
  });

  it("deletes the rule with off:true", async () => {
    const s = moneySetup();
    const a = await ready(s, 30n);
    await rule(s, a.key, { keep_usd: "20.00", weekday: "monday" });
    const res = await rule(s, a.key, { off: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rule: null });
    expect(s.db.prepare("SELECT count(*) AS n FROM konto_payout_rules").get()).toEqual({ n: 0 });
    expect(await runPayoutRules(deps(s).d, MONDAY)).toEqual([]);
    expect(s.node.sent).toEqual([]);
  });

  it("refuses a weekday outside monday to sunday, a bad amount and a target with 400", async () => {
    const s = moneySetup();
    const a = await account(s);
    for (const body of [
      { keep_usd: "20.00", weekday: "montag" },
      { keep_usd: "20.00", weekday: "Monday" },
      { keep_usd: "20.00" },
      { keep_usd: "5.001", weekday: "monday" },
      { keep_usd: 20, weekday: "monday" },
      { keep_usd: "20.00", weekday: "monday", destination: "0x" + "1".repeat(40) },
    ]) {
      const res = await rule(s, a.key, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "invalid_arguments" });
    }
    expect(s.db.prepare("SELECT count(*) AS n FROM konto_payout_rules").get()).toEqual({ n: 0 });
    for (const day of ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]) {
      expect((await rule(s, a.key, { keep_usd: "0", weekday: day })).status).toBe(200);
    }
  });
});
