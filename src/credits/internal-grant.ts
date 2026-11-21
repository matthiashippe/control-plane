/**
 * One internal credit to an account of ours, booked by code that runs with the rollout and never by SQL by hand. The credits
 * of the own live checks (src/sandbox/grant.ts, src/automaton/grant.ts) book through here, so a fix to their idempotency lands
 * in both at once.
 *
 * Idempotent over `ref`: the row with that ref is looked for in the same transaction before anything is booked, so a second
 * start or a second rollout answers `already_granted` instead of running into the unique index on internal grants
 * (src/db.ts). The ref and amount of an existing credit never change: in production the ref alone decides whether a start
 * books, so a new ref would book the credit a second time.
 *
 * The kind is always `internal_grant` and never an argument, because a credit of kind `grant` would be drawn from the starter
 * pot. Booked only where the account exists. Moving credit to our own account is no wallet movement and no payout
 * (loop-constraints.md, rule 10).
 */

import { postLedger, type Db } from "../db.js";

export type GrantOutcome = { granted: true } | { granted: false; reason: "already_granted" | "no_account" };

export interface InternalGrant {
  /** Idempotency key, stored as the `ref` of the ledger row. */
  ref: string;
  /** Amount in mc, an integer. */
  mc: number;
  /** Stored as `meta.reason`. */
  reason: string;
}

export function grantInternal(db: Db, grant: InternalGrant, address: string): GrantOutcome {
  return db.transaction((): GrantOutcome => {
    if (db.prepare("SELECT 1 FROM ledger WHERE kind = 'internal_grant' AND ref = ?").get(grant.ref)) {
      return { granted: false, reason: "already_granted" };
    }
    if (!db.prepare("SELECT 1 FROM wallets WHERE address = ?").get(address.toLowerCase())) return { granted: false, reason: "no_account" };
    postLedger(db, {
      address,
      kind: "internal_grant",
      deltaMc: grant.mc,
      ref: grant.ref,
      meta: { reason: grant.reason },
    });
    return { granted: true };
  })();
}
