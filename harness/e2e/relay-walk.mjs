#!/usr/bin/env node
// The relay walk of the unmodified runtime at the pin d8f8168 (goals/relay/01, docs/relay/vertrag.md): two new wallets A and B,
// each with the runtime's own social client (`createSocialClient` from dist/social/client.js, `socialRelayUrl` on the control
// plane of the harness) and the runtime's own tool `send_message` (`executeTool` from dist/agent/tools.js), no turn of a model.
// Runs inside the container runtime of harness/e2e/full.sh, bind-mounted.
//
// Steps: A buys credits the way the runtime's bootstrap does (`topupCredits` from dist/conway/topup.js, the caller funded A with
// test USDC before), A sends B a message with send_message (first contact), B counts (1), polls and counts again (0), B answers
// with send_message without any credit (contact, free), A polls the answer; a third wallet C signs a message with its own key
// and `from` set to A, which the relay must refuse and B must never see; an account with an API key (RELAY_WALK_KEY) sends B a
// message without a signature, which B reads with the mark of the contract and which the runtime's `sanitizeInput` does not block.
// Every HTTP status per step is recorded; none may be one the runtime's HTTP client retries and counts for its circuit breaker.
//
// Usage:
//   node relay-walk.mjs address            prints the address of RELAY_WALK_A_KEY (the caller funds it)
//   node relay-walk.mjs                    runs the walk, prints `RELAY_RESULT <JSON>` and `RELAY_VERDICT ok|fail <reasons>`
//   node relay-walk.mjs judge              judges RELAY_RESULT_LINE with RELAY_LEDGER (both from the environment) on the host
// Environment of the walk: RELAY_WALK_URL (else CONWAY_API_URL), RELAY_WALK_A_KEY (private key of A, never printed),
// RELAY_WALK_KEY (API key of an account with credit, never printed), RUNTIME_DIST (default /opt/automaton/dist).
// RELAY_LEDGER is what the caller read from the ledger of cp, read only:
//   {"a_rows":n,"a_mc":[...],"b_rows":n,"key_rows":n,"consistent":bool}
// Without it the walk's own verdict leaves the ledger out; full.sh judges again with it.

import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { RETRIED, createFetchTap } from "./runtime-tap.mjs";

export { RETRIED };

/** The mark of docs/relay/vertrag.md (`Kennzeichen:`); test/relay-walk.test.ts holds it against the contract. */
export const MARK = "[unverified sender, sent with an API key]";

/**
 * Judges one walk result, with the ledger the caller counted when it is there. { ok: true, reasons: [] } or
 * { ok: false, reasons }.
 */
