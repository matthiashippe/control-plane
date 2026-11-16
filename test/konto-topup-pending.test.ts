/**
 * goals/konto/03, Punkt 15: a spend() that was sent is never lost. Its hash is in the database before the wait for the receipt;
 * when the wait fails (error, timeout, restart), the next run for the account settles that hash first, books it once on success
 * and sends no new spend() while it is open.
 */
import { describe, expect, it, vi } from "vitest";
import type { Hex } from "viem";
import { openDb, type Db } from "../src/db.js";
import { permissionJson } from "../src/konto/account.js";
import { SEPOLIA_USDC } from "../src/konto/config.js";
import type { SpendPermission } from "../src/konto/permission.js";
import type { KontoChain, TopUpDeps } from "../src/konto/topup.js";

const ACCOUNT = "0x3333333333333333333333333333333333333333";
const permission: SpendPermission = {
  account: ACCOUNT,
  spender: "0x4444444444444444444444444444444444444444",
  token: SEPOLIA_USDC,
  allowance: 5_000_000n,
  period: 86_400,
  start: 1_700_000_000,
  end: 1_800_000_000,
  salt: 3n,
  extraData: "0x",
};

function account(db = openDb(":memory:")): Db {
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(ACCOUNT, new Date().toISOString());
  db.prepare("INSERT INTO konto_accounts (address, chain_id, permission, signature, approved_tx, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    ACCOUNT, 84532, permissionJson(permission), "0x" + "11".repeat(65), "0x" + "aa".repeat(32), new Date().toISOString(),
  );
  return db;
}

/** A chain whose receipts follow `receipts` in order: "throw" makes the wait fail, a status answers it. */
function chain(receipts: ("throw" | "success" | "reverted")[]) {
  const spends: Hex[] = [];
  const waited: Hex[] = [];
  const c: KontoChain = {
    spentThisPeriod: async () => 0n,
    isApproved: async () => true,
    approve: async () => { throw new Error("not expected"); },
    spend: async () => {
      const hash = `0x${String(spends.length + 1).padStart(64, "b")}` as Hex;
      spends.push(hash);
      return hash;
    },
    receipt: async (hash) => {
      waited.push(hash);
      const next = receipts.shift() ?? "success";
      if (next === "throw") throw new Error("receipt timed out");
      return { status: next };
    },
  };
  return { c, spends, waited };
}

const deps = (db: Db, c: KontoChain): TopUpDeps => ({ db, chain: c, topupBelowUsdc: 1_000_000n, topupUsdc: 2_000_000n });
const topups = (db: Db) => db.prepare("SELECT ref, delta_mc FROM ledger WHERE kind = 'topup' AND address = ?").all(ACCOUNT) as { ref: string; delta_mc: number }[];
const pending = (db: Db) => (db.prepare("SELECT pending_tx FROM konto_accounts WHERE address = ?").get(ACCOUNT) as { pending_tx: string | null }).pending_tx;

async function load() {
  return import("../src/konto/topup.js");
}

describe("a spend() that was sent is never lost", () => {
  it("keeps the hash open and books nothing when the wait for the receipt fails", async () => {
    const { topUpIfLow } = await load();
    const db = account();
    const { c, spends } = chain(["throw"]);
    await topUpIfLow(deps(db, c), ACCOUNT).catch(() => {});
    expect(spends).toHaveLength(1);
    expect(topups(db)).toEqual([]);
    expect(pending(db)).toBe(spends[0].toLowerCase());
  });

  it("books the open hash once on the next run, without a second spend()", async () => {
    const { topUpIfLow } = await load();
    const db = account();
    const { c, spends, waited } = chain(["throw", "success", "success"]);
    await topUpIfLow(deps(db, c), ACCOUNT).catch(() => {});
    const r = await topUpIfLow(deps(db, c), ACCOUNT);
    expect(r).toMatchObject({ kind: "booked", hash: spends[0] });
    expect(spends).toHaveLength(1);
    expect(waited).toEqual([spends[0], spends[0]]);
    expect(topups(db)).toEqual([{ ref: spends[0].toLowerCase(), delta_mc: 200_000 }]);
    expect(pending(db)).toBeNull();
  });

  it("leaves the hash open and sends nothing new when the second wait fails too", async () => {
    const { topUpIfLow } = await load();
    const db = account();
    const { c, spends } = chain(["throw", "throw"]);
    await topUpIfLow(deps(db, c), ACCOUNT).catch(() => {});
    await topUpIfLow(deps(db, c), ACCOUNT).catch(() => {});
    expect(spends).toHaveLength(1);
    expect(topups(db)).toEqual([]);
    expect(pending(db)).toBe(spends[0].toLowerCase());
  });

  it("frees the account after a reverted open hash; only the run after that sends a new spend()", async () => {
    const { topUpIfLow } = await load();
    const db = account();
    const { c, spends } = chain(["throw", "reverted", "success"]);
    await topUpIfLow(deps(db, c), ACCOUNT).catch(() => {});
    const second = await topUpIfLow(deps(db, c), ACCOUNT);
    expect(second).toMatchObject({ kind: "reverted", hash: spends[0] });
    expect(spends).toHaveLength(1);
    expect(topups(db)).toEqual([]);
    expect(pending(db)).toBeNull();
    const third = await topUpIfLow(deps(db, c), ACCOUNT);
    expect(third).toMatchObject({ kind: "booked", hash: spends[1] });
    expect(spends).toHaveLength(2);
    expect(topups(db)).toEqual([{ ref: spends[1].toLowerCase(), delta_mc: 200_000 }]);
  });

  it("books the same open hash once after a restart, with a freshly loaded module and the same database", async () => {
    const db = account();
    const { c, spends } = chain(["throw", "success", "success"]);
    const before = await load();
    await before.topUpIfLow(deps(db, c), ACCOUNT).catch(() => {});
    vi.resetModules();
    const after = await load();
    expect(after).not.toBe(before);
    const r = await after.topUpIfLow(deps(db, c), ACCOUNT);
    expect(r).toMatchObject({ kind: "booked", hash: spends[0] });
    await after.topUpIfLow(deps(db, c), ACCOUNT);
    expect(spends).toHaveLength(1);
    expect(topups(db)).toEqual([{ ref: spends[0].toLowerCase(), delta_mc: 200_000 }]);
  });
});
