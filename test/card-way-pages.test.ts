/**
 * Start page and 402 under the card breaker (goals/wache/01): both take the way to the card checkout only from
 * src/payments/card-way.ts and drop it while the breaker is on. Against createApp and handleChat with an in-memory database,
 * the refunds stamped with the current time because the 402 reads the clock. No network, no port.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, type Db } from "../src/db.js";
import { MockProvider, MOCK_MODEL } from "../src/inference/mock.js";
import { Catalog, handleChat } from "../src/inference/proxy.js";
import { claimStarter } from "../src/credits/starter.js";
import { CARD_BREAKER_SHORTFALL_MC, cardRedirect } from "../src/payments/card-way.js";

const OTHER = "0x" + "ef".repeat(20);
const savedUrl = process.env.CP_PUBLIC_URL;

beforeEach(() => {
  process.env.CP_PUBLIC_URL = "https://automatonhost.com";
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

async function startPage(db: Db) {
  const app = createApp({ db });
  return (await app.request("/")).text();
}

/** A wallet with nothing left and no starter grant waiting, so the call answers 402. */
function emptyWallet() {
  const db = openDb(":memory:");
  for (;;) {
    try {
      claimStarter(db, privateKeyToAccount(generatePrivateKey()).address.toLowerCase());
    } catch {
      break;
    }
  }
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  const chat = async () => {
    const res = await handleChat(db, new Catalog([new MockProvider()]), address, {
      model: MOCK_MODEL.id,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.status).toBe(402);
    return res.body as { message: string; details: Record<string, unknown> };
  };
  return { db, address, chat };
}

describe("the start page under the card breaker", () => {
  it("drops the card block of the start page while the breaker is on", async () => {
    const db = openDb(":memory:");
    tripBreaker(db);
    const html = await startPage(db);
    expect(html).not.toContain('id="card"');
    expect(html).not.toContain("/card/5");
    expect(html).not.toContain("checkout-ds24");
    expect(html).not.toMatch(/<!--\/?CARD-->/);
    // The rest of the page stays.
    expect(html).toContain('data-soll="move"');
  });

  it("links nowhere to #card on the start page while the breaker is on", async () => {
    const db = openDb(":memory:");
    tripBreaker(db);
    const html = await startPage(db);
    // The block `card` is gone, so a link to it would lead nowhere (goals/wache/02).
    expect(html).not.toContain('id="card"');
    expect(html).not.toContain('href="#card"');
    expect(html.split('id="move"').length - 1).toBe(1);
  });

  it("keeps the card block of the start page without the markers while the breaker is off", async () => {
    const html = await startPage(openDb(":memory:"));
    expect(html).toContain('<section id="card" data-soll="card">');
    expect(html).not.toMatch(/<!--\/?CARD-->/);
    const targets = [...html.matchAll(/formaction="([^"]+)"/g)].map((m) => m[1]);
    expect(targets).toEqual(["/card/5", "/card/20", "/card/50"]);
    expect(html).toContain('<input name="address"');
    expect(html).not.toContain("checkout-ds24");
  });
});

describe("the 402 under the card breaker", () => {
  it("offers card_url through /card/5 in the 402 while the breaker is off", async () => {
    const { address, chat } = emptyWallet();
    const body = await chat();
    const url = `https://automatonhost.com/card/5?address=${address}`;
    expect(body.details.card_url).toBe(url);
    expect(body.message).toContain(`No crypto needed: pay by card, PayPal or Apple Pay at ${url} `);
    expect(JSON.stringify(body)).not.toContain("checkout-ds24");
  });

  it("names no card in the 402 while the breaker is on", async () => {
    const { db, address, chat } = emptyWallet();
    tripBreaker(db);
    const body = await chat();
    expect(body.details.card_url).toBeUndefined();
    expect(body.message).not.toContain("Pay by card");
    expect(JSON.stringify(body)).not.toMatch(/\/card\/|checkout-ds24/);
    // The way over USDC stays.
    expect(body.details.topup_url).toBe(`https://automatonhost.com/pay/5/${address}`);
  });

  it("names the same way over USDC in the 402 and on the paused page", async () => {
    const { db, address, chat } = emptyWallet();
    tripBreaker(db);
    const body = await chat();
    const paused = cardRedirect(db, "5", address, new Date());
    expect(paused.kind).toBe("paused");
    const topupUrl = (paused as { topupUrl: string }).topupUrl;
    expect(body.details.topup_url).toBe(topupUrl);
    expect(body.message).toContain(`Buy credits at ${topupUrl}: `);
    expect((body as { message_for_operator?: string }).message_for_operator).toBe(
      `Top up this automaton with USDC on Base at ${topupUrl}`,
    );
  });
});
