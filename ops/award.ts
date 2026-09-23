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
import { findJob } from "./find-job.js";
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

async function signIn(): Promise<{ key: string; prefix: string }> {
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
  return {
    key: (keyBody.apiKey ?? keyBody.api_key ?? keyBody.key) as string,
    prefix: (keyBody.key_prefix ?? keyBody.keyPrefix ?? "") as string,
  };
}

/**
 * Hand the key back, whatever the run decided.
 *
 * This tool has four ways out: nothing submitted, read-only, awarded nobody, awarded somebody. A
 * credential left behind on the operator wallet after any of them is a door held open for
 * nothing, and the wallet it belongs to is the one that holds the market's money. Reported and
 * never fatal: the decision has already been made and written down by the time this runs.
 */
async function handBack(who: { key: string; prefix: string }): Promise<void> {
  if (!who.prefix) return;
  try {
    await call("/v1/auth/api-keys/revoke", who.key, {
      method: "POST", body: JSON.stringify({ key_prefix: who.prefix }),
    });
    console.log("        key handed back");
  } catch (e) {
    console.log(`        NOTE could not revoke the key: ${(e as Error).message}`);
  }
}

const short = (a: string): string => `${a.slice(0, 8)}…${a.slice(-4)}`;

/**
 * The parts of a brief a machine can check, checked.
 *
 * `POST /v1/check` finds claims the brief does not support, which is the expensive half and the
 * one worth paying for. The cheap half is sitting in the brief in plain sight: a word limit and a
 * list of words that must not appear. A buyer reading three submissions does that by hand, badly,
 * and on 2026-09-22 this operator was about to.
 *
 * Deliberately conservative. It reports and never refuses: a brief can say "80 words maximum" and
 * mean the body without a headline, and a banned word can appear inside a quotation the brief
 * asked for. The buyer decides; this only makes sure nobody has to count.
 */
/**
 * Hours left on a job, 0 once the deadline has passed, NaN when it cannot be read.
 *
 * NaN rather than 0 for an unreadable deadline, and the caller treats anything that is not 0 as
 * "still open". Written that way on purpose: `(new Date("nonsense").getTime() - now) / h` is NaN,
 * every comparison against NaN is false, and a guard written as `hoursLeft > 0` would wave the award
 * through at exactly the moment it knows least. A guard has to fail towards refusing.
 */
export function hoursStillOpen(deadline: string, now = Date.now()): number {
  const t = new Date(deadline).getTime();
  if (Number.isNaN(t)) return NaN;
  return Math.max(0, (t - now) / 3_600_000);
}

