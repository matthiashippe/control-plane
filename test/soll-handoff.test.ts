import { describe, it, expect } from "vitest";
// @ts-expect-error plain ESM module under ops/, no declaration file
import { FOLD, HANDOFF_STATES, assess, assessHandoff, pixelDiffCount, summaryHandoff } from "../ops/soll-assess.mjs";

/**
 * The judgement of ops/soll-handoff.mjs over the phone page /h/{code}, without a browser (goals/konto/02, Punkt 2). One case per
 * defect the goal names, each planted on an otherwise clean render, and the clean render itself, which must pass with nothing.
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

/** A render of the state freigabe at 390 px that is clean on every count. */
const clean = (over: Record<string, unknown> = {}) => ({
  state: "freigabe",
  width: 390,
  pngWidth: 390,
  diffPixels: 0,
  scrollWidth: 390,
  text: "Approve on your phone\nAllow Atlas to spend up to $5.00 a day?\nTap the number shown in your terminal.\n62\n47\n18",
  foreign: [] as string[],
  blockBottom: 528,
  ...over,
});

describe("soll judgement of the phone page", () => {
  it("passes a clean render of every state at both widths with no defect", () => {
    expect(HANDOFF_STATES).toEqual(["freigabe", "erledigt", "ungueltig"]);
    const results = [];
    for (const state of HANDOFF_STATES) for (const width of [390, 1440]) {
      const m = clean({ state, width, pngWidth: width, scrollWidth: width, blockBottom: state === "freigabe" ? (width === 390 ? 528 : 603) : null });
      const defects = assessHandoff(m);
      expect(defects).toEqual([]);
      results.push({ state, width, blockBottom: m.blockBottom, defects });
    }
    expect(summaryHandoff(results)).toBe("soll handoff: 6 Bilder, freigabe oben 390=528 1440=603, 0 Mängel");
  });

  it("rejects a picture with even one pixel that differs from a fresh render", () => {
    const changed = picture(100, 100, (x, y) => (x === 7 && y === 9 ? [240, 240, 240] : [10, 11, 9]));
    const diff = pixelDiffCount(picture(100, 100), changed);
    expect(diff).toBe(1);
    expect(assessHandoff(clean({ diffPixels: diff })).join("\n")).toMatch(/^freigabe 390: 1 pixels differ from a fresh render$/m);
    expect(assessHandoff(clean({ state: "erledigt", diffPixels: null })).join("\n")).toMatch(/erledigt 390: no committed picture/);
  });

  it("rejects horizontal overflow", () => {
    expect(assessHandoff(clean({ scrollWidth: 412 })).join("\n")).toMatch(/freigabe 390: horizontal overflow, scrollWidth 412/);
  });

  it("rejects a dash in the visible text", () => {
    expect(assessHandoff(clean({ state: "ungueltig", blockBottom: null, text: "It ran out \u2013 start again" })).join("\n"))
      .toMatch(/ungueltig 390: dash in the visible text/);
    expect(assessHandoff(clean({ text: "Done \u2014 go back" })).join("\n")).toMatch(/dash in the visible text/);
  });

  it("rejects any request to a foreign address made while rendering", () => {
    expect(assessHandoff(clean({ foreign: ["https://fonts.example.com/a.woff2"] })).join("\n"))
      .toMatch(/freigabe 390: request to a foreign address: https:\/\/fonts\.example\.com/);
  });

  it("rejects the block freigabe when it ends below the first screen, or is missing", () => {
    expect(FOLD[390]).toBe(844);
    expect(FOLD[1440]).toBe(900);
    expect(assessHandoff(clean({ blockBottom: 844 }))).toEqual([]);
    expect(assessHandoff(clean({ blockBottom: 845 })).join("\n")).toMatch(/block freigabe ends at 845 px, below the first screen at 844/);
    expect(assessHandoff(clean({ width: 1440, pngWidth: 1440, scrollWidth: 1440, blockBottom: 901 })).join("\n"))
      .toMatch(/freigabe 1440: block freigabe ends at 901 px, below the first screen at 900/);
    expect(assessHandoff(clean({ blockBottom: null })).join("\n")).toMatch(/block data-soll="freigabe" is missing/);
    // The other two states have no such block and need none.
    expect(assessHandoff(clean({ state: "erledigt", blockBottom: null }))).toEqual([]);
  });

  it("rejects a word the reader would first have to translate in the visible text", () => {
    for (const word of ["Handoff", "phishing", "poll token", "SSE stream"]) {
      expect(assessHandoff(clean({ text: `Tap the number.\n${word} ready` })).join("\n"), word)
        .toMatch(/word the reader has to translate in the visible text/);
    }
    // "sse" only as a word: an ordinary word that contains the letters is not a defect.
    expect(assessHandoff(clean({ text: "Tap the number shown in your terminal. Assess it." }))).toEqual([]);
  });

  it("leaves the judgement of the start page as it was", () => {
    const start = { width: 390, pngWidth: 390, diffPixels: 0, scrollWidth: 390, text: "Conway not answering?", foreign: [], umzugBottom: 828 };
    expect(assess(start)).toEqual([]);
    expect(assess({ ...start, umzugBottom: null }).join("\n")).toMatch(/block data-soll="umzug" is missing/);
  });
});
