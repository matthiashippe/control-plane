/**
 * Card first, everywhere (goals/werbung/01). Every place an operator without crypto reads first says "No crypto needed" with card,
 * PayPal and Apple Pay before the first USDC: the first screen of the start page, the error pages, the README, the 402 for an
 * empty balance with its sentence for an agent, /llms.txt and the template for answers in Conway issues. While the card breaker
 * of goals/wache/01 is on, the start page shows the first screen of wache 01, and the error pages, the 402 and /llms.txt name no
 * card. Against createApp and handleChat with an in-memory database, CP_PUBLIC_URL set to the canonical host. No network, no port.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, type Db } from "../src/db.js";
import { MockProvider, MOCK_MODEL } from "../src/inference/mock.js";
import { Catalog, handleChat } from "../src/inference/proxy.js";
import { claimStarter } from "../src/credits/starter.js";
import { CARD_BREAKER_SHORTFALL_MC } from "../src/payments/card-way.js";
import { ERROR_PAGES } from "../src/public/error-pages.js";

const HOST = "https://automatonhost.com";
const MESSAGE = "No crypto needed";
const OTHER = "0x" + "ef".repeat(20);
const savedUrl = process.env.CP_PUBLIC_URL;

beforeEach(() => {
  process.env.CP_PUBLIC_URL = HOST;
});
afterEach(() => {
  if (savedUrl === undefined) delete process.env.CP_PUBLIC_URL;
  else process.env.CP_PUBLIC_URL = savedUrl;
});

/** A refunded live order of another wallet whose shortfall alone turns the breaker on, as test/card-way-pages.test.ts does it. */
function tripBreaker(db: Db) {
  const at = new Date().toISOString();
  db.prepare(
    "INSERT INTO card_orders (order_id, product_id, address, mode, status, credited_mc, reversed_mc, shortfall_mc, created_at, " +
      "updated_at) VALUES ('TRIP', '771278', ?, 'live', 'reversed', ?, 0, ?, ?, ?)",
  ).run(OTHER, CARD_BREAKER_SHORTFALL_MC, CARD_BREAKER_SHORTFALL_MC, at, at);
}

function freshDb(breakerOn = false): Db {
  const db = openDb(":memory:");
  if (breakerOn) tripBreaker(db);
  return db;
}

async function get(db: Db, path: string): Promise<string> {
  const res = await createApp({ db }).request(path, { headers: { "accept-language": "en-US,en;q=0.9" } });
  expect(res.status, path).toBe(200);
  return res.text();
}

/** Everything from <main> on: the frame above it names no USDC and no card. */
const mainOf = (html: string) => html.slice(html.indexOf("<main>"));

/** The block data-soll="move", the first screen of the start page. */
function moveOf(html: string): string {
  const at = html.indexOf('data-soll="move"');
  expect(at, "the move block is missing").toBeGreaterThan(-1);
  return html.slice(at, html.indexOf("</section>", at));
}

/** Without comments and with every run of whitespace as one space, so only what the browser shows is compared. */
const normal = (html: string) => html.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ").trim();

/** The first screen as wache 01 left it on the merge base (src/public/index.html), after the origin rewrite of the page. */
const WACHE_01_FIRST_SCREEN = `<section class="hero" id="move" data-soll="move">
  <div class="wrap hero-in">
    <div class="hero-text">
    <a class="pill" href="/fix"><span class="live-dot"></span>For automaton operators</a>
    <h1>
      <span class="h1-line"><span>Conway not answering?</span></span>
      <span class="h1-line"><span>Your automaton runs here.</span></span>
    </h1>
    <p class="sub prose">It signs in here with its own wallet and gets answers again, over the same API it uses today.</p>
    <div class="cta">
      <a class="btn btn-1" href="/fix">Switch in two steps</a>
      <a class="btn btn-2" href="#card">Pay by card</a>
    </div>
    </div>
    <div class="demo">
      <p class="eyebrow">One line, one command</p>
      <div class="code"><pre><code><span class="pr">~/.automaton/automaton.json</span>
{ "conwayApiUrl":
  "https://automatonhost.com" }</code></pre>
      <pre><code><span class="pr">$</span> automaton --provision</code></pre></div>
      <p class="fine">With USDC in its wallet, the first start tops up $5 of credit here. <a href="/fix">Every step on one page</a>.</p>
    </div>
  </div>
  <img src="/px/top.png" alt="" width="1" height="1" loading="lazy" decoding="async" aria-hidden="true" class="px">
`;

