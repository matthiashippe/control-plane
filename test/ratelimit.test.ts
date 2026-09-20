import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { cleanupExpired, openDb } from "../src/db.js";
import { clientKey, RateLimiter } from "../src/ratelimit.js";

describe("RateLimiter", () => {
  it("lets the limit through and blocks afterwards until the window expires", () => {
    let now = 1_000_000;
    const rl = new RateLimiter({ limit: 3, windowMs: 10_000, now: () => now });

    for (let i = 0; i < 3; i++) expect(rl.check("a").allowed, `request ${i + 1} must pass`).toBe(true);
    const blocked = rl.check("a");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(10);

    now += 10_000;
    expect(rl.check("a").allowed, "free again after the window").toBe(true);
  });

  it("keeps the counters separate per key", () => {
    const rl = new RateLimiter({ limit: 1, windowMs: 10_000 });
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("a").allowed).toBe(false);
    expect(rl.check("b").allowed, "another client must not be punished along with the first").toBe(true);
  });

  it("does not grow without bound, even when every request comes from a new address", () => {
    // Otherwise the limiter is itself the memory leak it is supposed to protect against.
    let now = 0;
    const rl = new RateLimiter({ limit: 5, windowMs: 1_000, now: () => now, maxKeys: 100 });
    for (let i = 0; i < 5_000; i++) {
      now += 1;
      rl.check(`ip-${i}`);
    }
    expect(rl.size()).toBeLessThanOrEqual(100);
  });

  it("reads the real client address behind the proxy, not the one the client claims", () => {
    // Caddy appends the real address at the end. Reading the first entry would let any client
    // fake as many identities as it likes with a self-set X-Forwarded-For.
    const h = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 203.0.113.9" });
    expect(clientKey(h)).toBe("203.0.113.9");
    expect(clientKey(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientKey(new Headers())).toBe("unknown");
  });
});

describe("rate limiting on the open paths", () => {
  it("caps /v1/auth/nonce and answers 429 with Retry-After", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, rateLimit: { limit: 5, windowMs: 60_000 } });
    const call = () => app.request("/v1/auth/nonce", { method: "POST", headers: { "x-forwarded-for": "203.0.113.1" } });

    for (let i = 0; i < 5; i++) expect((await call()).status).toBe(200);
    const res = await call();
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(((await res.json()) as { error: string }).error).toBe("rate_limited");

    // The database must not keep growing while that happens: that is the whole point.
    const count = (db.prepare("SELECT count(*) AS n FROM siwe_nonces").get() as { n: number }).n;
    expect(count).toBe(5);
  });

  it("lets the public page and /health through without a cap", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, rateLimit: { limit: 2, windowMs: 60_000 } });
    for (let i = 0; i < 20; i++) {
      expect((await app.request("/health")).status).toBe(200);
      expect((await app.request("/")).status).toBe(200);
    }
  });
});

describe("cleanupExpired", () => {
  it("removes old nonces and expired sessions but keeps settled payments", () => {
    const db = openDb(":memory:");
    const now = Date.UTC(2026, 8, 19, 12, 0, 0);
    const day = 24 * 60 * 60 * 1000;

    db.prepare("INSERT INTO siwe_nonces (nonce, issued_at) VALUES (?, ?)").run("old", now - 2 * day);
    db.prepare("INSERT INTO siwe_nonces (nonce, issued_at) VALUES (?, ?)").run("fresh", now - 60_000);
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run("0xa", new Date(now).toISOString());
    db.prepare("INSERT INTO sessions (token, address, expires_at) VALUES (?, ?, ?)").run("expired", "0xa", now - 1000);
    db.prepare("INSERT INTO sessions (token, address, expires_at) VALUES (?, ?, ?)").run("valid", "0xa", now + day);
    const payment = (nonce: string, status: string, created: number) =>
      db
        .prepare(
          "INSERT INTO payments (nonce, from_address, to_address, value_atomic, credits_mc, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(nonce, "0xa", "0xa", "1", 1000, status, new Date(created).toISOString());
    payment("p-old-failed", "failed", now - 40 * day);
    payment("p-new-failed", "failed", now - 1 * day);
    payment("p-old-settled", "settled", now - 400 * day);

    const removed = cleanupExpired(db, now);

    expect(removed).toEqual({ nonces: 1, sessions: 1, payments: 1 });
    expect((db.prepare("SELECT count(*) AS n FROM siwe_nonces").get() as { n: number }).n).toBe(1);
    expect((db.prepare("SELECT count(*) AS n FROM sessions").get() as { n: number }).n).toBe(1);
    const left = db.prepare("SELECT nonce FROM payments ORDER BY nonce").all() as { nonce: string }[];
    expect(left.map((p) => p.nonce), "a settled payment is the receipt of a credit and stays").toEqual([
      "p-new-failed",
      "p-old-settled",
    ]);
  });
});
