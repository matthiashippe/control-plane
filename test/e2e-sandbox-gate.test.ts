/**
 * The sandbox gate of harness/e2e/full.sh (goals/sandbox/04 and 05), run for real in bash. The test cuts the block after
 * the line that prints the state of the rebuilt sandboxd after the long exec walk up to the end of the file (the
 * verdicts `sandbox=…` and `long_exec=…`, the cleanup, the final condition and the closing line) and runs it with
 * planted values for `walk`, `sandbox_id`, `sandbox_ledger`, `sandbox_left`, `long` and `long_left`. Compose and
 * cleanup are stubs that do nothing, so no container and no port is touched. The good walks must end in
 * `E2E OK … sandbox=true long_exec=true`; a failed walk verdict, a missing sandbox id, any other ledger line, a sandbox
 * left in the rebuilt sandboxd, a failed long exec verdict, a missing LONG_EXEC_RESULT and a failing earlier condition
 * must each end in `E2E FAIL`.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FULL_SH = join(__dirname, "..", "harness", "e2e", "full.sh");
const START = 'echo "rebuilt sandboxd after the long exec walk: $long_left"';

const GOOD_LEDGER = '{"rows":1,"mc":[-100],"status":"deleted","hold_mc":0,"consistent":true}';
const GOOD_LEFT = '{"sandboxes":0,"containers":0,"networks":0,"homes":0}';
const RESULT_60 = 'LONG_EXEC_RESULT {"label":"long-60","attempts":["abort",200],"threw":false,"failures_after":0,"next_status":200,"runs":1}';
const RESULT_180 = 'LONG_EXEC_RESULT {"label":"long-180","attempts":[200],"threw":false,"failures_after":0,"next_status":200,"runs":1}';
const GOOD_LONG = `${RESULT_60}\n${RESULT_180}\nLONG_EXEC_DELETE 200\nLONG_EXEC_VERDICT ok`;

type Planted = Record<string, string>;

function good(): Planted {
  return {
    walk: 'SANDBOX_RESULT {"id":"abcde12345"}\nSANDBOX_VERDICT ok',
    sandbox_id: "abcde12345",
    sandbox_ledger: GOOD_LEDGER,
    sandbox_left: GOOD_LEFT,
    long: GOOD_LONG,
    long_left: GOOD_LEFT,
    turns: "5",
    registered: "true",
    api_errors: "0",
    consistent: "true",
    db_registered: "1",
    balance_cents: "490",
    domains_ok: "true",
  };
}

function gateBlock(): string {
  const lines = readFileSync(FULL_SH, "utf8").split("\n");
  const at = lines.findIndex((l) => l.trim() === START);
  expect(at, "start marker of the sandbox gate in full.sh").toBeGreaterThan(0);
  const block = lines.slice(at + 1).join("\n");
  expect(block).toContain("E2E OK");
  expect(block).toContain("E2E FAIL");
  return block;
}

function runGate(planted: Planted): { code: number | null; last: string } {
  const assign = Object.keys(planted)
    .map((k) => `${k}="$P_${k}"`)
    .join("\n");
  const script = [
    "set -euo pipefail",
    "COMPOSE=(true)",
    "cleanup() { :; }",
    assign,
    gateBlock(),
  ].join("\n");
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH };
  for (const [k, v] of Object.entries(planted)) env[`P_${k}`] = v;
  const r = spawnSync("bash", ["-c", script], { env, encoding: "utf8" });
  const out = r.stdout.trim().split("\n");
  return { code: r.status, last: out[out.length - 1] ?? "" };
}

function expectFail(planted: Planted, sandbox: "true" | "false" = "false", longExec: "true" | "false" = "true"): void {
  const r = runGate(planted);
  expect(r.code).toBe(1);
  expect(r.last).toMatch(/^E2E FAIL /);
  expect(r.last).toContain(` sandbox=${sandbox} `);
  expect(r.last).toMatch(new RegExp(` long_exec=${longExec}$`));
}

describe("sandbox gate of harness/e2e/full.sh", () => {
  it("passes the good walks with sandbox=true and long_exec=true", () => {
    const r = runGate(good());
    expect(r.code).toBe(0);
    expect(r.last).toMatch(/^E2E OK .*domains=true sandbox=true long_exec=true$/);
  });

  it("fails when the walk verdict is not ok", () => {
    expectFail({ ...good(), walk: 'SANDBOX_RESULT {"id":"abcde12345"}\nSANDBOX_VERDICT fail exec text' });
  });

  it("fails when the walk printed no verdict at all", () => {
    expectFail({ ...good(), walk: "SANDBOX_WALK_FAILED fetch failed" });
  });

  it("fails without a sandbox id", () => {
    expectFail({ ...good(), sandbox_id: "" });
  });

  it.each([
    ["zero ledger rows", '{"rows":0,"mc":[],"status":"deleted","hold_mc":0,"consistent":true}'],
    ["two ledger rows", '{"rows":2,"mc":[-100,-100],"status":"deleted","hold_mc":0,"consistent":true}'],
    ["a wrong amount", '{"rows":1,"mc":[-200],"status":"deleted","hold_mc":0,"consistent":true}'],
    ["a sandbox still running", '{"rows":1,"mc":[-100],"status":"running","hold_mc":0,"consistent":true}'],
    ["a hold left", '{"rows":1,"mc":[-100],"status":"deleted","hold_mc":100,"consistent":true}'],
    ["an inconsistent ledger", '{"rows":1,"mc":[-100],"status":"deleted","hold_mc":0,"consistent":false}'],
    ["an error of the ledger query", "Error: SQLITE_CANTOPEN"],
  ])("fails on %s", (_name, ledger) => {
    expectFail({ ...good(), sandbox_ledger: ledger });
  });

  it.each([
    ["a sandbox", '{"sandboxes":1,"containers":0,"networks":0,"homes":0}'],
    ["a container", '{"sandboxes":0,"containers":1,"networks":0,"homes":0}'],
    ["a network", '{"sandboxes":0,"containers":0,"networks":1,"homes":0}'],
    ["a home", '{"sandboxes":0,"containers":0,"networks":0,"homes":1}'],
    ["no state of the rebuilt sandboxd", '{"sandboxes":0,"containers":-1,"networks":-1,"homes":0}'],
  ])("fails when the rebuilt sandboxd keeps %s", (_name, left) => {
    expectFail({ ...good(), sandbox_left: left });
  });

  it("keeps the earlier conditions: good walks do not pass failed domains or too few turns", () => {
    expectFail({ ...good(), domains_ok: "false" }, "true");
    expectFail({ ...good(), turns: "4" }, "true");
    expectFail({ ...good(), balance_cents: "500" }, "true");
  });

  it("fails with long_exec=false when the long exec verdict is not ok", () => {
    const failed = `${RESULT_60}\nLONG_EXEC_RESULT {"label":"long-180","attempts":["abort","abort","abort","abort"],"threw":true,"failures_after":4}\nLONG_EXEC_DELETE 200\nLONG_EXEC_VERDICT fail long-180: the tool failed: This operation was aborted`;
    expectFail({ ...good(), long: failed }, "true", "false");
  });

  it("fails with long_exec=false when the long exec walk printed no verdict or not both results", () => {
    expectFail({ ...good(), long: "LONG_EXEC_VERDICT fail the walk stopped: fetch failed" }, "true", "false");
    expectFail({ ...good(), long: "" }, "true", "false");
    expectFail({ ...good(), long: `${RESULT_60}\nLONG_EXEC_DELETE 200\nLONG_EXEC_VERDICT ok` }, "true", "false");
    expectFail({ ...good(), long: `${RESULT_60}\nLONG_EXEC_VERDICT okay` }, "true", "false");
  });

  it.each([
    ["a sandbox", '{"sandboxes":1,"containers":0,"networks":0,"homes":0}'],
    ["a container", '{"sandboxes":0,"containers":1,"networks":0,"homes":0}'],
    ["a home", '{"sandboxes":0,"containers":0,"networks":0,"homes":1}'],
    ["no state of the rebuilt sandboxd", "Error: no such service"],
  ])("fails with long_exec=false when the rebuilt sandboxd keeps %s after the long exec walk", (_name, left) => {
    expectFail({ ...good(), long_left: left }, "true", "false");
  });

  it("keeps the sandbox condition: a good long exec walk does not pass a failed sandbox walk", () => {
    expectFail({ ...good(), walk: "SANDBOX_VERDICT fail exec text" }, "false", "true");
  });
});
