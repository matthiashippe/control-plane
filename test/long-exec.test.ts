/**
 * `judgeLongExec` of harness/e2e/long-exec.mjs, in both directions, and the fetch tap it records with. The two results
 * marked `measured` are the LONG_EXEC_RESULT lines of the measurement before the fix (docs/sandbox/lange-befehle.md,
 * section Vorher): the unmodified runtime at d8f8168 against dist/index.js of e8ab65f over TLS with the rebuilt sandboxd,
 * 2026-11-13 on the code-host. long-60 passed there (one abort, then the result through the repeat with the same key),
 * long-180 failed (four aborts, the tool failed, counter 4). Each other case changes one thing the walk must catch.
 * Since goals/sandbox/09 a command without a direct result passes only when the walk got its result with the command on
 * the last line of the text (`waits`), each call under 30000 ms, as a model that follows the text would.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  EXEC_EARLY_MS as WALK_EARLY_MS,
  EXEC_WAIT_S as WALK_WAIT_S,
  LONG_EXECS,
  RUNTIME_ABORT_MS,
  exitCodeOf,
  failuresAfter,
  judgeLongExec,
  judgeLongExecWalk,
  maxWaits,
  parseLongExecResults,
  stdoutOf,
  waitCommandOf,
} from "../harness/e2e/long-exec.mjs";
import { EXEC_EARLY_MS, EXEC_WAIT_S, waitCommand } from "../src/sandbox/service.js";
import { RETRIED, createFetchTap } from "../harness/e2e/runtime-tap.mjs";

const measured60 = () => ({
  label: "long-60",
  seconds: 60,
  timeout: 90000,
  duration_ms: 60168,
  attempts: ["abort", 200] as (number | string)[],
  attempt_ms: [11, 31001],
  threw: false,
  text: "exit_code: 0\nstdout: long-60\n\nstderr: ",
  failures_after: 0 as number | undefined,
  next_status: 200 as number | null,
  next_text: "",
  followup: [] as { path: string; status: number | null; text: string }[],
  runs: 1 as number | undefined,
});

const measured180 = () => ({
  label: "long-180",
  seconds: 180,
  timeout: 240000,
  duration_ms: 127665,
  attempts: ["abort", "abort", "abort", "abort"] as (number | string)[],
  attempt_ms: [1, 31266, 64131, 97662],
  threw: true,
  text: "This operation was aborted",
  failures_after: 4,
  next_status: 200 as number | null,
  next_text: "",
  followup: [] as { path: string; status: number | null; text: string }[],
  runs: 1,
});

const BASE = "/root/.exec/0a1b2c3d4e5f";
const WAIT = waitCommand(BASE);

/** The text of a command answered in the background before goals/sandbox/09: files, but no command to wait with. */
const OLD_BACKGROUND_TEXT =
  `exit_code: -1\nstdout: The command is still running in the background. Its output goes to ${BASE}.out ` +
  `(stdout) and ${BASE}.err (stderr). When it ends, its exit code is written to ${BASE}.exit.` +
  "\nstderr: ";

/** The text since goals/sandbox/09: the same, and on the last line of stdout the command to wait with. */
const BACKGROUND_TEXT =
  `exit_code: -1\nstdout: The command is still running in the background. Its output goes to ${BASE}.out ` +
  `and its errors to ${BASE}.err. Do not start the command again. To wait for its end, call exec with the command on ` +
  `the last line of this answer and no timeout.\n${WAIT}\nstderr: `;

const STILL = "exit_code: 0\nstdout: The command is still running. Run the same command again to wait up to 25 more seconds.\n\nstderr: ";
const ENDED = "exit_code: 0\nstdout: The command has ended with exit code 0.\nlong-180\n\nstderr: ";
const wait = (text: string, duration_ms = 25013) => ({ command: WAIT, attempts: [200] as (number | string)[], duration_ms, status: 200, threw: false, text });

/** A 180 s command answered in the background, followed by calling the command on the last line of the text. */
const background180 = () => ({
  ...measured180(),
  duration_ms: 20012,
  attempts: [200] as (number | string)[],
  attempt_ms: [2],
  threw: false,
  text: BACKGROUND_TEXT,
  failures_after: 0,
  waits: [...Array(6)].map(() => wait(STILL)).concat([wait(ENDED, 10211)]),
});

