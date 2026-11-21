import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ops/answer-quote.sh counts the share of POST /v1/chat/completions answered with 200 among all answers except 4xx
 * (abrechnung 07). The review of 2026-11-18 found the timeout quote blind to 1393 answers with 503; these cases keep the
 * answer quote from going blind the same way. Two copies of the script carry a wrong status rule each, and the selftest
 * has to catch exactly that rule.
 */
const SCRIPT = join(__dirname, "..", "ops", "answer-quote.sh");
const RULE = "const excluded = (status) => status >= 400 && status <= 499;";

function runSelftest(script: string) {
  return spawnSync("bash", [script, "--selftest"], { encoding: "utf8", timeout: 60_000 });
}

function tampered(rule: string) {
  const source = readFileSync(SCRIPT, "utf8");
  expect(source).toContain(RULE);
  const changed = source.replace(RULE, rule);
  expect(changed).not.toBe(source);
  const dir = mkdtempSync(join(tmpdir(), "answer-quote-"));
  const copy = join(dir, "answer-quote.sh");
  writeFileSync(copy, changed);
  try {
    return runSelftest(copy);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("ops/answer-quote.sh", () => {
  it("passes its own selftest without network", () => {
    const run = runSelftest(SCRIPT);
    expect(run.stdout).toContain("ok   answers 503 counts against");
    expect(run.stdout).toContain("ok   answers 4xx excluded");
    expect(run.stdout).not.toMatch(/^FAIL/m);
    expect(run.stdout.trim().split("\n").at(-1)).toBe("ANSWER QUOTE SELFTEST OK");
    expect(run.status).toBe(0);
  }, 120_000);

  it("fails its selftest when 503 drops out of the denominator like 4xx", () => {
    const run = tampered("const excluded = (status) => status >= 400 && status <= 599;");
    expect(run.stdout).toMatch(/^FAIL answers 503 counts against/m);
    expect(run.stdout.trim().split("\n").at(-1)).toBe("ANSWER QUOTE SELFTEST FAIL");
    expect(run.status).toBe(1);
  }, 120_000);

  it("fails its selftest when 4xx counts in the denominator", () => {
    const run = tampered("const excluded = (status) => false;");
    expect(run.stdout).toMatch(/^FAIL answers 4xx excluded/m);
    expect(run.stdout.trim().split("\n").at(-1)).toBe("ANSWER QUOTE SELFTEST FAIL");
    expect(run.status).toBe(1);
  }, 120_000);
});
