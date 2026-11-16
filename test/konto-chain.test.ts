// goals/konto/03, Punkt 5: sendKontoTx sends on Base Sepolia only, and the test key never shows up anywhere.
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { custom, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { loadKontoKey, sendKontoTx } from "../src/konto/chain.js";

const TO = "0xf85210b21cc50302f477ba56686d2019dc9b67ad";
const HASH = ("0x" + "ab".repeat(32)) as Hex;

/** A transport that records every request and answers like a Base Sepolia node. */
function node() {
  const calls: string[] = [];
  const transport = custom({
    async request({ method }: { method: string }) {
      calls.push(method);
      switch (method) {
        case "eth_chainId": return "0x14a34";
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

function keyFile(content: string): string {
  const f = path.join(mkdtempSync(path.join(os.tmpdir(), "konto-key-")), "k");
  writeFileSync(f, content, { mode: 0o600 });
  return f;
}

afterEach(() => vi.restoreAllMocks());

describe("sendKontoTx", () => {
  it("refuses chain 8453 before any request reaches the transport", async () => {
    const { calls, transport } = node();
    const account = privateKeyToAccount(generatePrivateKey());
    await expect(sendKontoTx({ chainId: 8453, account, transport, tx: { to: TO, data: "0x" } })).rejects.toThrow(/84532/);
    expect(calls).toEqual([]);
  });

  it("refuses chain 1 before any request reaches the transport", async () => {
    const { calls, transport } = node();
    const account = privateKeyToAccount(generatePrivateKey());
    await expect(sendKontoTx({ chainId: 1, account, transport, tx: { to: TO, data: "0x" } })).rejects.toThrow(/84532/);
    expect(calls).toEqual([]);
  });

  it("sends on chain 84532", async () => {
    const { calls, transport } = node();
    const account = privateKeyToAccount(generatePrivateKey());
    const hash = await sendKontoTx({ chainId: 84532, account, transport, tx: { to: TO, data: "0x", gas: 100_000n } });
    expect(hash).toBe(HASH);
    expect(calls).toContain("eth_sendRawTransaction");
  });

  it("never shows the key from CP_KONTO_KEY_FILE, not even for a file with wrong content", async () => {
    const out: string[] = [];
    for (const m of ["log", "error", "warn", "info"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void out.push(a.map(String).join(" ")));
    const key = generatePrivateKey();
    const bare = key.slice(2);
    const account = loadKontoKey(keyFile(key + "\n"));
    expect(account.address).toBe(privateKeyToAccount(key).address);
    const texts: string[] = [JSON.stringify(account), String(account)];
    const refused = await sendKontoTx({ chainId: 8453, account, transport: node().transport, tx: { to: TO, data: "0x" } }).catch((e: Error) => e);
    texts.push(String(refused), (refused as Error).stack ?? "");
    // Wrong content: a key one digit short, a key with a word around it, and a key without 0x.
    for (const wrong of [key.slice(0, -1), `key=${key}`, bare]) {
      let err: unknown = null;
      try {
        loadKontoKey(keyFile(wrong));
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(Error);
      texts.push(String(err), (err as Error).stack ?? "");
    }
    const missing = (() => { try { loadKontoKey(path.join(os.tmpdir(), "no-such-konto-key")); return null; } catch (e) { return e as Error; } })();
    texts.push(String(missing));
    for (const t of [...texts, ...out]) {
      expect(t.toLowerCase()).not.toContain(bare.toLowerCase());
      expect(t.toLowerCase()).not.toContain(bare.slice(0, 16).toLowerCase());
    }
  });
});
