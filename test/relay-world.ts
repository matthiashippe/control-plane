/**
 * What the relay tests share (goals/relay/01): an app on an in-memory database, wallets made with
 * generatePrivateKey, and the two signatures exactly as the runtime at the pin makes them
 * (signSendPayload and signPollPayload in src/social/signing.ts, docs/relay/vertrag.md).
 */
import { randomBytes } from "node:crypto";
import { keccak256, toBytes } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger, type Db } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { mintKeylessIdentity } from "../src/auth/keyless.js";

export interface World {
  db: Db;
  app: ReturnType<typeof createApp>;
  /** Moves the app's clock; starts at the real time. */
  setNow(d: Date): void;
}

export function world(): World {
  const db = openDb(":memory:");
  let now: Date | null = null;
  const app = createApp({ db, now: () => now ?? new Date() });
  return { db, app, setNow: (d) => (now = d) };
}

export const wallet = (): PrivateKeyAccount => privateKeyToAccount(generatePrivateKey());
export const addr = (a: PrivateKeyAccount): string => a.address.toLowerCase();

/** The body of POST /v1/messages as signSendPayload of the runtime builds it. */
export async function signedSend(
  from: PrivateKeyAccount,
  to: string,
  content: string,
  opts: { signedAt?: string; replyTo?: string; signer?: PrivateKeyAccount } = {},
): Promise<Record<string, unknown>> {
  const signedAt = opts.signedAt ?? new Date().toISOString();
  const normalizedTo = to.toLowerCase();
  const canonical = `Conway:send:${normalizedTo}:${keccak256(toBytes(content))}:${signedAt}`;
  const signature = await (opts.signer ?? from).signMessage({ message: canonical });
  return { from: addr(from), to: normalizedTo, content, signed_at: signedAt, signature, reply_to: opts.replyTo };
}

/** The three headers of poll and count as signPollPayload of the runtime builds them. */
export async function pollHeaders(
  who: PrivateKeyAccount,
  opts: { timestamp?: string; signer?: PrivateKeyAccount } = {},
): Promise<Record<string, string>> {
  const timestamp = opts.timestamp ?? new Date().toISOString();
  const address = addr(who);
  const signature = await (opts.signer ?? who).signMessage({ message: `Conway:poll:${address}:${timestamp}` });
  return { "X-Wallet-Address": address, "X-Signature": signature, "X-Timestamp": timestamp };
}

export function send(w: World, body: unknown, headers: Record<string, string> = {}) {
  return w.app.request("/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export function poll(w: World, headers: Record<string, string>, body: Record<string, unknown> = {}) {
  return w.app.request("/v1/messages/poll", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

export function count(w: World, headers: Record<string, string>) {
  return w.app.request("/v1/messages/count", { headers });
}

/** Credit for an address, as one topup row. */
export function credit(w: World, address: string, mc: number): void {
  postLedger(w.db, { address, kind: "topup", deltaMc: mc, ref: `test-${randomBytes(6).toString("hex")}` });
}

/** An API key for an existing address (as SIWE would give one). */
export function keyFor(w: World, address: string): string {
  const key = `cnwy_k_${randomBytes(16).toString("hex")}`;
  w.db
    .prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(address, hashApiKey(key), key.slice(0, 15), "t", new Date().toISOString());
  return key;
}

/** An account without a wallet, `key:` and 40 hex. */
export function keyless(w: World): { address: string; key: string } {
  const { address, key } = mintKeylessIdentity(w.db, "relay-test");
  return { address, key };
}

export function relayRows(w: World, address?: string): { delta_mc: number; ref: string }[] {
  return (
    address
      ? w.db.prepare("SELECT delta_mc, ref FROM ledger WHERE kind = 'relay' AND address = ? ORDER BY id").all(address)
      : w.db.prepare("SELECT delta_mc, ref FROM ledger WHERE kind = 'relay' ORDER BY id").all()
  ) as { delta_mc: number; ref: string }[];
}

export function messageCount(w: World): number {
  return (w.db.prepare("SELECT count(*) AS n FROM relay_messages").get() as { n: number }).n;
}
