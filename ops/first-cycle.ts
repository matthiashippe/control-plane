/**
 * The first real cycle on Handsel: a job is posted, agents compete, one is paid.
 *
 * Everything before this was proven by tests and by a dry run that stopped at the till. This runs
 * the whole loop with real credits on the live service, because a market that has never completed
 * one exchange is a claim and not a market. docs/journeys.md calls this the cold start, and names
 * the measure: a bounty_hold in the ledger.
 *
 * What it does NOT do: no payment, no on-chain transaction, no topup. It signs in with the
 * operator wallet whose key already exists locally, and moves credits that are already there.
 * loop-constraints.md permits exactly that and nothing more.
 *
 * The private key is read, used to sign, and never printed, logged or written anywhere.
 *
 * Writing this is what found the hole it now runs through. The first attempt on 2026-09-20 stopped
 * dead: a fresh agent could not be given its first credit, because a transfer between users is
 * refused on purpose. POST /v1/credits/starter came out of that, and the agent below stakes itself
 * with it instead of being funded by the buyer.
 *
 *   OPERATOR_WALLET=harness/state/mainnet-wallet.json \
 *   CP_URL=https://cp.hippe.eu pnpm tsx ops/first-cycle.ts --brief <file> --price-cents 200
 */
import fs from "node:fs";
import path from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
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
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: key } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep the text */
  }
  if (!res.ok && res.status >= 400) {
    throw new Error(`${init.method ?? "GET"} ${pathname}: ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body as Record<string, unknown>;
}

/** Mints a fresh API key for an account. Off-chain, free, revocable. */
async function provision(privateKey: Hex, label: string): Promise<{ key: string; address: string }> {
  const account = privateKeyToAccount(privateKey);
  const { nonce } = (await call("/v1/auth/nonce", null, { method: "POST" })) as { nonce: string };
  const message = createSiweMessage({
    domain: DOMAIN,
    address: account.address,
    statement: "Sign in to Conway",
    uri: `https://${DOMAIN}`,
    version: "1",
    chainId: 8453,
    nonce,
  });
  const signature = await account.signMessage({ message });
  const verify = await call("/v1/auth/verify", null, {
    method: "POST",
    body: JSON.stringify({ message, signature }),
  });
  const token = (verify.access_token ?? verify.accessToken) as string;
  const keyBody = await call("/v1/auth/api-keys", null, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: label }),
  });
  const key = (keyBody.apiKey ?? keyBody.api_key ?? keyBody.key) as string;
  return { key, address: account.address.toLowerCase() };
}

async function main(): Promise<void> {
  const brief = fs.readFileSync(arg("brief"), "utf-8").trim();
  const priceCents = Number(arg("price-cents", "200"));
  const kind = arg("kind", "factual");
  const model = arg("model", "gpt-5.2");

  const buyerKeyFile = JSON.parse(fs.readFileSync(path.resolve(WALLET), "utf-8")) as { privateKey: Hex };
  const buyer = await provision(buyerKeyFile.privateKey, "handsel-first-cycle-buyer");
  const balance = (await call("/v1/credits/balance", buyer.key)) as { balance_cents: number };
  console.log(`buyer   ${buyer.address}  balance ${balance.balance_cents} c`);
  if (balance.balance_cents < priceCents) throw new Error("buyer balance too small");

  // A fresh agent. Its key is written next to the operator wallet so the credits it earns are not
  // lost; harness/state/ is gitignored, so nothing secret reaches the public repo.
  const agentKeyFile = path.resolve("harness/state/first-cycle-agent.json");
  let agentPk: Hex;
  if (fs.existsSync(agentKeyFile)) {
    agentPk = (JSON.parse(fs.readFileSync(agentKeyFile, "utf-8")) as { privateKey: Hex }).privateKey;
  } else {
    agentPk = generatePrivateKey();
    fs.writeFileSync(agentKeyFile, JSON.stringify({ privateKey: agentPk, createdAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  }
  const agent = await provision(agentPk, "handsel-first-cycle-agent");
  console.log(`agent   ${agent.address}`);

  // The agent pays for its own thinking out of the starter credit, not out of the buyer's pocket.
  // A transfer between the two would make credits behave like a currency and is refused on purpose.
  const stake = (await call("/v1/credits/starter", agent.key, { method: "POST" })) as { granted_cents: number };
  console.log(`staked  agent claimed its starter credit, ${stake.granted_cents} c`);

  const deadline = new Date(Date.now() + 6 * 3_600_000).toISOString();
  const bounty = (await call("/v1/bounties", buyer.key, {
    method: "POST",
    body: JSON.stringify({ brief, kind, price_cents: priceCents, deadline }),
  })) as { id: string; price_cents: number; award_cents: number };
  console.log(`posted  ${bounty.id}  price ${bounty.price_cents} c, agent receives ${bounty.award_cents} c`);

  // The agent reads the public list, exactly as any other agent would.
  const open = (await call("/bounties.json", null)) as { open: { id: string; brief: string }[] };
  const seen = open.open.find((b) => b.id === bounty.id);
  if (!seen) throw new Error("the bounty is not in the public list");
  console.log(`agent   found it in the public list, ${seen.brief.length} characters of brief`);

  const before = ((await call("/v1/credits/balance", agent.key)) as { balance_cents: number }).balance_cents;
  const completion = (await call("/v1/chat/completions", agent.key, {
    method: "POST",
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You are a careful writer. You follow a brief exactly, you count your words, and you never state anything the brief does not support." },
        { role: "user", content: seen.brief },
      ],
    }),
  })) as { choices: { message: { content: string } }[] };
  const work = completion.choices[0].message.content.trim();
  const after = ((await call("/v1/credits/balance", agent.key)) as { balance_cents: number }).balance_cents;
  console.log(`agent   wrote ${work.split(/\s+/).length} words and paid ${before - after} c for the thinking`);

  const submission = (await call("/v1/submissions", agent.key, {
    method: "POST",
    body: JSON.stringify({ bounty_id: bounty.id, body: work }),
  })) as { id: string };
  console.log(`agent   submitted ${submission.id}`);

  const check = (await call("/v1/check", buyer.key, {
    method: "POST",
    body: JSON.stringify({ briefing: brief, submission: work, kind }),
  })) as { findings: { quote: string; kind: string; reason: string }[]; discarded: number };
  console.log(`check   ${check.findings.length} finding(s), ${check.discarded} discarded`);
  for (const f of check.findings) console.log(`        [${f.kind}] ${f.quote}`);

  const awarded = (await call("/v1/bounties/award", buyer.key, {
    method: "POST",
    body: JSON.stringify({ bounty_id: bounty.id, submission_id: submission.id }),
  })) as { status: string };
  const agentFinal = ((await call("/v1/credits/balance", agent.key)) as { balance_cents: number }).balance_cents;
  const buyerFinal = ((await call("/v1/credits/balance", buyer.key)) as { balance_cents: number }).balance_cents;

  console.log(`\naward   ${awarded.status}`);
  console.log(`buyer   ${balance.balance_cents} c -> ${buyerFinal} c`);
  console.log(`agent   0 c -> ${agentFinal} c`);
  console.log(`\n--- the work ---\n${work}\n`);
  console.log("FIRST CYCLE OK");
}

main().catch((e) => {
  console.error("FIRST CYCLE FAILED:", (e as Error).message);
  process.exit(1);
});
