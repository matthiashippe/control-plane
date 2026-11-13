#!/usr/bin/env node
// The sandbox walk of the unmodified runtime at the pin d8f8168 (goals/sandbox/04, Kontext): its own client
// (`createConwayClient` from dist/conway/client.js) and its own tools (`executeTool` with `createBuiltinTools` from
// dist/agent/tools.js), no turn of a model. One file for both callers: harness/e2e/full.sh (inside the container
// runtime, bind-mounted) and ops/runtime-sandbox.sh (against production, from a clone at the pin on the code-host).
//
// Steps: create_sandbox (small, an own name per run), then with a client for the new sandbox exec (`echo ok`),
// write_file and read_file (the same text back), expose_port (409 port_exposure_unavailable, sandbox 03),
// list_sandboxes (the sandbox is listed); then DELETE /v1/sandboxes/{id} over plain HTTP with the same key, because
// deleteSandbox is empty at the pin, and list_sandboxes again (the sandbox is gone). Every HTTP status the runtime's
// client got is recorded per step; none may be one its HTTP client retries and counts for its circuit breaker.
//
// Environment: SANDBOX_WALK_URL (else CONWAY_API_URL), SANDBOX_WALK_KEY (the API key, never printed),
// RUNTIME_DIST (dist/ of the runtime, default /opt/automaton/dist), SANDBOX_WALK_NAME (optional).
// Prints one line `SANDBOX_RESULT <JSON>` and one line `SANDBOX_VERDICT ok` or `SANDBOX_VERDICT fail <reasons>`;
// exit code 0 only for ok. The JSON holds the sandbox id (the callers need it for the ledger); step texts and paths
// carry `{id}` instead. A 402 on create ends the walk: no topup, the runtime's topup is never called.

import crypto from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { RETRIED, createFetchTap, redactor, statusOf } from "./runtime-tap.mjs";

export { RETRIED };
export const WALK_FILE = "/root/sandbox-walk.txt";
export const WALK_PORT = 8080;

/**
 * Judges one walk result; { ok: true, reasons: [] } or { ok: false, reasons }. With `ledger_rows` set (the caller
 * counted the ledger rows of kind sandbox for this sandbox), exactly one is right: create and delete at once is one
 * started step. A reason that starts with `credits` means the create answered 402.
 */
export function judgeSandboxWalk(result) {
  const reasons = [];
  const steps = Array.isArray(result?.steps) ? result.steps : [];
  const step = (name) => steps.find((s) => s.step === name);
  const need = (name) => {
    const s = step(name);
    if (!s) reasons.push(`${name}: missing`);
    return s ?? null;
  };

  const create = need("create_sandbox");
  if (create) {
    if (create.status === 402) reasons.push("credits: create_sandbox answered 402, nothing was topped up");
    else if (create.status !== 201 || !result.id) reasons.push(`create_sandbox: status ${create.status}, expected 201 with an id`);
  }
  // exec, write_file and read_file: exactly one request each, answered 200. read_file falls back to `cat` over exec when
  // the read fails, which would hide a broken files/read behind a second request.
  const one200 = (s) => s.status === 200 && Array.isArray(s.http) && s.http.length === 1 && s.http[0] === 200;
  if (!reasons.some((r) => r.startsWith("credits"))) {
    const exec = need("exec");
    if (exec && !(one200(exec) && /^exit_code: 0\nstdout: ok\n?\nstderr: /.test(exec.text ?? ""))) {
      reasons.push(`exec: echo ok gave status ${exec.status} and another text than exit_code 0 with stdout ok`);
    }
    const write = need("write_file");
    if (write && !(one200(write) && String(write.text ?? "").startsWith(`File written: ${WALK_FILE}`))) {
      reasons.push(`write_file: status ${write.status}, the file was not written`);
    }
    const read = need("read_file");
    if (read && !(one200(read) && typeof result.content === "string" && result.content && read.text === result.content)) {
      reasons.push(`read_file: status ${read.status}, the text read back differs from the one written`);
    }
    const expose = need("expose_port");
    if (expose) {
      if (expose.status !== 409) reasons.push(`expose_port: status ${expose.status}, expected 409`);
      else if (!String(expose.text ?? "").includes("port_exposure_unavailable")) reasons.push("expose_port: the text does not name port_exposure_unavailable");
    }
    const listed = need("list_sandboxes");
    if (listed && !(listed.status === 200 && listed.listed === true)) reasons.push(`list_sandboxes: status ${listed?.status}, the new sandbox is not listed`);
    const del = need("delete");
    if (del && del.status !== 200) reasons.push(`delete: status ${del.status}, expected 200`);
    const after = need("list_after_delete");
    if (after && !(after.status === 200 && after.listed === false)) reasons.push(`list_after_delete: status ${after?.status}, the sandbox is still listed`);
  }
  for (const s of steps) {
    const bad = (s.http ?? []).filter((h) => RETRIED.includes(h));
    if (bad.length) reasons.push(`${s.step}: the runtime got ${bad.join(", ")}, a status it retries and counts for its circuit breaker`);
  }
  if (result && result.ledger_rows !== undefined && result.ledger_rows !== 1) {
    reasons.push(`ledger: ${result.ledger_rows} rows of kind sandbox for this sandbox, expected 1`);
  }
  return { ok: reasons.length === 0, reasons };
}

/** The JSON of the last `SANDBOX_RESULT` line in a text, or null. */
export function parseSandboxResult(text) {
  const lines = String(text ?? "").split("\n").filter((l) => l.startsWith("SANDBOX_RESULT "));
  if (!lines.length) return null;
  try {
    return JSON.parse(lines[lines.length - 1].slice("SANDBOX_RESULT ".length));
  } catch {
    return null;
  }
}

