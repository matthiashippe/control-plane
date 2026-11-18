/**
 * The one rule for amounts in atomic USDC (goals/konto/07): `/v1/konto/limit` and `POST /v1/handoff` both read them here, so the
 * daily limit of an account and the amount of a handoff never accept different amounts.
 */

/** A positive whole number of atomic USDC in whole cents, as a string; anything else is null. */
export function parseUsdc(v: unknown): bigint | null {
  if (typeof v !== "string" || !/^[0-9]{1,18}$/.test(v)) return null;
  const n = BigInt(v);
  return n > 0n && n % 10_000n === 0n ? n : null;
}
