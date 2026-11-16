/**
 * goals/konto/03, Punkt 9: production never books credits from test USDC. Without CP_KONTO_CHAIN_ID the account is off, 84532
 * switches it on, and any other chain stops the start.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { custom } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { openDb } from "../src/db.js";
import { readKontoConfig } from "../src/konto/config.js";
import { kontoFromEnv } from "../src/konto/setup.js";
import { ATLAS, create, handoffApp } from "./handoff-helpers.js";

const offline = custom({ request: async () => { throw new Error("no network in unit tests"); } });

function keyFile(): { file: string; address: string } {
  const key = generatePrivateKey();
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), "konto-cfg-")), "key");
  writeFileSync(file, key, { mode: 0o600 });
  return { file, address: privateKeyToAccount(key).address };
}

describe("CP_KONTO_CHAIN_ID", () => {
  it("leaves the account off without the variable, and step konto answers 503", async () => {
    expect(readKontoConfig({})).toBeNull();
    expect(readKontoConfig({ CP_KONTO_CHAIN_ID: "" })).toBeNull();
    const db = openDb(":memory:");
    expect(kontoFromEnv(db, {}, offline)).toBeNull();
    const { app } = handoffApp({ konto: kontoFromEnv(db, {}, offline) });
    const res = await app.request("/v1/handoff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...ATLAS, step: "konto" }) });
    expect(res.status).toBe(503);
  });

  it("switches the account on with 84532, the spender being the address of the key file", async () => {
    const { file, address } = keyFile();
    const cfg = readKontoConfig({ CP_KONTO_CHAIN_ID: "84532", CP_KONTO_KEY_FILE: file });
    expect(cfg).toMatchObject({ chainId: 84532, topupBelowUsdc: 1_000_000n, topupUsdc: 2_000_000n });
    const konto = kontoFromEnv(openDb(":memory:"), { CP_KONTO_CHAIN_ID: "84532", CP_KONTO_KEY_FILE: file }, offline);
    expect(konto?.chainId).toBe(84532);
    expect(konto?.spender).toBe(address);
    const { app } = handoffApp({ konto });
    const h = await create(app, { ...ATLAS, step: "konto" });
    expect(h.code).toMatch(/^[0-9A-Z]{12}$/);
  });

  it("stops the start with 8453, with 1 and with anything else", () => {
    const { file } = keyFile();
    for (const v of ["8453", "1", "84531", "base-sepolia"]) {
      expect(() => readKontoConfig({ CP_KONTO_CHAIN_ID: v })).toThrow(/84532/);
      expect(() => kontoFromEnv(openDb(":memory:"), { CP_KONTO_CHAIN_ID: v, CP_KONTO_KEY_FILE: file }, offline)).toThrow(/84532/);
    }
  });

  it("stops the start with 84532 but no key file", () => {
    expect(() => kontoFromEnv(openDb(":memory:"), { CP_KONTO_CHAIN_ID: "84532" }, offline)).toThrow(/CP_KONTO_KEY_FILE/);
  });
});
