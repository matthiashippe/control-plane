import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const INDEX = join(__dirname, "..", "src", "public", "index.html");

/**
 * How heavy the first screen is allowed to get.
 *
 * Measured against production on 2026-09-23: 60,461 bytes raw, 19,617 over the wire compressed,
 * 57 to 80 ms to first byte and about 100 ms in total, and not one request to a host that is not
 * this one. 72 % of it is the inline stylesheet.
 *
 * Inline is the right call here and the numbers say why: every visit this service has ever had
 * was a single page, so a cached external stylesheet would save nothing and cost a round trip on
 * the only view that happens. That stops being true the day somebody opens a second page, and
 * ops/traffic.sh is where that would show up.
 *
 * This is a ceiling, not a target. It exists because a page grows by a paragraph at a time and
 * nobody notices until it is 200 KB, and because page weight is one of the few things Google
 * measures directly.
 */
describe("the landing page stays light", () => {
  const raw = readFileSync(INDEX);
  const gz = gzipSync(raw, { level: 9 });

  it("is under 90 KB before compression", () => {
    // 60 KB on 2026-09-23. Half again as much is room to work in; twice is a different page.
    expect(raw.length, `index.html is ${Math.round(raw.length / 1024)} KB`).toBeLessThan(90 * 1024);
  });

  it("is under 30 KB compressed, which is what a visitor waits for", () => {
    // 19 KB on 2026-09-23. gzip here, brotli on the wire, so this is the pessimistic figure.
    expect(gz.length, `compressed it is ${Math.round(gz.length / 1024)} KB`).toBeLessThan(30 * 1024);
  });

  it("asks for nothing from a host that is not this one", () => {
    // No fonts, no analytics, no CDN. A single external script is one more party that can watch
    // whoever reads this page, and one more thing that can be slow or gone.
    const html = raw.toString("utf8");
    const external: string[] = [];
    for (const m of html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)) {
      const host = new URL(m[1]).host;
      // Links a reader follows are not resources the page loads; only these two attributes can
      // fetch something, and an <a href> is neither.
      const before = html.slice(Math.max(0, m.index! - 200), m.index!);
      const isAnchor = /<a\s[^>]*$/.test(before);
      if (!isAnchor && host !== "cp.hippe.eu") external.push(m[1]);
    }
    expect(external, `these would be fetched from elsewhere: ${external.join(", ")}`).toEqual([]);
  });

  it("keeps the stylesheet the largest part, which is what makes the rest cheap", () => {
    const html = raw.toString("utf8");
    const style = (html.match(/<style[\s\S]*?<\/style>/g) ?? []).join("").length;
    const script = (html.match(/<script[\s\S]*?<\/script>/g) ?? []).join("").length;
    // The script is 2 KB against 43 KB of CSS. If that ever inverts, this page has grown a
    // front end, and the claim on /terms that it runs no third-party code needs re-reading.
    expect(script, "the inline script has outgrown the stylesheet").toBeLessThan(style);
  });
});
