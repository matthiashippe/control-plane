/**
 * The house job: one open bounty the service itself keeps on the board (goals/kunden/11).
 *
 * From 2026-10-06 the board stood empty, because the jobs of the operator wallet were posted by hand and
 * nobody posted them any more. A foreign automaton without USDC read that empty list over a thousand
 * times and had nothing to earn its next inference with. So the service posts the job itself, as code
 * that rolls out like any other, and pays a valid answer without a human in between.
 *
 * The work is real and its result is ours to use: a runtime reports which of its calls failed on this
 * service. `ops/customer-work.sh` counts those reports by method, path and status, without an address.
 *
 * The money is credit inside this control plane and nothing else. Each house job is covered by one
 * `house_fund` row to the operator wallet over exactly its price, in the same transaction as the
 * `bounty_hold` of the job. The award moves it to the winner as `bounty_award`, the fee goes where every
 * fee goes. No USDC, no wallet on chain, nothing redeemable (loop-constraints.md, rule 10). What a winner
 * spends it on costs us the purchase price of the inference, hence the fixed limits below.
 */

import { randomUUID } from "node:crypto";
import type { Db } from "../db.js";
import { getAvailableMc, postLedger } from "../db.js";
import { isKeylessAddress } from "../auth/keyless.js";
import { RUNTIME_KEY_NAME } from "../credits/starter.js";
import { HOUSE_POSTER, ourAddresses } from "./ours.js";
import {
  awardBounty,
  BountyError,
  createBounty,
  releaseExpired,
  submitWork,
  type Bounty,
  type Submission,
} from "./store.js";

export { HOUSE_POSTER };

/** 25 cents, above PRICE_MIN_MC. */
export const HOUSE_PRICE_MC = 25_000;
export const HOUSE_DEADLINE_MS = 7 * 24 * 3_600_000;
/** Awards per UTC day for everybody together: at most one dollar a day. */
export const HOUSE_DAILY_AWARDS = 4;
/**
 * The step credit (goals/kunden/13): 10 cents, once per address, ever, for a foreign runtime that has thought here
 * before and cannot pay its next inference while a house job is open. Its model needs a few answers to read the job,
 * write the report and send it; smaller than the starter credit of 15 cents, which is sized for about ten attempts.
 */
export const HOUSE_STEP_MC = 10_000;
/** Awards (at HOUSE_PRICE_MC each) and step credits of one UTC day together: at most one dollar. */
export const HOUSE_DAILY_MC = 100_000;
/** Awards per address and UTC day. */
export const HOUSE_AWARDS_PER_ADDRESS = 1;
/**
 * The name the upstream runtime gives its own key. Only a real runtime does this work. One name for the starter
 * credit and the house job (src/credits/starter.ts), so that a new pin changes both or neither.
 */
export const HOUSE_RUNTIME_KEY_NAME = RUNTIME_KEY_NAME;
export const HOUSE_CALLS_MAX = 20;
export const HOUSE_PATH_MAX = 200;
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export const HOUSE_BRIEF =
  "Tell us which calls of your runtime fail on this service. List the calls your automaton made here that " +
  "ended in an error, or that it needed and found missing (a missing route is a 404): the method, the path " +
  "and the status it got. Send the list as the body of your submission, JSON only:\n" +
  '{"runtime": "<commit of your runtime, 7 to 40 hex digits>", "calls": [{"method": "POST", "path": "/v1/...", "status": 404}]}\n' +
  `with 1 to ${HOUSE_CALLS_MAX} calls; method is one of ${METHODS.join(", ")}, path starts with / and has at most ` +
  `${HOUSE_PATH_MAX} characters, status is 100 to 599. A valid report is paid at once, as credit on your balance ` +
  "that pays your next inference here. One paid report per address and day.";

export class HouseError extends BountyError {
  constructor(code: string, status: number, hint: string, readonly extra: Record<string, unknown> = {}) {
    super(code, status, hint);
  }
}

const fundRef = (bountyId: string) => `house-fund:${bountyId}`;
const utcDay = (now: Date) => now.toISOString().slice(0, 10);

/** True when this bounty is a house job, which is exactly when a `house_fund` row stands behind it. */
export function isHouseJob(db: Db, bountyId: string): boolean {
  return !!db.prepare("SELECT 1 FROM ledger WHERE kind = 'house_fund' AND ref = ?").get(fundRef(bountyId));
}

