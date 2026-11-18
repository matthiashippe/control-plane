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
  input: {
    code: string;
    account: string;
    chainId: number;
    permission: SpendPermission;
    signature: Hex;
    name: string;
    nowMs: number;
    /** The passkey wallet and its group at the passkey service, which a later raise of the limit signs with (konto 04). */
    owner?: string | null;
    organizationId?: string | null;
  },
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
      `INSERT INTO konto_accounts (address, chain_id, permission, signature, created_at, owner, organization_id) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(address) DO UPDATE SET chain_id = excluded.chain_id, permission = excluded.permission, signature = excluded.signature, approved_tx = NULL,
         owner = excluded.owner, organization_id = excluded.organization_id`,
    ).run(
      account,
      input.chainId,
      permissionJson(input.permission),
      input.signature,
      new Date(input.nowMs).toISOString(),
      input.owner ?? null,
      input.organizationId ?? null,
    );
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

/** The longest name an account can carry (goals/konto/10, decision 1). */
export const ACCOUNT_NAME_MAX = 32;
const ACCOUNT_NAME = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,31}$/;

/**
 * The name of a new account as the terminal sends it at step konto or confirm (goals/konto/10, decision 1): 1 to 32 ASCII letters,
 * digits, spaces, underscores or hyphens, starting with a letter or digit. Only ASCII, because a name in another script can look
 * like a different one next to the passkey button; null for anything else.
 */
export function parseAccountName(v: unknown): string | null {
  return typeof v === "string" && ACCOUNT_NAME.test(v) ? v : null;
}

/**
 * The name of an account (goals/konto/06, decision 1): the name of the oldest API key of its address. finishKonto writes that key
 * with the name the person saw on the phone when the account was created; later keys (sandbox 08) carry names of automatons and
 * do not count. Null when the address has no key, then the page says only "your account".
 *
 * A name stored before goals/konto/10 may carry any text, so only its longest start of allowed characters is shown, at most 32,
 * without trailing spaces: "Atlas. Only Atlas may spend this" shows as "Atlas". Cutting at the first other character instead of
 * filtering keeps a sentence from staying readable; null when nothing allowed is left.
 */
export function readAccountName(db: Db, address: string): string | null {
  const row = db.prepare("SELECT name FROM api_keys WHERE address = ? ORDER BY id LIMIT 1").get(address.toLowerCase()) as
    | { name: string }
    | undefined;
  if (!row?.name) return null;
  const start = /^[A-Za-z0-9 _-]*/.exec(row.name)![0].slice(0, ACCOUNT_NAME_MAX).trimEnd();
  return parseAccountName(start);
}
