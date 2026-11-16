// goals/konto/03, point 10: reads, only reading, the Turnkey sub-organization of the account of the run on Base Sepolia and
// prints `turnkey ok passkey=<n> owner=<0|1>`: n passkeys of its users, and owner=1 when one of its wallets holds the address
// `besitzer` of docs/konto/sepolia.md (the owner of the smart wallet).
//
//   node ops/konto/turnkey-check.mjs [--besitzer 0x…]
//
// The API key of our Turnkey organization comes from ~/brain/connectors/secrets.env (TURNKEY_ORGANIZATION_ID,
// TURNKEY_API_PUBLIC_KEY, TURNKEY_API_PRIVATE_KEY) and is never printed. Only query endpoints are called; a parent organization
// reads its sub-organizations, it cannot change them.
import { createPrivateKey, ECDH, sign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAddress } from "viem";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SECRETS = path.join(os.homedir(), "brain/connectors/secrets.env");
const API = "https://api.turnkey.com";
const die = (line) => { console.error(`turnkey: ${line}`); process.exit(1); };

function secret(name) {
  if (!existsSync(SECRETS)) die(`${SECRETS} missing`);
  const line = readFileSync(SECRETS, "utf8").split("\n").find((l) => l.startsWith(`${name}=`));
  const value = line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
  if (!value) die(`${name} missing in secrets.env`);
  return value;
}

function besitzer() {
  const i = process.argv.indexOf("--besitzer");
  if (i > 0) return process.argv[i + 1] ?? "";
  const doc = path.join(ROOT, "docs/konto/sepolia.md");
  if (!existsSync(doc)) die("docs/konto/sepolia.md missing; run ops/konto/sepolia-run.mjs first");
  const m = readFileSync(doc, "utf8").match(/^besitzer: (0x[0-9a-fA-F]{40})$/m);
  return m ? m[1] : "";
}

const owner = besitzer().toLowerCase();
if (!/^0x[0-9a-f]{40}$/.test(owner)) die("no besitzer address");
const organizationId = secret("TURNKEY_ORGANIZATION_ID");
const publicKey = secret("TURNKEY_API_PUBLIC_KEY");
const raw = ECDH.convertKey(publicKey, "prime256v1", "hex", "buffer", "uncompressed");
const key = createPrivateKey({
  key: {
    kty: "EC", crv: "P-256",
    d: Buffer.from(secret("TURNKEY_API_PRIVATE_KEY").padStart(64, "0"), "hex").toString("base64url"),
    x: raw.subarray(1, 33).toString("base64url"), y: raw.subarray(33).toString("base64url"),
  },
  format: "jwk",
});

/** One query to Turnkey, stamped with our API key (DER ECDSA over SHA-256 of the body). */
async function query(name, body) {
  const text = JSON.stringify(body);
  const stamp = { publicKey, scheme: "SIGNATURE_SCHEME_TK_API_P256", signature: sign("sha256", Buffer.from(text), { key, dsaEncoding: "der" }).toString("hex") };
  const res = await fetch(`${API}/public/v1/query/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Stamp": Buffer.from(JSON.stringify(stamp)).toString("base64url") },
    body: text,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) die(`${name}: ${res.status} ${data && data.message ? String(data.message).slice(0, 160) : ""}`);
  return data;
}

const { organizationIds } = await query("list_suborgs", { organizationId, filterType: "WALLET_ACCOUNT_ADDRESS", filterValue: getAddress(owner) });
// Turnkey compares addresses case-sensitively, in the checksummed form its wallets carry.
if (!Array.isArray(organizationIds) || organizationIds.length !== 1) die(`expected one sub-organization for the owner, found ${organizationIds?.length ?? 0}`);
const sub = organizationIds[0];
const { users } = await query("list_users", { organizationId: sub });
const passkeys = (users ?? []).reduce((n, u) => n + (u.authenticators?.length ?? 0), 0);
const { wallets } = await query("list_wallets", { organizationId: sub });
let held = 0;
for (const w of wallets ?? []) {
  const { accounts } = await query("list_wallet_accounts", { organizationId: sub, walletId: w.walletId });
  if ((accounts ?? []).some((a) => String(a.address).toLowerCase() === owner)) held = 1;
}
console.log(`turnkey: sub-organization of the owner found, ${users?.length ?? 0} user, ${wallets?.length ?? 0} wallet`);
console.log(`turnkey ok passkey=${passkeys} owner=${held}`);
