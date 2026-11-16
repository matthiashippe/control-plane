#!/usr/bin/env node
/**
 * Terminal walk (goals/konto/04, point 9): the whole way from the tool call `start_automaton` to the first turn of the runtime
 * in the sandbox, without a browser. It starts mcp/server.mjs over stdio against the control plane of the harness (the account of
 * konto 03 switched on for chain 84532, the second anvil chain chain-konto with the code of the real Base Sepolia contracts,
 * placed there by konto-chain.mjs before this walk), and plays the phone with fetch: it reads the page of the code, taps the
 * number and signs the spend permission with a local viem key as the owner of the Coinbase Smart Wallet, as konto-chain.mjs does.
 *
 * Steps, each one a reason in the verdict when it fails:
 *   1. tools/list names the five tools; start_automaton answers with qr, url and match and without poll_token.
 *   2. The phone: page, right number, permission for the daily limit of 5.00 USD over POST /h/{code}/konto.
 *   3. automaton_status until running (the runtime made a turn); the key lies in CP_KEY_FILE with mode 0600 and appeared in no
 *      tool result and no line on stderr. first_turn_ms counts from the call start_automaton to running.
 *   4. set_daily_limit lower (3.00) holds without the phone.
 *   5. A raise with the API key alone, POST /v1/konto/limit with 10.00, answers 403 limit_raise_needs_phone.
 *   6. set_daily_limit higher (10.00) answers with url and match; the phone confirms with a new permission (new salt), and
 *      automaton_status shows the change done.
 *   7. The next request with the key lets cp send approveWithSignature of the new and revokeAsSpender of the old permission;
 *      a spend() from the old one, sent with a fixed gas limit as the spender, fails on-chain.
 *   8. stop_automaton, then automaton_status says stopped.
 *
 * Last line: `TERMINAL_VERDICT ok first_turn_ms=<n>` or `TERMINAL_VERDICT fail <reason>`. Before it one line
 * `TERMINAL_RESULT <JSON>` with the account, which harness/e2e/full.sh uses to find the first inference row in the ledger of cp.
 * The API key is never printed.
 *
 * Env: CP_URL (default https://cp.test:8443), RPC_URL (default http://chain-konto:8545), MCP_SERVER (default
 * /chain/mcp/server.mjs), NODE_EXTRA_CA_CERTS for the CA of cp.test.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPublicClient, decodeFunctionData, encodeFunctionData, http, keccak256 } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { toCoinbaseSmartAccount } from "viem/account-abstraction";

const CHAIN_ID = 84532;
const CP_URL = (process.env.CP_URL || "https://cp.test:8443").replace(/\/+$/, "");
const RPC_URL = process.env.RPC_URL || "http://chain-konto:8545";
const MCP_SERVER = process.env.MCP_SERVER || "/chain/mcp/server.mjs";
const SPM = "0xf85210B21cC50302F477BA56686d2019dC9b67Ad";
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const PERIOD = 86400;
const END_NEVER = 281474976710655;
const NEW_TOOLS = ["start_automaton", "automaton_status", "automaton_logs", "set_daily_limit", "stop_automaton"];
const GENESIS_PROMPT =
  "You are a test automaton started from a terminal in a local harness. Keep every turn short: call at most one read-only " +
  "tool, then answer in one sentence.";

const chain = {
  id: CHAIN_ID,
  name: "harness-base-sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
};
const pub = createPublicClient({ chain, transport: http(RPC_URL) });

const components = [
  { name: "account", type: "address" },
  { name: "spender", type: "address" },
  { name: "token", type: "address" },
  { name: "allowance", type: "uint160" },
  { name: "period", type: "uint48" },
  { name: "start", type: "uint48" },
  { name: "end", type: "uint48" },
  { name: "salt", type: "uint256" },
  { name: "extraData", type: "bytes" },
];
const tuple = { name: "spendPermission", type: "tuple", components };
const SPM_ABI = [
  { type: "function", name: "approveWithSignature", stateMutability: "nonpayable", inputs: [tuple, { name: "signature", type: "bytes" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "revokeAsSpender", stateMutability: "nonpayable", inputs: [tuple], outputs: [] },
  { type: "function", name: "spend", stateMutability: "nonpayable", inputs: [tuple, { name: "value", type: "uint160" }], outputs: [] },
  { type: "function", name: "isRevoked", stateMutability: "view", inputs: [tuple], outputs: [{ type: "bool" }] },
];
const USDC_ABI = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }], outputs: [] },
];

class WalkError extends Error {}
const fail = (reason) => { throw new WalkError(reason); };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

async function rpc(method, params) {
  const res = await fetch(RPC_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const body = await res.json();
  if (body.error) fail(`${method}: ${body.error.message}`);
  return body.result;
}

/** mcp/server.mjs over stdio: one JSON-RPC message per line, answers matched by id. */
function startMcp(env) {
  const child = spawn(process.execPath, [MCP_SERVER], { env, stdio: ["pipe", "pipe", "pipe"] });
  let rest = "", stderr = "", id = 0;
  const waiting = new Map();
  child.stdout.on("data", (d) => {
    rest += d.toString("utf8");
    let nl;
    while ((nl = rest.indexOf("\n")) >= 0) {
      const line = rest.slice(0, nl).trim();
      rest = rest.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      const w = waiting.get(msg.id);
      if (w) { waiting.delete(msg.id); w(msg); }
    }
  });
  child.stderr.on("data", (d) => { stderr += d.toString("utf8"); });
  const request = (method, params) => new Promise((resolve, reject) => {
    const n = ++id;
    const timer = setTimeout(() => { waiting.delete(n); reject(new WalkError(`mcp ${method}: no answer in 60 s`)); }, 60_000);
    waiting.set(n, (msg) => { clearTimeout(timer); resolve(msg); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: n, method, params })}\n`);
  });
  const results = [];
  /** One tool call; the parsed JSON of its first text, and the raw texts kept to look for the key at the end. */
  const tool = async (name, args = {}) => {
    const msg = await request("tools/call", { name, arguments: args });
    if (msg.error) fail(`${name}: ${msg.error.message}`);
    const texts = (msg.result?.content ?? []).map((c) => String(c.text ?? ""));
    results.push(...texts);
    let json;
    try { json = JSON.parse(texts[0] ?? "{}"); } catch { json = { raw: texts[0] }; }
    return { json, isError: Boolean(msg.result?.isError) };
  };
  return { request, tool, results, stderr: () => stderr, close: () => { child.stdin.end(); child.kill(); } };
}

/** The phone: the page of the code, then the tap on the number the terminal shows. Returns the page after the tap. */
async function phoneTap(url, match, expectBlock) {
  const code = new URL(url).pathname.split("/").pop();
  const first = await fetch(`${CP_URL}/h/${code}`);
  const html = await first.text();
  if (first.status !== 200 || !html.includes(`data-soll="${expectBlock}"`)) fail(`page of ${expectBlock}: ${first.status}`);
  const choices = [...html.matchAll(/name="pick" value="([0-9]{2})"/g)].map((m) => Number(m[1]));
  if (choices.length !== 3 || !choices.includes(Number(match))) fail(`page of ${expectBlock} does not offer the number`);
  const tapped = await fetch(`${CP_URL}/h/${code}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `pick=${match}` });
  return { code, status: tapped.status, html: await tapped.text() };
}

