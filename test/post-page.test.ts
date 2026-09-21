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
import { openDb } from "../src/db.js";

const page = async (pfad: string): Promise<string> =>
  (await createApp({ db: openDb(":memory:") }).request(pfad)).text();

describe("/post", () => {
  it("is where the landing page's primary button leads", async () => {
    const html = await page("/");
    // The button text and the destination have to agree. They did not, which is the whole reason
    // this page exists.
    expect(html).toMatch(/href="\/post"[^>]*>Post a job, the first one is free/);
    const knopf = html.indexOf('class="btn btn-primary"');
    expect(knopf, "the primary button is gone").toBeGreaterThan(-1);
    expect(html.slice(knopf, knopf + 200), "the primary button must not send a buyer to the agents' page")
      .not.toContain('href="/jobs"');
  });

  it("names every call the buyer's path needs, in order", async () => {
    const html = await page("/post");
    const schritte = [
      "/v1/briefs/check",   // 1. without a key
      "/v1/bounties",       // 3. post
      "/v1/submissions",    // 4. read
      "/v1/check",          // 5. what was made up
      "/v1/bounties/award", // 6. award
      "/v1/bounties/cancel",
    ];
    let zuletzt = -1;
    for (const schritt of schritte) {
      const wo = html.indexOf(schritt);
      expect(wo, `${schritt} is missing from the buyer's path`).toBeGreaterThan(-1);
      expect(wo, `${schritt} comes before the step it depends on`).toBeGreaterThan(zuletzt);
      zuletzt = wo;
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
