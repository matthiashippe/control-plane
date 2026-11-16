// The run on Base Sepolia of goals/konto/05, point 15 (docs/konto/euro.md, "Auszahlung", "Weiterleitung"): an account by passkey
// over the handoff, a payment of 8 test USDC to it, the payout handoff with the same passkey (Bridge stood in by a local HTTP
// server: identity approved, bank account, payout address = a fresh address of our own, `ziel`), then POST /v1/konto/payout of
// 3.00 USD: the server deploys the forwarder through the deterministic deployment proxy, approves the second permission and pays
// over the forwarder. Last two attacks that must fail on-chain, each with a fixed gas limit: spend() of the second permission
// straight from our test key, and payout() over a second forwarder of the same account with another destination. Writes the
// addresses and hashes to docs/konto/sepolia-payout.md.
//
//   node --import tsx ops/konto/sepolia-payout-run.mjs
//
// On the code-host only, like ops/konto/sepolia-limit-run.mjs: the control plane runs here with a fresh database from mktemp -d on
// 127.0.0.1:47391 (the Allowed Origin of the Auth Proxy). The first request with the API key tops the account up once (2.00 USD
// back to the test address), which deploys the smart wallet; the run waits for it, so that no two transactions of the test key
// race. Chromium from ~/.cache/ms-playwright/ opens the phone page with one virtual authenticator for both handoffs. The test key
// comes from ~/.config/control-plane/konto-sepolia.key and is never printed; every transaction goes through sendKontoTx.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { concat, createPublicClient, decodeFunctionData, encodeFunctionData, getAddress, http as viemHttp } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const { loadKontoKey, sendKontoTx } = await import("../../src/konto/chain.ts");
const { KONTO_CHAIN_ID, SEPOLIA_USDC, SPEND_PERMISSION_MANAGER } = await import("../../src/konto/config.ts");
const { SPEND_PERMISSION_MANAGER_ABI } = await import("../../src/konto/topup.ts");
const { permissionFromJson } = await import("../../src/konto/account.ts");
const { FORWARDER_ABI } = await import("../../src/konto/forwarder.ts");
const { DEPLOY_PROXY, FORWARDER_SALT, forwarderAddress, forwarderInitCode } = await import("../../src/konto/payout.ts");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 47391;
const ORIGIN = `http://localhost:${PORT}`;
const RPC = "https://sepolia.base.org";
const KEY_FILE = path.join(os.homedir(), ".config/control-plane/konto-sepolia.key");
const SECRETS = path.join(os.homedir(), "brain/connectors/secrets.env");
const DAILY_LIMIT = 5_000_000n; // the limit of the first permission, which only the top-up uses
const PAYMENT = 8_000_000n; // what the test address pays to the account
const PAYOUT_USD = "3.00";
const PAYOUT = 3_000_000n;
const TRY = 1_000_000n; // what each attack tries to move
const FIXED_GAS = 300_000n; // sent anyway, so that it fails on-chain rather than at the estimate
const EXAMPLE_IBAN = "DE89 3704 0044 0532 0130 00";

