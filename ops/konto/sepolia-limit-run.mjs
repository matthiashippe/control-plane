// The run on Base Sepolia of goals/konto/04, point 10 (docs/konto/terminal.md, "Tageslimit"): an account by passkey over the
// handoff with a daily limit of 5.00 USD, a payment of 8 test USDC to it, a first top-up that approves the old permission, the raise
// to 10.00 USD over a handoff with step limit and the same passkey, then approveWithSignature of the new and revokeAsSpender of
// the old permission and a spend() of 6.00 USD from the new one (more than the old limit), and last a spend() from the old one
// that fails on-chain. Writes the hashes to docs/konto/sepolia-limit.md.
//
//   node --import tsx ops/konto/sepolia-limit-run.mjs
//
// On the code-host only, like ops/konto/sepolia-run.mjs: the control plane runs here with a fresh database from mktemp -d on
// 127.0.0.1:47391 (the Allowed Origin of the Auth Proxy), first with CP_KONTO_TOPUP_USDC of 2.00 USD and then, restarted on the
// same database, with 6.00 USD, so that the first top-up leaves 6 of the 8 test USDC for the spend from the new permission.
// CP_KONTO_TOPUP_BELOW_USDC is 100 USD, so that a request with the key always tops up. Chromium from ~/.cache/ms-playwright/
// opens the phone page with one virtual authenticator for both steps, so the raise uses the passkey the account was created with.
// The test key comes from ~/.config/control-plane/konto-sepolia.key and is never printed; every transaction goes through
// sendKontoTx.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { createPublicClient, decodeFunctionData, encodeFunctionData, http, parseSignature } from "viem";
import { baseSepolia } from "viem/chains";

const { loadKontoKey, sendKontoTx } = await import("../../src/konto/chain.ts");
const { KONTO_CHAIN_ID, SEPOLIA_USDC, SPEND_PERMISSION_MANAGER } = await import("../../src/konto/config.ts");
const { SPEND_PERMISSION_MANAGER_ABI } = await import("../../src/konto/topup.ts");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 47391;
const ORIGIN = `http://localhost:${PORT}`;
const RPC = "https://sepolia.base.org";
const KEY_FILE = path.join(os.homedir(), ".config/control-plane/konto-sepolia.key");
const SECRETS = path.join(os.homedir(), "brain/connectors/secrets.env");
const OLD_LIMIT = 5_000_000n; // 5.00 USD, the limit the account starts with
const NEW_LIMIT = 10_000_000n; // 10.00 USD after the raise
const PAYMENT = 8_000_000n; // what the test address pays to the account
const FIRST_TOPUP = 2_000_000n; // the first top-up, from the old permission
const NEW_SPEND = 6_000_000n; // the spend from the new permission: more than the old limit
const OLD_TRY = 1_000_000n; // the spend from the old permission after its revoke, which must fail
const FIXED_GAS = 300_000n; // sent anyway, so that it fails on-chain rather than at the estimate

