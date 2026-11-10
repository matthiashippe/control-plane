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

/** The caller went away before the answer was there. Nothing may be charged to it. */
export class ClientAbortedError extends Error {
  constructor() {
    super("client aborted the request");
    this.name = "ClientAbortedError";
  }
}

interface Inflight<T> {
  promise: Promise<T>;
  /** Aborted once the last caller waiting for this work has gone. */
  controller: AbortController;
  waiters: number;
}

export class RequestCoalescer<T> {
  private readonly inflight = new Map<string, Inflight<T>>();

  /**
   * Runs `work`, or attaches to a call with the same key that is already running. Also returns
   * whether this call was the first one; that belongs in the ledger meta, so it stays visible
   * afterwards how often retries were coalesced.
   *
   * `signal` is the caller's own abort (the client closed the connection). A caller that aborts
   * leaves at once with `ClientAbortedError`. The shared work keeps running as long as any other
   * caller still waits for it, because that caller still gets the answer and pays for it once.
   * Only when the last caller has gone is the signal handed to `work` aborted, so the purchase is
   * cancelled upstream and nobody is charged (abrechnung 01, 2026-11-10).
   */
  async run(
    key: string,
    work: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<{ value: T; coalesced: boolean }> {
    if (signal?.aborted) throw new ClientAbortedError();

    let entry = this.inflight.get(key);
    const coalesced = entry !== undefined;
    if (!entry) {
      const controller = new AbortController();
      const created: Inflight<T> = { promise: work(controller.signal), controller, waiters: 0 };
      entry = created;
      this.inflight.set(key, created);
      // Remove it only after completion, not before: otherwise a retry arriving a millisecond too
      // late would still start a second purchase. Attached to the work itself and not to the first
      // caller, because the first caller may leave long before the work ends.
      created.promise
        .catch(() => undefined)
        .finally(() => {
          if (this.inflight.get(key) === created) this.inflight.delete(key);
        });
    }
    const current = entry;
    current.waiters += 1;

    let left = false;
    const leave = () => {
      if (left) return;
      left = true;
      current.waiters -= 1;
    };

    if (!signal) {
      try {
        return { value: await current.promise, coalesced };
      } finally {
        leave();
      }
    }

    return new Promise<{ value: T; coalesced: boolean }>((resolve, reject) => {
      const onAbort = () => {
        if (left) return;
        leave();
        if (current.waiters === 0) {
          // Nobody waits any more: cancel upstream, and let a new identical request start fresh
          // instead of attaching to work whose answer will not be delivered or charged.
          current.controller.abort();
          if (this.inflight.get(key) === current) this.inflight.delete(key);
        }
        reject(new ClientAbortedError());
      };
      signal.addEventListener("abort", onAbort, { once: true });
      current.promise.then(
        (value) => {
          signal.removeEventListener("abort", onAbort);
          if (left) return;
          leave();
          resolve({ value, coalesced });
        },
        (err) => {
          signal.removeEventListener("abort", onAbort);
          if (left) return;
          leave();
          reject(err);
        },
      );
    });
  }

  /** For tests and diagnostics only. */
  inflightCount(): number {
    return this.inflight.size;
  }
}
