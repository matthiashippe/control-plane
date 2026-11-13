/**
 * The spend permission a person signs on the phone (goals/konto/03, docs/konto/konto.md "Erlaubnis"): SpendPermissionManager on
 * Base Sepolia, USDC only, only to our spender, at most the daily limit of the handoff per day.
 *
 * Two decisions with fixed names, because the counter-tests of the goal replace exactly these and expect the tests to fail:
 * - permissionMatches: is it the permission this handoff asked for?
 * - signatureValid: did the smart wallet sign it (ERC-1271, or ERC-6492 while the wallet is not deployed yet)?
 */
import { isAddress, isHex, type Address, type Hex, type PublicClient } from "viem";
import { PERIOD_SECONDS, SPEND_PERMISSION_MANAGER } from "./config.js";

export interface SpendPermission {
  account: Address;
  spender: Address;
  token: Address;
  allowance: bigint;
  period: number;
  start: number;
  end: number;
  salt: bigint;
  extraData: Hex;
}

/** How far `start` may lie in the future: five minutes for a phone whose clock runs ahead. */
export const START_SKEW_SECONDS = 300;
const UINT48_MAX = 2 ** 48 - 1;
const UINT160_MAX = 2n ** 160n - 1n;

export const SPEND_PERMISSION_TYPES = {
  SpendPermission: [
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

export function spendPermissionDomain(chainId: number) {
  return { name: "Spend Permission Manager", version: "1", chainId, verifyingContract: SPEND_PERMISSION_MANAGER } as const;
}

const uint = (v: unknown): bigint | null => {
  if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  if (typeof v === "string" && /^[0-9]{1,78}$/.test(v)) return BigInt(v);
  return null;
};

/** The permission from a JSON body (numbers as strings or safe integers); null when a field is missing or out of range. */
export function parsePermission(v: unknown): SpendPermission | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const addr = (x: unknown) => (typeof x === "string" && isAddress(x, { strict: false }) ? (x.toLowerCase() as Address) : null);
  const account = addr(o.account), spender = addr(o.spender), token = addr(o.token);
  const allowance = uint(o.allowance), period = uint(o.period), start = uint(o.start), end = uint(o.end), salt = uint(o.salt);
  const extraData = o.extraData === undefined ? "0x" : o.extraData;
  if (!account || !spender || !token || allowance === null || period === null || start === null || end === null || salt === null) return null;
  if (!isHex(extraData) || allowance > UINT160_MAX || salt >= 2n ** 256n) return null;
  if (period > BigInt(UINT48_MAX) || start > BigInt(UINT48_MAX) || end > BigInt(UINT48_MAX)) return null;
  return { account, spender, token, allowance, period: Number(period), start: Number(start), end: Number(end), salt, extraData };
}

export interface ExpectedPermission {
  /** The smart wallet the page reports. */
  account: Address;
  /** Our spender, the address of the key in CP_KONTO_KEY_FILE. */
  spender: Address;
  token: Address;
  /** daily_limit_usdc of the handoff. */
  allowance: bigint;
  nowSec: number;
}

/** True only for the permission this handoff asked for: right wallet, our spender, USDC, the daily limit per day, from now. */
export function permissionMatches(p: SpendPermission, want: ExpectedPermission): boolean {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  return (
    same(p.account, want.account) &&
    same(p.spender, want.spender) &&
    same(p.token, want.token) &&
    p.allowance === want.allowance &&
    p.period === PERIOD_SECONDS &&
    p.start <= want.nowSec + START_SKEW_SECONDS &&
    p.end > p.start
  );
}

/**
 * True when `signature` is the account's signature over the permission. Asks the chain through `client` (ERC-6492 universal
 * validator, so a wallet that is not deployed yet counts); any error is a no, never a yes.
 */
export async function signatureValid(client: PublicClient, chainId: number, p: SpendPermission, signature: Hex): Promise<boolean> {
  if (!isHex(signature) || signature.length < 132) return false;
  try {
    return await client.verifyTypedData({
      address: p.account,
      domain: spendPermissionDomain(chainId),
      types: SPEND_PERMISSION_TYPES,
      primaryType: "SpendPermission",
      message: { ...p },
      signature,
    });
  } catch {
    return false;
  }
}
