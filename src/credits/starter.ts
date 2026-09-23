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

/**
 * What a newcomer gets when their first use is POSTING a job rather than thinking.
 *
 * Fifteen cents is ten attempts, which is the right size for an agent and the wrong size for a
 * buyer: a fifteen-cent job leaves the winner thirteen and a half, and nothing about it says to a
 * stranger's agent that it is worth an attempt. The five jobs open on 2026-09-23 are 45 to 250
 * cents, so a newcomer's first job would be the smallest thing on the board by a factor of three.
 *
 * Fifty cents leaves the winner forty-five, which at the 0.81 cents an answer has cost here is
 * about fifty-five attempts' worth. That is a prize. The pool pays for it: 215 cents left is four
 * of these or fourteen agent grants, and not both, which is a real choice and is why the figure is
 * named here and printed by ops/db-report.cjs rather than buried in a branch.
 *
 * It is a grant FOR A JOB and not for a wallet. See returnGrantToPool: if the job ends without an
 * award the credit goes back to the pool, not to the buyer. Without that, posting a job and
 * cancelling it would be a way to turn the pool into inference at three times the agent rate, and
 * the address would still be counted in foreign_buyers.
 */
export const BUYER_GRANT_MC = 50_000;
/** The whole giveaway, across every address. At 15 cents each this is 33 agents. */
export const POOL_MC = 500_000;

/**
 * What the pool may give away in one UTC day, across every address.
 *
 * Until 2026-09-23 the only limit besides the total was "one grant per address, ever", and it was
 * enforced by a unique index rather than a check, which made it strong. Goal 16 mints an identity
 * on request for anybody without a wallet, and the moment identities are free that rule stops
 * limiting anything: mint ten, claim ten.
 *
 * The attack is not theoretical and it is worth naming, because it decides the size. Mint a buyer
 * and an agent, post a fifty-cent job the pool funds, submit to it, award it: the grant has become
 * forty-five cents of inference at the agent's own hand. Cancelling does not work, the grant goes
 * back (returnGrantToPool), so it takes a real award, which is exactly the move this cap sizes.
 *
 * **The hole is older than Goal 16.** An Ethereum address is free to mint too: thirty-three
 * keypairs, thirty-three signatures, thirty-three grants, and the unique index waves all of it
 * through because every one of them is a different address. The per-address rule never stopped
 * anybody who meant it; it stopped accidents. Minting in the browser only makes that visible, and
 * the cap below is the first thing here that actually limits a determined caller.
 *
 * 100,000 millicents is two buyer grants or six agent grants a day. With 230 cents left on
 * 2026-09-23 a determined drainer needs two and a half days and gets a euro a day; a genuine
 * newcomer, on a service that sees one stranger a day, never meets this limit. The total was
 * always the real exposure and this only spreads it out, which is the honest way to put it: it
 * does not make the giveaway safe, it makes it slow enough to notice.
 *
 * `CP_POOL_DAILY_MC` raises it, and it is read on every call rather than at import. Tests about
 * what happens when the WHOLE pool is gone need to spend it in one run, and without a way to lift
 * the day's ceiling the only alternatives are to weaken those tests or to leave the cap out of
 * their reach, both of which trade a real check for a green run.
 */
export const POOL_DAILY_MC_DEFAULT = 100_000;

export function poolDailyMc(): number {
  const raw = Number(process.env.CP_POOL_DAILY_MC);
  return Number.isInteger(raw) && raw > 0 ? raw : POOL_DAILY_MC_DEFAULT;
}

export class StarterError extends Error {
  constructor(readonly code: string, readonly status: number, readonly hint: string) {
    super(code);
  }
}

/**
 * What the pool has actually given away, which is what went out minus what came back.
 *
 * `grant_returned` rows are negative and belong in this sum: a job-scoped grant whose job was
 * cancelled never reached anybody, and counting it as spent would shrink the pool for a giveaway
 * that did not happen. The unique index on the ledger is scoped to kind = 'grant', so the return
 * cannot be booked as another grant row even if somebody wanted to.
 */
export function grantedTotalMc(db: Db): number {
  const row = db
    .prepare("SELECT coalesce(sum(delta_mc), 0) AS total FROM ledger WHERE kind IN ('grant', 'grant_returned')")
    .get() as { total: number };
  return row.total;
}

export function poolLeftMc(db: Db): number {
  return Math.max(0, POOL_MC - grantedTotalMc(db));
}

/**
 * What the pool has given away on one UTC day, netted the same way as grantedTotalMc.
 *
 * `created_at` is an ISO string, so the day is its first ten characters. The netting matters for
 * the same reason as in the total: a job posted and cancelled inside one day gave nobody anything,
 * and holding the day's budget against it would refuse the next newcomer for a grant that was
 * handed back. `now` is a parameter so a test can stand on either side of midnight.
 */
export function grantedTodayMc(db: Db, now: Date = new Date()): number {
  const day = now.toISOString().slice(0, 10);
  const row = db
    .prepare(
      "SELECT coalesce(sum(delta_mc), 0) AS total FROM ledger " +
        "WHERE kind IN ('grant', 'grant_returned') AND substr(created_at, 1, 10) = ?",
    )
    .get(day) as { total: number };
  return row.total;
}