const say = (line) => console.log(`sepolia: ${line}`);
const die = (line) => { console.error(`sepolia: ${line}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const lower = (a) => String(a).toLowerCase();

function secret(name) {
  if (!existsSync(SECRETS)) die(`${SECRETS} missing`);
  const line = readFileSync(SECRETS, "utf8").split("\n").find((l) => l.startsWith(`${name}=`));
  const value = line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
  if (!value) die(`${name} missing in secrets.env`);
  return value;
}

function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer().once("error", () => resolve(false)).once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });
}

function findChrome() {
  const base = path.join(os.homedir(), ".cache", "ms-playwright");
  const dirs = existsSync(base) ? readdirSync(base) : [];
  return dirs.filter((d) => d.startsWith("chromium-")).sort((a, b) => Number(b.split("-").pop()) - Number(a.split("-").pop()))
    .map((d) => path.join(base, d, "chrome-linux64/chrome")).find((p) => existsSync(p));
}

/** A DevTools session over --remote-debugging-pipe (fd 3 in, fd 4 out, NUL-terminated), as ops/soll-konto.mjs does it. */
function launch(chrome, profile) {
  // --no-sandbox as Playwright passes it: the code-host allows no user namespaces.
  const child = spawn(chrome, [
    "--headless=new", "--no-sandbox", "--remote-debugging-pipe", `--user-data-dir=${profile}`, "--no-first-run",
    "--no-default-browser-check", "--disable-gpu", "--disable-extensions", "--disable-sync", "--disable-component-update",
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });
  let id = 0, rest = "";
  const waiting = new Map(), listeners = [];
  child.stdio[4].on("data", (d) => {
    rest += d.toString("utf8");
    let end;
    while ((end = rest.indexOf("\0")) >= 0) {
      const msg = JSON.parse(rest.slice(0, end));
      rest = rest.slice(end + 1);
      if (msg.id && waiting.has(msg.id)) {
        const { ok, fail } = waiting.get(msg.id); waiting.delete(msg.id);
        msg.error ? fail(new Error(`${msg.error.message} (${msg.error.code})`)) : ok(msg.result);
      } else if (msg.method) for (const l of listeners) l(msg);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
    const n = ++id; waiting.set(n, { ok, fail });
    child.stdio[3].write(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0");
  });
  return { send, on: (l) => listeners.push(l), close: () => { try { child.kill("SIGKILL"); } catch { /* gone */ } } };
}

/** Server-Sent Events of the handoff, collected as they come. */
function follow(code, pollToken) {
  const events = [];
  const ctl = new AbortController();
  (async () => {
    const res = await fetch(`${ORIGIN}/v1/handoff/${code}`, { headers: { authorization: `Bearer ${pollToken}` }, signal: ctl.signal });
    const reader = res.body.getReader();
    let text = "";
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      text += new TextDecoder().decode(r.value);
      let i;
      while ((i = text.indexOf("\n\n")) >= 0) {
        const block = text.slice(0, i); text = text.slice(i + 2);
        const data = block.split("\n").find((l) => l.startsWith("data: "));
        if (data) events.push(JSON.parse(data.slice(6)));
      }
    }
  })().catch(() => {});
  return { events, stop: () => ctl.abort() };
}

async function until(what, ms, check) {
  const deadline = Date.now() + ms;
  for (;;) {
    const v = await check();
    if (v) return v;
    if (Date.now() > deadline) die(`${what}: nothing after ${ms / 1000} s`);
    await wait(500);
  }
}

/**
 * Bridge, stood in by a local HTTP server: the identity is approved at once, the bank account gets the last four characters of
 * the IBAN, and the payout address of the bank account is `destination`, a fresh address of our own that stands for the bank.
 */
function bridgeStandIn(destination) {
  const calls = [];
  const kyc = { id: "kyc_sepolia", customer_id: "cus_sepolia", kyc_link: "https://bridge.example/verify/kyc_sepolia", kyc_status: "approved" };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => { raw += d; });
    req.on("end", () => {
      const url = new URL(req.url, "http://bridge");
      calls.push(`${req.method} ${url.pathname}`);
      const send = (status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
      const p = url.pathname;
      if (req.headers["api-key"] !== "bridge-stand-in") return send(401, { code: "unauthorized" });
      if (req.method === "POST" && p === "/v0/kyc_links") return send(200, kyc);
      if (req.method === "GET" && p === `/v0/kyc_links/${kyc.id}`) return send(200, kyc);
      if (req.method === "GET" && p === `/v0/customers/${kyc.customer_id}`) {
        return send(200, { id: kyc.customer_id, status: "active", endorsements: [{ name: "sepa", status: "approved" }] });
      }
      if (req.method === "POST" && p === `/v0/customers/${kyc.customer_id}/external_accounts`) {
        const body = JSON.parse(raw || "{}");
        const iban = String(body?.iban?.account_number ?? "");
        return send(201, { id: "ext_sepolia", currency: "eur", account_type: "iban", iban: { last_4: iban.slice(-4), country: body?.iban?.country } });
      }
      if (req.method === "POST" && p === `/v0/customers/${kyc.customer_id}/liquidation_addresses`) {
        return send(201, { id: "liq_sepolia", chain: "base", currency: "usdc", address: destination, state: "active" });
      }
      if (req.method === "GET" && p.endsWith("/drains")) return send(200, { count: 0, data: [] });
      return send(404, { code: "not_found" });
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${server.address().port}`, calls, close: () => server.close() })));
}

