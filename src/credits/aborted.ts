/**
 * Credit for inference calls that were charged although their answer never reached the client.
 *
 * On 2026-11-10 a foreign automaton ran three calls to /v1/chat/completions into its own 60 second
 * timeout (Caddy logged status 0 after 59.9 s each), and the proxy charged all three anyway,
 * because it booked as soon as the provider answered. Matthias decided the same day: answers that
 * do not arrive are not charged, and what was charged that way goes back as an internal credit.
 * One ledger row, never a payout, never on chain (loop-constraints.md, rules 6 and 10).
 *
 * The batch names the charges by their `ref` (the generation id at the provider) and their sum,
 * measured read-only in production on 2026-11-10. The address is not written down anywhere in the
 * repo: it is taken from the charges themselves, which is also the guard against crediting the
 * wrong wallet. Runs on every start (openDb), so it lands with the rollout and not as SQL by hand;
 * the fixed `key` and a unique index make a second start or a second rollout a no-op.
 */

import { postLedger, type Db } from "../db.js";

export interface AbortedBatch {
  /** Idempotency key, stored as the `ref` of the refund row. */
  key: string;
  /** `ref` of every inference charge this batch gives back. */
  refs: readonly string[];
  /** Their sum in mc. A mismatch means the rows are not the ones measured, and nothing is booked. */
  totalMc: number;
  reason: string;
}

export const ABORTED_2026_11_10: AbortedBatch = {
  key: "refund:client-aborted-2026-11-10",
  refs: [
    "gen-1794288298-yWUHf9MpFBbR93vpJ7ET",
    "gen-1794288946-oKnNy3iW6PaglDoYV2tH",
    "gen-1794289014-dNsPPbkW0sMRJPZnCbiA",
  ],
  totalMc: 61_644,
  reason: "client_aborted_before_answer",
};

export type CreditOutcome =
  | { credited: true; deltaMc: number }
  | { credited: false; reason: "already_credited" | "charges_missing" | "several_addresses" | "sum_mismatch" };

/** Books the credit for one batch, at most once. Safe to call on every start. */
export function creditAbortedCharges(db: Db, batch: AbortedBatch = ABORTED_2026_11_10): CreditOutcome {
  const run = db.transaction((): CreditOutcome => {
    const done = db.prepare("SELECT 1 FROM ledger WHERE kind = 'refund' AND ref = ?").get(batch.key);
    if (done) return { credited: false, reason: "already_credited" };

    const marks = batch.refs.map(() => "?").join(", ");
    const rows = db
      .prepare(`SELECT address, delta_mc, ref FROM ledger WHERE kind = 'inference' AND ref IN (${marks})`)
      .all(...batch.refs) as { address: string; delta_mc: number; ref: string }[];
    if (rows.length !== batch.refs.length || new Set(rows.map((r) => r.ref)).size !== batch.refs.length) {
      return { credited: false, reason: "charges_missing" };
    }
    const addresses = new Set(rows.map((r) => r.address));
    if (addresses.size !== 1) return { credited: false, reason: "several_addresses" };

    const charged = rows.reduce((sum, r) => sum - r.delta_mc, 0);
    if (charged !== batch.totalMc) return { credited: false, reason: "sum_mismatch" };

    postLedger(db, {
      address: [...addresses][0],
      kind: "refund",
      deltaMc: charged,
      ref: batch.key,
      meta: { reason: batch.reason, refs: [...batch.refs], charged_mc: charged },
    });
    return { credited: true, deltaMc: charged };
  });
  return run();
}

/** The start-up step: every known batch, with one log line for what happened. */
export function creditAbortedOnStart(db: Db, batches: readonly AbortedBatch[] = [ABORTED_2026_11_10]): void {
  for (const batch of batches) {
    const out = creditAbortedCharges(db, batch);
    if (out.credited) {
      console.log(`[credits] ${batch.key}: credited ${out.deltaMc} mc for ${batch.refs.length} aborted calls`);
    } else if (out.reason === "several_addresses" || out.reason === "sum_mismatch") {
      // Only these two point at a problem; a database without the charges (tests, harness, a fresh
      // install) and an earlier credit are the normal cases and stay quiet.
      console.error(`[credits] ${batch.key}: not credited (${out.reason}); the charges are not the ones measured`);
    }
  }
}
