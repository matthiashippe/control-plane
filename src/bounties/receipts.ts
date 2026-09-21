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
 *
 * The operator's own agents are the one exception, added on 2026-09-21. The withholding is a
 * promise kept to a stranger, and we have nothing to promise ourselves. Leaving it on our own rows
 * was worse than pointless: the only paid receipt on this market was won by our own first-cycle
 * agent on 20.09., and the page presented it as an author whose rights were being respected, which
 * reads as a stranger and is the opposite of what the row is.
 */

import type { Db } from "../db.js";
import { mcToCents } from "../db.js";
import { feeMc } from "./store.js";
import { ourAddresses } from "./ours.js";

/**
 * From this moment a submission is published when its bounty is awarded.
 *
 * Deliberately a little after the deploy that carried the rule: anything handed in during the gap
 * stays private, which errs on the side of the agent who could not have read the rule yet.
 */
export const PUBLICATION_FROM = "2026-09-21T03:00:00.000Z";

/**
 * The same moment as a number, because the rule is about time and not about text.
 *
 * Comparing the two ISO strings directly is what this did until 2026-09-21, and it agrees with the
 * clock only as long as every row was written by `new Date().toISOString()` here. A row carrying
 * any other shape of timestamp is sorted rather than dated: `2026-09-21T04:00:00+05:00` is two
 * hours *before* the rule existed and sorts after it, which would publish work handed in under the
 * silence, and a row this service cannot date at all sorted after everything and was published
 * outright. Both are the one mistake this file exists to prevent, so the comparison happens on the
 * timeline. `Date.parse` of an unreadable value is NaN, and every comparison against NaN is false,
 * so the unreadable case withholds rather than guesses.
 */
const PUBLICATION_FROM_MS = Date.parse(PUBLICATION_FROM);

export interface ReceiptEntry {
  /** Null while the work is withheld: that agent never agreed to be named either. */
  agent: string | null;
  submitted_at: string;
  won: boolean;
  /** The work, when it was handed in under the publication rule. */
  body: string | null;
  /** Why it is not here, when it is not. */
  withheld: string | null;
  /** The operator's own agent. Published whatever the date, and marked as ours wherever it shows. */
  ours: boolean;
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
 * A reason of its own, because the public receipt must not claim a fact it does not hold. Saying
 * "submitted before the rule" about a row whose timestamp cannot be read would be a date this
 * service invented, on the one page a reader has no way to check.
 */
const WITHHELD_UNDATED =
  "This submission carries a timestamp this service cannot read, so it cannot be shown to fall " +
  `under the publication rule of ${PUBLICATION_FROM}. It is counted here and its text is not.`;

/**
 * Every awarded bounty, newest first.
 *
 * The buyer is not named, the same rule `/bounties.json` follows. The agents are: an address is
 * what earns a reputation here, and a receipt that hides who did the work proves nothing.
 */
export function receipts(db: Db, limit = 50): Receipt[] {
  // `award_mc` comes from the booking, not from the price: the fee only exists when the instance
  // has an operator address configured, and it did not exist at all before 2026-09-20. Recomputing
  // it from `price_mc` made the receipt claim a deduction that never happened, on exactly the
  // public page a reader has no way to check against a balance of their own.
  const rows = db
    .prepare(
      `SELECT b.id, b.kind, b.brief, b.price_mc, b.created_at, b.closed_at, b.winner_submission,
              (SELECT sum(l.delta_mc) FROM ledger l
                WHERE l.kind = 'bounty_award' AND l.ref = 'bounty-award:' || b.id) AS award_mc
         FROM bounties b WHERE b.status = 'awarded' ORDER BY b.closed_at DESC LIMIT ?`,
    )
    .all(Math.min(Math.max(limit, 1), 100)) as {
    id: string;
    kind: string;
    brief: string;
    price_mc: number;
    created_at: string;
    closed_at: string | null;
    winner_submission: string | null;
    award_mc: number | null;
  }[];

  // Every agent on every receipt, asked once. See `src/bounties/ours.ts`.
  const alleAgenten = db
    .prepare(
      `SELECT DISTINCT agent FROM submissions WHERE bounty_id IN (${rows.map(() => "?").join(",") || "''"})`,
    )
    .all(...rows.map((b) => b.id)) as { agent: string }[];
  const unsere = ourAddresses(db, alleAgenten.map((a) => a.agent));

  return rows.map((b) => {
    const subs = db
      .prepare("SELECT id, agent, body, created_at FROM submissions WHERE bounty_id = ? ORDER BY created_at")
      .all(b.id) as { id: string; agent: string; body: string; created_at: string }[];
    // No booking to read means a row older than the ledger it should have written, which cannot
    // happen through any path here; the computed fee is the honest fallback rather than a zero
    // that would read as "the winner got everything".
    const award = b.award_mc ?? b.price_mc - feeMc(b.price_mc);
    const fee = b.price_mc - award;
    return {
      bounty_id: b.id,
      kind: b.kind,
      brief: b.brief,
      price_cents: mcToCents(b.price_mc),
      fee_cents: mcToCents(fee),
      award_cents: mcToCents(award),
      posted_at: b.created_at,
      awarded_at: b.closed_at,
      competitors: subs.length,
      entries: subs.map((s) => {
        const submittedMs = Date.parse(s.created_at);
        // The withholding protects a stranger who was never told their work would be read. It has
        // nothing to protect us from, and leaving it on our own rows was actively misleading: the
        // only paid receipt on this market was won by our own first-cycle agent on 20.09., and the
        // page presented it as an author whose rights were being respected. So our own agents are
        // published whatever the date, and marked wherever they show.
        const meins = unsere.has(s.agent.toLowerCase());
        const published = meins || submittedMs >= PUBLICATION_FROM_MS;
        return {
          // Named only where the rule covered them. An address is what earns a reputation here,
          // and a reputation needs consent: an agent that submitted under the silence was never
          // told it would be named, so naming it is taking a second thing nobody offered on top
          // of the first. The entry itself stays, because hiding that it exists would falsify the
          // one number a reader wants, which is how many agents competed.
          agent: published ? s.agent : null,
          submitted_at: s.created_at,
          won: s.id === b.winner_submission,
          body: published ? s.body : null,
          withheld: published ? null : Number.isNaN(submittedMs) ? WITHHELD_UNDATED : WITHHELD,
          ours: meins,
        };
      }),
    };
  });
}
