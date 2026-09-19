/**
 * Settlement einer EIP-3009-Autorisierung (x402 "exact", USDC).
 *
 * Im Betrieb übernimmt das ein externer Facilitator (CDP oder PayAI; Goal 5), das Control Plane
 * settlet nie selbst (Regulatorik, docs/research 6.3). Der LocalSettler existiert nur für den
 * Harness: er schickt `transferWithAuthorization` an eine lokale Anvil-Chain.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseSignature,
  type Address,
  type Hex,
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
  /** `resource` ist der Pfad des bezahlten Requests (Facilitatoren wollen ihn in den Requirements). */
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
  /** Relayer, der die Transaktion sendet und Gas zahlt (Anvil-Account). */
  relayerKey: Hex;
}

/** Nur für den Harness. Sendet die Autorisierung selbst an die Chain. */
export class LocalSettler implements Settler {
  readonly kind = "local";
  private readonly chain;
  private readonly account;

  constructor(private readonly cfg: LocalSettlerConfig) {
    this.chain = {
      id: cfg.chainId,
      name: `local-${cfg.chainId}`,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [cfg.rpcUrl] } },
    } as const;
    this.account = privateKeyToAccount(cfg.relayerKey);
  }

  async settle(auth: Authorization, signature: Hex): Promise<SettleResult> {
    try {
      const { v, r, s } = parseSignature(signature);
      const wallet = createWalletClient({
        account: this.account,
        chain: this.chain,
        transport: http(this.cfg.rpcUrl, { timeout: 20_000 }),
      });
      const pub = createPublicClient({ chain: this.chain, transport: http(this.cfg.rpcUrl, { timeout: 20_000 }) });
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

/** Baut den Settler aus der Umgebung. Ohne CP_SETTLER gibt es keinen, /pay antwortet dann 503. */
export function settlerFromEnv(env: NodeJS.ProcessEnv, pay: PayConfig | null): Settler | null {
  const kind = env.CP_SETTLER;
  if (!kind) return null;
  if (kind === "facilitator") {
    if (!pay) throw new Error("CP_SETTLER=facilitator braucht CP_PAY_TO");
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
      throw new Error("CP_SETTLER=local braucht CP_RPC_URL, CP_SETTLER_KEY und CP_USDC_ADDRESS");
    }
    return new LocalSettler({ rpcUrl, relayerKey, usdcAddress, chainId });
  }
  throw new Error(`Unbekannter CP_SETTLER: ${kind}`);
}
