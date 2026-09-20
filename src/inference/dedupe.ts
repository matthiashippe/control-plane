/**
 * Coalescing concurrent, identical inference requests.
 *
 * Why this is needed: the upstream runtime aborts an inference call after 60 seconds
 * (`INFERENCE_TIMEOUT_MS` in `conway/inference.ts`) and retries it on 429, 500, 502, 503 and 504.
 * Our own call at the purchasing provider, on the other hand, runs for up to 120 seconds. If an
 * answer takes somewhere in between, the client sees a timeout and sends the same request again
 * while the first one is still running. Without coalescing we then buy twice and charge twice: the
 * customer pays double for an answer they get once.
 *
 * This is the same bug Conway has on topups (issue #393, "Retry-driven duplicate USDC topups"),
 * and the reason why 44 wallets there trigger more than two payments a month on average. We
 * document that bug in our own market research; having it ourselves would be embarrassing and
 * expensive.
 *
 * Deliberately narrow: requests are coalesced only while the first call is **still running**. Two
 * deliberately identical requests one after the other still get two answers, and with
 * `temperature > 0` the variance an agent may expect is preserved.
 */

import { createHash } from "node:crypto";

/** Everything that determines the answer. The address is part of it so nothing is ever shared across tenants. */
export function requestKey(address: string, body: unknown): string {
  return createHash("sha256")
    .update(address.toLowerCase())
    .update("\u0000")
    .update(JSON.stringify(body ?? null))
    .digest("hex");
}

export class RequestCoalescer<T> {
  private readonly inflight = new Map<string, Promise<T>>();

  /**
   * Runs `work`, or attaches to a call with the same key that is already running. Also returns
   * whether this call was the first one; that belongs in the ledger meta, so it stays visible
   * afterwards how often retries were coalesced.
   */
  async run(key: string, work: () => Promise<T>): Promise<{ value: T; coalesced: boolean }> {
    const existing = this.inflight.get(key);
    if (existing) return { value: await existing, coalesced: true };

    const p = work();
    this.inflight.set(key, p);
    try {
      return { value: await p, coalesced: false };
    } finally {
      // Remove it only after completion, not before: otherwise a retry arriving a millisecond too
      // late would still start a second purchase.
      this.inflight.delete(key);
    }
  }

  /** For tests and diagnostics only. */
  inflightCount(): number {
    return this.inflight.size;
  }
}
