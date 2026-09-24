import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { germanFirstScreen, LANDING_DE } from "../src/public/landing.de.js";

/**
 * The first screen of the landing page, in the reader's language.
 *
 * Measured at one real person, which is both the reason to build it and the reason to build only
 * the first screen: on 2026-09-23 at 22:42 UTC the second human reader this service has ever had
 * arrived from Conway issue #376 with a German browser, read this page to its last depth mark, and
 * read it in English while /check had been answering in German since that morning.
 */
const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const app = () => createApp({ db: openDb(":memory:") });
const get = (accept?: string) =>
  app().request("/", { headers: accept ? { accept: BROWSER, "accept-language": accept } : { accept: BROWSER } });

describe("the landing page speaks to the reader who came", () => {
  it("answers a German browser in German", async () => {
    const html = await (await get("de-DE,de;q=0.9,en-US;q=0.8")).text();
    expect(html).toContain("Mehrere Agenten schreiben ihn.");
    expect(html).toContain("Auftrag kostenlos prüfen");
    // Asked of the rendered headline and not of the whole document: two CSS comments in
    // index.html quote the English line as the longest one they measured against, and they are
    // not text a reader sees.
    const h1 = html.slice(html.indexOf("<h1>"), html.indexOf("</h1>"));
    expect(h1).not.toContain("Several agents do it.");
    expect(h1).toContain("Mehrere Agenten schreiben ihn.");
    expect(html, "German prose under lang=en is read aloud as English").toMatch(/<html lang="de">/);
  });

  it("leaves an English browser in English", async () => {
    const html = await (await get("en-US,en;q=0.9")).text();
    expect(html).toContain("Several agents do it.");
    expect(html).not.toContain("Mehrere Agenten schreiben ihn.");
    expect(html).toMatch(/<html lang="en">/);
  });

  it("stays English when the browser says nothing", async () => {
    const html = await (await get()).text();
    expect(html).toContain("Several agents do it.");
  });

  // The markers are scaffolding and must never reach a reader in either language.
  it("leaves no marker on the page, whichever language it served", async () => {
    for (const accept of ["de-DE,de;q=0.9", "en-US,en;q=0.9", undefined]) {
      const html = await (await get(accept)).text();
      expect(html, `markers leaked for ${accept ?? "no header"}`).not.toMatch(/<!--T:|<!--\/T-->/);
    }
  });
});

describe("a half-finished translation leaves English, never a gap", () => {
  it("keeps the English of a key that has no German", () => {
    const html = '<p><!--T:nosuchkey-->the original<!--/T--></p>';
    expect(germanFirstScreen(html, "de")).toBe("<p>the original</p>");
  });

  it("replaces a key that has one", () => {
    const html = '<p><!--T:h1c-->Pay one.<!--/T--></p>';
    expect(germanFirstScreen(html, "de")).toBe(`<p>${LANDING_DE.h1c}</p>`);
  });

  it("strips the markers for an English reader without touching the text", () => {
    const html = '<p><!--T:h1c-->Pay one.<!--/T--></p>';
    expect(germanFirstScreen(html, "en")).toBe("<p>Pay one.</p>");
  });

  it("carries a German string for every marker the page actually has", async () => {
    // A marker without a translation is not an error, but on the first screen it would be a
    // sentence in the wrong language in the middle of one that is right.
    const html = await (await app().request("/", { headers: { accept: BROWSER } })).text();
    const raw = (await import("node:fs")).readFileSync("src/public/index.html", "utf8");
    const keys = [...raw.matchAll(/<!--T:([a-z0-9]+)-->/g)].map((m) => m[1]);
    expect(keys.length, "the markers are gone from the file, so this test checks nothing").toBeGreaterThan(4);
    for (const k of keys) expect(LANDING_DE[k], `no German for '${k}'`).toBeTruthy();
    expect(html).not.toContain("<!--T:");
  });
});
