/**
 * The error pages /errors/{slug} (goals/reichweite/01, Punkt 4 and 5): one page per error text a Conway operator types into a
 * search box. What these hold is what a search result and the first screen promise: the exact text in the heading and the title,
 * the one line that keeps the automaton running with the public origin in it, the way on to /fix, and that search engines can find
 * the pages at all (sitemap, canonical link, a link from the start page). The pixels are ops/soll-errors.mjs's job.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { ERROR_PAGES } from "../src/public/error-pages.js";

const ORIGIN = "https://automatonhost.com";
const HEADINGS: Record<string, string> = {
  "verify-500-database-error": '/v1/auth/verify returns 500 {"error":"Database error"}',
  "invalid-or-expired-nonce": '/v1/auth/verify returns 401 {"error":"Invalid or expired nonce"}',
  "credits-never-granted": "x402 top-up paid on-chain, but credits never granted",
};
const SLUGS = Object.keys(HEADINGS);

const decode = (t: string) =>
  t.replace(/&quot;|&#34;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const text = (html: string) => decode(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

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
const get = async (path: string) => {
  const res = await app().request(path);
  return { status: res.status, type: res.headers.get("content-type") ?? "", html: await res.text() };
};

describe("/errors/{slug}", () => {
  it("answers each error page with 200 and html", async () => {
    expect(ERROR_PAGES.map((p) => p.slug)).toEqual(SLUGS);
    for (const slug of SLUGS) {
      const r = await get(`/errors/${slug}`);
      expect(r.status, slug).toBe(200);
      expect(r.type, slug).toMatch(/text\/html/);
    }
  });

  it("puts the exact error text in the heading and the title", async () => {
    for (const slug of SLUGS) {
      const { html } = await get(`/errors/${slug}`);
      const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
      expect(h1 && text(h1[1]), slug).toBe(HEADINGS[slug]);
      const title = /<title>([\s\S]*?)<\/title>/.exec(html);
      expect(title && text(title[1]), slug).toBe(`Conway automaton: ${HEADINGS[slug]} | automatonhost.com`);
      // The head attributes carry the same text, with the quotes escaped so the attribute does not end early.
      const og = /<meta property="og:title" content="([^"]*)"/.exec(html);
      expect(og && decode(og[1]), slug).toBe(`Conway automaton: ${HEADINGS[slug]} | automatonhost.com`);
    }
  });

  it("shows the conwayApiUrl line with the public origin", async () => {
    for (const slug of SLUGS) {
      const { html } = await get(`/errors/${slug}`);
      const block = html.slice(html.indexOf('data-soll="fix"'));
      expect(html.indexOf('data-soll="fix"'), slug).toBeGreaterThan(-1);
      expect(text(block), slug).toContain(`{ "conwayApiUrl": "${ORIGIN}" }`);
      expect(text(block), slug).toContain("automaton --provision");
      expect(html, slug).not.toMatch(/cp\.hippe\.eu|postyourprice/i);
    }
  });

  it("links each error page to /fix", async () => {
    for (const slug of SLUGS) {
      const { html } = await get(`/errors/${slug}`);
      const block = html.slice(html.indexOf('data-soll="fix"'), html.indexOf("</main>"));
      expect(block, slug).toContain('href="/fix"');
    }
  });

  it("answers 404 for an unknown error page", async () => {
    for (const path of ["/errors/database-error", "/errors/VERIFY-500-DATABASE-ERROR", "/errors/%3Cscript%3E"]) {
      const r = await get(path);
      expect(r.status, path).toBe(404);
      expect(r.type, path).toMatch(/text\/html/);
      expect(r.html, path).toContain('<meta name="robots" content="noindex">');
      expect(r.html, path).not.toContain("<script>");
      for (const slug of SLUGS) expect(r.html, path).toContain(`href="/errors/${slug}"`);
    }
  });

  it("points the canonical link at the error page", async () => {
    for (const slug of SLUGS) {
      const { html } = await get(`/errors/${slug}`);
      expect(html, slug).toContain(`<link rel="canonical" href="${ORIGIN}/errors/${slug}">`);
      expect(html, slug).toContain(`<meta property="og:url" content="${ORIGIN}/errors/${slug}">`);
    }
  });

  it("names the three error pages in the sitemap", async () => {
    const { html: xml } = await get("/sitemap.xml");
    for (const slug of SLUGS) expect(xml, slug).toContain(`<loc>${ORIGIN}/errors/${slug}</loc>`);
  });

  it("links the three error pages from the start page", async () => {
    const { html } = await get("/");
    const at = html.indexOf('data-soll="errors"');
    const footer = html.lastIndexOf("<footer", at);
    expect(at, "block errors").toBeGreaterThan(-1);
    expect(footer, "block errors is not in the footer").toBeGreaterThan(-1);
    const block = html.slice(at, html.indexOf("</footer>", at));
    for (const slug of SLUGS) expect(block, slug).toContain(`href="/errors/${slug}"`);
  });
});
