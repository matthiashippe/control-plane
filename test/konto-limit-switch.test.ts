/**
 * goals/konto/04, point 14: the switch to the permission of a raise when a transaction of it fails. Between the approval of the new
 * permission and the revocation of the old one two of our permissions hold on-chain, so a run in that state spends nothing. The
 * next run sends no second approveWithSignature, revokes the old one again and only then spends from the new one. revokeAsSpender
 * of a permission that is already revoked returns early in the contract, so a revocation whose receipt went missing although it
 * landed does not hold the account up.
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
const NOW = START + DAY + 3600;
const ACCOUNT = "0x7777777777777777777777777777777777777777";
const USD = 1_000_000n;

const base = {
  account: ACCOUNT,
  spender: "0x8888888888888888888888888888888888888888",
  token: SEPOLIA_USDC,
  period: DAY,
  end: START + 365 * DAY,
  extraData: "0x",
} as const;
const oldPermission: SpendPermission = { ...base, allowance: 5n * USD, start: START, salt: 7n };
const newPermission: SpendPermission = { ...base, allowance: 10n * USD, start: NOW - 600, salt: 8n };

function raised(): Db {
  const db = openDb(":memory:");
  const now = new Date().toISOString();
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(ACCOUNT, now);
  db.prepare(
    `INSERT INTO konto_accounts (address, chain_id, permission, signature, approved_tx, created_at, next_permission, next_signature)
     VALUES (?, 84532, ?, ?, ?, ?, ?, ?)`,
  ).run(ACCOUNT, permissionJson(oldPermission), "0x" + "11".repeat(65), "0x" + "aa".repeat(32), now, permissionJson(newPermission), "0x" + "22".repeat(65));
  return db;
}

/**
 * What one transaction does: `success` lands and is confirmed, `reverted` lands without effect, `lost` never lands and the wait
 * throws, `landed` takes effect but the wait for its receipt throws, `send` fails before anything is sent.
 */
type Outcome = "success" | "reverted" | "lost" | "landed" | "send";

/** A chain that keeps approvals and revocations as the contract does, with the outcome of each approve and revoke in order. */
function chain(plan: { approve?: Outcome[]; revoke?: Outcome[] }) {
  const approved = new Set<string>(["7"]);
  const revoked = new Set<string>();
  const calls: string[] = [];
  const receipts = new Map<Hex, Outcome>();
  let n = 0;
  const tx = (outcome: Outcome, effect: () => void): Hex => {
    if (outcome === "send") throw new Error("node refused the transaction");
    if (outcome === "success" || outcome === "landed") effect();
    const hash = `0x${String(++n).padStart(64, "0")}` as Hex;
    receipts.set(hash, outcome);
    return hash;
  };
  const c: KontoChain = {
    spentThisPeriod: async () => 0n,
    isApproved: async (p) => approved.has(String(p.salt)),
    approve: async (p) => { calls.push(`approve:${p.salt}`); return tx(plan.approve?.shift() ?? "success", () => approved.add(String(p.salt))); },
    // revokeAsSpender returns early for a permission that is already revoked: the transaction goes through.
    revoke: async (p) => { calls.push(`revoke:${p.salt}`); return tx(plan.revoke?.shift() ?? "success", () => revoked.add(String(p.salt))); },
    spend: async (p, value) => {
      const salt = String(p.salt);
      if (!approved.has(salt) || revoked.has(salt)) throw new Error(`spend from ${salt} would revert`);
      calls.push(`spend:${salt}:${value}`);
      return tx("success", () => {});
    },
    receipt: async (hash) => {
      const outcome = receipts.get(hash) ?? "success";
      if (outcome === "lost" || outcome === "landed") throw new Error("timed out waiting for the receipt");
      return { status: outcome === "reverted" ? "reverted" : "success" };
    },
  };
  return { c, calls, approved, revoked };
}

const deps = (db: Db, c: KontoChain): TopUpDeps => ({ db, chain: c, topupBelowUsdc: 1_000n * USD, topupUsdc: 2n * USD, now: () => NOW * 1000 });
const spends = (calls: string[]) => calls.filter((x) => x.startsWith("spend:"));
const permissionOf = (db: Db) => (db.prepare("SELECT permission, next_permission FROM konto_accounts WHERE address = ?").get(ACCOUNT) as { permission: string; next_permission: string | null });

