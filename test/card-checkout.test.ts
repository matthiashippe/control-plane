/**
 * The way to the card checkout (goals/karte/02): the 402 for an empty balance and the policy that lets the browser go there.
 *
 * Customer 1 and the automaton of 2026-11-21 stopped after an empty balance, and no answer they got named a way without USDC.
 * Every link here goes straight to the checkout of Digistore24 with the address in `custom`, because its review only accepts
 * links that go there directly, and the address comes back in the IPN (src/payments/digistore.ts).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import { MockProvider, MOCK_MODEL } from "../src/inference/mock.js";
import { Catalog, handleChat } from "../src/inference/proxy.js";
import { claimStarter } from "../src/credits/starter.js";
import { CARD_PACKAGES, cardCheckoutUrl } from "../src/payments/digistore.js";

const ROOT = join(__dirname, "..");

/** A wallet with nothing left and no starter grant waiting, the state the 402 is for. */
function emptyWallet(balanceMc = 0) {
  const db = openDb(":memory:");
  // Every grant of the day handed out, so the call below cannot take one and must answer 402.
  for (;;) {
    try {
      claimStarter(db, privateKeyToAccount(generatePrivateKey()).address.toLowerCase());
    } catch {
      break;
    }
  }
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  if (balanceMc > 0) postLedger(db, { address, kind: "topup", deltaMc: balanceMc, ref: "seed" });
  const chat = (opts: { topupsClosed?: boolean } = {}) =>
    handleChat(db, new Catalog([new MockProvider()]), address, { model: MOCK_MODEL.id, messages: [{ role: "user", content: "hi" }] }, opts);
  return { db, address, chat };
}

type Body402 = { error: string; message: string; details: Record<string, unknown> };

describe("the 402 for an empty balance", () => {
  it("offers the card link in the 402 for an empty balance", async () => {
    const { address, chat } = emptyWallet();
    const res = await chat();
    expect(res.status).toBe(402);
    const body = res.body as Body402;
    const url = `https://www.checkout-ds24.com/product/${CARD_PACKAGES[0].productId}/?custom=${address}`;
    expect(body.details.card_url).toBe(url);
    expect(body.message).toContain(`No USDC? Pay by card: ${url} Nothing was charged for this call.`);
  });

  it("leaves error, required_cents, current_balance_cents and topup_url of the 402 as they are", async () => {
    const { address, chat } = emptyWallet(300);
    const body = (await chat()).body as Body402;
    // What upstream src/conway/topup.ts:103 reads: the marker and the two numbers, and the topup_url beside them.
    expect(body.error).toBe("INSUFFICIENT_CREDITS");
    expect(body.message.startsWith("Insufficient credits: need ")).toBe(true);
    expect(typeof body.details.required_cents).toBe("number");
    expect(body.details.required_cents as number).toBeGreaterThan(0);
    expect(body.details.current_balance_cents).toBe(0);
    expect(String(body.details.topup_url)).toMatch(new RegExp(`/pay/5/${address}$`));
    expect(body.details.wallet).toBe(address);
    expect(body.message).toContain(`/pay/5/${address}: call it, take the 402`);
  });

  it("offers no card link once topups are closed", async () => {
    const { chat } = emptyWallet();
    const res = await chat({ topupsClosed: true });
    expect(res.status).toBe(402);
    const body = res.body as Body402;
    expect(body.details.card_url).toBeUndefined();
    expect(body.message).not.toContain("checkout-ds24");
    expect(body.message).not.toContain("Pay by card");
  });

  it("makes no card link for anything that is not an address", () => {
    for (const bad of ["", "0x123", "0x" + "g".repeat(40), "x".repeat(42), "0x" + "a".repeat(41)]) {
      expect(cardCheckoutUrl(CARD_PACKAGES[0], bad), bad).toBeNull();
    }
    const mixed = "0x" + "Ab".repeat(20);
    expect(cardCheckoutUrl(CARD_PACKAGES[1], mixed)).toBe(
      `https://www.checkout-ds24.com/product/${CARD_PACKAGES[1].productId}/?custom=${mixed.toLowerCase()}`,
    );
  });
});

describe("the policy of the page", () => {
  it("allows the digistore24 checkout as a form target in the csp", () => {
    const caddy = readFileSync(join(ROOT, "deploy", "Caddyfile"), "utf8");
    const csp = /Content-Security-Policy "([^"]*)"/.exec(caddy)?.[1] ?? "";
    const formAction = /form-action ([^;]*)/.exec(csp)?.[1].trim().split(/\s+/) ?? [];
    expect(formAction).toEqual(["'self'", "https://checkout.stripe.com", "https://www.checkout-ds24.com"]);
    // Only the form target changes: one script by hash, nothing else may run or connect anywhere.
    expect(csp).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+';/);
    expect(csp).toContain("connect-src 'self';");
    expect(csp).toContain("default-src 'none';");
  });
});

