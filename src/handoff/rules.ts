/**
 * The three decisions of a handoff, each one function with a fixed name (goals/konto/02): the counter-tests of the goal replace
 * exactly these and expect the tests to fail, so the HTTP path has to call them and nothing else.
 *
 * - pickMatches: is the number the person tapped the one the terminal shows?
 * - pollTokenMatches: does the request carry the secret of the terminal that created the handoff?
 * - isExpired: is the code older than ten minutes?
 */
import { timingSafeEqual } from "node:crypto";
import { hashApiKey } from "../auth/siwe.js";

/** A code lives ten minutes. */
export const HANDOFF_TTL_MS = 600_000;

/** True when the tapped number is the two-digit `match`. Anything that is not exactly two digits is no match. */
export function pickMatches(picked: unknown, match: number): boolean {
  return typeof picked === "string" && /^[1-9][0-9]$/.test(picked) && Number(picked) === match;
}

/**
 * True when the Authorization header carries the secret whose hash is stored. Compared in constant time, so the answer time says
 * nothing about how much of a guess was right.
 */
export function pollTokenMatches(authorization: string | undefined, storedHash: string): boolean {
  const m = /^Bearer\s+([A-Za-z0-9_-]{32,128})$/i.exec((authorization ?? "").trim());
  if (!m) return false;
  const given = Buffer.from(hashApiKey(m[1]));
  const stored = Buffer.from(storedHash);
  return given.length === stored.length && timingSafeEqual(given, stored);
}

/** True from the moment the ten minutes are up, not one millisecond later. */
export function isExpired(createdAtMs: number, nowMs: number): boolean {
  return nowMs - createdAtMs >= HANDOFF_TTL_MS;
}
