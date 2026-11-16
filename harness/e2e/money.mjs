#!/usr/bin/env node
/**
 * Money walk (goals/konto/05, point 14): deposit, the first and the second payout and the payout rule from the terminal, without
 * a browser, on the second anvil chain chain-konto (chainId 84532, the code of the real Base Sepolia contracts placed by
 * konto-chain.mjs). It starts mcp/server.mjs over stdio against the control plane of the harness, which reaches the stand-in for
 * Bridge and the card onramp in harness/money-mock/ (CP_BRIDGE_URL, a fake key in CP_BRIDGE_KEY_FILE), and plays the phone with
 * fetch: it reads each page, taps the number and signs with a local viem key as the owner of the Coinbase Smart Wallet.
 *
 * Steps, each one a reason in the verdict when it fails:
 *   1. The Deterministic Deployment Proxy goes onto chain-konto with anvil_setCode (harness/chain/konto/, keccak256 checked); the
 *      PayoutForwarder of an account is created through it with CREATE2.
 *   2. An account over start_automaton as in terminal.mjs (phone: page, right number, first permission); once the hosted
 *      automaton exists it is stopped, so that automaton_status can show balance and rule and nothing thinks on the side.
 *   3. deposit 20.00 through mcp/server.mjs: the phone taps the number, the deposit-card page names the smart wallet, the onramp
 *      of the mock mints exactly 20 test USDC to that address, a body with wallet_address is refused, POST /h/{code}/deposit
 *      with {opened:true} ends the code, automaton_status shows the deposit done.
 *   4. The first payout: POST /v1/konto/payout with the key answers 409 payout_needs_phone; payout 5.00 through the tool opens
 *      the phone step: identity at the Bridge mock (verify, then approved), the example IBAN, the second permission signed for
 *      the forwarder the page names. cp deploys the forwarder through the proxy, approves and pays; exactly 5 USDC arrive at the
 *      liquidation address of the mock.
 *   5. A second payout of 3.00 through the tool goes without a phone step; the liquidation address holds 8 USDC.
 *   6. spend() of the second permission sent directly from our key (the cp spender key), fixed gas: reverts on-chain.
 *   7. A forwarder with another destination, deployed through the proxy with the creation code cp used: payout from our key
 *      reverts on-chain, its destination gets nothing.
 *   8. payout from a foreign address to the right forwarder: reverts on-chain.
 *   9. set_payout_rule stores the rule, automaton_status shows it; the key appeared in no tool result and no line on stderr.
 *
 * Last line: `MONEY_VERDICT ok` or `MONEY_VERDICT fail <reason>`, before it one line `MONEY_RESULT <JSON>`. The API key is never
 * printed.
 *
 * Env: CP_URL (default https://cp.test:8443), RPC_URL (default http://chain-konto:8545), MCP_SERVER (default
 * /chain/mcp/server.mjs), MONEY_MOCK_URL (default http://money-mock:8790), KONTO_DIR (default /chain/konto), KONTO_SPENDER (the
 * key cp sends with on chain-konto, anvil account 0), NODE_EXTRA_CA_CERTS for the CA of cp.test.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  concat,
  createPublicClient,
  createWalletClient,
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  getContractAddress,
  http,
  keccak256,
  pad,
  size,
  slice,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { toCoinbaseSmartAccount } from "viem/account-abstraction";

const CHAIN_ID = 84532;
const CP_URL = (process.env.CP_URL || "https://cp.test:8443").replace(/\/+$/, "");
const RPC_URL = process.env.RPC_URL || "http://chain-konto:8545";
const MCP_SERVER = process.env.MCP_SERVER || "/chain/mcp/server.mjs";
const MOCK_URL = (process.env.MONEY_MOCK_URL || "http://money-mock:8790").replace(/\/+$/, "");
const KONTO_DIR = process.env.KONTO_DIR || "/chain/konto";
const SPENDER_KEY = (process.env.KONTO_SPENDER || "").trim();
const SPM = "0xf85210B21cC50302F477BA56686d2019dC9b67Ad";
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const PROXY = "0x4e59b44847b379578588920ca78fbf26c0b4956c";
const PROXY_FILE = "deterministic-deployment-proxy.hex";
const SALT = pad("0x00", { size: 32 });
const IBAN = "DE89 3704 0044 0532 0130 00";
const WRONG_IBAN = "DE89 3704 0044 0532 0130 01";
const LIMIT_PERIOD = 86400;
const PAYOUT_PERIOD = 2_592_000;
const PAYOUT_ALLOWANCE = 2n ** 160n - 1n;
const END_NEVER = 2 ** 48 - 1;
const FIXED_GAS = 300_000n;
const MONEY_TOOLS = ["deposit", "payout", "set_payout_rule", "start_automaton", "automaton_status", "stop_automaton"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const GENESIS_PROMPT = "You are a test automaton of the money walk in a local harness. Answer in one sentence.";

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
  { type: "function", name: "spend", stateMutability: "nonpayable", inputs: [tuple, { name: "value", type: "uint160" }], outputs: [] },
  { type: "function", name: "isApproved", stateMutability: "view", inputs: [tuple], outputs: [{ type: "bool" }] },
];
const FORWARDER_ABI = [
  { type: "function", name: "payout", stateMutability: "nonpayable", inputs: [tuple, { name: "value", type: "uint160" }], outputs: [] },
  { type: "function", name: "destination", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "caller", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "account", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];
const USDC_ABI = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }], outputs: [] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "who", type: "address" }], outputs: [{ type: "uint256" }] },
];
const TRANSFER_TOPIC = keccak256(new TextEncoder().encode("Transfer(address,address,uint256)"));
const FIVE_ADDRESSES = [{ type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }];

class WalkError extends Error {}
const fail = (reason) => { throw new WalkError(reason); };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const short = (v) => JSON.stringify(v).slice(0, 200);

async function rpc(method, params) {
  const res = await fetch(RPC_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const body = await res.json();
  if (body.error) fail(`${method}: ${body.error.message}`);
  return body.result;
}

const usdcOf = (who) => pub.readContract({ address: USDC, abi: USDC_ABI, functionName: "balanceOf", args: [who] });

/** mcp/server.mjs over stdio: one JSON-RPC message per line, answers matched by id (as in terminal.mjs). */
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
    const timer = setTimeout(() => { waiting.delete(n); reject(new WalkError(`mcp ${method}: no answer in 120 s`)); }, 120_000);
    waiting.set(n, (msg) => { clearTimeout(timer); resolve(msg); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: n, method, params })}\n`);
  });
  const results = [];
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

const attr = (html, name) => (new RegExp(`data-${name}="([^"]*)"`).exec(html) ?? [])[1] ?? "";
const block = (html, name) => html.includes(`data-soll="${name}"`);

