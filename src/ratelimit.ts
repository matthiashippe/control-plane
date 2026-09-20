/**
 * Simple rate limiting for the paths that are reachable without an API key.
 *
 * Why at all: `/v1/auth/nonce`, `/v1/auth/verify`, `/v1/auth/api-keys` and `/pay/...` write to the
 * database on every call, and `/pay` additionally fires a request at the facilitator. Without a
 * limit anyone can fill the disk and drive up our facilitator cost (security review 19.09.2026).
 * An API key costs nothing, so limiting only behind it does not help.
 *
 * Deliberately in-process and without a dependency: the service runs as a single container, a
 * restart resets the counters, and that is acceptable. A distributed limiter would be false
 * precision here.
 */

/** One window per key: the current count and when the window started. */
interface Window {
  count: number;
  since: number;
}

export interface RateLimitOptions {
  /** Allowed requests per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Testable clock. */
  now?: () => number;
  /** Cap on the number of observed keys, so the limiter does not become a leak itself. */
  maxKeys?: number;
}

export class RateLimiter {
  private readonly windows = new Map<string, Window>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly maxKeys: number;

  constructor(opts: RateLimitOptions) {
    this.limit = opts.limit;
    this.windowMs = opts.windowMs;
    this.now = opts.now ?? Date.now;
    this.maxKeys = opts.maxKeys ?? 50_000;
  }

  /** true = let it through. On false, `retryAfterSec` says how long the window still runs. */
  check(key: string): { allowed: boolean; retryAfterSec: number } {
    const now = this.now();
    const existing = this.windows.get(key);

    if (!existing || now - existing.since >= this.windowMs) {
      // Clear out expired entries whenever a new key is added. That spreads the cleanup work
      // across the calls instead of needing a timer.
      if (this.windows.size >= this.maxKeys) this.evict(now);
      this.windows.set(key, { count: 1, since: now });
      return { allowed: true, retryAfterSec: 0 };
    }

    existing.count += 1;
    if (existing.count > this.limit) {
      return { allowed: false, retryAfterSec: Math.ceil((existing.since + this.windowMs - now) / 1000) };
    }
    return { allowed: true, retryAfterSec: 0 };
  }

  private evict(now: number): void {
    for (const [key, w] of this.windows) {
      if (now - w.since >= this.windowMs) this.windows.delete(key);
    }
    // If everything is still full afterwards, a distributed attack is running. Then drop the
    // oldest part rather than taking up unbounded memory.
    if (this.windows.size >= this.maxKeys) {
      const half = Math.floor(this.windows.size / 2);
      let i = 0;
      for (const key of this.windows.keys()) {
        if (i++ >= half) break;
        this.windows.delete(key);
      }
    }
  }

  /** For tests and diagnostics only. */
  size(): number {
    return this.windows.size;
  }
}

/**
 * Client IP behind Caddy. `X-Forwarded-For` can be forged by the client, but Caddy appends the
 * real address as the last entry, so it is read from the back. If the header is missing, a fixed
 * key applies: then we limit globally, which is still better than not at all.
 */
export function clientKey(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((t) => t.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return headers.get("x-real-ip") ?? "unknown";
}
