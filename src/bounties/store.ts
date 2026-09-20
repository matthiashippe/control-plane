/**
 * Posted bounties, and the money behind them.
 *
 * A bounty without money behind it is a promise the buyer does not have to keep. That is why the
 * price is charged the moment the bounty goes up: a `bounty_hold` ledger row with a negative
 * amount. The buyer's balance drops, and the bounty carries the money until it is cancelled or
 * awarded.
 *
 * **Why not via `wallets.reserved_mc`:** that column is set to zero on every start (`migrate()` in
 * src/db.ts) because it cleans up aborted inference reservations, and that is right where it sits.
 * For a hold it would be fatal: a deploy would hand every buyer their money back while their bounty
 * is still posted, and nobody would notice. The ledger is the durable truth, so the hold lives
 * there.
 *
 * Credits stay what they are throughout: not redeemable and movable only inside this control plane
 * (loop-constraints.md). A bounty shifts them between two accounts of the same system, nothing
 * more.
 */

import { randomUUID } from "node:crypto";
import type { Db } from "../db.js";
import { postLedger } from "../db.js";

export type BountyKind = "factual" | "creative";
export type Status = "open" | "cancelled" | "expired" | "awarded";

export interface Bounty {
  id: string;
  creator: string;
  kind: BountyKind;
  brief: string;
  price_mc: number;
  deadline: string;
  status: Status;
  created_at: string;
  closed_at: string | null;
  winner_submission: string | null;
}

export const BRIEF_MAX = 20_000;
/** One cent is the smallest bounty that makes sense, 1,000 USD the guard against a typo in the digits. */
export const PRICE_MIN_MC = 1_000;
export const PRICE_MAX_MC = 100_000_000;
/**
 * The brokerage fee, in percent of the bounty price.
 *
 * Ten percent, carried by the winner and deducted from what arrives at their account. Upwork
 * takes ten, Fiverr twenty;
 * in a market without liquidity the lower number is the right one, and it is easier to raise later
 * than to lower.
 *
 * The buyer pays exactly the price they post: they should not have to work out what a bounty
 * "really" costs. The agent in turn sees in the public list what arrives at their end, and not only
 * after the award.
 *
 * Rounding goes in favour of the winner: the fee is rounded down so it never exceeds ten percent.
 * Both rows together add up to exactly the amount held, no millicent appears or disappears.
 */
export const FEE_PERCENT = 10;

export function feeMc(priceMc: number): number {
  return Math.floor((priceMc * FEE_PERCENT) / 100);
}

/** Longer than 30 days ties up money for nothing; shorter than a minute is beyond anyone. */
export const DEADLINE_MIN_MS = 60_000;
export const DEADLINE_MAX_MS = 30 * 24 * 3_600_000;

export class BountyError extends Error {
  constructor(readonly code: string, readonly status: number, readonly hint: string) {
    super(code);
  }
}

export interface NewBounty {
  creator: string;
  kind: BountyKind;
  brief: string;
  priceMc: number;
  deadline: string;
}

/**
 * Post and pay in the same move.
 *
 * Both in one transaction: a bounty without a charge would be money that does not exist, a charge
 * without a bounty would be money that belongs to nobody. `postLedger` opens a transaction itself;
 * better-sqlite3 nests that through savepoints, so the outer one remains the one that counts.
 */