// ---- before anything starts: the money of the test address, read only
const account = loadKontoKey(KEY_FILE);
const pub = createPublicClient({ chain: baseSepolia, transport: viemHttp(RPC) });
if ((await pub.getChainId()) !== KONTO_CHAIN_ID) die("the RPC is not Base Sepolia");
const ERC20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
];
const usdcOf = (who) => pub.readContract({ address: SEPOLIA_USDC, abi: ERC20, functionName: "balanceOf", args: [who] });
const eth = await pub.getBalance({ address: account.address });
const usdc = await usdcOf(account.address);
say(`test address ${account.address}: ${eth} wei, ${usdc} atomic USDC`);
if (eth < 200_000_000_000_000n) die("the test address needs Base Sepolia ETH for gas (at least 0.0002 ETH)");
if (usdc < PAYMENT) die("the test address needs 8 test USDC");
if (!(await portFree(PORT))) die(`port ${PORT} is taken`);
const chrome = findChrome();
if (!chrome) die("no Chromium under ~/.cache/ms-playwright");
const proxyId = secret("TURNKEY_AUTH_PROXY_CONFIG_ID");

// The bank of this run: a fresh address nobody holds a key to after the run, and a second one for the attack.
const ziel = lower(privateKeyToAccount(generatePrivateKey()).address);
const zielFremd = lower(privateKeyToAccount(generatePrivateKey()).address);
const bridge = await bridgeStandIn(ziel);

// ---- the control plane, fresh
const dir = mkdtempSync(path.join(os.tmpdir(), "konto-payout-sepolia-"));
const dbPath = path.join(dir, "cp.db");
const bridgeKey = path.join(dir, "bridge.key");
writeFileSync(bridgeKey, "bridge-stand-in\n");
const cpLog = [];
const cp = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
  cwd: ROOT,
  env: {
    PATH: process.env.PATH, HOME: process.env.HOME,
    CP_HOST: "127.0.0.1", CP_PORT: String(PORT), CP_DB_PATH: dbPath, CP_PROVIDER: "mock", CP_SANDBOXES: "0",
    CP_KONTO_CHAIN_ID: String(KONTO_CHAIN_ID), CP_KONTO_KEY_FILE: KEY_FILE, CP_KONTO_RPC_URL: RPC, CP_KONTO_AUTH_PROXY_ID: proxyId,
    CP_KONTO_TOPUP_USDC: "2000000", CP_KONTO_TOPUP_BELOW_USDC: "1000000",
    CP_BRIDGE_URL: bridge.url, CP_BRIDGE_KEY_FILE: bridgeKey,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
for (const s of [cp.stdout, cp.stderr]) s.on("data", (d) => cpLog.push(...String(d).split("\n").filter(Boolean)));
let browser = null;
let cpGone = false;
cp.once("exit", () => { cpGone = true; });
process.on("exit", () => { browser?.close(); if (!cpGone) cp.kill("SIGTERM"); bridge.close(); });
await until("control plane start", 60_000, () => fetch(`${ORIGIN}/v1/status`).then((r) => r.ok).catch(() => false));
say(`control plane on ${ORIGIN}, Bridge stand-in on ${bridge.url}, database ${dbPath}`);

// ---- the phone, one virtual authenticator for both handoffs
browser = launch(chrome, mkdtempSync(path.join(os.tmpdir(), "konto-chrome-")));
const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
const page = (m, p) => browser.send(m, p, sessionId);
const pageErrors = [];
browser.on((msg) => {
  if (msg.sessionId !== sessionId) return;
  if (msg.method === "Runtime.exceptionThrown") pageErrors.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text);
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") pageErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
});
await page("Runtime.enable");
await page("Page.enable");
await page("WebAuthn.enable", { enableUI: false });
await page("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});
// A page that is navigating has no context to evaluate in; that counts as "not yet".
const evaluate = async (expression) => {
  try {
    return (await page("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
  } catch {
    return undefined;
  }
};
const ready = (cond) => evaluate(`document.readyState === "complete" && (${cond})`);

/** The page, the right number, for a payout the bank form, then the passkey button and the page the script lands on. */
async function phone(created, what, bank) {
  await page("Page.navigate", { url: `${ORIGIN}/h/${created.code}` });
  await until(`${what}: page`, 30_000, () => ready(`location.href !== "about:blank"`));
  const tapped = await evaluate(`(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === ${JSON.stringify(String(created.match))}); if (!b) return false; b.click(); return true; })()`);
  if (!tapped) die(`${what}: the right number is not on the page`);
  if (bank) {
    await until(`${what}: bank step`, 30_000, () => ready(`!!document.querySelector('input[name="iban"]')`));
    await evaluate(`(() => { document.querySelector('input[name="iban"]').value = ${JSON.stringify(EXAMPLE_IBAN)}; document.querySelector('input[name="owner_name"]').value = "Erika Mustermann"; document.querySelector('input[name="iban"]').form.submit(); return true; })()`);
  }
  await until(`${what}: passkey step`, 30_000, () => ready(`!!document.getElementById("konto-passkey")`));
  await wait(800);
  await evaluate(`document.getElementById("konto-passkey").click(), true`);
  const title = await until(`${what}: end of the passkey step`, 120_000, async () => {
    if (await ready(`!!document.getElementById("konto-retry") && !document.getElementById("konto-retry").disabled`)) {
      say(`${what}: the signature check was unavailable, tapping again`);
      await evaluate(`document.getElementById("konto-retry").click(), true`);
      return "";
    }
    return evaluate(`(document.title.startsWith("Approved") || document.title.startsWith("No account") || document.title.startsWith("Nothing")) && document.readyState === "complete" ? document.title : ""`);
  });
  if (!title.startsWith("Approved")) {
    const why = await evaluate(`document.querySelector(".sub") ? document.querySelector(".sub").textContent : ""`);
    die(`${what}: "${title}", ${why} ${pageErrors.join(" | ").slice(0, 400)} ${cpLog.filter((l) => /konto|payout|error/i.test(l)).slice(-5).join(" | ")}`);
  }
}

// ---- 1. the account by passkey over the handoff
const created = await (await fetch(`${ORIGIN}/v1/handoff`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ automaton_name: "Atlas", daily_limit_usdc: String(DAILY_LIMIT), step: "konto" }),
})).json();
if (!created.code) die(`handoff not created: ${JSON.stringify(created).slice(0, 200)}`);
const stream = follow(created.code, created.poll_token);
await phone(created, "account", false);
const done = await until("done in the stream", 30_000, () => stream.events.find((e) => e.state === "done"));
stream.stop();
if (!done.account || !/^cnwy_k_/.test(done.api_key ?? "")) die("done came without account or api_key");
const konto = lower(done.account);
const key = { authorization: `Bearer ${done.api_key}` };
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const accountRow = db.prepare("SELECT * FROM konto_accounts WHERE address = ?").get(konto);
if (!accountRow?.owner || !accountRow?.organization_id) die("the account kept no passkey wallet for the payout");
say(`account ${konto}`);

