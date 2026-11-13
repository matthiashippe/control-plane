/**
 * goals/konto/03, Punkt 7: credits come from the spend permission when they run low, never more than the rest of the period, only
 * after a spend() that went through, and once per transaction.
 */
import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { openDb, postLedger, type Db } from "../src/db.js";
import { permissionJson } from "../src/konto/account.js";
import { SEPOLIA_USDC } from "../src/konto/config.js";
import type { SpendPermission } from "../src/konto/permission.js";
import { bookTopup, topUpIfLow, type KontoChain } from "../src/konto/topup.js";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const SPENDER = "0x2222222222222222222222222222222222222222";

const permission: SpendPermission = {
  account: ACCOUNT,
  spender: SPENDER,
  token: SEPOLIA_USDC,
  allowance: 5_000_000n,
  period: 86_400,
  start: 1_700_000_000,
  end: 1_800_000_000,
  salt: 1n,
  extraData: "0x",
};

/** An account with `credit` mc and its permission, on `chainId`. */
function account(credit: number, chainId = 84532): Db {
  const db = openDb(":memory:");
  if (credit > 0) postLedger(db, { address: ACCOUNT, kind: "topup", deltaMc: credit, ref: "seed" });
  else db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(ACCOUNT, new Date().toISOString());
  db.prepare("INSERT INTO konto_accounts (address, chain_id, permission, signature, created_at) VALUES (?, ?, ?, ?, ?)").run(
    ACCOUNT, chainId, permissionJson(permission), "0x" + "11".repeat(65), new Date().toISOString(),
  );
  return db;
}

/** A chain that records what it was asked and answers receipts with `status`. */
function chain(opts: { spent?: bigint; status?: "success" | "reverted"; approved?: boolean; hash?: Hex; slow?: boolean } = {}) {
  const spends: bigint[] = [];
  const approvals: Hex[] = [];
  let n = 0;
  const c: KontoChain = {
    spentThisPeriod: async () => opts.spent ?? 0n,
    isApproved: async () => opts.approved ?? true,
    approve: async (_p, sig) => { approvals.push(sig); return ("0x" + "aa".repeat(32)) as Hex; },
    spend: async (_p, value) => {
      spends.push(value);
      if (opts.slow) await new Promise((r) => setTimeout(r, 20));
      return opts.hash ?? (("0x" + String(++n).padStart(64, "0")) as Hex);
    },
    receipt: async () => ({ status: opts.status ?? "success" }),
  };
  return { c, spends, approvals };
}

const LOW = 50_000; // 0.50 USD in mc, under the threshold of 1 USD
const deps = (db: Db, c: KontoChain) => ({ db, chain: c, topupBelowUsdc: 1_000_000n, topupUsdc: 2_000_000n });
const topups = (db: Db) =>
  db.prepare("SELECT delta_mc, ref, meta FROM ledger WHERE kind = 'topup' AND ref != 'seed'").all() as { delta_mc: number; ref: string; meta: string }[];

describe("topUpIfLow", () => {
  it("spends the amount under the threshold and books one topup row with the hash as ref after a successful receipt", async () => {
    const db = account(LOW);
    const { c, spends } = chain();
    const r = await topUpIfLow(deps(db, c), ACCOUNT);
    expect(spends).toEqual([2_000_000n]);
    expect(r.kind).toBe("booked");
    const rows = topups(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].delta_mc).toBe(200_000);
    expect(rows[0].ref).toBe(("0x" + "1".padStart(64, "0")).toLowerCase());
    expect(JSON.parse(rows[0].meta)).toMatchObject({ source: "spend_permission", chain_id: 84532 });
  });

  it("books nothing when the receipt says reverted", async () => {
    const db = account(LOW);
    const { c, spends } = chain({ status: "reverted" });
    const r = await topUpIfLow(deps(db, c), ACCOUNT);
    expect(spends).toHaveLength(1);
    expect(r.kind).toBe("reverted");
    expect(topups(db)).toEqual([]);
  });

  it("books the same hash once, however often it is reported", async () => {
    const db = account(LOW);
    const hash = ("0x" + "cd".repeat(32)) as Hex;
    expect(bookTopup(db, ACCOUNT, hash, 2_000_000n)).toBe(true);
    expect(bookTopup(db, ACCOUNT, hash, 2_000_000n)).toBe(false);
    const { c } = chain({ hash });
    await topUpIfLow(deps(db, c), ACCOUNT);
    expect(topups(db)).toHaveLength(1);
  });

  it("spends only the rest of the period when it is smaller than the amount", async () => {
    const db = account(LOW);
    const { c, spends } = chain({ spent: 4_000_000n });
    const r = await topUpIfLow(deps(db, c), ACCOUNT);
    expect(spends).toEqual([1_000_000n]);
    expect(r).toMatchObject({ kind: "booked", mc: 100_000 });
  });

  it("sends nothing when the period is used up", async () => {
    const db = account(LOW);
    const { c, spends } = chain({ spent: 5_000_000n });
    expect(await topUpIfLow(deps(db, c), ACCOUNT)).toEqual({ kind: "none", reason: "period_used_up" });
    expect(spends).toEqual([]);
  });

  it("sends nothing while the credit is above the threshold", async () => {
    const db = account(150_000);
    const { c, spends } = chain();
    expect(await topUpIfLow(deps(db, c), ACCOUNT)).toEqual({ kind: "none", reason: "enough" });
    expect(spends).toEqual([]);
  });

  it("spends once for two triggers at the same time", async () => {
    const db = account(LOW);
    const { c, spends } = chain({ slow: true });
    const [a, b] = await Promise.all([topUpIfLow(deps(db, c), ACCOUNT), topUpIfLow(deps(db, c), ACCOUNT)]);
    expect(spends).toHaveLength(1);
    expect([a.kind, b.kind].sort()).toEqual(["booked", "none"]);
    expect(topups(db)).toHaveLength(1);
  });

  it("sends nothing for an account on chain 8453", async () => {
    const db = account(LOW, 8453);
    const { c, spends, approvals } = chain({ approved: false });
    expect(await topUpIfLow(deps(db, c), ACCOUNT)).toEqual({ kind: "none", reason: "wrong_chain" });
    expect(spends).toEqual([]);
    expect(approvals).toEqual([]);
  });

  it("approves the signed permission first when the manager does not know it yet", async () => {
    const db = account(LOW);
    const { c, spends, approvals } = chain({ approved: false });
    await topUpIfLow(deps(db, c), ACCOUNT);
    expect(approvals).toHaveLength(1);
    expect(spends).toHaveLength(1);
    expect((db.prepare("SELECT approved_tx FROM konto_accounts").get() as { approved_tx: string }).approved_tx).toBe("0x" + "aa".repeat(32));
  });
});
