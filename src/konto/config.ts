/**
 * Whether the account of goals/konto/03 is on, and with which values (docs/konto/konto.md, "Base Sepolia").
 *
 * The account is off as long as CP_KONTO_CHAIN_ID is missing: then `step: "konto"` and /h/{code}/konto answer 503. The only value
 * that switches it on is 84532 (Base Sepolia); any other value stops the service at start, because a typo that reached the main
 * network would book credits from real money on a path that was only ever proven with test money. No deploy file sets any
 * CP_KONTO_* variable, so production stays off until konto 05 (loop-constraints.md, rule 10, exception Base Sepolia).
 *
 * konto 05 prepares the main network (loop-constraints.md, rule 10, exception main network): 8453 (Base) is accepted only together
 * with CP_KONTO_MAINNET=1, which only Matthias sets in /opt/control-plane/.env. Without the switch 8453 stops the start like any
 * other chain, and every chain other than 84532 and 8453 stops it even with the switch.
 */
import type { Chain } from "viem";
import { base, baseSepolia } from "viem/chains";

/** Base Sepolia, the chain this code sends on unless the main network is switched on. */
export const KONTO_CHAIN_ID = 84532;
/** Base, the main network; only with CP_KONTO_MAINNET=1. */
export const MAINNET_CHAIN_ID = 8453;
/** SpendPermissionManager, the same address on Base and Base Sepolia. */
export const SPEND_PERMISSION_MANAGER = "0xf85210b21cc50302f477ba56686d2019dc9b67ad" as const;
/** Test USDC of Circle on Base Sepolia. */
export const SEPOLIA_USDC = "0x036cbd53842c5426634e7929541ec2318f3dcf7e" as const;
/** USDC of Circle on Base. */
export const MAINNET_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

/** The chain the account is set to: everything that sends or reads takes its values from here, never from a second source. */
export interface KontoNet {
  chainId: typeof KONTO_CHAIN_ID | typeof MAINNET_CHAIN_ID;
  name: string;
  chain: Chain;
  usdc: `0x${string}`;
  rpcUrl: string;
}

export const SEPOLIA_NET: KontoNet = { chainId: KONTO_CHAIN_ID, name: "Base Sepolia", chain: baseSepolia, usdc: SEPOLIA_USDC, rpcUrl: "https://sepolia.base.org" };
export const MAINNET_NET: KontoNet = { chainId: MAINNET_CHAIN_ID, name: "Base", chain: base, usdc: MAINNET_USDC, rpcUrl: "https://mainnet.base.org" };

/**
 * The setting for the value of CP_KONTO_CHAIN_ID. 84532 always, 8453 only with `mainnet` (CP_KONTO_MAINNET=1), anything else
 * throws, so a typo never reaches the main network.
 */
export function kontoNet(raw: string, mainnet: boolean): KontoNet {
  const v = raw.trim();
  if (v === String(KONTO_CHAIN_ID)) return SEPOLIA_NET;
  if (v === String(MAINNET_CHAIN_ID)) {
    if (mainnet) return MAINNET_NET;
    throw new Error(`CP_KONTO_CHAIN_ID ${MAINNET_CHAIN_ID} (Base) needs CP_KONTO_MAINNET=1; without it only ${KONTO_CHAIN_ID} (Base Sepolia) runs`);
  }
  throw new Error(`CP_KONTO_CHAIN_ID must be ${KONTO_CHAIN_ID} (Base Sepolia), ${MAINNET_CHAIN_ID} (Base, with CP_KONTO_MAINNET=1) or unset, got "${raw}"; the account never runs on another chain`);
}
/** One day: the period of every allowance. */
export const PERIOD_SECONDS = 86_400;

export interface KontoConfig {
  chainId: KontoNet["chainId"];
  net: KontoNet;
  /** JSON-RPC of the chain, for signatures of accounts not yet deployed and for every transaction. */
  rpcUrl: string;
  /** File with the test key that pays gas and receives what spend() moves; never its content. */
  keyFile: string | null;
  /** Below this balance (atomic USDC) an account is topped up. */
  topupBelowUsdc: bigint;
  /** How much one top-up takes (atomic USDC), at most what is left of the period. */
  topupUsdc: bigint;
  token: KontoNet["usdc"];
  manager: typeof SPEND_PERMISSION_MANAGER;
  /** Public ID of Turnkey's Auth Proxy configuration the page signs up with; not a secret, Turnkey hands it to browsers. */
  authProxyId: string | null;
}

function atomic(name: string, raw: string | undefined, fallback: bigint): bigint {
  if (raw === undefined || raw === "") return fallback;
  if (!/^[0-9]{1,18}$/.test(raw) || BigInt(raw) <= 0n) throw new Error(`${name} must be a positive whole number of atomic USDC, got "${raw}"`);
  return BigInt(raw);
}

/**
 * Null while the account is off; throws for any chain other than 84532, and for 8453 without CP_KONTO_MAINNET=1, so the service
 * does not start.
 */
export function readKontoConfig(env: Record<string, string | undefined>): KontoConfig | null {
  const raw = env.CP_KONTO_CHAIN_ID;
  if (raw === undefined || raw.trim() === "") return null;
  const net = kontoNet(raw, env.CP_KONTO_MAINNET === "1");
  return {
    chainId: net.chainId,
    net,
    rpcUrl: env.CP_KONTO_RPC_URL || net.rpcUrl,
    keyFile: env.CP_KONTO_KEY_FILE || null,
    topupBelowUsdc: atomic("CP_KONTO_TOPUP_BELOW_USDC", env.CP_KONTO_TOPUP_BELOW_USDC, 1_000_000n),
    topupUsdc: atomic("CP_KONTO_TOPUP_USDC", env.CP_KONTO_TOPUP_USDC, 2_000_000n),
    token: net.usdc,
    manager: SPEND_PERMISSION_MANAGER,
    authProxyId: env.CP_KONTO_AUTH_PROXY_ID?.trim() || null,
  };
}