/** The phone: the page of the code, then the tap on the number the terminal shows. Returns the page after the tap. */
async function phoneTap(url, match, expectBlock, mustShow) {
  const code = new URL(url).pathname.split("/").pop();
  const first = await fetch(`${CP_URL}/h/${code}`);
  const html = await first.text();
  if (first.status !== 200 || !block(html, expectBlock)) fail(`page of ${expectBlock}: ${first.status}`);
  if (mustShow && !html.includes(mustShow)) fail(`page of ${expectBlock} does not show ${mustShow}`);
  const choices = [...html.matchAll(/name="pick" value="([0-9]{2})"/g)].map((m) => Number(m[1]));
  if (choices.length !== 3 || !choices.includes(Number(match))) fail(`page of ${expectBlock} does not offer the number`);
  const tapped = await fetch(`${CP_URL}/h/${code}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `pick=${match}` });
  return { code, status: tapped.status, html: await tapped.text() };
}

/** A permission of the smart wallet, signed by its owner key; the strings are what the page script sends. */
async function sign(smart, fields) {
  const latest = await pub.getBlock();
  const permission = {
    account: smart.address.toLowerCase(),
    spender: fields.spender.toLowerCase(),
    token: fields.token.toLowerCase(),
    allowance: fields.allowance,
    period: fields.period,
    start: Number(latest.timestamp) - 5,
    end: END_NEVER,
    salt: BigInt(keccak256(generatePrivateKey())),
    extraData: "0x",
  };
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

const postJson = (url, body, headers = {}) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const postForm = (url, fields) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields).toString() });

/** Sends one transaction with a fixed gas limit, so that a call the chain refuses is mined as reverted instead of estimated away. */
async function sendFixed(wallet, to, data) {
  const hash = await wallet.sendTransaction({ to, data, gas: FIXED_GAS });
  return pub.waitForTransactionReceipt({ hash });
}

/** The proxy onto chain-konto with anvil_setCode, from harness/chain/konto/ after its keccak256 in the README there. */
async function placeProxy() {
  const readme = readFileSync(path.join(KONTO_DIR, "README.md"), "utf8");
  const row = new RegExp(`^\\| *${PROXY} *\\| *${PROXY_FILE} *\\| *(0x[0-9a-f]{64}) *\\|`, "im").exec(readme);
  if (!row) fail("no row for the proxy in harness/chain/konto/README.md");
  const code = readFileSync(path.join(KONTO_DIR, PROXY_FILE), "utf8").trim();
  if (keccak256(code) !== row[1]) fail("proxy code does not match its keccak256");
  await rpc("anvil_setCode", [PROXY, code]);
  if ((await pub.getCode({ address: PROXY })) !== code) fail("proxy code not in place after anvil_setCode");
}

/** Every transaction to `to` since `fromBlock`, with its input. */
async function txsTo(to, fromBlock) {
  const latest = await pub.getBlockNumber();
  const out = [];
  for (let n = fromBlock; n <= latest; n++) {
    const b = await pub.getBlock({ blockNumber: n, includeTransactions: true });
    for (const tx of b.transactions) if (same(tx.to, to)) out.push(tx);
  }
  return out;
}

async function walk() {
  const result = {};
  if ((await pub.getChainId()) !== CHAIN_ID) fail("chain-konto is not 84532");
  const spmCode = await pub.getCode({ address: SPM });
  if (!spmCode || spmCode === "0x") fail("no SpendPermissionManager on chain-konto (konto-chain.mjs places it)");
  if (!/^0x[0-9a-fA-F]{64}$/.test(SPENDER_KEY)) fail("KONTO_SPENDER is not set");
  const ours = privateKeyToAccount(SPENDER_KEY);
  const ourWallet = createWalletClient({ account: ours, chain, transport: http(RPC_URL) });
  const accounts = await rpc("eth_accounts", []);
  const foreign = accounts[2];
  if (!foreign || same(foreign, ours.address)) fail("no foreign anvil account");
  const health = await fetch(`${MOCK_URL}/healthz`).catch(() => null);
  if (!health?.ok) fail("money-mock does not answer");

  // 1. The proxy that creates every PayoutForwarder.
  await placeProxy();
  const startBlock = await pub.getBlockNumber();

  // 2. The account, as in terminal.mjs: 4 test USDC so that cp can top up credit for the start of the automaton.
  const owner = privateKeyToAccount(generatePrivateKey());
  const smart = await toCoinbaseSmartAccount({ client: pub, owners: [owner, SPM], ownerIndex: 0, version: "1" });
  const account = smart.address.toLowerCase();
  result.account = account;
  await rpc("eth_sendTransaction", [{ from: accounts[1], to: USDC, data: encodeFunctionData({ abi: USDC_ABI, functionName: "mint", args: [account, 4_000_000n] }) }]);

  const keyDir = mkdtempSync(path.join(os.tmpdir(), "money-"));
  const keyFile = path.join(keyDir, "config", "api-key");
  const mcp = startMcp({ PATH: process.env.PATH, NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS ?? "", CP_URL, CP_KEY_FILE: keyFile, HOME: keyDir });
  try {
    await mcp.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "money-walk", version: "1" } });
    const listed = (await mcp.request("tools/list", {})).result?.tools?.map((t) => t.name) ?? [];
    for (const t of MONEY_TOOLS) if (!listed.includes(t)) fail(`tools/list misses ${t}`);

    const started = (await mcp.tool("start_automaton", { genesis_prompt: GENESIS_PROMPT, name: `money-${Date.now() % 100000}`, daily_limit_usd: "5.00" })).json;
    if (started.status !== "waiting_for_phone" || !started.url || !started.match) fail(`start_automaton answered ${short(started)}`);
    const tap = await phoneTap(started.url, started.match, "approve");
    if (tap.status !== 200 || !block(tap.html, "passkey")) fail(`passkey page: ${tap.status}`);
    const first = await sign(smart, { spender: attr(tap.html, "spender"), token: attr(tap.html, "token"), allowance: BigInt(attr(tap.html, "limit") || "0"), period: LIMIT_PERIOD });
    if (Number(attr(tap.html, "chain")) !== CHAIN_ID) fail(`passkey page names chain ${attr(tap.html, "chain")}`);
    if (!same(first.permission.spender, ours.address)) fail("passkey page names another spender than the key of cp");
    const created = await postJson(`${CP_URL}/h/${tap.code}/konto`, first.body);
    if (created.status !== 200) fail(`POST /h/{code}/konto: ${created.status} ${(await created.text()).slice(0, 160)}`);
    const exists = await poll("the hosted automaton exists", 300_000, async () => {
      const st = (await mcp.tool("automaton_status")).json;
      if (st.status === "failed") fail(`automaton_status failed: ${st.reason ?? ""} ${String(st.message ?? "").slice(0, 120)}`);
      return st.id && (st.status === "starting" || st.status === "running") ? st : null;
    });
    const stopped = (await mcp.tool("stop_automaton")).json;
    if (stopped.status !== "stopped") fail(`stop_automaton: ${short(stopped)}`);
    result.automaton = exists.id;
    const key = readFileSync(keyFile, "utf8").trim();
    if (!key.startsWith("cnwy_k_")) fail("key file holds no API key");
    const auth = { authorization: `Bearer ${key}` };

    // 3. Deposit through the tool; the onramp of the mock pays to the address the page shows.
    const dep = (await mcp.tool("deposit", { amount_usd: "20.00" })).json;
    if (dep.status !== "waiting_for_phone" || !dep.qr || !dep.url || !dep.match) fail(`deposit answered ${short(dep)}`);
    if ("poll_token" in dep) fail("deposit showed poll_token");
    const dtap = await phoneTap(dep.url, dep.match, "approve", "$20.00");
    if (dtap.status !== 200 || !block(dtap.html, "card") || !dtap.html.includes('id="money-card"')) fail(`deposit-card page: ${dtap.status}`);
    const cardAddress = attr(dtap.html, "address");
    if (!same(cardAddress, account)) fail(`deposit-card names ${cardAddress}, not the smart wallet ${account}`);
    if (attr(dtap.html, "amount") !== "20000000" || Number(attr(dtap.html, "chain")) !== CHAIN_ID) fail("deposit-card names another amount or chain");
    const onramp = await postJson(`${MOCK_URL}/onramp`, { address: cardAddress, amount: attr(dtap.html, "amount"), chain: Number(attr(dtap.html, "chain")) });
    const ramp = await onramp.json().catch(() => ({}));
    if (onramp.status !== 200 || !ramp.tx) fail(`onramp: ${onramp.status} ${short(ramp)}`);
    const rampReceipt = await pub.getTransactionReceipt({ hash: ramp.tx });
    const minted = rampReceipt.logs.filter((l) => same(l.address, USDC) && l.topics[0] === TRANSFER_TOPIC);
    if (minted.length !== 1 || !same(slice(minted[0].topics[2], 12), account) || BigInt(minted[0].data) !== 20_000_000n) fail("the onramp did not deliver 20 USDC to the smart wallet");
    const sneaky = await postJson(`${CP_URL}/h/${dtap.code}/deposit`, { opened: true, wallet_address: ours.address });
    if (sneaky.status !== 400) fail(`POST /h/{code}/deposit with wallet_address: ${sneaky.status}`);
    const opened = await postJson(`${CP_URL}/h/${dtap.code}/deposit`, { opened: true });
    const openedBody = await opened.json().catch(() => ({}));
    if (opened.status !== 200 || openedBody.state !== "done") fail(`POST /h/{code}/deposit: ${opened.status} ${short(openedBody)}`);
    const depDone = await poll("deposit done in automaton_status", 60_000, async () => {
      const st = (await mcp.tool("automaton_status")).json;
      if (st.deposit?.status === "failed") fail(`deposit failed: ${st.deposit.reason ?? ""}`);
      return st.deposit?.status === "done" ? st : null;
    });
    if (typeof depDone.balance_usd !== "string") fail("automaton_status shows no balance_usd");
    result.deposit = { tx: ramp.tx, balance_usd: depDone.balance_usd };

    // 4. The first payout: the key alone gets payout_needs_phone, the tool opens the phone step.
    const direct = await postJson(`${CP_URL}/v1/konto/payout`, { amount_usd: "5.00" }, auth);
    const directBody = await direct.json().catch(() => ({}));
    if (direct.status !== 409 || directBody.error !== "payout_needs_phone") fail(`first payout with the key alone: ${direct.status} ${directBody.error}`);
    const out1 = (await mcp.tool("payout", { amount_usd: "5.00" })).json;
    if (out1.status !== "waiting_for_phone" || !out1.qr || !out1.url || !out1.match) fail(`payout answered ${short(out1)}`);
    const ptap = await phoneTap(out1.url, out1.match, "approve");
    if (ptap.status !== 200 || !block(ptap.html, "verify")) fail(`payout-verify page: ${ptap.status}`);
    const kycHref = (/id="money-verify"[^>]*href="([^"]*)"/.exec(ptap.html) ?? [])[1] ?? "";
    if (!kycHref.startsWith("https://bridge.test/verify/")) fail(`payout-verify links to ${kycHref || "nothing"}`);
    const verified = await fetch(`${CP_URL}/h/${ptap.code}/payout-verify`, { method: "POST" });
    const bankHtml = await verified.text();
    if (verified.status !== 200 || !block(bankHtml, "bank") || !bankHtml.includes('name="iban"')) fail(`payout-bank page: ${verified.status}`);
    const wrong = await postForm(`${CP_URL}/h/${ptap.code}/payout-bank`, { iban: WRONG_IBAN, owner_name: "Ada Example" });
    if (wrong.status !== 400) fail(`a wrong IBAN: ${wrong.status}`);
    const banked = await postForm(`${CP_URL}/h/${ptap.code}/payout-bank`, { iban: IBAN, owner_name: "Ada Example" });
    const passHtml = await banked.text();
    if (banked.status !== 200 || !block(passHtml, "payout") || attr(passHtml, "mode") !== "payout") fail(`payout-passkey page: ${banked.status}`);
    if (!passHtml.includes("only to your bank account ending 3000")) fail("payout-passkey page does not name the bank account ending 3000");
    if (!same(attr(passHtml, "account"), account) || Number(attr(passHtml, "chain")) !== CHAIN_ID) fail("payout-passkey page names another account or chain");
    const forwarder = attr(passHtml, "spender").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(forwarder) || same(forwarder, ours.address)) fail(`payout-passkey page names spender ${forwarder}`);
    const mockCalls = (await (await fetch(`${MOCK_URL}/mock/calls`)).json()).calls;
    const liqCall = mockCalls.filter((c) => /\/liquidation_addresses$/.test(c.path)).pop();
    const extCall = mockCalls.filter((c) => /\/external_accounts$/.test(c.path)).pop();
    if (!liqCall || !extCall || liqCall.status !== 201 || extCall.status !== 201) fail("cp did not create bank account and payout address at the Bridge mock");
    if (mockCalls.some((c) => c.path.startsWith("/v0/") && (!c.key_ok || (c.method === "POST" && !c.idempotency_key)))) fail("a call to the Bridge mock without the key or an Idempotency-Key");
    if (extCall.body?.iban?.account_number !== IBAN.replace(/ /g, "") || extCall.body?.iban?.country !== "DEU") fail("the bank account at the Bridge mock is not the example IBAN");
    const second = await sign(smart, { spender: forwarder, token: attr(passHtml, "token"), allowance: PAYOUT_ALLOWANCE, period: PAYOUT_PERIOD });
    const signed = await postJson(`${CP_URL}/h/${ptap.code}/payout`, { permission: second.body.permission, signature: second.body.signature });
    const signedBody = await signed.json().catch(() => ({}));
    if (signed.status !== 200 || signedBody.state !== "done" || signedBody.bank_last4 !== "3000") fail(`POST /h/{code}/payout: ${signed.status} ${short(signedBody)}`);
    const paid1 = await poll("first payout sent in automaton_status", 120_000, async () => {
      const st = (await mcp.tool("automaton_status")).json;
      if (st.payout?.status === "failed") fail(`first payout failed: ${st.payout.reason ?? ""} ${String(st.payout.message ?? "").slice(0, 120)}`);
      return st.payout?.status === "sent" ? st : null;
    });
    if (paid1.payout.amount_usd !== "5.00") fail(`first payout sent ${paid1.payout.amount_usd}`);

    // Where the money went: the forwarder came through the proxy with CREATE2 and pays only to the liquidation address.
    const destination = (await pub.readContract({ address: forwarder, abi: FORWARDER_ABI, functionName: "destination" })).toLowerCase();
    const liqAddress = String(liqCall.answer?.address ?? "").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(liqAddress) || destination !== liqAddress) fail(`the forwarder pays to ${destination}, not to the payout address ${liqAddress} of the Bridge mock`);
    const deploys = (await txsTo(PROXY, startBlock + 1n)).filter((tx) => size(tx.input) > 32 + 160);
    const deploy = deploys.find((tx) => {
      const initCode = slice(tx.input, 32);
      return same(getContractAddress({ opcode: "CREATE2", from: PROXY, salt: SALT, bytecode: initCode }), forwarder);
    });
    if (!deploy) fail("the forwarder was not created through the proxy with salt 0");
    if (!same(deploy.from, ours.address)) fail("the forwarder was created by another key than the one of cp");
    const initCode = slice(deploy.input, 32);
    const creation = slice(initCode, 0, size(initCode) - 160);
    const [fAccount, fDestination, fToken, fManager, fCaller] = decodeAbiParameters(FIVE_ADDRESSES, slice(initCode, size(initCode) - 160));
    if (!same(fAccount, account) || !same(fDestination, destination) || !same(fToken, USDC) || !same(fManager, SPM) || !same(fCaller, ours.address)) {
      fail("the forwarder was built with other values than account, payout address, USDC, manager and our key");
    }
    if (!same(await pub.readContract({ address: forwarder, abi: FORWARDER_ABI, functionName: "caller" }), ours.address)) fail("forwarder caller is not our key");
    if ((await usdcOf(destination)) !== 5_000_000n) fail(`the payout address holds ${await usdcOf(destination)}, not 5 USDC`);
    if ((await usdcOf(forwarder)) !== 0n) fail("USDC stayed in the forwarder");
    if (!(await pub.readContract({ address: SPM, abi: SPM_ABI, functionName: "isApproved", args: [second.permission] }))) fail("the second permission is not approved on-chain");

    // 5. The second payout goes without the phone.
    const before2 = await usdcOf(destination);
    const out2 = (await mcp.tool("payout", { amount_usd: "3.00" })).json;
    if (out2.status !== "sent" || out2.amount_usd !== "3.00" || out2.qr || out2.url) fail(`second payout answered ${short(out2)}`);
    if ((await usdcOf(destination)) - before2 !== 3_000_000n) fail("the second payout did not bring 3 USDC to the payout address");
    const kycCalls = (await (await fetch(`${MOCK_URL}/mock/calls`)).json()).calls.filter((c) => c.method === "POST" && c.path === "/v0/kyc_links").length;
    if (kycCalls !== 1) fail(`the Bridge mock saw ${kycCalls} identity checks`);

    // 6. spend() of the second permission directly from our key: only the forwarder is its spender.
    const directSpend = await sendFixed(ourWallet, SPM, encodeFunctionData({ abi: SPM_ABI, functionName: "spend", args: [second.permission, 1_000_000n] }));
    if (directSpend.status !== "reverted") fail("spend() of the second permission from our key went through");

    // 7. A forwarder with another destination, built from the creation code cp sent to the proxy, deployed by someone else.
    const elsewhere = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    const otherInit = concat([creation, encodeAbiParameters(FIVE_ADDRESSES, [account, elsewhere, USDC, SPM, ours.address])]);
    const otherForwarder = getContractAddress({ opcode: "CREATE2", from: PROXY, salt: SALT, bytecode: otherInit }).toLowerCase();
    const deployed = await rpc("eth_sendTransaction", [{ from: foreign, to: PROXY, data: concat([SALT, otherInit]), gas: "0x2dc6c0" }]);
    if ((await pub.waitForTransactionReceipt({ hash: deployed })).status !== "success") fail("the other forwarder was not deployed through the proxy");
    const otherCode = await pub.getCode({ address: otherForwarder });
    if (!otherCode || otherCode === "0x") fail("no code at the other forwarder");
    const otherPayout = await sendFixed(ourWallet, otherForwarder, encodeFunctionData({ abi: FORWARDER_ABI, functionName: "payout", args: [second.permission, 1_000_000n] }));
    if (otherPayout.status !== "reverted") fail("payout over a forwarder with another destination went through");
    if ((await usdcOf(elsewhere)) !== 0n) fail("the other destination received USDC");

    // 8. The right forwarder, called from a foreign address.
    const foreignCall = await rpc("eth_sendTransaction", [{
      from: foreign, to: forwarder, gas: `0x${FIXED_GAS.toString(16)}`,
      data: encodeFunctionData({ abi: FORWARDER_ABI, functionName: "payout", args: [second.permission, 1_000_000n] }),
    }]);
    const foreignReceipt = await pub.waitForTransactionReceipt({ hash: foreignCall });
    if (foreignReceipt.status !== "reverted") fail("payout from a foreign address went through");
    if ((await usdcOf(destination)) !== 8_000_000n) fail("the payout address does not hold exactly 8 USDC after the refused calls");

    // 9. The payout rule, on a weekday that is not due during this walk, and automaton_status shows it.
    const weekday = WEEKDAYS[(new Date().getUTCDay() + 3) % 7];
    const rule = (await mcp.tool("set_payout_rule", { keep_usd: "2.00", weekday })).json;
    if (rule.status !== "done" || rule.payout_rule?.keep_usd !== "2.00" || rule.payout_rule?.weekday !== weekday) fail(`set_payout_rule answered ${short(rule)}`);
    const status = (await mcp.tool("automaton_status")).json;
    if (status.payout_rule?.keep_usd !== "2.00" || status.payout_rule?.weekday !== weekday) fail(`automaton_status shows the rule ${short(status.payout_rule)}`);
    if (typeof status.balance_usd !== "string") fail("automaton_status shows no balance_usd at the end");

    if (mcp.results.some((t) => t.includes(key)) || mcp.stderr().includes(key)) fail("the API key appeared in a tool result or on stderr");
    Object.assign(result, {
      forwarder,
      destination,
      forwarder_deploy: deploy.hash,
      payouts_usdc: String(await usdcOf(destination)),
      balance_usd: status.balance_usd,
      direct_spend: directSpend.status,
      other_forwarder: otherForwarder,
      other_payout: otherPayout.status,
      foreign_payout: foreignReceipt.status,
      rule: status.payout_rule,
    });
    console.log(`MONEY_RESULT ${JSON.stringify(result)}`);
  } finally {
    mcp.close();
  }
}

try {
  await walk();
  console.log("MONEY_VERDICT ok");
} catch (err) {
  const reason = err instanceof WalkError ? err.message : `error ${String((err && (err.shortMessage || err.message)) || err).split("\n")[0]}`;
  console.log(`MONEY_VERDICT fail ${reason}`);
  process.exitCode = 1;
}
