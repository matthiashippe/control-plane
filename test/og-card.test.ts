/**
 * The preview card is what every shared link of automatonhost.com shows, and it is a picture.
 *
 * /og.png is a screenshot of src/public/og-card.html, taken by ops/soll-og.mjs from the approved
 * SOLL source docs/soll/src/og-card.html (goals/umzug/03). Since then the card says what the first
 * block of the landing page says: Conway not answering, your automaton runs here, and the one line
 * conwayApiUrl that makes the switch. It used to carry the market and "first job: free, 15 ¢" burned
 * in; a picture cannot ask starterOffer() whether the pool still pays, so a promise on it was a
 * promise the server could break the day the pool ran dry.
 *
 * So these tests hold the card to the move block of the page and to promising no free first job at
 * all, which closes that risk for good. They say, in the failure message, that the PNG has to be
 * re-shot and not only the HTML edited, because the HTML is the source and the PNG is what people see.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { openDb, MC_PER_CENT } from "../src/db.js";
import { GRANT_MC } from "../src/credits/starter.js";

const card = () => readFileSync("src/public/og-card.html", "utf8");

describe("The preview card", () => {
  it("promises no free first job, because a picture cannot ask whether the pool still pays", () => {
    const cents = GRANT_MC / MC_PER_CENT;
    const why =
      `a picture cannot ask starterOffer(), so the card must not promise the free first job. Change ` +
      `docs/soll/src/og-card.html after an approval, copy it to src/public/og-card.html AND re-shoot src/public/og.png ` +
      `with ops/soll-og.mjs, or the picture keeps the old promise.`;
    expect(card(), why).not.toMatch(/first job/i);
    expect(card(), why).not.toMatch(/\bfree\b/i);
    expect(card(), `the card names the starter grant of ${cents} ¢`).not.toContain(`${cents} ¢`);
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
    // The card carries the h1 of the move block (goals/umzug/03): that block leads the page for operators from Conway issues,
    // and it is what a shared link has to say first. The market below it is not on the card any more.
    const move = html.indexOf('id="move"');
    expect(move, "no move block").toBeGreaterThan(-1);
    const block = html.slice(move, html.indexOf("</section>", move));
    const h1 = block.match(/<h1>([\s\S]*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    expect(h1, "the move block lost its h1").toBeTruthy();
    // The card carries both sentences of the h1, the question first.
    const parts = h1!.split(/(?<=[.?])\s+/).map((s) => s.trim()).filter(Boolean);
    expect(parts.length, `the h1 "${h1}" is not two sentences`).toBe(2);
    for (const part of parts) {
      expect(card(), `the card does not carry "${part}", which the page leads with`).toContain(part);
    }
    expect(card().indexOf(parts[0]), "the card puts the question first").toBeLessThan(card().indexOf(parts[1]));
  });
});