const fails = (r: unknown, pattern: RegExp) => {
  const v = judgeLongExec(r);
  expect(v.ok).toBe(false);
  expect(v.reasons.join("; ")).toMatch(pattern);
};

describe("failuresAfter counts like the runtime's HTTP client", () => {
  it("adds one per abort, error and retried status and resets on any other answer", () => {
    expect(failuresAfter(["abort", 200])).toBe(0);
    expect(failuresAfter(["abort", "abort", "abort", "abort"])).toBe(4);
    expect(failuresAfter(["abort", 503])).toBe(2);
    expect(failuresAfter([503, 503, 200])).toBe(0);
    expect(failuresAfter(["error"], 2)).toBe(3);
    expect(failuresAfter([400], 4)).toBe(0);
    expect(failuresAfter([404], 1)).toBe(0);
    for (const s of RETRIED) expect(failuresAfter([s])).toBe(1);
    expect(failuresAfter([], 3)).toBe(3);
  });
});

describe("judgeLongExec", () => {
  it("passes the measured long-60: one abort, then the result through the repeat, counter 0", () => {
    expect(judgeLongExec(measured60())).toEqual({ ok: true, reasons: [] });
  });

  it("fails the measured long-180: the tool failed after four aborts and the counter stays at 4", () => {
    const v = judgeLongExec(measured180());
    expect(v.ok).toBe(false);
    expect(v.reasons).toEqual([
      "long-180: the tool failed: This operation was aborted",
      "long-180: failures_after 4, the circuit breaker counter of the runtime is not 0 after the call",
      "long-180: neither the result (long-180 in stdout, exit_code 0) nor a text that says the command is still running and names a command to wait with on its last line",
    ]);
  });

  it("passes long-180 answered in the background when the calls of its wait command give the result", () => {
    expect(judgeLongExec(background180())).toEqual({ ok: true, reasons: [] });
  });

  it("fails on a 503 or any other retried status in an attempt, even when the result came", () => {
    for (const s of RETRIED) fails({ ...measured60(), attempts: [s, 200] }, new RegExp(`attempts got ${s}`));
  });

  it("fails when failures_after is not 0", () => {
    fails({ ...measured60(), failures_after: 1 }, /failures_after 1/);
    fails({ ...measured60(), failures_after: undefined }, /failures_after undefined/);
  });

  it("fails when next_status of list_sandboxes is not 200 (circuit breaker open)", () => {
    fails({ ...measured60(), next_status: null }, /next_status null/);
    fails({ ...measured60(), next_status: 503 }, /next_status 503/);
  });

  it("fails when the command ran twice or the runs were not counted", () => {
    fails({ ...measured60(), runs: 2 }, /ran 2 times/);
    fails({ ...measured60(), runs: 0 }, /ran 0 times/);
    fails({ ...measured60(), runs: undefined }, /ran an unknown number of times/);
  });

  it("fails when the tool failed, whatever else is right", () => {
    fails({ ...measured60(), threw: true }, /the tool failed/);
    fails({ ...background180(), threw: true }, /the tool failed/);
  });

  it("fails when no request was recorded", () => {
    fails({ ...measured60(), attempts: [] }, /no request of the runtime was recorded/);
  });

  it("fails without the result: another exit code, the label only in stderr, another label", () => {
    fails({ ...measured60(), text: "exit_code: 1\nstdout: long-60\n\nstderr: " }, /neither the result/);
    fails({ ...measured60(), text: "exit_code: 0\nstdout: \nstderr: long-60" }, /neither the result/);
    fails({ ...measured60(), text: "exit_code: 0\nstdout: long-180\n\nstderr: " }, /neither the result \(long-60/);
    fails({ ...measured60(), text: "exit_code: 0\nstdout: long-600\n\nstderr: " }, /neither the result/);
  });

  it("fails a background text that names no command to wait with or does not say the command still runs", () => {
    fails({ ...background180(), text: "exit_code: -1\nstdout: The command is still running.\nstderr: " }, /neither the result/);
    fails({ ...background180(), text: BACKGROUND_TEXT.replace("still running", "running") }, /neither the result/);
  });

  it("fails a background text whose wait command was never called or did not give the result", () => {
    const r = background180();
    fails({ ...r, waits: [] }, /never called it/);
    fails({ ...r, waits: undefined }, /never called it/);
    fails({ ...r, waits: [wait(STILL)] }, /did not give the end with exit code 0 and long-180/);
  });

  it("fails on no result at all", () => {
    expect(judgeLongExec(null)).toEqual({ ok: false, reasons: ["no result"] });
  });
});

describe("judgeLongExec of a command in the background (goals/sandbox/09)", () => {
  it("passes long-180 with one call that says still running and one with the end", () => {
    expect(judgeLongExec({ ...background180(), waits: [wait(STILL), wait(ENDED, 9000)] })).toEqual({ ok: true, reasons: [] });
  });

  it("fails a text without a command to wait with, even when the files it names carry the result", () => {
    const followup = [
      { path: `${BASE}.out`, status: 200, text: "long-180\n" },
      { path: `${BASE}.exit`, status: 200, text: "0\n" },
    ];
    fails({ ...background180(), text: OLD_BACKGROUND_TEXT, followup, waits: [] }, /names a command to wait with on its last line/);
    fails({ ...background180(), text: OLD_BACKGROUND_TEXT, followup }, /names a command to wait with on its last line/);
  });

  it("fails a call that took 30000 ms or more, or whose attempt was aborted", () => {
    expect(RUNTIME_ABORT_MS).toBe(30000);
    const r = background180();
    fails({ ...r, waits: [wait(STILL, 30000), wait(ENDED)] }, /wait 1: duration_ms 30000, not under 30000/);
    fails({ ...r, waits: [wait(STILL), { ...wait(ENDED), duration_ms: undefined }] }, /wait 2: duration_ms undefined/);
    fails({ ...r, waits: [{ ...wait(STILL), attempts: ["abort", 200] }, wait(ENDED)] }, /wait 1: attempts \["abort",200\]/);
    fails({ ...r, waits: [wait(STILL), { ...wait(ENDED), attempts: [] }] }, /wait 2: attempts \[\]/);
    fails({ ...r, waits: [wait(STILL), { ...wait(ENDED), threw: true }] }, /wait 2: the tool failed/);
  });

  it("fails a call with another command than the one from the text", () => {
    const r = background180();
    fails({ ...r, waits: [wait(STILL), { ...wait(ENDED), command: `cat ${BASE}.out` }] }, /wait 2: another command/);
    fails({ ...r, waits: [{ ...wait(ENDED), command: waitCommand("/root/.exec/ffffffffffff") }] }, /wait 1: another command/);
  });

  it("fails more calls than the limit", () => {
    expect(maxWaits(180)).toBe(8);
    const r = background180();
    expect(judgeLongExec({ ...r, waits: [...Array(7)].map(() => wait(STILL)).concat([wait(ENDED)]) }).ok).toBe(true);
    fails({ ...r, waits: [...Array(8)].map(() => wait(STILL)).concat([wait(ENDED)]) }, /9 calls of the wait command, more than 8/);
  });

  it("fails when the last call has no label or another exit code", () => {
    const r = background180();
    fails({ ...r, waits: [wait(ENDED.replace("long-180\n", "long-60\n"))] }, /did not give the end/);
    fails({ ...r, waits: [wait(ENDED.replace(/^exit_code: 0/, "exit_code: 1").replace("exit code 0.", "exit code 1."))] }, /did not give the end/);
    fails({ ...r, waits: [wait(ENDED.replace(/^exit_code: 0/, "exit_code: 124").replace("exit code 0.", "exit code 124."))] }, /did not give the end/);
    fails({ ...r, waits: [wait("exit_code: 0\nstdout: long-180\n\nstderr: ")] }, /did not give the end/);
  });

  it("passes long-60 with its direct result without waits", () => {
    const r = measured60();
    expect("waits" in r).toBe(false);
    expect(judgeLongExec(r)).toEqual({ ok: true, reasons: [] });
    expect(judgeLongExec({ ...r, waits: [] })).toEqual({ ok: true, reasons: [] });
  });

  it("uses the same EXEC_EARLY_MS and EXEC_WAIT_S as the Control Plane", () => {
    expect(WALK_EARLY_MS).toBe(EXEC_EARLY_MS);
    expect(WALK_WAIT_S).toBe(EXEC_WAIT_S);
    expect(maxWaits(60)).toBe(3);
  });
});

describe("judgeLongExecWalk", () => {
  it("passes both commands and a deleted sandbox", () => {
    expect(judgeLongExecWalk([measured60(), background180()], { created: true, delete_status: 200 })).toEqual({ ok: true, reasons: [] });
  });

  it("fails on a missing command, a failed one, no delete and no sandbox", () => {
    expect(judgeLongExecWalk([measured60()], { created: true, delete_status: 200 }).reasons).toEqual(["long-180: missing"]);
    expect(judgeLongExecWalk([measured60(), measured180()], { created: true, delete_status: 200 }).ok).toBe(false);
    expect(judgeLongExecWalk([measured60(), background180()], { created: true, delete_status: null }).reasons).toEqual([
      "delete: status null, expected 200",
    ]);
    expect(judgeLongExecWalk([], { created: false, create_text: "Conway API error: POST /v1/sandboxes -> 402" }).ok).toBe(false);
  });
});

describe("the walk's commands and texts", () => {
  it("runs sleep 60 and sleep 180 with timeouts the runtime passes on", () => {
    expect(LONG_EXECS.map((e) => [e.label, e.seconds, e.timeout])).toEqual([
      ["long-60", 60, 90000],
      ["long-180", 180, 240000],
    ]);
    for (const e of LONG_EXECS) {
      expect(e.command).toContain(`sleep ${e.seconds}; echo ${e.label}`);
      expect(e.command.startsWith(`echo run >> /root/${e.label}.runs; `)).toBe(true);
    }
  });

  it("reads stdout, exit code and the command to wait with out of a tool text", () => {
    expect(stdoutOf("exit_code: 0\nstdout: a\nb\n\nstderr: c")).toBe("a\nb\n");
    expect(stdoutOf("This operation was aborted")).toBeNull();
    expect(exitCodeOf("exit_code: -1\nstdout: \nstderr: ")).toBe(-1);
    expect(waitCommandOf(BACKGROUND_TEXT)).toBe(WAIT);
    expect(waitCommandOf(OLD_BACKGROUND_TEXT)).toBeNull();
    expect(waitCommandOf("exit_code: 0\nstdout: long-60\n\nstderr: ")).toBeNull();
    expect(waitCommandOf("This operation was aborted")).toBeNull();
  });

  it("parses every LONG_EXEC_RESULT line", () => {
    const text = `x\nLONG_EXEC_RESULT ${JSON.stringify(measured60())}\nLONG_EXEC_RESULT {broken\nLONG_EXEC_RESULT ${JSON.stringify(measured180())}`;
    expect(parseLongExecResults(text).map((r: any) => r.label)).toEqual(["long-60", "long-180"]);
  });
});

describe("createFetchTap records every attempt, aborted ones too", () => {
  const real = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = real;
  });

  it("records statuses, abort for an aborted request and error for another failure", async () => {
    let n = 0;
    const fake = (async (_input: unknown, init?: RequestInit) => {
      n += 1;
      if (n === 1) {
        const e = new Error("This operation was aborted");
        e.name = "AbortError";
        throw e;
      }
      if (n === 2) throw new TypeError("fetch failed");
      if (n === 3) {
        const c = new AbortController();
        c.abort();
        if (init?.signal?.aborted || c.signal.aborted) {
          const e = new Error("aborted");
          e.name = "TimeoutError";
          throw e;
        }
      }
      return new Response("{}", { status: n === 4 ? 503 : 200 });
    }) as typeof fetch;
    globalThis.fetch = fake;
    const tap = createFetchTap();
    for (let i = 0; i < 5; i++) await globalThis.fetch("https://example.invalid/").catch(() => null);
    expect(tap.take()).toEqual(["abort", "error", "abort", 503, 200]);
    expect(tap.times()).toHaveLength(5);
    tap.reset();
    expect(tap.take()).toEqual([]);
    tap.restore();
    expect(globalThis.fetch).toBe(fake);
  });
});
