/**
 * /katalog, the first page on this service written for a person without a wallet (HAN-14).
 *
 * What these hold is what the page was accepted on: three offers at or above the 11.13 EUR
 * break-even, the sentence that says who writes the texts, a German frame, marks of its own that
 * ops/traffic.sh can count per page, and the status script that makes a direct visit countable.
 * Each assertion that says "is there" has a partner that says "and not on the other side".
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { DELIVERY_SENTENCE, OFFERS, REWORK_LINE, euro, renderCatalog } from "../src/public/catalog.js";

const app = () => createApp({ db: openDb(":memory:") });
const get = async (path: string, headers: Record<string, string> = {}) => app().request(path, { headers });
// The body only: the title and description in <head> repeat offer names and the rework line.
const main = (html: string) => html.slice(html.indexOf("<main>"), html.indexOf("</main>"));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("/katalog", () => {
  it("answers 200 in German with three offers from 11.13 EUR", async () => {
    const res = await get("/katalog");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<html lang="de">');
    expect(OFFERS.length).toBeGreaterThanOrEqual(3);
    for (const o of OFFERS) {
      expect(o.priceCents, `${o.name} is under the break-even`).toBeGreaterThanOrEqual(1113);
      expect(html).toContain(o.name);
      expect(html).toContain(euro(o.priceCents));
    }
    expect(text(html)).toContain(DELIVERY_SENTENCE);
  });

  it("says the rework line once under every offer", async () => {
    const html = main(await (await get("/katalog")).text());
    expect(html.split(REWORK_LINE).length - 1).toBe(OFFERS.length);
  });

  it("promises three rounds of changes, not four, and names no time", async () => {
    // MAX_ROUNDS = 4 in src/bounties/store.ts counts the first version as a round.
    const body = text(renderCatalog());
    expect(body).toContain("bis zu dreimal");
    expect(body).not.toMatch(/viermal/);
    expect(body).not.toMatch(/Sekunde|Minute|Stunde|sofort|Tag(e|en)?\b/);
  });

  it("wears a German frame, and only this page does", async () => {
    const html = await (await get("/katalog")).text();
    for (const english of ["Post a job", "Paid out", "Measured and published by"]) {
      expect(html, `the catalogue still says "${english}"`).not.toContain(english);
    }
    expect(html).toContain("Impressum");
    const fix = await (await get("/fix")).text();
    expect(fix, "another page lost its English frame").toContain("Measured and published by");
    expect(fix).toContain("Post a job");
  });

  it("carries the landing page's status script byte for byte, so the CSP hash still allows it", async () => {
    const index = readFileSync(new URL("../src/public/index.html", import.meta.url), "utf-8");
    const script = /<script>([\s\S]*?)<\/script>/.exec(index)![1];
    const html = await (await get("/katalog")).text();
    expect(html).toContain(`<script>${script}</script>`);
    // And /fix still does not: it was not asked for and would change what its traffic means.
    expect(await (await get("/fix")).text()).not.toContain(`<script>${script}</script>`);
  });

  it("has its own marks, each of them served, one in the first screen and more below it", async () => {
    const html = main(await (await get("/katalog")).text());
    const marks = [...html.matchAll(/\/px\/(katalog-[a-z0-9-]+)\.png/g)].map((m) => m[1]);
    expect(marks[0]).toBe("katalog-top");
    expect(marks.filter((m) => m !== "katalog-top").length).toBeGreaterThanOrEqual(1);
    expect(html.indexOf("/px/katalog-top.png")).toBeLessThan(html.indexOf(OFFERS[0].name));
    for (const m of marks) expect((await get(`/px/${m}.png`)).status, m).toBe(200);
    // Not the landing page's marks: those would count a catalogue reader as a / reader.
    expect(html).not.toMatch(/\/px\/(top|proof|market|close|end)\.png/);
    expect((await get("/px/katalog-nope.png")).status).toBe(404);
  });

  it("is linked from the first screen of / in both languages, and listed in the sitemap", async () => {
    for (const lang of ["en", "de"]) {
      const home = await (await get("/", { "accept-language": lang })).text();
      const link = home.indexOf('href="/katalog"');
      expect(link, `no link to /katalog on / (${lang})`).toBeGreaterThan(-1);
      // The first-screen control mark sits right after the hero text; the link must come before it.
      expect(link).toBeLessThan(home.indexOf("/px/top.png"));
    }
    const sitemap = await (await get("/sitemap.xml")).text();
    expect(sitemap).toMatch(/<loc>[^<]*\/katalog<\/loc>/);
  });
});

describe("the page against the goal checker ops/ziele.sh uses", () => {
  // The same file that judges production judges the page as rendered here, so the goal cannot be
  // green on a page this test has never seen, and this test cannot pass on a page the goal rejects.
  const judge = (html: string) => execFileSync("python3", ["ops/katalog_pruefung.py"], { input: html }).toString().trim();

  it("counts the rendered catalogue as a catalogue", async () => {
    expect(judge(await (await get("/katalog")).text())).toBe("1");
  });

  it("does not count it with two offers, or with one under 11.13 EUR", () => {
    expect(judge(renderCatalog(OFFERS.slice(0, 2)))).toBe("0");
    expect(judge(renderCatalog([...OFFERS.slice(0, 2), { ...OFFERS[2], priceCents: 1112 }]))).toBe("0");
  });
});

describe("euro()", () => {
  it("writes whole euros bare and cents with a comma", () => {
    expect(euro(1900)).toBe("19 €");
    expect(euro(1113)).toBe("11,13 €");
    expect(euro(1105)).toBe("11,05 €");
  });
});
