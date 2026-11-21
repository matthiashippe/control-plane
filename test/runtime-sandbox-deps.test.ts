import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { join } from "node:path";

const RUNTIME_SANDBOX_SH = join(__dirname, "..", "ops", "runtime-sandbox.sh");

/**
 * ops/runtime-sandbox.sh trusts the runtime clone at the pin only when dist/ and node_modules/ are the stamped build and
 * install (goals/hosting/06). Its selftest proves that against a planted clone in both directions without network;
 * running it here keeps a merge that breaks the check from passing unnoticed until the next audit.
 * The selftest takes about two seconds; it runs without blocking the worker, with a generous timeout for a loaded host.
 */
const runSelftest = () =>
  new Promise<{ stdout: string; status: number | null }>((resolve) => {
    const child = spawn("bash", [RUNTIME_SANDBOX_SH, "--selftest"], {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 120_000,
    });
    let stdout = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.on("close", (status) => resolve({ stdout, status }));
  });

const DEPS_FAIL = "RUNTIME SANDBOX FAIL node_modules/ is not the install at the pin";

describe("ops/runtime-sandbox.sh --selftest", () => {
  it("rejects a changed, added or relinked node_modules/ and an old stamp, and rebuilds them", async () => {
    const run = await runSelftest();
    const lines = run.stdout.trimEnd().split("\n");
    expect(run.status).toBe(0);
    expect(lines.at(-1)).toBe("RUNTIME SANDBOX SELFTEST OK");
    expect(lines.filter((l) => l.startsWith("FAIL "))).toEqual([]);
    for (const name of ["deps-changed", "deps-added", "deps-relinked", "deps-old-stamp"]) {
      expect(lines).toContainEqual(expect.stringMatching(new RegExp(`^ok   ${name}: ${DEPS_FAIL.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`)));
    }
    expect(lines).toContain("ok   rebuild-changed-deps: installs=1 builds=1 planted=gone state=ok");
    expect(lines).toContain("ok   rebuild-unstamped-deps: installs=1 builds=1 planted=gone state=ok");
  }, 150_000);

  it("keeps the dist/ cases of sandbox 10 and reuses a stamped clone without pnpm", async () => {
    const run = await runSelftest();
    const lines = run.stdout.split("\n");
    for (const name of ["dist-changed", "dist-added", "dist-unstamped", "dist-other-commit"]) {
      expect(lines).toContainEqual(expect.stringMatching(new RegExp(`^ok   ${name}: RUNTIME SANDBOX FAIL dist/ is not the build at the pin`)));
    }
    for (const name of ["rebuild-changed-dist", "rebuild-drops-stale"]) {
      expect(lines).toContainEqual(expect.stringMatching(new RegExp(`^ok   ${name}: builds=1 `)));
    }
    expect(lines).toContain("ok   reuse-stamped-dist: pnpm_calls=0 state=ok");
  }, 150_000);
});
