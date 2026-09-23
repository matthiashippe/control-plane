/**
 * Drives the MCP server against the live service, the way an agent host would.
 *
 * Goal 12 was built by a ticket on the code-host and left one thing open, in its own words: no
 * path was run against production, only against a local instance. A distribution route nobody has
 * checked is not a route. If mcp/server.mjs is broken against cp.hippe.eu, the whole supply side
 * is broken and the market looks empty for a reason nobody would guess.
 *
 * So this provisions a fresh agent, claims its starter credit, speaks JSON-RPC over stdio exactly
 * as a host does, and walks the path an agent walks: see the open jobs, do the work, hand it in,
 * read back what it handed in.
 *
 * It posts its own job to hand the work in to, and cancels it again at the end. The first run on
 * 2026-09-20 submitted to a real open job instead, and left a submission there that does not
 * answer that brief. Harmless once, and wrong as a habit: a check that watches the market must not
 * change it.
 *
 *   OPERATOR_WALLET=harness/state/mainnet-wallet.json \
 *   CP_URL=https://cp.hippe.eu pnpm tsx ops/mcp-against-production.ts
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";

const BASE = (process.env.CP_URL || "https://postyourprice.com").replace(/\/$/, "");
const DOMAIN = process.env.CP_SIWE_DOMAIN || "conway.tech";
let failures = 0;

const ok = (what: string) => console.log(`OK      ${what}`);
const bad = (what: string, seen: unknown) => {
  failures++;
  console.log(`FAILED  ${what}\n        saw: ${JSON.stringify(seen).slice(0, 300)}`);
};

async function http(path: string, key: string | null, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: key } : {}), ...(init.headers as Record<string, string> | undefined) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body as Record<string, unknown>;
}

/** Mints a key for any account; the agent gets a throwaway one, the buyer uses the operator wallet. */
async function provision(privateKey: Hex, label: string): Promise<string> {
  const account = privateKeyToAccount(privateKey);
  const { nonce } = (await http("/v1/auth/nonce", null, { method: "POST" })) as { nonce: string };
  const message = createSiweMessage({
    domain: DOMAIN, address: account.address, statement: "Sign in to Conway",
    uri: `https://${DOMAIN}`, version: "1", chainId: 8453, nonce,
  });
  const signature = await account.signMessage({ message });
  const verify = await http("/v1/auth/verify", null, { method: "POST", body: JSON.stringify({ message, signature }) });
  const token = (verify.access_token ?? verify.accessToken) as string;
  const keyBody = await http("/v1/auth/api-keys", null, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: label }),
  });
  return (keyBody.apiKey ?? keyBody.api_key ?? keyBody.key) as string;
}

/** A JSON-RPC client over the server's stdio, which is all an MCP host is. */
function client(key: string) {
  const child = spawn("node", ["mcp/server.mjs"], {
    env: { ...process.env, CP_API_KEY: key, CP_URL: BASE },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buffer = "";
  const waiting = new Map<number, (v: any) => void>();
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        const done = waiting.get(msg.id);
        if (done) { waiting.delete(msg.id); done(msg); }
      } catch { /* not a response line */ }
    }
  });
  let id = 0;
  const send = (method: string, params?: unknown) =>
    new Promise<any>((resolve, reject) => {
      const mine = ++id;
      waiting.set(mine, resolve);
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: mine, method, params }) + "\n");
      setTimeout(() => { if (waiting.delete(mine)) reject(new Error(`${method} timed out`)); }, 60_000);
    });
  return { send, stop: () => child.kill() };
}

const textOf = (r: any): string => r?.result?.content?.[0]?.text ?? JSON.stringify(r?.result ?? r);

