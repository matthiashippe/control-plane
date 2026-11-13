import { describe, it, expect } from "vitest";
// @ts-expect-error plain ESM module under ops/, no declaration file
import { FOLD, KONTO_STATES, assessKonto, pixelDiffCount, summaryKonto } from "../ops/soll-assess.mjs";

/**
 * The judgement of ops/soll-konto.mjs over the account step of the phone page /h/{code}, without a browser (goals/konto/03,
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
  text: "Last step\nCreate your account with a passkey\nPostYourPrice can charge up to $5.00 a day, only for Atlas.\nCreate passkey",
  foreign: [] as string[],
  blockBottom: 527,
  ...over,
});

describe("soll judgement of the account step", () => {
  it("passes a clean render of both states at both widths with no defect", () => {
    expect(KONTO_STATES).toEqual(["passkey", "fehlgeschlagen"]);
    const results = [];
    for (const state of KONTO_STATES) for (const width of [390, 1440]) {
      const m = clean({ state, width, pngWidth: width, scrollWidth: width, blockBottom: state === "passkey" ? (width === 390 ? 527 : 510) : null });
      const defects = assessKonto(m);
      expect(defects).toEqual([]);
      results.push({ state, width, blockBottom: m.blockBottom, defects });
    }
    expect(summaryKonto(results)).toBe("soll konto: 4 Bilder, passkey oben 390=527 1440=510, 0 Mängel");
    expect(summaryKonto([{ state: "passkey", width: 390, blockBottom: 527, defects: ["x"] }]))
      .toBe("soll konto: 1 Bilder, passkey oben 390=527 1440=fehlt, 1 Mängel");
  });

  it("rejects a picture with even one pixel that differs from a fresh render", () => {
    const changed = picture(100, 100, (x, y) => (x === 7 && y === 9 ? [240, 240, 240] : [10, 11, 9]));
    const diff = pixelDiffCount(picture(100, 100), changed);
    expect(diff).toBe(1);
    expect(assessKonto(clean({ diffPixels: diff })).join("\n")).toMatch(/^passkey 390: 1 pixels differ from a fresh render$/m);
    expect(assessKonto(clean({ state: "fehlgeschlagen", blockBottom: null, diffPixels: null })).join("\n"))
      .toMatch(/fehlgeschlagen 390: no committed picture/);
  });

  it("rejects horizontal overflow", () => {
    expect(assessKonto(clean({ scrollWidth: 412 })).join("\n")).toMatch(/passkey 390: horizontal overflow, scrollWidth 412/);
    expect(assessKonto(clean({ state: "fehlgeschlagen", width: 1440, pngWidth: 1440, scrollWidth: 1441, blockBottom: null })).join("\n"))
      .toMatch(/fehlgeschlagen 1440: horizontal overflow, scrollWidth 1441/);
  });

  it("rejects a dash in the visible text", () => {
    expect(assessKonto(clean({ state: "fehlgeschlagen", blockBottom: null, text: "No account \u2013 start again" })).join("\n"))
      .toMatch(/fehlgeschlagen 390: dash in the visible text/);
    expect(assessKonto(clean({ text: "Create passkey \u2014 now" })).join("\n")).toMatch(/passkey 390: dash in the visible text/);
  });

  it("rejects a foreign address, requested or named in an attribute", () => {
    expect(assessKonto(clean({ foreign: ["https://fonts.example.com/a.woff2"] })).join("\n"))
      .toMatch(/passkey 390: request to a foreign address: https:\/\/fonts\.example\.com/);
    expect(assessKonto(clean({ state: "fehlgeschlagen", blockBottom: null, foreign: ["href=//cdn.example.org/help"] })).join("\n"))
      .toMatch(/fehlgeschlagen 390: request to a foreign address: href=\/\/cdn\.example\.org/);
  });

  it("rejects the block passkey when it ends below the first screen, or is missing", () => {
    expect(FOLD[390]).toBe(844);
    expect(FOLD[1440]).toBe(900);
    expect(assessKonto(clean({ blockBottom: 844 }))).toEqual([]);
    expect(assessKonto(clean({ blockBottom: 845 })).join("\n")).toMatch(/passkey 390: block passkey ends at 845 px, below the first screen at 844/);
    expect(assessKonto(clean({ width: 1440, pngWidth: 1440, scrollWidth: 1440, blockBottom: 901 })).join("\n"))
      .toMatch(/passkey 1440: block passkey ends at 901 px, below the first screen at 900/);
    expect(assessKonto(clean({ blockBottom: null })).join("\n")).toMatch(/passkey 390: block data-soll="passkey" is missing/);
    // The state fehlgeschlagen has no such block and needs none.
    expect(assessKonto(clean({ state: "fehlgeschlagen", blockBottom: null }))).toEqual([]);
  });

  it("rejects a word from the list in the visible text, also inside a longer word", () => {
    for (const word of ["Handoff", "tokens", "Wallet", "Smart account", "spend permission", "Base Sepolia", "Turnkey", "ERC-4337"]) {
      expect(assessKonto(clean({ text: `Create passkey\n${word} ready` })).join("\n"), word)
        .toMatch(/passkey 390: word the reader has to translate in the visible text/);
      expect(assessKonto(clean({ state: "fehlgeschlagen", blockBottom: null, text: `${word} failed` })).join("\n"), word)
        .toMatch(/fehlgeschlagen 390: word the reader has to translate/);
    }
    // "passkey" is a known word, and "erc" only at the start of a word: commerce is an ordinary word.
    expect(assessKonto(clean({ text: "Create your account with a passkey. Built for commerce." }))).toEqual([]);
  });

  it("rejects a state the account step does not have", () => {
    expect(assessKonto(clean({ state: "freigabe", blockBottom: null })).join("\n")).toMatch(/freigabe 390: unknown state/);
  });
});
