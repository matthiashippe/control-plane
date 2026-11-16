/**
 * Topping up credits from the spend permission (goals/konto/03, docs/konto/konto.md "Nachbuchen").
 *
 * When the credit of an account falls below CP_KONTO_TOPUP_BELOW_USDC, `topUpIfLow` takes CP_KONTO_TOPUP_USDC with spend(), at
 * most what is left of the current period (getCurrentPeriod of the contract); with nothing left there is no transaction and the
 * request gets its 402 as today. At most one top-up per account runs at a time. Credits are booked only after a receipt with
 * status success (`receiptSucceeded`), as one ledger row `topup` with the transaction hash as `ref`, and a hash never books twice.
 *
 * A sent spend() is never lost (point 15): its hash and amount go into `konto_accounts.pending_tx` before the wait for the
 * receipt. When the wait fails (an error, a timeout, a restart), the hash stays open; the next run for the account settles it
 * first and sends no new spend() while it is open. Success books it and clears it in one transaction; reverted clears it and
 * books nothing, and only the run after that may send a new spend().
 *
 * The daily limit (goals/konto/04): a cap set with the API key (`konto_accounts.cap_usdc`) is kept on top of the rest of the
 * period, so a run spends at most the lower of cap and allowance minus what the period already spent. A raise brings a new
 * permission (`next_permission`); before anything else the next run sends approveWithSignature for it and revokeAsSpender for the
 * old one, both through sendKontoTx, and spends only from the new one, so that on-chain never two of our permissions for an
 * account hold at once for longer than these two transactions.
 *
 * A raise does not reset the period (point 13): the new permission has its own `start` and so a fresh period. When the old one is
 * revoked, what it spent in its running period is kept as `carry_usdc` until that period ends (`carry_until`, unix seconds), and
 * until then a run spends from the new one at most the limit minus what the new one and the carry spent; after that the period of
 * the new one holds alone. A second raise in the same period adds what the second permission spent to the carry and keeps the
 * later of both ends, so a run may spend less than it could, never more.
 *
 * A used-up period is remembered (goals/konto/05, point 8): after `period_used_up` the run keeps the end of that period per
 * account and answers `period_used_up` until then without asking the chain, and a permission whose `end` has passed answers
 * `permission_expired` without any call. A raise brings a new permission, so a waiting `next_permission` forgets what was kept and
 * the next run asks at once. The memory lives in the process: after a restart the first run asks once more.
 */
import { createPublicClient, encodeFunctionData, type Address, type Hex, type LocalAccount, type PublicClient, type Transport } from "viem";
import { baseSepolia } from "viem/chains";
import { getAvailableMc, postLedger, type Db } from "../db.js";
import { permissionFromJson } from "./account.js";
import { requireSepolia, sendKontoTx } from "./chain.js";
import { nextPermission, spendableLimit } from "./limit.js";
import { KONTO_CHAIN_ID, SPEND_PERMISSION_MANAGER } from "./config.js";
import type { SpendPermission } from "./permission.js";

/** 100000 mc are one dollar, one dollar is 1000000 atomic USDC: ten atomic USDC are one mc. */
export const ATOMIC_PER_MC = 10n;

export interface TxReceiptLike {
  status: string;
}

/** True only for a receipt whose transaction went through. A reverted spend() moved no money and books nothing. */
export function receiptSucceeded(receipt: TxReceiptLike | null | undefined): boolean {
  return receipt?.status === "success";
}

/** What topUpIfLow needs from the chain; production builds it with createKontoChain, tests pass their own. */
export interface KontoChain {
  /** What was spent in the current period of the permission. */
  spentThisPeriod(p: SpendPermission): Promise<bigint>;
  isApproved(p: SpendPermission): Promise<boolean>;
  approve(p: SpendPermission, signature: Hex): Promise<Hex>;
  /** revokeAsSpender: the old permission ends, and a spend() from it reverts from then on. */
  revoke(p: SpendPermission): Promise<Hex>;
  spend(p: SpendPermission, value: bigint): Promise<Hex>;
  receipt(hash: Hex): Promise<TxReceiptLike>;
}

export interface TopUpDeps {
  db: Db;
  chain: KontoChain;
  topupBelowUsdc: bigint;
  topupUsdc: bigint;
  /** The clock in milliseconds, for the end of the period of a revoked permission; production uses Date.now. */
  now?: () => number;
}

