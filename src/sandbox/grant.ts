/**
 * Credit for the own account of the live check (`ops/live.sh`, check `sandbox`): it creates a small
 * sandbox after every rollout, runs `echo ok` in it and deletes it, so it needs a few hundred mc.
 *
 * One internal credit of 100000 mc, booked by code that runs with the rollout (like the credit of
 * abrechnung 01, src/credits/aborted.ts) and never by SQL by hand. Idempotent over the ref
 * `grant:live-sandbox` and a unique index. Kind `internal_grant`, so it is not drawn from the
 * starter pot (kind `grant`), and the address is ours (src/bounties/ours.ts), so it is in no count
 * of foreign accounts. Moving credit to our own account is no wallet movement and no payout
 * (loop-constraints.md, rule 10).
 *
 * Booked only once the account exists, which it does in production (provisioned 2026-11-12) and in
 * no test database and no harness: there the step does nothing.
 */

import { postLedger, type Db } from "../db.js";
import { LIVE_SANDBOX_ADDRESS } from "../bounties/ours.js";

export const LIVE_SANDBOX_GRANT = { ref: "grant:live-sandbox", mc: 100_000 } as const;

export type GrantOutcome = { granted: true } | { granted: false; reason: "already_granted" | "no_account" };

export function grantLiveSandbox(db: Db, address: string = LIVE_SANDBOX_ADDRESS): GrantOutcome {
  return db.transaction((): GrantOutcome => {
    if (db.prepare("SELECT 1 FROM ledger WHERE kind = 'internal_grant' AND ref = ?").get(LIVE_SANDBOX_GRANT.ref)) {
      return { granted: false, reason: "already_granted" };
    }
    if (!db.prepare("SELECT 1 FROM wallets WHERE address = ?").get(address.toLowerCase())) return { granted: false, reason: "no_account" };
    postLedger(db, {
      address,
      kind: "internal_grant",
      deltaMc: LIVE_SANDBOX_GRANT.mc,
      ref: LIVE_SANDBOX_GRANT.ref,
      meta: { reason: "live-sandbox: credit of the own live check of the sandbox API" },
    });
    return { granted: true };
  })();
}
