/**
 * The preview card is the fifth surface that promises a free first job, and it is a picture.
 *
 * /og.png carries "first job: free, 15 ¢" burned in, and it is a screenshot of
 * src/public/og-card.html. Every other surface asks starterOffer() before making that promise,
 * because the pool is thirty-three grants and does not refill; an article that brings a hundred
 * readers empties it inside an hour. A picture cannot ask anything.
 *
 * So these tests do the two things a test can do here. They hold the number on the card to the
 * number the service actually grants, so a change to GRANT_MC cannot leave the card lying. And
 * they say, in the failure message, that the PNG has to be re-shot and not only the HTML edited,
 * because the HTML is the source and the PNG is what people see.
 *
 * What they cannot do is notice that the pool ran dry. That one is in the handoff, as the thing to
 * do on the day it happens.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { openDb, MC_PER_CENT } from "../src/db.js";
import { GRANT_MC } from "../src/credits/starter.js";

const card = () => readFileSync("src/public/og-card.html", "utf8");

describe("The preview card", () => {
  it("names the grant the service actually gives", () => {
    const cents = GRANT_MC / MC_PER_CENT;
    expect(
      card(),
      `the card says a number that is not ${cents} ¢. Change src/public/og-card.html AND re-shoot ` +
        `src/public/og.png from it, or the picture keeps the old promise.`,
    ).toContain(`${cents} ¢`);
  });

  it("is served, and is the size the page says it is", async () => {
    const app = createApp({ db: openDb(":memory:") });
    const res = await app.request("/og.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // Width and height live in the PNG header, bytes 16..24, and in two meta tags on the page.
    const view = new DataView(bytes.buffer);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    const html = await (await app.request("/")).text();
    expect(html, "og:image:width has to match the file").toContain(`content="${width}"`);
    expect(html, "og:image:height has to match the file").toContain(`content="${height}"`);
    // 1.91:1 is what every preview renderer crops to. Further off and the card is cut.
    expect(width / height).toBeGreaterThan(1.85);
    expect(width / height).toBeLessThan(1.95);
  });

  it("says the same thing the page says, so a shared link does not mis-sell", async () => {
    const app = createApp({ db: openDb(":memory:") });
    const html = await (await app.request("/")).text();
    const h1 = html.match(/<h1>([\s\S]*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    expect(h1, "the landing page lost its h1").toBeTruthy();
    // The card carries the same three sentences as the h1, in the same order.
    for (const part of h1!.split(".").map((s) => s.trim()).filter(Boolean)) {
      expect(card(), `the card does not carry "${part}", which the page leads with`).toContain(part);
    }
  });
});