/** The open house job whose deadline is still running, or null. */
export function openHouseJob(db: Db, now = new Date()): Bounty | null {
  return (
    (db
      .prepare(
        `SELECT b.* FROM bounties b
          WHERE b.creator = ? AND b.status = 'open' AND b.deadline > ?
            AND EXISTS (SELECT 1 FROM ledger l WHERE l.kind = 'house_fund' AND l.ref = 'house-fund:' || b.id)
          ORDER BY b.created_at LIMIT 1`,
      )
      .get(HOUSE_POSTER, now.toISOString()) as Bounty | undefined) ?? null
  );
}

/**
 * Keeps exactly one house job open. Without one it posts one, with its `house_fund` row and its
 * `bounty_hold` in one transaction; with one it changes nothing. An expired house job is closed first,
 * so its hold goes back to the operator wallet as `bounty_release` like that of any expired job.
 */
export function ensureHouseJob(db: Db, now = new Date()): { posted: boolean; bounty: Bounty } {
  releaseExpired(db, now);
  const run = db.transaction(() => {
    const open = openHouseJob(db, now);
    if (open) return { posted: false, bounty: open };
    const id = randomUUID();
    const deadline = new Date(now.getTime() + HOUSE_DEADLINE_MS).toISOString();
    postLedger(db, {
      address: HOUSE_POSTER,
      kind: "house_fund",
      deltaMc: HOUSE_PRICE_MC,
      ref: fundRef(id),
      meta: { bounty_id: id },
    });
    const bounty = createBounty(db, { id, creator: HOUSE_POSTER, kind: "factual", brief: HOUSE_BRIEF, priceMc: HOUSE_PRICE_MC, deadline });
    return { posted: true, bounty };
  });
  return run();
}

export interface HouseCall {
  method: string;
  path: string;
  status: number;
}
export interface HouseReport {
  runtime: string;
  calls: HouseCall[];
}

/**
 * The report text of the field `body`: a string as sent, a JSON object as its JSON.stringify, anything else null.
 * A language model that reads "send the list as the body" often puts the object itself into the field (kunden 11, point 8).
 */
export function houseReportText(body: unknown): string | null {
  if (typeof body === "string") return body;
  if (typeof body === "object" && body !== null && !Array.isArray(body)) return JSON.stringify(body);
  return null;
}

/** The reason when `body` is missing or neither a string nor a JSON object. */
export const HOUSE_BODY_MISSING =
  'The field body is missing or not a report: send body as a JSON object {"runtime": "...", "calls": [...]} or as that object in a string.';

/** Checks the body of a house submission. Pure; the reason says what is missing. */
export function checkHouseReport(body: string): { ok: true; report: HouseReport } | { ok: false; reason: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return { ok: false, reason: "The body is not JSON." };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, reason: "The body is not a JSON object." };
  const o = raw as Record<string, unknown>;
  const extra = Object.keys(o).filter((k) => k !== "runtime" && k !== "calls");
  if (extra.length) return { ok: false, reason: `Unknown field ${extra[0]}; only runtime and calls.` };
  if (typeof o.runtime !== "string" || !/^[0-9a-fA-F]{7,40}$/.test(o.runtime)) {
    return { ok: false, reason: "runtime must be the commit of your runtime, 7 to 40 hex digits." };
  }
  if (!Array.isArray(o.calls) || o.calls.length < 1 || o.calls.length > HOUSE_CALLS_MAX) {
    return { ok: false, reason: `calls must be a list of 1 to ${HOUSE_CALLS_MAX} calls.` };
  }
  const calls: HouseCall[] = [];
  for (const [i, c] of o.calls.entries()) {
    if (typeof c !== "object" || c === null || Array.isArray(c)) return { ok: false, reason: `calls[${i}] is not an object.` };
    const call = c as Record<string, unknown>;
    const unknown = Object.keys(call).filter((k) => k !== "method" && k !== "path" && k !== "status");
    if (unknown.length) return { ok: false, reason: `calls[${i}] has an unknown field ${unknown[0]}; only method, path and status.` };
    if (typeof call.method !== "string" || !METHODS.includes(call.method)) {
      return { ok: false, reason: `calls[${i}].method must be one of ${METHODS.join(", ")}.` };
    }
    if (typeof call.path !== "string" || !call.path.startsWith("/") || call.path.length > HOUSE_PATH_MAX) {
      return { ok: false, reason: `calls[${i}].path must start with / and have at most ${HOUSE_PATH_MAX} characters.` };
    }
    if (typeof call.status !== "number" || !Number.isInteger(call.status) || call.status < 100 || call.status > 599) {
      return { ok: false, reason: `calls[${i}].status must be a whole number from 100 to 599.` };
    }
    calls.push({ method: call.method, path: call.path, status: call.status });
  }
  return { ok: true, report: { runtime: o.runtime, calls } };
}

