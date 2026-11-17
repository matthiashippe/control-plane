// The real step limit of the phone page /h/{code} as ops/soll-limit.mjs compares it (goals/konto/04, Punkt 4). Drives createApp
// with an empty database and the account switched on for chain 84532, without a port and without network, through both states,
// and writes each answer unchanged to <dir>/limit-<state>.html, which ops/soll-limit.mjs loads with --source <dir>.
//
//   node --import tsx ops/soll-live-limit.mjs --out <dir>
//
// Nothing of the page is cut or added here: every difference to the approved pictures is a difference of the page and has to be
// fixed in src/public/limit.ts. What this script chooses are the values the pictures show. The account with its daily limit of
// 5.00 USD is written into the database the way finishKonto leaves it (an account of konto 03 needs a signature the chain checks,
// and there is no chain here); from there on it goes through the doors a real terminal and a real phone use: POST /v1/handoff
// with step limit, the API key and the new limit of 10.00 USD, the page of the code, and the right number.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const at = args.indexOf("--out");
if (at < 0 || !args[at + 1] || args.length !== 2) {
  console.error("usage: node --import tsx ops/soll-live-limit.mjs --out <dir>");
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
const { randomBytes } = await import("node:crypto");
const { createPublicClient, custom } = await import("viem");
const { baseSepolia } = await import("viem/chains");
const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");

const NOW = Date.parse("2026-11-16T12:00:00Z");
const offline = createPublicClient({ chain: baseSepolia, transport: custom({ request: async () => { throw new Error("no network"); } }) });
const spender = privateKeyToAccount(generatePrivateKey()).address;
const konto = { chainId: 84532, spender, token: SEPOLIA_USDC, verifyClient: offline };

// The numbers of the picture: match 47 in the middle, 62 and 18 around it, as in ops/soll-live-handoff.mjs.
const draws = [47, 62, 18, 1];
const random = { bytes: (n) => randomBytes(n), int: (min, max) => { const v = draws.shift(); if (v === undefined || v < min || v >= max) throw new Error(`soll-live-limit: draw ${v} outside [${min}, ${max})`); return v; } };

const db = openDb(":memory:");
const account = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
ensureWallet(db, account);
const permission = { account, spender: spender.toLowerCase(), token: SEPOLIA_USDC, allowance: 5_000_000n, period: PERIOD_SECONDS, start: NOW / 1000 - 60, end: 281474976710655, salt: 1n, extraData: "0x" };
db.prepare("INSERT INTO konto_accounts (address, chain_id, permission, signature, created_at) VALUES (?, ?, ?, ?, ?)")
  .run(account, 84532, permissionJson(permission), "0x" + "11".repeat(65), new Date(NOW).toISOString());
const session = randomBytes(32).toString("hex");
db.prepare("INSERT INTO sessions (token, address, expires_at) VALUES (?, ?, ?)").run(session, account, NOW + 60_000);
// The name the page shows is the name of this first API key, the name of the account (goals/konto/06), not one from the body.
const { key } = createApiKey(db, session, "Atlas", NOW);

const app = createApp({ db, now: () => new Date(NOW), rateLimit: null, handoff: { random, missLimit: null }, konto });
const ask = async (name, url, init, status) => {
  const res = await app.request(url, init);
  if (res.status !== status) {
    console.error(`soll-live-limit: ${name}: ${init?.method ?? "GET"} ${url} answered ${res.status}, expected ${status}`);
    process.exit(2);
  }
  return res;
};
const write = async (state, res) => {
  const html = await res.text();
  writeFileSync(path.join(out, `limit-${state}.html`), html);
  console.error(`soll-live-limit: ${state} ${res.status}, ${html.length} bytes`);
};

const raise = await (await ask("raise", "/v1/handoff", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
  body: JSON.stringify({ daily_limit_usdc: "10000000", step: "limit" }),
}, 201)).json();
await write("approve", await ask("approve", `/h/${raise.code}`, undefined, 200));
await write("passkey", await ask("passkey", `/h/${raise.code}`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: `pick=${raise.match}`,
}, 200));
console.error(`soll-live-limit: written to ${out}`);