export type TopUpResult =
  | {
      kind: "none";
      reason: "no_account" | "wrong_chain" | "enough" | "period_used_up" | "permission_expired" | "approve_failed" | "revoke_failed" | "busy";
    }
  | { kind: "pending"; hash: Hex }
  | { kind: "reverted"; hash: Hex }
  | { kind: "booked"; hash: Hex; usdc: bigint; mc: number };

interface AccountRow {
  chain_id: number;
  permission: string;
  signature: Hex;
  approved_tx: string | null;
  pending_tx: string | null;
  pending_usdc: string | null;
  cap_usdc: string | null;
  next_permission: string | null;
  next_signature: string | null;
  carry_usdc: string | null;
  carry_until: string | null;
}

/** The end (unix seconds) of the period of `p` that holds at `nowSeconds`, as getCurrentPeriod of the contract counts it. */
export function periodEnd(p: SpendPermission, nowSeconds: number): number {
  const elapsed = Math.max(0, nowSeconds - p.start);
  const end = p.start + (Math.floor(elapsed / p.period) + 1) * p.period;
  return Math.min(end, p.end);
}

/** Books a successful spend once: a second call with the same hash adds nothing. Returns whether a row was written. */
export function bookTopup(db: Db, address: string, hash: Hex, usdc: bigint): boolean {
  return db.transaction((): boolean => {
    const seen = db.prepare("SELECT 1 FROM ledger WHERE kind = 'topup' AND ref = ?").get(hash.toLowerCase());
    if (seen) return false;
    postLedger(db, {
      address,
      kind: "topup",
      deltaMc: Number(usdc / ATOMIC_PER_MC),
      ref: hash.toLowerCase(),
      meta: { source: "spend_permission", chain_id: KONTO_CHAIN_ID, usdc: String(usdc) },
    });
    return true;
  })();
}

/** Books a settled spend and closes it as the open one of the account, in one transaction. */
function settle(db: Db, address: string, hash: Hex, usdc: bigint): void {
  db.transaction(() => {
    bookTopup(db, address, hash, usdc);
    db.prepare("UPDATE konto_accounts SET pending_tx = NULL, pending_usdc = NULL WHERE address = ? AND pending_tx = ?").run(address, hash.toLowerCase());
  })();
}

function release(db: Db, address: string, hash: Hex): void {
  db.prepare("UPDATE konto_accounts SET pending_tx = NULL, pending_usdc = NULL WHERE address = ? AND pending_tx = ?").run(address, hash.toLowerCase());
}

/** Waits for the receipt of a sent spend(): booked, reverted, or still open when the wait fails. */
async function waitForSpend(deps: TopUpDeps, address: string, hash: Hex, usdc: bigint): Promise<TopUpResult> {
  let receipt: TxReceiptLike;
  try {
    receipt = await deps.chain.receipt(hash);
  } catch {
    return { kind: "pending", hash };
  }
  if (!receiptSucceeded(receipt)) {
    release(deps.db, address, hash);
    return { kind: "reverted", hash };
  }
  settle(deps.db, address, hash, usdc);
  return { kind: "booked", hash, usdc, mc: Number(usdc / ATOMIC_PER_MC) };
}

/** Sends a transaction and waits for its receipt: the hash when it went through, null when it reverted, failed or the wait broke off. */
async function confirmed(chain: KontoChain, send: () => Promise<Hex>): Promise<Hex | null> {
  try {
    const hash = await send();
    return receiptSucceeded(await chain.receipt(hash)) ? hash : null;
  } catch {
    return null;
  }
}

/** What a revoked permission spent in its running period, while that period holds; 0 once it ended. */
function activeCarry(row: Pick<AccountRow, "carry_usdc" | "carry_until">, nowSeconds: number): bigint {
  if (row.carry_usdc === null || row.carry_until === null) return 0n;
  return nowSeconds < Number(row.carry_until) ? BigInt(row.carry_usdc) : 0n;
}

/** The carry after a switch: what the revoked one spent in its period, plus a carry that still holds, until the later end. */
function carryAfterSwitch(row: AccountRow, oldSpent: bigint, oldEnd: number, nowSeconds: number): { usdc: bigint; until: number } {
  const held = activeCarry(row, nowSeconds);
  const until = held > 0n ? Math.max(oldEnd, Number(row.carry_until)) : oldEnd;
  return { usdc: oldSpent + held, until };
}

const running = new Map<string, Promise<TopUpResult>>();

