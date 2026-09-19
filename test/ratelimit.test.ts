import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { cleanupExpired, openDb } from "../src/db.js";
import { clientSchluessel, RateLimiter } from "../src/ratelimit.js";

describe("RateLimiter", () => {
  it("lässt das Limit durch und blockt danach, bis das Fenster abläuft", () => {
    let jetzt = 1_000_000;
    const rl = new RateLimiter({ limit: 3, fensterMs: 10_000, now: () => jetzt });

    for (let i = 0; i < 3; i++) expect(rl.pruefe("a").erlaubt, `Anfrage ${i + 1} muss durch`).toBe(true);
    const geblockt = rl.pruefe("a");
    expect(geblockt.erlaubt).toBe(false);
    expect(geblockt.retryAfterSec).toBeGreaterThan(0);
    expect(geblockt.retryAfterSec).toBeLessThanOrEqual(10);

    jetzt += 10_000;
    expect(rl.pruefe("a").erlaubt, "nach dem Fenster wieder frei").toBe(true);
  });

  it("trennt die Zähler je Schlüssel", () => {
    const rl = new RateLimiter({ limit: 1, fensterMs: 10_000 });
    expect(rl.pruefe("a").erlaubt).toBe(true);
    expect(rl.pruefe("a").erlaubt).toBe(false);
    expect(rl.pruefe("b").erlaubt, "ein anderer Client darf nicht mitbestraft werden").toBe(true);
  });

  it("wächst nicht unbegrenzt, auch wenn jede Anfrage von einer neuen Adresse kommt", () => {
    // Sonst ist der Limiter selbst das Speicherleck, gegen das er schützen soll.
    let jetzt = 0;
    const rl = new RateLimiter({ limit: 5, fensterMs: 1_000, now: () => jetzt, maxSchluessel: 100 });
    for (let i = 0; i < 5_000; i++) {
      jetzt += 1;
      rl.pruefe(`ip-${i}`);
    }
    expect(rl.groesse()).toBeLessThanOrEqual(100);
  });

  it("liest die echte Client-Adresse hinter dem Proxy, nicht die vom Client behauptete", () => {
    // Caddy hängt die echte Adresse hinten an. Läse man den ersten Eintrag, könnte jeder Client
    // durch einen selbst gesetzten X-Forwarded-For beliebig viele Identitäten vortäuschen.
    const h = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 203.0.113.9" });
    expect(clientSchluessel(h)).toBe("203.0.113.9");
    expect(clientSchluessel(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientSchluessel(new Headers())).toBe("unbekannt");
  });
});

describe("Rate Limiting an den offenen Pfaden", () => {
  it("begrenzt /v1/auth/nonce und antwortet mit 429 samt Retry-After", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, rateLimit: { limit: 5, fensterMs: 60_000 } });
    const ruf = () => app.request("/v1/auth/nonce", { method: "POST", headers: { "x-forwarded-for": "203.0.113.1" } });

    for (let i = 0; i < 5; i++) expect((await ruf()).status).toBe(200);
    const res = await ruf();
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(((await res.json()) as { error: string }).error).toBe("rate_limited");

    // Die Datenbank darf dabei nicht weiter wachsen: genau das ist der Zweck.
    const anzahl = (db.prepare("SELECT count(*) AS n FROM siwe_nonces").get() as { n: number }).n;
    expect(anzahl).toBe(5);
  });

  it("lässt die öffentliche Seite und /health unbegrenzt durch", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, rateLimit: { limit: 2, fensterMs: 60_000 } });
    for (let i = 0; i < 20; i++) {
      expect((await app.request("/health")).status).toBe(200);
      expect((await app.request("/")).status).toBe(200);
    }
  });
});

describe("cleanupExpired", () => {
  it("entfernt alte Nonces und abgelaufene Sessions, behält aber gesettelte Zahlungen", () => {
    const db = openDb(":memory:");
    const jetzt = Date.UTC(2026, 8, 19, 12, 0, 0);
    const tag = 24 * 60 * 60 * 1000;

    db.prepare("INSERT INTO siwe_nonces (nonce, issued_at) VALUES (?, ?)").run("alt", jetzt - 2 * tag);
    db.prepare("INSERT INTO siwe_nonces (nonce, issued_at) VALUES (?, ?)").run("frisch", jetzt - 60_000);
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run("0xa", new Date(jetzt).toISOString());
    db.prepare("INSERT INTO sessions (token, address, expires_at) VALUES (?, ?, ?)").run("abgelaufen", "0xa", jetzt - 1000);
    db.prepare("INSERT INTO sessions (token, address, expires_at) VALUES (?, ?, ?)").run("gueltig", "0xa", jetzt + tag);
    const payment = (nonce: string, status: string, created: number) =>
      db
        .prepare(
          "INSERT INTO payments (nonce, from_address, to_address, value_atomic, credits_mc, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(nonce, "0xa", "0xa", "1", 1000, status, new Date(created).toISOString());
    payment("p-alt-failed", "failed", jetzt - 40 * tag);
    payment("p-neu-failed", "failed", jetzt - 1 * tag);
    payment("p-alt-settled", "settled", jetzt - 400 * tag);

    const weg = cleanupExpired(db, jetzt);

    expect(weg).toEqual({ nonces: 1, sessions: 1, payments: 1 });
    expect((db.prepare("SELECT count(*) AS n FROM siwe_nonces").get() as { n: number }).n).toBe(1);
    expect((db.prepare("SELECT count(*) AS n FROM sessions").get() as { n: number }).n).toBe(1);
    const uebrig = db.prepare("SELECT nonce FROM payments ORDER BY nonce").all() as { nonce: string }[];
    expect(uebrig.map((p) => p.nonce), "eine gesettelte Zahlung ist der Beleg einer Gutschrift und bleibt").toEqual([
      "p-alt-settled",
      "p-neu-failed",
    ]);
  });
});
