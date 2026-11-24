/**
 * goals/regeln/01, point 1: on Base (8453) sendKontoTx sends only the kinds of transaction that rule 10 (exception main network)
 * names, and refuses everything else before the transport sees a request. On Base Sepolia (84532) only the chain is checked.
 */
import { describe, expect, it } from "vitest";
import { concat, custom, encodeFunctionData, type Address, type Hex } from "viem";
import { entryPoint06Abi } from "viem/account-abstraction";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sendKontoTx, type KontoTx } from "../src/konto/chain.js";
import { MAINNET_NET, MAINNET_USDC, SEPOLIA_NET, SPEND_PERMISSION_MANAGER } from "../src/konto/config.js";
import { FORWARDER_ABI } from "../src/konto/forwarder.js";
import {
  DEPLOY_PROXY,
  ENTRY_POINT,
  FORWARDER_SALT,
  forwarderAddress,
  forwarderInitCode,
  revokeUserOperation,
  type ForwarderFixed,
} from "../src/konto/payout.js";
import type { SpendPermission } from "../src/konto/permission.js";
import { SPEND_PERMISSION_MANAGER_ABI } from "../src/konto/topup.js";

const HASH = ("0x" + "cd".repeat(32)) as Hex;
const ACCOUNT: Address = "0x1111111111111111111111111111111111111111";
const DESTINATION: Address = "0x2222222222222222222222222222222222222222";
const OTHER: Address = "0x3333333333333333333333333333333333333333";

/** A transport that records every request and answers like a node of the chain `chainIdHex`. */
function node(chainIdHex: string) {
  const calls: string[] = [];
  const transport = custom({
    async request({ method }: { method: string }) {
      calls.push(method);
      switch (method) {
        case "eth_chainId": return chainIdHex;
        case "eth_getTransactionCount": return "0x0";
        case "eth_estimateGas": return "0x5208";
        case "eth_maxPriorityFeePerGas": return "0x1";
        case "eth_gasPrice": return "0x2";
        case "eth_getBlockByNumber": return { baseFeePerGas: "0x1", number: "0x1", hash: HASH, timestamp: "0x1", transactions: [] };
        case "eth_sendRawTransaction": return HASH;
        // Like a node without the method (eth_fillTransaction): viem falls back to its own filling and does not retry.
        default: throw Object.assign(new Error(`unexpected ${method}`), { code: -32601 });
      }
    },
  });
  return { calls, transport };
}

const account = privateKeyToAccount(generatePrivateKey());
const fixed: ForwarderFixed = { token: MAINNET_USDC, manager: SPEND_PERMISSION_MANAGER, caller: account.address };
const forwarder = forwarderAddress(ACCOUNT, DESTINATION, fixed);
const permission: SpendPermission = {
  account: ACCOUNT,
  spender: forwarder,
  token: MAINNET_USDC,
  allowance: 10_000_000n,
  period: 2_592_000,
  start: 1,
  end: 2 ** 48 - 1,
  salt: 7n,
  extraData: "0x",
};
const signature = ("0x" + "ab".repeat(65)) as Hex;

/** Every kind of transaction that rule 10 names for Base, built the way src/konto/payout.ts and src/konto/topup.ts build them. */
const RULE_10: Array<[string, KontoTx]> = [
  ["approveWithSignature", { to: SPEND_PERMISSION_MANAGER, data: encodeFunctionData({ abi: SPEND_PERMISSION_MANAGER_ABI, functionName: "approveWithSignature", args: [permission, signature] }) }],
  ["revokeAsSpender", { to: SPEND_PERMISSION_MANAGER, data: encodeFunctionData({ abi: SPEND_PERMISSION_MANAGER_ABI, functionName: "revokeAsSpender", args: [permission] }) }],
  ["spend", { to: SPEND_PERMISSION_MANAGER, data: encodeFunctionData({ abi: SPEND_PERMISSION_MANAGER_ABI, functionName: "spend", args: [permission, 1_000_000n] }) }],
  ["deploy of the forwarder", { to: DEPLOY_PROXY, data: concat([FORWARDER_SALT, forwarderInitCode(ACCOUNT, DESTINATION, fixed)]) }],
  ["payout", { to: forwarder, data: encodeFunctionData({ abi: FORWARDER_ABI, functionName: "payout", args: [permission, 1_000_000n] }) }],
  ["retire", { to: forwarder, data: encodeFunctionData({ abi: FORWARDER_ABI, functionName: "retire", args: [permission] }) }],
];

