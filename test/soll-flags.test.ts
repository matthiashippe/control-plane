/**
 * The arguments of the three SOLL tools (goals/seite/03, Punkt 1).
 *
 * The check flag is `--check`. Any other argument ends the tool before it renders or writes: exit 1, exactly one line
 * `unknown argument: <arg>` on stderr, nothing on stdout. So an old check command with the German flag `--pruefen` stops at once
 * instead of rendering the committed pictures under docs/soll/ anew. The values after `--source` and `--pictures` are not
 * unknown arguments. None of these cases needs a browser: the rejection comes before the tool looks for Chromium, and the case
 * with known arguments points SOLL_CHROME and the source at paths that do not exist, so it ends at the missing source.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.join(__dirname, "..");
const PICTURES = path.join(ROOT, "docs", "soll");
const OLD_FLAG = "--pruefen";

/** Size and modification time of every file under docs/soll/, to show that a run wrote nothing there. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    const s = statSync(file);
    out[path.relative(dir, file)] = `${s.size}:${s.mtimeMs}`;
  }
  return out;
}

function run(tool: string, args: string[], env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [path.join(ROOT, "ops", tool), ...args], {
    cwd: ROOT, encoding: "utf8", timeout: 120_000, env: { ...process.env, ...env },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe.each(["soll.mjs", "soll-handoff.mjs", "soll-konto.mjs"])("ops/%s", (tool) => {
  it(`rejects the old flag ${OLD_FLAG} with exit 1 and one line on stderr, without writing a picture`, () => {
    const before = snapshot(PICTURES);
    const r = run(tool, [OLD_FLAG]);
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toBe(`unknown argument: ${OLD_FLAG}\n`);
    expect(snapshot(PICTURES)).toEqual(before);
  }, 130_000);

  it("rejects an unknown argument after the known ones and names only that argument", () => {
    const r = run(tool, ["--check", "--source", "x.html", "--verbose"]);
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toBe("unknown argument: --verbose\n");
  }, 130_000);

  it("takes --check and the values after --source and --pictures as known arguments", () => {
    const missing = path.join(mkdtempSync(path.join(os.tmpdir(), "soll-flags-")), "missing");
    const r = run(tool, ["--check", "--source", missing, "--pictures", missing], { SOLL_CHROME: path.join(missing, "chrome") });
    expect(r.stderr).not.toMatch(/unknown argument/);
    expect(r.stderr).toMatch(/source missing/);
    expect(r.status).toBe(2);
  }, 130_000);
});