async function main(): Promise<number> {
  console.log(`MCP server against ${BASE}\n`);
  const key = await provision(generatePrivateKey(), "mcp-production-check-agent");
  ok("provisioned a fresh agent over SIWE");

  // Its own job, so the check never leaves a submission on one somebody actually wants done.
  const walletFile = process.env.OPERATOR_WALLET || "harness/state/mainnet-wallet.json";
  const buyerKey = await provision(
    (JSON.parse(fs.readFileSync(path.resolve(walletFile), "utf-8")) as { privateKey: Hex }).privateKey,
    "mcp-production-check-buyer",
  );
  const own = (await http("/v1/bounties", buyerKey, {
    method: "POST",
    body: JSON.stringify({
      brief: "Throwaway job for the MCP production check. It is cancelled as soon as the check is done.",
      kind: "factual",
      price_cents: 1,
      deadline: new Date(Date.now() + 3_600_000).toISOString(),
    }),
  })) as { id: string };
  ok(`posted its own throwaway job ${own.id}, 1 c`);

  // No starter credit is claimed here, on purpose. This check provisions a fresh wallet on every
  // run and none of the tools it exercises is billed, so every claim took 15 cents out of a pool
  // of 500 and spent none of it. Measured on 2026-09-21: two runs in one cycle moved the pool from
  // 410 to 380 cents, and at that rate our own observation would have eaten the entire cold-start
  // budget in twenty-five cycles, leaving nothing for the agents it was built for.
  //
  // Nothing is lost by dropping it. Since the same day the grant is taken automatically by the
  // first call that cannot pay for itself (src/credits/starter.ts), so if this check ever does
  // exercise check_submission, the credit arrives exactly then and is actually used.
  const balanceBefore = (await http("/v1/credits/balance", key)) as { balance_cents: number };
  balanceBefore.balance_cents === 0
    ? ok("starts at zero credits, and takes none it would not spend")
    : bad("a fresh wallet should start empty", balanceBefore);

  const mcp = client(key);
  try {
    const init = await mcp.send("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "production-check", version: "1" } });
    init?.result?.serverInfo?.name ? ok(`initialize: ${init.result.serverInfo.name}`) : bad("initialize", init);

    const tools = await mcp.send("tools/list");
    const names: string[] = (tools?.result?.tools ?? []).map((t: any) => t.name);
    names.length === 6 ? ok(`tools/list: ${names.join(", ")}`) : bad("expected six tools", names);

    const list = await mcp.send("tools/call", { name: "list_open_bounties", arguments: {} });
    const listText = textOf(list);
    const bountyId = listText.includes(own.id) ? own.id : undefined;
    bountyId ? ok(`list_open_bounties shows its own job ${bountyId}`) : bad("its own job is not in the open list", listText.slice(0, 200));

    const balance = await mcp.send("tools/call", { name: "read_balance", arguments: {} });
    /\d/.test(textOf(balance)) ? ok(`read_balance: ${textOf(balance).slice(0, 80)}`) : bad("read_balance", textOf(balance));

    if (bountyId) {
      const work =
        "A production check of the MCP route, handed in through the MCP server itself rather than " +
        "through curl. It proves the path an agent host actually walks.";
      const submitted = await mcp.send("tools/call", { name: "submit_work", arguments: { bounty_id: bountyId, body: work } });
      const submitText = textOf(submitted);
      /[0-9a-f]{8}-/.test(submitText) || /submitted/i.test(submitText)
        ? ok("submit_work went through")
        : bad("submit_work", submitText);

      const mine = await mcp.send("tools/call", { name: "read_my_submission", arguments: { bounty_id: bountyId } });
      textOf(mine).includes("production check") ? ok("read_my_submission returns what was handed in") : bad("read_my_submission", textOf(mine));

      // The tool that closes journey B2 step 7, and the reason this file exists at all: listing it
      // in tools/list proves nothing. An agent host has to be able to ask "what became of all of
      // it" without having kept a single bounty id, because that is the only answer a balance
      // cannot give. So the check asks, and it asks for an outcome by name rather than for any
      // text, since "pending" is the one word that distinguishes an answer from an empty list.
      const all = await mcp.send("tools/call", { name: "read_my_submissions", arguments: {} });
      const allText = textOf(all);
      allText.includes(bountyId) && /"outcome":\s*"pending"/.test(allText)
        ? ok("read_my_submissions lists the open job as pending, with no bounty id given")
        : bad("read_my_submissions", allText.slice(0, 300));
    }
  } finally {
    mcp.stop();
    try {
      await http("/v1/bounties/cancel", buyerKey, { method: "POST", body: JSON.stringify({ id: own.id }) });
      ok("cancelled its own job again, the market is as it was");
      // An outcome that never changes is decoration. After the cancel the same submission has to
      // read `cancelled`, which is what tells a waiting agent to stop waiting.
      const after = (await http("/v1/submissions/mine", key)) as { submissions: { bounty_id: string; outcome: string }[] };
      const row = after.submissions.find((r) => r.bounty_id === own.id);
      row?.outcome === "cancelled"
        ? ok("the outcome moved from pending to cancelled")
        : bad("outcome after cancelling", JSON.stringify(row ?? after.submissions.slice(0, 2)));
    } catch (e) {
      bad("could not cancel the throwaway job; it expires on its own within the hour", (e as Error).message);
    }
  }

  console.log(`\n${failures === 0 ? "MCP PRODUCTION OK" : `MCP PRODUCTION FAILED: ${failures}`}`);
  return failures === 0 ? 0 : 1;
}

main().then((c) => process.exit(c), (e) => {
  console.error("MCP PRODUCTION FAILED:", (e as Error).message);
  process.exit(2);
});
