import { describe, it, expect } from "vitest";
// @ts-expect-error plain ESM module under ops/, no declaration file
import { FOLD, LIMIT_BLOCKS, LIMIT_STATES, assessLimit, pixelDiffCount, summaryLimit } from "../ops/soll-assess.mjs";

/**
 * The judgement of ops/soll-limit.mjs over the step limit of the phone page /h/{code}, without a browser (goals/konto/04,
 * Punkt 2). One case per defect the goal names, each planted on an otherwise clean render, and the clean render itself, which
 * must pass with nothing.
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

/** A render of the state passkey at 390 px that is clean on every count. */
const clean = (over: Record<string, unknown> = {}) => ({
  state: "passkey",
  width: 390,
  pngWidth: 390,
  diffPixels: 0,
  scrollWidth: 390,
  text: "Last step\nRaise the daily limit for Atlas\nPostYourPrice can charge up to $10.00 a day, only for Atlas.\nConfirm with passkey",
  foreign: [] as string[],
  blockBottom: 486,
  ...over,
});

describe("soll judgement of the step limit", () => {
  it("passes a clean render of both states at both widths with no defect", () => {
    expect(LIMIT_STATES).toEqual(["approve", "passkey"]);
    expect(LIMIT_BLOCKS).toEqual({ approve: "approve", passkey: "limit" });
    const results = [];
    for (const state of LIMIT_STATES) for (const width of [390, 1440]) {
      const blockBottom = state === "approve" ? (width === 390 ? 528 : 603) : width === 390 ? 486 : 510;
      const m = clean({ state, width, pngWidth: width, scrollWidth: width, blockBottom });
      const defects = assessLimit(m);
      expect(defects).toEqual([]);
      results.push({ state, width, blockBottom, defects });
    }
    expect(summaryLimit(results)).toBe("soll limit: 4 images, approve top 390=528 1440=603, limit top 390=486 1440=510, 0 defects");
    expect(summaryLimit([{ state: "passkey", width: 390, blockBottom: 486, defects: ["x"] }]))
      .toBe("soll limit: 1 images, approve top 390=missing 1440=missing, limit top 390=486 1440=missing, 1 defects");
  });

  it("rejects a picture with even one pixel that differs from a fresh render", () => {
    const changed = picture(100, 100, (x, y) => (x === 3 && y === 5 ? [240, 240, 240] : [10, 11, 9]));
    const diff = pixelDiffCount(picture(100, 100), changed);
    expect(diff).toBe(1);
    expect(assessLimit(clean({ diffPixels: diff })).join("\n")).toMatch(/^passkey 390: 1 pixels differ from a fresh render$/m);
    expect(assessLimit(clean({ state: "approve", diffPixels: null })).join("\n")).toMatch(/approve 390: no committed picture/);
  });

  it("rejects horizontal overflow", () => {
    expect(assessLimit(clean({ scrollWidth: 412 })).join("\n")).toMatch(/passkey 390: horizontal overflow, scrollWidth 412/);
    expect(assessLimit(clean({ state: "approve", width: 1440, pngWidth: 1440, scrollWidth: 1441, blockBottom: 603 })).join("\n"))
      .toMatch(/approve 1440: horizontal overflow, scrollWidth 1441/);
  });

  it("rejects a dash in the visible text", () => {
    expect(assessLimit(clean({ state: "approve", blockBottom: 528, text: "Daily limit – today" })).join("\n"))
      .toMatch(/approve 390: dash in the visible text/);
    expect(assessLimit(clean({ text: "Confirm with passkey — now" })).join("\n")).toMatch(/passkey 390: dash in the visible text/);
  });

  it("rejects a foreign address, requested or named in an attribute", () => {
    expect(assessLimit(clean({ foreign: ["https://fonts.example.com/a.woff2"] })).join("\n"))
      .toMatch(/passkey 390: request to a foreign address: https:\/\/fonts\.example\.com/);
    expect(assessLimit(clean({ state: "approve", blockBottom: 528, foreign: ["action=//cdn.example.org/raise"] })).join("\n"))
      .toMatch(/approve 390: request to a foreign address: action=\/\/cdn\.example\.org/);
  });

  it("rejects the block approve or limit when it ends below the first screen, or is missing", () => {
    expect(FOLD[390]).toBe(844);
    expect(FOLD[1440]).toBe(900);
    expect(assessLimit(clean({ blockBottom: 844 }))).toEqual([]);
    expect(assessLimit(clean({ blockBottom: 845 })).join("\n")).toMatch(/passkey 390: block limit ends at 845 px, below the first screen at 844/);
    expect(assessLimit(clean({ state: "approve", width: 1440, pngWidth: 1440, scrollWidth: 1440, blockBottom: 901 })).join("\n"))
      .toMatch(/approve 1440: block approve ends at 901 px, below the first screen at 900/);
    expect(assessLimit(clean({ blockBottom: null })).join("\n")).toMatch(/passkey 390: block data-soll="limit" is missing/);
    expect(assessLimit(clean({ state: "approve", blockBottom: undefined })).join("\n")).toMatch(/approve 390: block data-soll="approve" is missing/);
  });

  it("rejects a word from the list in the visible text, also inside a longer word", () => {
    for (const word of ["Handoff", "tokens", "Wallet", "Smart account", "spend permission", "Base Sepolia", "Turnkey", "ERC-20", "allowance"]) {
      expect(assessLimit(clean({ text: `Confirm with passkey\n${word} ready` })).join("\n"), word)
        .toMatch(/passkey 390: word the reader has to translate in the visible text/);
      expect(assessLimit(clean({ state: "approve", blockBottom: 528, text: `New ${word}` })).join("\n"), word)
        .toMatch(/approve 390: word the reader has to translate/);
    }
    // "passkey" and "daily limit" are known words, and "erc" only at the start of a word: commerce is an ordinary word.
    expect(assessLimit(clean({ text: "Raise the daily limit with your passkey. Built for commerce." }))).toEqual([]);
  });

  it("rejects a state the step limit does not have", () => {
    expect(assessLimit(clean({ state: "approved", blockBottom: null })).join("\n")).toMatch(/approved 390: unknown state/);
  });
});
