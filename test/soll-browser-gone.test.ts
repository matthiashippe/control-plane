/**
 * A SOLL tool whose browser is gone ends red (goals/konto/08, Punkt 2).
 *
 * Each of the five SOLL tools runs with `--check` against a stand-in Chrome that ends at once (a shell script `exit 0`, given
 * through SOLL_CHROME). Without the guard in the browser driver a request to the dead browser waits for an answer that cannot
 * come, the event loop runs empty and node ends with exit 0 and no line: a green check that rendered nothing. Expected instead:
 * a numeric exit code other than 0, the reason `browser exited` on stderr, and no summary line ending in `, 0 defects`.
 *
 * Nothing is imported from ops/, so the same file runs against the state before the shared driver. No real Chromium, no port.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.join(__dirname, "..");

/** A Chrome that ends at once with exit 0, before it answers a single DevTools request. */
function goneChrome(): string {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), "soll-gone-")), "chrome");
  writeFileSync(file, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  return file;
}

describe.each(["soll.mjs", "soll-handoff.mjs", "soll-konto.mjs", "soll-limit.mjs", "soll-money.mjs"])("ops/%s", (tool) => {
  it("ends with a non-zero exit and the reason when the browser is gone, and reports no 0 defects", () => {
    const r = spawnSync(process.execPath, [path.join(ROOT, "ops", tool), "--check"], {
      cwd: ROOT, encoding: "utf8", timeout: 20_000, env: { ...process.env, SOLL_CHROME: goneChrome() },
    });
    expect(typeof r.status).toBe("number");
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/browser exited/);
    expect((r.stdout ?? "").split("\n").filter((l) => l.endsWith(", 0 defects"))).toEqual([]);
  }, 30_000);
});
