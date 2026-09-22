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
 * The offer as the pages may state it, or nothing at all.
 *
 * Three human-readable surfaces promise a newcomer a free first job: the landing page, `/post` in
 * two places, and `/jobs`. Each phrased it unconditionally, and the promise has a floor: the pool
 * is 500,000 millicents, thirty-three grants, and it does not refill. An article on Hacker News
 * empties it within an hour, and from that hour on three pages promise something the server
 * refuses in the same second, which is the one kind of untruth this project cannot afford on the
 * page that asks for trust.
 *
 * So the pages ask here instead of asserting. `null` means the pool cannot fund another grant, and
 * every surface has to say something else or say nothing. `test/starter-promise.test.ts` holds all
 * of them to it at once, because the next page that makes the promise will not know about this
 * comment.
 */
export function starterOffer(db: Db): { cents: number; pool_left_cents: number } | null {
  const left = poolLeftMc(db);
  if (left < GRANT_MC) return null;
  return { cents: mcToCents(GRANT_MC), pool_left_cents: mcToCents(left) };
}

/**
 * What a grant would add for this address right now: the whole grant, or nothing.
 *
 * Read-only, and that is the point. A caller that has to decide *before* granting needs an answer
 * it can act on without spending the address's one grant to find out. The buyer path uses it that
 * way: a job the grant could not cover must not consume the grant, because the newcomer would be
 * left with a refusal and no grant left for the smaller job they try next.
 */
export function starterAvailableMc(db: Db, address: string): number {
  const already = db.prepare("SELECT 1 FROM ledger WHERE kind = 'grant' AND address = ?").get(address.toLowerCase());
  if (already) return 0;
  return grantedTotalMc(db) + GRANT_MC > POOL_MC ? 0 : GRANT_MC;
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

/**
 * The same grant, taken at the moment the agent actually needs it.
 *
 * `claimStarter` is reachable only through `POST /v1/credits/starter`, and that is a call a
 * Conway runtime never makes. It speaks the upstream API and nothing else, so everything this
 * service invented is invisible to it. The consequence, measured on 2026-09-21: an operator
 * points a fresh runtime at us, the first thought hits `reserveMc` with a balance of zero and
 * comes back 402, and the only documented way on is to buy USDC on Base. The free tier existed
 * and sat behind a door nobody could see.
 *
 * So the grant is taken here instead, on the first call that cannot pay for itself. Tying it to
 * use rather than to provisioning is deliberate: a scanner that signs in and leaves costs the
 * pool nothing, and only an address that is genuinely trying to think draws from it.
 *
 * Silent by design. This runs inside the billing path of a request that asked for inference, not
 * for credit, so a refusal here is not an error the caller did anything about: it means the
 * address has had its grant or the pool is empty, and in both cases the 402 that follows is the
 * right answer. The grant itself is not silent, it is a ledger row of kind `grant` like any
 * other, and `ops/db-report.cjs` prints what is left of the pool on every run.
 */
export function grantOnFirstUse(db: Db, address: string): boolean {
  try {
    claimStarter(db, address);
    return true;
  } catch (e) {
    if (e instanceof StarterError) return false;
    throw e;
  }
}

/** Three reads, because one is a check and two could be a retry. */
export const WAITING_POLLS = 3;
/** A minute, because our own end-to-end runs read a balance twice within seconds. */
export const WAITING_MS = 60_000;

/**
 * The grant a waiting runtime cannot ask for.
 *
 * `grantOnFirstUse` hangs the grant on the first inference that cannot pay for itself, and that is
 * right for a runtime that tries to think. It is useless for the one we actually measured. On
 * 2026-09-22 a Conway operator in Korea provisioned a key at 02:05 UTC, and between 04:01 and
 * 04:07 their runtime read `GET /v1/credits/balance` twenty-six times, got `{"balance_cents": 0}`
 * every time, and never attempted a single inference. It was waiting for money before working, so
 * the grant tied to work never fired. At 04:22 the operator looked by hand, at 04:24 they read the
 * landing page, and at 04:27 they were gone. The hint in the balance answer that would have told
 * them what to do went live at 09:40 that morning, five hours too late, and a runtime does not
 * read hints anyway: it reads `balance_cents`.
 *
 * So the poll itself is the trigger. A runtime that asks three times over more than a minute with
 * an empty balance is not browsing, it is stuck, and the next poll after this one returns fifteen
 * cents and it starts working.
 *
 * Both limits earn their place against our own traffic. Over the whole access log exactly three
 * addresses have ever polled this endpoint: two of ours and that operator. Ours are end-to-end
 * runs that read a balance twice within seconds around a call (`ops/award.ts`, `ops/first-cycle.ts`),
 * so a minute of distance rules them out; and the balance-is-zero condition rules out every run
 * that has already topped up. What remains is what we want to catch.
 *
 * Silent, like `grantOnFirstUse`: it sits inside a request that asked for a number, so a refusal
 * is not an error anybody can act on. The grant is a ledger row either way.
 *
 * @param nowMs injectable so a test can prove both directions without waiting a minute.
 */
export function grantToWaitingRuntime(db: Db, address: string, balanceMc: number, nowMs: number): boolean {
  const who = address.toLowerCase();
  const now = new Date(nowMs).toISOString();
  db.prepare(
    `INSERT INTO balance_polls (address, n, first_at, last_at) VALUES (?, 1, ?, ?)
     ON CONFLICT(address) DO UPDATE SET n = n + 1, last_at = excluded.last_at`,
  ).run(who, now, now);

  if (balanceMc > 0) return false;
  const row = db.prepare("SELECT n, first_at, last_at FROM balance_polls WHERE address = ?").get(who) as
    | { n: number; first_at: string; last_at: string }
    | undefined;
  if (!row || row.n < WAITING_POLLS) return false;
  if (Date.parse(row.last_at) - Date.parse(row.first_at) < WAITING_MS) return false;
  return grantOnFirstUse(db, who);
}