// ---- 2. 8 test USDC from the test address to the account, a plain transfer
const transport = viemHttp(RPC);
const paymentTx = await sendKontoTx({
  chainId: KONTO_CHAIN_ID, account, transport,
  tx: { to: SEPOLIA_USDC, data: encodeFunctionData({ abi: ERC20, functionName: "transfer", args: [konto, PAYMENT] }) },
});
if ((await pub.waitForTransactionReceipt({ hash: paymentTx })).status !== "success") die(`payment reverted: ${paymentTx}`);
say(`payment ${paymentTx}`);

// ---- 3. one request with the key tops the account up once (approveWithSignature of the first permission deploys the smart
// wallet); the run waits for it, so that no transaction of the server runs beside one of this script. Then the payout handoff.
if (!(await fetch(`${ORIGIN}/v1/credits/balance`, { headers: key })).ok) die("balance with the new key failed");
const topup = await until("the top-up after the first request with the key", 180_000, () =>
  db.prepare("SELECT ref FROM ledger WHERE kind = 'topup' AND address = ?").get(konto));
say(`top-up ${topup.ref} (the smart wallet is deployed)`);
const payoutHandoff = await (await fetch(`${ORIGIN}/v1/handoff`, {
  method: "POST",
  headers: { "content-type": "application/json", ...key },
  body: JSON.stringify({ automaton_name: "Atlas", step: "payout" }),
})).json();
if (!payoutHandoff.code) die(`payout handoff not created: ${JSON.stringify(payoutHandoff).slice(0, 200)}`);
const payoutStream = follow(payoutHandoff.code, payoutHandoff.poll_token);
await phone(payoutHandoff, "payout", true);
const payoutDone = await until("done of the payout handoff", 30_000, () => payoutStream.events.find((e) => e.state === "done"));
payoutStream.stop();
browser.close(); browser = null;
if ("api_key" in payoutDone) die("done of the payout carried an api_key");
const payoutRow = db.prepare("SELECT * FROM konto_payouts WHERE address = ?").get(konto);
if (!payoutRow?.permission || !payoutRow.forwarder || lower(payoutRow.destination) !== ziel) die(`no payout setup for ${ziel}: ${JSON.stringify(payoutRow ?? null).slice(0, 300)}`);
const fixed = { token: SEPOLIA_USDC, manager: SPEND_PERMISSION_MANAGER, caller: account.address };
const forwarder = lower(forwarderAddress(konto, ziel, fixed));
if (lower(payoutRow.forwarder) !== forwarder) die(`the forwarder of the server ${payoutRow.forwarder} is not the CREATE2 address ${forwarder}`);
const permission = permissionFromJson(payoutRow.permission);
if (lower(permission.spender) !== forwarder) die("the second permission does not name the forwarder as spender");
say(`payout handoff done, bank ending ${payoutDone.bank_last4 ?? "?"}, forwarder ${forwarder}`);

