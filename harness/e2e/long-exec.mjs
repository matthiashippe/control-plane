#!/usr/bin/env node
// The long exec walk of the unmodified runtime at the pin d8f8168 (goals/sandbox/05, Kontext): its own client
// (`createConwayClient` from dist/conway/client.js) and its own tools (`executeTool` with `createBuiltinTools` from
// dist/agent/tools.js), no turn of a model. Called by harness/e2e/full.sh inside the container runtime (bind-mounted)
// and, for the measurement before the fix, locally against a built dist/index.js and the rebuilt sandboxd.
//
// Steps: create_sandbox (small, an own name per run), then with a client for the new sandbox two commands through the
// tool exec, `sleep 60` with timeout 90000 and `sleep 180` with timeout 240000. Each command first appends one line to
// a file of its own, so the walk can count how often it ran. After each exec the next call of the same client is
// list_sandboxes, which shows whether the runtime's circuit breaker opened. A command without a direct result is then
// followed the way a model follows the text (goals/sandbox/09): the walk takes the command on the last line of stdout
// (waitCommandOf) and calls it through the tool exec without a timeout, until its first line says the command has
// ended, at most maxWaits(seconds) times; each call lands in `waits`. Then it reads the run counter file.
// Last, DELETE /v1/sandboxes/{id} over plain HTTP with the same key, because deleteSandbox is empty at the pin.
//
// Every request the runtime's client sends goes through the global fetch and is recorded, an aborted one as `abort`
// (the runtime aborts each attempt after 30 s, whatever the timeout of the command). `failures_after` is the counter
// of the runtime's HTTP client after the call, counted the way it counts (`src/conway/http-client.ts:60` to `:125` at
// d8f8168): an abort, any other failed request and a status from RETRIED add one, every other answer sets it to 0.
//
// Environment: LONG_EXEC_URL (else CONWAY_API_URL), LONG_EXEC_KEY (the API key, never printed), RUNTIME_DIST (dist/ of
// the runtime, default /opt/automaton/dist), LONG_EXEC_NAME (optional). Prints one line `LONG_EXEC_RESULT <JSON>` per
// command and one line `LONG_EXEC_VERDICT ok` or `LONG_EXEC_VERDICT fail <reasons>`; exit code 0 only for ok. Texts
// carry `{id}` instead of the sandbox id; the key is never printed.

import crypto from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { RETRIED, createFetchTap, redactor, statusOf } from "./runtime-tap.mjs";

/** The two commands of the walk. `label` is what the command prints last and the name of its run counter file. */
export const LONG_EXECS = [
  { label: "long-60", seconds: 60, timeout: 90000, command: "echo run >> /root/long-60.runs; sleep 60; echo long-60" },
  { label: "long-180", seconds: 180, timeout: 240000, command: "echo run >> /root/long-180.runs; sleep 180; echo long-180" },
];

/**
 * EXEC_EARLY_MS and EXEC_WAIT_S of src/sandbox/service.ts (test/long-exec.test.ts compares them): the answer to a
 * command in the background comes after EXEC_EARLY_MS, each call of its wait command waits at most EXEC_WAIT_S seconds.
 */
export const EXEC_EARLY_MS = 20_000;
export const EXEC_WAIT_S = 25;

/** The runtime at d8f8168 aborts every attempt after 30000 ms; each call of the wait command must end before. */
export const RUNTIME_ABORT_MS = 30000;

/** The first line of stdout of the wait command once the command has ended. */
export const ENDED_RE = /^The command has ended with exit code (-?[0-9]+)\.$/;

/** How many calls of the wait command a command of `seconds` needs at most: for 180 s, 8. */
export function maxWaits(seconds) {
  return Math.ceil((seconds * 1000 - EXEC_EARLY_MS) / (EXEC_WAIT_S * 1000)) + 1;
}

/** The counter of the runtime's HTTP client after these requests, starting from `before`. */
export function failuresAfter(attempts, before = 0) {
  let n = before;
  for (const a of attempts ?? []) n = a === "abort" || a === "error" || RETRIED.includes(a) ? n + 1 : 0;
  return n;
}

/** stdout of an exec tool text (`exit_code: X\nstdout: S\nstderr: E`, `src/agent/tools.ts:139` at d8f8168), or null. */
export function stdoutOf(text) {
  const t = String(text ?? "");
  if (!t.startsWith("exit_code: ")) return null;
  const a = t.indexOf("\nstdout: ");
  const b = t.lastIndexOf("\nstderr: ");
  if (a < 0 || b < a) return null;
  return t.slice(a + "\nstdout: ".length, b);
}

