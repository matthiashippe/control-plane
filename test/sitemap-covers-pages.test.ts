/**
 * A page that is not in the sitemap is a page no crawler is told about and no test finds.
 *
 * Both halves matter, and the second one is why this file exists rather than a line in another
 * test. Three test files used to keep their own list of pages; when /check was added on
 * 2026-09-22, one of those lists went stale and the new page shipped promising something the
 * server can refuse. They read the sitemap now, so this is the single place the whole set is
 * pinned, and it has to be pinned from both sides: the sitemap cannot name a page that does not
 * answer, and the service cannot answer with a page the sitemap does not name.
 */
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { htmlRoutes, sitemapPages } from "./site-pages.js";

describe("The sitemap and the pages", () => {
  it("names every page this service answers with HTML", async () => {
    const app = createApp({ db: openDb(":memory:") });
    const routes = await htmlRoutes(app);
    const listed = await sitemapPages(app);
    expect(routes.length, "no HTML routes found, so this test proves nothing").toBeGreaterThan(4);
    for (const path of routes) {
      expect(listed, `${path} answers HTML and is not in the sitemap`).toContain(path);
    }
  });

  it("names no page that does not answer", async () => {
    const app = createApp({ db: openDb(":memory:") });
    for (const path of await sitemapPages(app)) {
      const res = await app.request(path);
      expect(res.status, `the sitemap names ${path} and it answers ${res.status}`).toBe(200);
      expect(res.headers.get("content-type"), `${path} is in the sitemap and is not a page`).toMatch(/text\/html/);
    }
  });
});