// ---- 4. the payout of 3.00 USD: deploy, approveWithSignature, payout, all sent by the server
const status = await (await fetch(`${ORIGIN}/v1/konto/payout`, { headers: key })).json();
if (!status.payout_ready) die(`GET /v1/konto/payout: ${JSON.stringify(status)}`);
const fromBlock = await pub.getBlockNumber();
const paid = await fetch(`${ORIGIN}/v1/konto/payout`, { method: "POST", headers: { "content-type": "application/json", ...key }, body: JSON.stringify({ amount_usd: PAYOUT_USD }) });
const paidBody = await paid.json();
if (paid.status !== 200 || paidBody.state !== "sent" || paidBody.amount_usd !== PAYOUT_USD) die(`POST /v1/konto/payout ${paid.status}: ${JSON.stringify(paidBody)}`);
const auszahlungTx = lower(paidBody.tx);
const auszahlungBlock = (await pub.getTransactionReceipt({ hash: auszahlungTx })).blockNumber;
const atZiel = await usdcOf(ziel);
if (atZiel !== PAYOUT) die(`the destination holds ${atZiel} atomic USDC, not ${PAYOUT}`);
// The deploy and the approval are the transactions of our key to the proxy and to SpendPermissionManager in between.
let anlageTx = null, erlaubnisTx = null;
const initData = lower(concat([FORWARDER_SALT, forwarderInitCode(konto, ziel, fixed)]));
for (let n = fromBlock; n <= auszahlungBlock; n++) {
  const block = await pub.getBlock({ blockNumber: n, includeTransactions: true });
  for (const tx of block.transactions) {
    if (lower(tx.from) !== lower(account.address)) continue;
    if (lower(tx.to) === lower(DEPLOY_PROXY) && lower(tx.input) === initData) anlageTx = lower(tx.hash);
    if (lower(tx.to) === lower(SPEND_PERMISSION_MANAGER)) {
      const call = decodeFunctionData({ abi: SPEND_PERMISSION_MANAGER_ABI, data: tx.input });
      if (call.functionName === "approveWithSignature" && lower(call.args[0].spender) === forwarder) erlaubnisTx = lower(tx.hash);
    }
  }
}
if (!anlageTx || !erlaubnisTx) die(`deploy ${anlageTx} or approval ${erlaubnisTx} not found between block ${fromBlock} and ${auszahlungBlock}`);
say(`deploy ${anlageTx}, approval ${erlaubnisTx}, payout ${auszahlungTx}, ${atZiel} atomic USDC at the destination`);
const gone = new Promise((r) => cp.once("exit", r));
cp.kill("SIGTERM");
await Promise.race([gone, wait(10_000)]);

// ---- 5. spend() of the second permission straight from our key: only the forwarder is its spender
const fremdSpendTx = lower(await sendKontoTx({
  chainId: KONTO_CHAIN_ID, account, transport,
  tx: { to: SPEND_PERMISSION_MANAGER, data: encodeFunctionData({ abi: SPEND_PERMISSION_MANAGER_ABI, functionName: "spend", args: [permission, TRY] }), gas: FIXED_GAS },
}));
if ((await pub.waitForTransactionReceipt({ hash: fremdSpendTx })).status !== "reverted") die(`spend() from our key went through: ${fremdSpendTx}`);
say(`spend() from our key ${fremdSpendTx}, reverted`);