/** Whether this address holds a key under the name the upstream runtime gives its own. */
function hasRuntimeKey(db: Db, address: string): boolean {
  return !!db
    .prepare("SELECT 1 FROM api_keys WHERE address = ? AND name = ? AND revoked_at IS NULL")
    .get(address, RUNTIME_KEY_NAME);
}

/** House awards on this UTC day, all of them or those of one address. */
function houseAwardsOn(db: Db, day: string, agent?: string): number {
  return (
    db
      .prepare(
        `SELECT count(*) AS n FROM bounties b JOIN submissions s ON s.id = b.winner_submission
          WHERE b.status = 'awarded' AND substr(b.closed_at, 1, 10) = ?
            AND EXISTS (SELECT 1 FROM ledger l WHERE l.kind = 'house_fund' AND l.ref = 'house-fund:' || b.id)
            ${agent ? "AND s.agent = ?" : ""}`,
      )
      .get(...(agent ? [day, agent] : [day])) as { n: number }
  ).n;
}

/** Step credits booked on this UTC day, in mc. */
function houseStepsOnMc(db: Db, day: string): number {
  return (
    db
      .prepare("SELECT coalesce(sum(delta_mc), 0) AS n FROM ledger WHERE kind = 'house_step' AND substr(created_at, 1, 10) = ?")
      .get(day) as { n: number }
  ).n;
}

/** What awards and step credits of this UTC day have taken from HOUSE_DAILY_MC. */
function houseSpentOnMc(db: Db, day: string): number {
  return houseAwardsOn(db, day) * HOUSE_PRICE_MC + houseStepsOnMc(db, day);
}

/**
 * A submission to a house job: checked, stored and awarded in one transaction, or nothing at all.
 * Every refusal is a HouseError before anything is written, so it leaves no submission and no ledger row.
 */
export function submitHouseReport(
  db: Db,
  a: { bountyId: string; agent: string; body: unknown; feeTo?: string | null; now?: Date },
): { submission: Submission; bounty: Bounty; creditMc: number } {
  const agent = a.agent.toLowerCase();
  const now = a.now ?? new Date();
  if (ourAddresses(db, [agent]).has(agent)) {
    throw new HouseError("house_ours", 403, "The house job pays foreign runtimes only; this address is ours.");
  }
  if (!hasRuntimeKey(db, agent)) {
    throw new HouseError(
      "house_runtime_only", 403,
      `The house job pays a runtime only: this address has no key named ${RUNTIME_KEY_NAME}, the name the automaton runtime gives its own.`,
    );
  }
  const text = houseReportText(a.body);
  const checked = text === null ? ({ ok: false, reason: HOUSE_BODY_MISSING } as const) : checkHouseReport(text);
  if (!checked.ok) {
    throw new HouseError("house_report_invalid", 422, `This report is not valid: ${checked.reason}`, { reason: checked.reason });
  }
  const day = utcDay(now);
  const nextMidnight = new Date(`${day}T00:00:00.000Z`).getTime() + 24 * 3_600_000;
  const retryAfter = new Date(nextMidnight).toISOString();
  if (houseAwardsOn(db, day, agent) >= HOUSE_AWARDS_PER_ADDRESS) {
    throw new HouseError("house_daily_limit", 409, "This address was paid for a report today already. One paid report per address and UTC day.", {
      retry_after: retryAfter,
    });
  }
  if (houseAwardsOn(db, day) >= HOUSE_DAILY_AWARDS || houseSpentOnMc(db, day) + HOUSE_PRICE_MC > HOUSE_DAILY_MC) {
    throw new HouseError(
      "house_pool_empty", 409,
      `Today's ${HOUSE_DAILY_AWARDS} paid reports are taken. The next one is paid from midnight UTC.`,
      { retry_after: retryAfter },
    );
  }
  const run = db.transaction(() => {
    const submission = submitWork(db, { bountyId: a.bountyId, agent, body: text as string });
    const bounty = awardBounty(db, { bountyId: a.bountyId, submissionId: submission.id, who: HOUSE_POSTER, feeTo: a.feeTo ?? null });
    const row = db
      .prepare("SELECT delta_mc FROM ledger WHERE kind = 'bounty_award' AND ref = ?")
      .get(`bounty-award:${a.bountyId}`) as { delta_mc: number };
    return { submission, bounty, creditMc: row.delta_mc };
  });
  try {
    return run();
  } catch (e) {
    // A report to a house job that was awarded or ran out meanwhile names the open one, so the runtime can send the same
    // report there without reading the board again (goals/kunden/13). The next house job goes up here if the ten-minute
    // round has not posted it yet, as it does after an award.
    if (e instanceof BountyError && (e.code === "not_open" || e.code === "deadline_passed")) {
      let open: Bounty | null = null;
      try {
        open = ensureHouseJob(db, now).bounty;
      } catch {
        open = openHouseJob(db, now);
      }
      if (open && open.id !== a.bountyId) {
        throw new HouseError(e.code, e.status, `${e.hint} The open house job is ${open.id}; send the report there.`, {
          open_house_job: { id: open.id },
        });
      }
    }
    throw e;
  }
}

