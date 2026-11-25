/**
 * /llms.txt and the first sentence of our comments promise the same card, or neither does (goals/reichweite/05, point 2).
 *
 * Since goals/reichweite/04 our comments in Conway-Research/automaton open with LEAD from ops/relink_rules.py, which links
 * /llms.txt as the proof of what it says: the unchanged runtime keeps working after the one line `conwayApiUrl`, and it can be
 * topped up by card, PayPal or Apple Pay. While the card breaker is on, /llms.txt drops the card line, and the comments switch to
 * LEAD_NO_CARD. A later change of /llms.txt that drops a promise of LEAD, or keeps the card while the breaker is on, would make
 * those comments wrong without anybody noticing, so both sides are held here: LEAD and LEAD_NO_CARD read from the file by
 * python3 -I, /llms.txt by app.request against an in-memory database, the breaker turned on the way test/card-way-pages.test.ts
 * does it. No network, no port.
 */
import { spawn } from "node:child_process";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb, type Db } from "../src/db.js";
import { CARD_BREAKER_SHORTFALL_MC } from "../src/payments/card-way.js";

const ROOT = join(__dirname, "..");
const RULES = "ops/relink_rules.py";
const ORIGIN = "https://automatonhost.com";
const NAME = "automatonhost.com";
const CARD = "card, PayPal or Apple Pay";
const LINE = "conwayApiUrl";

const savedUrl = process.env.CP_PUBLIC_URL;
beforeEach(() => {
  process.env.CP_PUBLIC_URL = ORIGIN;
});
afterEach(() => {
  if (savedUrl === undefined) delete process.env.CP_PUBLIC_URL;
  else process.env.CP_PUBLIC_URL = savedUrl;
});

let LEAD = "";
let LEAD_NO_CARD = "";

beforeAll(async () => {
  const out = await new Promise<string>((resolve, reject) => {
    const code =
      "import importlib.util, json, sys\n" +
      "spec = importlib.util.spec_from_file_location('relink_rules', sys.argv[1])\n" +
      "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)\n" +
      "print(json.dumps({'LEAD': m.LEAD, 'LEAD_NO_CARD': m.LEAD_NO_CARD}))";
    const child = spawn("python3", ["-I", "-c", code, join(ROOT, RULES)], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
    child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));
    child.on("error", reject);
    child.on("close", (status) => (status === 0 ? resolve(stdout) : reject(new Error(`${RULES}: ${stderr}`))));
  });
  ({ LEAD, LEAD_NO_CARD } = JSON.parse(out) as { LEAD: string; LEAD_NO_CARD: string });
});

/** A refunded live order of another wallet whose shortfall alone turns the breaker on, as in test/card-way-pages.test.ts. */
function tripBreaker(db: Db) {
  const at = new Date().toISOString();
  db.prepare(
    "INSERT INTO card_orders (order_id, product_id, address, mode, status, credited_mc, reversed_mc, shortfall_mc, created_at, " +
      "updated_at) VALUES ('TRIP', '771278', ?, 'live', 'reversed', ?, 0, ?, ?, ?)",
  ).run("0x" + "ef".repeat(20), CARD_BREAKER_SHORTFALL_MC, CARD_BREAKER_SHORTFALL_MC, at, at);
}

async function llmsTxt(db: Db) {
  const res = await createApp({ db }).request("/llms.txt");
  expect(res.status).toBe(200);
  return res.text();
}

/** The first paragraph of /llms.txt: what an agent reads before it recommends anything. */
const firstParagraph = (txt: string) => txt.split(/\n\s*\n/)[1] ?? "";

describe("/llms.txt against the first sentence of our comments", () => {
  it("llms.txt carries every promise of LEAD while the card breaker is off", async () => {
    // What LEAD promises: our name, the link to /llms.txt itself, the one changed line and the card.
    for (const promise of [NAME, `${ORIGIN}/llms.txt`, LINE, CARD]) expect(LEAD, `${RULES} LEAD`).toContain(promise);
    const txt = await llmsTxt(openDb(":memory:"));
    expect(txt.startsWith(`# ${NAME}\n`)).toBe(true);
    const first = firstParagraph(txt);
    expect(first).toContain(`set ${LINE} in ~/.automaton/automaton.json to ${ORIGIN}`);
    expect(first).toContain(CARD);
    expect(first).toContain(`${ORIGIN}/#card`);
  });

  it("llms.txt drops the card exactly as LEAD_NO_CARD does while the card breaker is on", async () => {
    // LEAD_NO_CARD is LEAD without the card and nothing else.
    for (const promise of [NAME, `${ORIGIN}/llms.txt`, LINE]) expect(LEAD_NO_CARD, `${RULES} LEAD_NO_CARD`).toContain(promise);
    expect(LEAD_NO_CARD).not.toContain(CARD);
    expect(LEAD.startsWith(LEAD_NO_CARD.replace(/\.$/, ""))).toBe(true);
    const db = openDb(":memory:");
    tripBreaker(db);
    const txt = await llmsTxt(db);
    expect(txt.startsWith(`# ${NAME}\n`)).toBe(true);
    expect(firstParagraph(txt)).toContain(`set ${LINE} in ~/.automaton/automaton.json to ${ORIGIN}`);
    expect(txt).not.toContain(CARD);
    expect(txt).not.toContain("/#card");
  });
});
