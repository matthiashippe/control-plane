import { afterAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const ROOT = join(__dirname, "..");

/**
 * ops/customer-work.sh measures what customer 1 does on the way from a bounty to credit (kunden 08) and, since
 * kunden 11, the house job: jobs posted, reports, awards and each reported call without an address. Its selftest
 * proves every count in both directions on a planted database without network; running it here keeps a merge that
 * breaks a count from passing unnoticed until somebody starts the tool by hand.
 * The planted database is built with better-sqlite3, compiled for the node that runs this test, so that node comes
 * first in PATH. The selftest takes a few seconds; the timeouts are generous for a loaded host.
 */
const runSelftest = (root: string) =>
  new Promise<{ stdout: string; status: number | null }>((resolve) => {
    const child = spawn("bash", [join(root, "ops", "customer-work.sh"), "--selftest"], {
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}` },
      timeout: 120_000,
    });
    let stdout = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.on("close", (status) => resolve({ stdout, status }));
  });

const temps: string[] = [];
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

describe("ops/customer-work.sh --selftest", () => {
  it("counts the planted customer and the house job in both directions", async () => {
    const run = await runSelftest(ROOT);
    const lines = run.stdout.trimEnd().split("\n");
    expect(run.status).toBe(0);
    expect(lines.at(-1)).toMatch(/^SELFTEST OK /);
    expect(lines.filter((l) => l.startsWith("FAIL"))).toEqual([]);
    expect(lines.filter((l) => /^ok .*house/.test(l)).length).toBeGreaterThanOrEqual(2);
    expect(lines).toContain("ok   house report of the customer counted, address replaced");
    expect(lines).toContainEqual(expect.stringMatching(/^ok   house report of our own address not counted/));
  }, 150_000);

  it("fails when the match rule is falsified in a copy of ops/", async () => {
    const root = mkdtempSync(join(tmpdir(), "customer-work-"));
    temps.push(root);
    cpSync(join(ROOT, "ops"), join(root, "ops"), { recursive: true });
    for (const name of ["node_modules", "src", "package.json", "tsconfig.json"]) {
      symlinkSync(join(ROOT, name), join(root, name));
    }
    const match = join(root, "ops", "customer_match.py");
    const original = readFileSync(match, "utf8");
    const falsified = original.replace(/^MATCH_S = .*$/m, "MATCH_S = 0.0");
    expect(falsified).not.toBe(original);
    expect(falsified).toContain("MATCH_S = 0.0");
    writeFileSync(match, falsified);

    const run = await runSelftest(root);
    expect(run.status).not.toBe(0);
    expect(run.stdout.split("\n").filter((l) => l.startsWith("FAIL")).length).toBeGreaterThanOrEqual(1);
  }, 150_000);
});
