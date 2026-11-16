/**
 * goals/konto/04, point 13: a raise does not reset the period. The new permission has its own `start` and so a fresh period;
 * until the running period of the old one ends, topUpIfLow spends from the new one at most the new limit (or the cap, when it is
 * lower) minus what the old one already spent in that period. After that the period of the new one holds alone.
 */
import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { openDb, type Db } from "../src/db.js";
import { permissionJson } from "../src/konto/account.js";
import { SEPOLIA_USDC } from "../src/konto/config.js";
import type { SpendPermission } from "../src/konto/permission.js";
import { topUpIfLow, type KontoChain, type TopUpDeps } from "../src/konto/topup.js";

const DAY = 86_400;
const START = Math.floor(Date.parse("2026-11-13T12:00:00Z") / 1000);
const ACCOUNT = "0x5555555555555555555555555555555555555555";
const USD = 1_000_000n;

/** The old permission is in its second period, [START + DAY, START + 2 DAY), when the phone signs the raise. */
const RAISED_AT = START + DAY + 6 * 3600;
const OLD_PERIOD_END = START + 2 * DAY;

const base = {
  account: ACCOUNT,
  spender: "0x6666666666666666666666666666666666666666",
  token: SEPOLIA_USDC,
  period: DAY,
  end: START + 365 * DAY,
  extraData: "0x",
} as const;
const oldPermission: SpendPermission = { ...base, allowance: 5n * USD, start: START, salt: 7n };
const newPermission: SpendPermission = { ...base, allowance: 10n * USD, start: RAISED_AT, salt: 8n };

/** An account of konto 03 with the old permission approved and a raise to $10.00 waiting in `next_permission`. */
function raised(cap: bigint | null = null): Db {
  const db = openDb(":memory:");
  const now = new Date().toISOString();
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(ACCOUNT, now);
  db.prepare(
    `INSERT INTO konto_accounts (address, chain_id, permission, signature, approved_tx, created_at, cap_usdc, next_permission, next_signature)
     VALUES (?, 84532, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    ACCOUNT, permissionJson(oldPermission), "0x" + "11".repeat(65), "0x" + "aa".repeat(32), now,
    cap === null ? null : String(cap), permissionJson(newPermission), "0x" + "22".repeat(65),
  );
  return db;
}

/**
 * A chain that keeps what the contract keeps: approvals, revocations and what each permission spent. The old one spent
 * `oldSpent` in its running period; the new one spent what topUpIfLow took from it.
 */
function chain(oldSpent: bigint) {
  const approved = new Set<string>(["7"]);
  const revoked = new Set<string>();
  const spentBy = new Map<string, bigint>([["7", oldSpent]]);
  const spends: { salt: string; value: bigint }[] = [];
  let n = 0;
  const hash = () => `0x${String(++n).padStart(64, "0")}` as Hex;
  const c: KontoChain = {
    spentThisPeriod: async (p) => spentBy.get(String(p.salt)) ?? 0n,
    isApproved: async (p) => approved.has(String(p.salt)),
    approve: async (p) => { approved.add(String(p.salt)); return hash(); },
    revoke: async (p) => { revoked.add(String(p.salt)); return hash(); },
    spend: async (p, value) => {
      const salt = String(p.salt);
      if (revoked.has(salt) || !approved.has(salt)) throw new Error(`spend from ${salt} would revert`);
      spends.push({ salt, value });
      spentBy.set(salt, (spentBy.get(salt) ?? 0n) + value);
      return hash();
    },
    receipt: async () => ({ status: "success" }),
  };
  return { c, spends, revoked };
}

const deps = (db: Db, c: KontoChain, at: number, topupUsdc: bigint, topupBelowUsdc = 1_000_000n * USD): TopUpDeps => ({
  db, chain: c, topupBelowUsdc, topupUsdc, now: () => at * 1000,
});
const total = (spends: { salt: string; value: bigint }[], salt: string) => spends.filter((s) => s.salt === salt).reduce((a, s) => a + s.value, 0n);

describe("a raise keeps the period of the old permission", () => {
  it("spends from the new one at most 10 minus the 4 the old one spent, also over several runs, until the old period ends", async () => {
    const db = raised();
    const { c, spends, revoked } = chain(4n * USD);
    const first = await topUpIfLow(deps(db, c, RAISED_AT + 60, 10n * USD), ACCOUNT);
    expect(revoked.has("7")).toBe(true);
    expect(first.kind).toBe("booked");
    expect(spends).toEqual([{ salt: "8", value: 6n * USD }]);

    const db2 = raised();
    const two = chain(4n * USD);
    for (let i = 0; i < 6; i++) await topUpIfLow(deps(db2, two.c, RAISED_AT + 60 + i * 600, 2n * USD), ACCOUNT);
    expect(two.spends.map((s) => s.value)).toEqual([2n * USD, 2n * USD, 2n * USD]);
    expect(total(two.spends, "8")).toBe(6n * USD);
    const after = await topUpIfLow(deps(db2, two.c, OLD_PERIOD_END - 1, 2n * USD), ACCOUNT);
    expect(after).toEqual({ kind: "none", reason: "period_used_up" });
    expect(total(two.spends, "7")).toBe(0n);
  });

  it("lets the period of the new one hold alone once the old period ended: up to 10", async () => {
    const db = raised();
    const { c, spends, revoked } = chain(4n * USD);
    // The switch runs while the credit is enough, so nothing is spent before the old period ends.
    const switched = await topUpIfLow(deps(db, c, RAISED_AT + 60, 10n * USD, 0n), ACCOUNT);
    expect(switched).toEqual({ kind: "none", reason: "enough" });
    expect(revoked.has("7")).toBe(true);
    const later = await topUpIfLow(deps(db, c, OLD_PERIOD_END, 10n * USD), ACCOUNT);
    expect(later.kind).toBe("booked");
    expect(spends).toEqual([{ salt: "8", value: 10n * USD }]);
  });

  it("with a cap of 3 after the raise spends 3 minus 4, so nothing", async () => {
    const db = raised(3n * USD);
    const { c, spends } = chain(4n * USD);
    const result = await topUpIfLow(deps(db, c, RAISED_AT + 60, 10n * USD), ACCOUNT);
    expect(result).toEqual({ kind: "none", reason: "period_used_up" });
    expect(spends).toEqual([]);
  });

  it("keeps what the old one spent through a second raise in the same period", async () => {
    const db = raised();
    const { c, spends } = chain(4n * USD);
    await topUpIfLow(deps(db, c, RAISED_AT + 60, 2n * USD), ACCOUNT);
    expect(total(spends, "8")).toBe(2n * USD);
    const third: SpendPermission = { ...base, allowance: 12n * USD, start: RAISED_AT + 3600, salt: 9n };
    db.prepare("UPDATE konto_accounts SET next_permission = ?, next_signature = ? WHERE address = ?").run(permissionJson(third), "0x" + "33".repeat(65), ACCOUNT);
    await topUpIfLow(deps(db, c, RAISED_AT + 3600 + 60, 12n * USD), ACCOUNT);
    // 12 minus the 4 of the first and the 2 of the second permission in this period.
    expect(total(spends, "9")).toBe(6n * USD);
  });
});
