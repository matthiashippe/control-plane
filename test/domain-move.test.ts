import { describe, it, expect, afterEach } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";

/**
 * A domain is about to be bought. This is what the move costs.
 *
 * Before 2026-09-23 the answer was 229 mentions across 91 files, and the ones inside curl examples
 * in prose would have been found last, by a reader who copied one and got a 404 at the old host.
 * Now it is CP_PUBLIC_URL and a deploy, and this file is what says so.
 *
 * The test that matters is the last one: not a single mention of the built-in host survives
 * anywhere in a served page when the variable is set. Checking the canonical link alone would
 * pass while every copyable command still pointed at the old name.
 */
const NEW = "https://postyourprice.com";

afterEach(() => {
  delete process.env.CP_PUBLIC_URL;
});

async function pageAt(path: string): Promise<string> {
  const db = openDb(":memory:");
  const app = createApp({ db });
  const res = await app.request(path, { headers: { accept: "text/html" } });
  return await res.text();
}

describe("moving to another domain", () => {
  it("leaves every page on the built-in host while the variable is unset", async () => {
    const html = await pageAt("/");
    expect(html).toContain("cp.hippe.eu");
    expect(html).not.toContain("postyourprice.com");
  });

  it("rewrites the canonical link, which is what a search engine reads", async () => {
    process.env.CP_PUBLIC_URL = NEW;
    const html = await pageAt("/post");
    expect(html).toMatch(/<link rel="canonical" href="https:\/\/postyourprice\.com\/post"/);
  });

  it("rewrites the card a shared link unfurls into", async () => {
    // The one broken thing nobody notices, because it only shows in somebody else's chat window.
    process.env.CP_PUBLIC_URL = NEW;
    const html = await pageAt("/");
    expect(html).toMatch(/og:image" content="https:\/\/postyourprice\.com\//);
    expect(html).toMatch(/og:url" content="https:\/\/postyourprice\.com\//);
  });

  it("rewrites the sitemap, so the new host is what gets crawled", async () => {
    process.env.CP_PUBLIC_URL = NEW;
    const db = openDb(":memory:");
    const app = createApp({ db });
    const xml = await (await app.request("/sitemap.xml")).text();
    expect(xml).toContain("<loc>https://postyourprice.com/");
    expect(xml).not.toContain("cp.hippe.eu");
  });

  it("ignores a value that is not an origin, rather than poisoning every link", async () => {
    // A trailing path or a typo here would end up in the canonical link of every page at once.
    process.env.CP_PUBLIC_URL = "postyourprice.com/v1";
    const html = await pageAt("/");
    expect(html).toContain("cp.hippe.eu");
  });

  it("leaves no mention of the old host anywhere in a served page", async () => {
    process.env.CP_PUBLIC_URL = NEW;
    for (const path of ["/", "/post", "/jobs", "/check", "/fix", "/receipts", "/terms"]) {
      const html = await pageAt(path);
      expect(html, `${path} still names the built-in host`).not.toContain("cp.hippe.eu");
    }
  });
});
