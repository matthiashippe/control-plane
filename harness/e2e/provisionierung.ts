/**
 * Der Anmeldeweg gegen eine laufende Instanz, ohne Geld.
 *
 * `mainnet.ts` daneben prueft den ganzen Weg inklusive echter Zahlung und braucht dafuer USDC.
 * Dieser Lauf hoert davor auf: Wallet, SIWE, Schluessel, Guthaben, Historie. Genau das, was ein
 * Interessent als Erstes tut, und genau das, was am 19.09. bei einem fremden Kunden funktioniert
 * hat, bevor er stehenblieb.
 *
 *   CP_URL=https://cp.hippe.eu pnpm tsx harness/e2e/provisionierung.ts
 *
 * Legt einen API-Key in der Zieldatenbank an. Das kostet nichts und ist beabsichtigt.
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";

const BASE = (process.env.CP_URL || "https://cp.hippe.eu").replace(/\/$/, "");
const DOMAIN = process.env.CP_SIWE_DOMAIN || "conway.tech";

async function main(): Promise<void> {
  const account = privateKeyToAccount(generatePrivateKey());
  console.log(`Wegwerf-Wallet: ${account.address}`);

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
  // Schritt drei, und der wird leicht uebersehen: `verify` liefert nur einen kurzlebigen
  // access_token. Der API-Schluessel kommt aus /v1/auth/api-keys, mit dem Token als Bearer, und
  // wird danach ohne Bearer-Prefix gesendet.
  const token = (verify.access_token ?? verify.accessToken) as string | undefined;
  if (!token) throw new Error(`kein access_token in der Antwort: ${JSON.stringify(verify).slice(0, 200)}`);

  const keyRes = await fetch(`${BASE}/v1/auth/api-keys`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "harness-provisionierung" }),
  });
  const keyBody = (await keyRes.json()) as Record<string, unknown>;
  if (!keyRes.ok) throw new Error(`api-keys: ${keyRes.status} ${JSON.stringify(keyBody).slice(0, 200)}`);
  const key = (keyBody.apiKey ?? keyBody.api_key ?? keyBody.key) as string | undefined;
  if (!key) throw new Error(`kein Schluessel in der Antwort: ${JSON.stringify(keyBody).slice(0, 200)}`);
  console.log(`provisioniert: ${key.slice(0, 14)}…`);

  const balRes = await fetch(`${BASE}/v1/credits/balance`, { headers: { Authorization: key } });
  const bal = (await balRes.json()) as { balance_cents?: number };
  if (!balRes.ok) throw new Error(`balance: ${balRes.status} ${JSON.stringify(bal)}`);
  if (bal.balance_cents !== 0) throw new Error(`frische Wallet sollte 0 Cent haben, hat ${bal.balance_cents}`);

  const histRes = await fetch(`${BASE}/v1/credits/history?limit=5`, { headers: { Authorization: key } });
  const hist = (await histRes.json()) as { balance_cents?: number; entries?: unknown[] };
  if (!histRes.ok) throw new Error(`history: ${histRes.status} ${JSON.stringify(hist)}`);
  if (!Array.isArray(hist.entries)) throw new Error(`history ohne entries: ${JSON.stringify(hist).slice(0, 200)}`);
  if (hist.entries.length !== 0) throw new Error(`frische Wallet sollte keine Buchungen haben, hat ${hist.entries.length}`);

  // Genau die Antwort, die ein Kunde sieht, bei dem nichts passiert: Guthaben da, Liste leer.
  // Hier ist auch das Guthaben null, aber die Form stimmt und das ist der Punkt.
  const fremd = await fetch(`${BASE}/v1/credits/history`);
  if (fremd.status !== 401) throw new Error(`history ohne Schluessel muss 401 sein, war ${fremd.status}`);

  console.log(`PROVISIONIERUNG OK  balance=${bal.balance_cents} ct  entries=${hist.entries.length}  ohne Schluessel=401`);
}

main().catch((e: unknown) => {
  console.error(`PROVISIONIERUNG FAIL: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
