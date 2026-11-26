/**
 * goals/regeln/01, point 1: on Base (8453) sendKontoTx sends only the kinds of transaction that rule 10 (exception main network)
 * names, and refuses everything else before the transport sees a request. On Base Sepolia (84532) only the chain is checked.
 * goals/regeln/02: a forwarder deploy on 8453 also carries exactly five addresses behind the prefix, with our token, manager and
 * caller (the address of the sending key).
 * goals/regeln/03: payout and retire on 8453 go out only at the forwarder that forwarderAddress computes for the account of the
 * permission, the destination the caller names and our fixed values; without the destination they are refused.
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
  ["payout", { to: forwarder, data: encodeFunctionData({ abi: FORWARDER_ABI, functionName: "payout", args: [permission, 1_000_000n] }), forwarder: { destination: DESTINATION } }],
  ["retire", { to: forwarder, data: encodeFunctionData({ abi: FORWARDER_ABI, functionName: "retire", args: [permission] }), forwarder: { destination: DESTINATION } }],
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

  it("refuses payout and retire at an address that is not the spender on 8453 before the first request", async () => {
    const main = node("0x2105");
    const otherForwarder = forwarderAddress(ACCOUNT, OTHER, fixed);
    const foreign = { ...permission, spender: otherForwarder };
    const cases: Array<[string, KontoTx]> = [
      ["payout at another address", { to: OTHER, data: RULE_10[4][1].data }],
      ["retire at another address", { to: OTHER, data: RULE_10[5][1].data }],
      ["payout at USDC", { to: MAINNET_USDC, data: RULE_10[4][1].data }],
      ["retire at USDC", { to: MAINNET_USDC, data: RULE_10[5][1].data }],
      ["payout at our forwarder for another spender", { to: forwarder, data: encodeFunctionData({ abi: FORWARDER_ABI, functionName: "payout", args: [foreign, 1_000_000n] }) }],
      ["retire at our forwarder for another spender", { to: forwarder, data: encodeFunctionData({ abi: FORWARDER_ABI, functionName: "retire", args: [foreign] }) }],
      ["payout selector without arguments", { to: forwarder, data: RULE_10[4][1].data.slice(0, 10) as Hex }],
      ["retire with cut arguments", { to: forwarder, data: RULE_10[5][1].data.slice(0, 200) as Hex }],
    ];
    // The same cases with the destination of our forwarder: naming it does not make another target or cut data pass.
    cases.push(...cases.map(([name, tx]): [string, KontoTx] => [`${name}, with the forwarder destination`, { ...tx, forwarder: { destination: DESTINATION } }]));
    for (const [name, tx] of cases) {
      await expect(sendKontoTx({ chainId: 8453, net: MAINNET_NET, account, transport: main.transport, tx }), name).rejects.toThrow(/rule 10/);
    }
    expect(main.calls).toEqual([]);
  });

  /** Payout and retire of `p` at `to`, as src/konto/payout.ts builds them, with the forwarder destination `destination` if given. */
  const forwarderCalls = (to: Address, p: SpendPermission, destination?: Address): Array<[string, KontoTx]> => {
    const extra = destination ? { forwarder: { destination } } : {};
    return [
      ["payout", { to, data: encodeFunctionData({ abi: FORWARDER_ABI, functionName: "payout", args: [p, 1_000_000n] }), ...extra }],
      ["retire", { to, data: encodeFunctionData({ abi: FORWARDER_ABI, functionName: "retire", args: [p] }), ...extra }],
    ];
  };

  /** A contract no proxy deployment of ours made, which names itself as spender of a permission of ACCOUNT. */
  const FOREIGN: Address = "0x4444444444444444444444444444444444444444";
  /** The forwarder of the same account for another destination, the spender of its own permission. */
  const otherDestinationForwarder = forwarderAddress(ACCOUNT, OTHER, fixed);
  /** The forwarder of the same account and destination, but deployed for another caller (a gas key that is not the sending one). */
  const otherCallerForwarder = forwarderAddress(ACCOUNT, DESTINATION, { ...fixed, caller: OTHER });

  const foreignCases = (): Array<[string, KontoTx]> => [
    ...forwarderCalls(FOREIGN, { ...permission, spender: FOREIGN }, DESTINATION).map(([n, tx]): [string, KontoTx] => [`${n} naming our destination`, tx]),
    ...forwarderCalls(FOREIGN, { ...permission, spender: FOREIGN }, OTHER).map(([n, tx]): [string, KontoTx] => [`${n} naming another destination`, tx]),
    ...forwarderCalls(FOREIGN, { ...permission, spender: FOREIGN }, FOREIGN).map(([n, tx]): [string, KontoTx] => [`${n} naming itself as destination`, tx]),
    ...forwarderCalls(FOREIGN, { ...permission, spender: FOREIGN }).map(([n, tx]): [string, KontoTx] => [`${n} without a destination`, tx]),
  ];
  const missingCases = (): Array<[string, KontoTx]> => [
    ...forwarderCalls(forwarder, permission),
    ...forwarderCalls(otherDestinationForwarder, { ...permission, spender: otherDestinationForwarder }).map(([n, tx]): [string, KontoTx] => [`${n} at the forwarder of another destination`, tx]),
  ];
  const otherDestinationCases = (): Array<[string, KontoTx]> => [
    ...forwarderCalls(otherDestinationForwarder, { ...permission, spender: otherDestinationForwarder }, DESTINATION),
    ...forwarderCalls(forwarder, permission, OTHER).map(([n, tx]): [string, KontoTx] => [`${n} at our forwarder naming another destination`, tx]),
    ...forwarderCalls(otherCallerForwarder, { ...permission, spender: otherCallerForwarder }, DESTINATION).map(([n, tx]): [string, KontoTx] => [`${n} at the forwarder of another caller`, tx]),
    ...forwarderCalls(forwarder, permission, "0x12" as Address).map(([n, tx]): [string, KontoTx] => [`${n} with a destination that is no address`, tx]),
  ];

  /** Sends every case on 8453 and expects a refusal naming target, selector and `reason`, never the data or a destination. */
  async function expectForwarderRefused(cases: Array<[string, KontoTx]>, reason: string) {
    for (const [name, tx] of cases) {
      const main = node("0x2105");
      const err = await sendKontoTx({ chainId: 8453, net: MAINNET_NET, account, transport: main.transport, tx: { ...tx, gas: 100_000n } }).catch((e: unknown) => e);
      expect(err, name).toBeInstanceOf(Error);
      const message = (err as Error).message;
      expect(message, name).toMatch(/rule 10/);
      expect(message, name).toContain(reason);
      expect(message.toLowerCase(), name).toContain(tx.to.toLowerCase());
      expect(message, name).toContain(tx.data.slice(0, 10));
      expect(message, name).not.toContain(tx.data.slice(10, 74));
      const destination = tx.forwarder?.destination;
      if (destination?.length === 42 && destination.toLowerCase() !== tx.to.toLowerCase()) expect(message.toLowerCase(), name).not.toContain(destination.slice(2).toLowerCase());
      expect(main.calls, name).toEqual([]);
    }
  }

  it("refuses payout and retire on 8453 at a foreign contract that names itself as spender, before the first request", async () => {
    await expectForwarderRefused(foreignCases().filter(([, tx]) => tx.forwarder), "not our forwarder");
    await expectForwarderRefused(foreignCases().filter(([, tx]) => !tx.forwarder), "forwarder destination missing");
  });

  it("refuses payout and retire on 8453 without the forwarder destination, also at our own forwarder", async () => {
    await expectForwarderRefused(missingCases(), "forwarder destination missing");
  });

  it("refuses payout and retire on 8453 at the forwarder of another destination or another caller, before the first request", async () => {
    await expectForwarderRefused(otherDestinationCases(), "not our forwarder");
  });

  it("sends payout and retire on 8453 at our own forwarder, with target and destination in any case", async () => {
    const cases: Array<[string, KontoTx]> = [
      ...forwarderCalls(forwarder, permission, DESTINATION),
      ...forwarderCalls(forwarder.toLowerCase() as Address, permission, DESTINATION.toUpperCase().replace("0X", "0x") as Address).map(([n, tx]): [string, KontoTx] => [`${n} in mixed case`, tx]),
    ];
    for (const [name, tx] of cases) {
      const main = node("0x2105");
      expect(await sendKontoTx({ chainId: 8453, net: MAINNET_NET, account, transport: main.transport, tx: { ...tx, gas: 100_000n } }), name).toBe(HASH);
      expect(main.calls, name).toContain("eth_sendRawTransaction");
    }
  });

  it("keeps 84532 unchanged for payout and retire that 8453 refuses", async () => {
    for (const [name, tx] of [...foreignCases(), ...missingCases(), ...otherDestinationCases()]) {
      const main = node("0x2105");
      await expect(sendKontoTx({ chainId: 8453, net: MAINNET_NET, account, transport: main.transport, tx }), name).rejects.toThrow(/rule 10/);
      expect(main.calls, name).toEqual([]);
      const sepolia = node("0x14a34");
      expect(await sendKontoTx({ chainId: 84532, account, transport: sepolia.transport, tx: { ...tx, gas: 100_000n } }), name).toBe(HASH);
      expect(sepolia.calls, name).toContain("eth_sendRawTransaction");
      const explicit = node("0x14a34");
      expect(await sendKontoTx({ chainId: 84532, net: SEPOLIA_NET, account, transport: explicit.transport, tx: { ...tx, gas: 100_000n } }), name).toBe(HASH);
      expect(explicit.calls, name).toContain("eth_sendRawTransaction");
    }
  });

  /** Sends `tx` on 8453 and expects a refusal that names `arg` and leaves the transport untouched. */
  async function expectDeployRefused(cases: Array<[string, KontoTx]>, arg: string) {
    for (const [name, tx] of cases) {
      const main = node("0x2105");
      const err = await sendKontoTx({ chainId: 8453, net: MAINNET_NET, account, transport: main.transport, tx }).catch((e: unknown) => e);
      expect(err, name).toBeInstanceOf(Error);
      const message = (err as Error).message;
      expect(message, name).toMatch(/rule 10/);
      expect(message, name).toContain(arg);
      expect(message.toLowerCase(), name).toContain(DEPLOY_PROXY.toLowerCase());
      expect(message.toLowerCase(), name).not.toContain(OTHER.slice(2).toLowerCase());
      expect(main.calls, name).toEqual([]);
    }
  }

  const deploy = (f: ForwarderFixed): KontoTx => ({ to: DEPLOY_PROXY, data: concat([FORWARDER_SALT, forwarderInitCode(ACCOUNT, DESTINATION, f)]) });

  it("refuses a forwarder deploy with a foreign token on 8453 before the first request", async () => {
    await expectDeployRefused([["token is another address", deploy({ ...fixed, token: OTHER })]], "token");
  });

  it("refuses a forwarder deploy with a foreign manager on 8453 before the first request", async () => {
    await expectDeployRefused([["manager is another address", deploy({ ...fixed, manager: OTHER })]], "manager");
  });

  it("refuses a forwarder deploy with a foreign caller on 8453 before the first request", async () => {
    const stranger = privateKeyToAccount(generatePrivateKey());
    await expectDeployRefused(
      [
        ["caller is another address", deploy({ ...fixed, caller: OTHER })],
        ["caller is another key", deploy({ ...fixed, caller: stranger.address })],
      ],
      "caller",
    );
  });

  it("refuses a forwarder deploy whose arguments are not exactly five addresses on 8453 before the first request", async () => {
    const own = RULE_10[3][1].data;
    const word = (a: Address) => ("0x" + a.slice(2).toLowerCase().padStart(64, "0")) as Hex;
    const foreignArgs = concat([word(ACCOUNT), word(OTHER), word(OTHER), word(OTHER), word(OTHER)]);
    await expectDeployRefused(
      [
        ["one word less", own.slice(0, own.length - 64) as Hex],
        ["no arguments", own.slice(0, own.length - 64 * 5) as Hex],
        ["five foreign words appended", concat([own, foreignArgs])],
        ["one byte more", concat([own, "0x00"])],
        ["one byte less", own.slice(0, own.length - 2) as Hex],
      ].map(([name, data]) => [name, { to: DEPLOY_PROXY, data: data as Hex }] as [string, KontoTx]),
      "length",
    );
  });

  it("refuses a forwarder deploy whose address words carry bits above the address on 8453 before the first request", async () => {
    const own = RULE_10[3][1].data;
    // The account word with a high bit set: the five words still have the right length, but they are no clean ABI addresses.
    const dirty = (own.slice(0, own.length - 64 * 5) + "ff" + own.slice(own.length - 64 * 5 + 2)) as Hex;
    const main = node("0x2105");
    await expect(sendKontoTx({ chainId: 8453, net: MAINNET_NET, account, transport: main.transport, tx: { to: DEPLOY_PROXY, data: dirty } })).rejects.toThrow(/rule 10/);
    expect(main.calls).toEqual([]);
    await expectDeployRefused([["account word with bits above the address", { to: DEPLOY_PROXY, data: dirty }]], "forwarder argument account does not fit");
  });

  it("refuses a forwarder deploy with an odd number of hex digits behind the prefix on 8453 as length", async () => {
    const own = RULE_10[3][1].data;
    await expectDeployRefused(
      [
        ["one hex digit less", own.slice(0, own.length - 1) as Hex],
        ["one hex digit more", (own + "0") as Hex],
        ["one word and one hex digit less", own.slice(0, own.length - 65) as Hex],
      ].map(([name, data]) => [name, { to: DEPLOY_PROXY, data: data as Hex }] as [string, KontoTx]),
      "forwarder argument length does not fit",
    );
  });

  it("sends a forwarder deploy on 8453 with the own values, also with token, manager and caller in mixed case", async () => {
    const mixed: ForwarderFixed = { token: MAINNET_USDC.toLowerCase() as Address, manager: SPEND_PERMISSION_MANAGER.toUpperCase().replace("0X", "0x") as Address, caller: account.address.toLowerCase() as Address };
    for (const f of [fixed, mixed]) {
      const main = node("0x2105");
      expect(await sendKontoTx({ chainId: 8453, net: MAINNET_NET, account, transport: main.transport, tx: { ...deploy(f), gas: 100_000n } })).toBe(HASH);
      expect(main.calls).toContain("eth_sendRawTransaction");
    }
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

  it("keeps 84532 unchanged for forwarder deploys that 8453 refuses", async () => {
    const own = RULE_10[3][1].data;
    const word = (a: Address) => ("0x" + a.slice(2).toLowerCase().padStart(64, "0")) as Hex;
    const refused: Array<[string, KontoTx]> = [
      ["foreign token", deploy({ ...fixed, token: OTHER })],
      ["foreign manager", deploy({ ...fixed, manager: OTHER })],
      ["foreign caller", deploy({ ...fixed, caller: OTHER })],
      ["one word less", { to: DEPLOY_PROXY, data: own.slice(0, own.length - 64) as Hex }],
      ["five foreign words appended", { to: DEPLOY_PROXY, data: concat([own, word(ACCOUNT), word(OTHER), word(OTHER), word(OTHER), word(OTHER)]) }],
    ];
    for (const [name, tx] of refused) {
      // The same deploy is refused on 8453 ...
      const main = node("0x2105");
      await expect(sendKontoTx({ chainId: 8453, net: MAINNET_NET, account, transport: main.transport, tx }), name).rejects.toThrow(/rule 10/);
      expect(main.calls, name).toEqual([]);
      // ... and goes out on 84532.
      const sepolia = node("0x14a34");
      expect(await sendKontoTx({ chainId: 84532, account, transport: sepolia.transport, tx: { ...tx, gas: 100_000n } }), name).toBe(HASH);
      expect(sepolia.calls, name).toContain("eth_sendRawTransaction");
      const explicit = node("0x14a34");
      expect(await sendKontoTx({ chainId: 84532, net: SEPOLIA_NET, account, transport: explicit.transport, tx: { ...tx, gas: 100_000n } }), name).toBe(HASH);
      expect(explicit.calls, name).toContain("eth_sendRawTransaction");
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
