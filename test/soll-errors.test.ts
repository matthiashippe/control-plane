import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error plain ESM module under ops/, no declaration file
import { ERROR_BLOCK, ERROR_SLUGS, FOLD, assessErrors, pixelDiffCount, summaryErrors } from "../ops/soll-assess.mjs";

/**
 * The judgement of ops/soll-errors.mjs over the error pages /errors/{slug}, without a browser (goals/reichweite/01, Punkt 2).
 * One case per defect the goal names, each planted on an otherwise clean render, the clean render itself, which must pass with
 * nothing, and an unknown argument, which must end the tool before it writes a single picture.
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

/** A render of the page invalid-or-expired-nonce at 390 px that is clean on every count. */
const clean = (over: Record<string, unknown> = {}) => ({
  slug: "invalid-or-expired-nonce",
  width: 390,
  pngWidth: 390,
  diffPixels: 0,
  scrollWidth: 390,
  text: 'Conway automaton error\n/v1/auth/verify returns 401 {"error":"Invalid or expired nonce"}\nOne line, one command\nautomaton --provision',
  foreign: [] as string[],
  blockBottom: 675,
  ...over,
});

describe("soll judgement of the error pages", () => {
  it("passes a clean render of all three pages at both widths with no defect", () => {
    expect(ERROR_SLUGS).toEqual(["verify-500-database-error", "invalid-or-expired-nonce", "credits-never-granted"]);
    expect(ERROR_BLOCK).toBe("fix");
    const results = [];
    for (const slug of ERROR_SLUGS) for (const width of [390, 1440]) {
      const blockBottom = (width === 390 ? 650 : 620) + ERROR_SLUGS.indexOf(slug) * 10;
      const defects = assessErrors(clean({ slug, width, pngWidth: width, scrollWidth: width, blockBottom }));
      expect(defects).toEqual([]);
      results.push({ slug, width, blockBottom, defects });
    }
    expect(summaryErrors(results)).toBe("soll errors: 6 images, blocks end 390=670 1440=640, 0 defects");
    expect(summaryErrors([{ slug: "credits-never-granted", width: 390, blockBottom: 600, defects: ["x"] }, { slug: "invalid-or-expired-nonce", width: 390, blockBottom: null, defects: [] }]))
      .toBe("soll errors: 2 images, blocks end 390=missing 1440=missing, 1 defects");
  });

  it("rejects a picture with even one pixel that differs from a fresh render", () => {
    const changed = picture(100, 100, (x, y) => (x === 7 && y === 2 ? [240, 240, 240] : [10, 11, 9]));
    const diff = pixelDiffCount(picture(100, 100), changed);
    expect(diff).toBe(1);
    expect(assessErrors(clean({ diffPixels: diff })).join("\n")).toMatch(/^invalid-or-expired-nonce 390: 1 pixels differ from a fresh render$/m);
    expect(assessErrors(clean({ slug: "credits-never-granted", diffPixels: null })).join("\n")).toMatch(/credits-never-granted 390: no committed picture/);
  });

  it("rejects horizontal overflow", () => {
    expect(assessErrors(clean({ scrollWidth: 431 })).join("\n")).toMatch(/invalid-or-expired-nonce 390: horizontal overflow, scrollWidth 431/);
    expect(assessErrors(clean({ slug: "verify-500-database-error", width: 1440, pngWidth: 1440, scrollWidth: 1441 })).join("\n"))
      .toMatch(/verify-500-database-error 1440: horizontal overflow, scrollWidth 1441/);
  });

  it("rejects a dash in the visible text", () => {
    expect(assessErrors(clean({ text: "Sign-up – does not complete" })).join("\n")).toMatch(/invalid-or-expired-nonce 390: dash in the visible text/);
    expect(assessErrors(clean({ slug: "credits-never-granted", text: "Paid — never granted" })).join("\n"))
      .toMatch(/credits-never-granted 390: dash in the visible text/);
  });

  it("rejects a foreign address, requested or named in an attribute that loads something", () => {
    expect(assessErrors(clean({ foreign: ["https://fonts.example.com/a.woff2"] })).join("\n"))
      .toMatch(/invalid-or-expired-nonce 390: request to a foreign address: https:\/\/fonts\.example\.com/);
    expect(assessErrors(clean({ slug: "verify-500-database-error", foreign: ["src=https://img.example.com/x.png"] })).join("\n"))
      .toMatch(/verify-500-database-error 390: request to a foreign address: src=https:\/\/img\.example\.com/);
  });

  it("rejects a picture of the wrong width", () => {
    expect(assessErrors(clean({ pngWidth: 412 })).join("\n")).toMatch(/invalid-or-expired-nonce 390: picture is 412 px wide/);
    expect(assessErrors(clean({ slug: "credits-never-granted", width: 1440, pngWidth: 1280, scrollWidth: 1440 })).join("\n"))
      .toMatch(/credits-never-granted 1440: picture is 1280 px wide/);
  });

  it("rejects a block fix that ends below the first screen, or is missing", () => {
    expect(FOLD[390]).toBe(844);
    expect(FOLD[1440]).toBe(900);
    expect(assessErrors(clean({ blockBottom: 844 }))).toEqual([]);
    expect(assessErrors(clean({ blockBottom: 845 })).join("\n")).toMatch(/invalid-or-expired-nonce 390: block fix ends at 845 px, below the first screen at 844/);
    expect(assessErrors(clean({ slug: "verify-500-database-error", width: 1440, pngWidth: 1440, scrollWidth: 1440, blockBottom: 901 })).join("\n"))
      .toMatch(/verify-500-database-error 1440: block fix ends at 901 px, below the first screen at 900/);
    expect(assessErrors(clean({ slug: "credits-never-granted", blockBottom: null })).join("\n")).toMatch(/credits-never-granted 390: block data-soll="fix" is missing/);
  });

  it("rejects an error page that does not exist", () => {
    expect(assessErrors(clean({ slug: "database-error" })).join("\n")).toMatch(/database-error 390: unknown error page/);
  });

  it("ends with exit 1 on an unknown argument and writes no picture", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "soll-errors-args-"));
    try {
      const tool = fileURLToPath(new URL("../ops/soll-errors.mjs", import.meta.url));
      for (const args of [["--chek", "--pictures", dir], ["--verify", "--pictures", dir], ["--check", "--pictures"]]) {
        const run = spawnSync(process.execPath, [tool, ...args], { encoding: "utf8", timeout: 30000 });
        expect(run.status, args.join(" ")).toBe(1);
        expect(run.stderr, args.join(" ")).toMatch(/^usage: node ops\/soll-errors\.mjs/);
        expect(readdirSync(dir), args.join(" ")).toEqual([]);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