/** What the pool can still fund today: the smaller of what is left and what the day allows. */
export function poolLeftTodayMc(db: Db, now: Date = new Date()): number {
  return Math.max(0, Math.min(poolLeftMc(db), poolDailyMc() - grantedTodayMc(db, now)));
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
  // The BUYER ceiling, because every caller of this is a buyer surface: the landing page, /post,
  // /jobs and /check all use it to say what a first job costs a newcomer. Since 2026-09-23 the
  // grant for a first job covers what that job is short of, up to BUYER_GRANT_MC, so "up to fifty
  // cents" is what these pages may promise. The agent figure stays GRANT_MC and is published
  // separately as starter_credit_cents on /v1/status, where a runtime reads it.
  if (left < BUYER_GRANT_MC) return null;
  return { cents: mcToCents(BUYER_GRANT_MC), pool_left_cents: mcToCents(left) };
}

/**
 * The same question for the other side, and the reason it is a second function.
 *
 * `starterOffer` is what the BUYER surfaces say, and since 2026-09-23 that is the buyer ceiling.
 * The browser answer on a `/v1/` path is not a buyer surface: it is what an operator sees when
 * they open their runtime's balance URL by hand, and the sentence it carries is about the fifteen
 * cents a runtime is handed when it polls an empty balance. Feeding it the buyer figure made the
 * page promise fifty cents for something that hands out fifteen, which test/apipage.test.ts
 * caught in the same run the split was written.
 *
 * Gated on GRANT_MC and not on the buyer ceiling, because a pool too thin for a fifty-cent job can
 * still carry a fifteen-cent agent, and closing the supply side for a promise made to buyers would
 * be the wrong half to give up.
 */
export function agentOffer(db: Db): { cents: number; pool_left_cents: number } | null {
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
export function starterAvailableMc(db: Db, address: string, amountMc: number = GRANT_MC): number {
  const already = db.prepare("SELECT 1 FROM ledger WHERE kind = 'grant' AND address = ?").get(address.toLowerCase());
  if (already) return 0;
  if (grantedTotalMc(db) + amountMc > POOL_MC) return 0;
  // The day's budget, asked here as well as in claimStarter, because a caller that decides on this
  // answer and then gets refused by the write path would consume nothing and explain nothing. The
  // buyer path relies on the two agreeing: it asks first so that a job the pool cannot cover does
  // not burn the address's one grant.
  if (grantedTodayMc(db) + amountMc > poolDailyMc()) return 0;
  return amountMc;
}

/**
 * Hands an address its one grant.
 *
 * The pool is checked inside the same transaction as the insert, so the last few grants cannot be
 * handed out twice over. The unique index is what makes the per-address rule true even under a
 * race; the check before it exists only to give a useful answer instead of a constraint error.
 */
export function claimStarter(
  db: Db,
  address: string,
  amountMc: number = GRANT_MC,
  meta: Record<string, unknown> = {},
): { granted_cents: number; pool_left_cents: number } {
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
    if (grantedTotalMc(db) + amountMc > POOL_MC) {
      throw new StarterError(
        "pool_empty",
        409,
        "The starter pool is used up. It is a fixed amount the operator gives away, not a budget " +
          "that refills. Buy credits with USDC on Base, or ask the operator to top the pool up.",
      );
    }
    if (grantedTodayMc(db) + amountMc > poolDailyMc()) {
      throw new StarterError(
        "pool_daily_limit",
        429,
        "The starter pool has given away what it gives away in a day. It refills at midnight UTC " +
          "and the limit exists because anybody can mint an identity here, so without it one " +
          "script could take the whole pool in a minute. Come back tomorrow, or buy credits with " +
          "USDC on Base.",
      );
    }
    postLedger(db, {
      address: who,
      kind: "grant",
      deltaMc: amountMc,
      ref: `starter:${who}`,
      meta: { reason: "starter credit", attempts: Math.floor(amountMc / 1_500), ...meta },
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

  return { granted_cents: mcToCents(amountMc), pool_left_cents: mcToCents(poolLeftMc(db)) };
}

/**
 * Gives a job-scoped grant back, because the job it was for never reached anybody.
 *
 * A grant handed out for a specific bounty is the pool paying for that piece of work to exist. If
 * the bounty is cancelled or runs out its deadline unawarded, the work did not happen and the
 * credit has no business sitting on the buyer's balance: it would be usage of this service that
 * nobody gave away on purpose, and the address would keep it at three times what an agent gets.
 *
 * Booked as `grant_returned` and never as a second `grant` row, because the unique index that
 * makes "one grant per address, ever" true is scoped to kind = 'grant' and would refuse it.
 * grantedTotalMc() sums both, so the pool is whole again for the next newcomer.
 *
 * Called inside the same transaction that credits the buyer back, so the balance it debits is
 * always there: the release puts the whole price back first, and the grant can never exceed it.
 */
export function returnGrantToPool(db: Db, address: string, amountMc: number, bountyId: string): void {
  postLedger(db, {
    address: address.toLowerCase(),
    kind: "grant_returned",
    deltaMc: -amountMc,
    ref: `grant-returned:${bountyId}`,
    meta: { reason: "the job this grant paid for ended without an award", bounty_id: bountyId },
  });
}

/**
 * How much of a bounty was paid for out of the pool, or zero.
 *
 * Read from the grant's own meta rather than from a column on `bounties`: the fact belongs to the
 * giveaway and not to the market, and a migration on a live ledger to store what one JSON field
 * already says would be the more expensive of the two mistakes.
 */
export function grantBehindBounty(db: Db, bountyId: string): number {
  const row = db
    .prepare(
      "SELECT delta_mc AS mc FROM ledger WHERE kind = 'grant' AND json_extract(meta, '$.for_bounty') = ?",
    )
    .get(bountyId) as { mc: number } | undefined;
  return row ? row.mc : 0;
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
export function grantOnFirstUse(
  db: Db,
  address: string,
  amountMc: number = GRANT_MC,
  meta: Record<string, unknown> = {},
): boolean {
  try {
    claimStarter(db, address, amountMc, meta);
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
