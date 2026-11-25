/**
 * The only way this service sends a transaction (goals/konto/03, loop-constraints.md rule 10, exception Base Sepolia).
 *
 * `sendKontoTx` calls `requireNet` before it touches the transport: a transaction goes out only on the chain the account is set to
 * (84532 by default, 8453 only through readKontoConfig with CP_KONTO_MAINNET=1), and any other chain never sees a request, not
 * even eth_chainId. The key comes only from the file in CP_KONTO_KEY_FILE, never from an environment variable with the value and
 * never from a key of the operator wallet; neither its content nor a part of it appears in an error, a log line or an answer.
 *
 * On Base (8453) `requireRule10` also checks the kind of transaction (goals/regeln/01, rule 10, exception main network): only
 * approveWithSignature, revokeAsSpender and spend at SPEND_PERMISSION_MANAGER, the deployment of a forwarder at DEPLOY_PROXY and a
 * call of payout or retire at the forwarder that is the spender of the permission in its data go out. Everything else, empty data
 * and handleOps included, is refused before the first request. On Base Sepolia only the chain is checked.
 *
 * A deployment of a forwarder on Base also has its arguments checked (goals/regeln/02): behind the prefix stand exactly five
 * ABI-encoded addresses (account, destination, token, manager, caller), token is MAINNET_USDC, manager is SPEND_PERMISSION_MANAGER
 * and caller is the address of the key that sends. The length is exact because the constructor reads its arguments from the end of
 * the init code: words appended behind our own five would be the ones it builds with.
 */
