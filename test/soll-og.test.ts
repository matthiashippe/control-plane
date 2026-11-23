import { describe, it, expect } from "vitest";
// @ts-expect-error plain ESM module under ops/, no declaration file
import { OG_CARD, assessOg, pixelDiffCount, summaryOg } from "../ops/soll-assess.mjs";

/**
 * The judgement of ops/soll-og.mjs over the preview card /og.png, without a browser (move goal 03, Punkt 1). One case per
 * defect the goal names, each planted on an otherwise clean render, and the clean render itself, which must pass with nothing.
 */

type Picture = { width: number; height: number; data: Buffer };

function picture(width: number, height: number, paint?: (x: number, y: number) => [number, number, number]): Picture {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b] = paint ? paint(x, y) : [12, 14, 12];
    data.set([r, g, b, 255], (y * width + x) * 4);
  }
  return { width, height, data };
}

/** A render of the card that is clean on every count. */
const clean = (over: Record<string, unknown> = {}) => ({
  width: 2400,
  height: 1260,
  pngWidth: 2400,
  pngHeight: 1260,
  diffPixels: 0,
  contentWidth: 1128,
  contentHeight: 562,
  text: "automatonhost.com\nConway not answering?\nYour automaton runs here.\nONE LINE TO CHANGE\n\"conwayApiUrl\": \"https://automatonhost.com\"\nautomatonhost.com",
  foreign: [] as string[],
  ...over,
});

describe("soll judgement of the preview card", () => {
  it("passes a clean render of the card at 2400 x 1260 with no defect and ends its summary in 0 defects", () => {
    expect(OG_CARD).toEqual({ width: 1200, height: 630, scale: 2 });
    const defects = assessOg(clean());
    expect(defects).toEqual([]);
    expect(summaryOg({ width: 2400, height: 1260, diffPixels: 0, defects })).toBe("soll og: 1 picture, 2400x1260, diff 0 px, 0 defects");
    expect(summaryOg({ width: 2400, height: 1260, diffPixels: null, defects: ["x"] }))
      .toBe("soll og: 1 picture, 2400x1260, diff nothing to compare, 1 defects");
  });

  it("rejects a picture with even one pixel that differs from a fresh render, and a missing picture", () => {
    const changed = picture(100, 100, (x, y) => (x === 7 && y === 2 ? [240, 240, 240] : [12, 14, 12]));
    const diff = pixelDiffCount(picture(100, 100), changed);
    expect(diff).toBe(1);
    expect(assessOg(clean({ diffPixels: diff }))).toEqual(["og: 1 pixels differ from a fresh render"]);
    expect(assessOg(clean({ diffPixels: null, pngWidth: undefined, pngHeight: undefined }))).toEqual(["og: no committed picture to compare with"]);
  });

  it("rejects a picture of another size, fresh or committed", () => {
    expect(assessOg(clean({ width: 1200, height: 630 })).join("\n")).toMatch(/^og: fresh picture is 1200 x 630, not 2400 x 1260$/m);
    expect(assessOg(clean({ pngWidth: 2400, pngHeight: 1254 })).join("\n")).toMatch(/^og: committed picture is 2400 x 1254, not 2400 x 1260$/m);
  });

  it("rejects content that is wider or taller than the card", () => {
    expect(assessOg(clean({ contentWidth: 1201 }))).toEqual(["og: content is 1201 px wide, wider than the card at 1200"]);
    expect(assessOg(clean({ contentHeight: 640 }))).toEqual(["og: content is 640 px tall, taller than the card at 630"]);
    expect(assessOg(clean({ contentWidth: 1200, contentHeight: 630 }))).toEqual([]);
  });

  it("rejects a dash in the visible text", () => {
    expect(assessOg(clean({ text: "automatonhost.com — x" })).join("\n")).toMatch(/og: dash in the visible text: automatonhost\.com/);
    expect(assessOg(clean({ text: "Conway – not answering?" })).join("\n")).toMatch(/og: dash in the visible text/);
  });

  it("rejects a foreign address, requested or named in an attribute", () => {
    expect(assessOg(clean({ foreign: ["https://fonts.example.com/a.woff2"] })).join("\n"))
      .toMatch(/og: request to a foreign address: https:\/\/fonts\.example\.com/);
    expect(assessOg(clean({ foreign: ["href=//cdn.example.org/x.css"] })).join("\n"))
      .toMatch(/og: request to a foreign address: href=\/\/cdn\.example\.org/);
  });
});
