/**
 * ops/site-dns.py sets the A records of automatonhost.com (move goal 02). Its planner is only ever called on a host
 * change, so a planner that broke in between would be found on the day the service has to move, by the automatons that
 * stop getting answers. Its selftest proves every planner case against planted records without network; running it here
 * keeps it in check (move goal 04, point 3). Nothing in the tool changes for this.
 */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SITE_DNS = join(__dirname, "..", "ops/site-dns.py");

// spawn and not spawnSync, as in test/live-selftest.test.ts: a blocked worker misses vitest's own RPC timer under load.
const runSelftest = () =>
  new Promise<{ stdout: string; status: number | null }>((resolve) => {
    const child = spawn("python3", [SITE_DNS, "--selftest"], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
      // No token in reach (an empty HOME hides the secrets file the tool would fall back to) and an unroutable proxy:
      // the selftest must not need the network, and must not reach it by accident.
      env: {
        ...process.env,
        CLOUDFLARE_HTC_API_TOKEN: "",
        HOME: mkdtempSync(join(tmpdir(), "site-dns-")),
        HTTPS_PROXY: "http://127.0.0.1:9",
        HTTP_PROXY: "http://127.0.0.1:9",
      },
    });
    let stdout = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.on("close", (status) => resolve({ stdout, status }));
  });

describe("ops/site-dns.py", () => {
  it("passes its own selftest without network", async () => {
    const run = await runSelftest();
    const lines = run.stdout.split("\n").map((l) => l.trimEnd()).filter(Boolean);
    expect(lines.filter((l) => l.startsWith("FAIL ")), run.stdout).toEqual([]);
    expect(lines.at(-1), run.stdout).toBe("SITE DNS SELFTEST OK");
    expect(run.status, run.stdout).toBe(0);
  }, 90_000);
});
