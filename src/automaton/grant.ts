/**
 * Credit for the check `automaton` of `ops/live.sh` (goals/sandbox/08, point 8): after every rollout it creates a hosted
 * automaton on the own live account (src/bounties/ours.ts), waits for its first turn, reads its log and deletes it, so every
 * rollout costs one such run: sandbox steps and the inference of the first turns.
 *
 * The amount is the measured cost of one run without reboot times 300 (about a month of rollouts), rounded up to 10000 mc and
 * at most 500000 mc; measurement, command and sum in docs/sandbox/automaton.md. One internal credit, booked by code that runs
 * with the rollout like src/sandbox/grant.ts and never by SQL by hand, idempotent over the ref `grant:live-automaton` and the
 * unique index on internal grants. Kind `internal_grant`, never drawn from the starter pot. Moving credit to our own account is
 * no wallet movement and no payout (loop-constraints.md, rule 10). Booked only where the account exists (production).
 */
import { postLedger, type Db } from "../db.js";
import { LIVE_SANDBOX_ADDRESS } from "../bounties/ours.js";

/** The cost of one run of the check without reboot, in mc, measured against production (docs/sandbox/automaton.md). */
export const LIVE_AUTOMATON_RUN_MC = 11_000;
export const LIVE_AUTOMATON_RUNS = 300;
export const LIVE_AUTOMATON_MAX_MC = 500_000;

/** runMc times 300, rounded up to 10000 mc, at most 500000 mc. */
export function liveAutomatonGrantMc(runMc: number): number {
  const raw = Math.ceil((Math.max(0, runMc) * LIVE_AUTOMATON_RUNS) / 10_000) * 10_000;
  return Math.min(LIVE_AUTOMATON_MAX_MC, raw);
}

export const LIVE_AUTOMATON_GRANT = { ref: "grant:live-automaton", mc: liveAutomatonGrantMc(LIVE_AUTOMATON_RUN_MC) } as const;

export type GrantOutcome = { granted: true } | { granted: false; reason: "already_granted" | "no_account" };

export function grantLiveAutomaton(db: Db, address: string = LIVE_SANDBOX_ADDRESS): GrantOutcome {
  return db.transaction((): GrantOutcome => {
    if (db.prepare("SELECT 1 FROM ledger WHERE kind = 'internal_grant' AND ref = ?").get(LIVE_AUTOMATON_GRANT.ref)) {
      return { granted: false, reason: "already_granted" };
    }
    if (!db.prepare("SELECT 1 FROM wallets WHERE address = ?").get(address.toLowerCase())) return { granted: false, reason: "no_account" };
    postLedger(db, {
      address,
      kind: "internal_grant",
      deltaMc: LIVE_AUTOMATON_GRANT.mc,
      ref: LIVE_AUTOMATON_GRANT.ref,
      meta: { reason: "live-automaton: credit of the own live check of the automaton routes" },
    });
    return { granted: true };
  })();
}
