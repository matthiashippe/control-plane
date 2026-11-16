/**
 * The sandbox gate of harness/e2e/full.sh (goals/sandbox/04, 05 and 08), run for real in bash. The test cuts the block
 * after the line that prints the state of the rebuilt sandboxd after the automaton walk up to the end of the file (the
 * judge of the automaton walk, the verdicts `sandbox=…`, `long_exec=…` and `automaton=…`, the cleanup, the final
 * condition and the closing line) and runs it in harness/ with planted values for `walk`, `sandbox_id`, `sandbox_ledger`,
 * `sandbox_left`, `long`, `long_left`, `relay` (the verdict of the relay walk of goals/relay/01, which runs before the
 * block), `automaton_results`, `automaton_ledger` and `automaton_left`. The judge is the real one
 * (`node e2e/automaton-walk.mjs judge`). Compose and cleanup are stubs that do nothing, so no container and no port is
 * touched. The good walks must end in `E2E OK … sandbox=true long_exec=true relay=true automaton=true`; a failed walk
 * verdict, a missing sandbox id, any other ledger line, a sandbox left in the rebuilt sandboxd, a failed long exec
 * verdict, a missing LONG_EXEC_RESULT, a failing earlier condition, a bad automaton walk, a bad automaton ledger and an
 * automaton left in the rebuilt sandboxd must each end in `E2E FAIL`.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const HARNESS = join(__dirname, "..", "harness");
const FULL_SH = join(HARNESS, "e2e", "full.sh");
const START = 'echo "rebuilt sandboxd after the automaton walk: $automaton_left"';

const GOOD_LEDGER = '{"rows":1,"mc":[-100],"status":"deleted","hold_mc":0,"consistent":true}';
const GOOD_LEFT = '{"sandboxes":0,"containers":0,"networks":0,"homes":0}';
const RESULT_60 = 'LONG_EXEC_RESULT {"label":"long-60","attempts":["abort",200],"threw":false,"failures_after":0,"next_status":200,"runs":1}';
const RESULT_180 = 'LONG_EXEC_RESULT {"label":"long-180","attempts":[200],"threw":false,"failures_after":0,"next_status":200,"runs":1}';
const GOOD_LONG = `${RESULT_60}\n${RESULT_180}\nLONG_EXEC_DELETE 200\nLONG_EXEC_VERDICT ok`;
// The phases of the automaton walk of goals/sandbox/08 as full.sh collects them, and the ledger it reads for them.
const AUTOMATON_PHASES = [
  { phase: "create", status: 201, id: "abcdefghij12", sandbox_id: "fghij67890", state: "starting" },
  { phase: "turns", want: 5, turns: 5, state: "running", log_turns: 5, key_in_log: false, waited_ms: 21000 },
  { phase: "crash", turns_before: 5, exec_status: 200, exit_code: 0, killed: 1, turns: 6, waited_ms: 12000 },
  { phase: "sandboxd_restart", ok: true },
  { phase: "restart", turns_before: 6, turns: 7, state: "running", waited_ms: 15000 },
  { phase: "wallet", wallet_ok: true, wallet_usdc: "0" },
  { phase: "delete", status: 200, state: "deleted", after: 404 },
];
const automatonResults = (patch: Record<string, Record<string, unknown>> = {}) =>
  AUTOMATON_PHASES.map((r) => `AUTOMATON_RESULT ${JSON.stringify({ ...r, ...(patch[r.phase] ?? {}) })}`).join("\n");
const AUTOMATON_LEDGER = { sandbox_rows: 1, inference_before: 6, inference_after: 13, status: "deleted", hold_mc: 0, consistent: true };

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
    // The relay walk of goals/relay/01 runs before this block; its verdict arrives here as relay=true or relay=false.
    relay: "true",
    // The harness walk of goals/konto/03 (harness/e2e/konto-chain.mjs) runs before this block too; konto_chain=true or false.
    konto_chain: "true",
    // The automaton walk of goals/sandbox/08 runs before this block; its judge runs in it.
    automaton_results: automatonResults(),
    automaton_ledger: JSON.stringify(AUTOMATON_LEDGER),
    automaton_left: GOOD_LEFT,
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
  const r = spawnSync("bash", ["-c", script], { env, encoding: "utf8", cwd: HARNESS });
  const out = r.stdout.trim().split("\n");
  return { code: r.status, last: out[out.length - 1] ?? "" };
}

function expectFail(
  planted: Planted,
  sandbox: "true" | "false" = "false",
  longExec: "true" | "false" = "true",
  relay: "true" | "false" = "true",
  automaton: "true" | "false" = "true",
): void {
  const r = runGate(planted);
  expect(r.code).toBe(1);
  expect(r.last).toMatch(/^E2E FAIL /);
  expect(r.last).toContain(` sandbox=${sandbox} `);
  expect(r.last).toMatch(new RegExp(` long_exec=${longExec} relay=${relay} automaton=${automaton}$`));
}

describe("sandbox gate of harness/e2e/full.sh", () => {
  it("passes the good walks with sandbox=true, long_exec=true, relay=true and automaton=true", () => {
    const r = runGate(good());
    expect(r.code).toBe(0);
    expect(r.last).toMatch(/^E2E OK .*domains=true sandbox=true long_exec=true relay=true automaton=true$/);
  });

  it.each([
    ["too few turns", automatonResults({ turns: { turns: 4 } })],
    ["no turn after the crash", automatonResults({ crash: { turns: 5 } })],
    ["no turn after the restart of sandboxd", automatonResults({ restart: { turns: 6 } })],
    ["sandboxd not back after its restart", automatonResults({ sandboxd_restart: { ok: false } })],
    ["USDC in the runtime wallet", automatonResults({ wallet: { wallet_usdc: "1000000" } })],
    ["no result at all", ""],
  ])("fails with automaton=false on an automaton walk with %s, and good walks do not make up for it", (_name, results) => {
    expectFail({ ...good(), automaton_results: results }, "true", "true", "true", "false");
  });

  it.each([
    ["no row of kind sandbox", { ...AUTOMATON_LEDGER, sandbox_rows: 0 }],
    ["no new inference", { ...AUTOMATON_LEDGER, inference_after: 6 }],
    ["a hold left", { ...AUTOMATON_LEDGER, hold_mc: 1000 }],
    ["the sandbox not deleted", { ...AUTOMATON_LEDGER, status: "running" }],
    ["balance and ledger out of step", { ...AUTOMATON_LEDGER, consistent: false }],
  ])("fails with automaton=false on an automaton ledger with %s", (_name, ledger) => {
    expectFail({ ...good(), automaton_ledger: JSON.stringify(ledger) }, "true", "true", "true", "false");
  });

  it("fails with automaton=false on an error of the automaton ledger query or a sandbox left after the automaton walk", () => {
    expectFail({ ...good(), automaton_ledger: "Error: SQLITE_CANTOPEN" }, "true", "true", "true", "false");
    expectFail({ ...good(), automaton_left: '{"sandboxes":1,"containers":1,"networks":1,"homes":1}' }, "true", "true", "true", "false");
  });

  it("fails with relay=false when the relay walk did not pass, and good walks do not make up for it (goals/relay/01)", () => {
    expectFail({ ...good(), relay: "false" }, "true", "true", "false");
  });

  it("fails when the spend permission walk on chain 84532 did not pass, and good walks do not make up for it (goals/konto/03)", () => {
    const r = runGate({ ...good(), konto_chain: "false" });
    expect(r.code).toBe(1);
    expect(r.last).toMatch(/^E2E FAIL .* konto_chain=false /);
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
