/**
 * `judgeLongExec` of harness/e2e/long-exec.mjs, in both directions, and the fetch tap it records with. The two results
 * marked `measured` are the LONG_EXEC_RESULT lines of the measurement before the fix (docs/sandbox/lange-befehle.md,
 * section Vorher): the unmodified runtime at d8f8168 against dist/index.js of e8ab65f over TLS with the rebuilt sandboxd,
 * 2026-11-13 on the code-host. long-60 passed there (one abort, then the result through the repeat with the same key),
 * long-180 failed (four aborts, the tool failed, counter 4). Each other case changes one thing the walk must catch.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  LONG_EXECS,
  exitCodeOf,
  failuresAfter,
  judgeLongExec,
  judgeLongExecWalk,
  parseLongExecResults,
  pathsIn,
  stdoutOf,
} from "../harness/e2e/long-exec.mjs";
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

const BACKGROUND_TEXT =
  "exit_code: -1\nstdout: The command is still running in the background. Its output goes to /root/.exec/0a1b2c3d4e5f.out " +
  "(stdout) and /root/.exec/0a1b2c3d4e5f.err (stderr). When it ends, its exit code is written to /root/.exec/0a1b2c3d4e5f.exit." +
  "\nstderr: ";

/** A 180 s command answered in the background, followed by reading the files the text names. */
const background180 = () => ({
  ...measured180(),
  duration_ms: 20012,
  attempts: [200] as (number | string)[],
  attempt_ms: [2],
  threw: false,
  text: BACKGROUND_TEXT,
  failures_after: 0,
  followup: [
    { path: "/root/.exec/0a1b2c3d4e5f.out", status: 200, text: "long-180\n" },
    { path: "/root/.exec/0a1b2c3d4e5f.err", status: 200, text: "" },
    { path: "/root/.exec/0a1b2c3d4e5f.exit", status: 200, text: "0\n" },
  ],
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
      "long-180: neither the result (long-180 in stdout, exit_code 0) nor a text that says the command is still running and where its output goes",
    ]);
  });

  it("passes long-180 answered in the background when the files it names give the result", () => {
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

  it("fails a background text that names no file or does not say the command still runs", () => {
    fails({ ...background180(), text: "exit_code: -1\nstdout: The command is still running.\nstderr: " }, /neither the result/);
    fails({ ...background180(), text: BACKGROUND_TEXT.replace("still running", "running") }, /neither the result/);
  });

  it("fails a background text whose files do not give the result", () => {
    const r = background180();
    fails({ ...r, followup: [] }, /reading it after the command ended did not give long-180/);
    fails({ ...r, followup: r.followup.map((f) => ({ ...f, text: "" })) }, /did not give long-180/);
    fails({ ...r, followup: r.followup.map((f) => ({ ...f, status: 404 })) }, /did not give long-180/);
  });

  it("fails on no result at all", () => {
    expect(judgeLongExec(null)).toEqual({ ok: false, reasons: ["no result"] });
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

  it("reads stdout, exit code and paths out of a tool text", () => {
    expect(stdoutOf("exit_code: 0\nstdout: a\nb\n\nstderr: c")).toBe("a\nb\n");
    expect(stdoutOf("This operation was aborted")).toBeNull();
    expect(exitCodeOf("exit_code: -1\nstdout: \nstderr: ")).toBe(-1);
    expect(pathsIn(BACKGROUND_TEXT)).toEqual(["/root/.exec/0a1b2c3d4e5f.out", "/root/.exec/0a1b2c3d4e5f.err", "/root/.exec/0a1b2c3d4e5f.exit"]);
    expect(pathsIn("nothing here")).toEqual([]);
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
