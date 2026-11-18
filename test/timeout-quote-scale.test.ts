import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

/**
 * ops/timeout-quote.sh --selftest-scale plants 200000 Caddy lines and 200000 matching rows without
 * network and runs --compare-files over them (abrechnung 05). Seven days of traffic must not stop the
 * comparison: before the sorted window it scanned every row for every request and took the end of the
 * period with a spread over all items, which ran for minutes and ended in a RangeError.
 */
const SCRIPT = join(__dirname, "..", "ops", "timeout-quote.sh");

describe("ops/timeout-quote.sh --selftest-scale", () => {
  it("compares 200000 requests with their rows and agrees with its independent check", () => {
    const run = spawnSync("bash", [SCRIPT, "--selftest-scale"], { encoding: "utf8", timeout: 60_000 });
    expect(run.stdout.split("\n")).toContain("ok   compare scale: 200000 requests");
    expect(run.stdout).toContain("check caddy: compare 200000 2000, join 200000 2000");
    expect(run.stdout.trim().split("\n").at(-1)).toBe("TIMEOUT QUOTE SCALE OK");
    expect(run.status, run.stderr).toBe(0);
  }, 120_000);
});
