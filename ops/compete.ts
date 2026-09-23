/**
 * The supply side, run by the operator, until there is one that is not.
 *
 * `ops/post-bounty.ts` puts real work on the market. This is the other half: an agent that reads
 * the public list, pays for its own thinking, checks its own work against the brief it was written
 * for, and hands it in. Same four calls, same starter credit, same 90 per cent as anybody else.
 *
 * Why this exists at all. On 2026-09-21 the market block on the landing page showed five open jobs
 * and printed "nobody competing yet" under every one of them. That sentence is the loudest thing
 * on the page, and it tells a visiting agent that nothing here has ever been worth entering and a
 * visiting buyer that nobody will answer. An empty market is not neutral; it argues against
 * itself. So the operator supplies both sides until strangers arrive, which is a decision that
 * belongs to the person whose money it is and was made on 2026-09-21.
 *
 * What it does NOT do: it does not pretend to be a stranger. The key is named `ops-seed-<name>`,
 * which `ops/db-report.cjs` classifies as ours by construction, so `foreign_agents` stays the
 * number it was and keeps being the thing worth waiting for. `/terms` says in plain words that the
 * operator also competes. The one number this moves on purpose is the submission count a visitor
 * sees, and that number never claimed to be strangers.
 *
 * The agent is real in the one way that matters: it buys its thinking through the same billing
 * path it is competing in. A losing attempt costs it its own credits, starting from the same 15
 * cent starter grant a stranger gets, and an agent that keeps losing runs out and stops. Nothing
 * here is free for it.
 *
 *   CP_URL=https://cp.hippe.eu pnpm tsx ops/compete.ts --bounty <id> --name klaus
 *
 * --dry writes the work and checks it but hands nothing in.
 * --force hands in even when the self-check found a contradiction.
 */
import fs from "node:fs";
import { findJob } from "./find-job.js";
import path from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import type { Hex } from "viem";

const BASE = (process.env.CP_URL || "https://cp.hippe.eu").replace(/\/$/, "");
const DOMAIN = process.env.CP_SIWE_DOMAIN || "conway.tech";

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

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
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${pathname}: ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body as Record<string, unknown>;
}

/** Off-chain, free, revocable. The same four calls docs/api-key.md describes. */
async function provision(privateKey: Hex, label: string): Promise<{ key: string; prefix: string; address: string }> {
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
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: label }),
  });
  return {
    key: (keyBody.apiKey ?? keyBody.api_key ?? keyBody.key) as string,
    prefix: (keyBody.key_prefix ?? keyBody.keyPrefix ?? "") as string,
    address: account.address.toLowerCase(),
  };
}

/**
 * The wallet stays. An address is what earns a reputation here, so a seed agent that wins twice
 * has to be the same address both times; a throwaway per run would publish a market of strangers
 * who each appear once, which is the shape this project measured in the x402 directory and calls
 * evidence of nobody being there. harness/state/ is gitignored.
 */
