/**
 * Puts real work on the market, so that it is not empty.
 *
 * "A marketplace with no jobs convinces nobody, and one live job is worth more than any amount of
 * copy" is the first line of the cold start in docs/journeys.md, and it is the operator's job to
 * make it true first. The demand side has to exist before anybody looks, because an agent's cost
 * of looking is nothing while a buyer's cost of trying is the whole price.
 *
 * So these are not demonstrations. They are pieces of work this project actually needs, at prices
 * it is actually worth paying, left open long enough for a stranger's agent to find them.
 *
 * Signs in with the operator wallet and moves credits that are already there. No payment, no
 * on-chain transaction; loop-constraints.md permits exactly that.
 *
 *   OPERATOR_WALLET=harness/state/mainnet-wallet.json CP_URL=https://cp.hippe.eu \
 *     pnpm tsx ops/post-bounty.ts --brief <file> --price-cents 200 --kind factual --hours 168
 */
import fs from "node:fs";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import type { Hex } from "viem";

const BASE = (process.env.CP_URL || "https://postyourprice.com").replace(/\/$/, "");
const DOMAIN = process.env.CP_SIWE_DOMAIN || "conway.tech";
const WALLET = process.env.OPERATOR_WALLET || "harness/state/mainnet-wallet.json";

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

async function call(pathname: string, key: string | null, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: key } : {}), ...(init.headers as Record<string, string> | undefined) },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep the text */
  }
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${pathname}: ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body as Record<string, unknown>;
}

/**
 * A brief is written once and then read by strangers' agents for a week, and nothing rewrites it.
 *
 * `withOrigin()` in src/public/site.ts moves every address on every page the day CP_PUBLIC_URL
 * changes, and a brief goes past it: the text lives in the database, is served as JSON at
 * /bounties.json, and is quoted back verbatim in whatever the winning agent writes. On 2026-09-23,
 * the day after postyourprice.com became the canonical address, three of five open jobs still
 * named cp.hippe.eu inside their brief, one of them the 250-cent job asking for the text at the
 * top of the homepage.
 *
 * Those three cannot be fixed without cancelling work that agents have already handed in. This
 * refuses the next one. It compares against the address this tool is posting to, so it needs no
 * list of old names and stays right the next time the address changes.
 */
function refuseAStaleAddress(brief: string): void {
  const host = BASE.replace(/^https?:\/\//, "");
  const others = [...brief.matchAll(/\bhttps?:\/\/([a-z0-9.-]+)/gi)]
    .map((m) => m[1].toLowerCase())
    .filter((h) => h.endsWith("hippe.eu") || h.endsWith("postyourprice.com"))
    .filter((h) => h !== host && h !== `www.${host}`);
  if (!others.length) return;
  console.error(`This brief names ${[...new Set(others)].join(", ")} and the job is being posted`);
  console.error(`to ${host}. A brief is not rewritten after it goes up: it is served as JSON, read`);
  console.error("by agents for as long as the job is open, and quoted in the work that wins it.");
  console.error("Fix the address in the brief file, or post with CP_URL set to the one it names.");
  process.exit(1);
}

async function main(): Promise<void> {
  const brief = fs.readFileSync(arg("brief"), "utf-8").trim();
  refuseAStaleAddress(brief);
  const priceCents = Number(arg("price-cents"));
  const kind = arg("kind", "factual");
  const hours = Number(arg("hours", "168"));

  const { privateKey } = JSON.parse(fs.readFileSync(path.resolve(WALLET), "utf-8")) as { privateKey: Hex };
  const account = privateKeyToAccount(privateKey);
  const { nonce } = (await call("/v1/auth/nonce", null, { method: "POST" })) as { nonce: string };
  const message = createSiweMessage({
    domain: DOMAIN, address: account.address, statement: "Sign in to Conway",
    uri: `https://${DOMAIN}`, version: "1", chainId: 8453, nonce,
  });
  const signature = await account.signMessage({ message });
  const verify = await call("/v1/auth/verify", null, { method: "POST", body: JSON.stringify({ message, signature }) });
  const token = (verify.access_token ?? verify.accessToken) as string;
  const keyBody = await call("/v1/auth/api-keys", null, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: "handsel-post-bounty" }),
  });
  const key = (keyBody.apiKey ?? keyBody.api_key ?? keyBody.key) as string;
  const keyPrefix = (keyBody.key_prefix ?? keyBody.keyPrefix ?? "") as string;

  try {
    await stellen(key, brief, kind, priceCents, hours);
  } finally {
    // Whatever happened, the key goes back. Without the finally a failed post leaves it behind,
    // which is the one case where a tool exits in a hurry and is least likely to be looked at.
    if (keyPrefix) {
      await call("/v1/auth/api-keys/revoke", key, {
        method: "POST", body: JSON.stringify({ key_prefix: keyPrefix }),
      }).then(
        () => console.log("        key handed back"),
        (e) => console.log(`        NOTE could not revoke the key: ${(e as Error).message}`),
      );
    }
  }
}

async function stellen(key: string, brief: string, kind: string, priceCents: number, hours: number): Promise<void> {
  const before = ((await call("/v1/credits/balance", key)) as { balance_cents: number }).balance_cents;
  const bounty = (await call("/v1/bounties", key, {
    method: "POST",
    body: JSON.stringify({ brief, kind, price_cents: priceCents, deadline: new Date(Date.now() + hours * 3_600_000).toISOString() }),
  })) as { id: string; price_cents: number; award_cents: number; deadline: string };
  const after = ((await call("/v1/credits/balance", key)) as { balance_cents: number }).balance_cents;

  console.log(`posted  ${bounty.id}`);
  console.log(`        ${bounty.price_cents} c, the winner is credited ${bounty.award_cents} c`);
  console.log(`        open until ${bounty.deadline}`);
  console.log(`        buyer ${before} c -> ${after} c`);
}

main().catch((e) => {
  console.error("POST BOUNTY FAILED:", (e as Error).message);
  process.exit(1);
});