const attr = (html, name) => (new RegExp(`data-${name}="([^"]*)"`).exec(html) ?? [])[1] ?? "";

/** The permission the smart wallet signs: the page says spender, token and limit; the walk only adds start and salt. */
async function sign(smart, html) {
  const block = await pub.getBlock();
  const permission = {
    account: smart.address.toLowerCase(),
    spender: attr(html, "spender").toLowerCase(),
    token: attr(html, "token").toLowerCase(),
    allowance: BigInt(attr(html, "limit") || "0"),
    period: PERIOD,
    start: Number(block.timestamp) - 5,
    end: END_NEVER,
    salt: BigInt(keccak256(generatePrivateKey())),
    extraData: "0x",
  };
  if (Number(attr(html, "chain")) !== CHAIN_ID) fail(`page names chain ${attr(html, "chain")}`);
  const signature = await smart.signTypedData({
    domain: { name: "Spend Permission Manager", version: "1", chainId: CHAIN_ID, verifyingContract: SPM },
    types: { SpendPermission: components },
    primaryType: "SpendPermission",
    message: permission,
  });
  const strings = { ...permission, allowance: String(permission.allowance), period: String(permission.period), start: String(permission.start), end: String(permission.end), salt: String(permission.salt) };
  return { permission, body: { account: permission.account, permission: strings, signature } };
}

async function poll(what, ms, step) {
  const until = Date.now() + ms;
  for (;;) {
    const r = await step();
    if (r) return r;
    if (Date.now() > until) fail(`${what}: not within ${Math.round(ms / 1000)} s`);
    await pause(2000);
  }
}