/**
 * The step credit (goals/kunden/13): once per address, ever, HOUSE_STEP_MC of credit for the few answers a runtime
 * needs to read the open house job, write its report and send it.
 *
 * Found on 2026-11-23: customer 1 has had a 402 on every inference since 2026-11-13, so its model never reads the board
 * and never writes the report that would pay its next inference; the starter credit is long spent. Given only when all of
 * this holds at once: a house job is open; the address is not ours and no handle of the keyless door; it holds a key
 * named RUNTIME_KEY_NAME; it has at least one earlier `inference` row, so a fresh wallet with that key name takes
 * nothing; it never had a step credit and never a house award; and awards and step credits of the UTC day stay within
 * HOUSE_DAILY_MC. The caller asks only after the starter credit gave nothing. `requiredMc` is the reservation of the call
 * that asks: the step credit is booked only when it covers that call together with what the address can spend, because
 * a credit that leaves the 402 standing would take the one step credit of the address without an answer for its model.
 *
 * One `house_step` row through postLedger, in the same transaction as the balance; the unique index
 * `ledger_house_step_once` keeps it to one per address even under a race. Credit inside this control plane, nothing
 * redeemable (loop-constraints.md, rule 10). Silent like grantOnFirstUse: true when credit was booked, false otherwise.
 */
export function grantForHouseJob(db: Db, address: string, now = new Date(), requiredMc = 0): boolean {
  const who = address.toLowerCase();
  if (isKeylessAddress(who)) return false;
  const run = db.transaction((): boolean => {
    const job = openHouseJob(db, now);
    if (!job) return false;
    if (ourAddresses(db, [who]).has(who)) return false;
    if (!hasRuntimeKey(db, who)) return false;
    if (!db.prepare("SELECT 1 FROM ledger WHERE address = ? AND kind = 'inference' LIMIT 1").get(who)) return false;
    if (db.prepare("SELECT 1 FROM ledger WHERE address = ? AND kind = 'house_step' LIMIT 1").get(who)) return false;
    const awarded = db
      .prepare(
        `SELECT 1 FROM ledger a WHERE a.address = ? AND a.kind = 'bounty_award'
            AND EXISTS (SELECT 1 FROM ledger l WHERE l.kind = 'house_fund' AND 'bounty-award:' || substr(l.ref, 12) = a.ref)
          LIMIT 1`,
      )
      .get(who);
    if (awarded) return false;
    if (houseSpentOnMc(db, utcDay(now)) + HOUSE_STEP_MC > HOUSE_DAILY_MC) return false;
    if (getAvailableMc(db, who) + HOUSE_STEP_MC < requiredMc) return false;
    postLedger(db, {
      address: who,
      kind: "house_step",
      deltaMc: HOUSE_STEP_MC,
      ref: `house-step:${who}`,
      meta: { trigger: "house job open", bounty_id: job.id },
    });
    return true;
  });
  try {
    return run();
  } catch (e) {
    if (String((e as Error).message).includes("UNIQUE")) return false;
    throw e;
  }
}