function wallet(name: string): Hex {
  const file = path.resolve(`harness/state/seed-agent-${name}.json`);
  if (fs.existsSync(file)) return (JSON.parse(fs.readFileSync(file, "utf-8")) as { privateKey: Hex }).privateKey;
  const pk = generatePrivateKey();
  fs.writeFileSync(file, JSON.stringify({ privateKey: pk, createdAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  console.log(`wallet  new agent, key written to ${file}`);
  return pk;
}

async function main(): Promise<void> {
  const bountyId = arg("bounty");
  const name = arg("name");
  const model = arg("model", "gpt-5.2");
  if (!/^[a-z0-9-]{2,24}$/.test(name)) throw new Error("--name must be lowercase letters, digits and dashes");

  const list = (await call("/bounties.json", null)) as {
    open: { id: string; brief: string; kind: string; price_cents: number; award_cents: number; deadline: string; submissions: number }[];
  };
  // Prefixes too: every surface shows eight characters. See ops/find-job.ts.
  const job = findJob(list.open as never, bountyId, (t) => console.log(t));
  console.log(`job     ${job.kind}, ${job.award_cents} c to the winner, closes ${job.deadline.slice(0, 16)}, ${job.submissions} already in`);

  const agent = await provision(wallet(name), `ops-seed-${name}`);
  console.log(`agent   ${name}  ${agent.address}`);

  let balance = ((await call("/v1/credits/balance", agent.key)) as { balance_cents: number }).balance_cents;
  if (balance === 0) {
    const stake = (await call("/v1/credits/starter", agent.key, { method: "POST" })) as { granted_cents: number };
    balance = stake.granted_cents;
    console.log(`stake   claimed the starter credit, ${stake.granted_cents} c out of the cold-start pool`);
  }
  console.log(`balance ${balance} c before thinking`);

  const completion = (await call("/v1/chat/completions", agent.key, {
    method: "POST",
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a careful writer competing for a paid job. You follow the brief exactly, you " +
            "count your words against the limit it gives, and you never state anything the brief " +
            "does not support. You deliver the finished work and nothing else: no preamble, no " +
            "explanation of your approach, no word count, no quotation marks around the whole thing.",
        },
        { role: "user", content: job.brief },
      ],
    }),
  })) as { choices: { message: { content: string } }[] };
  const work = completion.choices[0].message.content.trim();
  const afterThinking = ((await call("/v1/credits/balance", agent.key)) as { balance_cents: number }).balance_cents;
  console.log(`wrote   ${work.split(/\s+/).length} words, paid ${balance - afterThinking} c for the thinking`);

  // The agent runs the buyer's gate on itself before handing in. Submitting work that contradicts
  // the brief costs the buyer a read and the agent its reputation, and the check is two cents.
  const check = (await call("/v1/check", agent.key, {
    method: "POST",
    body: JSON.stringify({ briefing: job.brief, submission: work, kind: job.kind }),
  })) as { findings: { quote: string; kind: string; reason: string }[]; discarded: number };
  const afterCheck = ((await call("/v1/credits/balance", agent.key)) as { balance_cents: number }).balance_cents;
  console.log(`check   ${check.findings.length} finding(s), ${check.discarded} discarded, paid ${afterThinking - afterCheck} c`);
  for (const f of check.findings) console.log(`        [${f.kind}] ${f.quote}`);

  const out = path.resolve(`harness/state/work-${name}-${bountyId.slice(0, 8)}.txt`);
  fs.writeFileSync(out, work + "\n");
  console.log(`\n--- the work (${out}) ---\n${work}\n---\n`);

  const hard = check.findings.filter((f) => f.kind === "contradiction" || f.kind === "miscalculation");
  if (hard.length && !flag("force")) {
    console.log(`NOT SUBMITTED  ${hard.length} finding(s) the brief contradicts. Re-run with --force to hand it in anyway.`);
    return;
  }
  if (flag("dry")) {
    console.log("DRY  nothing handed in.");
    return;
  }

  const submission = (await call("/v1/submissions", agent.key, {
    method: "POST", body: JSON.stringify({ bounty_id: job.id, body: work }),
  })) as { id: string };
  const left = ((await call("/v1/credits/balance", agent.key)) as { balance_cents: number }).balance_cents;
  console.log(`handed in  ${submission.id}`);
  console.log(`           ${name} has ${left} c left, and is owed nothing unless the buyer picks it`);

  // The key goes back. An agent that mints a credential for one submission and abandons it leaves
  // a door open on a wallet that holds credits, and since 2026-09-22 there is a way to close it.
  // The wallet keeps its balance and its reputation; only this key stops working.
  await call("/v1/auth/api-keys/revoke", agent.key, {
    method: "POST", body: JSON.stringify({ key_prefix: agent.prefix }),
  });
  console.log(`           key handed back, the wallet keeps its ${left} c`);
}

main().catch((e) => {
  console.error("COMPETE FAILED:", (e as Error).message);
  process.exit(1);
});
