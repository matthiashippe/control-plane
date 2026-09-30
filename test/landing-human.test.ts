/**
 * The first screen of / for a person (HAN-92): German, above the agent path, and saying nothing
 * /katalog does not say. Each "is there" has a partner that fails when the thing it guards moves.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { fakeProvider } from "../src/checkout/index.js";
import { DELIVERY_SENTENCE, OFFERS, REWORK_LINE, TEST_MODE_LINE, euro } from "../src/public/catalog.js";
import { AGENT_ANCHOR, AGENT_LINE, HUMAN_HEADLINE, HUMAN_SUB, renderHumanFirst } from "../src/public/humanfirst.js";

const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const TEST_KEY = "sk_test_placeholder";
const get = (a: ReturnType<typeof createApp>, lang?: string) =>
  a.request("/", { headers: lang ? { accept: BROWSER, "accept-language": lang } : { accept: BROWSER } });
const plain = () => createApp({ db: openDb(":memory:") });
const buying = () => createApp({ db: openDb(":memory:"), checkout: fakeProvider(), rateLimit: null });

let key: string | undefined;
beforeEach(() => {
  key = process.env.CP_STRIPE_SECRET_KEY;
  delete process.env.CP_CHECKOUT;
  delete process.env.CP_STRIPE_SECRET_KEY;
});
afterEach(() => {
  delete process.env.CP_CHECKOUT;
  if (key === undefined) delete process.env.CP_STRIPE_SECRET_KEY;
  else process.env.CP_STRIPE_SECRET_KEY = key;
});

describe("the first screen of / for a person", () => {
  it("comes before everything written for agents, in every browser language", async () => {
    for (const lang of [undefined, "en-US,en;q=0.9", "de-DE,de;q=0.9"]) {
      const html = await (await get(plain(), lang)).text();
      const human = html.indexOf(HUMAN_HEADLINE);
      expect(human, `no human first screen (${lang})`).toBeGreaterThan(-1);
      expect(human, "the agent hero came first").toBeLessThan(html.indexOf('<section class="hero"'));
      expect(human).toBeLessThan(html.indexOf("/v1/briefs/check"));
      // Before the first link to /katalog in the hero, so the catalogue button is the first one.
      expect(html.indexOf('href="/katalog"')).toBeGreaterThan(human);
      expect(html).toMatch(/<section class="human" lang="de">/);
    }
  });

  it("keeps the agent path whole and points to it", async () => {
    const html = await (await get(plain(), "en")).text();
    expect(html).toContain(`<a href="#${AGENT_ANCHOR}">${AGENT_LINE}</a>`);
    expect(html).toContain(`<section class="hero" id="${AGENT_ANCHOR}">`);
    for (const s of ["Several agents do it.", "Post your first job", "Check a draft, free", "/v1/briefs/check", "the catalogue"]) {
      expect(html, `the agent path lost "${s}"`).toContain(s);
    }
  });

  it("keeps the control mark in the first screen, after the catalogue button and once", async () => {
    const html = await (await get(plain())).text();
    expect(html.split("/px/top.png").length - 1).toBe(1);
    expect(html.indexOf("/px/top.png")).toBeGreaterThan(html.indexOf("Zum Katalog"));
    expect(html.indexOf("/px/top.png")).toBeLessThan(html.indexOf('<section class="hero"'));
  });

  it("names the three offers the catalogue sells, and nothing else", () => {
    for (const o of OFFERS) expect(HUMAN_HEADLINE, o.name).toContain(o.name);
    // Every promise in the line under it is a promise every offer makes on /katalog.
    for (const o of OFFERS) {
      expect(o.delivers).toContain("drei fertige Fassungen");
      // Zurueck seit HAN-95, weil es das Nachbessern jetzt gibt (/katalog/nachbessern).
      expect(o.delivers).toContain("bis zu dreimal sagen, was anders werden soll");
    }
    expect(HUMAN_SUB).toContain("drei fertige Fassungen");
    expect(HUMAN_SUB).toContain("bis zu dreimal sagen, was anders werden soll");
    expect(DELIVERY_SENTENCE).toContain("mit KI geschrieben");
    expect(renderHumanFirst()).toContain(REWORK_LINE);
  });

  it("computes the price from OFFERS instead of printing a number", async () => {
    const low = Math.min(...OFFERS.map((o) => o.priceCents));
    expect(await (await get(plain())).text()).toContain(`Ab ${euro(low)}`);
    // The other direction: a cheaper offer moves the line, a dearer one does not.
    const cheaper = [...OFFERS, { ...OFFERS[0], priceCents: 1234 }];
    expect(renderHumanFirst(undefined, cheaper)).toContain("Ab 12,34 €");
    const dearer = [...OFFERS, { ...OFFERS[0], priceCents: 99900 }];
    expect(renderHumanFirst(undefined, dearer)).toContain(`Ab ${euro(low)}`);
  });

  it("says test mode exactly when /katalog does", async () => {
    process.env.CP_STRIPE_SECRET_KEY = TEST_KEY;
    const a = buying();
    const home = await (await get(a)).text();
    const catalogue = await (await a.request("/katalog")).text();
    expect(catalogue).toContain(TEST_MODE_LINE);
    expect(home.slice(0, home.indexOf('<section class="hero"'))).toContain(TEST_MODE_LINE);

    // No card path, no test line, on both pages.
    delete process.env.CP_STRIPE_SECRET_KEY;
    const off = plain();
    expect(await (await off.request("/katalog")).text()).not.toContain(TEST_MODE_LINE);
    expect(await (await get(off)).text()).not.toContain(TEST_MODE_LINE);
  });

  it("uses no dash as punctuation in anything a customer reads", () => {
    expect(renderHumanFirst({ testMode: true })).not.toMatch(/[–—]/);
  });
});