// ---- 6. a second forwarder of the same account to another destination, and payout() over it with the second permission
const forwarderFremd = lower(forwarderAddress(konto, zielFremd, fixed));
const anlageFremdTx = lower(await sendKontoTx({
  chainId: KONTO_CHAIN_ID, account, transport,
  tx: { to: DEPLOY_PROXY, data: concat([FORWARDER_SALT, forwarderInitCode(konto, zielFremd, fixed)]) },
}));
if ((await pub.waitForTransactionReceipt({ hash: anlageFremdTx })).status !== "success") die(`deploy of the second forwarder reverted: ${anlageFremdTx}`);
const codeFremd = await pub.getCode({ address: getAddress(forwarderFremd) });
if (!codeFremd || codeFremd === "0x") die(`the second forwarder ${forwarderFremd} has no code`);
const fremdZielTx = lower(await sendKontoTx({
  chainId: KONTO_CHAIN_ID, account, transport,
  tx: { to: getAddress(forwarderFremd), data: encodeFunctionData({ abi: FORWARDER_ABI, functionName: "payout", args: [permission, TRY] }), gas: FIXED_GAS },
}));
if ((await pub.waitForTransactionReceipt({ hash: fremdZielTx })).status !== "reverted") die(`payout() over the second forwarder went through: ${fremdZielTx}`);
if ((await usdcOf(zielFremd)) !== 0n) die("the other destination received USDC");
say(`second forwarder ${forwarderFremd} (${anlageFremdTx}), payout() over it ${fremdZielTx}, reverted`);

const scan = (kind, v) => `https://sepolia.basescan.org/${kind}/${v}`;
writeFileSync(path.join(ROOT, "docs/konto/sepolia-payout.md"), `# Die Auszahlung über die Weiterleitung auf Base Sepolia

Lauf von goals/konto/05, Punkt 15, am ${new Date().toISOString().slice(0, 10)} mit \`node --import tsx ops/konto/sepolia-payout-run.mjs\` auf
dem code-host: Konto per Passkey über den Handoff (virtueller Authenticator in Chromium), eine Zahlung von 8 Test-USDC an das
Konto, dann der Handoff mit \`step: "payout"\` und demselben Passkey. Bridge war ein lokaler Stand-in: Identität bestätigt, Bankkonto
mit der Beispiel-IBAN, als Auszahladresse eine frisch erzeugte eigene Adresse (\`ziel\`), die für das Bankkonto steht. Die Seite
unterschrieb die zweite Erlaubnis mit dem vorhandenen Passkey, Spender ist die Weiterleitung zu genau diesem Ziel.
\`POST /v1/konto/payout\` mit 3,00 USD legte die Weiterleitung über den Proxy 0x4e59b44847b379578588920ca78fbf26c0b4956c an,
schaltete die Erlaubnis mit \`approveWithSignature\` frei und zahlte 3 Test-USDC über die Weiterleitung an das Ziel.

Danach zwei Angriffe mit festem Gas, die on-chain scheiterten: \`spend()\` der zweiten Erlaubnis direkt von unserem Schlüssel
(\`fremd-spend\`) und \`payout()\` über eine zweite Weiterleitung desselben Kontos mit anderem Ziel (\`fremd-ziel\`). Die erste Anfrage
mit dem API-Key buchte wie in konto 03 einmal 2 USD nach, das legte die Smart Wallet an. Alles auf Base Sepolia (84532) mit
Test-USDC; die Belege prüft der Prüfbefehl von Punkt 15 gegen https://sepolia.base.org.

konto: ${konto}
ziel: ${ziel}
forwarder: ${forwarder}
forwarder-fremd: ${forwarderFremd}
erlaubnis: ${erlaubnisTx}
anlage: ${anlageTx}
auszahlung: ${auszahlungTx}
fremd-spend: ${fremdSpendTx}
fremd-ziel: ${fremdZielTx}

Weitere Belege: Zahlung an das Konto ${paymentTx.toLowerCase()},
Nachbuchen ${lower(topup.ref)},
Anlage der zweiten Weiterleitung ${anlageFremdTx}.

## Im Explorer

- Konto: ${scan("address", konto)}
- Ziel: ${scan("address", ziel)}
- Weiterleitung: ${scan("address", forwarder)}
- Zweite Weiterleitung: ${scan("address", forwarderFremd)}
- Freischaltung: ${scan("tx", erlaubnisTx)}
- Anlage: ${scan("tx", anlageTx)}
- Auszahlung: ${scan("tx", auszahlungTx)}
- spend() von unserem Schlüssel: ${scan("tx", fremdSpendTx)}
- payout() über die zweite Weiterleitung: ${scan("tx", fremdZielTx)}
`);
say("docs/konto/sepolia-payout.md written");
process.exit(0);
