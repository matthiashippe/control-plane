/**
 * The breaker of the card checkout (goals/wache/01): the one calculation in src/payments/card-way.ts.
 *
 * Fixed clock, no network. A row in `card_orders` stands for an order whose refund or chargeback came at `updated_at`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../src/db.js";
import { CARD_PACKAGES } from "../src/payments/digistore.js";
import {
  CARD_BREAKER_SHORTFALL_MC,
  CARD_BREAKER_WINDOW_DAYS,
  cardBreaker,
  cardLink,
  cardRedirect,
  cardUrlFor,
  checkoutUrl,
  packageByKey,
  packageKey,
  stripCardWay,
  walletRefunded,
} from "../src/payments/card-way.js";

const NOW = new Date("2026-11-22T12:00:00.000Z");
const DAY = 86_400_000;
const A = "0x" + "ab".repeat(20);
const B = "0x" + "cd".repeat(20);
const C = "0x" + "ef".repeat(20);

let db: Db;
let n = 0;
const savedUrl = process.env.CP_PUBLIC_URL;

beforeEach(() => {
  db = openDb(":memory:");
  process.env.CP_PUBLIC_URL = "https://automatonhost.com";
});
afterEach(() => {
  if (savedUrl === undefined) delete process.env.CP_PUBLIC_URL;
  else process.env.CP_PUBLIC_URL = savedUrl;
});

function order(o: { address?: string | null; mode?: "live" | "test"; status?: string; shortfallMc?: number; at?: Date }) {
  const at = (o.at ?? NOW).toISOString();
  const shortfall = o.shortfallMc ?? 0;
  db.prepare(
    "INSERT INTO card_orders (order_id, product_id, address, mode, status, credited_mc, reversed_mc, shortfall_mc, created_at, " +
      "updated_at) VALUES (?, '771280', ?, ?, ?, ?, 0, ?, ?, ?)",
  ).run(`O${++n}`, o.address === undefined ? C : o.address, o.mode ?? "live", o.status ?? "reversed", shortfall, shortfall, at, at);
}

describe("the breaker", () => {
  it("stays off below 50 USD of shortfall from live refunds in 60 days", () => {
    expect(cardBreaker(db, NOW)).toEqual({ refunds60d: 0, shortfallMc: 0, on: false });
    order({ shortfallMc: 2_000_000 });
    order({ shortfallMc: CARD_BREAKER_SHORTFALL_MC - 2_000_001 });
    // A booked order with credit is no refund and counts nothing.
    order({ status: "booked", shortfallMc: 9_000_000 });
    expect(cardBreaker(db, NOW)).toEqual({ refunds60d: 2, shortfallMc: CARD_BREAKER_SHORTFALL_MC - 1, on: false });
  });

  it("turns on at exactly 50 USD of shortfall", () => {
    expect(CARD_BREAKER_SHORTFALL_MC).toBe(50 * 100_000);
    order({ shortfallMc: CARD_BREAKER_SHORTFALL_MC - 1 });
    expect(cardBreaker(db, NOW).on).toBe(false);
    order({ shortfallMc: 1 });
    expect(cardBreaker(db, NOW)).toEqual({ refunds60d: 2, shortfallMc: 5_000_000, on: true });
  });

  it("counts chargebacks like refunds", () => {
    // reverse() in src/payments/digistore.ts writes on_refund and on_chargeback the same way: status reversed with its shortfall.
    order({ shortfallMc: 3_000_000 });
    order({ shortfallMc: 2_000_000, at: new Date(NOW.getTime() - 3 * DAY) });
    expect(cardBreaker(db, NOW)).toEqual({ refunds60d: 2, shortfallMc: 5_000_000, on: true });
  });

  it("never counts test orders", () => {
    order({ mode: "test", shortfallMc: 50_000_000 });
    order({ mode: "test", status: "test", shortfallMc: 50_000_000 });
    expect(cardBreaker(db, NOW)).toEqual({ refunds60d: 0, shortfallMc: 0, on: false });
    expect(walletRefunded(db, C)).toBe(false);
  });

  it("forgets a refund older than 60 days and opens again by itself", () => {
    expect(CARD_BREAKER_WINDOW_DAYS).toBe(60);
    const at = new Date(NOW.getTime() - 10 * DAY);
    order({ shortfallMc: 6_000_000, at });
    expect(cardBreaker(db, NOW).on).toBe(true);
    const edge = new Date(at.getTime() + CARD_BREAKER_WINDOW_DAYS * DAY);
    expect(cardBreaker(db, edge)).toEqual({ refunds60d: 1, shortfallMc: 6_000_000, on: true });
    const after = new Date(edge.getTime() + 1);
    expect(cardBreaker(db, after)).toEqual({ refunds60d: 0, shortfallMc: 0, on: false });
    expect(cardRedirect(db, "5", A, after).kind).toBe("checkout");
  });

  it("closes the checkout for a wallet that had a refund, also without shortfall", () => {
    order({ address: B, shortfallMc: 0, at: new Date(NOW.getTime() - 400 * DAY) });
    expect(cardBreaker(db, NOW).on).toBe(false);
    expect(walletRefunded(db, B)).toBe(true);
    expect(walletRefunded(db, B.toUpperCase().replace("0X", "0x"))).toBe(true);
    expect(walletRefunded(db, A)).toBe(false);
    expect(cardRedirect(db, "20", B, NOW)).toEqual({ kind: "paused", topupUrl: `https://automatonhost.com/pay/5/${B}` });
    expect(cardRedirect(db, "20", A, NOW).kind).toBe("checkout");
  });
});

describe("the links", () => {
  it("builds every link to the checkout through /card/<package>", () => {
    expect(CARD_PACKAGES.map(packageKey)).toEqual(["5", "20", "50"]);
    for (const pkg of CARD_PACKAGES) {
      const key = packageKey(pkg);
      expect(packageByKey(key)).toBe(pkg);
      expect(cardLink(pkg, A.toUpperCase().replace("0X", "0x"))).toBe(`https://automatonhost.com/card/${key}?address=${A}`);
      expect(checkoutUrl(pkg, A)).toBe(`https://www.checkout-ds24.com/product/${pkg.productId}/?custom=${A}`);
      expect(cardRedirect(db, key, A, NOW)).toEqual({ kind: "checkout", url: checkoutUrl(pkg, A) });
    }
    expect(cardLink(CARD_PACKAGES[0], "0x12")).toBeNull();
    expect(packageByKey("7")).toBeNull();
    expect(cardRedirect(db, "7", A, NOW).kind).toBe("unknown_package");
    expect(cardRedirect(db, "5", "0x12", NOW).kind).toBe("ask_address");
    expect(cardUrlFor(db, A, NOW)).toBe(`https://automatonhost.com/card/5?address=${A}`);
  });

  it("removes the card way between the markers only while the breaker is on", () => {
    const html = "<p>a</p><!--CARD--><a href=\"/card/5\">card</a><!--/CARD--><p>b</p><!--CARD-->x<!--/CARD-->";
    expect(stripCardWay(html, false)).toBe("<p>a</p><a href=\"/card/5\">card</a><p>b</p>x");
    expect(stripCardWay(html, true)).toBe("<p>a</p><p>b</p>");
    expect(stripCardWay("<p>no marks</p>", true)).toBe("<p>no marks</p>");
  });

  it("offers no card_url while the breaker is on", () => {
    order({ shortfallMc: CARD_BREAKER_SHORTFALL_MC });
    expect(cardUrlFor(db, A, NOW)).toBeNull();
    expect(cardRedirect(db, "5", A, NOW)).toEqual({ kind: "paused", topupUrl: `https://automatonhost.com/pay/5/${A}` });
    expect(cardUrlFor(db, A, new Date(NOW.getTime() + 61 * DAY))).toBe(`https://automatonhost.com/card/5?address=${A}`);
  });
});