/** Runs a first topUpIfLow with the given plan, then a second one, and returns what each sent. */
async function twoRuns(plan: { approve?: Outcome[]; revoke?: Outcome[] }) {
  const db = raised();
  const chainState = chain(plan);
  const first = await topUpIfLow(deps(db, chainState.c), ACCOUNT);
  const firstCalls = chainState.calls.splice(0);
  const afterFirst = permissionOf(db);
  const second = await topUpIfLow(deps(db, chainState.c), ACCOUNT);
  return { db, first, firstCalls, afterFirst, second, secondCalls: chainState.calls, ...chainState };
}

describe("a failed revocation during the switch to a raised permission", () => {
  it("spends nothing after a reverted revocation, and the next run revokes once more without a second approve, then spends", async () => {
    const r = await twoRuns({ revoke: ["reverted"] });
    expect(r.first).toEqual({ kind: "none", reason: "revoke_failed" });
    expect(r.firstCalls).toEqual(["approve:8", "revoke:7"]);
    expect(r.afterFirst.next_permission).not.toBeNull();
    expect(r.secondCalls.filter((x) => x.startsWith("revoke:"))).toEqual(["revoke:7"]);
    expect(r.secondCalls.filter((x) => x.startsWith("approve:"))).toEqual([]);
    expect(spends(r.secondCalls)).toEqual([`spend:8:${2n * USD}`]);
    expect(r.secondCalls.indexOf("revoke:7")).toBeLessThan(r.secondCalls.indexOf(`spend:8:${2n * USD}`));
    expect(r.second.kind).toBe("booked");
  });

  it("spends nothing when the wait for the receipt of the revocation throws, and the next run does the same as after a revert", async () => {
    const r = await twoRuns({ revoke: ["lost"] });
    expect(r.first).toEqual({ kind: "none", reason: "revoke_failed" });
    expect(spends(r.firstCalls)).toEqual([]);
    expect(r.secondCalls.filter((x) => x.startsWith("revoke:"))).toEqual(["revoke:7"]);
    expect(r.secondCalls.filter((x) => x.startsWith("approve:"))).toEqual([]);
    expect(spends(r.secondCalls)).toEqual([`spend:8:${2n * USD}`]);
  });

  it("spends nothing when sending the revocation fails, and the next run revokes and spends", async () => {
    const r = await twoRuns({ revoke: ["send"] });
    expect(r.first).toEqual({ kind: "none", reason: "revoke_failed" });
    expect(spends(r.firstCalls)).toEqual([]);
    expect(r.secondCalls.filter((x) => x.startsWith("approve:"))).toEqual([]);
    expect(spends(r.secondCalls)).toEqual([`spend:8:${2n * USD}`]);
  });

  it("is not held up by a revocation that landed although its receipt went missing: the next run spends from the new one", async () => {
    const r = await twoRuns({ revoke: ["landed"] });
    expect(r.revoked.has("7")).toBe(true);
    expect(r.first).toEqual({ kind: "none", reason: "revoke_failed" });
    expect(spends(r.firstCalls)).toEqual([]);
    expect(r.second.kind).toBe("booked");
    expect(spends(r.secondCalls)).toEqual([`spend:8:${2n * USD}`]);
    expect(r.secondCalls.filter((x) => x.startsWith("approve:"))).toEqual([]);
    expect(JSON.parse(permissionOf(r.db).permission).salt).toBe("8");
  });

  it("sends no second approveWithSignature when the approval landed but the wait for its receipt threw", async () => {
    const r = await twoRuns({ approve: ["landed"] });
    expect(r.first).toEqual({ kind: "none", reason: "approve_failed" });
    expect(r.firstCalls).toEqual(["approve:8"]);
    expect(r.secondCalls.filter((x) => x.startsWith("approve:"))).toEqual([]);
    expect(r.secondCalls.filter((x) => x.startsWith("revoke:"))).toEqual(["revoke:7"]);
    expect(spends(r.secondCalls)).toEqual([`spend:8:${2n * USD}`]);
  });
});
