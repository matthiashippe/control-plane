// The run on Base Sepolia of goals/konto/03, point 10 (docs/konto/konto.md, "Base Sepolia"): one account by passkey over the
// handoff, a payment to it, a top-up from the spend permission, and a spend over the daily limit that fails on-chain. Writes the
// hashes to docs/konto/sepolia.md.
//
//   node --import tsx ops/konto/sepolia-run.mjs                 the whole run (needs Base Sepolia ETH at the test address)
//   node --import tsx ops/konto/sepolia-run.mjs --until-konto   stops once the account exists; sends nothing, needs no gas
//
// On the code-host only: the control plane starts here with a fresh database from mktemp -d on 127.0.0.1:47391, the port that is
// an Allowed Origin of the Auth Proxy (http://localhost:47391); Chromium from ~/.cache/ms-playwright/ opens the phone page with a
// virtual authenticator of the DevTools protocol, which stands in for the passkey of a phone. The test key comes from
// ~/.config/control-plane/konto-sepolia.key and is never printed; the Auth Proxy configuration from ~/brain/connectors/secrets.env
// (TURNKEY_AUTH_PROXY_CONFIG_ID, public by Turnkey's design, still not printed). Every transaction goes through sendKontoTx.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { createPublicClient, decodeFunctionData, encodeFunctionData, http, parseErc6492Signature, parseSignature } from "viem";
import { baseSepolia } from "viem/chains";
import { findChrome, launch } from "../browser.mjs";

const { loadKontoKey, sendKontoTx } = await import("../../src/konto/chain.ts");
const { KONTO_CHAIN_ID, SEPOLIA_USDC, SPEND_PERMISSION_MANAGER } = await import("../../src/konto/config.ts");
const { SPEND_PERMISSION_MANAGER_ABI } = await import("../../src/konto/topup.ts");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 47391;
const ORIGIN = `http://localhost:${PORT}`;
const RPC = "https://sepolia.base.org";
const KEY_FILE = path.join(os.homedir(), ".config/control-plane/konto-sepolia.key");
const SECRETS = path.join(os.homedir(), "brain/connectors/secrets.env");
const UNTIL_KONTO = process.argv.includes("--until-konto");
const LIMIT = 5_000_000n; // the daily limit of the handoff, 5.00 USD
const PAYMENT = 6_000_000n; // what a service with payTo on the account takes in
const OVER = 4_000_000n; // after the top-up of 2.00 USD, 3.00 USD are left of the day: 4.00 USD crosses the limit
const FIXED_GAS = 300_000n; // the spend over the limit is sent anyway, so it fails on-chain rather than at the estimate

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
if (!UNTIL_KONTO) {
  if (eth < 100_000_000_000_000n) die("the test address needs Base Sepolia ETH for gas (at least 0.0001 ETH)");
  if (usdc < PAYMENT) die("the test address needs 6 test USDC");
}
if (!(await portFree(PORT))) die(`port ${PORT} is taken`);
const chrome = findChrome("passkey");
if (!chrome) die("no Chromium under ~/.cache/ms-playwright");
const proxyId = secret("TURNKEY_AUTH_PROXY_CONFIG_ID");

// ---- the control plane, fresh
const dir = mkdtempSync(path.join(os.tmpdir(), "konto-sepolia-"));
const dbPath = path.join(dir, "cp.db");
const cp = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
  cwd: ROOT,
  env: {
    PATH: process.env.PATH, HOME: process.env.HOME,
    CP_HOST: "127.0.0.1", CP_PORT: String(PORT), CP_DB_PATH: dbPath, CP_PROVIDER: "mock", CP_SANDBOXES: "0",
    CP_KONTO_CHAIN_ID: String(KONTO_CHAIN_ID), CP_KONTO_KEY_FILE: KEY_FILE, CP_KONTO_RPC_URL: RPC, CP_KONTO_AUTH_PROXY_ID: proxyId,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const cpLog = [];
for (const s of [cp.stdout, cp.stderr]) s.on("data", (d) => cpLog.push(...String(d).split("\n").filter(Boolean)));
let browser = null;
const stopAll = () => { browser?.close(); cp.kill("SIGTERM"); };
process.on("exit", stopAll);
await until("control plane start", 60_000, () => fetch(`${ORIGIN}/v1/status`).then((r) => r.ok).catch(() => false));
say(`control plane on ${ORIGIN}, database ${dbPath}`);

// ---- the handoff, as a terminal starts it
const created = await (await fetch(`${ORIGIN}/v1/handoff`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ automaton_name: "Atlas", daily_limit_usdc: String(LIMIT), amount_usdc: String(LIMIT), step: "konto" }),
})).json();
if (!created.code) die(`handoff not created: ${JSON.stringify(created).slice(0, 200)}`);
const stream = follow(created.code, created.poll_token);

// ---- the phone: the number, then the passkey
browser = launch(chrome, mkdtempSync(path.join(os.tmpdir(), "konto-chrome-")), "passkey");
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
const settled = (what) => until(what, 30_000, () => evaluate(`document.readyState === "complete" && location.href !== "about:blank"`));
await page("Page.navigate", { url: `${ORIGIN}/h/${created.code}` });
await settled("phone page");
const tapped = await evaluate(`(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === ${JSON.stringify(String(created.match))}); if (!b) return false; b.click(); return true; })()`);
if (!tapped) die("the right number is not on the page");
await until("passkey step", 30_000, () => evaluate(`!!document.getElementById("konto-passkey") && document.readyState === "complete"`));
await until("script of the page", 30_000, () => evaluate(`!!document.querySelector('script[src="/h/konto.js"]')`));
await wait(500);
await evaluate(`document.getElementById("konto-passkey").click(), true`);
const title = await until("end of the passkey step", 120_000, () =>
  evaluate(`(document.title.startsWith("Approved") || document.title.startsWith("No account")) && document.readyState === "complete" ? document.title : ""`));
