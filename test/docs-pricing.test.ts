/**
 * /docs and /pricing (goals/fehler/12): an agent reading for a person asked both paths on 2026-11-23 and got 404 twice.
 * /docs sends it to /llms.txt; /pricing lists every price from the code, the card packages only while the card breaker is
 * off. Against createApp with an in-memory database, no network, no port.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb, type Db } from "../src/db.js";
import { CARD_BREAKER_SHORTFALL_MC, packageKey } from "../src/payments/card-way.js";
import { CARD_PACKAGES } from "../src/payments/digistore.js";
import { TOPUP_TIERS_USD } from "../src/payments/pay.js";
import { MARKUP } from "../src/inference/proxy.js";

const OTHER = "0x" + "ef".repeat(20);
const ORIGIN = "https://automatonhost.com";
const savedUrl = process.env.CP_PUBLIC_URL;

beforeEach(() => {
  process.env.CP_PUBLIC_URL = ORIGIN;
});
afterEach(() => {
  if (savedUrl === undefined) delete process.env.CP_PUBLIC_URL;
  else process.env.CP_PUBLIC_URL = savedUrl;
});

/** A refunded live order of another wallet whose shortfall alone turns the breaker on. */
function tripBreaker(db: Db) {
  const at = new Date().toISOString();
  db.prepare(
    "INSERT INTO card_orders (order_id, product_id, address, mode, status, credited_mc, reversed_mc, shortfall_mc, created_at, " +
      "updated_at) VALUES ('TRIP', '771278', ?, 'live', 'reversed', ?, 0, ?, ?, ?)",
  ).run(OTHER, CARD_BREAKER_SHORTFALL_MC, CARD_BREAKER_SHORTFALL_MC, at, at);
}

async function get(path: string, breakerOn = false) {
  const db = openDb(":memory:");
  if (breakerOn) tripBreaker(db);
  const res = await createApp({ db }).request(path);
  return { res, body: await res.text() };
}

describe("/docs and /pricing", () => {
  it("redirects /docs to /llms.txt", async () => {
    for (const path of ["/docs", "/docs/"]) {
      const { res } = await get(path);
      expect(res.status, path).toBe(302);
      expect(res.headers.get("location"), path).toBe(`${ORIGIN}/llms.txt`);
    }
  });

  it("answers /pricing with every card package while the breaker is off", async () => {
    for (const path of ["/pricing", "/pricing/"]) {
      const { res, body } = await get(path);
      expect(res.status, path).toBe(200);
      expect(res.headers.get("content-type"), path).toMatch(/^text\/plain; charset=utf-8/i);
      expect(res.headers.get("cache-control"), path).toBe("no-store");
      expect(body.split("\n")[0]).toBe("# Prices: automatonhost.com");
      for (const pkg of CARD_PACKAGES) {
        expect(body, path).toContain(`${ORIGIN}/card/${packageKey(pkg)}`);
        expect(body, path).toContain(`${(pkg.grossEurCents / 100).toFixed(2)} EUR`);
      }
      expect(body).toContain("card, PayPal or Apple Pay");
      expect(body).toContain(`Topup tiers in USD: ${TOPUP_TIERS_USD.join(", ")}.`);
      expect(body).toContain(`${ORIGIN}/pay/{usd}/{wallet}`);
      expect(body).toContain("Credits are not redeemable and not transferable.");
    }
  });

  it("names no card on /pricing while the breaker is on", async () => {
    for (const path of ["/pricing", "/pricing/"]) {
      const { res, body } = await get(path, true);
      expect(res.status, path).toBe(200);
      expect(body, path).not.toMatch(/\/card\/|card|paypal|apple pay/i);
      for (const pkg of CARD_PACKAGES) expect(body, path).not.toContain(`${(pkg.grossEurCents / 100).toFixed(2)} EUR`);
      expect(body, path).toContain(`Topup tiers in USD: ${TOPUP_TIERS_USD.join(", ")}.`);
      expect(body, path).toContain(`${ORIGIN}/pay/{usd}/{wallet}`);
    }
  });

  it("states the same inference price on /pricing as in /llms.txt", async () => {
    const llms = (await get("/llms.txt")).body;
    const pricing = (await get("/pricing")).body;
    const sentence = `billed at purchase cost times ${MARKUP}`;
    expect(llms).toContain(sentence);
    expect(pricing).toContain(sentence);
  });
});