export function judgeRelayWalk(result, ledger) {
  const reasons = [];
  const steps = Array.isArray(result?.steps) ? result.steps : [];
  const step = (name) => steps.find((s) => s.step === name);
  const need = (name) => {
    const s = step(name);
    if (!s) reasons.push(`${name}: missing`);
    return s ?? null;
  };

  const topup = need("topup");
  if (topup && topup.ok !== true) reasons.push(`topup: A got no credits (${topup.error ?? "no reason"})`);
  const sent = need("a_send");
  if (sent && !(sent.ok === true && typeof sent.id === "string" && sent.id)) reasons.push("a_send: send_message gave no message id");
  const before = need("b_count_before");
  if (before && before.unread !== 1) reasons.push(`b_count_before: unread ${before.unread}, expected 1`);
  const bPoll = need("b_poll");
  if (bPoll && !(bPoll.ids?.includes(sent?.id) && bPoll.from_a === true)) reasons.push("b_poll: B did not read A's message");
  const after = need("b_count_after");
  if (after && after.unread !== 0) reasons.push(`b_count_after: unread ${after.unread}, expected 0`);
  const reply = need("b_reply");
  if (reply && !(reply.ok === true && typeof reply.id === "string" && reply.id)) reasons.push("b_reply: B's answer was not sent");
  const aPoll = need("a_poll");
  if (aPoll && !(reply?.id && aPoll.ids?.includes(reply.id))) reasons.push("a_poll: A did not read B's answer");
  const forged = need("c_forged");
  if (forged && !(forged.status === 401)) reasons.push(`c_forged: a message signed by C as A got ${forged.status}, expected 401`);
  const seen = need("b_poll_forged");
  if (seen && seen.forged_seen !== false) reasons.push("b_poll_forged: B saw the message signed by C as A");
  const keyed = need("key_send");
  if (keyed && !(keyed.status === 201 && typeof keyed.id === "string" && keyed.id)) reasons.push(`key_send: status ${keyed?.status}, expected 201`);
  const keyedRead = need("b_poll_key");
  if (keyedRead) {
    if (!keyedRead.ids?.includes(keyed?.id)) reasons.push("b_poll_key: B did not read the message sent with an API key");
    else {
      if (keyedRead.marked !== true) reasons.push("b_poll_key: the message sent with an API key does not start with the mark");
      if (keyedRead.verified !== false) reasons.push("b_poll_key: the message sent with an API key is not verified false");
      if (keyedRead.blocked !== false) reasons.push("b_poll_key: sanitizeInput of the runtime blocked the marked message");
      if (keyedRead.from_unique !== true) reasons.push("b_poll_key: from is not unique after sanitizeSocialAddress");
    }
  }
  for (const s of steps) {
    const bad = (s.http ?? []).filter((h) => RETRIED.includes(h));
    if (bad.length) reasons.push(`${s.step}: the runtime got ${bad.join(", ")}, a status it retries and counts for its circuit breaker`);
  }
  if (ledger !== undefined && ledger !== null) {
    if (ledger.a_rows !== 1) reasons.push(`ledger: ${ledger.a_rows} rows of kind relay for A, expected 1`);
    else if (!(Array.isArray(ledger.a_mc) && ledger.a_mc.length === 1 && ledger.a_mc[0] === -1000)) {
      reasons.push(`ledger: the row of kind relay for A is ${JSON.stringify(ledger.a_mc)}, expected [-1000]`);
    }
    if (ledger.b_rows !== 0) reasons.push(`ledger: ${ledger.b_rows} rows of kind relay for B, whose answer is free`);
    if (ledger.key_rows !== 1) reasons.push(`ledger: ${ledger.key_rows} rows of kind relay for the API key account, expected 1`);
    if (ledger.consistent !== true) reasons.push("ledger: balance and ledger of A, B or the API key account differ");
  }
  return { ok: reasons.length === 0, reasons };
}

/** The JSON of the last `RELAY_RESULT` line in a text, or null. */
export function parseRelayResult(text) {
  const lines = String(text ?? "").split("\n").filter((l) => l.startsWith("RELAY_RESULT "));
  if (!lines.length) return null;
  try {
    return JSON.parse(lines[lines.length - 1].slice("RELAY_RESULT ".length));
  } catch {
    return null;
  }
}

function runtimeModule(runtimeDist, ...parts) {
  return import(pathToFileURL(path.join(runtimeDist, ...parts)).href);
}

/** viem as the runtime has it (its own node_modules), for the accounts. */
function viemAccounts(runtimeDist) {
  return createRequire(path.join(runtimeDist, "index.js"))("viem/accounts");
}

