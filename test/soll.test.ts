import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error plain ESM module under ops/, no declaration file
import { FOLD, MAX_DIFF_PIXELS, assess, decodePng, encodePng, isLocal, pixelDiffCount, summary } from "../ops/soll-assess.mjs";

/**
 * The judgement of ops/soll.mjs, without a browser: the GitHub runners have no Chromium, so the browser only measures and this
 * pure part decides. One case per defect the goal names (goals/seite/01, Punkt 2), each planted on an otherwise clean render,
 * and the clean render itself, which must pass with no defect at all.
 */

type Picture = { width: number; height: number; data: Buffer };

function picture(width: number, height: number, paint?: (x: number, y: number) => [number, number, number]): Picture {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b] = paint ? paint(x, y) : [10, 11, 9];
    data.set([r, g, b, 255], (y * width + x) * 4);
  }
  return { width, height, data };
}

/** A render at 390 px that is clean on every count. */
const clean = (over: Record<string, unknown> = {}) => ({
  width: 390,
  pngWidth: 390,
  diffPixels: 0,
  scrollWidth: 390,
  text: "Conway not answering?\nKeep your automaton running.\nautomaton --provision",
  foreign: [] as string[],
  umzugBottom: 801,
  ...over,
});

describe("soll judgement", () => {
  it("passes a clean render at both widths with no defect", () => {
    expect(assess(clean())).toEqual([]);
    expect(assess(clean({ width: 1440, pngWidth: 1440, scrollWidth: 1440, umzugBottom: 656 }))).toEqual([]);
    expect(summary([{ width: 390, umzugBottom: 801, defects: [] }, { width: 1440, umzugBottom: 656, defects: [] }]))
      .toBe("soll: 2 Bilder, umzug oben 390=801 1440=656, 0 Mängel");
  });

  it("rejects a picture with even one pixel that differs from a fresh render", () => {
    expect(MAX_DIFF_PIXELS).toBe(0);
    const base = picture(100, 100);
    // One changed pixel, as a changed price or word leaves a few dozen on a page of millions.
    const changed = picture(100, 100, (x, y) => (x === 50 && y === 50 ? [240, 240, 240] : [10, 11, 9]));
    const diff = pixelDiffCount(base, changed);
    expect(diff).toBe(1);
    expect(assess(clean({ diffPixels: diff })).join("\n")).toMatch(/390: 1 pixels differ from a fresh render/);
    // Antialiasing noise below the channel tolerance is no change.
    expect(pixelDiffCount(base, picture(100, 100, () => [14, 15, 13]))).toBe(0);
    // A missing picture is a defect, not a pass.
    expect(assess(clean({ diffPixels: null })).join("\n")).toMatch(/no committed picture/);
  });

  it("counts every pixel outside the smaller picture as different, so a longer page cannot hide", () => {
    expect(pixelDiffCount(picture(10, 10), picture(10, 20))).toBe(100);
    expect(assess(clean({ pngWidth: 1440 })).join("\n")).toMatch(/picture is 1440 px wide/);
  });

  it("rejects horizontal overflow", () => {
    expect(assess(clean({ scrollWidth: 391 })).join("\n")).toMatch(/horizontal overflow, scrollWidth 391/);
  });

  it("rejects a dash in the visible text, en dash and em dash alike", () => {
    expect(assess(clean({ text: "One line \u2013 and it thinks again" })).join("\n")).toMatch(/dash in the visible text/);
    expect(assess(clean({ text: "One line \u2014 and it thinks again" })).join("\n")).toMatch(/dash in the visible text/);
    expect(assess(clean({ text: "automaton --provision, one-line config" }))).toEqual([]);
  });

  it("rejects any request to a foreign address made while rendering", () => {
    const out = assess(clean({ foreign: ["https://fonts.example.com/inter.woff2"] }));
    expect(out.join("\n")).toMatch(/request to a foreign address: https:\/\/fonts\.example\.com/);
    expect(isLocal("file:///tmp/startseite.html")).toBe(true);
    expect(isLocal("data:image/svg+xml,<svg/>")).toBe(true);
    expect(isLocal("https://postyourprice.com/")).toBe(false);
    expect(isLocal("http://127.0.0.1:9/")).toBe(false);
  });

  it("rejects the move block ending below the first screen, and a page without it", () => {
    expect(FOLD).toEqual({ 390: 844, 1440: 900 });
    expect(assess(clean({ umzugBottom: 845 })).join("\n")).toMatch(/ends at 845 px, below the first screen at 844/);
    expect(assess(clean({ umzugBottom: 844 }))).toEqual([]);
    expect(assess(clean({ width: 1440, pngWidth: 1440, scrollWidth: 1440, umzugBottom: 901 })).join("\n")).toMatch(/below the first screen at 900/);
    expect(assess(clean({ umzugBottom: null })).join("\n")).toMatch(/data-soll="umzug" is missing/);
  });

  it("decodes what it encodes, and reads the committed pictures at their own width", () => {
    const p = picture(7, 3, (x, y) => [x * 30, y * 80, 200]);
    const back = decodePng(encodePng(p.width, p.height, p.data));
    expect([back.width, back.height]).toEqual([7, 3]);
    expect(Buffer.compare(back.data, p.data)).toBe(0);
    for (const w of [390, 1440]) {
      const real = decodePng(readFileSync(join(__dirname, "..", "docs", "soll", `startseite-${w}.png`)));
      expect(real.width).toBe(w);
      expect(real.height).toBeGreaterThan(FOLD[w as 390 | 1440]);
    }
  });
});