if (!title.startsWith("Approved")) {
  const why = await evaluate(`document.querySelector(".sub") ? document.querySelector(".sub").textContent : ""`);
  die(`no account: "${title}", ${why} ${pageErrors.join(" | ").slice(0, 400)} ${cpLog.filter((l) => /konto|error/i.test(l)).slice(-5).join(" | ")}`);
}
const done = await until("done in the stream", 30_000, () => stream.events.find((e) => e.state === "done"));
stream.stop();
browser.close(); browser = null;
if (!done.account || !/^cnwy_k_/.test(done.api_key ?? "")) die("done came without account or api_key");
const states = [...new Set(stream.events.map((e) => e.state))].join(" ");

// The Turnkey wallet: owner 0 in the factory call of the ERC-6492 signature the page sent.
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const row = db.prepare("SELECT signature, permission FROM konto_accounts WHERE address = ?").get(done.account);
if (!row) die("the account is not in konto_accounts");
const wrapped = parseErc6492Signature(row.signature);
const FACTORY_ABI = [{ type: "function", name: "createAccount", stateMutability: "payable", inputs: [{ type: "bytes[]" }, { type: "uint256" }], outputs: [{ type: "address" }] }];
const owners = decodeFunctionData({ abi: FACTORY_ABI, data: wrapped.data }).args[0];
const owner = `0x${owners[0].slice(-40)}`;
say(`account ${done.account}, owner (Turnkey wallet) ${owner}, stream ${states}, api_key once`);
if (UNTIL_KONTO) {
  say("--until-konto: account created and its permission accepted by the server; nothing sent");
  process.exit(0);
}

// ---- a payment to the account: the test address signs transferWithAuthorization and sends it itself
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
const paid = await pub.waitForTransactionReceipt({ hash: paymentTx });
if (paid.status !== "success") die(`payment reverted: ${paymentTx}`);
say(`payment ${paymentTx}`);

// ---- the credit of the account is 0, below the threshold: one request with its key starts the top-up
const balance = await fetch(`${ORIGIN}/v1/credits/balance`, { headers: { authorization: `Bearer ${done.api_key}` } });
if (!balance.ok) die(`balance with the new key: ${balance.status}`);
const ledger = await until("ledger row topup", 180_000, () =>
  db.prepare("SELECT ref, delta_mc FROM ledger WHERE kind = 'topup' AND address = ?").get(done.account));
const approved = db.prepare("SELECT approved_tx FROM konto_accounts WHERE address = ?").get(done.account).approved_tx;
if (!approved) die("no approveWithSignature recorded");
say(`approve ${approved}, spend ${ledger.ref}, ledger ${ledger.delta_mc} mc`);

// ---- 4.00 USD in a later block: 3.00 USD are left of the day, so SpendPermissionManager refuses on-chain
const spendBlock = (await pub.getTransactionReceipt({ hash: ledger.ref })).blockNumber;
await until("a later block", 60_000, async () => (await pub.getBlockNumber()) > spendBlock);
const p = JSON.parse(row.permission);
const permission = { ...p, allowance: BigInt(p.allowance), salt: BigInt(p.salt), period: Number(p.period), start: Number(p.start), end: Number(p.end) };
const overTx = await sendKontoTx({
  chainId: KONTO_CHAIN_ID, account, transport,
  tx: { to: SPEND_PERMISSION_MANAGER, data: encodeFunctionData({ abi: SPEND_PERMISSION_MANAGER_ABI, functionName: "spend", args: [permission, OVER] }), gas: FIXED_GAS },
});
const over = await pub.waitForTransactionReceipt({ hash: overTx });
if (over.status !== "reverted") die(`the spend over the limit went through: ${overTx}`);
say(`over the limit ${overTx}, reverted`);

writeFileSync(path.join(ROOT, "docs/konto/sepolia.md"), `# Der Lauf auf Base Sepolia

Lauf von goals/konto/03, Punkt 10, am ${new Date().toISOString().slice(0, 10)} mit \`node --import tsx ops/konto/sepolia-run.mjs\` auf dem
code-host: Konto per Passkey über den Handoff (virtueller Authenticator in Chromium), eine Zahlung von 6 Test-USDC an das Konto,
ein Nachbuchen von 2 USD aus der Erlaubnis und eine Abbuchung von 4 USD in einem späteren Block, die die Tagesgrenze von 5 USD reißt
und on-chain scheitert. Alles auf Base Sepolia (84532) mit Test-USDC; die Belege prüft der Prüfbefehl von Punkt 10 gegen
https://sepolia.base.org.

konto: ${done.account}
besitzer: ${owner}
spender: ${account.address.toLowerCase()}
erlaubnis: ${approved}
zahlung: ${paymentTx.toLowerCase()}
abbuchung: ${ledger.ref.toLowerCase()}
ueber-grenze: ${overTx.toLowerCase()}
ledger: topup ${ledger.delta_mc} ${ledger.ref.toLowerCase()}
`);
say("docs/konto/sepolia.md written");
process.exit(0);
