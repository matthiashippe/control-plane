import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

/**
 * ops/live.sh is the release manager's live check (LOOP.md, Release). Its selftest proves every
 * check against planted data in both directions without network; running it here keeps it from
 * rotting between rollouts, when nobody calls it.
 */
describe("ops/live.sh", () => {
  it("passes its own selftest without network", () => {
    const run = spawnSync("bash", [join(__dirname, "..", "ops", "live.sh"), "--selftest"], { encoding: "utf8", timeout: 60_000 });
    expect(run.stdout).toContain("planted none: FAIL");
    expect(run.stdout).toContain("planted double: FAIL");
    expect(run.stdout).toContain("planted single: OK");
    expect(run.stdout).toContain("planted domains 401: OK domains: /v1/domains/search 401 without a key");
    expect(run.stdout).toContain("planted domains 404: FAIL domains: /v1/domains/search answered 404, the route is missing");
    expect(run.stdout).toContain("planted domains 200: FAIL");
    expect(run.stdout).toContain("planted timeout-quote long: OK timeout-quote: since 2026-11-12T09:00:00.000Z: ");
    expect(run.stdout).toContain("openai/gpt-5.2 1/2 (50.0 %)");
    expect(run.stdout).toContain("planted timeout-quote answer '': FAIL");
    expect(run.stdout.trim().split("\n").at(-1)).toBe("LIVE SELFTEST OK");
    expect(run.status).toBe(0);
  }, 120_000);
});
