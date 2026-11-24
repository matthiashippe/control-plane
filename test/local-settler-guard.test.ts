/**
 * goals/regeln/01, point 2: LocalSettler asks the node with web3_clientVersion before it sends and settles only on a node that
 * reports itself as anvil. Any other node, or one that does not answer, gets no transaction.
 */
import { describe, expect, it } from "vitest";
import { custom, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { LocalSettler, type Authorization } from "../src/payments/settler.js";

const HASH = ("0x" + "cd".repeat(32)) as Hex;
const BLOCK = ("0x" + "ef".repeat(32)) as Hex;
const USDC: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const signer = privateKeyToAccount(generatePrivateKey());
const auth: Authorization = {
  from: signer.address,
  to: "0x2222222222222222222222222222222222222222",
  value: 1_000_000n,
  validAfter: 0n,
  validBefore: 2n ** 40n,
  nonce: ("0x" + "11".repeat(32)) as Hex,
};
const signature = ("0x" + "ab".repeat(32) + "cd".repeat(32) + "1b") as Hex;

/** A node on chain 8453 that calls itself `version` (or does not answer web3_clientVersion when it is null). */
function node(version: string | null) {
  const calls: string[] = [];
  const transport = custom({
    async request({ method }: { method: string }) {
      calls.push(method);
      switch (method) {
        case "web3_clientVersion":
          if (version === null) throw Object.assign(new Error("method not found"), { code: -32601 });
          return version;
        case "eth_chainId": return "0x2105";
        case "eth_getTransactionCount": return "0x0";
        case "eth_estimateGas": return "0x5208";
        case "eth_maxPriorityFeePerGas": return "0x1";
        case "eth_gasPrice": return "0x2";
        case "eth_blockNumber": return "0x2";
        case "eth_getBlockByNumber": return { baseFeePerGas: "0x1", number: "0x2", hash: BLOCK, timestamp: "0x1", transactions: [] };
        case "eth_sendRawTransaction": return HASH;
        case "eth_getTransactionByHash": return null;
        case "eth_getTransactionReceipt":
          return {
            transactionHash: HASH,
            transactionIndex: "0x0",
            blockHash: BLOCK,
            blockNumber: "0x2",
            from: signer.address,
            to: USDC,
            cumulativeGasUsed: "0x5208",
            gasUsed: "0x5208",
            effectiveGasPrice: "0x2",
            contractAddress: null,
            logs: [],
            logsBloom: "0x" + "00".repeat(256),
            status: "0x1",
            type: "0x2",
          };
        // Like a node without the method (eth_fillTransaction): viem fills the transaction itself and does not retry.
        default: throw Object.assign(new Error(`unexpected ${method}`), { code: -32601 });
      }
    },
  });
  return { calls, transport };
}

function settler(transport: ReturnType<typeof node>["transport"]): LocalSettler {
  return new LocalSettler({ rpcUrl: "http://127.0.0.1:9", chainId: 8453, usdcAddress: USDC, relayerKey: generatePrivateKey(), transport });
}

describe("LocalSettler only on anvil", () => {
  it("refuses to settle on a node that is not anvil, without a transaction", async () => {
    for (const version of ["Geth/v1.14.0-stable/linux-amd64/go1.22", "reth/v1.1.0", "op-geth/v1.101411.0", "Anvil/v1.0.0", " anvil/v1.0.0", "", null]) {
      const n = node(version);
      const result = await settler(n.transport).settle(auth, signature);
      expect(result.ok, String(version)).toBe(false);
      expect(result.txHash, String(version)).toBeUndefined();
      expect(result.error, String(version)).toMatch(/anvil/);
      expect(n.calls, String(version)).not.toContain("eth_sendRawTransaction");
      expect(n.calls[0], String(version)).toBe("web3_clientVersion");
    }
  });

  it("settles on anvil and asks before the first transaction", async () => {
    const n = node("anvil/v1.4.3");
    const s = settler(n.transport);
    const result = await s.settle(auth, signature);
    expect(result).toEqual({ ok: true, txHash: HASH });
    expect(n.calls[0]).toBe("web3_clientVersion");
    expect(n.calls).toContain("eth_sendRawTransaction");
    expect(n.calls.indexOf("web3_clientVersion")).toBeLessThan(n.calls.indexOf("eth_sendRawTransaction"));
    expect(await s.settle(auth, signature)).toEqual({ ok: true, txHash: HASH });
  });
});
