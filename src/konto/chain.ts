/**
 * The only way this service sends a transaction (goals/konto/03, loop-constraints.md rule 10, exception Base Sepolia).
 *
 * `sendKontoTx` calls `requireSepolia` before it touches the transport, so a chain other than 84532 never sees a request, not
 * even eth_chainId. The key comes only from the file in CP_KONTO_KEY_FILE, never from an environment variable with the value and
 * never from a key of the operator wallet; neither its content nor a part of it appears in an error, a log line or an answer.
 */
import { readFileSync } from "node:fs";
import { createWalletClient, type Address, type Hex, type LocalAccount, type Transport } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { KONTO_CHAIN_ID } from "./config.js";

/** Throws for every chain except Base Sepolia (84532). */
export function requireSepolia(chainId: unknown): void {
  if (chainId !== KONTO_CHAIN_ID) {
    throw new Error(`refused: the account sends on chain ${KONTO_CHAIN_ID} (Base Sepolia) only, not on ${String(chainId)}`);
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

/** Sends one transaction on Base Sepolia and returns its hash. Refuses any other chain before the first request. */
export async function sendKontoTx(params: { chainId: number; account: LocalAccount; transport: Transport; tx: KontoTx }): Promise<Hex> {
  requireSepolia(params.chainId);
  const wallet = createWalletClient({ account: params.account, chain: baseSepolia, transport: params.transport });
  return wallet.sendTransaction({ to: params.tx.to, data: params.tx.data, gas: params.tx.gas, chain: baseSepolia, account: params.account });
}