export function createBounty(db: Db, a: NewBounty): Bounty {
  const brief = a.brief.trim();
  if (!brief) throw new BountyError("brief_required", 400, "The brief is what the agents work from; it cannot be empty.");
  if (brief.length > BRIEF_MAX) {
    throw new BountyError("brief_too_long", 400, `The brief is limited to ${BRIEF_MAX} characters; yours is ${brief.length}.`);
  }
  if (!Number.isInteger(a.priceMc) || a.priceMc < PRICE_MIN_MC || a.priceMc > PRICE_MAX_MC) {
    throw new BountyError(
      "price_out_of_range", 400,
      `price_cents must be a whole number between ${PRICE_MIN_MC / 1000} and ${PRICE_MAX_MC / 1000}.`,
    );
  }
  const deadlineMs = Date.parse(a.deadline);
  if (Number.isNaN(deadlineMs)) throw new BountyError("deadline_invalid", 400, "deadline must be an ISO 8601 timestamp.");
  const distance = deadlineMs - Date.now();
  if (distance < DEADLINE_MIN_MS) {
    throw new BountyError("deadline_too_soon", 400, "The deadline must be at least a minute away; nobody can work in less.");
  }
  if (distance > DEADLINE_MAX_MS) {
    throw new BountyError("deadline_too_far", 400, "The deadline must be within 30 days; a longer one ties up money for nothing.");
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const creator = a.creator.toLowerCase();

  const run = db.transaction(() => {
    db.prepare(
      "INSERT INTO bounties (id, creator, kind, brief, price_mc, deadline, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)",
    ).run(id, creator, a.kind, brief, a.priceMc, new Date(deadlineMs).toISOString(), now);
    // Throws "insufficient_balance" when the credit is not enough; the transaction rolls back and
    // the bounty never exists.
    postLedger(db, {
      address: creator,
      kind: "bounty_hold",
      deltaMc: -a.priceMc,
      ref: `bounty:${id}`,
      meta: { bounty_id: id, deadline: new Date(deadlineMs).toISOString() },
    });
  });
  try {
    run();
  } catch (e) {
    if ((e as Error).message === "insufficient_balance") {
      throw new BountyError("insufficient_balance", 402, "A bounty is paid when it is posted, not when it is awarded. Top up first.");
    }
    throw e;
  }
  return getBounty(db, id)!;
}

export function getBounty(db: Db, id: string): Bounty | null {
  return (db.prepare("SELECT * FROM bounties WHERE id = ?").get(id) as Bounty | undefined) ?? null;
}

/** Open bounties whose deadline is still running, oldest first: whoever waits longer comes first. */
export function openBounties(db: Db, limit = 50): Bounty[] {
  return db
    .prepare("SELECT * FROM bounties WHERE status = 'open' AND deadline > ? ORDER BY created_at LIMIT ?")
    .all(new Date().toISOString(), Math.min(Math.max(limit, 1), 200)) as Bounty[];
}

/**
 * Cancel and give the money back.
 *
 * Only the buyer, and only once: the condition `status = 'open'` in the UPDATE is what makes a
 * duplicate call harmless. Without it the second call would credit the buyer a second time, and
 * the money would have appeared out of nothing.
 */
export function cancelBounty(db: Db, id: string, who: string): Bounty {
  const address = who.toLowerCase();
  const bounty = getBounty(db, id);
  if (!bounty) throw new BountyError("not_found", 404, "No bounty with that id.");
  if (bounty.creator !== address) throw new BountyError("not_yours", 403, "Only the address that posted a bounty can cancel it.");
  if (bounty.status !== "open") throw new BountyError("not_open", 409, `This bounty is already ${bounty.status}.`);

  const run = db.transaction(() => {
    const res = db
      .prepare("UPDATE bounties SET status = 'cancelled', closed_at = ? WHERE id = ? AND status = 'open'")
      .run(new Date().toISOString(), id);
    if (res.changes !== 1) throw new BountyError("not_open", 409, "This bounty is no longer open.");
    postLedger(db, {
      address: address,
      kind: "bounty_release",
      deltaMc: bounty.price_mc,
      ref: `bounty-release:${id}`,
      meta: { bounty_id: id },
    });
  });
  run();
  return getBounty(db, id)!;
}

/**
 * Close expired bounties and give the held money back.
 *
 * Without this pass the money of a bounty whose deadline goes by without anybody awarding it stays
 * locked forever. The buyer no longer sees it in their balance but gets nothing for it either, and
 * no ledger row explains where it went.
 *
 * `expired` and not `cancelled`: the same movement of money but a different story, and whoever
 * wants to know later why a market does not work has to be able to tell the two apart. A cancelled
 * bounty is a buyer who changed their mind; an expired one is a bounty nobody worked on.
 *
 * Runs on start and at the beginning of every bounty request. That covers every case in which
 * somebody touches the market; what it does not cover is a service nobody calls for months. Then
 * the money sits until the next start, and that comes with every deploy.
 */
export function releaseExpired(db: Db, now = new Date()): number {
  const due = db
    .prepare("SELECT id, creator, price_mc FROM bounties WHERE status = 'open' AND deadline <= ?")
    .all(now.toISOString()) as { id: string; creator: string; price_mc: number }[];
  let released = 0;
  for (const b of due) {
    const run = db.transaction(() => {
      // The condition sits in the UPDATE, not only in the query before it: two concurrent passes
      // would otherwise both credit the buyer, and money would appear out of nothing.
      const res = db
        .prepare("UPDATE bounties SET status = 'expired', closed_at = ? WHERE id = ? AND status = 'open'")
        .run(now.toISOString(), b.id);
      if (res.changes !== 1) return false;
      postLedger(db, {
        address: b.creator,
        kind: "bounty_release",
        deltaMc: b.price_mc,
        ref: `bounty-expired:${b.id}`,
        meta: { bounty_id: b.id, reason: "deadline" },
      });
      return true;
    });
    if (run()) released++;
  }
  return released;
}

export interface Submission {
  id: string;
  bounty_id: string;
  agent: string;
  body: string;
  created_at: string;
}

export const SUBMISSION_MAX = 50_000;

/**
 * Enter a bounty.
 *
 * One attempt per agent and bounty, enforced by the unique index on the table and not only by the
 * check here: two concurrent requests would otherwise both get through, and the buyer would see the
 * same entrant twice.
 *
 * The buyer themselves must not compete. Awarding money to yourself would have no financial effect,
 * but it turns a selection of the best into a stage for a single performer, and in a public list
 * that costs trust.
 */
export function submitWork(db: Db, a: { bountyId: string; agent: string; body: string }): Submission {
  const agent = a.agent.toLowerCase();
  const body = a.body.trim();
  if (!body) throw new BountyError("body_required", 400, "A submission cannot be empty.");
  if (body.length > SUBMISSION_MAX) {
    throw new BountyError("body_too_long", 400, `A submission is limited to ${SUBMISSION_MAX} characters; yours is ${body.length}.`);
  }
  const bounty = getBounty(db, a.bountyId);
  if (!bounty) throw new BountyError("not_found", 404, "No bounty with that id.");
  if (bounty.status !== "open") throw new BountyError("not_open", 409, `This bounty is ${bounty.status}; it takes no more submissions.`);
  if (Date.parse(bounty.deadline) <= Date.now()) {
    throw new BountyError("deadline_passed", 409, "The deadline has passed. The bounty pays nothing out after it.");
  }
  if (bounty.creator === agent) {
    throw new BountyError("own_bounty", 403, "You cannot submit to a bounty you posted yourself.");
  }
  const s: Submission = {
    id: randomUUID(),
    bounty_id: a.bountyId,
    agent,
    body,
    created_at: new Date().toISOString(),
  };
  try {
    db.prepare("INSERT INTO submissions (id, bounty_id, agent, body, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(s.id, s.bounty_id, s.agent, s.body, s.created_at);
  } catch (e) {
    if (String((e as Error).message).includes("UNIQUE")) {
      throw new BountyError("already_submitted", 409, "You already submitted to this bounty. One attempt per agent.");
    }
    throw e;
  }
  return s;
}

/**
 * Who sees which submissions.
 *
 * The buyer sees all of them, because they have to choose. An agent sees only their own: reading
 * the competitors' work before the decision would mean copying it, and the buyer would then pay
 * three times for the same idea.
 */
export function submissionsFor(db: Db, bountyId: string, who: string): Submission[] {
  const address = who.toLowerCase();
  const bounty = getBounty(db, bountyId);
  if (!bounty) throw new BountyError("not_found", 404, "No bounty with that id.");
  if (bounty.creator === address) {
    return db.prepare("SELECT * FROM submissions WHERE bounty_id = ? ORDER BY created_at").all(bountyId) as Submission[];
  }
  return db
    .prepare("SELECT * FROM submissions WHERE bounty_id = ? AND agent = ?")
    .all(bountyId, address) as Submission[];
}

/**
 * Award: the held money goes to the winner.
 *
 * The one move the whole market runs towards, and the place where money could come into existence
 * if it were built wrong. That is why the condition `status = 'open'` sits in the UPDATE and not
 * only in the check before it: two concurrent awards would otherwise both credit the winner.
 *
 * The money does not leave the ledger. It was charged as `bounty_hold` when the bounty went up and
 * arrives at the winner as `bounty_award`; the sum over all rows stays the same, and credits stay
 * non-redeemable (loop-constraints.md).
 *
 * The brokerage fee is a second row next to this one and only exists when the instance has an
 * operator address configured (`feeTo`).
 */
export function awardBounty(
  db: Db,
  a: { bountyId: string; submissionId: string; who: string; feeTo?: string | null },
): Bounty {
  const address = a.who.toLowerCase();
  const bounty = getBounty(db, a.bountyId);
  if (!bounty) throw new BountyError("not_found", 404, "No bounty with that id.");
  if (bounty.creator !== address) throw new BountyError("not_yours", 403, "Only the address that posted a bounty can award it.");
  if (bounty.status !== "open") throw new BountyError("not_open", 409, `This bounty is already ${bounty.status}.`);

  const submission = db
    .prepare("SELECT * FROM submissions WHERE id = ?")
    .get(a.submissionId) as Submission | undefined;
  if (!submission) throw new BountyError("submission_not_found", 404, "No submission with that id.");
  if (submission.bounty_id !== a.bountyId) {
    throw new BountyError("submission_other_bounty", 400, "That submission belongs to a different bounty.");
  }

  const run = db.transaction(() => {
    const res = db
      .prepare("UPDATE bounties SET status = 'awarded', closed_at = ?, winner_submission = ? WHERE id = ? AND status = 'open'")
      .run(new Date().toISOString(), submission.id, a.bountyId);
    if (res.changes !== 1) throw new BountyError("not_open", 409, "This bounty is no longer open.");
    // No recipient, no fee: an instance without a configured operator address must not silently
    // keep money that then belongs to nobody and breaks the books.
    const fee = a.feeTo ? feeMc(bounty.price_mc) : 0;
    postLedger(db, {
      address: submission.agent,
      kind: "bounty_award",
      deltaMc: bounty.price_mc - fee,
      ref: `bounty-award:${a.bountyId}`,
      meta: {
        bounty_id: a.bountyId,
        submission_id: submission.id,
        from: bounty.creator,
        price_mc: bounty.price_mc,
        fee_mc: fee,
      },
    });
    if (fee > 0) {
      postLedger(db, {
        address: a.feeTo as string,
        kind: "bounty_fee",
        deltaMc: fee,
        ref: `bounty-fee:${a.bountyId}`,
        meta: { bounty_id: a.bountyId, submission_id: submission.id, percent: FEE_PERCENT },
      });
    }
  });
  run();
  return getBounty(db, a.bountyId)!;
}

export interface MyBounty extends Bounty {
  submission_count: number;
}

/**
 * The jobs this address posted, whatever became of them.
 *
 * `GET /v1/bounties` lists what is open, which is the right answer for an agent looking for work
 * and the wrong one for the person who paid. docs/journeys.md marks the repeat buyer as the
 * commercially important one and notes that their journey has no steps of its own: no view of
 * their own jobs, no way to repeat a brief that worked. This is the first of those.
 */
export function myBounties(db: Db, who: string, limit = 50): MyBounty[] {
  return db
    .prepare(
      `SELECT b.*, (SELECT count(*) FROM submissions s WHERE s.bounty_id = b.id) AS submission_count
         FROM bounties b WHERE b.creator = ? ORDER BY b.created_at DESC LIMIT ?`,
    )
    .all(who.toLowerCase(), Math.min(Math.max(limit, 1), 200)) as MyBounty[];
}

export type Outcome = "pending" | "won" | "lost" | "expired" | "cancelled";

export interface MySubmission {
  id: string;
  bounty_id: string;
  created_at: string;
  outcome: Outcome;
  price_cents_if_won: number;
  deadline: string;
}

/**
 * What became of the work this agent handed in.
 *
 * Without it an agent spends credits and learns nothing: docs/journeys.md has Side B step 7 as
 * `missing` for exactly that reason. Competing is only rational if the result comes back, and an
 * agent that cannot tell a loss from a job nobody awarded cannot decide whether to try again.
 *
 * `won` is not guessed from the balance. A bounty carries the id of the submission it was awarded
 * to, so the answer comes from the same row that moved the money.
 */
export function mySubmissions(db: Db, who: string, limit = 50): MySubmission[] {
  const rows = db
    .prepare(
      `SELECT s.id, s.bounty_id, s.created_at, b.status, b.deadline, b.price_mc, b.winner_submission
         FROM submissions s JOIN bounties b ON b.id = s.bounty_id
        WHERE s.agent = ? ORDER BY s.created_at DESC LIMIT ?`,
    )
    .all(who.toLowerCase(), Math.min(Math.max(limit, 1), 200)) as {
    id: string; bounty_id: string; created_at: string; status: Status;
    deadline: string; price_mc: number; winner_submission: string | null;
  }[];
  return rows.map((r) => {
    let outcome: Outcome;
    if (r.status === "awarded") outcome = r.winner_submission === r.id ? "won" : "lost";
    else if (r.status === "expired") outcome = "expired";
    else if (r.status === "cancelled") outcome = "cancelled";
    else outcome = "pending";
    return {
      id: r.id,
      bounty_id: r.bounty_id,
      created_at: r.created_at,
      outcome,
      price_cents_if_won: Math.floor(r.price_mc / 1000),
      deadline: r.deadline,
    };
  });
}