describe("the credit of each package", () => {
  it("computes the credit of each package from its measured vendor share", async () => {
    const { CARD_RATE_E4 } = await import("../src/payments/digistore.js");
    expect(Number.isInteger(CARD_RATE_E4)).toBe(true);
    expect(CARD_RATE_E4).toBeGreaterThan(5000);
    for (const p of CARD_PACKAGES) {
      expect(Number.isInteger(p.vendorEurCents), p.productId).toBe(true);
      expect(p.vendorEurCents, p.productId).toBeGreaterThan(0);
      expect(p.vendorEurCents, p.productId).toBeLessThan(p.grossEurCents);
      expect(p.aboutCreditUsd, p.productId).toBe(Math.floor((p.vendorEurCents * CARD_RATE_E4) / 1_000_000));
      expect(p.aboutCreditUsd, p.productId).toBeGreaterThan(0);
    }
    // A bigger package never gives less credit than a smaller one.
    const credits = CARD_PACKAGES.map((p) => p.aboutCreditUsd);
    expect([...credits].sort((a, b) => a - b)).toEqual(credits);
  });
});

describe("the card block of the landing page", () => {
  const before = process.env.CP_PUBLIC_URL;
  beforeEach(() => {
    process.env.CP_PUBLIC_URL = "https://automatonhost.com";
  });
  afterEach(() => {
    if (before === undefined) delete process.env.CP_PUBLIC_URL;
    else process.env.CP_PUBLIC_URL = before;
  });

  async function page() {
    const app = createApp({ db: openDb(":memory:") });
    const html = await (await app.request("/")).text();
    const m = html.indexOf('data-soll="move"');
    const moveEnd = html.indexOf("</section>", m);
    const next = html.indexOf("<section", moveEnd);
    const head = next < 0 ? "" : html.slice(next, html.indexOf(">", next));
    const block = next < 0 ? "" : html.slice(next, html.indexOf("</section>", next));
    return { app, move: m < 0 ? "" : html.slice(m, moveEnd), head, block };
  }

  it("puts the card block right after the move block", async () => {
    const { head } = await page();
    expect(head).toContain('id="card"');
    expect(head).toContain('data-soll="card"');
  });

  it("links the card block from the move block", async () => {
    const { move } = await page();
    expect(move).toContain('href="#card"');
  });

  it("sends the address as custom straight to the digistore24 checkout of each package", async () => {
    const { block } = await page();
    // One form, sent by the browser itself: no script runs, and the address never reaches our access log.
    expect(block.match(/<form\b[^>]*>/g)).toEqual(['<form method="get">']);
    expect(block).not.toMatch(/<script\b/);
    const inputs = block.match(/<input\b[^>]*>/g) ?? [];
    expect(inputs).toHaveLength(1);
    for (const attr of ['name="custom"', 'pattern="0x[0-9a-fA-F]{40}"', " required", 'autocomplete="off"', 'spellcheck="false"']) {
      expect(inputs[0], attr).toContain(attr);
    }
    const targets = [...block.matchAll(/<button\b[^>]*type="submit"[^>]*formaction="([^"]+)"/g)].map((x) => x[1]);
    expect(targets).toEqual(CARD_PACKAGES.map((p) => `https://www.checkout-ds24.com/product/${p.productId}/`));
    // What the browser builds from the form is exactly the link the 402 and the plugin give out.
    const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
    for (const [i, p] of CARD_PACKAGES.entries()) {
      const url = new URL(targets[i]);
      url.search = new URLSearchParams({ custom: address }).toString();
      expect(url.toString()).toBe(cardCheckoutUrl(p, address));
    }
  });

  it("names the price and the credit of each package", async () => {
    const { block } = await page();
    const buttons = block.match(/<button\b[\s\S]*?<\/button>/g) ?? [];
    expect(buttons).toHaveLength(CARD_PACKAGES.length);
    for (const [i, p] of CARD_PACKAGES.entries()) {
      expect(buttons[i]).toContain(`${p.grossEurCents / 100} EUR`);
      expect(buttons[i]).toContain(`about $${p.aboutCreditUsd} credit`);
      // Each button says what the click does, like the cards of the catalogue below it.
      expect(buttons[i]).toContain('<span class="go">Buy credit</span>');
    }
  });

  it("says how to pay, who sells and that there are 30 days money back", async () => {
    const { block } = await page();
    expect(block).toContain("Wallet address of your automaton");
    for (const words of ["Card, PayPal or Apple Pay", "Digistore24 sells this credit", "30 days to cancel the purchase"]) {
      expect(block, words).toContain(words);
    }
    expect(block).not.toMatch(/[–—]/);
    expect(block.toLowerCase()).not.toContain("postyourprice");
  });

  it("counts views of the card block with the pixel /px/card.png", async () => {
    const { app, block } = await page();
    const tag = block.match(/<img src="\/px\/card\.png"[^>]*>/)?.[0];
    expect(tag, "/px/card.png is not in the card block").toBeTruthy();
    expect(tag).toContain('loading="lazy"');
    expect(tag).toContain('class="px"');
    const res = await app.request("/px/card.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
