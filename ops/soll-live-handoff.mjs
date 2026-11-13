// The real phone page /h/{code} as ops/soll-handoff.mjs compares it (goals/konto/02, Punkt 4). Drives createApp with an empty
// database, without a port and without network, through all three states, and writes each answer unchanged to
// <dir>/handoff-<state>.html, which ops/soll-handoff.mjs loads with --source <dir>.
//
//   node --import tsx ops/soll-live-handoff.mjs --out <dir>
//
// Nothing of the page is cut or added here: every difference to the approved pictures is a difference of the page and has to be
// fixed in src/public/handoff.ts. What this script chooses are the values the pictures show, through the same doors a real
// terminal and a real phone use: the name and amounts of POST /v1/handoff, and the chance, so that the three numbers stand in the
// order of the picture.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const at = args.indexOf("--out");
if (at < 0 || !args[at + 1] || args.length !== 2) {
  console.error("usage: node --import tsx ops/soll-live-handoff.mjs --out <dir>");
  process.exit(1);
}
const out = path.resolve(args[at + 1]);
mkdirSync(out, { recursive: true });

process.env.CP_PUBLIC_URL = "https://postyourprice.com";
const { createApp } = await import("../src/app.ts");
const { openDb } = await import("../src/db.ts");
const { randomBytes } = await import("node:crypto");

// The numbers of the picture: match 47 in the middle, 62 and 18 around it. newChoices() draws match, then the two others, then
// the place of match; every other draw (code, secret) stays random.
const draws = [47, 62, 18, 1];
const random = { bytes: (n) => randomBytes(n), int: (min, max) => { const v = draws.shift(); if (v === undefined || v < min || v >= max) throw new Error(`soll-live-handoff: draw ${v} outside [${min}, ${max})`); return v; } };

let now = Date.parse("2026-11-13T12:00:00Z");
const app = createApp({ db: openDb(":memory:"), now: () => new Date(now), rateLimit: null, handoff: { random, missLimit: null } });
const ask = async (name, url, init, status) => {
  const res = await app.request(url, init);
  if (res.status !== status) {
    console.error(`soll-live-handoff: ${name}: ${init?.method ?? "GET"} ${url} answered ${res.status}, expected ${status}`);
    process.exit(2);
  }
  return res;
};
const create = async () => (await (await ask("create", "/v1/handoff", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ automaton_name: "Atlas", daily_limit_usdc: "5000000", amount_usdc: "5000000" }),
}, 201)).json());
const write = async (state, res) => {
  const html = await res.text();
  writeFileSync(path.join(out, `handoff-${state}.html`), html);
  console.log(`soll-live-handoff: ${state} ${res.status}, ${html.length} bytes`);
};

const first = await create();
await write("freigabe", await ask("freigabe", `/h/${first.code}`, undefined, 200));
await write("erledigt", await ask("erledigt", `/h/${first.code}`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: `pick=${first.match}`,
}, 200));

draws.push(47, 62, 18, 1);
const second = await create();
now += 601_000;
await write("ungueltig", await ask("ungueltig", `/h/${second.code}`, undefined, 410));
console.log(`soll-live-handoff: written to ${out}`);
