/**
 * The end of the konto step (goals/konto/03, docs/konto/konto.md "Ablauf"): a matched handoff becomes `done` with the smart wallet
 * as its account and a fresh API key, or `burned` when the permission is refused.
 *
 * The identity of the account is the address of the smart wallet in `wallets`, so that what a service with payTo on it earns and
 * the credits hang on the same address the person owns. The API key comes from createApiKey in src/auth/siwe.ts (imported, not
 * changed) and is stored as its hash there; the handoff row holds it in clear only until the terminal's stream has read it once.
 */
import { randomBytes } from "node:crypto";
import type { Hex } from "viem";
import { createApiKey } from "../auth/siwe.js";
import { ensureWallet, type Db } from "../db.js";
import type { SpendPermission } from "./permission.js";

/** The permission as JSON, numbers as strings, so a bigint never loses a digit on the way into the row and back. */
export function permissionJson(p: SpendPermission): string {
  return JSON.stringify({ ...p, allowance: String(p.allowance), salt: String(p.salt) });
}

export function permissionFromJson(s: string): SpendPermission {
  const o = JSON.parse(s) as Record<string, unknown>;
  return { ...(o as unknown as SpendPermission), allowance: BigInt(o.allowance as string), salt: BigInt(o.salt as string) };
}

/**
 * Turns a matched handoff `done` in one transaction: wallet, account row, API key, handoff. Returns false when the handoff was no
 * longer matched (a second tap that lost the race, or the ten minutes ran out in between); then nothing was written.
 */
export function finishKonto(
  db: Db,
  input: { code: string; account: string; chainId: number; permission: SpendPermission; signature: Hex; name: string; nowMs: number },
): boolean {
  return db.transaction((): boolean => {
    const row = db.prepare("SELECT state FROM handoffs WHERE code = ?").get(input.code) as { state: string } | undefined;
    if (row?.state !== "matched") return false;
    const account = input.account.toLowerCase();
    ensureWallet(db, account);
    // createApiKey issues a key for a session; this session lives only inside this transaction.
    const session = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions (token, address, expires_at) VALUES (?, ?, ?)").run(session, account, input.nowMs + 60_000);
    const { key } = createApiKey(db, session, input.name, input.nowMs);
    db.prepare("DELETE FROM sessions WHERE token = ?").run(session);
    db.prepare(
      `INSERT INTO konto_accounts (address, chain_id, permission, signature, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(address) DO UPDATE SET chain_id = excluded.chain_id, permission = excluded.permission, signature = excluded.signature, approved_tx = NULL`,
    ).run(account, input.chainId, permissionJson(input.permission), input.signature, new Date(input.nowMs).toISOString());
    const changed = db
      .prepare("UPDATE handoffs SET state = 'done', account = ?, api_key = ?, updated_at = ? WHERE code = ? AND state = 'matched'")
      .run(account, key, input.nowMs, input.code).changes;
    if (changed !== 1) throw new Error("handoff changed during finishKonto");
    return true;
  })();
}

/** A refused permission burns the handoff, like a wrong number: the terminal then starts a new one. */
export function burnMatched(db: Db, code: string, nowMs: number): void {
  db.prepare("UPDATE handoffs SET state = 'burned', updated_at = ? WHERE code = ? AND state = 'matched'").run(nowMs, code);
}

/** The API key in clear, exactly once: the first caller gets it and the row forgets it in the same transaction. */
export function takeApiKey(db: Db, code: string): string | null {
  return db.transaction((): string | null => {
    const row = db.prepare("SELECT api_key FROM handoffs WHERE code = ?").get(code) as { api_key: string | null } | undefined;
    if (!row?.api_key) return null;
    db.prepare("UPDATE handoffs SET api_key = NULL WHERE code = ?").run(code);
    return row.api_key;
  })();
}