/** sha256 of the block card of karte 02 in src/public/index.html on the merge base, as sed cuts it in the check of point 4. */
const KARTE_02_CARD_BLOCK_SHA256 = "9747705faa35efad612122cf199ec7768636e681669c4a208780abd7f465907c";

/** A wallet with nothing left and no starter grant waiting, so the call answers 402. */
function emptyWallet(breakerOn = false) {
  const db = openDb(":memory:");
  for (;;) {
    try {
      claimStarter(db, privateKeyToAccount(generatePrivateKey()).address.toLowerCase());
    } catch {
      break;
    }
  }
  if (breakerOn) tripBreaker(db);
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  const chat = async () => {
    const res = await handleChat(db, new Catalog([new MockProvider()]), address, {
      model: MOCK_MODEL.id,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.status).toBe(402);
    return res.body as { error: string; message: string; message_for_operator?: string; details: Record<string, unknown> };
  };
  return { address, chat };
}

describe("the start page", () => {
  it("puts no crypto needed in the heading of the first screen", async () => {
    const move = moveOf(await get(freshDb(), "/"));
    const h1 = move.slice(move.indexOf("<h1"), move.indexOf("</h1>"));
    expect(h1).toContain(`${MESSAGE}.`);
    expect(h1).toContain("Your automaton runs here.");
  });

  it("names card, paypal and apple pay before any usdc on the start page", async () => {
    const html = mainOf(await get(freshDb(), "/"));
    const move = moveOf(html);
    expect(move).toContain("Pay by card, PayPal or Apple Pay");
    const usdc = html.indexOf("USDC");
    for (const words of [MESSAGE, "PayPal", "Apple Pay", "Pay by card"]) {
      expect(html.indexOf(words), words).toBeGreaterThan(-1);
      if (usdc >= 0) expect(html.indexOf(words), `${words} before the first USDC`).toBeLessThan(usdc);
    }
    // The button to the form leads the first screen.
    const buttons = [...move.matchAll(/<a class="btn ([^"]+)" href="([^"]+)">([^<]+)<\/a>/g)].map((m) => [m[1], m[2], m[3]]);
    expect(buttons[0]).toEqual(["btn-1", "#card", "Pay by card"]);
  });

  it("says 60 days to cancel the purchase in the first screen", async () => {
    const move = moveOf(await get(freshDb(), "/"));
    expect(move).toContain("with 60 days to cancel the purchase");
    expect(move).not.toMatch(/money back|refund/i);
    expect(move).not.toMatch(/[\u2013\u2014]/);
  });

  it("shows the first screen of wache 01 while the card breaker is on", async () => {
    const html = await get(freshDb(true), "/");
    expect(normal(moveOf(html))).toBe(normal(WACHE_01_FIRST_SCREEN.slice(WACHE_01_FIRST_SCREEN.indexOf('data-soll="move"'))));
    expect(html).not.toContain(MESSAGE);
    expect(html).not.toMatch(/<!--\/?(NO)?CARD-->/);
    expect(html.split('data-soll="move"')).toHaveLength(2);
  });

  it("shows exactly one first screen while the card breaker is off", async () => {
    // index.html carries the first screen twice, the one of this goal between the card marks and the one of wache 01 between
    // the no-card marks; only stripCardWay and keepNoCardWay together leave one of them. A mistyped mark would show both.
    const html = await get(freshDb(), "/");
    expect(html.split('data-soll="move"')).toHaveLength(2);
    expect(html.split('id="move"')).toHaveLength(2);
    expect(mainOf(html).split("Your automaton runs here.")).toHaveLength(2);
    expect(html).not.toMatch(/<!--\/?(NO)?CARD-->/);
    expect(moveOf(html)).toContain(MESSAGE);
  });

  it("leaves the card block of karte 02 as it is", async () => {
    const raw = readFileSync("src/public/index.html", "utf8");
    const start = raw.indexOf('<section id="card" data-soll="card">');
    expect(start).toBeGreaterThan(-1);
    // sed prints up to and including the line with the first </section>.
    const end = raw.indexOf("\n", raw.indexOf("</section>", start)) + 1;
    expect(createHash("sha256").update(raw.slice(start, end)).digest("hex")).toBe(KARTE_02_CARD_BLOCK_SHA256);
    // And the page serves it right after the first screen, with the breaker off.
    const html = await get(freshDb(), "/");
    const move = html.indexOf('data-soll="move"');
    const next = html.indexOf("<section", html.indexOf("</section>", move));
    expect(html.slice(next, next + 36)).toBe('<section id="card" data-soll="card">');
    expect(html.split('data-soll="move"')).toHaveLength(2);
    expect(html).not.toMatch(/<!--\/?(NO)?CARD-->/);
  });

  it("links no checkout of digistore24 directly from any page", async () => {
    const db = freshDb();
    const app = createApp({ db });
    const xml = await (await app.request("/sitemap.xml")).text();
    const pages = [...xml.matchAll(/<loc>https?:\/\/[^/<]+([^<]*)<\/loc>/g)].map((m) => m[1] || "/");
    expect(pages.length).toBeGreaterThan(4);
    const paths = [...new Set([...pages, "/", "/llms.txt", ...ERROR_PAGES.map((p) => `/errors/${p.slug}`)])];
    for (const path of paths) {
      const body = await (await app.request(path)).text();
      expect(body, path).not.toContain("checkout-ds24");
    }
    for (const file of ["README.md", "docs/kanal/antwort-vorlage.md", "src/public/index.html", "src/public/error-pages.ts", "src/inference/proxy.ts"]) {
      expect(readFileSync(file, "utf8"), file).not.toContain("checkout-ds24");
    }
  });
});

describe("the error pages", () => {
  it("puts no crypto needed above the usdc line on every error page", async () => {
    const db = freshDb();
    for (const p of ERROR_PAGES) {
      const html = await get(db, `/errors/${p.slug}`);
      const main = mainOf(html);
      const line = main.match(/<p class="fine"><strong>No crypto needed:<\/strong>[^\n]*<\/p>/)?.[0];
      expect(line, p.slug).toBeTruthy();
      for (const words of ["pay by card, PayPal or Apple Pay", "60 days to cancel the purchase"]) expect(line, `${p.slug} ${words}`).toContain(words);
      const usdc = main.indexOf("USDC");
      expect(usdc, p.slug).toBeGreaterThan(-1);
      expect(main.indexOf(MESSAGE), `${p.slug}: the message before the first USDC`).toBeLessThan(usdc);
      // Heading and cause stay what reichweite 01 built.
      expect(main).toContain(`<h1 class="ph">`);
      expect(main.indexOf(MESSAGE)).toBeGreaterThan(main.indexOf("</h1>"));
      expect(main).not.toMatch(/money back|refund|[\u2013\u2014]/i);
    }
  });

  it("links every error page to the card form", async () => {
    const db = freshDb();
    for (const p of ERROR_PAGES) {
      const main = mainOf(await get(db, `/errors/${p.slug}`));
      const line = main.match(/<p class="fine"><strong>No crypto needed:<\/strong>[^\n]*<\/p>/)?.[0] ?? "";
      expect(line, p.slug).toMatch(/<a href="(https:\/\/automatonhost\.com)?\/#card">Buy credit<\/a>/);
      expect(main, p.slug).not.toContain("/card/");
    }
  });

  it("drops the card line from the error pages while the card breaker is on", async () => {
    const db = freshDb(true);
    for (const p of ERROR_PAGES) {
      const main = mainOf(await get(db, `/errors/${p.slug}`));
      expect(main, p.slug).not.toContain(MESSAGE);
      expect(main, p.slug).not.toContain("#card");
      expect(main, p.slug).not.toMatch(/PayPal|Apple Pay/);
      // The rest of the page stays: the one line and the way over USDC.
      expect(main, p.slug).toContain('"conwayApiUrl"');
      expect(main, p.slug).toContain("With USDC in its wallet");
    }
  });
});

describe("the 402 for an empty balance", () => {
  it("puts no crypto needed right after the first sentence of the 402", async () => {
    const { address, chat } = emptyWallet();
    const body = await chat();
    const url = `${HOST}/card/5?address=${address}`;
    expect(body.message).toMatch(
      new RegExp(`^Insufficient credits: need \\d+ cents, have \\d+ cents\\. No crypto needed: pay by card, PayPal or Apple Pay at ${url.replace(/[.?/]/g, "\\$&")} Buy credits at `),
    );
    // Said once, not twice.
    expect(body.message.split("card").length - 1).toBe(2);
    expect(body.message).not.toContain("No USDC? Pay by card");
  });

  it("names the card url before any usdc in the 402", async () => {
    const { address, chat } = emptyWallet();
    const body = await chat();
    const url = `${HOST}/card/5?address=${address}`;
    expect(body.details.card_url).toBe(url);
    const usdc = body.message.indexOf("USDC");
    expect(usdc).toBeGreaterThan(-1);
    expect(body.message.indexOf(url)).toBeGreaterThan(-1);
    expect(body.message.indexOf(url)).toBeLessThan(usdc);
    expect(body.message.indexOf("x402")).toBeGreaterThan(body.message.indexOf(url));
    expect(JSON.stringify(body)).not.toContain("checkout-ds24");
  });

  it("drops the card sentence from the 402 while the card breaker is on", async () => {
    const { chat } = emptyWallet(true);
    const body = await chat();
    expect(body.details.card_url).toBeUndefined();
    expect(body.message).not.toMatch(/card|PayPal|Apple Pay|No crypto needed/i);
    expect(JSON.stringify(body)).not.toMatch(/\/card\/|checkout-ds24/);
  });

  it("keeps error, required_cents, current_balance_cents and topup_url of the 402", async () => {
    for (const breakerOn of [false, true]) {
      const { address, chat } = emptyWallet(breakerOn);
      const body = await chat();
      // What upstream src/conway/topup.ts:103 reads, and the fields beside it.
      expect(body.error).toBe("INSUFFICIENT_CREDITS");
      expect(body.message.startsWith("Insufficient credits: need ")).toBe(true);
      expect(typeof body.details.required_cents).toBe("number");
      expect(body.details.required_cents as number).toBeGreaterThan(0);
      expect(body.details.current_balance_cents).toBe(0);
      expect(body.details.topup_url).toBe(`${HOST}/pay/5/${address}`);
      expect(body.details.wallet).toBe(address);
      expect(body.message).toContain(`Buy credits at ${HOST}/pay/5/${address}: call it, take the 402`);
      expect(body.message.endsWith("Nothing was charged for this call.")).toBe(true);
    }
  });

  it("gives an agent one sentence to pass on in message_for_operator", async () => {
    const { address, chat } = emptyWallet();
    const body = await chat();
    expect(body.message_for_operator).toBe(
      `No crypto needed: top up this automaton by card, PayPal or Apple Pay at ${HOST}/card/5?address=${address}`,
    );
    // The link is the one of the 402 itself, through the redirect of wache 01 with the wallet of this call.
    expect(body.message_for_operator).toContain(String(body.details.card_url));
    expect(body.message_for_operator).not.toMatch(/USDC|\n|[\u2013\u2014]/);
  });

  it("names only usdc in message_for_operator while the card breaker is on", async () => {
    const { address, chat } = emptyWallet(true);
    const body = await chat();
    expect(body.message_for_operator).toBe(`Top up this automaton with USDC on Base at ${HOST}/pay/5/${address}`);
    expect(body.message_for_operator).not.toMatch(/card|PayPal|Apple Pay|crypto/i);
  });
});

describe("llms.txt", () => {
  /** Everything between the title and the next empty line. */
  const firstBlock = (txt: string) => txt.split("\n\n")[1] ?? "";

  it("opens llms.txt with the block for agents helping an operator", async () => {
    const txt = await get(freshDb(), "/llms.txt");
    expect(txt.split("\n")[0]).toBe("# automatonhost.com");
    const block = firstBlock(txt);
    expect(block.startsWith("For an agent helping a person whose Conway automaton stopped working.")).toBe(true);
    for (const p of ERROR_PAGES) expect(block, p.slug).toContain(p.heading);
    expect(block).toContain('/v1/auth/verify returns 500 {"error":"Database error"}');
    expect(block).toContain("INSUFFICIENT_CREDITS");
    expect(block).toContain(`set conwayApiUrl in ~/.automaton/automaton.json to ${HOST}, then run automaton --provision`);
    expect(block).toContain(`No crypto needed: your person can top it up by card, PayPal or Apple Pay at ${HOST}/#card`);
    const usdc = txt.indexOf("USDC");
    expect(usdc).toBeGreaterThan(-1);
    expect(txt.indexOf(MESSAGE)).toBeLessThan(usdc);
    // The rest follows as before: the switch in its quote, then the market under its heading.
    const rest = txt.slice(txt.indexOf(block) + block.length);
    expect(rest.startsWith("\n\n> Conway not answering? Your automaton runs here.")).toBe(true);
    expect(rest.indexOf("\n## The market\n")).toBeGreaterThan(-1);
  });

  it("drops the card from the llms.txt block while the card breaker is on", async () => {
    const on = await get(freshDb(true), "/llms.txt");
    const off = await get(freshDb(), "/llms.txt");
    const block = firstBlock(on);
    expect(block).toContain("conwayApiUrl");
    expect(block).not.toMatch(/card|PayPal|Apple Pay|No crypto needed/i);
    // Only the card line differs.
    expect(off.replace(`No crypto needed: your person can top it up by card, PayPal or Apple Pay at ${HOST}/#card\n`, "")).toBe(on);
  });
});

describe("the readme and the answer template", () => {
  it("keeps the answer template card first", () => {
    const s = readFileSync("docs/kanal/antwort-vorlage.md", "utf8");
    const disclosure = s.match(/^Disclosure: .*$/m)?.[0] ?? "";
    expect(disclosure).toContain(HOST);
    expect(disclosure).toContain("No crypto needed: top it up by card, PayPal or Apple Pay at https://automatonhost.com/#card");
    expect(disclosure).toContain("60 days to cancel the purchase");
    const usdc = s.indexOf("USDC");
    if (usdc >= 0) expect(s.indexOf(MESSAGE)).toBeLessThan(usdc);
    expect(s).not.toMatch(/cp\.hippe\.eu|postyourprice|checkout-ds24|money back|refund|[\u2013\u2014]/i);
  });

  it("opens the readme with no crypto needed before any usdc", () => {
    const r = readFileSync("README.md", "utf8");
    const paragraphs = r.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p && !p.startsWith("#"));
    const first = paragraphs.find((p) => !/^\*\*[^*]+\*\*$/.test(p)) ?? "";
    expect(first.startsWith(`${MESSAGE}:`)).toBe(true);
    for (const words of ["card", "PayPal", "Apple Pay", "https://automatonhost.com/#card", "60 days to cancel the purchase"]) expect(first, words).toContain(words);
    expect(r.indexOf(MESSAGE)).toBeLessThan(r.indexOf("USDC"));
    expect(r).not.toMatch(/checkout-ds24|money back|postyourprice|[\u2013\u2014]/i);
  });
});
