import { afterAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const ROOT = join(__dirname, "..");

/**
 * ops/customer-work.sh measures what customer 1 does on the way from a bounty to credit (kunden 08) and, since
 * kunden 11, the house job: jobs posted, reports, awards and each reported call without an address, since kunden 13
 * also the step credits and the house awards to addresses without earlier inference, since kunden 14 the
 * customer's inference rows after his step credit. Its selftest
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

/** A copy of ops/ next to the real src and node_modules, so one file of it can be falsified. */
const copyOfOps = () => {
  const root = mkdtempSync(join(tmpdir(), "customer-work-"));
  temps.push(root);
  cpSync(join(ROOT, "ops"), join(root, "ops"), { recursive: true });
  for (const name of ["node_modules", "src", "package.json", "tsconfig.json"]) {
    symlinkSync(join(ROOT, name), join(root, name));
  }
  return root;
};

/** Runs the selftest on a copy of ops/ with one replacement in ops/db-report.cjs and returns its FAIL lines. */
const failsWithReport = async (from: string, to: string) => {
  const root = copyOfOps();
  const report = join(root, "ops", "db-report.cjs");
  const original = readFileSync(report, "utf8");
  expect(original).toContain(from);
  writeFileSync(report, original.replace(from, to));
  const run = await runSelftest(root);
  expect(run.status).not.toBe(0);
  return run.stdout.split("\n").filter((l) => l.startsWith("FAIL"));
};

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
    expect(lines.filter((l) => /^ok .*step/.test(l)).length).toBeGreaterThanOrEqual(2);
    expect(lines.filter((l) => /^ok .*earlier inference/.test(l)).length).toBeGreaterThanOrEqual(2);
    expect(lines).toContainEqual(expect.stringMatching(/^ok   step credit of the customer counted/));
    expect(lines).toContainEqual(expect.stringMatching(/^ok   step credit of our own address not counted/));
    expect(lines.filter((l) => /^ok .*step use/.test(l)).length).toBeGreaterThanOrEqual(2);
    expect(lines).toContainEqual(expect.stringMatching(/^ok   step use: the customer's inference rows after his step credit/));
    expect(lines).toContainEqual(expect.stringMatching(/^ok   step use counter-proof: without a step credit/));
  }, 150_000);

  it("fails when the match rule is falsified in a copy of ops/", async () => {
    const root = copyOfOps();
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

  it("fails when step credits of our own addresses are counted in a copy of ops/", async () => {
    const fails = await failsWithReport("(s) => inWindow(s.created_at) && foreign(s.address),", "(s) => inWindow(s.created_at),");
    expect(fails).toContainEqual(expect.stringMatching(/^FAIL step credit of our own address not counted/));
  }, 150_000);

  it("fails when inference rows of another address count as the customer's step use in a copy of ops/", async () => {
    const fails = await failsWithReport(".filter((r) => mine.has(String(r.address).toLowerCase()))", ".filter(() => true)");
    expect(fails).toContainEqual(expect.stringMatching(/^FAIL step use: the customer's inference rows after his step credit/));
  }, 150_000);

  it("fails when the customer's inference rows before his step credit count as step use in a copy of ops/", async () => {
    const fails = await failsWithReport("t !== null && t > stepAt && t < ms(until)", "t !== null && t < ms(until)");
    expect(fails).toContainEqual(expect.stringMatching(/^FAIL step use: the customer's inference rows after his step credit/));
  }, 150_000);

  it("fails when the customer's inference rows after --until count as step use in a copy of ops/", async () => {
    const fails = await failsWithReport("t !== null && t > stepAt && t < ms(until)", "t !== null && t > stepAt");
    expect(fails).toContainEqual(expect.stringMatching(/^FAIL step use: the customer's inference rows after his step credit/));
  }, 150_000);

  it("fails when every house award counts as without earlier inference in a copy of ops/", async () => {
    const fails = await failsWithReport("return first === null || first >= ms(a.created_at);", "return true;");
    expect(fails).toContainEqual(expect.stringMatching(/^FAIL house award after an earlier inference not counted/));
  }, 150_000);

  it("fails when any inference of the address counts as earlier in a copy of ops/", async () => {
    const fails = await failsWithReport("return first === null || first >= ms(a.created_at);", "return first === null;");
    expect(fails).toContainEqual(expect.stringMatching(/^FAIL house award to a fresh wallet counted as without earlier inference/));
  }, 150_000);
});
