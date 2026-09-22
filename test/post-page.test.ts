/**
 * The buyer's path, on our own site.
 *
 * The landing page was rebuilt to sell to buyers and its primary button promised "Post a job" while
 * leading to `/jobs`, a page headlined "Work with the money already behind it" and written for
 * agents. The one call to action on the page handed a buyer the supply side.
 *
 * What these check is the funnel, not the prose: the button goes somewhere a buyer can act, and
 * that page names every call the path actually needs, in the order a buyer needs them.
 */
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { mcToCents, openDb } from "../src/db.js";
import { GRANT_MC } from "../src/credits/starter.js";

const page = async (path: string): Promise<string> =>
  (await createApp({ db: openDb(":memory:") }).request(path)).text();

describe("/post", () => {
  it("is where the landing page's primary button leads", async () => {
    const html = await page("/");
    // The button text and the destination have to agree. They did not, which is the whole reason
    // this page exists.
    // The label changed with the page on 2026-09-21. What is pinned is the pair, not the wording:
    // the primary button says it posts a job and it goes where a buyer can post one.
    expect(html).toMatch(/href="\/post"[^>]*>Post[^<]*job/i);
    // The class changed with the page on 2026-09-21 (btn-primary became btn-1). Found by the
    // first button in the hero instead, which is the thing the rule is about: whatever the primary
    // button is called, it must not hand a buyer the agents' page.
    const button = html.indexOf('class="btn btn-1"');
    expect(button, "the primary button is gone").toBeGreaterThan(-1);
    expect(html.slice(button, button + 200), "the primary button must not send a buyer to the agents' page")
      .not.toContain('href="/jobs"');
  });

  it("names every call the buyer's path needs, in order", async () => {
    const html = await page("/post");
    const steps = [
      "/v1/briefs/check",   // 1. without a key
      "/v1/bounties",       // 3. post
      "/v1/submissions",    // 4. read
      "/v1/check",          // 5. what was made up
      "/v1/bounties/award", // 6. award
      "/v1/bounties/cancel",
    ];
    let previous = -1;
    for (const step of steps) {
      const pos = html.indexOf(step);
      expect(pos, `${step} is missing from the buyer's path`).toBeGreaterThan(-1);
      expect(pos, `${step} comes before the step it depends on`).toBeGreaterThan(previous);
      previous = pos;
    }
  });

  it("leads with the step that costs nothing and needs no account", async () => {
    const html = await page("/post");
    // A buyer who has to sign something before they learn anything has already left. The brief
    // check is keyless, so it goes first and says so.
    expect(html.indexOf("/v1/briefs/check")).toBeLessThan(html.indexOf("/v1/bounties"));
    expect(html).toMatch(/No key, no charge, no sign-up/);
  });

  it("says what the money does at every step, including how it comes back", async () => {
    const html = await page("/post");
    expect(html, "the hold at posting").toMatch(/price leaves your balance now/);
    expect(html, "the commission and who carries it").toMatch(/10 per cent/);
    expect(html, "and that the buyer never pays it on top").toMatch(/buyer never pays on top/);
    expect(html, "the three ways out").toMatch(/three ways it comes back and there is no fourth/);
  });

  /**
   * The example a first-time buyer copies has to work on a first-time buyer's balance.
   *
   * It said 200 cents for half an hour, two paragraphs under the promise that a first job of up to
   * 15 cents is free. The service answers that correctly, naming the grant and what to do, but the
   * page that exists to remove friction would have created it on the very first call.
   */
  it("shows an example price the free starter credit actually covers", async () => {
    const html = await page("/post");
    const prices = [...html.matchAll(/"price_cents":\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(prices.length, "the posting example is gone").toBeGreaterThan(0);
    for (const price of prices) {
      expect(price, `${price} cents is more than the ${mcToCents(GRANT_MC)} cent grant, so the first call fails`)
        .toBeLessThanOrEqual(mcToCents(GRANT_MC));
    }
    expect(html, "and the page says so, rather than leaving it to be noticed").toMatch(
      new RegExp(`${mcToCents(GRANT_MC)} cents is exactly what the free credit covers`),
    );
  });

  it("is in the sitemap and in llms.txt, or no agent and no crawler will find it", async () => {
    expect(await page("/sitemap.xml")).toContain("https://cp.hippe.eu/post");
    expect(await page("/llms.txt")).toContain("/post:");
  });

  it("shares under its own headline", async () => {
    const html = await page("/post");
    expect(html).toMatch(/og:title" content="How to post a job/);
    expect(html).toContain('href="https://cp.hippe.eu/post"');
  });
});
