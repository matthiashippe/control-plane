/**
 * GET /card/<package>?address=<wallet> (goals/wache/01): the one way to the card checkout, against createApp with an empty
 * database. No network, no port.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb, type Db } from "../src/db.js";

const A = "0x" + "ab".repeat(20);
const B = "0x" + "cd".repeat(20);
const C = "0x" + "ef".repeat(20);
const NOW = new Date("2026-11-22T12:00:00.000Z");
const PAUSED = "Card payment is paused. Your automaton can still top up with USDC on Base:";

let db: Db;
let app: ReturnType<typeof createApp>;
const savedUrl = process.env.CP_PUBLIC_URL;

beforeEach(() => {
  process.env.CP_PUBLIC_URL = "https://automatonhost.com";
  db = openDb(":memory:");
  app = createApp({ db, now: () => NOW });
});
afterEach(() => {
  if (savedUrl === undefined) delete process.env.CP_PUBLIC_URL;
  else process.env.CP_PUBLIC_URL = savedUrl;
});

function refund(address: string, shortfallMc: number, mode: "live" | "test" = "live") {
  const at = NOW.toISOString();
  db.prepare(
    "INSERT INTO card_orders (order_id, product_id, address, mode, status, credited_mc, reversed_mc, shortfall_mc, created_at, " +
      "updated_at) VALUES (?, '771280', ?, ?, 'reversed', ?, 0, ?, ?, ?)",
  ).run(`R${address.slice(2, 6)}${shortfallMc}${mode}`, address, mode, shortfallMc, shortfallMc, at, at);
}

async function get(path: string) {
  const res = await app.request(`https://automatonhost.com${path}`);
  return { res, text: await res.text() };
}

describe("GET /card/:package", () => {
  it("sends an open checkout with 302 to digistore24 with the address as custom", async () => {
    const mixed = "0x" + "aB".repeat(20);
    for (const [key, product] of [["5", "771278"], ["20", "771279"], ["50", "771280"]]) {
      const { res } = await get(`/card/${key}?address=${mixed}`);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(`https://www.checkout-ds24.com/product/${product}/?custom=${A}`);
    }
  });

  it("shows the way over USDC instead of the checkout once the breaker is on", async () => {
    refund(C, 5_000_000);
    const { res, text } = await get(`/card/5?address=${A}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(text).toContain(`${PAUSED} <a href="https://automatonhost.com/pay/5/${A}">`);
    expect(text).not.toContain("checkout-ds24");
    // Test orders never close it.
    db.prepare("DELETE FROM card_orders").run();
    refund(C, 50_000_000, "test");
    expect((await get(`/card/5?address=${A}`)).res.status).toBe(302);
  });

  it("shows the same sentence for a wallet that had a refund", async () => {
    refund(B, 0);
    const own = await get(`/card/20?address=${B}`);
    expect(own.res.status).toBe(200);
    expect(own.text).not.toContain("checkout-ds24");
    expect(own.text).toContain(`${PAUSED} <a href="https://automatonhost.com/pay/5/${B}">`);
    // Breaker on for everybody: the very same page, only the wallet differs.
    refund(C, 5_000_000);
    const all = await get(`/card/20?address=${A}`);
    expect(all.text.replaceAll(A, "W")).toBe(own.text.replaceAll(B, "W"));
  });

  it("asks for the address with a form when it is missing or malformed", async () => {
    for (const q of ["", "?address=", "?address=0x12", `?address=${A}00`, `?address=${A.slice(2)}`]) {
      const { res, text } = await get(`/card/5${q}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
      expect(text).toContain('<form method="get">');
      expect(text).toContain('name="address"');
      expect(text).toContain('pattern="0x[0-9a-fA-F]{40}" required');
      expect(text).not.toContain("checkout-ds24");
    }
  });

  it("answers 404 for an unknown package", async () => {
    for (const key of ["7", "0", "5.5", "771278"]) {
      expect((await get(`/card/${key}?address=${A}`)).res.status).toBe(404);
    }
  });

  it("is never cached and never indexed", async () => {
    const cases = [`/card/5?address=${A}`, "/card/5", `/card/7?address=${A}`];
    refund(B, 0);
    cases.push(`/card/5?address=${B}`);
    for (const path of cases) {
      const { res } = await get(path);
      expect(res.headers.get("cache-control")).toContain("no-store");
      expect(res.headers.get("x-robots-tag")).toBe("noindex");
    }
  });
});

