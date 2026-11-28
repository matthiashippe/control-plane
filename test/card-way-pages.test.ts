/**
 * Start page and 402 under the card breaker (goals/wache/01): both take the way to the card checkout only from
 * src/payments/card-way.ts and drop it while the breaker is on. Against createApp and handleChat with an in-memory database,
 * the refunds stamped with the current time because the 402 reads the clock. No network, no port.
 *
 * After the sunset (goals/wache/04) the card checkout is closed for the same rule `cardClosedFor`: start page, error pages and
 * `/card/<package>` answer byte for byte as under the breaker, and a paid order is held without credit.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, type Db } from "../src/db.js";
import { MockProvider, MOCK_MODEL } from "../src/inference/mock.js";
import { Catalog, handleChat } from "../src/inference/proxy.js";
import { claimStarter } from "../src/credits/starter.js";
import { OpenRouterProvider } from "../src/inference/openrouter.js";
import { CARD_BREAKER_SHORTFALL_MC, cardRedirect } from "../src/payments/card-way.js";
import { CARD_PACKAGES, signFields } from "../src/payments/digistore.js";
import { ERROR_PAGES } from "../src/public/error-pages.js";

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

  it("links every anchor of the start page to an id on the page, breaker on and off", async () => {
    // Any block the breaker drops takes its anchors with it, not only `card` (goals/wache/02, point 7).
    const on = openDb(":memory:");
    tripBreaker(on);
    for (const [state, db] of [["on", on], ["off", openDb(":memory:")]] as const) {
      const html = await startPage(db);
      const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
      const anchors = [...html.matchAll(/href="#([^"]*)"/g)].map((m) => m[1]);
      expect(anchors.length, `anchors with the breaker ${state}`).toBeGreaterThan(0);
      const dead = anchors.filter((a) => !ids.has(a)).map((a) => `#${a}`);
      expect(dead, `dead anchors with the breaker ${state}`).toEqual([]);
    }
  });
});

describe("the video under the card breaker", () => {
  it("shows no video with the card on it while the breaker is on", async () => {
    // The last frame of the video offers the top-up by card (goals/wache/03), so it goes with the card block.
    const paths = ["/", ...ERROR_PAGES.map((p) => `/errors/${p.slug}`)];
    expect(paths.length).toBeGreaterThan(1);
    const on = openDb(":memory:");
    tripBreaker(on);
    for (const [state, db] of [["on", on], ["off", openDb(":memory:")]] as const) {
      const app = createApp({ db });
      for (const path of paths) {
        const res = await app.request(path);
        expect(res.status, `${path} with the breaker ${state}`).toBe(200);
        const html = await res.text();
        const count = (s: string) => html.split(s).length - 1;
        const want = state === "on" ? 0 : 1;
        expect(count('data-soll="video"'), `video block on ${path} with the breaker ${state}`).toBe(want);
        expect(count("/video/move.mp4"), `video file on ${path} with the breaker ${state}`).toBe(want);
        expect(count("/video/move-poster.png"), `poster on ${path} with the breaker ${state}`).toBe(want);
        // The rest of the page stays.
        expect(html).toContain(path === "/" ? 'data-soll="move"' : 'data-soll="fix"');
      }
    }
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

// The sunset as in test/inference-sunset.test.ts: OpenRouter may not be sold (`resale: false`) and the sunset lies before `now`.
const SUNSET = new Date("2026-10-17T00:00:00Z");
const AFTER = () => new Date(SUNSET.getTime() + 1000);
const MODELS_BODY = {
  data: [{ id: "openai/gpt-5-mini", context_length: 400000, pricing: { prompt: "0.00000025", completion: "0.000002" } }],
};
const PASS = "test-passphrase-wache-04";
const A = "0x" + "ab".repeat(20);

async function sunsetCatalog() {
  const provider = new OpenRouterProvider({
    apiKey: "sk-or-v1-test",
    models: ["openai/gpt-5-mini"],
    fetch: (async () =>
      new Response(JSON.stringify(MODELS_BODY), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch,
    priceRefreshMs: 0,
    baseUrl: "https://openrouter.ai/api/v1",
    resale: false,
  });
  await provider.init();
  return new Catalog([provider], provider.defaultAliases());
}

async function sunsetApp(db: Db, digistore?: Parameters<typeof createApp>[0]["digistore"]) {
  return createApp({ db, catalog: await sunsetCatalog(), inferenceSunsetAt: SUNSET, now: AFTER, rateLimit: null, digistore });
}

/** The same path under the breaker, the state of goals/wache/01 the sunset has to look like. */
async function underBreaker(path: string) {
  const db = openDb(":memory:");
  tripBreaker(db);
  return createApp({ db, rateLimit: null }).request(path);
}

