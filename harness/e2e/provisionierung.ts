/**
 * The sign-up path against a running instance, without money.
 *
 * `mainnet.ts` next door checks the whole way including a real payment and needs USDC for it.
 * This run stops short of that: wallet, SIWE, key, balance, history. Exactly what a prospect does
 * first, and exactly what worked on 19.09. for an outside customer before he came to a halt.
 *
 *   CP_URL=https://cp.hippe.eu pnpm tsx harness/e2e/provisionierung.ts
 *
 * Creates one API key in the target database. That costs nothing and is intended.
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";

const BASE = (process.env.CP_URL || "https://cp.hippe.eu").replace(/\/$/, "");
const DOMAIN = process.env.CP_SIWE_DOMAIN || "conway.tech";

async function main(): Promise<void> {
  const account = privateKeyToAccount(generatePrivateKey());
  console.log(`throwaway wallet: ${account.address}`);

  const nonceRes = await fetch(`${BASE}/v1/auth/nonce`, { method: "POST" });
  if (!nonceRes.ok) throw new Error(`nonce: ${nonceRes.status} ${await nonceRes.text()}`);
  const { nonce } = (await nonceRes.json()) as { nonce: string };

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

  const verifyRes = await fetch(`${BASE}/v1/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  const verify = (await verifyRes.json()) as Record<string, unknown>;
  if (!verifyRes.ok) throw new Error(`verify: ${verifyRes.status} ${JSON.stringify(verify)}`);
  // Step three, and it is easily missed: `verify` only hands out a short-lived access_token. The
  // API key comes from /v1/auth/api-keys, with that token as the bearer, and is sent without a
  // bearer prefix afterwards.
  const token = (verify.access_token ?? verify.accessToken) as string | undefined;
  if (!token) throw new Error(`no access_token in the response: ${JSON.stringify(verify).slice(0, 200)}`);

  const keyRes = await fetch(`${BASE}/v1/auth/api-keys`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "harness-provisionierung" }),
  });
  const keyBody = (await keyRes.json()) as Record<string, unknown>;
  if (!keyRes.ok) throw new Error(`api-keys: ${keyRes.status} ${JSON.stringify(keyBody).slice(0, 200)}`);
  const key = (keyBody.apiKey ?? keyBody.api_key ?? keyBody.key) as string | undefined;
  if (!key) throw new Error(`no key in the response: ${JSON.stringify(keyBody).slice(0, 200)}`);
  console.log(`provisioned: ${key.slice(0, 14)}…`);

  const balRes = await fetch(`${BASE}/v1/credits/balance`, { headers: { Authorization: key } });
  const bal = (await balRes.json()) as { balance_cents?: number };
  if (!balRes.ok) throw new Error(`balance: ${balRes.status} ${JSON.stringify(bal)}`);
  if (bal.balance_cents !== 0) throw new Error(`a fresh wallet should hold 0 cents, holds ${bal.balance_cents}`);

  const histRes = await fetch(`${BASE}/v1/credits/history?limit=5`, { headers: { Authorization: key } });
  const hist = (await histRes.json()) as { balance_cents?: number; entries?: unknown[] };
  if (!histRes.ok) throw new Error(`history: ${histRes.status} ${JSON.stringify(hist)}`);
  if (!Array.isArray(hist.entries)) throw new Error(`history without entries: ${JSON.stringify(hist).slice(0, 200)}`);
  if (hist.entries.length !== 0) throw new Error(`a fresh wallet should have no entries, has ${hist.entries.length}`);

  // Exactly the answer a customer sees when nothing is happening: balance there, list empty. Here
  // the balance is zero as well, but the shape is right and that is the point.
  const anonymous = await fetch(`${BASE}/v1/credits/history`);
  if (anonymous.status !== 401) throw new Error(`history without a key has to be 401, was ${anonymous.status}`);

  console.log(`PROVISIONIERUNG OK  balance=${bal.balance_cents} ct  entries=${hist.entries.length}  without a key=401`);
}

main().catch((e: unknown) => {
  console.error(`PROVISIONIERUNG FAIL: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
