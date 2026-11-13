/**
 * Whether the account of goals/konto/03 is on, and with which values (docs/konto/konto.md, "Base Sepolia").
 *
 * The account is off as long as CP_KONTO_CHAIN_ID is missing: then `step: "konto"` and /h/{code}/konto answer 503. The only value
 * that switches it on is 84532 (Base Sepolia); any other value stops the service at start, because a typo that reached the main
 * network would book credits from real money on a path that was only ever proven with test money. No deploy file sets any
 * CP_KONTO_* variable, so production stays off until konto 05 (loop-constraints.md, rule 10, exception Base Sepolia).
 */

/** Base Sepolia, the only chain this code sends on. */
export const KONTO_CHAIN_ID = 84532;
/** SpendPermissionManager, the same address on Base and Base Sepolia. */
export const SPEND_PERMISSION_MANAGER = "0xf85210b21cc50302f477ba56686d2019dc9b67ad" as const;
/** Test USDC of Circle on Base Sepolia. */
export const SEPOLIA_USDC = "0x036cbd53842c5426634e7929541ec2318f3dcf7e" as const;
/** One day: the period of every allowance. */
export const PERIOD_SECONDS = 86_400;

export interface KontoConfig {
  chainId: typeof KONTO_CHAIN_ID;
  /** JSON-RPC of Base Sepolia, for signatures of accounts not yet deployed and for every transaction. */
  rpcUrl: string;
  /** File with the test key that pays gas and receives what spend() moves; never its content. */
  keyFile: string | null;
  /** Below this balance (atomic USDC) an account is topped up. */
  topupBelowUsdc: bigint;
  /** How much one top-up takes (atomic USDC), at most what is left of the period. */
  topupUsdc: bigint;
  token: typeof SEPOLIA_USDC;
  manager: typeof SPEND_PERMISSION_MANAGER;
}

function atomic(name: string, raw: string | undefined, fallback: bigint): bigint {
  if (raw === undefined || raw === "") return fallback;
  if (!/^[0-9]{1,18}$/.test(raw) || BigInt(raw) <= 0n) throw new Error(`${name} must be a positive whole number of atomic USDC, got "${raw}"`);
  return BigInt(raw);
}

/** Null while the account is off; throws for any chain other than 84532, so the service does not start. */
export function readKontoConfig(env: Record<string, string | undefined>): KontoConfig | null {
  const raw = env.CP_KONTO_CHAIN_ID;
  if (raw === undefined || raw.trim() === "") return null;
  if (raw.trim() !== String(KONTO_CHAIN_ID)) {
    throw new Error(`CP_KONTO_CHAIN_ID must be ${KONTO_CHAIN_ID} (Base Sepolia) or unset, got "${raw}"; the account never runs on another chain`);
  }
  return {
    chainId: KONTO_CHAIN_ID,
    rpcUrl: env.CP_KONTO_RPC_URL || "https://sepolia.base.org",
    keyFile: env.CP_KONTO_KEY_FILE || null,
    topupBelowUsdc: atomic("CP_KONTO_TOPUP_BELOW_USDC", env.CP_KONTO_TOPUP_BELOW_USDC, 1_000_000n),
    topupUsdc: atomic("CP_KONTO_TOPUP_USDC", env.CP_KONTO_TOPUP_USDC, 2_000_000n),
    token: SEPOLIA_USDC,
    manager: SPEND_PERMISSION_MANAGER,
  };
}
