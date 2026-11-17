/**
 * The payout to the person's bank account (goals/konto/05, docs/konto/euro.md "Auszahlung", "Weiterleitung", "Regel").
 *
 * Money leaves an account only as USDC of its smart wallet, and only to its fixed payout address at Bridge: the spender of the
 * second spend permission is a PayoutForwarder (src/konto/contracts/PayoutForwarder.sol) whose one target on-chain is that address
 * and whose one caller is our gas key. What can be paid is what balanceOf reports for the smart wallet, nothing else; amounts are
 * atomic USDC (6 decimals) as bigint.
 *
 * - forwarderAddress: where the forwarder for account and destination lives (CREATE2 over the deterministic deployment proxy,
 *   salt 0); the page lets the person sign exactly this address as spender.
 * - sendPayout: retire of the forwarder before a new IBAN, if one waits; the forwarder deployed if it has no code yet;
 *   approveWithSignature of the second permission the first time; then payout of the forwarder. Every transaction goes through
 *   sendKontoTx (src/konto/chain.ts), which refuses any chain but the one the account is set to.
 * - POST /v1/konto/payout, GET /v1/konto/payout and POST /v1/konto/payout-rule behind the auth middleware of src/app.ts.
 * - runPayoutRules: once an hour from src/index.ts, pays on the weekday of a rule what is above the amount to keep.
 */
import type { Context, Env, Hono } from "hono";
import {
  concat,
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  getContractAddress,
  isAddress,
  pad,
  type Address,
  type Hex,
  type LocalAccount,
  type PublicClient,
  type Transport,
} from "viem";
import type { Db } from "../db.js";
import type { KontoDeps } from "../handoff/routes.js";
import { permissionFromJson, permissionJson } from "./account.js";
import type { Bridge } from "./bridge.js";
import { requireNet, sendKontoTx, type KontoTx } from "./chain.js";
import { SEPOLIA_NET, SPEND_PERMISSION_MANAGER, type KontoNet } from "./config.js";
import { FORWARDER_ABI, FORWARDER_BYTECODE } from "./forwarder.js";
import { START_SKEW_SECONDS, type SpendPermission } from "./permission.js";
import { receiptSucceeded, SPEND_PERMISSION_MANAGER_ABI, type TxReceiptLike } from "./topup.js";

const CONTRACT = "https://github.com/matthiashippe/control-plane/blob/dev/docs/konto/euro.md";

/** Arachnid's deterministic deployment proxy, at the same address on Base and Base Sepolia. */
export const DEPLOY_PROXY: Address = "0x4e59b44847b379578588920ca78fbf26c0b4956c";
export const FORWARDER_SALT: Hex = pad("0x00", { size: 32 });

/** The second permission (decision 2 of the goal): no cap, because its only target is the person's own bank account. */
export const PAYOUT_ALLOWANCE = 2n ** 160n - 1n;
export const PAYOUT_PERIOD_SECONDS = 2_592_000;
export const PAYOUT_END = 2 ** 48 - 1;
/** The smallest payout Bridge books for USDC on Base to SEPA in euros (docs/konto/euro.md). */
export const MIN_PAYOUT_USDC = 1_000_000n;

/** What every forwarder of this service shares: USDC, the SpendPermissionManager and our gas key as the one caller. */
export interface ForwarderFixed {
  token: Address;
  manager: Address;
  caller: Address;
}

/** The fixed values from the account settings: token and our spender (the address of the key in CP_KONTO_KEY_FILE). */
export function forwarderFixed(konto: Pick<KontoDeps, "token" | "spender">): ForwarderFixed {
  return { token: konto.token, manager: SPEND_PERMISSION_MANAGER, caller: konto.spender };
}

/** Creation code with the five constructor arguments, as the proxy gets it after the salt. */
export function forwarderInitCode(account: Address, destination: Address, fixed: ForwarderFixed): Hex {
  const args = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }],
    [getAddress(account), getAddress(destination), getAddress(fixed.token), getAddress(fixed.manager), getAddress(fixed.caller)],
  );
  return concat([FORWARDER_BYTECODE, args]);
}

/** The address of the forwarder for `account` and `destination`: CREATE2 over DEPLOY_PROXY with salt 0. */
export function forwarderAddress(account: Address, destination: Address, fixed: ForwarderFixed): Address {
  return getContractAddress({ opcode: "CREATE2", from: DEPLOY_PROXY, salt: FORWARDER_SALT, bytecode: forwarderInitCode(account, destination, fixed) });
}

