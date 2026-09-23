/**
 * Takes a job back off the market, which the service has always allowed and the operator could
 * never do.
 *
 * `ops/post-bounty.ts` puts work up and `ops/award.ts` closes it, either by paying a winner or,
 * with `--none`, by paying nobody. `--none` needs something to decide: with no submissions in it
 * says "nothing to decide, the price returns when the deadline passes" and changes nothing. That
 * leaves a job nobody should see sitting on the public market until its deadline, and on
 * 2026-09-23 three of them did, posted as the counter-proof for the guard in post-bounty.ts. The
 * endpoint to fix that has existed since the market opened, documented on /terms and in llms.txt,
 * with nothing in ops/ that calls it.
 *
 * Cancelling returns the whole price to the buyer. An agent that had already handed work in is
 * told `cancelled` and keeps nothing, which is exactly why this is not the tool to reach for on a
 * job with submissions: use `ops/award.ts` and pay or decline on the merits.
 *
 *   OPERATOR_WALLET=harness/state/mainnet-wallet.json CP_URL=https://postyourprice.com \
 *     pnpm tsx ops/cancel-bounty.ts <id> [<id> ...]
 *
 * Signs in with the operator wallet and moves credits that already exist. No payment, no chain
 * transaction; loop-constraints.md permits exactly that. The key is handed back afterwards,
 * whatever happened.
 */
import fs from "node:fs";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import type { Hex } from "viem";

const BASE = (process.env.CP_URL || "https://postyourprice.com").replace(/\/$/, "");
const DOMAIN = process.env.CP_SIWE_DOMAIN || "conway.tech";
const WALLET = process.env.OPERATOR_WALLET || "harness/state/mainnet-wallet.json";

async function call(p: string, key: string | null, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${p}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...(init.headers || {}),
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${p}: ${res.status} ${body.slice(0, 200)}`);
  return body ? JSON.parse(body) : {};
}

async function main(): Promise<void> {
  const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!ids.length) {
    console.error("usage: pnpm tsx ops/cancel-bounty.ts <bounty-id> [<bounty-id> ...]");
    console.error("The full id, as /bounties.json prints it. Cancelling returns the price.");
    process.exit(2);
  }

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
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "handsel-cancel-bounty" }),
  });
  const key = (keyBody.apiKey ?? keyBody.api_key ?? keyBody.key) as string;
  const keyPrefix = (keyBody.key_prefix ?? keyBody.keyPrefix ?? "") as string;

  let failed = 0;
  try {
    const before = ((await call("/v1/credits/balance", key)) as { balance_cents: number }).balance_cents;
    for (const id of ids) {
      try {
        await call("/v1/bounties/cancel", key, { method: "POST", body: JSON.stringify({ id }) });
        console.log(`cancelled  ${id}`);
      } catch (e) {
        console.log(`FAILED     ${id}: ${(e as Error).message}`);
        failed += 1;
      }
    }
    const after = ((await call("/v1/credits/balance", key)) as { balance_cents: number }).balance_cents;
    console.log(`buyer ${before} c -> ${after} c`);
  } finally {
    // Whatever happened, the key goes back, same as in post-bounty.ts and for the same reason:
    // a tool that exits in a hurry is the one least likely to be looked at afterwards.
    if (keyPrefix) {
      await call("/v1/auth/api-keys/revoke", key, {
        method: "POST",
        body: JSON.stringify({ key_prefix: keyPrefix }),
      }).then(
        () => console.log("        key handed back"),
        (e) => console.log(`        NOTE could not revoke the key: ${(e as Error).message}`),
      );
    }
  }
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
