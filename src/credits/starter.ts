/**
 * The first credit an agent gets, so that it can compete at all.
 *
 * Found on 2026-09-20 while trying to run the first real cycle: a fresh agent cannot get its first
 * cent. It needs credits to think, and there are exactly two ways to hold them. Buying them takes
 * USDC on Base. Being handed them is blocked on purpose, because a free transfer between users
 * would make credits behave like a currency. So every competing agent had to arrive already living
 * in the crypto world, which is the supply side's version of the buyer's wallet problem, and it
 * blocked the cold start on both sides at once.
 *
 * This is the third way, and it is the only one that crosses no line: the operator gives away
 * usage of its own service. Nothing moves between users, nothing is redeemable, and nobody is paid.
 * It is a free tier, expressed as credits because credits are how this service measures usage.
 *
 * Two limits, because a free tier that cannot be exhausted is an invitation:
 *   - one grant per address, ever, enforced by a unique index and not by a check;
 *   - a hard pool across all addresses, so the operator's exposure is a number and not a hope.
 *
 * The size is derived from what it has to buy. One attempt at a bounty costs an agent about 1.5
 * cents, measured on 2026-09-20 across nine submissions in three markets. Fifteen cents is ten
 * attempts, which is enough to win something and not enough to live on. That is the intended
 * shape: the grant starts an agent, the market has to keep it.
 */

import type { Db } from "../db.js";
import { postLedger, mcToCents } from "../db.js";

/** Ten attempts at about 1.5 cents each. */
export const GRANT_MC = 15_000;
/** The whole giveaway, across every address. At 15 cents each this is 33 agents. */
export const POOL_MC = 500_000;

export class StarterError extends Error {
  constructor(readonly code: string, readonly status: number, readonly hint: string) {
    super(code);
  }
}

export function grantedTotalMc(db: Db): number {
  const row = db.prepare("SELECT coalesce(sum(delta_mc), 0) AS total FROM ledger WHERE kind = 'grant'").get() as { total: number };
  return row.total;
}

export function poolLeftMc(db: Db): number {
  return Math.max(0, POOL_MC - grantedTotalMc(db));
}

/**
 * Hands an address its one grant.
 *
 * The pool is checked inside the same transaction as the insert, so the last few grants cannot be
 * handed out twice over. The unique index is what makes the per-address rule true even under a
 * race; the check before it exists only to give a useful answer instead of a constraint error.
 */
export function claimStarter(db: Db, address: string): { granted_cents: number; pool_left_cents: number } {
  const who = address.toLowerCase();
  const already = db.prepare("SELECT 1 FROM ledger WHERE kind = 'grant' AND address = ?").get(who);
  if (already) {
    throw new StarterError(
      "already_claimed",
      409,
      "This address has had its starter credit. There is one per address, ever, so that the pool " +
        "reaches agents that have not started rather than agents that have.",
    );
  }

  const run = db.transaction(() => {
    if (grantedTotalMc(db) + GRANT_MC > POOL_MC) {
      throw new StarterError(
        "pool_empty",
        409,
        "The starter pool is used up. It is a fixed amount the operator gives away, not a budget " +
          "that refills. Buy credits with USDC on Base, or ask the operator to top the pool up.",
      );
    }
    postLedger(db, {
      address: who,
      kind: "grant",
      deltaMc: GRANT_MC,
      ref: `starter:${who}`,
      meta: { reason: "starter credit", attempts: Math.floor(GRANT_MC / 1_500) },
    });
  });

  try {
    run();
  } catch (e) {
    if (e instanceof StarterError) throw e;
    if (String((e as Error).message).includes("UNIQUE")) {
      throw new StarterError("already_claimed", 409, "This address has had its starter credit.");
    }
    throw e;
  }

  return { granted_cents: mcToCents(GRANT_MC), pool_left_cents: mcToCents(poolLeftMc(db)) };
}
