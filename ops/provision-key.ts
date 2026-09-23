/**
 * Mints one API key and writes it to a file, never to stdout.
 *
 * harness/e2e/provisionierung.ts prints the key abbreviated on purpose, which is right for a run
 * a human reads and wrong for a script that has to use it. The first version of the skill
 * production check grepped that abbreviated key out of the log, sent it, and then reported that
 * the service answered "Invalid API key". The service was right and the check was wrong.
 *
 * So: the key goes to a file with mode 600 and nowhere else. The caller removes it.
 *
 *   CP_URL=https://cp.hippe.eu pnpm tsx ops/provision-key.ts --out /tmp/key --name my-check
 */
import fs from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";

const BASE = (process.env.CP_URL || "https://postyourprice.com").replace(/\/$/, "");
const DOMAIN = process.env.CP_SIWE_DOMAIN || "conway.tech";

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

async function json(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, init);
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`${path}: ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

async function main(): Promise<void> {
  const out = arg("out");
  const name = arg("name", "provisioned-key");
  // With --wallet the key belongs to an existing account, which is how a caller reaches the
  // operator wallet to clean up after itself. Without it a throwaway account is made.
  const walletFile = process.argv.indexOf("--wallet") >= 0 ? arg("wallet") : null;
  const priv = walletFile
    ? (JSON.parse(fs.readFileSync(walletFile, "utf-8")) as { privateKey: `0x${string}` }).privateKey
    : generatePrivateKey();
  const account = privateKeyToAccount(priv);
  const { nonce } = (await json("/v1/auth/nonce", { method: "POST" })) as { nonce: string };
  const message = createSiweMessage({
    domain: DOMAIN, address: account.address, statement: "Sign in to Conway",
    uri: `https://${DOMAIN}`, version: "1", chainId: 8453, nonce,
  });
  const signature = await account.signMessage({ message });
  const verify = await json("/v1/auth/verify", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  const token = (verify.access_token ?? verify.accessToken) as string;
  const keyBody = await json("/v1/auth/api-keys", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const key = (keyBody.apiKey ?? keyBody.api_key ?? keyBody.key) as string;
  if (!key) throw new Error("no key in the answer");
  fs.writeFileSync(out, key, { mode: 0o600 });
  console.log(`provisioned ${account.address.toLowerCase()}, key written to ${out}`);
}

main().catch((e) => {
  console.error("PROVISION FAILED:", (e as Error).message);
  process.exit(1);
});
