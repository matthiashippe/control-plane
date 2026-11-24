/**
 * Settlement of an EIP-3009 authorization (x402 "exact", USDC).
 *
 * In production an external facilitator handles this (CDP or PayAI; Goal 5), the control plane
 * never settles itself (regulation, docs/research 6.3). LocalSettler exists only for the harness:
 * it sends `transferWithAuthorization` to a local Anvil chain.
 *
 * The harness chain runs with chainId 8453 like Base, so the chain id cannot tell the two apart (goals/regeln/01). Before its first
 * transaction LocalSettler therefore asks the node with web3_clientVersion and settles only when the answer starts with `anvil/`;
 * a node of Base never reports itself as anvil.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseSignature,
  type Address,
  type Hex,
  type Transport,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { FacilitatorSettler } from "./facilitator.js";
import type { PayConfig } from "./pay.js";

export interface Authorization {
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
}

export interface SettleResult {
  ok: boolean;
  txHash?: Hex;
  error?: string;
}

export interface Settler {
  readonly kind: string;
  /** `resource` is the path of the paid request (facilitators want it in the requirements). */
  settle(auth: Authorization, signature: Hex, resource?: string): Promise<SettleResult>;
}

const TRANSFER_WITH_AUTHORIZATION_ABI = [
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

export interface LocalSettlerConfig {
  rpcUrl: string;
  chainId: number;
  usdcAddress: Address;
  /** Relayer that sends the transaction and pays the gas (Anvil account). */
  relayerKey: Hex;
  /** The transport to the node; http(rpcUrl) when left out. */
  transport?: Transport;
}

/** The prefix of web3_clientVersion of an Anvil node. */
export const ANVIL_CLIENT_PREFIX = "anvil/";

/** Harness only. Sends the authorization to the chain itself. */
export class LocalSettler implements Settler {
  readonly kind = "local";
  private readonly chain;
  private readonly account;
  private readonly transport: Transport;
  /** Set once the node reported itself as anvil. */
  private anvil = false;

  constructor(private readonly cfg: LocalSettlerConfig) {
    this.chain = {
      id: cfg.chainId,
      name: `local-${cfg.chainId}`,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [cfg.rpcUrl] } },
    } as const;
    this.account = privateKeyToAccount(cfg.relayerKey);
    this.transport = cfg.transport ?? http(cfg.rpcUrl, { timeout: 20_000 });
  }

  /** Whether the node reports itself as anvil; asked until it does once. A node that does not answer is not anvil. */
  private async onAnvil(pub: { request: (args: { method: "web3_clientVersion" }) => Promise<unknown> }): Promise<boolean> {
    if (this.anvil) return true;
    let version: unknown;
    try {
      version = await pub.request({ method: "web3_clientVersion" });
    } catch {
      return false;
    }
    this.anvil = typeof version === "string" && version.startsWith(ANVIL_CLIENT_PREFIX);
    return this.anvil;
  }

  async settle(auth: Authorization, signature: Hex): Promise<SettleResult> {
    try {
      const pub = createPublicClient({ chain: this.chain, transport: this.transport });
      if (!(await this.onAnvil(pub))) {
        return { ok: false, error: "refused: the local settler sends only to an anvil node, and this node does not report itself as anvil" };
      }
      const { v, r, s } = parseSignature(signature);
      const wallet = createWalletClient({ account: this.account, chain: this.chain, transport: this.transport });
      const txHash = await wallet.writeContract({
        address: this.cfg.usdcAddress,
        abi: TRANSFER_WITH_AUTHORIZATION_ABI,
        functionName: "transferWithAuthorization",
        args: [auth.from, auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce, Number(v ?? 27n), r, s],
      });
      const receipt = await pub.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });
      if (receipt.status !== "success") {
        return { ok: false, txHash, error: "transaction reverted" };
      }
      return { ok: true, txHash };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

/** Builds the settler from the environment. Without CP_SETTLER there is none and /pay answers 503. */
export function settlerFromEnv(env: NodeJS.ProcessEnv, pay: PayConfig | null): Settler | null {
  const kind = env.CP_SETTLER;
  if (!kind) return null;
  if (kind === "facilitator") {
    if (!pay) throw new Error("CP_SETTLER=facilitator needs CP_PAY_TO");
    return new FacilitatorSettler({
      url: env.CP_FACILITATOR_URL || "https://facilitator.payai.network",
      authHeader: env.CP_FACILITATOR_AUTH || undefined,
      network: pay.network,
      payTo: pay.payTo,
      usdcAddress: pay.usdcAddress,
      maxTimeoutSeconds: pay.maxTimeoutSeconds,
    });
  }
  if (kind === "local") {
    const rpcUrl = env.CP_RPC_URL;
    const relayerKey = env.CP_SETTLER_KEY as Hex | undefined;
    const usdcAddress = env.CP_USDC_ADDRESS as Address | undefined;
    const chainId = Number(env.CP_CHAIN_ID || 8453);
    if (!rpcUrl || !relayerKey || !usdcAddress) {
      throw new Error("CP_SETTLER=local needs CP_RPC_URL, CP_SETTLER_KEY and CP_USDC_ADDRESS");
    }
    return new LocalSettler({ rpcUrl, relayerKey, usdcAddress, chainId });
  }
  throw new Error(`Unknown CP_SETTLER: ${kind}`);
}
