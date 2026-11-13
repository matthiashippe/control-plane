// The real account step of the phone page /h/{code} as ops/soll-konto.mjs compares it (goals/konto/03, Punkt 4). Drives createApp
// with an empty database and the account switched on for chain 84532, without a port and without network, through both states,
// and writes each answer unchanged to <dir>/konto-<state>.html, which ops/soll-konto.mjs loads with --source <dir>.
//
//   node --import tsx ops/soll-live-konto.mjs --out <dir>
//
// Nothing of the page is cut or added here: every difference to the approved pictures is a difference of the page and has to be
// fixed in src/public/konto.ts. What this script chooses are the values the pictures show, through the same doors a real terminal
// and a real phone use: the name and the daily limit of POST /v1/handoff with step konto, the right number, and for the second
// state the reason the script of the page sends when the passkey was cancelled.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const at = args.indexOf("--out");
if (at < 0 || !args[at + 1] || args.length !== 2) {
  console.error("usage: node --import tsx ops/soll-live-konto.mjs --out <dir>");
  process.exit(1);
}
const out = path.resolve(args[at + 1]);
mkdirSync(out, { recursive: true });

process.env.CP_PUBLIC_URL = "https://postyourprice.com";
const { createApp } = await import("../src/app.ts");
const { openDb } = await import("../src/db.ts");
const { SEPOLIA_USDC } = await import("../src/konto/config.ts");
const { createPublicClient, custom } = await import("viem");
const { baseSepolia } = await import("viem/chains");
const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");

// The account switched on as CP_KONTO_CHAIN_ID=84532 would, with a spender made for this run and a chain that is not there: the
// two states are rendered before anything is signed.
const offline = createPublicClient({ chain: baseSepolia, transport: custom({ request: async () => { throw new Error("no network"); } }) });
const konto = { chainId: 84532, spender: privateKeyToAccount(generatePrivateKey()).address, token: SEPOLIA_USDC, verifyClient: offline };

const app = createApp({ db: openDb(":memory:"), now: () => new Date("2026-11-13T12:00:00Z"), rateLimit: null, handoff: { missLimit: null }, konto });
const ask = async (name, url, init, status) => {
  const res = await app.request(url, init);
  if (res.status !== status) {
    console.error(`soll-live-konto: ${name}: ${init?.method ?? "GET"} ${url} answered ${res.status}, expected ${status}`);
    process.exit(2);
  }
  return res;
};
const create = async () => (await (await ask("create", "/v1/handoff", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ automaton_name: "Atlas", daily_limit_usdc: "5000000", amount_usdc: "5000000", step: "konto" }),
}, 201)).json());
const form = (body) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
const write = async (state, res) => {
  const html = await res.text();
  writeFileSync(path.join(out, `konto-${state}.html`), html);
  console.log(`soll-live-konto: ${state} ${res.status}, ${html.length} bytes`);
};

const first = await create();
await write("passkey", await ask("passkey", `/h/${first.code}`, form(`pick=${first.match}`), 200));
await write("fehlgeschlagen", await ask("fehlgeschlagen", `/h/${first.code}/fehlgeschlagen`, form("reason=cancelled"), 200));
console.log(`soll-live-konto: written to ${out}`);
