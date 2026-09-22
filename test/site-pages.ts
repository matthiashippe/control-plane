/**
 * The list of pages a person is meant to read, taken from the service instead of from memory.
 *
 * Three test files carried their own hand-kept array of paths. On 2026-09-22 that cost something
 * concrete: /check was added, and test/starter-promise.test.ts did not know about it, so the new
 * page went out promising a free first job unconditionally. That test exists precisely to catch
 * that, and its own comment predicts it: "the next page that makes this promise will not know
 * about starterOffer, and this is where it gets caught". A hand-kept list cannot keep that
 * promise, because the person adding the page is the person who would have to remember the list.
 *
 * The sitemap is the right source. It is the answer to "which pages are meant to be found", it is
 * served by the app rather than written twice, and `everyHtmlPageIsInTheSitemap` below holds it to
 * the routes so a page cannot quietly leave it.
 */
import { expect } from "vitest";
import type { Hono } from "hono";

type App = ReturnType<typeof import("../src/app.js").createApp>;

/** Every page in the sitemap, as a path. */
export async function sitemapPages(app: App): Promise<string[]> {
  const xml = await (await app.request("/sitemap.xml")).text();
  const paths = [...xml.matchAll(/<loc>https:\/\/cp\.hippe\.eu([^<]*)<\/loc>/g)].map((m) => m[1] || "/");
  expect(paths.length, "the sitemap is empty, so every test using it would pass vacuously").toBeGreaterThan(4);
  return paths;
}

/**
 * Every GET route that answers with HTML, taken from the router.
 *
 * Pattern routes are skipped: they need a parameter to answer and are not pages anybody links to.
 */
export async function htmlRoutes(app: App): Promise<string[]> {
  const routes = (app as unknown as Hono).routes as { path: string; method: string }[];
  const gets = [...new Set(routes.filter((r) => r.method === "GET").map((r) => r.path))].sort();
  const html: string[] = [];
  for (const path of gets) {
    if (path.includes(":") || path.includes("*")) continue;
    const res = await app.request(path);
    if ((res.headers.get("content-type") ?? "").includes("text/html")) html.push(path);
  }
  return html;
}