/** A positive amount of dollars as the wire carries it ("20", "20.5", "20.00"), in atomic USDC; anything else is null. */
export function parseUsd(v: unknown): bigint | null {
  if (typeof v !== "string") return null;
  const m = /^([0-9]{1,7})(?:\.([0-9]{1,2}))?$/.exec(v);
  if (!m) return null;
  const atomic = BigInt(m[1]) * 1_000_000n + BigInt((m[2] ?? "").padEnd(2, "0") || "0") * 10_000n;
  return atomic > 0n ? atomic : null;
}

/** Atomic USDC as dollars with two digits, cut down to whole cents: `30000000n` is "30.00". */
export function formatUsd(atomic: bigint): string {
  const cents = atomic / 10_000n;
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

/** The fields that could name a target. Whoever sends one of them is refused before anything happens. */
export const TARGET_FIELDS = ["to", "destination", "address", "iban", "wallet_address"] as const;
export const namesTarget = (body: Record<string, unknown> | null): boolean => Boolean(body) && TARGET_FIELDS.some((k) => k in body!);

/** What sendPayout needs from the chain; production builds it with createPayoutChain, tests pass a fake transport to it. */
export interface PayoutChain {
  /** The code at an address, "0x" when there is none. */
  code(address: Address): Promise<Hex>;
  /** USDC of the smart wallet: the only source of a payout. */
  balanceOf(account: Address): Promise<bigint>;
  isApproved(p: SpendPermission): Promise<boolean>;
  /** One transaction with our gas key, through sendKontoTx. */
  send(tx: KontoTx): Promise<Hex>;
  receipt(hash: Hex): Promise<TxReceiptLike>;
}

const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "who", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

/** The chain of production: reads over `transport`, every write through sendKontoTx with the gas key. */
export function createPayoutChain(params: { chainId: number; net?: KontoNet; account: LocalAccount; transport: Transport; token: Address; client?: PublicClient }): PayoutChain {
  const net = params.net ?? SEPOLIA_NET;
  requireNet(params.chainId, net);
  const client = params.client ?? (createPublicClient({ chain: net.chain, transport: params.transport }) as unknown as PublicClient);
  return {
    code: async (address) => (await client.getCode({ address })) ?? "0x",
    balanceOf: (account) => client.readContract({ address: params.token, abi: ERC20_ABI, functionName: "balanceOf", args: [account] }),
    isApproved: (p) => client.readContract({ address: SPEND_PERMISSION_MANAGER, abi: SPEND_PERMISSION_MANAGER_ABI, functionName: "isApproved", args: [p] }),
    send: (tx) => sendKontoTx({ chainId: params.chainId, net, account: params.account, transport: params.transport, tx }),
    receipt: (hash) => client.waitForTransactionReceipt({ hash }),
  };
}

/** The payout setup of an account as the row holds it. */
export interface PayoutRow {
  address: string;
  bridge_customer_id: string | null;
  kyc_link_id: string | null;
  kyc_approved: number;
  external_account_id: string | null;
  liquidation_address_id: string | null;
  destination: string | null;
  bank_last4: string | null;
  forwarder: string | null;
  permission: string | null;
  signature: string | null;
  permission_approved: number;
  retire_forwarder: string | null;
  retire_permission: string | null;
}

export function readPayout(db: Db, address: string): PayoutRow | null {
  return (db.prepare("SELECT * FROM konto_payouts WHERE address = ?").get(address.toLowerCase()) as PayoutRow | undefined) ?? null;
}

/** The row of an account, created empty the first time anything is stored for it. */
export function ensurePayoutRow(db: Db, address: string, nowMs: number): void {
  db.prepare("INSERT INTO konto_payouts (address, updated_at) VALUES (?, ?) ON CONFLICT(address) DO NOTHING").run(address.toLowerCase(), nowMs);
}

/** What the bank step of one handoff brought, until its passkey step ends it. */
export interface PendingBank {
  code: string;
  address: string;
  external_account_id: string;
  liquidation_address_id: string;
  destination: string;
  bank_last4: string;
  forwarder: string;
}

export function readPendingBank(db: Db, code: string): PendingBank | null {
  return (db.prepare("SELECT * FROM payout_handoffs WHERE code = ?").get(code) as PendingBank | undefined) ?? null;
}

/** True only for the second permission the page was asked to sign: this account, this forwarder, USDC, no cap, 30 days, no end. */
export function payoutPermissionMatches(p: SpendPermission, want: { account: string; forwarder: string; token: string; nowSec: number }): boolean {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  return (
    same(p.account, want.account) &&
    same(p.spender, want.forwarder) &&
    same(p.token, want.token) &&
    p.allowance === PAYOUT_ALLOWANCE &&
    p.period === PAYOUT_PERIOD_SECONDS &&
    p.end === PAYOUT_END &&
    p.start <= want.nowSec + START_SKEW_SECONDS
  );
}

/**
 * Ends a payout handoff `done` in one transaction: the bank account of its bank step and the new permission become the payout
 * setup of the account. A permission before it that went through approveWithSignature waits as `retire_*` until sendPayout has
 * ended it; one that never did is dropped, because nothing on-chain knows it. Returns false when the handoff was no longer matched.
 */
export function finishPayout(db: Db, input: { code: string; account: string; permission: SpendPermission; signature: Hex; nowMs: number }): boolean {
  return db.transaction((): boolean => {
    const h = db.prepare("SELECT state FROM handoffs WHERE code = ?").get(input.code) as { state: string } | undefined;
    if (h?.state !== "matched") return false;
    const bank = readPendingBank(db, input.code);
    if (!bank) return false;
    const account = input.account.toLowerCase();
    ensurePayoutRow(db, account, input.nowMs);
    const before = readPayout(db, account)!;
    const retire =
      before.permission && before.forwarder && before.permission_approved
        ? { forwarder: before.forwarder, permission: before.permission }
        : { forwarder: before.retire_forwarder, permission: before.retire_permission };
    db.prepare(
      `UPDATE konto_payouts SET external_account_id = ?, liquidation_address_id = ?, destination = ?, bank_last4 = ?, forwarder = ?,
       permission = ?, signature = ?, permission_approved = 0, retire_forwarder = ?, retire_permission = ?, updated_at = ? WHERE address = ?`,
    ).run(
      bank.external_account_id,
      bank.liquidation_address_id,
      bank.destination,
      bank.bank_last4,
      bank.forwarder,
      permissionJson(input.permission),
      input.signature,
      retire.forwarder,
      retire.permission,
      input.nowMs,
      account,
    );
    db.prepare("DELETE FROM payout_handoffs WHERE code = ?").run(input.code);
    const changed = db.prepare("UPDATE handoffs SET state = 'done', updated_at = ? WHERE code = ? AND state = 'matched'").run(input.nowMs, input.code).changes;
    if (changed !== 1) throw new Error("handoff changed during finishPayout");
    return true;
  })();
}

export interface PayoutDeps {
  db: Db;
  chain: PayoutChain;
  fixed: ForwarderFixed;
  /** One line per event; production uses console.log. Never carries a key or an IBAN. */
  log?: (line: string) => void;
}

/** A transaction that did not go through; the payout stopped there and nothing after it was sent. */
export class PayoutFailed extends Error {
  constructor(
    readonly stage: "retire" | "deploy" | "approve" | "payout",
    readonly hash: Hex | null,
  ) {
    super(`payout stopped at ${stage}${hash ? `, tx ${hash}` : ""}`);
    this.name = "PayoutFailed";
  }
}

async function confirm(chain: PayoutChain, stage: PayoutFailed["stage"], tx: KontoTx): Promise<Hex> {
  let hash: Hex | null = null;
  try {
    hash = await chain.send(tx);
    if (receiptSucceeded(await chain.receipt(hash))) return hash;
  } catch {
    // An error or a wait that broke off: stop here, the next payout starts over and finds what went through.
  }
  throw new PayoutFailed(stage, hash);
}

/** Whether the stored forwarder is the one forwarderAddress computes for account and destination with today's fixed values. */
export function forwarderFits(row: Pick<PayoutRow, "forwarder" | "destination">, account: string, fixed: ForwarderFixed): boolean {
  if (!row.forwarder || !row.destination) return false;
  return forwarderAddress(account as Address, row.destination as Address, fixed).toLowerCase() === row.forwarder.toLowerCase();
}

const running = new Set<string>();

/**
 * Pays `value` atomic USDC from the smart wallet of `address` to its fixed payout address. The caller has checked the amount
 * against balanceOf. Throws PayoutFailed when a transaction did not go through, and `busy` when a payout of the account runs.
 */
export async function sendPayout(deps: PayoutDeps, address: string, value: bigint): Promise<{ tx: Hex; bankLast4: string | null }> {
  const account = address.toLowerCase();
  if (running.has(account)) throw new Error("busy");
  running.add(account);
  try {
    const { db, chain } = deps;
    const row = readPayout(db, account);
    if (!row?.permission || !row.signature || !row.forwarder || !row.destination) throw new Error("payout_needs_phone");
    // The bank step stored the forwarder computed with the values of that day. When the gas key (the forwarder's `caller`), token
    // or chain changed since, the contract would be deployed at another address than the stored one: then nothing is sent, and the
    // phone sets up the forwarder again with today's values.
    if (!forwarderFits(row, account, deps.fixed)) throw new Error("payout_needs_phone");
    // A new IBAN first: the permission of the old forwarder ends before money goes over the new one.
    if (row.retire_forwarder && row.retire_permission) {
      const old = permissionFromJson(row.retire_permission);
      await confirm(chain, "retire", {
        to: getAddress(row.retire_forwarder),
        data: encodeFunctionData({ abi: FORWARDER_ABI, functionName: "retire", args: [old] }),
      });
      db.prepare("UPDATE konto_payouts SET retire_forwarder = NULL, retire_permission = NULL WHERE address = ?").run(account);
    }
    const forwarder = getAddress(row.forwarder);
    const code = await chain.code(forwarder);
    if (!code || code === "0x") {
      const hash = await confirm(chain, "deploy", {
        to: DEPLOY_PROXY,
        data: concat([FORWARDER_SALT, forwarderInitCode(account as Address, row.destination as Address, deps.fixed)]),
      });
      // The deployment went through, but `payout` is sent only to an address that now holds code: a call to an address without code
      // succeeds on-chain and moves nothing.
      const deployed = await chain.code(forwarder);
      if (!deployed || deployed === "0x") throw new PayoutFailed("deploy", hash);
    }
    const permission = permissionFromJson(row.permission);
    if (!row.permission_approved) {
      if (!(await chain.isApproved(permission))) {
        await confirm(chain, "approve", {
          to: deps.fixed.manager,
          data: encodeFunctionData({ abi: SPEND_PERMISSION_MANAGER_ABI, functionName: "approveWithSignature", args: [permission, row.signature as Hex] }),
        });
      }
      db.prepare("UPDATE konto_payouts SET permission_approved = 1 WHERE address = ?").run(account);
    }
    const tx = await confirm(chain, "payout", {
      to: forwarder,
      data: encodeFunctionData({ abi: FORWARDER_ABI, functionName: "payout", args: [permission, value] }),
    });
    return { tx, bankLast4: row.bank_last4 };
  } finally {
    running.delete(account);
  }
}

export const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

interface RuleRow {
  address: string;
  keep_usdc: string;
  weekday: Weekday;
  last_paid_day: string | null;
}

const ruleView = (r: RuleRow | undefined | null) => (r ? { keep_usd: formatUsd(BigInt(r.keep_usdc)), weekday: r.weekday } : null);

/**
 * The hourly run (decision 5 of the goal): on the UTC weekday of each rule, once per UTC day, pays the USDC of the smart wallet
 * above `keep_usd`, when that is at least 1.00 USD. Without the second permission it pays nothing and logs payout_needs_phone.
 */
export async function runPayoutRules(deps: PayoutDeps, nowMs: number): Promise<{ address: string; outcome: string }[]> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const now = new Date(nowMs);
  const today = now.toISOString().slice(0, 10);
  const weekday = WEEKDAYS[now.getUTCDay()];
  const due = deps.db
    .prepare("SELECT address, keep_usdc, weekday, last_paid_day FROM konto_payout_rules WHERE weekday = ? AND (last_paid_day IS NULL OR last_paid_day <> ?)")
    .all(weekday, today) as RuleRow[];
  const out: { address: string; outcome: string }[] = [];
  for (const rule of due) {
    const row = readPayout(deps.db, rule.address);
    if (!row?.permission || !row.forwarder) {
      log("[payout] payout_needs_phone: a payout rule is due, but the account has not set up its bank account on the phone yet");
      out.push({ address: rule.address, outcome: "payout_needs_phone" });
      continue;
    }
    try {
      const balance = await deps.chain.balanceOf(getAddress(rule.address));
      const keep = BigInt(rule.keep_usdc);
      const value = balance > keep ? balance - keep : 0n;
      if (value < MIN_PAYOUT_USDC) {
        out.push({ address: rule.address, outcome: "below_minimum" });
        continue;
      }
      const sent = await sendPayout(deps, rule.address, value);
      deps.db.prepare("UPDATE konto_payout_rules SET last_paid_day = ? WHERE address = ?").run(today, rule.address);
      log(`[payout] rule paid ${formatUsd(value)} USD, tx ${sent.tx}`);
      out.push({ address: rule.address, outcome: "sent" });
    } catch (err) {
      if (err instanceof Error && err.message === "payout_needs_phone") {
        log("[payout] payout_needs_phone: a payout rule is due, but the forwarder no longer fits the gas key of the service; nothing was sent");
        out.push({ address: rule.address, outcome: "payout_needs_phone" });
        continue;
      }
      log(`[payout] rule payout failed: ${err instanceof Error ? err.message.slice(0, 200) : "unknown error"}`);
      out.push({ address: rule.address, outcome: "failed" });
    }
  }
  return out;
}

