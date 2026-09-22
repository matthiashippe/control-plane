/**
 * The depth pixels, and the control that decides whether they mean anything.
 *
 * `ops/traffic.sh` reported "0 of N who opened the page went on to a second one" for days with the
 * footnote that anchor links leave no log line. Since the rebuild the only in-page navigation is
 * anchors, so that number cannot separate a reader who went through the page and left from
 * somebody who bounced at the fold, and those two findings call for opposite work.
 *
 * No script is available: the CSP pins one inline script by hash and deploy/ is not touched
 * without a human. `loading="lazy"` needs none.
 */
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";

const MARKS = ["top", "proof", "market", "close"] as const;

describe("how far down the page a reader got", () => {
  it("serves a one-pixel PNG at each mark, uncached", async () => {
    const app = createApp({ db: openDb(":memory:") });
    for (const mark of MARKS) {
      const res = await app.request(`/px/${mark}.png`);
      expect(res.status, `/px/${mark}.png`).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      // A cached pixel is a reader the count loses, so it must not be cacheable.
      expect(res.headers.get("cache-control"), "no-store or the second visit is invisible").toBe("no-store");
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(bytes.length, "one pixel, not an image").toBeLessThan(200);
    }
  });

  it("puts every mark on the page, lazy and out of the way", async () => {
    const html = await (await createApp({ db: openDb(":memory:") }).request("/")).text();
    for (const mark of MARKS) {
      const tag = html.match(new RegExp(`<img src="/px/${mark}\\.png"[^>]*>`))?.[0];
      expect(tag, `/px/${mark}.png is not on the page`).toBeTruthy();
      // Without lazy the image is fetched on load and the mark says nothing about depth.
      expect(tag, "lazy is the whole mechanism").toContain('loading="lazy"');
      expect(tag, "a pixel a screen reader announces is a pixel that costs something").toContain('aria-hidden="true"');
      expect(tag).toContain('alt=""');
    }
  });

  it("keeps the control in the first screen and the others below it", async () => {
    // The control is what makes this a measurement: a browser that fetches every lazy image at
    // once fires it together with the rest, and ops/depth.sh then reports the signal as worthless
    // instead of reporting a scroll that never happened. That only works if it really is at the
    // top, so the order is pinned here.
    const html = await (await createApp({ db: openDb(":memory:") }).request("/")).text();
    const posOf = (m: string) => html.indexOf(`/px/${m}.png`);
    expect(posOf("top"), "the control has to be in the first screen").toBeLessThan(html.indexOf('id="proof"'));
    expect(posOf("top")).toBeLessThan(posOf("proof"));
    expect(posOf("proof")).toBeLessThan(posOf("market"));
    expect(posOf("market")).toBeLessThan(posOf("close"));
    expect(posOf("close"), "the last mark belongs after the market").toBeGreaterThan(html.indexOf('id="agents"'));
  });

  it("asks for nothing a reader did not already send", async () => {
    // Same-origin, no cookie, no query string, no identifier. The request lands in the access log
    // every page view already lands in, which is the only reason this is proportionate at all.
    const html = await (await createApp({ db: openDb(":memory:") }).request("/")).text();
    const tags = [...html.matchAll(/<img src="\/px\/[^"]+"[^>]*>/g)].map((m) => m[0]);
    expect(tags).toHaveLength(MARKS.length);
    for (const tag of tags) {
      expect(tag, "no query string, so nothing can be smuggled into the log").not.toMatch(/\?/);
      expect(tag).not.toMatch(/crossorigin|referrerpolicy=["']unsafe/i);
    }
    const res = await createApp({ db: openDb(":memory:") }).request("/px/top.png");
    expect(res.headers.get("set-cookie"), "no cookie").toBeNull();
  });
});
