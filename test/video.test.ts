/**
 * The video of goals/reichweite/03 on the pages (Punkt 6): the route /video/{file} serves exactly the video and its still,
 * answers a Range request the way Safari needs it to play an MP4, and the start page and every error page embed the video
 * right below the block that carries the conwayApiUrl line, loading it only when the reader presses play. The pixels are the
 * job of ops/soll.mjs and ops/soll-errors.mjs, the files themselves of ops/video-assess.mjs.
 */
import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { ERROR_PAGES } from "../src/public/error-pages.js";

const ORIGIN = "https://automatonhost.com";
const MP4 = fs.readFileSync(new URL("../src/public/video/umzug.mp4", import.meta.url));
const POSTER = fs.readFileSync(new URL("../src/public/video/umzug-poster.png", import.meta.url));

let before: string | undefined;
beforeEach(() => {
  before = process.env.CP_PUBLIC_URL;
  process.env.CP_PUBLIC_URL = ORIGIN;
});
afterEach(() => {
  if (before === undefined) delete process.env.CP_PUBLIC_URL;
  else process.env.CP_PUBLIC_URL = before;
});

const app = () => createApp({ db: openDb(":memory:") });
const html = async (path: string) => (await app().request(path)).text();

/** The block data-soll="video" of a page: from its opening tag to the end of the video element. */
function videoBlock(page: string): { at: number; block: string } {
  const i = page.indexOf('data-soll="video"');
  if (i < 0) return { at: -1, block: "" };
  const start = page.lastIndexOf("<", i);
  return { at: start, block: page.slice(start, page.indexOf("</video>", i) + "</video>".length) };
}

describe("/video/{file}", () => {
  it("serves the video as mp4 with accept-ranges", async () => {
    const res = await app().request("/video/umzug.mp4");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-length")).toBe(String(MP4.length));
    expect(Buffer.from(await res.arrayBuffer()).equals(MP4)).toBe(true);
  });

  it("answers a range request with 206 and content-range", async () => {
    const res = await app().request("/video/umzug.mp4", { headers: { Range: "bytes=100-199" } });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("content-range")).toBe(`bytes 100-199/${MP4.length}`);
    expect(res.headers.get("content-length")).toBe("100");
    expect(Buffer.from(await res.arrayBuffer()).equals(MP4.subarray(100, 200))).toBe(true);
    // Safari asks for the first two bytes first, then open ranges and the tail.
    const first = await app().request("/video/umzug.mp4", { headers: { Range: "bytes=0-1" } });
    expect(first.status).toBe(206);
    expect(Buffer.from(await first.arrayBuffer()).equals(MP4.subarray(0, 2))).toBe(true);
    const open = await app().request("/video/umzug.mp4", { headers: { Range: `bytes=${MP4.length - 10}-` } });
    expect(open.headers.get("content-range")).toBe(`bytes ${MP4.length - 10}-${MP4.length - 1}/${MP4.length}`);
    const tail = await app().request("/video/umzug.mp4", { headers: { Range: "bytes=-5" } });
    expect(Buffer.from(await tail.arrayBuffer()).equals(MP4.subarray(MP4.length - 5))).toBe(true);
    const past = await app().request("/video/umzug.mp4", { headers: { Range: `bytes=0-${MP4.length + 1000}` } });
    expect(past.headers.get("content-range")).toBe(`bytes 0-${MP4.length - 1}/${MP4.length}`);
  });

  it("answers an unsatisfiable range with 416", async () => {
    for (const range of [`bytes=${MP4.length}-`, `bytes=${MP4.length + 5}-${MP4.length + 9}`, "bytes=20-10", "bytes=-0"]) {
      const res = await app().request("/video/umzug.mp4", { headers: { Range: range } });
      expect(res.status, range).toBe(416);
      expect(res.headers.get("content-range"), range).toBe(`bytes */${MP4.length}`);
    }
  });

  it("serves the poster as png", async () => {
    const res = await app().request("/video/umzug-poster.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await res.arrayBuffer()).equals(POSTER)).toBe(true);
  });

  it("answers 404 for any other file under /video/", async () => {
    for (const p of ["/video/other.mp4", "/video/umzug.MP4", "/video/..%2Fapp.ts", "/video/umzug.mp4.bak", "/video/"]) {
      const res = await app().request(p);
      expect(res.status, p).toBe(404);
      expect(res.headers.get("content-type") ?? "", p).not.toMatch(/video|image/);
    }
  });
});

describe("the block data-soll=\"video\"", () => {
  it("embeds the video below the move block on the start page", async () => {
    const page = await html("/");
    const move = page.indexOf('data-soll="move"');
    const moveEnd = page.indexOf("</section>", move);
    const { at, block } = videoBlock(page);
    expect(move).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(moveEnd);
    // Directly after the block move: nothing but white space between them.
    expect(page.slice(moveEnd + "</section>".length, at).trim()).toBe("");
    expect(block).toContain('<source src="/video/umzug.mp4" type="video/mp4">');
    expect(block).toContain('poster="/video/umzug-poster.png"');
  });

  it("embeds the video below the fix block on every error page", async () => {
    for (const p of ERROR_PAGES) {
      const page = await html(`/errors/${p.slug}`);
      const fix = page.indexOf('data-soll="fix"');
      const { at, block } = videoBlock(page);
      expect(fix, p.slug).toBeGreaterThan(-1);
      expect(at, p.slug).toBeGreaterThan(fix);
      expect(block, p.slug).toContain('<source src="/video/umzug.mp4" type="video/mp4">');
    }
  });

  it("loads the video only on play", async () => {
    for (const path of ["/", ...ERROR_PAGES.map((p) => `/errors/${p.slug}`)]) {
      const { block } = videoBlock(await html(path));
      const tag = block.slice(block.indexOf("<video"), block.indexOf(">", block.indexOf("<video")) + 1);
      expect(tag, path).toMatch(/\bpreload="none"/);
      expect(tag, path).toMatch(/\bcontrols\b/);
      expect(tag, path).not.toMatch(/autoplay/i);
      expect(block, path).not.toMatch(/<script/i);
    }
    // Nothing on the page asks for the video before play: the sitemap does not list it either.
    expect(await html("/sitemap.xml")).not.toContain("/video/");
  });
});