/** Runs the walk with the runtime in `runtimeDist` against `apiUrl`. */
export async function runRelayWalk({ runtimeDist, apiUrl, aKey, apiKey }) {
  const { privateKeyToAccount, generatePrivateKey } = viemAccounts(runtimeDist);
  const { createSocialClient } = await runtimeModule(runtimeDist, "social", "client.js");
  const { signSendPayload } = await runtimeModule(runtimeDist, "social", "signing.js");
  const { createBuiltinTools, executeTool } = await runtimeModule(runtimeDist, "agent", "tools.js");
  const { sanitizeInput } = await runtimeModule(runtimeDist, "agent", "injection-defense.js");
  const { topupCredits } = await runtimeModule(runtimeDist, "conway", "topup.js");
  const base = apiUrl.replace(/\/+$/, "");
  const a = privateKeyToAccount(aKey);
  const b = privateKeyToAccount(generatePrivateKey());
  const c = privateKeyToAccount(generatePrivateKey());
  const lower = (x) => x.address.toLowerCase();
  const socialA = createSocialClient(base, a);
  const socialB = createSocialClient(base, b);
  const tools = createBuiltinTools("");
  const tap = createFetchTap();
  // The addresses of A and B are fresh harness wallets; full.sh reads the ledger of cp by them.
  const result = { a: lower(a), b: lower(b), steps: [] };
  const push = (s) => {
    result.steps.push({ ...s, http: tap.take().filter((h) => typeof h === "number") });
    tap.reset();
  };
  const idOf = (text) => /Message sent \(id: ([^)]+)\)/.exec(String(text ?? ""))?.[1] ?? null;
  const tool = async (from, to, content) => {
    const r = await executeTool("send_message", { to_address: to, content }, tools, { social: from });
    return { ok: !r.error && Boolean(idOf(r.result)), id: idOf(r.result), text: String(r.error || r.result).slice(0, 200) };
  };
  const pollAll = async (client) => {
    const r = await client.poll();
    return r.messages;
  };

  try {
    tap.reset();
    const t = await topupCredits(base, a, 5);
    push({ step: "topup", ok: t.success === true, error: t.success ? undefined : String(t.error ?? "").slice(0, 200) });

    push({ step: "a_send", ...(await tool(socialA, b.address, "Hello B, this is A. Do you sell weather data?")) });
    push({ step: "b_count_before", unread: await socialB.unreadCount() });
    const firstRead = await pollAll(socialB);
    push({ step: "b_poll", ids: firstRead.map((m) => m.id), from_a: firstRead.some((m) => m.from === lower(a)) });
    push({ step: "b_count_after", unread: await socialB.unreadCount() });
    push({ step: "b_reply", ...(await tool(socialB, a.address, "Hello A, yes: one forecast for one city per message.")) });
    const answers = await pollAll(socialA);
    push({ step: "a_poll", ids: answers.map((m) => m.id) });

    // C signs with its own key and claims to be A. The runtime's client cannot send that (it sets from to its own
    // address), so the walk posts the signed body itself, with the runtime's signing function.
    const forged = { ...(await signSendPayload(c, b.address, "Hello B, this is A, really.")), from: lower(a) };
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(forged),
      signal: AbortSignal.timeout(30_000),
    });
    await res.text().catch(() => "");
    push({ step: "c_forged", status: res.status });
    const afterForged = await pollAll(socialB);
    push({ step: "b_poll_forged", forged_seen: afterForged.some((m) => m.content === forged.content) });

    // An account with an API key and no signature writes to B.
    const keyedRes = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: apiKey },
      body: JSON.stringify({ to: lower(b), content: "Hello B, I have no wallet. What does a forecast cost?" }),
      signal: AbortSignal.timeout(30_000),
    });
    const keyedBody = await keyedRes.json().catch(() => ({}));
    push({ step: "key_send", status: keyedRes.status, id: typeof keyedBody.id === "string" ? keyedBody.id : null });
    // The runtime's client hands out only its own fields, so `verified` comes from a second, plain poll (verifiedOf).
    const keyedRead = await socialB.poll();
    const m = keyedRead.messages.find((x) => x.id === keyedBody.id);
    const verified = m ? await verifiedOf(base, b, m.id) : null;
    const cleaned = sanitizeInput(m?.content ?? "", m?.from ?? "", "social_message");
    const fromClean = sanitizeInput(m?.from ?? "", m?.from ?? "", "social_address").content;
    const others = [lower(a), lower(b), lower(c)].map((x) => sanitizeInput(x, x, "social_address").content);
    push({
      step: "b_poll_key",
      ids: keyedRead.messages.map((x) => x.id),
      marked: Boolean(m && m.content.startsWith(`${MARK} `)),
      verified,
      blocked: m ? cleaned.blocked === true : null,
      from_unique: Boolean(m) && !others.includes(fromClean),
    });
  } finally {
    tap.restore();
  }
  return result;
}