/**
 * Runs the walk with the runtime in `runtimeDist` against `apiUrl`. Records the HTTP status of every request the
 * runtime's client sends (the global fetch it uses), per step.
 */
export async function runSandboxWalk({ runtimeDist, apiUrl, apiKey, name }) {
  const { createConwayClient } = await import(pathToFileURL(path.join(runtimeDist, "conway", "client.js")).href);
  const { createBuiltinTools, executeTool } = await import(pathToFileURL(path.join(runtimeDist, "agent", "tools.js")).href);
  const base = apiUrl.replace(/\/+$/, "");
  const result = { name, id: null, content: `sandbox-walk-${crypto.randomBytes(6).toString("hex")}`, steps: [] };
  let id = null;
  const redact = redactor(() => id);

  // Only answered requests count here, as before the tap was shared: a request that failed has no status.
  const tap = createFetchTap();
  const realFetch = tap.realFetch;
  // One client without a sandbox for the create, then one client for the new sandbox for every later step, as the
  // runtime holds one client per sandbox: the step after expose_port shows that the 409 did not open its breaker.
  const tool = async (stepName, toolName, args, conway, sandboxId) => {
    tap.reset();
    const ctx = { conway, identity: { sandboxId } };
    const r = await executeTool(toolName, args, createBuiltinTools(sandboxId), ctx);
    const text = r.error ? r.error : r.result;
    const http = tap.take().filter((h) => typeof h === "number");
    const status = r.error ? statusOf(r.error) ?? http[http.length - 1] ?? null : http[http.length - 1] ?? null;
    return { step: stepName, tool: toolName, status, http, text, error: Boolean(r.error) };
  };
  const push = (s) => {
    result.steps.push({ ...s, text: redact(s.text) });
    return s;
  };

  let client = null;
  const isListed = (s) => !s.error && String(s.text).split("\n").some((l) => l.startsWith(`${id} `));
  try {
    const first = createConwayClient({ apiUrl: base, apiKey, sandboxId: "" });
    const create = await tool("create_sandbox", "create_sandbox", { name, vcpu: 1, memory_mb: 512, disk_gb: 5 }, first, "");
    // The create answers 201; the tool text is `Sandbox created: <id> (...)`.
    const m = /^Sandbox created: ([A-Za-z0-9_-]+) /.exec(create.error ? "" : create.text);
    if (!create.error && create.status === 201 && m) id = m[1];
    result.id = id;
    push(create);
    if (!id) return result;

    client = createConwayClient({ apiUrl: base, apiKey, sandboxId: id });
    push(await tool("exec", "exec", { command: "echo ok", timeout: 30000 }, client, id));
    push(await tool("write_file", "write_file", { path: WALK_FILE, content: result.content }, client, id));
    push(await tool("read_file", "read_file", { path: WALK_FILE }, client, id));
    push(await tool("expose_port", "expose_port", { port: WALK_PORT }, client, id));
    const listed = await tool("list_sandboxes", "list_sandboxes", {}, client, id);
    push({ ...listed, listed: isListed(listed) });
  } finally {
    if (id) {
      // deleteSandbox is a no-op at the pin, so the walk deletes the way the own live check does: plain HTTP.
      tap.reset();
      let status = null;
      try {
        const res = await realFetch(`${base}/v1/sandboxes/${id}`, {
          method: "DELETE",
          headers: { Authorization: apiKey },
          signal: AbortSignal.timeout(150_000),
        });
        status = res.status;
        await res.text().catch(() => "");
      } catch {
        status = null;
      }
      push({ step: "delete", tool: null, status, http: [], text: "" });
      const after = await tool("list_after_delete", "list_sandboxes", {}, client ?? createConwayClient({ apiUrl: base, apiKey, sandboxId: id }), id);
      push({ ...after, listed: isListed(after) });
    }
    tap.restore();
  }
  return result;
}

async function main() {
  const apiUrl = process.env.SANDBOX_WALK_URL || process.env.CONWAY_API_URL;
  const apiKey = process.env.SANDBOX_WALK_KEY;
  const runtimeDist = process.env.RUNTIME_DIST || "/opt/automaton/dist";
  const name = process.env.SANDBOX_WALK_NAME || `walk-${crypto.randomBytes(4).toString("hex")}`;
  if (!apiUrl || !apiKey) {
    console.log("SANDBOX_VERDICT fail SANDBOX_WALK_URL (or CONWAY_API_URL) and SANDBOX_WALK_KEY are required");
    process.exit(1);
  }
  let result;
  try {
    result = await runSandboxWalk({ runtimeDist, apiUrl, apiKey, name });
  } catch (e) {
    console.log(`SANDBOX_VERDICT fail the walk stopped: ${String(e?.message ?? e).slice(0, 200)}`);
    process.exit(1);
  }
  console.log(`SANDBOX_RESULT ${JSON.stringify(result)}`);
  const v = judgeSandboxWalk(result);
  console.log(v.ok ? "SANDBOX_VERDICT ok" : `SANDBOX_VERDICT fail ${v.reasons.join("; ")}`);
  process.exit(v.ok ? 0 : 1);
}

// Started as a script, not imported: under `node -e` argv[1] is only an argument (ops/runtime-sandbox.sh passes this
// file's path that way to import judgeSandboxWalk), so an eval run never starts the walk.
const evalRun = process.execArgv.some((a) => a === "-e" || a === "--eval" || a.startsWith("--eval=") || a === "-p" || a === "--print");
if (!evalRun && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