export function formalCheck(brief: string, work: string): string[] {
  const findings: string[] = [];

  const limit = /(\d+)\s*words?\s*maximum|maximum\s*(\d+)\s*words?|at most (\d+) words/i.exec(brief);
  if (limit) {
    const max = Number(limit[1] ?? limit[2] ?? limit[3]);
    const n = work.split(/\s+/).filter(Boolean).length;
    if (n > max) findings.push(`${n} words against a limit of ${max}`);
  }

  // "Do not use: "a", "b", "c"." and the same list without quotes.
  const banned = /Do not use:?\s*([^.]+)\./i.exec(brief);
  if (banned) {
    const words = [...banned[1].matchAll(/"([^"]+)"|([A-Za-z][A-Za-z-]{2,})/g)]
      .map((m) => (m[1] ?? m[2]).toLowerCase())
      .filter((w) => !["and", "or", "the", "no", "not", "use", "do"].includes(w));
    const used = words.filter((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(work));
    for (const w of used) findings.push(`uses "${w}", which the brief rules out`);
  }

  if (/no exclamation marks/i.test(brief) && work.includes("!")) findings.push("has an exclamation mark");
  if (/no em dashes/i.test(brief) && /[—–]/.test(work)) findings.push("has an em or en dash");
  // Loose on purpose. "one sentence" appears in a brief as an instruction and almost nowhere else,
  // and the two spellings this first tried (line start, or after a colon) missed "10 words
  // maximum. One sentence." A false alarm here costs one glance; a missed one costs the check.
  if (/\bone sentence\b/i.test(brief)) {
    const sentences = work.split(/[.!?]+\s/).filter((t) => t.trim().length > 3).length;
    if (sentences > 1) findings.push(`${sentences} sentences where the brief asks for one`);
  }
  return findings;
}

async function main(): Promise<void> {
  const bountyId = arg("bounty");
  const session = await signIn();
  const key = session.key;
  try {
    await decide(bountyId, key);
  } finally {
    await handBack(session);
  }
}

async function decide(bountyId: string, key: string): Promise<void> {
  // Reassigned once the prefix is resolved, see below.

  // The brief comes from the public list, the same text the agents were given. Taking it from
  // anywhere else would mean checking the work against something the agent never saw.
  const list = (await call("/bounties.json", null)) as {
    open: { id: string; brief: string; kind: string; award_cents: number; deadline: string }[];
  };
  const job = findJob(list.open as never, bountyId, (t) => console.log(t));

  // From here on only the resolved id counts. The first version of the prefix lookup changed the
  // list search and then kept using the prefix, so the next call answered 404: a resolution that
  // stops halfway is worse than none, because it works far enough to look right.
  bountyId = job.id;

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

  const winner = process.argv.includes("--award") ? arg("award") : null;

  for (const s of submissions) {
    const check = (await call("/v1/check", key, {
      method: "POST",
      body: JSON.stringify({ briefing: job.brief, submission: s.body, kind: job.kind }),
    })) as { findings: { quote: string; kind: string; reason: string }[]; discarded: number };
    const words = s.body.split(/\s+/).filter(Boolean).length;
    const formal = formalCheck(job.brief, s.body);
    console.log(`${s.id === winner ? "->" : "  "} ${s.id}  ${short(s.agent)}  ${words} words  ` +
      `${check.findings.length} finding(s)${check.discarded ? `, ${check.discarded} discarded` : ""}` +
      `${formal.length ? `, ${formal.length} against the brief` : ""}`);
    for (const f of formal) console.log(`      [brief] ${f}`);
    for (const f of check.findings) console.log(`      [${f.kind}] ${f.quote}\n        ${f.reason}`);
    console.log(`      ${s.body.replace(/\n+/g, " ").slice(0, 400)}${s.body.length > 400 ? "…" : ""}\n`);
  }

  if (!winner) {
    console.log("Nothing awarded. Re-run with --award <submission-id>, or --none to award nobody.");
    return;
  }
  if (!submissions.some((s) => s.id === winner)) {
    throw new Error(`${winner} is not a submission on this job`);
  }

  // Not before the deadline, unless somebody says so out loud.
  //
  // On 2026-09-22 a cycle was carrying "award 0a10d826 at 17:47 UTC" as a standing instruction.
  // The job closes at 17:47 on the 23rd; the day had been written down from memory, the same trap
  // that had already dated a block of protocol entries a day ahead that morning. Awarding then
  // would have taken 24 hours off the one thing this market is waiting for, a submission from
  // somebody who is not us, to move money from us to us.
  //
  // The deadline is read from the service, never from the instruction. A job can still be awarded
  // early on purpose, which is a real case when every agent has handed in, but it has to be said.
  const hoursLeft = hoursStillOpen(job.deadline);
  if (hoursLeft !== 0 && !process.argv.includes("--early")) {
    const how = Number.isNaN(hoursLeft)
      ? `has a deadline this script cannot read ("${job.deadline}")`
      : `is open for another ${hoursLeft.toFixed(1)} hour(s), until ${job.deadline.slice(0, 16)} UTC`;
    console.log(`\nNOT AWARDED. This job ${how}.`);
    console.log("             Awarding now ends it early and takes that time away from anybody");
    console.log("             who has not handed in yet. Pass --early if that is what you mean.");
    return;
  }

  const before = ((await call("/v1/credits/balance", key)) as { balance_cents: number }).balance_cents;
  // `bountyView` in src/app.ts is what comes back: id, kind, brief, price_cents, award_cents,
  // fee_percent, deadline, status, created_at, plus winner_submission. No fee_cents, so nothing
  // here may print one.
  const awarded = (await call("/v1/bounties/award", key, {
    method: "POST", body: JSON.stringify({ bounty_id: bountyId, submission_id: winner }),
  })) as { status: string; award_cents: number; winner_submission: string };
  const after = ((await call("/v1/credits/balance", key)) as { balance_cents: number }).balance_cents;

  console.log(`awarded ${winner}, status ${awarded.status}, ${awarded.award_cents} c to the winner`);
  if (awarded.winner_submission !== winner) {
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

// Only when run as a script.
//
// `test/award-formal.test.ts` imports `formalCheck` from this file, and an unguarded `main()`
// runs on import: it found no --bounty, threw, and called process.exit(1). Every test still passed
// and `pnpm test` still exited 1, with the failure shown as "Errors 1 error" rather than as a
// failing test. Two cycles read the "475 passed" line and moved on. ops/deploy.sh refused the
// rollout, which is the first thing it has caught.
const runAsScript = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "\0");
if (runAsScript) {
  main().catch((e) => {
    console.error("AWARD FAILED:", (e as Error).message);
    process.exit(1);
  });
}
