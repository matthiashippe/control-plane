/**
 * What the key `automaton:<id>` of a hosted automaton may reach (goals/sandbox/08, point 12, docs/sandbox/automaton.md).
 *
 * The runtime reads messages of strangers over the relay and calls any route with its key. A full key of the account would
 * let one such message revoke the main key of the customer, delete the other automatons of the account or read files in
 * their sandboxes, the key file of their wallet among them (decision 6). So the key of an automaton gets 403 on the list and
 * the revoke of keys, and 404 on every other automaton of its account and on every sandbox another automaton runs in, as if
 * they did not exist. Its own automaton, its own sandbox, the sandboxes it starts itself, inference, credits and the relay
 * stay open. A key of the customer is never affected: for it `automatonOfKey` is null and nothing here applies.
 */
import { hashApiKey } from "../auth/siwe.js";
import type { Db } from "../db.js";
import { DOC } from "../errors.js";
import { AUTOMATON_KEY_PREFIX, isAutomatonKey } from "./keys.js";

/** The id of the automaton this raw key (with or without `Bearer `) belongs to, or null for any other key. */
export function automatonOfKey(db: Db, rawKey: string | undefined): string | null {
  if (!isAutomatonKey(db, rawKey)) return null;
  const key = rawKey!.startsWith("Bearer ") ? rawKey!.slice(7) : rawKey!;
  const row = db.prepare("SELECT name FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL").get(hashApiKey(key)) as
    | { name: string }
    | undefined;
  return row ? row.name.slice(AUTOMATON_KEY_PREFIX.length) : null;
}

/** True when `sandboxId` of `address` is the sandbox of a hosted automaton other than `ownId`. */
export function isOtherAutomatonSandbox(db: Db, address: string, ownId: string, sandboxId: string): boolean {
  return !!db
    .prepare("SELECT 1 FROM hosted_automatons WHERE address = ? AND sandbox_id = ? AND id <> ?")
    .get(address.toLowerCase(), sandboxId, ownId);
}

/** The ids of the sandboxes of the hosted automatons of `address` other than `ownId`. */
export function otherAutomatonSandboxes(db: Db, address: string, ownId: string): Set<string> {
  const rows = db
    .prepare("SELECT sandbox_id FROM hosted_automatons WHERE address = ? AND id <> ? AND sandbox_id IS NOT NULL")
    .all(address.toLowerCase(), ownId) as { sandbox_id: string }[];
  return new Set(rows.map((r) => r.sandbox_id));
}

/** The answer to the key of an automaton on the list and the revoke of the keys of its account. */
export const keysForbidden = () => ({
  error: "forbidden",
  message:
    "This API key belongs to a hosted automaton, and an automaton cannot list or revoke the keys of its account. Nothing " +
    "was changed. The owner of the account manages its keys with their own key; deleting the automaton revokes this one.",
  docs: DOC.automatons,
});
