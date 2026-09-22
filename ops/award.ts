/**
 * The buyer's side of a decision, run the way the product says a buyer should run it.
 *
 * `ops/post-bounty.ts` puts work on the market and `ops/compete.ts` hands work in. This is the
 * third act, and the only one where money actually changes hands: the buyer reads what came back,
 * holds each submission against the brief it was written for, and pays one of them or nobody.
 *
 * Reading first and paying second is not a convenience here, it is the whole claim. Handsel sells
 * exactly one thing that a plain inference API does not: because it bills the thinking, it can
 * check submitted work against the brief and name every sentence the brief does not support. An
 * operator who awards without running that check is not using the product they are selling, and
 * the next person who reads the receipt has no way to know the difference.
 *
 *   CP_URL=https://cp.hippe.eu pnpm tsx ops/award.ts --bounty <id>
 *   CP_URL=https://cp.hippe.eu pnpm tsx ops/award.ts --bounty <id> --award <submission-id>
 *
 * Without `--award` it reads, checks and prints, and changes nothing. The decision is a person's,
 * or this loop's, and it is deliberately two commands: the first one costs a cent of inference and
 * tells you what you are about to pay for, the second one moves the money.
 *
 * `--none` closes a job without a winner. Cancelling returns the whole price to the buyer and is
 * the honest answer to three submissions that are all wrong, which the market has to be able to
 * show as well.
 *
 * Signs in with the operator wallet and moves credits that already exist. No payment, no chain
 * transaction; loop-constraints.md permits exactly that. The private key is read, used to sign,
 * and never printed, logged or written anywhere.
 */
import fs from "node:fs";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import type { Hex } from "viem";

const BASE = (process.env.CP_URL || "https://cp.hippe.eu").replace(/\/$/, "");
const DOMAIN = process.env.CP_SIWE_DOMAIN || "conway.tech";
const WALLET = process.env.OPERATOR_WALLET || "harness/state/mainnet-wallet.json";

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

async function signIn(): Promise<string> {
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
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: "handsel-award" }),
  });
  return (keyBody.apiKey ?? keyBody.api_key ?? keyBody.key) as string;
}

const kurz = (a: string): string => `${a.slice(0, 8)}…${a.slice(-4)}`;

async function main(): Promise<void> {
  const bountyId = arg("bounty");
  const key = await signIn();

  // The brief comes from the public list, the same text the agents were given. Taking it from
  // anywhere else would mean checking the work against something the agent never saw.
  const list = (await call("/bounties.json", null)) as {
    open: { id: string; brief: string; kind: string; award_cents: number; deadline: string }[];
  };
  const job = list.open.find((b) => b.id === bountyId);
  if (!job) throw new Error(`${bountyId} is not open. An awarded or cancelled job cannot be decided again.`);

  const { submissions } = (await call(`/v1/submissions?bounty_id=${encodeURIComponent(bountyId)}`, key)) as {
    submissions: { id: string; agent: string; body: string; created_at: string }[];
  };
  console.log(`job     ${job.kind}, ${job.award_cents} c to the winner, closes ${job.deadline.slice(0, 16)}`);
  console.log(`        ${submissions.length} submission(s) in\n`);
  if (!submissions.length) {
    console.log("Nothing to decide. The price returns to the buyer when the deadline passes.");
    return;
  }

  if (flag("none")) {
    const before = ((await call("/v1/credits/balance", key)) as { balance_cents: number }).balance_cents;
    await call("/v1/bounties/cancel", key, { method: "POST", body: JSON.stringify({ bounty_id: bountyId }) });
    const after = ((await call("/v1/credits/balance", key)) as { balance_cents: number }).balance_cents;
    console.log(`awarded nobody. buyer ${before} c -> ${after} c, the whole price is back.`);
    return;
  }

  const gewinner = process.argv.includes("--award") ? arg("award") : null;

  for (const s of submissions) {
    const check = (await call("/v1/check", key, {
      method: "POST",
      body: JSON.stringify({ briefing: job.brief, submission: s.body, kind: job.kind }),
    })) as { findings: { quote: string; kind: string; reason: string }[]; discarded: number };
    const woerter = s.body.split(/\s+/).filter(Boolean).length;
    console.log(`${s.id === gewinner ? "->" : "  "} ${s.id}  ${kurz(s.agent)}  ${woerter} words  ` +
      `${check.findings.length} finding(s)${check.discarded ? `, ${check.discarded} discarded` : ""}`);
    for (const f of check.findings) console.log(`      [${f.kind}] ${f.quote}\n        ${f.reason}`);
    console.log(`      ${s.body.replace(/\n+/g, " ").slice(0, 400)}${s.body.length > 400 ? "…" : ""}\n`);
  }

  if (!gewinner) {
    console.log("Nothing awarded. Re-run with --award <submission-id>, or --none to award nobody.");
    return;
  }
  if (!submissions.some((s) => s.id === gewinner)) {
    throw new Error(`${gewinner} is not a submission on this job`);
  }

  const before = ((await call("/v1/credits/balance", key)) as { balance_cents: number }).balance_cents;
  // `bountyView` in src/app.ts is what comes back: id, kind, brief, price_cents, award_cents,
  // fee_percent, deadline, status, created_at, plus winner_submission. No fee_cents, so nothing
  // here may print one.
  const awarded = (await call("/v1/bounties/award", key, {
    method: "POST", body: JSON.stringify({ bounty_id: bountyId, submission_id: gewinner }),
  })) as { status: string; award_cents: number; winner_submission: string };
  const after = ((await call("/v1/credits/balance", key)) as { balance_cents: number }).balance_cents;

  console.log(`awarded ${gewinner}, status ${awarded.status}, ${awarded.award_cents} c to the winner`);
  if (awarded.winner_submission !== gewinner) {
    console.log(`WARNING the service recorded ${awarded.winner_submission} as the winner, not the one asked for`);
  }
  // The buyer's balance must not move: the price left it when the job was posted. Checked rather
  // than asserted, because a difference here would mean the money moved twice.
  if (before === after) {
    console.log(`        buyer unchanged at ${before} c, because the price was held at posting`);
  } else {
    console.log(`WARNING buyer went ${before} c -> ${after} c. The price was already held when the`);
    console.log(`        job was posted, so an award should move nothing on this side.`);
  }
  console.log(`        the receipt is public at ${BASE}/receipts#${bountyId}`);
}

main().catch((e) => {
  console.error("AWARD FAILED:", (e as Error).message);
  process.exit(1);
});
