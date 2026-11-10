import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

/**
 * ops/timeout-quote.sh counts the timeout quote per model and day (abrechnung 02). Its selftest
 * plants lines without network and must show a quote above 0 where a long call was planted and
 * exactly 0 where none was; running it here keeps the counter from going blind between uses.
 */
const SCRIPT = join(__dirname, "..", "ops", "timeout-quote.sh");

describe("ops/timeout-quote.sh", () => {
  it("passes its own selftest without network", () => {
    const run = spawnSync("bash", [SCRIPT, "--selftest"], { encoding: "utf8", timeout: 60_000 });
    expect(run.stdout).toContain("ok   long call counted over all days");
    expect(run.stdout).toContain("ok   no long call, quote 0");
    expect(run.stdout.trim().split("\n").at(-1)).toBe("TIMEOUT QUOTE SELFTEST OK");
    expect(run.status).toBe(0);
  }, 120_000);

  it("fails its selftest when the limit makes it blind to long calls", () => {
    const run = spawnSync("bash", [SCRIPT, "--selftest"], { encoding: "utf8", timeout: 60_000, env: { ...process.env, TQ_LIMIT_S: "1000" } });
    expect(run.stdout).toContain("FAIL long call counted over all days");
    expect(run.stdout.trim().split("\n").at(-1)).toBe("TIMEOUT QUOTE SELFTEST FAIL");
    expect(run.status).toBe(1);
  }, 120_000);
});
