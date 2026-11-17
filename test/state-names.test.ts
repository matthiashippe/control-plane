import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
// @ts-expect-error plain ESM module under ops/, no declaration file
import { HANDOFF_BLOCK_MARKS, HANDOFF_STATES, KONTO_FILES, KONTO_STATES, summaryHandoff } from "../ops/soll-assess.mjs";

/**
 * Code is English without exception (loop-constraints.md, rule 12; goals/konto/04, Punkt 5; goals/konto/06, Punkte 3 and 4). The
 * states of the phone page /h/{code} are `approve`, `approved` and `invalid`, the failure of the account step is `failed`. The
 * pictures of the handoff carry these names since goals/konto/06. Only the pictures of the state `failed` keep the German file name
 * they were approved under, and only in the one mapping KONTO_FILES of ops/soll-assess.mjs. This test reads the files themselves,
 * not git, so it also holds in a tree without history (an extract of `git archive`).
 */

const ROOT = path.resolve(__dirname, "..");
/** The four German names, as whole words: what `git grep -w` would find. */
const OLD = /(?<![A-Za-z0-9_])(freigabe|erledigt|ungueltig|fehlgeschlagen)(?![A-Za-z0-9_])/;
/** The German name the mapping KONTO_FILES may still carry. */
const KEPT = /(?<![A-Za-z0-9_])fehlgeschlagen(?![A-Za-z0-9_])/;
const TEXT = /\.(ts|mts|cts|js|mjs|cjs|html|json|css|md|txt|sql)$/;
/** This test, which has to name what it looks for. ops/soll-assess.mjs is checked line by line below. */
const ALLOWED = new Set(["test/state-names.test.ts"]);
const MAPPING = "ops/soll-assess.mjs";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (TEXT.test(name)) out.push(full);
  }
  return out;
}

/** Every file the rule covers: everything under src/, test/ and mcp/, and the SOLL tools ops/soll-*.mjs. */
function covered(): string[] {
  const ops = readdirSync(path.join(ROOT, "ops"))
    .filter((n) => /^soll-.*\.mjs$/.test(n))
    .map((n) => path.join(ROOT, "ops", n));
  return [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "test")), ...walk(path.join(ROOT, "mcp")), ...ops];
}

function findings(files: string[]): string[] {
  const out: string[] = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    if (ALLOWED.has(rel)) continue;
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (!OLD.test(line)) return;
        // The one mapping keeps the file name of the approved pictures of the state failed, on its own line.
        if (rel === MAPPING && line.includes("KONTO_FILES") && !/(freigabe|erledigt|ungueltig)/.test(line)) return;
        out.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
  }
  return out;
}

describe("English state names of the phone page", () => {
  it("finds no German state name in src, test, mcp or the SOLL tools outside the one mapping", () => {
    const files = covered();
    expect(files.some((f) => f.endsWith(path.join("src", "handoff", "routes.ts")))).toBe(true);
    expect(files.some((f) => f.endsWith(path.join("ops", "soll-live-handoff.mjs")))).toBe(true);
    expect(files.some((f) => f.endsWith(path.join("mcp", "server.mjs")))).toBe(true);
    expect(findings(files)).toEqual([]);
  });

  it("keeps the German name of the state failed in exactly one mapping, at most two lines of ops/soll-assess.mjs", () => {
    expect(HANDOFF_STATES).toEqual(["approve", "approved", "invalid"]);
    expect(KONTO_STATES).toEqual(["passkey", "failed"]);
    expect(KONTO_FILES).toEqual({ passkey: "passkey", failed: "fehlgeschlagen" });
    const lines = readFileSync(path.join(ROOT, MAPPING), "utf8").split("\n").filter((l) => OLD.test(l));
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(lines.every((l) => l.includes("KONTO_FILES") && KEPT.test(l))).toBe(true);
  });

  it("names the pictures and the summary line of the handoff after the states in the code", () => {
    expect(HANDOFF_BLOCK_MARKS).toEqual(["approve"]);
    const results = [
      { state: "approve", width: 390, blockBottom: 528, defects: [] },
      { state: "approve", width: 1440, blockBottom: 603, defects: [] },
    ];
    expect(summaryHandoff(results)).toBe("soll handoff: 2 pictures, approve top 390=528 1440=603, 0 defects");
    for (const state of HANDOFF_STATES) {
      expect(statSync(path.join(ROOT, "docs", "soll", "src", `handoff-${state}.html`)).isFile()).toBe(true);
    }
  });

  it("serves the failure of the account step under the English route only", () => {
    const routes = readFileSync(path.join(ROOT, "src", "handoff", "routes.ts"), "utf8");
    expect(routes).toContain('"/h/:code/failed"');
    expect(KEPT.test(routes)).toBe(false);
  });

  it("reports a planted German state name with file and line", () => {
    const dir = path.join(ROOT, "src", "handoff");
    const planted = findings([path.join(dir, "rules.ts")]).length;
    expect(planted).toBe(0);
    expect(OLD.test('export const leftover = "erledigt";')).toBe(true);
    expect(OLD.test('app.post("/h/:code/fehlgeschlagen", handler);')).toBe(true);
    expect(OLD.test("const approvedState = 1; // Freigabe")).toBe(false);
  });
});