describe("the card checkout after the sunset", () => {
  it("hides the card on the landing page after the sunset", async () => {
    const res = await (await sunsetApp(openDb(":memory:"))).request("/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain('id="card"');
    expect(html).not.toContain('href="#card"');
    expect(html).not.toContain("/card/5");
    expect(html).not.toContain("checkout-ds24");
    expect(html).not.toMatch(/<!--\/?CARD-->/);
    // Byte for byte the page under the breaker, so the sunset is no new state of the page.
    expect(html).toBe(await (await underBreaker("/")).text());
  });

  it("hides the card on error pages after the sunset", async () => {
    expect(ERROR_PAGES.length).toBeGreaterThan(1);
    const app = await sunsetApp(openDb(":memory:"));
    for (const p of ERROR_PAGES) {
      const path = `/errors/${p.slug}`;
      const res = await app.request(path);
      expect(res.status, path).toBe(200);
      const html = await res.text();
      expect(html, path).not.toContain('href="/#card"');
      expect(html, path).not.toContain("No crypto needed");
      expect(html, path).not.toContain("/video/move.mp4");
      expect(html, path).toBe(await (await underBreaker(path)).text());
    }
  });

  it("pauses /card/:package after the sunset", async () => {
    const app = await sunsetApp(openDb(":memory:"));
    for (const pkg of CARD_PACKAGES) {
      const path = `/card/${pkg.grossEurCents / 100}?address=${A}`;
      const res = await app.request(path);
      expect(res.status, path).toBe(200);
      expect(res.headers.get("location"), path).toBeNull();
      const body = await res.text();
      expect(body, path).toContain("Card payment is paused.");
      expect(body, path).toContain(`https://automatonhost.com/pay/5/${A}`);
      expect(body, path).not.toContain("checkout-ds24");
      // The same answer as under the breaker, so nobody learns which reason holds.
      expect(body, path).toBe(await (await underBreaker(path)).text());
    }
  });

  it("holds a card order paid after the sunset", async () => {
    const lines: string[] = [];
    let ecbCalls = 0;
    const ecb = (async () => {
      ecbCalls++;
      return new Response(
        "<Cube><Cube time='2026-11-20'><Cube currency='USD' rate='1.0512'/></Cube></Cube>",
        { status: 200 },
      );
    }) as typeof fetch;
    const deps = { passphrase: PASS, fetch: ecb, now: AFTER, log: (l: string) => lines.push(l) };
    const address = privateKeyToAccount(generatePrivateKey()).address;
    const fields = (orderId: string) => {
      const f: Record<string, string> = {
        event: "on_payment",
        api_mode: "live",
        order_id: orderId,
        order_date: "2026-11-20",
        product_id: CARD_PACKAGES[0].productId,
        currency: "EUR",
        amount_vendor: "4.06",
        transaction_type: "payment",
        custom: address,
      };
      return new URLSearchParams({ ...f, sha_sign: signFields(f, PASS) }).toString();
    };
    const post = (app: ReturnType<typeof createApp>, orderId: string) =>
      app.request("/pay/digistore", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: fields(orderId),
      });

    const db = openDb(":memory:");
    const res = await post(await sunsetApp(db, deps), "SUNSET1");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
    const row = db.prepare("SELECT status, credited_mc FROM card_orders WHERE order_id = 'SUNSET1'").get();
    expect(row).toEqual({ status: "held", credited_mc: 0 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM ledger").get()).toEqual({ n: 0 });
    expect(ecbCalls).toBe(0);
    expect(lines).toContain("[digistore] order SUNSET1 held: credits no longer sold");
    expect(lines.join("\n").toLowerCase()).not.toContain(address.toLowerCase());

    // The same order before the sunset is no question of the rule: without a reason it is booked.
    const open = openDb(":memory:");
    await post(createApp({ db: open, rateLimit: null, digistore: deps }), "OPEN1");
    expect(open.prepare("SELECT status FROM card_orders WHERE order_id = 'OPEN1'").get()).toEqual({ status: "booked" });
  });
});