/** The exit code of an exec tool text, or null. */
export function exitCodeOf(text) {
  const m = /^exit_code: (-?[0-9]+)\n/.exec(String(text ?? ""));
  return m ? Number(m[1]) : null;
}

/**
 * The command on the last line of stdout of an exec tool text, the one to wait with, or null: a line of its own after
 * the text that explains it, naming the exit file of the command.
 */
export function waitCommandOf(text) {
  const stdout = stdoutOf(text);
  if (stdout === null) return null;
  const lines = stdout.split("\n");
  const last = lines[lines.length - 1].trim();
  return lines.length > 1 && last.includes(".exit") ? last : null;
}

/**
 * Judges one LONG_EXEC_RESULT; { ok: true, reasons: [] } or { ok: false, reasons }. Without error means, for 60 s as for
 * 180 s (goals/sandbox/05 and 09, Kontext): the tool does not fail, no attempt gets a status the runtime retries, the
 * counter of its HTTP client is 0 after the last call, the next list_sandboxes gets 200, the command ran exactly once,
 * and either the result is there (the label in stdout, exit_code 0) or the text says the command still runs and names a
 * command on its last line, and the walk got the result only with that command: every entry in `waits` carries it, has
 * exactly one attempt answered 200, stayed under RUNTIME_ABORT_MS, there are at most maxWaits(seconds) entries, and the
 * last one says the command ended with exit code 0 and has the label in stdout.
 */
