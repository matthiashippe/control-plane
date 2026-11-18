/**
 * The only way this service sends a transaction (goals/konto/03, loop-constraints.md rule 10, exception Base Sepolia).
 *
 * `sendKontoTx` calls `requireNet` before it touches the transport: a transaction goes out only on the chain the account is set to
 * (84532 by default, 8453 only through readKontoConfig with CP_KONTO_MAINNET=1), and any other chain never sees a request, not
 * even eth_chainId. The key comes only from the file in CP_KONTO_KEY_FILE, never from an environment variable with the value and
 * never from a key of the operator wallet; neither its content nor a part of it appears in an error, a log line or an answer.
 */
import { readFileSync } from "node:fs";
import { createWalletClient, type Address, type Hex, type LocalAccount, type Transport } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { KONTO_CHAIN_ID, SEPOLIA_NET, type KontoNet } from "./config.js";

/** Throws for every chain except Base Sepolia (84532). */
export function requireSepolia(chainId: unknown): void {
  if (chainId !== KONTO_CHAIN_ID) {
    throw new Error(`refused: the account sends on chain ${KONTO_CHAIN_ID} (Base Sepolia) only, not on ${String(chainId)}`);
  }
}

/** Throws for every chain except the one the account is set to (Base Sepolia when no setting is given). */
export function requireNet(chainId: unknown, net: KontoNet = SEPOLIA_NET): void {
  if (chainId !== net.chainId) {
    throw new Error(`refused: the account is set to chain ${net.chainId} (${net.name}) and sends nothing on ${String(chainId)}`);
  }
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
 * other chain is refused before the first request.
 */
export async function sendKontoTx(params: { chainId: number; net?: KontoNet; account: LocalAccount; transport: Transport; tx: KontoTx }): Promise<Hex> {
  const net = params.net ?? SEPOLIA_NET;
  requireNet(params.chainId, net);
  const wallet = createWalletClient({ account: params.account, chain: net.chain, transport: params.transport });
  return wallet.sendTransaction({ to: params.tx.to, data: params.tx.data, gas: params.tx.gas, chain: net.chain, account: params.account });
}
