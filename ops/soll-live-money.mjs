// The real money states of the phone page /h/{code} as ops/soll-money.mjs compares them (goals/konto/05, point 5). Drives
// createApp with an empty database, the account switched on for chain 84532 and Bridge answered without a network, without a
// port, through all seven states, and writes each answer unchanged to <dir>/money-<state>.html, which ops/soll-money.mjs loads
// with --check --source <dir>.
//
//   node --import tsx ops/soll-live-money.mjs --out <dir>
//
// Nothing of the page is cut or added here: every difference to the approved pictures is a difference of the page and has to be
// fixed in src/public/money.ts. What this script chooses are the values the pictures show: the name Atlas, 20.00 USD, the
// numbers 62, 47 and 18 with 47 the right one, and the example IBAN whose last four are 3000. The account is written into the
// database the way finishKonto leaves it (an account of konto 03 needs a signature the chain checks, and there is no chain here);
// from there on it goes through the doors a real terminal and a real phone use: POST /v1/handoff with the API key, the page of
// the code, the right number, the identity check that Bridge first reports as not done and then as approved, the bank form,
// and the page a tap comes back to after a signature that could not be checked.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const at = args.indexOf("--out");
if (at < 0 || !args[at + 1] || args.length !== 2) {
  console.error("usage: node --import tsx ops/soll-live-money.mjs --out <dir>");
  process.exit(1);
}
const out = path.resolve(args[at + 1]);
mkdirSync(out, { recursive: true });

process.env.CP_PUBLIC_URL = "https://postyourprice.com";
const { createApp } = await import("../src/app.ts");
const { openDb, ensureWallet } = await import("../src/db.ts");
const { createApiKey } = await import("../src/auth/siwe.ts");
const { permissionJson } = await import("../src/konto/account.ts");
const { SEPOLIA_USDC, PERIOD_SECONDS } = await import("../src/konto/config.ts");
const { createBridge } = await import("../src/konto/bridge.ts");
const { createPayoutChain } = await import("../src/konto/payout.ts");
const { randomBytes } = await import("node:crypto");
const { createPublicClient, custom } = await import("viem");
const { baseSepolia } = await import("viem/chains");
const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");

const NOW = Date.parse("2026-11-16T12:00:00Z");
const noNetwork = custom({ request: async () => { throw new Error("no network"); } });
const offline = createPublicClient({ chain: baseSepolia, transport: noNetwork });
const gas = privateKeyToAccount(generatePrivateKey());
const payoutChain = createPayoutChain({ chainId: 84532, account: gas, transport: noNetwork, token: SEPOLIA_USDC });
const konto = { chainId: 84532, spender: gas.address, token: SEPOLIA_USDC, verifyClient: offline, payoutChain };

// Bridge without a network, as in test/konto-payout.test.ts: the identity check is first not done, then approved; the bank
// account and the payout address come back with made-up IDs and a fresh address.
const fakeBridge = { kycStatus: "not_started" };
const bridgeFetch = async (input, init) => {
  const url = new URL(input);
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(init.body) : null;
  const answer = (status, json) => ({ status, ok: status < 300, json: async () => json });
  const kyc = { id: "kyc_1", customer_id: "cus_1", kyc_link: "https://bridge.example/verify/kyc_1", kyc_status: fakeBridge.kycStatus, tos_link: "https://bridge.example/tos", tos_status: "approved" };
  if (method === "POST" && url.pathname === "/v0/kyc_links") return answer(200, kyc);
  if (method === "GET" && url.pathname === "/v0/kyc_links/kyc_1") return answer(200, kyc);
  if (method === "POST" && url.pathname === "/v0/customers/cus_1/external_accounts") {
    return answer(201, { id: "ext_1", currency: "eur", account_type: "iban", iban: { last_4: String(body?.iban?.account_number ?? "").slice(-4) } });
  }
  if (method === "POST" && url.pathname === "/v0/customers/cus_1/liquidation_addresses") {
    return answer(201, { id: "liq_1", chain: "base", currency: "usdc", address: privateKeyToAccount(generatePrivateKey()).address.toLowerCase(), state: "active" });
  }
  return answer(404, { code: "not_found" });
};
const bridge = createBridge({ baseUrl: "https://bridge.test", apiKey: "fake-bridge", fetch: bridgeFetch });

// The numbers of the picture: match 47 in the middle, 62 and 18 around it, as in ops/soll-live-handoff.mjs, once per code.
const draws = [];
const random = { bytes: (n) => randomBytes(n), int: (min, max) => { const v = draws.shift(); if (v === undefined || v < min || v >= max) throw new Error(`soll-live-money: draw ${v} outside [${min}, ${max})`); return v; } };

const db = openDb(":memory:");
const account = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
const owner = privateKeyToAccount(generatePrivateKey()).address;
ensureWallet(db, account);
const permission = { account, spender: gas.address.toLowerCase(), token: SEPOLIA_USDC, allowance: 5_000_000n, period: PERIOD_SECONDS, start: NOW / 1000 - 60, end: 281474976710655, salt: 1n, extraData: "0x" };
db.prepare("INSERT INTO konto_accounts (address, chain_id, permission, signature, created_at, owner, organization_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
  .run(account, 84532, permissionJson(permission), "0x" + "11".repeat(65), new Date(NOW).toISOString(), owner, "org-soll-1");
const session = randomBytes(32).toString("hex");
db.prepare("INSERT INTO sessions (token, address, expires_at) VALUES (?, ?, ?)").run(session, account, NOW + 60_000);
const { key } = createApiKey(db, session, "Atlas", NOW);

const app = createApp({ db, now: () => new Date(NOW), rateLimit: null, handoff: { random, missLimit: null }, konto, bridge });
const ask = async (name, url, init, status) => {
  const res = await app.request(url, init);
  if (res.status !== status) {
    console.error(`soll-live-money: ${name}: ${init?.method ?? "GET"} ${url} answered ${res.status}, expected ${status}`);
    process.exit(2);
  }
  return res;
};
const write = async (state, res) => {
  const html = await res.text();
  writeFileSync(path.join(out, `money-${state}.html`), html);
  console.log(`soll-live-money: ${state} ${res.status}, ${html.length} bytes`);
};
const start = async (body) => {
  draws.push(47, 62, 18, 1);
  return (await ask(body.step, "/v1/handoff", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  }, 201)).json();
};
const formPost = (fields) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields).toString() });

const deposit = await start({ automaton_name: "Atlas", step: "deposit", amount_usd: "20.00" });
await write("deposit-approve", await ask("deposit-approve", `/h/${deposit.code}`, undefined, 200));
await write("deposit-card", await ask("deposit-card", `/h/${deposit.code}`, formPost({ pick: String(deposit.match) }), 200));

const payout = await start({ automaton_name: "Atlas", step: "payout" });
await write("payout-approve", await ask("payout-approve", `/h/${payout.code}`, undefined, 200));
await write("payout-verify", await ask("payout-verify", `/h/${payout.code}`, formPost({ pick: String(payout.match) }), 200));
fakeBridge.kycStatus = "approved";
await write("payout-bank", await ask("payout-bank", `/h/${payout.code}`, undefined, 200));
await write("payout-passkey", await ask("payout-passkey", `/h/${payout.code}/payout-bank`, formPost({ iban: "DE89 3704 0044 0532 0130 00", owner_name: "Erika Mustermann" }), 200));
await write("retry", await ask("retry", `/h/${payout.code}/retry`, undefined, 200));
console.log(`soll-live-money: written to ${out}`);
