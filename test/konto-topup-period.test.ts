/**
 * goals/konto/05, point 8: once the period is used up or the permission ran out, topUpIfLow does not ask the chain again until
 * the period ends. Otherwise an agent with an empty account asks the RPC on every request and hits its rate limit, the same RPC
 * the signup of new accounts checks its signatures with.
 */
import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { openDb, type Db } from "../src/db.js";
import { permissionJson } from "../src/konto/account.js";
import { finishLimit } from "../src/konto/limit.js";
import { SEPOLIA_USDC } from "../src/konto/config.js";
import type { SpendPermission } from "../src/konto/permission.js";
import { topUpIfLow, type KontoChain, type TopUpDeps } from "../src/konto/topup.js";

const DAY = 86_400;
const START = Math.floor(Date.parse("2026-11-16T00:00:00Z") / 1000);
const USD = 1_000_000n;

let next = 0x7000;
/** A fresh account address per test, so that nothing one test remembers can reach another. */
const freshAccount = () => `0x${(next++).toString(16).padStart(40, "0")}`;

const permission = (account: string, over: Partial<SpendPermission> = {}): SpendPermission => ({
  account: account as `0x${string}`,
  spender: "0x6666666666666666666666666666666666666666",
  token: SEPOLIA_USDC,
  allowance: 5n * USD,
  period: DAY,
  start: START,
  end: START + 365 * DAY,
  salt: 7n,
  extraData: "0x",
  ...over,
});

/** An account of konto 03 without credit and with an approved permission. */
function account(p: SpendPermission): Db {
  const db = openDb(":memory:");
  const now = new Date().toISOString();
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(p.account, now);
  db.prepare("INSERT INTO konto_accounts (address, chain_id, permission, signature, approved_tx, created_at) VALUES (?, 84532, ?, ?, ?, ?)").run(
    p.account, permissionJson(p), "0x" + "11".repeat(65), "0x" + "aa".repeat(32), now,
  );
  return db;
}

/** A chain whose current period has `spent` of the allowance spent, counting every call. */
function chain(spent: bigint) {
  const calls: string[] = [];
  let n = 0;
  const hash = () => `0x${String(++n).padStart(64, "0")}` as Hex;
  const c: KontoChain = {
    spentThisPeriod: async () => { calls.push("spentThisPeriod"); return spent; },
    isApproved: async () => { calls.push("isApproved"); return true; },
    approve: async () => { calls.push("approve"); return hash(); },
    revoke: async () => { calls.push("revoke"); return hash(); },
    spend: async () => { calls.push("spend"); return hash(); },
    receipt: async () => { calls.push("receipt"); return { status: "success" }; },
  };
  return { c, calls };
}

const deps = (db: Db, c: KontoChain, atSec: number): TopUpDeps => ({ db, chain: c, topupBelowUsdc: 1_000_000n * USD, topupUsdc: 2n * USD, now: () => atSec * 1000 });

describe("topUpIfLow remembers a used-up period (goals/konto/05, point 8)", () => {
  it("after period_used_up a second run before the end of the period does not call spentThisPeriod and says period_used_up", async () => {
    const p = permission(freshAccount());
    const db = account(p);
    const { c, calls } = chain(5n * USD);
    expect(await topUpIfLow(deps(db, c, START + 3600), p.account)).toEqual({ kind: "none", reason: "period_used_up" });
    expect(calls).toEqual(["spentThisPeriod"]);
    expect(await topUpIfLow(deps(db, c, START + 7200), p.account)).toEqual({ kind: "none", reason: "period_used_up" });
    expect(await topUpIfLow(deps(db, c, START + DAY - 1), p.account)).toEqual({ kind: "none", reason: "period_used_up" });
    expect(calls, "no further call to the chain inside the period").toEqual(["spentThisPeriod"]);
  });

  it("after the end of the period it asks the chain again", async () => {
    const p = permission(freshAccount());
    const db = account(p);
    const used = chain(5n * USD);
    expect((await topUpIfLow(deps(db, used.c, START + 3600), p.account)).kind).toBe("none");
    const fresh = chain(0n);
    const r = await topUpIfLow(deps(db, fresh.c, START + DAY), p.account);
    expect(fresh.calls[0]).toBe("spentThisPeriod");
    expect(r.kind).toBe("booked");
    expect(fresh.calls).toContain("spend");
  });

  it("a permission whose end lies in the past gives permission_expired without one call to the chain", async () => {
    const p = permission(freshAccount(), { end: START + DAY });
    const db = account(p);
    const { c, calls } = chain(0n);
    expect(await topUpIfLow(deps(db, c, START + DAY + 10), p.account)).toEqual({ kind: "none", reason: "permission_expired" });
    expect(await topUpIfLow(deps(db, c, START + 2 * DAY), p.account)).toEqual({ kind: "none", reason: "permission_expired" });
    expect(calls).toEqual([]);
  });

  it("after a raise of konto 04 the next run asks the chain at once", async () => {
    const p = permission(freshAccount());
    const db = account(p);
    const used = chain(5n * USD);
    expect(await topUpIfLow(deps(db, used.c, START + 3600), p.account)).toEqual({ kind: "none", reason: "period_used_up" });
    // The phone signed a raise to $10.00: the handoff row finishLimit needs, then the new permission waits on the account.
    db.prepare(
      `INSERT INTO handoffs (code, poll_hash, display_name, daily_limit_usdc, amount_usdc, match, choices, state, created_at, updated_at, step, account, previous_limit_usdc)
       VALUES ('RAISE0000000', 'x', 'Atlas', '10000000', '0', 47, '47,62,18', 'matched', 0, 0, 'limit', ?, '5000000')`,
    ).run(p.account);
    const raised = permission(p.account, { allowance: 10n * USD, start: START + 3700, salt: 8n });
    expect(finishLimit(db, { code: "RAISE0000000", account: p.account, permission: raised, signature: "0x" + "22".repeat(65) as Hex, nowMs: (START + 3700) * 1000 })).toBe(true);
    const after = chain(0n);
    const r = await topUpIfLow(deps(db, after.c, START + 3800), p.account);
    expect(after.calls).toContain("spentThisPeriod");
    expect(after.calls).toContain("spend");
    expect(r.kind).toBe("booked");
  });
});