async function walk() {
  if ((await pub.getChainId()) !== CHAIN_ID) fail("chain-konto is not 84532");
  const code = await pub.getCode({ address: SPM });
  if (!code || code === "0x") fail("no SpendPermissionManager on chain-konto (konto-chain.mjs places it)");
  const startBlock = await pub.getBlockNumber();

  // The person's passkey wallet stands in as a plain key; SpendPermissionManager is the second owner, as on the phone.
  const owner = privateKeyToAccount(generatePrivateKey());
  const smart = await toCoinbaseSmartAccount({ client: pub, owners: [owner, SPM], ownerIndex: 0, version: "1" });
  const account = smart.address.toLowerCase();
  const minter = (await rpc("eth_accounts", []))[1];
  await rpc("eth_sendTransaction", [{ from: minter, to: USDC, data: encodeFunctionData({ abi: USDC_ABI, functionName: "mint", args: [account, 20_000_000n] }) }]);

  const keyDir = mkdtempSync(path.join(os.tmpdir(), "terminal-"));
  const keyFile = path.join(keyDir, "config", "api-key");
  const mcp = startMcp({ PATH: process.env.PATH, NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS ?? "", CP_URL, CP_KEY_FILE: keyFile, HOME: keyDir });
  try {
    await mcp.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "terminal-walk", version: "1" } });
    const listed = (await mcp.request("tools/list", {})).result?.tools?.map((t) => t.name) ?? [];
    for (const t of NEW_TOOLS) if (!listed.includes(t)) fail(`tools/list misses ${t}`);

    // 1. Start: the answer comes at once, with the QR code and without the terminal's secret.
    const t0 = Date.now();
    const started = await mcp.tool("start_automaton", { genesis_prompt: GENESIS_PROMPT, name: `terminal-${Date.now() % 100000}`, daily_limit_usd: "5.00" });
    const s = started.json;
    if (started.isError || s.status !== "waiting_for_phone" || !s.qr || !s.url || !s.match) fail(`start_automaton answered ${JSON.stringify(s).slice(0, 160)}`);
    if ("poll_token" in s || mcp.results.some((t) => t.includes("poll_token"))) fail("start_automaton showed poll_token");

    // 2. The phone creates the account: the right number, then the permission of the smart wallet (ERC-6492, not deployed yet).
    const tap = await phoneTap(s.url, s.match, "approve");
    if (tap.status !== 200 || !tap.html.includes('data-soll="passkey"')) fail(`passkey page: ${tap.status}`);
    const first = await sign(smart, tap.html);
    if (first.permission.allowance !== 5_000_000n) fail(`passkey page asks for ${first.permission.allowance}`);
    const created = await fetch(`${CP_URL}/h/${tap.code}/konto`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(first.body) });
    if (created.status !== 200) fail(`POST /h/{code}/konto: ${created.status} ${(await created.text()).slice(0, 160)}`);

    // 3. The automaton thinks: running means its log holds a turn.
    const running = await poll("automaton_status running", 300_000, async () => {
      const st = (await mcp.tool("automaton_status")).json;
      if (st.status === "failed") fail(`automaton_status failed: ${st.reason ?? ""} ${String(st.message ?? "").slice(0, 120)}`);
      return st.status === "running" ? st : null;
    });
    const firstTurnMs = Date.now() - t0;
    const mode = statSync(keyFile).mode & 0o777;
    if (mode !== 0o600) fail(`key file mode ${mode.toString(8)}`);
    const key = readFileSync(keyFile, "utf8").trim();
    if (!key.startsWith("cnwy_k_")) fail("key file holds no API key");
    const auth = { authorization: `Bearer ${key}` };

    // 4. Lower without the phone.
    const lower = (await mcp.tool("set_daily_limit", { daily_limit_usd: "3.00" })).json;
    if (lower.status !== "done") fail(`set_daily_limit lower: ${JSON.stringify(lower).slice(0, 160)}`);

    // 5. Higher with the key alone: refused, whoever holds the key.
    const direct = await fetch(`${CP_URL}/v1/konto/limit`, { method: "POST", headers: { "content-type": "application/json", ...auth }, body: JSON.stringify({ daily_limit_usdc: "10000000" }) });
    const directBody = await direct.json().catch(() => ({}));
    if (direct.status !== 403 || directBody.error !== "limit_raise_needs_phone") fail(`raise with the key alone: ${direct.status} ${directBody.error}`);

    // 6. Higher over the phone, with the passkey of the account (here: the same owner key) and a new salt.
    const raise = (await mcp.tool("set_daily_limit", { daily_limit_usd: "10.00" })).json;
    if (raise.status !== "waiting_for_phone" || !raise.url || !raise.match) fail(`set_daily_limit higher: ${JSON.stringify(raise).slice(0, 160)}`);
    const tap2 = await phoneTap(raise.url, raise.match, "approve");
    if (tap2.status !== 200 || !tap2.html.includes('data-soll="limit"') || !same(attr(tap2.html, "account"), account)) fail(`limit page: ${tap2.status}`);
    const second = await sign(smart, tap2.html);
    if (second.permission.allowance !== 10_000_000n) fail(`limit page asks for ${second.permission.allowance}`);
    const raised = await fetch(`${CP_URL}/h/${tap2.code}/limit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(second.body) });
    if (raised.status !== 200) fail(`POST /h/{code}/limit: ${raised.status} ${(await raised.text()).slice(0, 160)}`);
    await poll("daily limit change done", 60_000, async () => {
      const st = (await mcp.tool("automaton_status")).json;
      if (st.daily_limit_change?.status === "failed") fail(`daily limit change failed: ${st.daily_limit_change.reason ?? ""}`);
      return st.daily_limit_change?.status === "done" ? st : null;
    });

    // 7. The next requests with the key let cp approve the new permission and revoke the old one, in this order, on-chain.
    const sent = await poll("approveWithSignature and revokeAsSpender by cp", 90_000, async () => {
      await fetch(`${CP_URL}/v1/konto/limit`, { headers: auth });
      const latest = await pub.getBlockNumber();
      const calls = [];
      for (let n = startBlock + 1n; n <= latest; n++) {
        const block = await pub.getBlock({ blockNumber: n, includeTransactions: true });
        for (const tx of block.transactions) {
          if (!same(tx.to, SPM)) continue;
          try {
            const d = decodeFunctionData({ abi: SPM_ABI, data: tx.input });
            calls.push({ name: d.functionName, salt: d.args[0].salt, from: tx.from });
          } catch { /* another call */ }
        }
      }
      const approveNew = calls.findIndex((c) => c.name === "approveWithSignature" && c.salt === second.permission.salt);
      const revokeOld = calls.findIndex((c) => c.name === "revokeAsSpender" && c.salt === first.permission.salt);
      return approveNew >= 0 && revokeOld > approveNew ? calls : null;
    });
    if (!(await pub.readContract({ address: SPM, abi: SPM_ABI, functionName: "isRevoked", args: [first.permission] }))) fail("old permission not revoked");
    const spender = first.permission.spender;
    await rpc("anvil_impersonateAccount", [spender]);
    const oldSpend = await rpc("eth_sendTransaction", [{
      from: spender, to: SPM, gas: "0x493e0",
      data: encodeFunctionData({ abi: SPM_ABI, functionName: "spend", args: [first.permission, 1_000_000n] }),
    }]);
    const oldReceipt = await pub.waitForTransactionReceipt({ hash: oldSpend });
    if (oldReceipt.status !== "reverted") fail("spend() from the old permission went through after the revoke");

    // 8. Stop.
    const stopped = (await mcp.tool("stop_automaton")).json;
    if (stopped.status !== "stopped") fail(`stop_automaton: ${JSON.stringify(stopped).slice(0, 160)}`);
    const after = await poll("automaton_status stopped", 60_000, async () => {
      const st = (await mcp.tool("automaton_status")).json;
      return st.status === "stopped" ? st : null;
    });

    const logs = (await mcp.tool("automaton_logs")).json;
    if (mcp.results.some((t) => t.includes(key)) || mcp.stderr().includes(key)) fail("the API key appeared in a tool result or on stderr");
    console.log(`TERMINAL_RESULT ${JSON.stringify({
      account,
      first_turn_ms: firstTurnMs,
      turns: running.turns ?? null,
      key_mode: mode.toString(8),
      calls: sent.map((c) => c.name),
      old_spend: oldReceipt.status,
      stopped: after.status,
      log_lines: Array.isArray(logs.lines) ? logs.lines.length : null,
    })}`);
    return firstTurnMs;
  } finally {
    mcp.close();
  }
}

try {
  const ms = await walk();
  console.log(`TERMINAL_VERDICT ok first_turn_ms=${ms}`);
} catch (err) {
  const reason = err instanceof WalkError ? err.message : `error ${String((err && (err.shortMessage || err.message)) || err).split("\n")[0]}`;
  console.log(`TERMINAL_VERDICT fail ${reason}`);
  process.exitCode = 1;
}