/**
 * POST /v1/konto/payout, GET /v1/konto/payout and POST /v1/konto/payout-rule, behind the auth middleware of src/app.ts, which sets
 * `address` from the API key. Without the account (CP_KONTO_CHAIN_ID) all three answer 503, without Bridge (CP_BRIDGE_KEY_FILE)
 * the two that pay or set a rule as well.
 */
export function registerKontoPayout<E extends Env>(app: Hono<E>, deps: { db: Db; konto: KontoDeps | null; bridge: Bridge | null; log?: (line: string) => void }): void {
  const { db, konto, bridge } = deps;
  const chain = konto?.payoutChain ?? null;
  const payoutDeps: PayoutDeps | null = konto && chain ? { db, chain, fixed: forwarderFixed(konto), log: deps.log } : null;
  const address = (c: Context) => String((c as unknown as { get: (k: string) => unknown }).get("address") ?? "").toLowerCase();
  const kontoOff = (c: Context) =>
    c.json({ error: "konto_unavailable", message: "Accounts are not switched on here, so there is nothing to pay out.", docs: CONTRACT }, 503);
  const payoutOff = (c: Context) =>
    c.json({ error: "payout_unavailable", message: "Payouts to a bank account are not switched on here yet.", docs: CONTRACT }, 503);
  const noAccount = (c: Context) =>
    c.json({ error: "no_account", message: "This API key belongs to no account. Create one with POST /v1/handoff and step konto.", docs: CONTRACT }, 404);
  const hasAccount = (a: string) => Boolean(db.prepare("SELECT 1 FROM konto_accounts WHERE address = ?").get(a));
  const invalid = (c: Context, message: string) => c.json({ error: "invalid_arguments", message, docs: CONTRACT }, 400);

  app.post("/v1/konto/payout", async (c) => {
    c.header("Cache-Control", "no-store");
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (namesTarget(body)) return invalid(c, "A payout goes only to the bank account set up on your phone. Leave out to, destination, address and iban.");
    const all = body?.all === true;
    const amount = parseUsd(body?.amount_usd);
    if (!body || all === (amount !== null) || (body.all !== undefined && body.all !== true) || (body.amount_usd !== undefined && amount === null)) {
      return invalid(c, 'Send JSON with amount_usd, dollars as a string like "10.00", or {"all":true}.');
    }
    if (!payoutDeps) return kontoOff(c);
    if (!bridge) return payoutOff(c);
    const account = address(c);
    if (!hasAccount(account)) return noAccount(c);
    const row = readPayout(db, account);
    if (!row?.permission || !row.forwarder || !forwarderFits(row, account, payoutDeps.fixed)) {
      return c.json(
        {
          error: "payout_needs_phone",
          message: 'The first payout needs your phone once: send POST /v1/handoff with step "payout", then this request again. Nothing was sent.',
          docs: CONTRACT,
        },
        409,
      );
    }
    if (amount !== null && amount < MIN_PAYOUT_USDC) {
      return c.json({ error: "below_minimum", message: "A payout is at least 1.00 USD. Nothing was sent.", docs: CONTRACT }, 400);
    }
    const balance = await chain!.balanceOf(getAddress(account));
    const value = all ? balance : amount!;
    if (all && value === 0n) return c.json({ state: "nothing_to_pay", amount_usd: "0.00" }, 200);
    if (value < MIN_PAYOUT_USDC) {
      return c.json({ error: "below_minimum", message: "A payout is at least 1.00 USD. Nothing was sent.", balance_usd: formatUsd(balance), docs: CONTRACT }, 400);
    }
    if (value > balance) {
      return c.json(
        { error: "insufficient_balance", message: `The account holds ${formatUsd(balance)} USD. Nothing was sent.`, balance_usd: formatUsd(balance), docs: CONTRACT },
        400,
      );
    }
    try {
      const sent = await sendPayout(payoutDeps, account, value);
      return c.json({ state: "sent", tx: sent.tx, amount_usd: formatUsd(value), bank_last4: sent.bankLast4 }, 200);
    } catch (err) {
      if (err instanceof Error && err.message === "payout_needs_phone") {
        return c.json(
          {
            error: "payout_needs_phone",
            message: 'This payout needs your phone once more: send POST /v1/handoff with step "payout", then this request again. Nothing was sent.',
            docs: CONTRACT,
          },
          409,
        );
      }
      if (err instanceof Error && err.message === "busy") {
        return c.json({ error: "payout_busy", message: "A payout of this account is running. Try again in a minute.", docs: CONTRACT }, 409);
      }
      const stage = err instanceof PayoutFailed ? err.stage : "payout";
      const tx = err instanceof PayoutFailed ? err.hash : null;
      return c.json({ error: "payout_failed", message: `The payout did not go through (${stage}). Try again later.`, stage, tx, docs: CONTRACT }, 502);
    }
  });

  app.get("/v1/konto/payout", async (c) => {
    c.header("Cache-Control", "no-store");
    if (!payoutDeps) return kontoOff(c);
    const account = address(c);
    if (!hasAccount(account)) return noAccount(c);
    const row = readPayout(db, account);
    const rule = db.prepare("SELECT address, keep_usdc, weekday, last_paid_day FROM konto_payout_rules WHERE address = ?").get(account) as RuleRow | undefined;
    const balance = await chain!.balanceOf(getAddress(account));
    return c.json({
      account,
      balance_usd: formatUsd(balance),
      payout_ready: Boolean(bridge && row?.permission && row.forwarder && forwarderFits(row, account, payoutDeps.fixed)),
      bank_last4: row?.bank_last4 ?? null,
      rule: ruleView(rule),
    });
  });

  app.post("/v1/konto/payout-rule", async (c) => {
    c.header("Cache-Control", "no-store");
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (namesTarget(body)) return invalid(c, "A payout rule pays only to the bank account set up on your phone. Leave out to, destination, address and iban.");
    const off = body?.off === true;
    const keep = typeof body?.keep_usd === "string" && /^0+(\.0{1,2})?$/.test(body.keep_usd) ? 0n : parseUsd(body?.keep_usd);
    const weekday = typeof body?.weekday === "string" && (WEEKDAYS as readonly string[]).includes(body.weekday) ? (body.weekday as Weekday) : null;
    if (!body || (off ? body.keep_usd !== undefined || body.weekday !== undefined : keep === null || weekday === null)) {
      return invalid(c, 'Send JSON with keep_usd, dollars as a string like "20.00", and weekday, monday to sunday, or {"off":true}.');
    }
    if (!payoutDeps) return kontoOff(c);
    if (!bridge) return payoutOff(c);
    const account = address(c);
    if (!hasAccount(account)) return noAccount(c);
    if (off) {
      db.prepare("DELETE FROM konto_payout_rules WHERE address = ?").run(account);
      return c.json({ rule: null }, 200);
    }
    db.prepare(
      `INSERT INTO konto_payout_rules (address, keep_usdc, weekday, last_paid_day, updated_at) VALUES (?, ?, ?, NULL, ?)
       ON CONFLICT(address) DO UPDATE SET keep_usdc = excluded.keep_usdc, weekday = excluded.weekday, updated_at = excluded.updated_at`,
    ).run(account, String(keep), weekday, Date.now());
    const rule = db.prepare("SELECT address, keep_usdc, weekday, last_paid_day FROM konto_payout_rules WHERE address = ?").get(account) as RuleRow;
    return c.json({ rule: ruleView(rule) }, 200);
  });
}

/** True for a string that can be a payout address from Bridge. */
export const isPayoutAddress = (v: string): boolean => isAddress(v, { strict: false });
