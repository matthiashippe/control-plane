/**
 * The API key of one hosted automaton (goals/sandbox/08, decision 4): a key of the account the sandbox belongs to, named
 * `automaton:<id>`, in the same format and with the same hash as `createApiKey` in src/auth/siwe.ts (which stays unchanged,
 * because it needs a SIWE session). The key in clear goes only into the setup file inside the sandbox; here only its hash
 * stays. A key with this name cannot create another automaton (403 on POST /v1/automatons), so an automaton cannot multiply
 * itself; deleting the automaton revokes it (`revoked_at`).
 */
import { randomBytes } from "node:crypto";
import { hashApiKey } from "../auth/siwe.js";
import type { Db } from "../db.js";

export const AUTOMATON_KEY_PREFIX = "automaton:";

/** The name of the key of automaton `id`. */
export const automatonKeyName = (id: string): string => `${AUTOMATON_KEY_PREFIX}${id}`;

/** Makes the key of automaton `id` for `address`; returns it in clear, the only moment it exists so. */
export function createAutomatonKey(db: Db, address: string, id: string, now = Date.now()): { key: string; keyId: number } {
  const key = `cnwy_k_${randomBytes(16).toString("hex")}`;
  const info = db
    .prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(address.toLowerCase(), hashApiKey(key), key.slice(0, "cnwy_k_".length + 8), automatonKeyName(id), new Date(now).toISOString());
  return { key, keyId: Number(info.lastInsertRowid) };
}

/** True when the raw key from an Authorization header (with or without `Bearer `) is the key of a hosted automaton. */
export function isAutomatonKey(db: Db, rawKey: string | undefined): boolean {
  if (!rawKey) return false;
  const key = rawKey.startsWith("Bearer ") ? rawKey.slice(7) : rawKey;
  if (!key.startsWith("cnwy_k_")) return false;
  const row = db.prepare("SELECT name FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL").get(hashApiKey(key)) as
    | { name: string }
    | undefined;
  return !!row && row.name.startsWith(AUTOMATON_KEY_PREFIX);
}

/** Revokes the key of automaton `id`; a second call changes nothing. */
export function revokeAutomatonKey(db: Db, address: string, id: string, now = Date.now()): void {
  db.prepare("UPDATE api_keys SET revoked_at = ? WHERE address = ? AND name = ? AND revoked_at IS NULL").run(
    new Date(now).toISOString(),
    address.toLowerCase(),
    automatonKeyName(id),
  );
}
