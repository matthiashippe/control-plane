/**
 * Every page names its preview card with a version and describes the card it carries (goals/umzug/04, points 1 and 2).
 *
 * Preview services (Slack, Discord, X, LinkedIn) keep an image by its address for days. The card of the move was new on
 * the day of the merge and would have stayed invisible behind the old picture under the same address, so the address
 * carries the first eight hex characters of the sha256 of the bytes the image route serves. The version is computed here
 * from the answer of the image route, not read from any table, so a stale number fails.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { OG_CARDS } from "../src/public/og-cards.js";

/** One page per card that carries it, and a second one where a card is used on more than one page. */
const PAGES: [string, keyof typeof OG_CARDS][] = [
  ["/", "og.png"],
  ["/post", "og.png"],
  ["/x402", "og-x402.png"],
  ["/conway", "og-x402.png"],
];

const meta = (html: string, re: RegExp) => re.exec(html)?.[1] ?? null;
const ogImage = (html: string) => meta(html, /<meta property="og:image" content="([^"]*)"/);
const twitterImage = (html: string) => meta(html, /<meta name="twitter:image" content="([^"]*)"/);
const ogAlt = (html: string) => meta(html, /<meta property="og:image:alt" content="([^"]*)"/);

describe("preview cards", () => {
  const app = createApp({ db: openDb(":memory:") });
  const version = async (card: string) => {
    const res = await app.request(`/${card}`);
    expect(res.status, `/${card} is not served`).toBe(200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    return crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 8);
  };

  for (const [pathname, card] of PAGES) {
    it(`${pathname} names ${card} with the version of the served bytes and describes it`, async () => {
      const v = await version(card);
      const html = await (await app.request(pathname)).text();
      expect(ogImage(html)).toBe(`https://cp.hippe.eu/${card}?v=${v}`);
      expect(twitterImage(html)).toBe(`https://cp.hippe.eu/${card}?v=${v}`);
      expect(ogAlt(html)).toBe(OG_CARDS[card].alt);
    });
  }

  it("every card in OG_CARDS is carried by a page in this test", () => {
    expect([...new Set(PAGES.map(([, card]) => card))].sort()).toEqual(Object.keys(OG_CARDS).sort());
  });

  it("og.png is described with the text of src/public/index.html", () => {
    const index = fs.readFileSync(new URL("../src/public/index.html", import.meta.url), "utf8");
    expect(ogAlt(index)).toBe(OG_CARDS["og.png"].alt);
  });

  it("og-x402.png is described as the x402 measurement, not as the move", () => {
    const alt = OG_CARDS["og-x402.png"].alt;
    expect(alt).toContain("x402");
    expect(alt).not.toContain("conwayApiUrl");
  });

  it("a version in the query changes nothing about the image", async () => {
    for (const card of Object.keys(OG_CARDS)) {
      const plain = await app.request(`/${card}`);
      const versioned = await app.request(`/${card}?v=${await version(card)}`);
      expect(versioned.status).toBe(200);
      expect(versioned.headers.get("content-type")).toBe(plain.headers.get("content-type"));
      expect(versioned.headers.get("cache-control")).toBe(plain.headers.get("cache-control"));
      expect(Buffer.from(await versioned.arrayBuffer()).equals(Buffer.from(await plain.arrayBuffer()))).toBe(true);
    }
  });
});