const handleOps: KontoTx = {
  to: ENTRY_POINT,
  data: encodeFunctionData({ abi: entryPoint06Abi, functionName: "handleOps", args: [[revokeUserOperation(permission, 0n, "0x")], account.address] }),
};

/** Transactions outside rule 10: a known selector at the wrong target, a foreign selector, a deploy that is not the forwarder. */
const OUTSIDE: Array<[string, KontoTx]> = [
  ["handleOps", handleOps],
  ["empty data", { to: OTHER, data: "0x" }],
  ["empty data at the manager", { to: SPEND_PERMISSION_MANAGER, data: "0x" }],
  ["spend at another contract", { to: OTHER, data: RULE_10[2][1].data }],
  ["approve of USDC", { to: MAINNET_USDC, data: ("0x095ea7b3" + "00".repeat(64)) as Hex }],
  ["transfer of USDC", { to: MAINNET_USDC, data: ("0xa9059cbb" + "00".repeat(64)) as Hex }],
  ["payout selector at the manager", { to: SPEND_PERMISSION_MANAGER, data: RULE_10[4][1].data }],
  ["deploy of other code", { to: DEPLOY_PROXY, data: concat([FORWARDER_SALT, "0x6080604052"]) }],
  ["deploy with another salt", { to: DEPLOY_PROXY, data: concat([("0x" + "01".repeat(32)) as Hex, forwarderInitCode(ACCOUNT, DESTINATION, fixed)]) }],
  ["three bytes", { to: forwarder, data: RULE_10[4][1].data.slice(0, 8) as Hex }],
];

describe("send guard of rule 10", () => {
  it("refuses handleOps on 8453 before the first request, naming target and selector but not the data", async () => {
    const main = node("0x2105");
    const err = await sendKontoTx({ chainId: 8453, net: MAINNET_NET, account, transport: main.transport, tx: handleOps }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    const message = (err as Error).message;
    expect(message).toMatch(/rule 10/);
    expect(message.toLowerCase()).toContain(ENTRY_POINT.toLowerCase());
    expect(message).toContain(handleOps.data.slice(0, 10));
    expect(message).not.toContain(handleOps.data.slice(10, 74));
    expect(main.calls).toEqual([]);
  });

  it("refuses empty data on 8453 before the first request", async () => {
    const main = node("0x2105");
    for (const to of [OTHER, SPEND_PERMISSION_MANAGER, DEPLOY_PROXY, forwarder]) {
      await expect(sendKontoTx({ chainId: 8453, net: MAINNET_NET, account, transport: main.transport, tx: { to, data: "0x" } })).rejects.toThrow(/rule 10/);
    }
    expect(main.calls).toEqual([]);
  });

  it("refuses every other kind outside rule 10 on 8453 before the first request", async () => {
    const main = node("0x2105");
    for (const [name, tx] of OUTSIDE) {
      await expect(sendKontoTx({ chainId: 8453, net: MAINNET_NET, account, transport: main.transport, tx }), name).rejects.toThrow(/rule 10/);
    }
    expect(main.calls).toEqual([]);
  });

  it("sends every kind of rule 10 on 8453, also with the target in mixed case", async () => {
    for (const [name, tx] of RULE_10) {
      for (const to of [tx.to.toLowerCase() as Address, tx.to]) {
        const main = node("0x2105");
        const hash = await sendKontoTx({ chainId: 8453, net: MAINNET_NET, account, transport: main.transport, tx: { ...tx, to, gas: 100_000n } });
        expect(hash, name).toBe(HASH);
        expect(main.calls, name).toContain("eth_sendRawTransaction");
      }
    }
  });

  it("keeps 84532 unchanged: every transaction goes out, inside or outside rule 10", async () => {
    for (const [name, tx] of [...RULE_10, ...OUTSIDE]) {
      const sepolia = node("0x14a34");
      const hash = await sendKontoTx({ chainId: 84532, account, transport: sepolia.transport, tx: { ...tx, gas: 100_000n } });
      expect(hash, name).toBe(HASH);
      expect(sepolia.calls, name).toContain("eth_sendRawTransaction");
      const explicit = node("0x14a34");
      expect(await sendKontoTx({ chainId: 84532, net: SEPOLIA_NET, account, transport: explicit.transport, tx: { ...tx, gas: 100_000n } }), name).toBe(HASH);
    }
  });
});
