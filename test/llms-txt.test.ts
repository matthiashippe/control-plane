/**
 * llms.txt is the file the target market reads, and it kept its page list by hand.
 *
 * /check shipped on 2026-09-22 and this file did not grow, which made it the fifth hand-kept list
 * in this repo to miss the newest page in one day: three test files, two ops checks, and the one
 * document written specifically for the agents this service is trying to reach.
 *
 * The list stays hand-written on purpose, because each line says what the page is FOR and that
 * cannot be generated. What is generated is the demand that every page be on it.
 */
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { sitemapPages } from "./site-pages.js";

describe("llms.txt", () => {
  it("names every page in the sitemap, with a line about what it is for", async () => {
    const app = createApp({ db: openDb(":memory:") });
    const txt = await (await app.request("/llms.txt")).text();
    for (const path of await sitemapPages(app)) {
      if (path === "/") continue; // the whole file is about the landing page
      const line = txt.match(new RegExp(`^- ${path.replace("/", "\\/")}: (.+)$`, "m"));
      expect(line, `${path} is in the sitemap and not in llms.txt`).toBeTruthy();
      expect(line![1].length, `the line for ${path} says nothing about what it is for`).toBeGreaterThan(25);
    }
  });

  it("names no page that does not answer", async () => {
    const app = createApp({ db: openDb(":memory:") });
    const txt = await (await app.request("/llms.txt")).text();
    for (const m of txt.matchAll(/^- (\/[a-z0-9/._-]+):/gm)) {
      const path = m[1];
      if (path.startsWith("/v1/") || path.startsWith("/pay/") || path.startsWith("/.well-known/")) continue;
      const res = await app.request(path);
      expect(res.status, `llms.txt names ${path} and it answers ${res.status}`).toBeLessThan(400);
    }
  });

  it("is plain text and small enough to be read whole", async () => {
    const res = await createApp({ db: openDb(":memory:") }).request("/llms.txt");
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);
    const txt = await res.text();
    expect(txt.length, "a file nobody finishes is a file nobody uses").toBeLessThan(16_000);
    expect(txt).toMatch(/cp\.hippe\.eu/);
  });
});
