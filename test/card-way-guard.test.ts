/**
 * The guard of goals/wache/01: only src/payments/card-way.ts may name the card checkout of Digistore24, so every way to it goes
 * through `/card/<package>` and the breaker can close it. Reads README.md and every file under src/ and mcp/ from the disk, not
 * through git, so that it also holds in a copy without .git.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..");
const ALLOWED = "src/payments/card-way.ts";
const HOST = "checkout-ds24.com";

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path));
    else out.push(path);
  }
  return out;
}

describe("the card way guard", () => {
  it("links to the digistore24 checkout only from src/payments/card-way.ts", () => {
    const files = [join(ROOT, "README.md"), ...filesUnder(join(ROOT, "src")), ...filesUnder(join(ROOT, "mcp"))];
    const rel = files.map((f) => relative(ROOT, f));
    expect(rel, "the guard reads the file that builds the link").toContain(ALLOWED);
    const offenders = files.filter((f) => relative(ROOT, f) !== ALLOWED && readFileSync(f, "utf8").includes(HOST));
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
    expect(readFileSync(join(ROOT, ALLOWED), "utf8")).toContain(HOST);
  });
});