/**
 * Per database and account: until when (unix seconds) the current period is used up, so that no run asks the chain before then.
 * Keyed by the database too, because an address means an account only within its database.
 */
const usedUpByDb = new WeakMap<Db, Map<string, number>>();
function usedUpMemo(db: Db): Map<string, number> {
  let memo = usedUpByDb.get(db);
  if (!memo) usedUpByDb.set(db, (memo = new Map()));
  return memo;
}

/** Tops the account up when its credit is low. A second call while one runs for the same account waits for that one. */
export function topUpIfLow(deps: TopUpDeps, address: string): Promise<TopUpResult> {
  const key = address.toLowerCase();
  const inFlight = running.get(key);
  if (inFlight) return inFlight.then((): TopUpResult => ({ kind: "none", reason: "busy" }));
  const run = topUp(deps, key).finally(() => running.delete(key));
  running.set(key, run);
  return run;
}

async function topUp(deps: TopUpDeps, address: string): Promise<TopUpResult> {
  const { db, chain } = deps;
  const nowSeconds = Math.floor((deps.now ?? Date.now)() / 1000);
  const row = db
    .prepare("SELECT chain_id, permission, signature, approved_tx, pending_tx, pending_usdc, cap_usdc, next_permission, next_signature, carry_usdc, carry_until FROM konto_accounts WHERE address = ?")
    .get(address) as AccountRow | undefined;
  if (!row) return { kind: "none", reason: "no_account" };
  try {
    requireSepolia(row.chain_id);
  } catch {
    return { kind: "none", reason: "wrong_chain" };
  }
  // An open spend() first: it may have moved the customer's money, so it is settled before anything new is sent.
  if (row.pending_tx) return waitForSpend(deps, address, row.pending_tx as Hex, BigInt(row.pending_usdc ?? "0"));
  // A raise first (konto 04): the new permission is approved and the old one revoked before any spend(), and only then does the
  // account use the new one.
  const next = nextPermission(row);
  let switched = false;
  const usedUpUntil = usedUpMemo(db);
  // A raise waits: the new permission has its own period, so what was kept about the old one no longer says anything.
  if (next) usedUpUntil.delete(address);
  else if ((usedUpUntil.get(address) ?? 0) > nowSeconds) return { kind: "none", reason: "period_used_up" };
  if (!next && permissionFromJson(row.permission).end <= nowSeconds) return { kind: "none", reason: "permission_expired" };
  if (next) {
    const old = permissionFromJson(row.permission);
    let approvedTx: Hex | null = null;
    // A failed transaction here (reverted, an error, a wait that broke off) ends the run without spend(): two of our permissions
    // may hold on-chain until the old one is revoked. The next run finds the new one approved and sends no second approval, and it
    // revokes the old one again, which the contract accepts also when the first revocation landed after all.
    if (!(await chain.isApproved(next.permission))) {
      approvedTx = await confirmed(chain, () => chain.approve(next.permission, next.signature));
      if (!approvedTx) return { kind: "none", reason: "approve_failed" };
    }
    if (!(await confirmed(chain, () => chain.revoke(old)))) return { kind: "none", reason: "revoke_failed" };
    // Revoked, so what the old one spent in its running period can no longer grow: it counts against the new limit until then.
    const carry = carryAfterSwitch(row, await chain.spentThisPeriod(old), periodEnd(old, nowSeconds), nowSeconds);
    db.prepare(
      `UPDATE konto_accounts SET permission = next_permission, signature = next_signature, approved_tx = COALESCE(?, approved_tx),
       next_permission = NULL, next_signature = NULL, carry_usdc = ?, carry_until = ? WHERE address = ? AND next_permission = ?`,
    ).run(approvedTx?.toLowerCase() ?? null, String(carry.usdc), String(carry.until), address, row.next_permission);
    row.permission = row.next_permission!;
    row.signature = row.next_signature as Hex;
    row.carry_usdc = String(carry.usdc);
    row.carry_until = String(carry.until);
    switched = true;
  }
  if (BigInt(getAvailableMc(db, address)) * ATOMIC_PER_MC >= deps.topupBelowUsdc) return { kind: "none", reason: "enough" };
  const permission = permissionFromJson(row.permission);
  const limit = spendableLimit(permission, row.cap_usdc === null ? null : BigInt(row.cap_usdc));
  const spent = (await chain.spentThisPeriod(permission)) + activeCarry(row, nowSeconds);
  const rest = limit > spent ? limit - spent : 0n;
  const value = rest < deps.topupUsdc ? rest : deps.topupUsdc;
  if (value <= 0n) {
    // Nothing left until the period ends, or earlier, when the carry of a revoked permission ends first.
    const carry = activeCarry(row, nowSeconds);
    const end = periodEnd(permission, nowSeconds);
    usedUpUntil.set(address, carry > 0n ? Math.min(end, Number(row.carry_until)) : end);
    return { kind: "none", reason: "period_used_up" };
  }
  // Just approved above, so the node need not be asked again (it may not even have the block yet).
  if (!switched && !(await chain.isApproved(permission))) {
    const approveTx = await confirmed(chain, () => chain.approve(permission, row.signature));
    if (!approveTx) return { kind: "none", reason: "approve_failed" };
    db.prepare("UPDATE konto_accounts SET approved_tx = ? WHERE address = ?").run(approveTx.toLowerCase(), address);
  }
  const hash = await chain.spend(permission, value);
  db.prepare("UPDATE konto_accounts SET pending_tx = ?, pending_usdc = ? WHERE address = ?").run(hash.toLowerCase(), String(value), address);
  return waitForSpend(deps, address, hash, value);
}

