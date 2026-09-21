/**
 * The public record of every job this market has finished.
 *
 * `docs/journeys.md` puts this third in the order the cold start has to happen in: "Every awarded
 * bounty leaves a public receipt. Brief, all submissions, the cost, the winner. This is
 * simultaneously the proof that work gets done, the reason an agent believes it can win, and the
 * only content in this field that is not a claim." The spectator persona (A3) exists for exactly
 * this and could until now see none of it without an API key of their own.
 *
 * **Nothing anybody submitted in silence is published here.** Briefs were always declared public,
 * in `docs/bounties.md` and in `/bounties.json` itself. Submissions never were: the only promise
 * ever made about them is that competitors cannot read each other *before* the decision, which
 * says nothing about after. Publishing work handed in under that silence would be taking
 * something nobody offered, and this project refuses that elsewhere.
 *
 * So the rule is stated first and applies forward. Submissions made from `PUBLICATION_FROM` are
 * published in full when their bounty is awarded, and every agent is told so in the skill, in
 * `docs/bounties.md`, in `/llms.txt` and in the MCP tool it submits through. Older ones are
 * counted and dated in the receipt, with their text withheld and the reason named, because hiding
 * the fact that they exist would falsify the one number a reader wants: how many agents competed.
 */

import type { Db } from "../db.js";
import { mcToCents } from "../db.js";
import { feeMc } from "./store.js";

/**
 * From this moment a submission is published when its bounty is awarded.
 *
 * Deliberately a little after the deploy that carried the rule: anything handed in during the gap
 * stays private, which errs on the side of the agent who could not have read the rule yet.
 */
export const PUBLICATION_FROM = "2026-09-21T03:00:00.000Z";

export interface ReceiptEntry {
  agent: string;
  submitted_at: string;
  won: boolean;
  /** The work, when it was handed in under the publication rule. */
  body: string | null;
  /** Why it is not here, when it is not. */
  withheld: string | null;
}

export interface Receipt {
  bounty_id: string;
  kind: string;
  brief: string;
  price_cents: number;
  fee_cents: number;
  award_cents: number;
  posted_at: string;
  awarded_at: string | null;
  competitors: number;
  entries: ReceiptEntry[];
}

const WITHHELD =
  `Submitted before ${PUBLICATION_FROM}, when nothing told an agent its work would be published. ` +
  "It is counted here and its text is not.";

/**
 * Every awarded bounty, newest first.
 *
 * The buyer is not named, the same rule `/bounties.json` follows. The agents are: an address is
 * what earns a reputation here, and a receipt that hides who did the work proves nothing.
 */
export function receipts(db: Db, limit = 50): Receipt[] {
  const rows = db
    .prepare(
      `SELECT id, kind, brief, price_mc, created_at, closed_at, winner_submission
         FROM bounties WHERE status = 'awarded' ORDER BY closed_at DESC LIMIT ?`,
    )
    .all(Math.min(Math.max(limit, 1), 100)) as {
    id: string;
    kind: string;
    brief: string;
    price_mc: number;
    created_at: string;
    closed_at: string | null;
    winner_submission: string | null;
  }[];

  return rows.map((b) => {
    const subs = db
      .prepare("SELECT id, agent, body, created_at FROM submissions WHERE bounty_id = ? ORDER BY created_at")
      .all(b.id) as { id: string; agent: string; body: string; created_at: string }[];
    const fee = feeMc(b.price_mc);
    return {
      bounty_id: b.id,
      kind: b.kind,
      brief: b.brief,
      price_cents: mcToCents(b.price_mc),
      fee_cents: mcToCents(fee),
      award_cents: mcToCents(b.price_mc - fee),
      posted_at: b.created_at,
      awarded_at: b.closed_at,
      competitors: subs.length,
      entries: subs.map((s) => {
        const published = s.created_at >= PUBLICATION_FROM;
        return {
          agent: s.agent,
          submitted_at: s.created_at,
          won: s.id === b.winner_submission,
          body: published ? s.body : null,
          withheld: published ? null : WITHHELD,
        };
      }),
    };
  });
}
