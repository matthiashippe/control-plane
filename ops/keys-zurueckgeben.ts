/**
 * Hand back every key a wallet of ours is still holding, except the one in use.
 *
 * `harness/e2e/markt.ts` minted a fresh key on every run for two years' worth of runs in two days
 * and never gave one back. By 2026-09-22 this instance held 453 API keys, every one able to sign
 * in, 350 of them on those two wallets. The tools return theirs now; this is for the pile that was
 * already there.
 *
 * It is not a one-off script despite the occasion. "Give back everything this wallet is still
 * holding" is a thing an operator wants on the day something leaks, and that is the day nobody
 * wants to write it.
 *
 *   pnpm tsx ops/keys-zurueckgeben.ts --wallet harness/state/markt-poster.json
 *   pnpm tsx ops/keys-zurueckgeben.ts --wallet … --dry
 *
 * It only ever touches wallets whose private key is on this machine, so it cannot reach anybody
 * else's: the service scopes every revoke to the caller's own address, and the caller is whoever
 * signed in. `--dry` lists what it would revoke and revokes nothing.
 */
import fs from "node:fs";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
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
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: key } : {}), ...(init.headers as Record<string, string> | undefined) },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep the text */
  }
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${pathname}: ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body as Record<string, unknown>;
}

async function main(): Promise<void> {
  const file = path.resolve(arg("wallet"));
  const { privateKey } = JSON.parse(fs.readFileSync(file, "utf-8")) as { privateKey: Hex };
  const account = privateKeyToAccount(privateKey);

  const { nonce } = (await call("/v1/auth/nonce", null, { method: "POST" })) as { nonce: string };
  const message = createSiweMessage({
    domain: DOMAIN, address: account.address, statement: "Sign in to Conway",
    uri: `https://${DOMAIN}`, version: "1", chainId: 8453, nonce,
  });
  const signature = await account.signMessage({ message });
  const verify = await call("/v1/auth/verify", null, { method: "POST", body: JSON.stringify({ message, signature }) });
  const keyBody = await call("/v1/auth/api-keys", null, {
    method: "POST",
    headers: { Authorization: `Bearer ${(verify.access_token ?? verify.accessToken) as string}` },
    body: JSON.stringify({ name: "ops-keys-zurueckgeben" }),
  });
  const key = (keyBody.apiKey ?? keyBody.api_key ?? keyBody.key) as string;
  const ownPrefix = (keyBody.key_prefix ?? keyBody.keyPrefix ?? "") as string;

  const { keys } = (await call("/v1/auth/api-keys", key)) as {
    keys: { key_prefix: string; name: string; created_at: string; active: boolean }[];
  };
  const outstanding = keys.filter((k) => k.active && k.key_prefix !== ownPrefix);
  console.log(`${account.address}`);
  console.log(`  ${keys.length} key(s) on file, ${keys.filter((k) => k.active).length} active`);
  console.log(`  ${outstanding.length} to hand back, plus the one this run is holding`);

  const byName = new Map<string, number>();
  for (const k of outstanding) byName.set(k.name, (byName.get(k.name) ?? 0) + 1);
  for (const [name, count] of [...byName].sort((a, b) => b[1] - a[1])) console.log(`    ${String(count).padStart(4)}  ${name}`);

  if (flag("dry")) {
    console.log("\nDRY  nothing revoked.");
    return;
  }

  let revoked = 0;
  let failed = 0;
  for (const k of outstanding) {
    try {
      await call("/v1/auth/api-keys/revoke", key, { method: "POST", body: JSON.stringify({ key_prefix: k.key_prefix }) });
      revoked++;
    } catch (e) {
      failed++;
      if (failed <= 3) console.log(`    could not revoke ${k.key_prefix}: ${(e as Error).message}`);
    }
  }
  console.log(`\n${revoked} handed back${failed ? `, ${failed} refused` : ""}.`);

  // And this run's own key, last, because everything above needed it.
  await call("/v1/auth/api-keys/revoke", key, { method: "POST", body: JSON.stringify({ key_prefix: ownPrefix }) });
  console.log("Including the one this run was holding. That wallet now has no active key.");
}

const runAsScript = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "\0");
if (runAsScript) {
  main().catch((e) => {
    console.error("HANDING BACK FAILED:", (e as Error).message);
    process.exit(1);
  });
}
