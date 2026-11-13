/**
 * POST /v1/handoff (goals/konto/02, Punkt 5): what the terminal gets to show the person, and what it refuses.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import jsQR from "jsqr";
import { siteOrigin } from "../src/public/site.js";
import { ATLAS, START, create, handoffApp, post } from "./handoff-helpers.js";

/** The half-block text back into a picture a camera would see: dark modules black, light white, four pixels a module. */
function readQr(text: string): string | null {
  const lines = text.split("\n");
  const size = lines[0].length;
  const rows: boolean[][] = [];
  for (const line of lines) {
    const top: boolean[] = [], bottom: boolean[] = [];
    for (const ch of line) {
      top.push(ch === "█" || ch === "▀");
      bottom.push(ch === "█" || ch === "▄");
    }
    rows.push(top, bottom);
  }
  const scale = 4, w = size * scale, h = rows.length * scale;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dark = rows[Math.floor(y / scale)][Math.floor(x / scale)];
    const i = (y * w + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = dark ? 0 : 255;
    data[i + 3] = 255;
  }
  return jsQR(data, w, h)?.data ?? null;
}

describe("POST /v1/handoff", () => {
  it("answers 201 with code, short link, number, end of the ten minutes and the terminal's secret", async () => {
    const { app } = handoffApp();
    const res = await post(app, ATLAS);
    expect(res.status).toBe(201);
    const h = await res.json();
    expect(h.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{10,}$/);
    expect(h.url).toBe(`${siteOrigin()}/h/${h.code}`);
    expect(Number.isInteger(h.match)).toBe(true);
    expect(h.match).toBeGreaterThanOrEqual(10);
    expect(h.match).toBeLessThanOrEqual(99);
    expect(h.expires_at).toBe(new Date(START + 600_000).toISOString());
    expect(typeof h.poll_token).toBe("string");
    expect(h.poll_token.length).toBeGreaterThanOrEqual(32);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("carries a QR code that an independent decoder reads back as exactly the short link", async () => {
    const { app } = handoffApp();
    const h = await create(app);
    expect(h.qr).toMatch(/^[ ▀▄█\n]+$/);
    const lines = h.qr.split("\n");
    expect(new Set(lines.map((l) => l.length)).size, "every line equally wide").toBe(1);
    // A quiet zone of four modules: the first two lines of text (four rows of modules) are empty.
    expect(lines[0].trim()).toBe("");
    expect(lines[1].trim()).toBe("");
    expect(readQr(h.qr)).toBe(h.url);
    // The decoder is not just saying yes: a code for another link reads as that link.
    const other = await create(app);
    expect(readQr(other.qr)).toBe(other.url);
    expect(other.url).not.toBe(h.url);
  });

  it("stores the terminal's secret only as its hash", async () => {
    const { app, db } = handoffApp();
    const h = await create(app);
    const rows = db.prepare("SELECT * FROM handoffs").all() as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    for (const value of Object.values(rows[0])) expect(String(value)).not.toContain(h.poll_token);
    expect(rows[0].poll_hash).toBe(createHash("sha256").update(h.poll_token).digest("hex"));
    expect(rows[0].state).toBe("pending");
  });

  it("refuses an empty name and one of 65 characters with 400, and takes one of 64", async () => {
    const { app } = handoffApp();
    for (const name of ["", "x".repeat(65), 42, null, "line\nbreak"]) {
      const res = await post(app, { ...ATLAS, automaton_name: name });
      expect(res.status, JSON.stringify(name)).toBe(400);
      expect((await res.json()).error).toBe("invalid_handoff");
    }
    expect((await post(app, { ...ATLAS, automaton_name: "x".repeat(64) })).status).toBe(201);
  });

  it("refuses amounts that are no whole cents or no whole number with 400", async () => {
    const { app } = handoffApp();
    const bad = ["5000001", "5.00", "5,00", "-10000", "0", "", "1e7", " 5000000", 5000000, null];
    for (const field of ["daily_limit_usdc", "amount_usdc"]) {
      for (const v of bad) {
        const res = await post(app, { ...ATLAS, [field]: v });
        expect(res.status, `${field} ${JSON.stringify(v)}`).toBe(400);
      }
    }
    expect((await post(app, "{not json")).status).toBe(400);
    expect((await post(app, { ...ATLAS, daily_limit_usdc: "10000", amount_usdc: "1230000" })).status).toBe(201);
  });

  it("gives two handoffs different codes and different secrets", async () => {
    const { app } = handoffApp();
    const a = await create(app);
    const b = await create(app);
    expect(a.code).not.toBe(b.code);
    expect(a.poll_token).not.toBe(b.poll_token);
    expect(a.url).not.toBe(b.url);
  });

  it("answers 429 once one address creates more than the rate limit allows", async () => {
    const { app } = handoffApp({ rateLimit: { limit: 3, windowMs: 60_000 } });
    const from = { "x-forwarded-for": "198.51.100.7" };
    for (let i = 0; i < 3; i++) expect((await post(app, ATLAS, from)).status).toBe(201);
    const res = await post(app, ATLAS, from);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toMatch(/^[0-9]+$/);
    // Another address is not held by the first.
    expect((await post(app, ATLAS, { "x-forwarded-for": "198.51.100.8" })).status).toBe(201);
  });

  it("tells an agent that looks first what to send, without a key", async () => {
    const { app } = handoffApp();
    const res = await app.request("/v1/handoff");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.method).toBe("POST");
    expect(body.answer).toEqual(["code", "url", "qr", "match", "expires_at", "poll_token"]);
  });
});
