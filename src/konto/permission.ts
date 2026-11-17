/**
 * The spend permission a person signs on the phone (goals/konto/03, docs/konto/konto.md "Erlaubnis"): SpendPermissionManager on
 * Base Sepolia, USDC only, only to our spender, at most the daily limit of the handoff per day.
 *
 * Two decisions with fixed names, because the counter-tests of the goal replace exactly these and expect the tests to fail:
 * - permissionMatches: is it the permission this handoff asked for?
 * - signatureValid: did the smart wallet sign it (ERC-1271, or ERC-6492 while the wallet is not deployed yet)?
 */
import { BaseError, createPublicClient, custom, isAddress, isHex, type Address, type Hex, type PublicClient } from "viem";
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
 * Thrown by signatureValid when the chain could not be asked (the RPC down, a timeout, a rate limit, an HTTP error): then nobody
 * knows whether the signature is valid, so the route answers 503 `signature_check_unavailable`, the handoff stays `matched`, and
 * the page sends the same signature again (goals/konto/05, point 7).
 */
export class SignatureCheckUnavailable extends Error {
  constructor() {
    super("the signature could not be checked: the chain did not answer");
    this.name = "SignatureCheckUnavailable";
  }
}

/** True when the node answered and the call reverted: the chain was asked and said no, which is not a failure of the transport. */
function isRevert(err: unknown): boolean {
  const reverted = (e: unknown) => {
    const x = e as { code?: unknown; name?: unknown; message?: unknown; details?: unknown } | null;
    if (!x || typeof x !== "object") return false;
    if (x.code === 3 || x.name === "ExecutionRevertedError" || x.name === "ContractFunctionRevertedError") return true;
    return /execution reverted/i.test(`${String(x.message ?? "")} ${String(x.details ?? "")}`);
  };
  if (err instanceof BaseError) return Boolean(err.walk(reverted)) || reverted(err);
  return reverted(err);
}

/**
 * True when `signature` is the account's signature over the permission. Asks the chain through `client` (ERC-6492 universal
 * validator, so a wallet that is not deployed yet counts), with viem's fallback to ecrecover. A chain that answers no, or a
 * signature that cannot be one, is false. A chain that could not be asked throws SignatureCheckUnavailable, never a yes: viem
 * turns a failed eth_call into false, so every request goes through a wrapper that notes a failure of the transport.
 */
export async function signatureValid(client: PublicClient, chainId: number, p: SpendPermission, signature: Hex): Promise<boolean> {
  if (!isHex(signature) || signature.length < 132) return false;
  let unavailable = false;
  const watched = createPublicClient({
    chain: client.chain,
    transport: custom(
      {
        async request(args: { method: string; params?: unknown }) {
          try {
            return await client.request(args as never);
          } catch (err) {
            if (!isRevert(err)) unavailable = true;
            throw err;
          }
        },
      },
      { retryCount: 0 },
    ),
  });
  let valid: boolean;
  try {
    valid = await watched.verifyTypedData({
      address: p.account,
      domain: spendPermissionDomain(chainId),
      types: SPEND_PERMISSION_TYPES,
      primaryType: "SpendPermission",
      message: { ...p },
      signature,
    });
  } catch {
    // What is left after a failed request is no answer; anything else is a signature that cannot be one.
    if (unavailable) throw new SignatureCheckUnavailable();
    return false;
  }
  // viem's fallback to ecrecover may say yes without the chain; a no after a failed request is no answer at all.
  if (!valid && unavailable) throw new SignatureCheckUnavailable();
  return valid;
}
