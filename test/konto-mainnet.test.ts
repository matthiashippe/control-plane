/**
 * goals/konto/05, Punkt 16: the main network is prepared but not switched on. 8453 runs only with CP_KONTO_MAINNET=1, every other
 * chain stays refused, and a transaction for a chain other than the setting never reaches the transport.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { custom, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { openDb } from "../src/db.js";
import { sendKontoTx } from "../src/konto/chain.js";
import { MAINNET_NET, SEPOLIA_NET, SEPOLIA_USDC, readKontoConfig } from "../src/konto/config.js";
import { createPayoutChain } from "../src/konto/payout.js";
import { kontoFromEnv } from "../src/konto/setup.js";
import { createKontoChain } from "../src/konto/topup.js";

const TO = "0xf85210b21cc50302f477ba56686d2019dc9b67ad";
const HASH = ("0x" + "cd".repeat(32)) as Hex;
const offline = custom({ request: async () => { throw new Error("no network in unit tests"); } });

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
        default: throw new Error(`unexpected ${method}`);
      }
    },
  });
  return { calls, transport };
}

function keyFile(): string {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), "konto-main-")), "key");
  writeFileSync(file, generatePrivateKey(), { mode: 0o600 });
  return file;
}

describe("main network 8453", () => {
  it("stops the start for 8453 without CP_KONTO_MAINNET=1", () => {
    const file = keyFile();
    for (const mainnet of [undefined, "", "0", "true", "yes", " 1"]) {
      const env = { CP_KONTO_CHAIN_ID: "8453", CP_KONTO_KEY_FILE: file, CP_KONTO_MAINNET: mainnet };
      expect(() => readKontoConfig(env)).toThrow(/CP_KONTO_MAINNET=1/);
      expect(() => kontoFromEnv(openDb(":memory:"), env, offline)).toThrow(/CP_KONTO_MAINNET=1/);
    }
  });

  it("runs 8453 with CP_KONTO_MAINNET=1 on USDC of Base and mainnet.base.org", () => {
    const file = keyFile();
    const env = { CP_KONTO_CHAIN_ID: "8453", CP_KONTO_MAINNET: "1", CP_KONTO_KEY_FILE: file };
    const cfg = readKontoConfig(env);
    expect(cfg).toMatchObject({ chainId: 8453, rpcUrl: "https://mainnet.base.org" });
    expect(cfg?.token).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
    expect(cfg?.net.chain.id).toBe(8453);
    const konto = kontoFromEnv(openDb(":memory:"), env, offline);
    expect(konto?.chainId).toBe(8453);
    expect(konto?.token).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  });

  it("refuses chain 1 and every other chain even with CP_KONTO_MAINNET=1", () => {
    const file = keyFile();
    for (const v of ["1", "10", "8454", "84531", "base", "0x2105"]) {
      const env = { CP_KONTO_CHAIN_ID: v, CP_KONTO_MAINNET: "1", CP_KONTO_KEY_FILE: file };
      expect(() => readKontoConfig(env)).toThrow(/never runs on another chain/);
      expect(() => kontoFromEnv(openDb(":memory:"), env, offline)).toThrow(/never runs on another chain/);
    }
  });

  it("refuses a transaction for 8453 under the setting 84532 and one for 84532 under 8453, without a call at the transport", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const sepolia = node("0x14a34");
    await expect(sendKontoTx({ chainId: 8453, net: SEPOLIA_NET, account, transport: sepolia.transport, tx: { to: TO, data: "0x" } })).rejects.toThrow(/84532/);
    await expect(sendKontoTx({ chainId: 8453, account, transport: sepolia.transport, tx: { to: TO, data: "0x" } })).rejects.toThrow(/84532/);
    expect(sepolia.calls).toEqual([]);
    const main = node("0x2105");
    await expect(sendKontoTx({ chainId: 84532, net: MAINNET_NET, account, transport: main.transport, tx: { to: TO, data: "0x" } })).rejects.toThrow(/8453\b/);
    await expect(sendKontoTx({ chainId: 1, net: MAINNET_NET, account, transport: main.transport, tx: { to: TO, data: "0x" } })).rejects.toThrow(/8453\b/);
    expect(main.calls).toEqual([]);
    // The chains for top-up and payout refuse a mismatch when they are built, before anything is sent.
    expect(() => createKontoChain({ chainId: 84532, net: MAINNET_NET, account, transport: main.transport })).toThrow(/8453\b/);
    expect(() => createPayoutChain({ chainId: 8453, net: SEPOLIA_NET, account, transport: sepolia.transport, token: SEPOLIA_USDC })).toThrow(/84532/);
    expect([...sepolia.calls, ...main.calls]).toEqual([]);
  });

  it("sends on 8453 only under the setting 8453, against a node of Base", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const main = node("0x2105");
    const hash = await sendKontoTx({ chainId: 8453, net: MAINNET_NET, account, transport: main.transport, tx: { to: TO, data: "0x", gas: 100_000n } });
    expect(hash).toBe(HASH);
    expect(main.calls).toContain("eth_sendRawTransaction");
  });

  it("keeps 84532 as in konto 03, with or without the switch", async () => {
    const file = keyFile();
    for (const mainnet of [undefined, "1"]) {
      const cfg = readKontoConfig({ CP_KONTO_CHAIN_ID: "84532", CP_KONTO_KEY_FILE: file, CP_KONTO_MAINNET: mainnet });
      expect(cfg).toMatchObject({ chainId: 84532, rpcUrl: "https://sepolia.base.org", topupBelowUsdc: 1_000_000n, topupUsdc: 2_000_000n });
      expect(cfg?.token).toBe(SEPOLIA_USDC);
    }
    const account = privateKeyToAccount(generatePrivateKey());
    const sepolia = node("0x14a34");
    const hash = await sendKontoTx({ chainId: 84532, account, transport: sepolia.transport, tx: { to: TO, data: "0x", gas: 100_000n } });
    expect(hash).toBe(HASH);
    expect(sepolia.calls).toContain("eth_sendRawTransaction");
  });
});