import { readFileSync } from "node:fs";
import {
  concat,
  createWalletClient,
  decodeAbiParameters,
  decodeFunctionData,
  encodeAbiParameters,
  getAbiItem,
  slice,
  toFunctionSelector,
  type Address,
  type Hex,
  type LocalAccount,
  type Transport,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { KONTO_CHAIN_ID, MAINNET_CHAIN_ID, MAINNET_USDC, SEPOLIA_NET, SPEND_PERMISSION_MANAGER, type KontoNet } from "./config.js";
import { FORWARDER_ABI, FORWARDER_BYTECODE } from "./forwarder.js";
import { DEPLOY_PROXY, FORWARDER_SALT } from "./payout.js";
import { SPEND_PERMISSION_MANAGER_ABI } from "./topup.js";

/** Throws for every chain except Base Sepolia (84532). */
export function requireSepolia(chainId: unknown): void {
  if (chainId !== KONTO_CHAIN_ID) {
    throw new Error(`refused: the account sends on chain ${KONTO_CHAIN_ID} (Base Sepolia) only, not on ${String(chainId)}`);
  }
}

/** Throws for every chain except the one the account is set to (Base Sepolia when no setting is given). */
export function requireNet(chainId: unknown, net: KontoNet = SEPOLIA_NET): void {
  // Base Sepolia, the default, is guarded by requireSepolia alone; only the main network (CP_KONTO_MAINNET=1) has its own check.
  if (net.chainId === KONTO_CHAIN_ID) return requireSepolia(chainId);
  if (chainId !== net.chainId) {
    throw new Error(`refused: the account is set to chain ${net.chainId} (${net.name}) and sends nothing on ${String(chainId)}`);
  }
}

interface Rule10 {
  manager: Set<Hex>;
  forwarder: Set<Hex>;
  deployPrefix: Hex;
}

let rule10: Rule10 | null = null;

/**
 * The kinds of rule 10, computed from the ABIs on first use and never written down as hex. Lazy because payout.ts and topup.ts
 * import this module, so their constants are not there yet while it loads.
 */
function rule10Kinds(): Rule10 {
  if (rule10) return rule10;
  const lower = (h: Hex) => h.toLowerCase() as Hex;
  rule10 = {
    manager: new Set(
      (["approveWithSignature", "revokeAsSpender", "spend"] as const).map((name) => lower(toFunctionSelector(getAbiItem({ abi: SPEND_PERMISSION_MANAGER_ABI, name })))),
    ),
    forwarder: new Set((["payout", "retire"] as const).map((name) => lower(toFunctionSelector(getAbiItem({ abi: FORWARDER_ABI, name }))))),
    deployPrefix: concat([FORWARDER_SALT, FORWARDER_BYTECODE]).toLowerCase() as Hex,
  };
  return rule10;
}

/**
 * The spender of the permission in a call of payout or retire, lower case; null when the data does not decode. A forwarder is the
 * spender of its own permission, so a call whose target is not that spender is no call of our own forwarder.
 */
function spenderOf(data: Hex): string | null {
  try {
    const { args } = decodeFunctionData({ abi: FORWARDER_ABI, data });
    const permission = args?.[0] as { spender?: unknown } | undefined;
    return typeof permission?.spender === "string" ? permission.spender.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** The constructor arguments of the forwarder, in the order forwarderInitCode encodes them. */
const FORWARDER_ARGS = [
  { name: "account", type: "address" },
  { name: "destination", type: "address" },
  { name: "token", type: "address" },
  { name: "manager", type: "address" },
  { name: "caller", type: "address" },
] as const;

const FORWARDER_ARGS_SIZE = 32 * FORWARDER_ARGS.length;

/**
 * The first argument of a forwarder deployment behind `prefix` that rule 10 does not allow on Base, or null when all five fit.
 * `length` when the bytes behind the prefix are not exactly five words or a word is no clean address.
 */
function deployArgumentFault(data: Hex, prefix: Hex, sender: Address): string | null {
  const args = `0x${data.slice(prefix.length)}` as Hex;
  // Count hex digits, not bytes: a byte count rounds an odd number of digits up, so one missing digit would pass as five words.
  if (args.length - 2 !== 2 * FORWARDER_ARGS_SIZE) return "length";
  let values: readonly [Address, Address, Address, Address, Address];
  try {
    values = decodeAbiParameters(FORWARDER_ARGS, args);
  } catch {
    return "length";
  }
  // Only canonical words: an address word with bits above the 20 bytes would decode the same but is not what we encode.
  const canonical = encodeAbiParameters(FORWARDER_ARGS, values).toLowerCase() as Hex;
  if (canonical !== args) {
    const at = FORWARDER_ARGS.findIndex((_, i) => slice(canonical, 32 * i, 32 * (i + 1)) !== slice(args, 32 * i, 32 * (i + 1)));
    return FORWARDER_ARGS[at]?.name ?? "length";
  }
  const [, , token, manager, caller] = values.map((v) => v.toLowerCase());
  if (token !== MAINNET_USDC.toLowerCase()) return "token";
  if (manager !== SPEND_PERMISSION_MANAGER.toLowerCase()) return "manager";
  if (caller !== sender.toLowerCase()) return "caller";
  return null;
}

/**
 * Throws for every transaction on Base (8453) that rule 10 does not name. `sender` is the address of the key that sends; a
 * forwarder deployment must name it as caller. The error names target, selector and the argument that does not fit, never the
 * data or a value. Other chains are not checked here.
 */
export function requireRule10(chainId: number, tx: Pick<KontoTx, "to" | "data">, sender: Address): void {
  if (chainId !== MAINNET_CHAIN_ID) return;
  const kinds = rule10Kinds();
  const to = String(tx.to).toLowerCase();
  const data = String(tx.data).toLowerCase() as Hex;
  const selector = /^0x[0-9a-f]{8}/.test(data) ? (slice(data, 0, 4) as Hex) : null;
  if (selector && to === SPEND_PERMISSION_MANAGER.toLowerCase() && kinds.manager.has(selector)) return;
  if (to === DEPLOY_PROXY.toLowerCase() && data.startsWith(kinds.deployPrefix)) {
    const fault = deployArgumentFault(data, kinds.deployPrefix, sender);
    if (!fault) return;
    throw new Error(`refused: rule 10 sends nothing on chain ${chainId} to ${to} with selector ${selector ?? "none"}: forwarder argument ${fault} does not fit`);
  }
  if (selector && kinds.forwarder.has(selector) && spenderOf(data) === to) return;
  throw new Error(`refused: rule 10 sends nothing on chain ${chainId} to ${to} with selector ${selector ?? "none"}`);
}

/** The test key from its file. The error says what is wrong with the file, never what is in it. */
export function loadKontoKey(file: string): LocalAccount {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    throw new Error("CP_KONTO_KEY_FILE cannot be read");
  }
  const key = raw.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("CP_KONTO_KEY_FILE does not hold one private key as 0x and 64 hex digits");
  return privateKeyToAccount(key as Hex);
}

export interface KontoTx {
  to: Address;
  data: Hex;
  /** A fixed gas limit; without it the node estimates one (and refuses a call that would revert). */
  gas?: bigint;
}

/**
 * Sends one transaction on `chainId` and returns its hash. `net` is the setting (Base Sepolia when left out); a transaction for any
 * other chain, and on Base every kind outside rule 10, is refused before the first request.
 */
export async function sendKontoTx(params: { chainId: number; net?: KontoNet; account: LocalAccount; transport: Transport; tx: KontoTx }): Promise<Hex> {
  const net = params.net ?? SEPOLIA_NET;
  requireNet(params.chainId, net);
  requireRule10(params.chainId, params.tx, params.account.address);
  const wallet = createWalletClient({ account: params.account, chain: net.chain, transport: params.transport });
  return wallet.sendTransaction({ to: params.tx.to, data: params.tx.data, gas: params.tx.gas, chain: net.chain, account: params.account });
}