const say = (line) => console.log(`sepolia: ${line}`);
const die = (line) => { console.error(`sepolia: ${line}`); process.exit(1); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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


// ---- before anything starts
const account = loadKontoKey(KEY_FILE);
const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
if ((await pub.getChainId()) !== KONTO_CHAIN_ID) die("the RPC is not Base Sepolia");
const ERC20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "version", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  {
    type: "function", name: "transferWithAuthorization", stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" }, { name: "r", type: "bytes32" }, { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
];
const eth = await pub.getBalance({ address: account.address });
const usdc = await pub.readContract({ address: SEPOLIA_USDC, abi: ERC20, functionName: "balanceOf", args: [account.address] });
say(`test address ${account.address}: ${eth} wei, ${usdc} atomic USDC`);
if (eth < 200_000_000_000_000n) die("the test address needs Base Sepolia ETH for gas (at least 0.0002 ETH)");
if (usdc < PAYMENT) die("the test address needs 8 test USDC");
if (!(await portFree(PORT))) die(`port ${PORT} is taken`);
const chrome = findChrome();
if (!chrome) die("no Chromium under ~/.cache/ms-playwright");
const proxyId = secret("TURNKEY_AUTH_PROXY_CONFIG_ID");

// ---- the control plane, fresh, and later the same database again with another top-up
const dir = mkdtempSync(path.join(os.tmpdir(), "konto-limit-sepolia-"));
const dbPath = path.join(dir, "cp.db");
const cpLog = [];
let cp = null;
async function startCp(topupUsdc) {
  cp = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: ROOT,
    env: {
      PATH: process.env.PATH, HOME: process.env.HOME,
      CP_HOST: "127.0.0.1", CP_PORT: String(PORT), CP_DB_PATH: dbPath, CP_PROVIDER: "mock", CP_SANDBOXES: "0",
      CP_KONTO_CHAIN_ID: String(KONTO_CHAIN_ID), CP_KONTO_KEY_FILE: KEY_FILE, CP_KONTO_RPC_URL: RPC, CP_KONTO_AUTH_PROXY_ID: proxyId,
      CP_KONTO_TOPUP_USDC: String(topupUsdc), CP_KONTO_TOPUP_BELOW_USDC: "100000000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const s of [cp.stdout, cp.stderr]) s.on("data", (d) => cpLog.push(...String(d).split("\n").filter(Boolean)));
  await until("control plane start", 60_000, () => fetch(`${ORIGIN}/v1/status`).then((r) => r.ok).catch(() => false));
  say(`control plane on ${ORIGIN}, top-up ${topupUsdc}, database ${dbPath}`);
}
async function stopCp() {
  const gone = new Promise((r) => cp.once("exit", r));
  cp.kill("SIGTERM");
  await Promise.race([gone, wait(10_000)]);
  await until("port free again", 30_000, () => portFree(PORT));
}
let browser = null;
process.on("exit", () => { browser?.close(); cp?.kill("SIGTERM"); });
await startCp(FIRST_TOPUP);

// ---- the phone, one virtual authenticator for both steps
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
const evaluate = async (expression) => (await page("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;

/** The phone through one handoff: the page, the right number, the passkey button, the page the script lands on. */
async function phone(created, what) {
  await page("Page.navigate", { url: `${ORIGIN}/h/${created.code}` });
  await until(`${what}: page`, 30_000, () => evaluate(`document.readyState === "complete" && location.href !== "about:blank"`));
  const tapped = await evaluate(`(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === ${JSON.stringify(String(created.match))}); if (!b) return false; b.click(); return true; })()`);
  if (!tapped) die(`${what}: the right number is not on the page`);
  await until(`${what}: passkey step`, 30_000, () => evaluate(`!!document.getElementById("konto-passkey") && document.readyState === "complete"`));
  await wait(800);
  await evaluate(`document.getElementById("konto-passkey").click(), true`);
  const title = await until(`${what}: end of the passkey step`, 120_000, () =>
    evaluate(`(document.title.startsWith("Approved") || document.title.startsWith("No account")) && document.readyState === "complete" ? document.title : ""`));
  if (!title.startsWith("Approved")) {
    const why = await evaluate(`document.querySelector(".sub") ? document.querySelector(".sub").textContent : ""`);
    die(`${what}: "${title}", ${why} ${pageErrors.join(" | ").slice(0, 400)} ${cpLog.filter((l) => /konto|error/i.test(l)).slice(-5).join(" | ")}`);
  }
}

// ---- 1. the account, daily limit 5.00 USD, the first payment left to the server
const created = await (await fetch(`${ORIGIN}/v1/handoff`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ automaton_name: "Atlas", daily_limit_usdc: String(OLD_LIMIT), step: "konto" }),
})).json();
if (!created.code) die(`handoff not created: ${JSON.stringify(created).slice(0, 200)}`);
const stream = follow(created.code, created.poll_token);
await phone(created, "account");
const done = await until("done in the stream", 30_000, () => stream.events.find((e) => e.state === "done"));
stream.stop();
if (!done.account || !/^cnwy_k_/.test(done.api_key ?? "")) die("done came without account or api_key");
const key = { authorization: `Bearer ${done.api_key}` };
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const accountRow = () => db.prepare("SELECT * FROM konto_accounts WHERE address = ?").get(done.account);
if (!accountRow()?.owner || !accountRow()?.organization_id) die("the account kept no passkey wallet for a raise");
say(`account ${done.account}`);

// ---- 2. 8 test USDC to the account: the test address signs transferWithAuthorization and sends it itself
const name = await pub.readContract({ address: SEPOLIA_USDC, abi: ERC20, functionName: "name" });
const version = await pub.readContract({ address: SEPOLIA_USDC, abi: ERC20, functionName: "version" });
const nowSec = BigInt(Math.floor(Date.now() / 1000));
const nonce = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`;
const auth = { from: account.address, to: done.account, value: PAYMENT, validAfter: 0n, validBefore: nowSec + 3600n, nonce };
const sig = parseSignature(await account.signTypedData({
  domain: { name, version, chainId: KONTO_CHAIN_ID, verifyingContract: SEPOLIA_USDC },
  types: {
    TransferWithAuthorization: [
      { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
    ],
  },
  primaryType: "TransferWithAuthorization",
  message: auth,
}));
const transport = http(RPC);
const paymentTx = await sendKontoTx({
  chainId: KONTO_CHAIN_ID, account, transport,
  tx: { to: SEPOLIA_USDC, data: encodeFunctionData({ abi: ERC20, functionName: "transferWithAuthorization", args: [auth.from, auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce, Number(sig.v ?? 27n), sig.r, sig.s] }) },
});
if ((await pub.waitForTransactionReceipt({ hash: paymentTx })).status !== "success") die(`payment reverted: ${paymentTx}`);
say(`payment ${paymentTx}`);

// ---- 3. one request with the key: approveWithSignature of the old permission and the first top-up of 2.00 USD
if (!(await fetch(`${ORIGIN}/v1/credits/balance`, { headers: key })).ok) die("balance with the new key failed");
const firstTopup = await until("first top-up", 180_000, () => db.prepare("SELECT ref FROM ledger WHERE kind = 'topup' AND address = ?").get(done.account));
const oldApprove = accountRow().approved_tx;
if (!oldApprove) die("no approveWithSignature of the old permission");
const oldPermission = JSON.parse(accountRow().permission);
say(`old permission approved ${oldApprove}, first top-up ${firstTopup.ref}`);

// ---- 4. the raise to 10.00 USD over the phone, with the same passkey
const raise = await (await fetch(`${ORIGIN}/v1/handoff`, {
  method: "POST",
  headers: { "content-type": "application/json", ...key },
  body: JSON.stringify({ automaton_name: "Atlas", daily_limit_usdc: String(NEW_LIMIT), step: "limit" }),
})).json();
if (!raise.code) die(`raise not created: ${JSON.stringify(raise).slice(0, 200)}`);
const raiseStream = follow(raise.code, raise.poll_token);
await phone(raise, "raise");
const raised = await until("done of the raise", 30_000, () => raiseStream.events.find((e) => e.state === "done"));
raiseStream.stop();
browser.close(); browser = null;
if (raised.daily_limit_usdc !== String(NEW_LIMIT) || "api_key" in raised) die(`done of the raise: ${JSON.stringify(raised)}`);
const newPermission = JSON.parse(accountRow().next_permission ?? "null");
if (!newPermission || newPermission.salt === oldPermission.salt) die("no new permission waits on the account");
say("raise done, the new permission waits for the next top-up");

// ---- 5. the same database with a top-up of 6.00 USD: approve the new, revoke the old, spend 6.00 USD from the new
await stopCp();
await startCp(NEW_SPEND);
if (!(await fetch(`${ORIGIN}/v1/credits/balance`, { headers: key })).ok) die("balance after the restart failed");
const newTopup = await until("top-up from the new permission", 240_000, () =>
  db.prepare("SELECT ref, meta FROM ledger WHERE kind = 'topup' AND address = ? AND ref <> ?").get(done.account, firstTopup.ref));
if (JSON.parse(newTopup.meta).usdc !== String(NEW_SPEND)) die(`top-up from the new permission took ${newTopup.meta}`);
const newApprove = accountRow().approved_tx;
const SPM_TX = (hash) => pub.getTransaction({ hash }).then((tx) => decodeFunctionData({ abi: SPEND_PERMISSION_MANAGER_ABI, data: tx.input }));
if ((await SPM_TX(newApprove)).functionName !== "approveWithSignature") die("the new approve is no approveWithSignature");
// The revoke is the transaction of our spender to SpendPermissionManager between the new approve and the spend.
const approveBlock = (await pub.getTransactionReceipt({ hash: newApprove })).blockNumber;
const spendBlock = (await pub.getTransactionReceipt({ hash: newTopup.ref })).blockNumber;
let revokeTx = null;
for (let n = approveBlock; n <= spendBlock && !revokeTx; n++) {
  const block = await pub.getBlock({ blockNumber: n, includeTransactions: true });
  for (const tx of block.transactions) {
    if (tx.from.toLowerCase() !== account.address.toLowerCase() || tx.to?.toLowerCase() !== SPEND_PERMISSION_MANAGER) continue;
    const call = decodeFunctionData({ abi: SPEND_PERMISSION_MANAGER_ABI, data: tx.input });
    if (call.functionName === "revokeAsSpender" && String(call.args[0].salt) === String(oldPermission.salt)) revokeTx = tx.hash;
  }
}
if (!revokeTx) die("no revokeAsSpender of the old permission between the new approve and the spend");
say(`new approve ${newApprove}, revoke ${revokeTx}, spend ${newTopup.ref}`);

// ---- 6. a spend from the old permission, in a later block, with a fixed gas limit: refused on-chain
const revokeBlock = (await pub.getTransactionReceipt({ hash: revokeTx })).blockNumber;
await until("a later block", 60_000, async () => (await pub.getBlockNumber()) > revokeBlock);
const old = { ...oldPermission, allowance: BigInt(oldPermission.allowance), salt: BigInt(oldPermission.salt), period: Number(oldPermission.period), start: Number(oldPermission.start), end: Number(oldPermission.end) };
const oldTx = await sendKontoTx({
  chainId: KONTO_CHAIN_ID, account, transport,
  tx: { to: SPEND_PERMISSION_MANAGER, data: encodeFunctionData({ abi: SPEND_PERMISSION_MANAGER_ABI, functionName: "spend", args: [old, OLD_TRY] }), gas: FIXED_GAS },
});
if ((await pub.waitForTransactionReceipt({ hash: oldTx })).status !== "reverted") die(`the spend from the old permission went through: ${oldTx}`);
say(`old permission after the revoke ${oldTx}, reverted`);
await stopCp();

writeFileSync(path.join(ROOT, "docs/konto/sepolia-limit.md"), `# Die Erhöhung des Tageslimits auf Base Sepolia

Lauf von goals/konto/04, Punkt 10, am ${new Date().toISOString().slice(0, 10)} mit \`node --import tsx ops/konto/sepolia-limit-run.mjs\` auf dem
code-host: Konto per Passkey über den Handoff mit einem Tageslimit von 5 USD (virtueller Authenticator in Chromium), eine Zahlung
von 8 Test-USDC an das Konto, ein erstes Nachbuchen von 2 USD, das die alte Erlaubnis freischaltet, dann die Erhöhung auf 10 USD über
einen Handoff mit \`step: "limit"\` und demselben Passkey. Vor der nächsten Abbuchung schaltete der Server die neue Erlaubnis frei,
widerrief die alte und buchte 6 USD aus der neuen ab, mehr als das alte Limit. Ein \`spend()\` aus der alten Erlaubnis scheiterte
danach on-chain. Alles auf Base Sepolia (84532) mit Test-USDC; die Belege prüft der Prüfbefehl von Punkt 10 gegen
https://sepolia.base.org.

konto: ${done.account}
spender: ${account.address.toLowerCase()}
zahlung: ${paymentTx.toLowerCase()}
erlaubnis-alt: ${oldApprove.toLowerCase()}
abbuchung-alt: ${firstTopup.ref.toLowerCase()}
erlaubnis-neu: ${newApprove.toLowerCase()}
widerruf: ${revokeTx.toLowerCase()}
abbuchung-neu: ${newTopup.ref.toLowerCase()}
alt-nach-widerruf: ${oldTx.toLowerCase()}
`);
say("docs/konto/sepolia-limit.md written");
process.exit(0);
