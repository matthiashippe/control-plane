/**
 * Topping up credits from the spend permission (goals/konto/03, docs/konto/konto.md "Nachbuchen").
 *
 * When the credit of an account falls below CP_KONTO_TOPUP_BELOW_USDC, `topUpIfLow` takes CP_KONTO_TOPUP_USDC with spend(), at
 * most what is left of the current period (getCurrentPeriod of the contract); with nothing left there is no transaction and the
 * request gets its 402 as today. At most one top-up per account runs at a time. Credits are booked only after a receipt with
 * status success (`receiptSucceeded`), as one ledger row `topup` with the transaction hash as `ref`, and a hash never books twice.
 */
import { createPublicClient, encodeFunctionData, type Address, type Hex, type LocalAccount, type PublicClient, type Transport } from "viem";
import { baseSepolia } from "viem/chains";
import { getAvailableMc, postLedger, type Db } from "../db.js";
import { permissionFromJson } from "./account.js";
import { requireSepolia, sendKontoTx } from "./chain.js";
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
  spend(p: SpendPermission, value: bigint): Promise<Hex>;
  receipt(hash: Hex): Promise<TxReceiptLike>;
}

export interface TopUpDeps {
  db: Db;
  chain: KontoChain;
  topupBelowUsdc: bigint;
  topupUsdc: bigint;
}

export type TopUpResult =
  | { kind: "none"; reason: "no_account" | "wrong_chain" | "enough" | "period_used_up" | "approve_failed" | "busy" }
  | { kind: "reverted"; hash: Hex }
  | { kind: "booked"; hash: Hex; usdc: bigint; mc: number };

interface AccountRow {
  chain_id: number;
  permission: string;
  signature: Hex;
  approved_tx: string | null;
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

const running = new Map<string, Promise<TopUpResult>>();

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
  const row = db.prepare("SELECT chain_id, permission, signature, approved_tx FROM konto_accounts WHERE address = ?").get(address) as
    | AccountRow
    | undefined;
  if (!row) return { kind: "none", reason: "no_account" };
  try {
    requireSepolia(row.chain_id);
  } catch {
    return { kind: "none", reason: "wrong_chain" };
  }
  if (BigInt(getAvailableMc(db, address)) * ATOMIC_PER_MC >= deps.topupBelowUsdc) return { kind: "none", reason: "enough" };
  const permission = permissionFromJson(row.permission);
  const spent = await chain.spentThisPeriod(permission);
  const rest = permission.allowance > spent ? permission.allowance - spent : 0n;
  const value = rest < deps.topupUsdc ? rest : deps.topupUsdc;
  if (value <= 0n) return { kind: "none", reason: "period_used_up" };
  if (!(await chain.isApproved(permission))) {
    const approveTx = await chain.approve(permission, row.signature);
    if (!receiptSucceeded(await chain.receipt(approveTx))) return { kind: "none", reason: "approve_failed" };
    db.prepare("UPDATE konto_accounts SET approved_tx = ? WHERE address = ?").run(approveTx.toLowerCase(), address);
  }
  const hash = await chain.spend(permission, value);
  if (!receiptSucceeded(await chain.receipt(hash))) return { kind: "reverted", hash };
  bookTopup(db, address, hash, value);
  return { kind: "booked", hash, usdc: value, mc: Number(value / ATOMIC_PER_MC) };
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
    spend: (p, value) => send(encodeFunctionData({ abi: SPEND_PERMISSION_MANAGER_ABI, functionName: "spend", args: [p, value] })),
    receipt: (hash) => client.waitForTransactionReceipt({ hash }),
  };
}
