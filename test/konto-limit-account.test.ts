/**
 * goals/konto/06, Punkt 5: the step limit of the phone page shows the name of the account, the name of its oldest API key, and
 * takes no name from the body of POST /v1/handoff; set_daily_limit of mcp/server.mjs sends none. A text the terminal chooses must
 * not appear on the page on which the person raises the daily limit with the passkey.
 */
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPublicClient, custom, type PublicClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { createApiKey } from "../src/auth/siwe.js";
import { ensureWallet, type Db } from "../src/db.js";
import { permissionJson, readAccountName } from "../src/konto/account.js";
import { PERIOD_SECONDS, SEPOLIA_USDC } from "../src/konto/config.js";
import type { KontoDeps } from "../src/handoff/routes.js";
// @ts-expect-error plain ESM module, no declaration file
import { createAutomatonTools, createClient, handleMessage } from "../mcp/server.mjs";
import { START, handoffApp, post, tap } from "./handoff-helpers.js";

const spender = privateKeyToAccount(generatePrivateKey()).address;
const offline = createPublicClient({
  chain: baseSepolia,
  transport: custom({ request: async () => { throw new Error("no chain in unit tests"); } }),
}) as unknown as PublicClient;

function setup() {
  const konto: KontoDeps = { chainId: 84532, spender, token: SEPOLIA_USDC, verifyClient: offline };
  return handoffApp({ konto });
}

/** One more API key for `address` under `name`, the way createApiKey issues it for a session. */
function issueKey(db: Db, address: string, name: string, nowMs: number): string {
  const session = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token, address, expires_at) VALUES (?, ?, ?)").run(session, address, nowMs + 60_000);
  return createApiKey(db, session, name, nowMs).key;
}

/**
 * An account with a daily limit of $5.00 as finishKonto leaves it (the account row and its first API key under the name the person
 * saw when creating it); a signature the chain would check is not needed for the step limit.
 */
function account(db: Db, name = "Atlas") {
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
  return { address, key: issueKey(db, address, name, START) };
}

type App = ReturnType<typeof setup>["app"];
const raise = (app: App, key: string, body: Record<string, unknown>) =>
  post(app, { daily_limit_usdc: "10000000", step: "limit", ...body }, { authorization: `Bearer ${key}` });

/** Both states of the step limit for one raise: the page of the code, then the page after the right number. */
async function pages(app: App, key: string, body: Record<string, unknown> = {}) {
  const res = await raise(app, key, body);
  expect(res.status).toBe(201);
  const h = (await res.json()) as { code: string; match: number };
  const approve = await (await app.request(`/h/${h.code}`)).text();
  const passkey = await (await tap(app, h.code, h.match)).text();
  return { approve, passkey };
}

describe("the step limit shows the name of the account", () => {
  it("takes no name from the body: automaton_name Trust me is 201, and neither state shows it, both show the account name", async () => {
    const s = setup();
    const a = account(s.db);
    const { approve, passkey } = await pages(s.app, a.key, { automaton_name: "Trust me" });
    expect(approve).toContain('data-soll="approve"');
    expect(passkey).toContain('data-soll="limit"');
    for (const html of [approve, passkey]) {
      expect(html).not.toContain("Trust me");
      expect(html).toContain("your account Atlas");
    }
  });

  it("answers 201 on step limit without automaton_name", async () => {
    const s = setup();
    const a = account(s.db);
    const res = await raise(s.app, a.key, {});
    expect(res.status).toBe(201);
    const { approve } = await pages(s.app, a.key);
    expect(approve).toContain("your account Atlas");
  });

  it("keeps the name of the first key when the account has a second, younger key under another name", async () => {
    const s = setup();
    const a = account(s.db);
    const nova = issueKey(s.db, a.address, "Nova", START + 1000);
    expect(readAccountName(s.db, a.address)).toBe("Atlas");
    expect(readAccountName(s.db, a.address.toUpperCase().replace("0X", "0x"))).toBe("Atlas");
    expect(readAccountName(s.db, "0x" + "0".repeat(40))).toBeNull();
    // The younger key raises the limit; the page still names the account by its first key.
    const { approve, passkey } = await pages(s.app, nova, { automaton_name: "Nova" });
    for (const html of [approve, passkey]) {
      expect(html).toContain("your account Atlas");
      expect(html).not.toContain("Nova");
    }
  });

  it("says in the state passkey that the limit is for the account, not only for one automaton", async () => {
    const s = setup();
    const a = account(s.db);
    const { approve, passkey } = await pages(s.app, a.key);
    expect(passkey).toContain("for your account");
    expect(passkey).not.toContain("only for");
    expect(approve).not.toMatch(/Allow Atlas|for Atlas/);
    expect(passkey).not.toMatch(/Allow Atlas|for Atlas/);
  });

  it("set_daily_limit sends no automaton_name, and step konto without automaton_name stays 400", async () => {
    const calls: { method: string; path: string; body?: string }[] = [];
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    const fetchImpl = async (url: string, init: Record<string, any> = {}) => {
      const u = new URL(url);
      calls.push({ method: init.method ?? "GET", path: u.pathname, body: init.body });
      if (u.pathname === "/v1/konto/limit") return json(200, { account: "0x" + "5".repeat(40), daily_limit_usdc: "5000000", signed_limit_usdc: "5000000" });
      if (u.pathname === "/v1/automatons") return json(200, { automatons: [{ id: "a-1", name: "Trust me", created_at: "2026-11-01T00:00:00Z" }] });
      if (u.pathname === "/v1/handoff") return json(201, { code: "LIMT", url: "https://cp.test/h/LIMT", qr: "QR", match: "17", expires_at: "2026-11-16T12:10:00.000Z", poll_token: "poll-" + "p".repeat(30) });
      const done = `event: state\ndata: ${JSON.stringify({ state: "done", daily_limit_usdc: "10000000" })}\n\n`;
      return new Response(done, { status: 200, headers: { "content-type": "text/event-stream" } });
    };
    // An invented key, assembled at runtime so that no literal here looks like a real one.
    const env = { CP_API_KEY: "cnwy_k_" + "u".repeat(12) + "Q7" };
    const tools = createAutomatonTools({ baseUrl: "https://cp.test", env, fetchImpl, keyFile: "/nonexistent/cp-key", now: () => 0, sleep: async () => {}, log: () => {} });
    const ctx = { client: createClient({ baseUrl: "https://cp.test", fetchImpl }), automaton: tools };
    const answer = await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "set_daily_limit", arguments: { daily_limit_usd: "10.00" } } }, ctx);
    expect(answer.result.isError ?? false).toBe(false);
    const posts = calls.filter((c) => c.method === "POST" && c.path === "/v1/handoff");
    expect(posts).toHaveLength(1);
    const body = JSON.parse(posts[0].body!);
    expect(body).not.toHaveProperty("automaton_name");
    expect(body).toEqual({ daily_limit_usdc: "10000000", step: "limit" });
    await tools.settled?.();

    const s = setup();
    const res = await post(s.app, { daily_limit_usdc: "5000000", step: "konto" });
    expect(res.status).toBe(400);
  });
});
