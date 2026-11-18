/**
 * goals/konto/10, point 3: parseUsdc in src/konto/usdc.ts is the one rule for amounts in atomic USDC. The table holds its type check
 * and its limit of 18 digits, and the case at POST /v1/konto/limit holds that a daily limit sent as a JSON number is refused instead
 * of being read as a rounded amount. Dropping the type check turns both red; widening {1,18} to {1,19} turns the table red.
 */
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPublicClient, custom, type PublicClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { createApiKey } from "../src/auth/siwe.js";
import { ensureWallet, type Db } from "../src/db.js";
import type { KontoDeps } from "../src/handoff/routes.js";
import { permissionJson } from "../src/konto/account.js";
import { PERIOD_SECONDS, SEPOLIA_USDC } from "../src/konto/config.js";
import { parseUsdc } from "../src/konto/usdc.js";
import { START, handoffApp } from "./handoff-helpers.js";

describe("parseUsdc", () => {
  const table: [unknown, bigint | null][] = [
    [10000, null],
    [10000n, null],
    ["1" + "0".repeat(18), null],
    [" 10000", null],
    ["10000 ", null],
    ["+10000", null],
    ["-10000", null],
    ["1e4", null],
    ["10000.0", null],
    ["", null],
    ["0", null],
    ["15000", null],
    [null, null],
    ["10000", 10000n],
    ["5000000", 5_000_000n],
    ["9" + "9".repeat(13) + "0000", 999_999_999_999_990_000n],
  ];
  it.each(table)("reads %o as %o", (input, expected) => {
    expect(parseUsdc(input)).toBe(expected);
  });
});

const spender = privateKeyToAccount(generatePrivateKey()).address;
const offline = createPublicClient({
  chain: baseSepolia,
  transport: custom({ request: async () => { throw new Error("no chain in unit tests"); } }),
}) as unknown as PublicClient;

/** An account with a signed daily limit of $5.00 and its first API key, as finishKonto leaves it; no chain is asked. */
function account(db: Db) {
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  ensureWallet(db, address);
  const permission = {
    account: address,
    spender: spender.toLowerCase(),
    token: SEPOLIA_USDC,
    allowance: 5_000_000n,
    period: PERIOD_SECONDS,
    start: START / 1000 - 60,
    end: 281474976710655,
    salt: 1n,
    extraData: "0x",
  };
  db.prepare("INSERT INTO konto_accounts (address, chain_id, permission, signature, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(address, 84532, permissionJson(permission as never), "0x" + "11".repeat(65), new Date(START).toISOString());
  const session = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token, address, expires_at) VALUES (?, ?, ?)").run(session, address, START + 60_000);
  return { address, key: createApiKey(db, session, "Atlas", START).key };
}

it("answers 400 invalid_limit for daily_limit_usdc as the JSON number 10000", async () => {
  const konto: KontoDeps = { chainId: 84532, spender, token: SEPOLIA_USDC, verifyClient: offline };
  const { app, db } = handoffApp({ konto });
  const a = account(db);
  const auth = { authorization: `Bearer ${a.key}` };
  const read = async () => {
    const res = await app.request("/v1/konto/limit", { headers: auth });
    expect(res.status).toBe(200);
    return res.json();
  };
  const before = await read();
  expect(before).toMatchObject({ daily_limit_usdc: "5000000", signed_limit_usdc: "5000000" });
  const res = await app.request("/v1/konto/limit", {
    method: "POST",
    headers: { "content-type": "application/json", ...auth },
    body: JSON.stringify({ daily_limit_usdc: 10000 }),
  });
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ error: "invalid_limit" });
  expect(await read()).toEqual(before);
  const cap = db.prepare("SELECT cap_usdc FROM konto_accounts WHERE address = ?").get(a.address) as { cap_usdc: string | null };
  expect(cap.cap_usdc).toBeNull();
});