export function judgeLongExec(result) {
  if (!result || typeof result !== "object") return { ok: false, reasons: ["no result"] };
  const label = typeof result.label === "string" && result.label ? result.label : "exec";
  const reasons = [];
  const attempts = Array.isArray(result.attempts) ? result.attempts : [];
  const firstLine = String(result.text ?? "").split("\n")[0].slice(0, 160);
  if (result.threw !== false) reasons.push(`${label}: the tool failed: ${firstLine}`);
  if (!attempts.length) reasons.push(`${label}: no request of the runtime was recorded`);
  const bad = attempts.filter((a) => RETRIED.includes(a));
  if (bad.length) reasons.push(`${label}: attempts got ${bad.join(", ")}, a status the runtime retries and counts for its circuit breaker`);
  if (result.failures_after !== 0) reasons.push(`${label}: failures_after ${result.failures_after}, the circuit breaker counter of the runtime is not 0 after the call`);
  if (result.next_status !== 200) reasons.push(`${label}: next_status ${result.next_status}, the next call list_sandboxes did not get 200`);
  if (result.runs !== 1) reasons.push(`${label}: the command ran ${result.runs ?? "an unknown number of"} times, expected once`);
  const stdout = stdoutOf(result.text);
  const hasResult = !result.threw && exitCodeOf(result.text) === 0 && stdout !== null && stdout.split("\n").includes(label);
  if (hasResult) return { ok: reasons.length === 0, reasons };
  const wait = result.threw ? null : waitCommandOf(result.text);
  // The text before the command must say the command still runs; the command itself says so too, which does not count.
  const explained = wait === null || stdout === null ? "" : stdout.slice(0, stdout.lastIndexOf("\n"));
  const told = wait !== null && /still running/i.test(explained);
  if (!told) {
    reasons.push(`${label}: neither the result (${label} in stdout, exit_code 0) nor a text that says the command is still running and names a command to wait with on its last line`);
    return { ok: false, reasons };
  }
  const waits = Array.isArray(result.waits) ? result.waits : [];
  const limit = maxWaits(Number(result.seconds) || 0);
  if (!waits.length) reasons.push(`${label}: the text names a command to wait with, but the walk never called it`);
  if (waits.length > limit) reasons.push(`${label}: ${waits.length} calls of the wait command, more than ${limit}`);
  waits.forEach((w, i) => {
    const n = `${label}: wait ${i + 1}`;
    if (!w || typeof w !== "object") return reasons.push(`${n}: no entry`);
    if (w.command !== wait) reasons.push(`${n}: another command than the one on the last line of the text`);
    const a = Array.isArray(w.attempts) ? w.attempts : [];
    if (a.length !== 1 || a[0] !== 200) reasons.push(`${n}: attempts ${JSON.stringify(a)}, expected exactly one answered 200`);
    if (w.threw !== false) reasons.push(`${n}: the tool failed`);
    if (typeof w.duration_ms !== "number" || !(w.duration_ms < RUNTIME_ABORT_MS)) reasons.push(`${n}: duration_ms ${w.duration_ms}, not under ${RUNTIME_ABORT_MS}`);
  });
  const last = waits[waits.length - 1];
  if (last && typeof last === "object") {
    const out = stdoutOf(last.text);
    const lines = out === null ? [] : out.split("\n");
    const ended = ENDED_RE.exec(lines[0] ?? "");
    if (!ended || exitCodeOf(last.text) !== 0 || ended[1] !== "0" || !lines.includes(label)) {
      reasons.push(`${label}: the last call of the wait command did not give the end with exit code 0 and ${label} in stdout`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}

/** The JSON of every `LONG_EXEC_RESULT` line in a text. */
export function parseLongExecResults(text) {
  const out = [];
  for (const l of String(text ?? "").split("\n")) {
    if (!l.startsWith("LONG_EXEC_RESULT ")) continue;
    try {
      out.push(JSON.parse(l.slice("LONG_EXEC_RESULT ".length)));
    } catch {
      /* not JSON */
    }
  }
  return out;
}

/**
 * Judges a whole walk: both commands present, each judged by judgeLongExec, and the sandbox deleted.
 * `results` are the LONG_EXEC_RESULT objects, `extra` holds { created, delete_status }.
 */
export function judgeLongExecWalk(results, extra = {}) {
  const reasons = [];
  if (extra.created === false) reasons.push(`create_sandbox: ${extra.create_text ?? "no sandbox"}`);
  for (const spec of LONG_EXECS) {
    const r = (results ?? []).find((x) => x && x.label === spec.label);
    if (!r) {
      if (extra.created !== false) reasons.push(`${spec.label}: missing`);
      continue;
    }
    reasons.push(...judgeLongExec(r).reasons);
  }
  if (extra.created !== false && extra.delete_status !== 200) reasons.push(`delete: status ${extra.delete_status}, expected 200`);
  return { ok: reasons.length === 0, reasons };
}

/**
 * Runs the walk with the runtime in `runtimeDist` against `apiUrl`. `print` gets every LONG_EXEC_RESULT as soon as it
 * is there, so a walk that stops later still shows the first command.
 */
export async function runLongExec({ runtimeDist, apiUrl, apiKey, name, print = () => {} }) {
  const { createConwayClient } = await import(pathToFileURL(path.join(runtimeDist, "conway", "client.js")).href);
  const { createBuiltinTools, executeTool } = await import(pathToFileURL(path.join(runtimeDist, "agent", "tools.js")).href);
  const base = apiUrl.replace(/\/+$/, "");
  let id = null;
  const redact = redactor(() => id);
  const tap = createFetchTap();
  const out = { created: false, create_text: "", results: [], delete_status: null };
  // The counter of the HTTP client of the sandbox client, carried over its calls.
  let counter = 0;

  const tool = async (toolName, args, conway, sandboxId) => {
    tap.reset();
    const r = await executeTool(toolName, args, createBuiltinTools(sandboxId), { conway, identity: { sandboxId } });
    const attempts = tap.take();
    const attempt_ms = tap.times();
    const text = r.error ? r.error : r.result;
    const numeric = attempts.filter((a) => typeof a === "number");
    const status = r.error ? statusOf(r.error) ?? numeric[numeric.length - 1] ?? null : numeric[numeric.length - 1] ?? null;
    return { attempts, attempt_ms, text: String(text ?? ""), threw: Boolean(r.error), status };
  };

  try {
    const first = createConwayClient({ apiUrl: base, apiKey, sandboxId: "" });
    const create = await tool("create_sandbox", { name, vcpu: 1, memory_mb: 512, disk_gb: 5 }, first, "");
    const m = /^Sandbox created: ([A-Za-z0-9_-]+) /.exec(create.threw ? "" : create.text);
    if (!create.threw && create.status === 201 && m) id = m[1];
    out.create_text = redact(create.text).split("\n")[0].slice(0, 200);
    if (!id) return out;
    out.created = true;

    const client = createConwayClient({ apiUrl: base, apiKey, sandboxId: id });
    for (const spec of LONG_EXECS) {
      const started = Date.now();
      const ex = await tool("exec", { command: spec.command, timeout: spec.timeout }, client, id);
      const duration_ms = Date.now() - started;
      counter = failuresAfter(ex.attempts, counter);
      const afterExec = counter;
      const next = await tool("list_sandboxes", {}, client, id);
      counter = failuresAfter(next.attempts, counter);
      // Follow the text like a model would: without a direct result, call the command on its last line through exec
      // without a timeout, until it says the command has ended.
      const stdout = ex.threw ? null : stdoutOf(ex.text);
      const direct = !ex.threw && exitCodeOf(ex.text) === 0 && stdout !== null && stdout.split("\n").includes(spec.label);
      const wait = direct || ex.threw ? null : waitCommandOf(ex.text);
      const waits = [];
      if (wait) {
        for (let i = 0; i < maxWaits(spec.seconds); i++) {
          const t0 = Date.now();
          const w = await tool("exec", { command: wait }, client, id);
          const ms = Date.now() - t0;
          counter = failuresAfter(w.attempts, counter);
          waits.push({ command: wait, attempts: w.attempts, duration_ms: ms, status: w.status, threw: w.threw, text: redact(w.text).slice(0, 1000) });
          if (!w.threw && ENDED_RE.test((stdoutOf(w.text) ?? "").split("\n")[0])) break;
        }
      }
      // The counter after the exec, or after the last call of the wait command when the walk waited.
      const failures_after = waits.length ? counter : afterExec;
      const runsRead = await tool("read_file", { path: `/root/${spec.label}.runs` }, client, id);
      counter = failuresAfter(runsRead.attempts, counter);
      const runs = runsRead.threw ? 0 : runsRead.text.split("\n").filter((l) => l.trim() === "run").length;
      const result = {
        label: spec.label,
        seconds: spec.seconds,
        timeout: spec.timeout,
        duration_ms,
        attempts: ex.attempts,
        attempt_ms: ex.attempt_ms,
        threw: ex.threw,
        text: redact(ex.text).slice(0, 2000),
        failures_after,
        next_status: next.threw ? statusOf(next.text) : next.status,
        next_text: next.threw ? redact(next.text).slice(0, 200) : "",
        waits,
        runs,
      };
      out.results.push(result);
      print(result);
    }
  } finally {
    if (id) {
      try {
        const res = await tap.realFetch(`${base}/v1/sandboxes/${id}`, {
          method: "DELETE",
          headers: { Authorization: apiKey },
          signal: AbortSignal.timeout(150_000),
        });
        out.delete_status = res.status;
        await res.text().catch(() => "");
      } catch {
        out.delete_status = null;
      }
    }
    tap.restore();
  }
  return out;
}

async function main() {
  const apiUrl = process.env.LONG_EXEC_URL || process.env.CONWAY_API_URL;
  const apiKey = process.env.LONG_EXEC_KEY;
  const runtimeDist = process.env.RUNTIME_DIST || "/opt/automaton/dist";
  const name = process.env.LONG_EXEC_NAME || `long-${crypto.randomBytes(4).toString("hex")}`;
  if (!apiUrl || !apiKey) {
    console.log("LONG_EXEC_VERDICT fail LONG_EXEC_URL (or CONWAY_API_URL) and LONG_EXEC_KEY are required");
    process.exit(1);
  }
  let out;
  try {
    out = await runLongExec({ runtimeDist, apiUrl, apiKey, name, print: (r) => console.log(`LONG_EXEC_RESULT ${JSON.stringify(r)}`) });
  } catch (e) {
    console.log(`LONG_EXEC_VERDICT fail the walk stopped: ${String(e?.message ?? e).slice(0, 200)}`);
    process.exit(1);
  }
  const v = judgeLongExecWalk(out.results, out);
  console.log(`LONG_EXEC_DELETE ${out.delete_status}`);
  console.log(v.ok ? "LONG_EXEC_VERDICT ok" : `LONG_EXEC_VERDICT fail ${v.reasons.join("; ")}`);
  process.exit(v.ok ? 0 : 1);
}

// Started as a script, not imported (see the same guard in sandbox-walk.mjs).
const evalRun = process.execArgv.some((a) => a === "-e" || a === "--eval" || a.startsWith("--eval=") || a === "-p" || a === "--print");
if (!evalRun && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