const PERMISSION_TUPLE = {
  type: "tuple",
  name: "spendPermission",
  components: [
    { name: "account", type: "address" },
    { name: "spender", type: "address" },
    { name: "token", type: "address" },
    { name: "allowance", type: "uint160" },
    { name: "period", type: "uint48" },
    { name: "start", type: "uint48" },
    { name: "end", type: "uint48" },
    { name: "salt", type: "uint256" },
    { name: "extraData", type: "bytes" },
  ],
} as const;

export const SPEND_PERMISSION_MANAGER_ABI = [
  {
    type: "function",
    name: "getCurrentPeriod",
    stateMutability: "view",
    inputs: [PERMISSION_TUPLE],
    outputs: [{ type: "tuple", components: [{ name: "start", type: "uint48" }, { name: "end", type: "uint48" }, { name: "spend", type: "uint160" }] }],
  },
  { type: "function", name: "isApproved", stateMutability: "view", inputs: [PERMISSION_TUPLE], outputs: [{ type: "bool" }] },
  {
    type: "function",
    name: "approveWithSignature",
    stateMutability: "nonpayable",
    inputs: [PERMISSION_TUPLE, { name: "signature", type: "bytes" }],
    outputs: [{ type: "bool" }],
  },
  { type: "function", name: "spend", stateMutability: "nonpayable", inputs: [PERMISSION_TUPLE, { name: "value", type: "uint160" }], outputs: [] },
  { type: "function", name: "revokeAsSpender", stateMutability: "nonpayable", inputs: [PERMISSION_TUPLE], outputs: [] },
] as const;

/** The chain of production: reads over `transport`, writes only through sendKontoTx with the test key. */
export function createKontoChain(params: { chainId: number; account: LocalAccount; transport: Transport; client?: PublicClient }): KontoChain {
  requireSepolia(params.chainId);
  const client = params.client ?? createPublicClient({ chain: baseSepolia, transport: params.transport });
  const address: Address = SPEND_PERMISSION_MANAGER;
  const send = (data: Hex) => sendKontoTx({ chainId: params.chainId, account: params.account, transport: params.transport, tx: { to: address, data } });
  return {
    async spentThisPeriod(p) {
      const period = await client.readContract({ address, abi: SPEND_PERMISSION_MANAGER_ABI, functionName: "getCurrentPeriod", args: [p] });
      return BigInt(period.spend);
    },
    isApproved: (p) => client.readContract({ address, abi: SPEND_PERMISSION_MANAGER_ABI, functionName: "isApproved", args: [p] }),
    approve: (p, signature) => send(encodeFunctionData({ abi: SPEND_PERMISSION_MANAGER_ABI, functionName: "approveWithSignature", args: [p, signature] })),
    revoke: (p) => send(encodeFunctionData({ abi: SPEND_PERMISSION_MANAGER_ABI, functionName: "revokeAsSpender", args: [p] })),
    spend: (p, value) => send(encodeFunctionData({ abi: SPEND_PERMISSION_MANAGER_ABI, functionName: "spend", args: [p, value] })),
    receipt: (hash) => client.waitForTransactionReceipt({ hash }),
  };
}
