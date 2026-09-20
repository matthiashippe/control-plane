/**
 * Abnahme Stufe 1 gegen das laufende Control Plane auf Base Mainnet: eine Wegwerf-Wallet
 * provisioniert sich per SIWE, kauft über `/pay/<tier>/<addr>` Credits mit echtem USDC (x402 v1,
 * signiert wie der Runtime-Client) und liest den Saldo zurück.
 *
 *   CP_URL=https://cp.hippe.eu pnpm e2e:mainnet            (Tier 1, Default)
 *   CP_URL=... CP_TIER=5 pnpm e2e:mainnet
 *
 * Die Wallet liegt unter harness/state/mainnet-wallet.json (gitignored). Der Key verlässt diesen
 * Rechner nicht; das Control Plane sieht nur Signaturen.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, erc20Abi, formatUnits, http, type Address, type Hex } from "viem";
import { base } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { SCHWELLEN_BONUS_CENTS } from "../../src/payments/pay.js";

const CP_URL = (process.env.CP_URL || "").replace(/\/$/, "");
if (!CP_URL) {
  console.error("MAINNET FAIL: CP_URL fehlt (z. B. https://cp.hippe.eu)");
  process.exit(2);
}
const TIER = Number(process.env.CP_TIER || 1);
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";

const stateDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "state");
const walletPath = path.join(stateDir, "mainnet-wallet.json");
fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
let privateKey: Hex;
if (fs.existsSync(walletPath)) {
  privateKey = (JSON.parse(fs.readFileSync(walletPath, "utf-8")) as { privateKey: Hex }).privateKey;
} else {
  privateKey = generatePrivateKey();
  fs.writeFileSync(walletPath, JSON.stringify({ privateKey, createdAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
}
const account = privateKeyToAccount(privateKey);
const pub = createPublicClient({ chain: base, transport: http(RPC) });

async function usdcBalance(): Promise<number> {
  const raw = await pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  return Number(formatUnits(raw, 6));
}

console.log(`Wegwerf-Wallet: ${account.address}`);
let balance = await usdcBalance();
console.log(`USDC auf Base: ${balance}`);
const deadline = Date.now() + 15 * 60 * 1000;
while (balance < TIER && Date.now() < deadline) {
  console.log(`warte auf mindestens ${TIER} USDC an ${account.address} (aktuell ${balance}) ...`);
  await new Promise((r) => setTimeout(r, 10_000));
  balance = await usdcBalance();
}
if (balance < TIER) {
  console.error(`MAINNET FAIL: nur ${balance} USDC auf der Wallet`);
  process.exit(1);
}

// 1. SIWE-Provisionierung wie provision.ts der Runtime.
const nonceRes = await fetch(`${CP_URL}/v1/auth/nonce`, { method: "POST" });
const { nonce } = (await nonceRes.json()) as { nonce: string };
const message = createSiweMessage({
  domain: "conway.tech",
  address: account.address,
  statement: "Sign in to Conway as an Automaton to provision an API key.",
  uri: `${CP_URL}/v1/auth/verify`,
  version: "1",
  chainId: 8453,
  nonce,
  issuedAt: new Date(),
});
const signature = await account.signMessage({ message });
const verifyRes = await fetch(`${CP_URL}/v1/auth/verify`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ message, signature }),
});
if (!verifyRes.ok) {
  console.error(`MAINNET FAIL: verify ${verifyRes.status} ${await verifyRes.text()}`);
  process.exit(1);
}
const { access_token } = (await verifyRes.json()) as { access_token: string };
const keyRes = await fetch(`${CP_URL}/v1/auth/api-keys`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${access_token}` },
  body: JSON.stringify({ name: "mainnet-abnahme" }),
});
const { key, key_prefix } = (await keyRes.json()) as { key: string; key_prefix: string };
console.log(`provisioniert: ${key_prefix}`);

// 2. 402-Angebot holen, dann x402 v1 signieren wie signPayment() in src/conway/x402.ts.
const offerRes = await fetch(`${CP_URL}/pay/${TIER}/${account.address}`);
if (offerRes.status !== 402) {
  console.error(`MAINNET FAIL: erwartet 402, bekam ${offerRes.status} ${await offerRes.text()}`);
  process.exit(1);
}
const offer = (await offerRes.json()) as { accepts: Array<{ maxAmountRequired: string; payTo: Address; asset: Address; maxTimeoutSeconds: number; network: string }> };
const req = offer.accepts[0];
console.log(`Angebot: ${req.maxAmountRequired} atomare USDC an ${req.payTo} (${req.network})`);
const value = BigInt(req.maxAmountRequired);
const now = Math.floor(Date.now() / 1000);
const validAfter = BigInt(now - 60);
const validBefore = BigInt(now + req.maxTimeoutSeconds);
const paymentNonce = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}` as Hex;
const paySig = await account.signTypedData({
  domain: { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: req.asset },
  types: {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
  primaryType: "TransferWithAuthorization",
  message: { from: account.address, to: req.payTo, value, validAfter, validBefore, nonce: paymentNonce },
});
const payment = {
  x402Version: 1,
  scheme: "exact",
  network: "eip155:8453",
  payload: {
    signature: paySig,
    authorization: {
      from: account.address,
      to: req.payTo,
      value: value.toString(),
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      nonce: paymentNonce,
    },
  },
};
const paidRes = await fetch(`${CP_URL}/pay/${TIER}/${account.address}`, {
  headers: { "content-type": "application/json", "x-payment": Buffer.from(JSON.stringify(payment)).toString("base64") },
});
const paidText = await paidRes.text();
if (paidRes.status !== 200) {
  console.error(`MAINNET FAIL: bezahlter Request ${paidRes.status} ${paidText}`);
  process.exit(1);
}
const paid = JSON.parse(paidText) as { credits_cents: number; balance_cents: number; tx_hash: string | null };
console.log(`Antwort: ${paidText}`);

// 3. Saldo mit dem Key lesen, USDC-Saldo danach.
const balRes = await fetch(`${CP_URL}/v1/credits/balance`, { headers: { authorization: key } });
const bal = (await balRes.json()) as { balance_cents: number };
const after = await usdcBalance();
console.log(`Credits: ${bal.balance_cents} Cents, USDC danach: ${after}`);
// Der Dienst legt auf jeden Topup den Schwellenbonus drauf, damit ein 5-USD-Kunde ueber der
// Tier-Schwelle der Runtime landet (`> 500` Cent, nicht `>= 500`). Der Abnahmelauf muss das
// mitrechnen, sonst meldet er FAIL bei korrektem Verhalten: genau das ist am 20.09. passiert.
const erwartet = TIER * 100 + SCHWELLEN_BONUS_CENTS;
if (paid.credits_cents !== erwartet || bal.balance_cents < erwartet || !paid.tx_hash) {
  console.error(`MAINNET FAIL: erwartet ${erwartet} Cent, bekam ${paid.credits_cents}, tx=${paid.tx_hash}`);
  process.exit(1);
}
console.log(`MAINNET OK tier=${TIER} credits_cents=${paid.credits_cents} tx=${paid.tx_hash} basescan=https://basescan.org/tx/${paid.tx_hash}`);