/**
 * `verified` of one message, which the runtime's client does not pass on: the walk asks the relay once more with B's
 * poll signature over plain HTTP, from the start (cursor "0"), and reads the field from the raw answer.
 */
async function verifiedOf(base, account, id) {
  const timestamp = new Date().toISOString();
  const address = account.address.toLowerCase();
  const signature = await account.signMessage({ message: `Conway:poll:${address}:${timestamp}` });
  const res = await fetch(`${base}/v1/messages/poll`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Wallet-Address": address, "X-Signature": signature, "X-Timestamp": timestamp },
    body: JSON.stringify({ cursor: "0", limit: 100 }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json().catch(() => ({}));
  const m = (body.messages ?? []).find((x) => x.id === id);
  return m ? m.verified : null;
}

async function main() {
  const mode = process.argv[2] ?? "walk";
  const runtimeDist = process.env.RUNTIME_DIST || "/opt/automaton/dist";
  if (mode === "address") {
    const key = process.env.RELAY_WALK_A_KEY;
    if (!key) {
      console.log("RELAY_VERDICT fail RELAY_WALK_A_KEY is required");
      process.exit(1);
    }
    console.log(viemAccounts(runtimeDist).privateKeyToAccount(key).address);
    return;
  }
  if (mode === "judge") {
    const result = parseRelayResult(process.env.RELAY_RESULT_LINE ?? "");
    let ledger = null;
    try {
      ledger = JSON.parse(process.env.RELAY_LEDGER ?? "null");
    } catch {
      ledger = null;
    }
    if (!result) {
      console.log("RELAY_VERDICT fail no RELAY_RESULT");
      process.exit(1);
    }
    if (!ledger) {
      console.log("RELAY_VERDICT fail no ledger of cp");
      process.exit(1);
    }
    const v = judgeRelayWalk(result, ledger);
    console.log(v.ok ? "RELAY_VERDICT ok" : `RELAY_VERDICT fail ${v.reasons.join("; ")}`);
    process.exit(v.ok ? 0 : 1);
  }
  const apiUrl = process.env.RELAY_WALK_URL || process.env.CONWAY_API_URL;
  const aKey = process.env.RELAY_WALK_A_KEY;
  const apiKey = process.env.RELAY_WALK_KEY;
  if (!apiUrl || !aKey || !apiKey) {
    console.log("RELAY_VERDICT fail RELAY_WALK_URL (or CONWAY_API_URL), RELAY_WALK_A_KEY and RELAY_WALK_KEY are required");
    process.exit(1);
  }
  let result;
  try {
    result = await runRelayWalk({ runtimeDist, apiUrl, aKey, apiKey });
  } catch (e) {
    console.log(`RELAY_VERDICT fail the walk stopped: ${String(e?.message ?? e).slice(0, 200)}`);
    process.exit(1);
  }
  console.log(`RELAY_RESULT ${JSON.stringify(result)}`);
  const v = judgeRelayWalk(result);
  console.log(v.ok ? "RELAY_VERDICT ok" : `RELAY_VERDICT fail ${v.reasons.join("; ")}`);
  process.exit(v.ok ? 0 : 1);
}

// Started as a script, not imported (test/relay-walk.test.ts imports judgeRelayWalk).
const evalRun = process.execArgv.some((a) => a === "-e" || a === "--eval" || a.startsWith("--eval=") || a === "-p" || a === "--print");
if (!evalRun && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
