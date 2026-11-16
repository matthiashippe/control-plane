import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
// @ts-expect-error plain ESM module under ops/, no declaration file
import { HANDOFF_FILES, HANDOFF_STATES, handoffFile, summaryHandoff } from "../ops/soll-assess.mjs";

/**
 * Code is English without exception (loop-constraints.md, rule 12; goals/konto/04, Punkt 5). The states of the phone page
 * /h/{code} are `approve`, `approved` and `invalid` in the code. Their German names live on only as the file names of the
 * pictures that were approved under them, and only in the one mapping HANDOFF_FILES of ops/soll-assess.mjs. This test reads
 * the files themselves, not git, so it also holds in a tree without history (an extract of `git archive`).
 */

const ROOT = path.resolve(__dirname, "..");
/** The three German names, as whole words: what `git grep -w` would find. */
const OLD = /(?<![A-Za-z0-9_])(freigabe|erledigt|ungueltig)(?![A-Za-z0-9_])/;
const TEXT = /\.(ts|mts|cts|js|mjs|cjs|html|json|css|md|txt|sql)$/;
/** The mapping itself, and this test, which has to name what it looks for. */
const ALLOWED = new Set(["ops/soll-assess.mjs", "test/state-names.test.ts"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (TEXT.test(name)) out.push(full);
  }
  return out;
}

/** Every file the rule covers: everything under src/ and test/, and the SOLL tools ops/soll-*.mjs. */
function covered(): string[] {
  const ops = readdirSync(path.join(ROOT, "ops"))
    .filter((n) => /^soll-.*\.mjs$/.test(n))
    .map((n) => path.join(ROOT, "ops", n));
  return [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "test")), ...ops];
}

function findings(files: string[]): string[] {
  const out: string[] = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    if (ALLOWED.has(rel)) continue;
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (OLD.test(line)) out.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
  }
  return out;
}

describe("English state names of the phone page", () => {
  it("finds no German state name in src, test or the SOLL tools outside the one mapping", () => {
    const files = covered();
    expect(files.some((f) => f.endsWith(path.join("src", "handoff", "routes.ts")))).toBe(true);
    expect(files.some((f) => f.endsWith(path.join("ops", "soll-live-handoff.mjs")))).toBe(true);
    expect(findings(files)).toEqual([]);
  });

  it("keeps the German names in exactly one mapping, at most three lines of ops/soll-assess.mjs", () => {
    expect(HANDOFF_STATES).toEqual(["approve", "approved", "invalid"]);
    expect(HANDOFF_FILES).toEqual({ approve: "freigabe", approved: "erledigt", invalid: "ungueltig" });
    const lines = readFileSync(path.join(ROOT, "ops", "soll-assess.mjs"), "utf8").split("\n").filter((l) => OLD.test(l));
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines.every((l) => l.includes("HANDOFF_FILES"))).toBe(true);
  });

  it("keeps the file names and the summary line of the approved pictures as the audits of konto 02 and 03 expect them", () => {
    expect(HANDOFF_STATES.map(handoffFile)).toEqual(["freigabe", "erledigt", "ungueltig"]);
    const results = [
      { state: "approve", width: 390, blockBottom: 528, defects: [] },
      { state: "approve", width: 1440, blockBottom: 603, defects: [] },
    ];
    expect(summaryHandoff(results)).toBe("soll handoff: 2 Bilder, freigabe oben 390=528 1440=603, 0 Mängel");
  });

  it("reports a planted German state name with file and line", () => {
    const dir = path.join(ROOT, "src", "handoff");
    const planted = findings([path.join(dir, "rules.ts")]).length;
    expect(planted).toBe(0);
    expect(OLD.test('export const leftover = "erledigt";')).toBe(true);
    expect(OLD.test("const approvedState = 1; // Freigabe")).toBe(false);
  });
});
