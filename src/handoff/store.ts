/**
 * Handoffs in SQLite: create, read, choose (goals/konto/02, docs/konto/handoff.md).
 *
 * One process, one database file, so the state lives in the row and every reader asks the row. A pending code whose ten minutes
 * are up becomes `expired` the first time anybody looks at it; there is no timer that could be missed by a restart.
 */
import { randomBytes, randomInt } from "node:crypto";
import type { Db } from "../db.js";
import { hashApiKey } from "../auth/siwe.js";
import { HANDOFF_TTL_MS, isExpired, pickMatches } from "./rules.js";

export type HandoffState = "pending" | "done" | "burned" | "expired";

export interface Handoff {
  code: string;
  automatonName: string;
  dailyLimitUsdc: bigint;
  amountUsdc: bigint;
  match: number;
  /** The three numbers in the order the page shows them, `match` among them. */
  choices: number[];
  state: HandoffState;
  createdAtMs: number;
}

export interface HandoffInput {
  automatonName: string;
  dailyLimitUsdc: bigint;
  amountUsdc: bigint;
}

/** Where the chance comes from. Production uses node:crypto; a test or the SOLL comparison can pass a fixed one. */
export interface HandoffRandom {
  bytes(n: number): Buffer;
  /** An integer in [min, max). */
  int(min: number, max: number): number;
}

export const CRYPTO_RANDOM: HandoffRandom = { bytes: (n) => randomBytes(n), int: (min, max) => randomInt(min, max) };

/** Crockford's Base32: no I, L, O or U, so a code read aloud or typed from the screen cannot be misread. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** 12 characters of 5 bits: 60 bits of chance, above the 50 the goal asks for. */
export const CODE_LENGTH = 12;
export const CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{12}$/;

function newCode(random: HandoffRandom): string {
  const bytes = random.bytes(8);
  let bits = 0n;
  for (const b of bytes) bits = (bits << 8n) | BigInt(b);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += CROCKFORD[Number((bits >> BigInt(5 * i)) & 31n)];
  return out;
}

/** `match` and two other two-digit numbers, all different, `match` at a random one of the three places. */
function newChoices(random: HandoffRandom): { match: number; choices: number[] } {
  const match = random.int(10, 100);
  const decoys: number[] = [];
  while (decoys.length < 2) {
    const n = random.int(10, 100);
    if (n !== match && !decoys.includes(n)) decoys.push(n);
  }
  const at = random.int(0, 3);
  const choices = [...decoys];
  choices.splice(at, 0, match);
  return { match, choices };
}

/** Creates a pending handoff. Returns it with the terminal's secret, which is stored only as a hash and never again shown. */
export function createHandoff(
  db: Db,
  input: HandoffInput,
  nowMs: number,
  random: HandoffRandom = CRYPTO_RANDOM,
): { handoff: Handoff; pollToken: string; expiresAtMs: number } {
  const { match, choices } = newChoices(random);
  // A collision of 60 random bits is not expected in the life of this service; if it happens, a new draw is cheaper than a 500.
  for (let attempt = 0; ; attempt++) {
    const code = newCode(random);
    const pollToken = random.bytes(32).toString("base64url");
    try {
      db.prepare(
        `INSERT INTO handoffs (code, poll_hash, automaton_name, daily_limit_usdc, amount_usdc, match, choices, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      ).run(code, hashApiKey(pollToken), input.automatonName, String(input.dailyLimitUsdc), String(input.amountUsdc), match, choices.join(","), nowMs, nowMs);
      const handoff: Handoff = { code, ...input, match, choices, state: "pending", createdAtMs: nowMs };
      return { handoff, pollToken, expiresAtMs: nowMs + HANDOFF_TTL_MS };
    } catch (err) {
      if (attempt >= 3 || !/UNIQUE/.test(String(err))) throw err;
    }
  }
}

interface Row {
  code: string;
  poll_hash: string;
  automaton_name: string;
  daily_limit_usdc: string;
  amount_usdc: string;
  match: number;
  choices: string;
  state: HandoffState;
  created_at: number;
}

const toHandoff = (r: Row): Handoff => ({
  code: r.code,
  automatonName: r.automaton_name,
  dailyLimitUsdc: BigInt(r.daily_limit_usdc),
  amountUsdc: BigInt(r.amount_usdc),
  match: r.match,
  choices: r.choices.split(",").map(Number),
  state: r.state,
  createdAtMs: r.created_at,
});

/** The handoff and the hash of its secret, with a pending code past its ten minutes turned `expired`. Null for an unknown code. */
export function readHandoff(db: Db, code: string, nowMs: number): { handoff: Handoff; pollHash: string } | null {
  if (!CODE_PATTERN.test(code)) return null;
  const row = db.prepare("SELECT * FROM handoffs WHERE code = ?").get(code) as Row | undefined;
  if (!row) return null;
  if (row.state === "pending" && isExpired(row.created_at, nowMs)) {
    db.prepare("UPDATE handoffs SET state = 'expired', updated_at = ? WHERE code = ? AND state = 'pending'").run(nowMs, code);
    row.state = (db.prepare("SELECT state FROM handoffs WHERE code = ?").get(code) as { state: HandoffState }).state;
  }
  return { handoff: toHandoff(row), pollHash: row.poll_hash };
}

/**
 * What a tap on the page did. `done` and `wrong` are the two outcomes of a pending code; the others say why nothing happened.
 */
export type ChooseOutcome =
  | { kind: "done"; handoff: Handoff }
  | { kind: "wrong"; handoff: Handoff }
  | { kind: "unusable"; handoff: Handoff }
  | { kind: "unknown" };

/**
 * The tap, in one transaction: the right number turns a pending code `done`, any other burns it. Only a pending code can change,
 * so a second tap, a tap after a wrong one and a tap after ten minutes change nothing.
 */
export function chooseHandoff(db: Db, code: string, picked: unknown, nowMs: number): ChooseOutcome {
  return db.transaction((): ChooseOutcome => {
    const found = readHandoff(db, code, nowMs);
    if (!found) return { kind: "unknown" };
    const { handoff } = found;
    if (handoff.state !== "pending") return { kind: "unusable", handoff };
    const next: HandoffState = pickMatches(picked, handoff.match) ? "done" : "burned";
    const changed = db
      .prepare("UPDATE handoffs SET state = ?, updated_at = ? WHERE code = ? AND state = 'pending'")
      .run(next, nowMs, code).changes;
    if (changed !== 1) return { kind: "unusable", handoff };
    const after = { ...handoff, state: next };
    return next === "done" ? { kind: "done", handoff: after } : { kind: "wrong", handoff: after };
  })();
}
