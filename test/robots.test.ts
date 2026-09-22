/**
 * What a crawler is told it may read.
 *
 * Since the deploy of 2026-09-22 a /v1/ path answers a browser with a page instead of an object,
 * and Googlebot sends Accept: text/html. Measured that day: GET /v1/credits/history as Googlebot
 * returns 401 with content-type: text/html. The X-Robots-Tag on that answer keeps it out of the
 * index, but the crawl happens first, and "Allow: /" was an invitation to walk every documented
 * API path for a page that says the same thing every time.
 */
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { sitemapPages } from "./site-pages.js";

const robots = async () => (await createApp({ db: openDb(":memory:") }).request("/robots.txt")).text();

describe("robots.txt", () => {
  it("keeps crawlers out of the API", async () => {
    expect(await robots()).toMatch(/^Disallow: \/v1\/$/m);
  });

  /**
   * The one exception, and it is not optional. The inline script fetches /v1/status while the page
   * renders, and Google is explicit that a resource needed for rendering must not be blocked.
   * Blocking it would cost the crawler the live figures it came for.
   */
  it("still allows the one path the page itself needs while rendering", async () => {
    const txt = await robots();
    expect(txt).toMatch(/^Allow: \/v1\/status$/m);
    // More specific wins in the robots protocol, so the Allow has to be the longer match.
    expect("/v1/status".length).toBeGreaterThan("/v1/".length);
    const html = await (await createApp({ db: openDb(":memory:") }).request("/")).text();
    expect(html, "if the script stops fetching it, this exception is dead weight").toContain('fetch("/v1/status")');
  });

  it("does not block a single page that is in the sitemap", async () => {
    const app = createApp({ db: openDb(":memory:") });
    const txt = await (await app.request("/robots.txt")).text();
    const blocked = [...txt.matchAll(/^Disallow: (\S+)$/gm)].map((m) => m[1]);
    for (const path of await sitemapPages(app)) {
      for (const rule of blocked) {
        expect(
          path.startsWith(rule),
          `${path} is in the sitemap and blocked by "Disallow: ${rule}"`,
        ).toBe(false);
      }
    }
  });

  it("names the sitemap, because that is the only place the page list lives", async () => {
    expect(await robots()).toMatch(/^Sitemap: https:\/\/cp\.hippe\.eu\/sitemap\.xml$/m);
  });

  it("leaves the depth pixels readable, or a rendering crawler reports as broken", async () => {
    const txt = await robots();
    const blocked = [...txt.matchAll(/^Disallow: (\S+)$/gm)].map((m) => m[1]);
    for (const rule of blocked) {
      expect("/px/top.png".startsWith(rule), `the control pixel is blocked by "${rule}"`).toBe(false);
    }
  });
});
