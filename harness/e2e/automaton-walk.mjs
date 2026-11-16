#!/usr/bin/env node
// The automaton walk of goals/sandbox/08 (point 6): one hosted automaton of the harness account, created over
// POST /v1/automatons, thinking with the unmodified runtime at the pin d8f8168 inside the rebuilt sandboxd (as a process of
// the container sandboxd, harness/sandboxd/harness-run.mjs). harness/e2e/full.sh calls the phases one after another inside
// the container runtime (bind-mounted), with `docker compose restart sandboxd` between crash and restart, and judges on the
// host with the ledger of cp. Plain HTTP, no module of the runtime.
//
// Phases (each prints one line `AUTOMATON_RESULT <JSON>` and exits 0; the verdict comes from judge):
//   node automaton-walk.mjs create [name]        POST /v1/automatons with a name and GENESIS_PROMPT
//   node automaton-walk.mjs turns <id> <n>       waits until GET /v1/automatons/{id} shows turns >= n (the lines
//                                                `Turn <id>: <n> tools` in the runtime's log), then reads the log once
//   node automaton-walk.mjs crash <id>           ends the runtime process in the sandbox over POST /v1/sandboxes/{sandbox_id}/exec
//                                                (KILL_RUNTIME: SIGKILL, only the runtime, never the supervisor) and waits
//                                                for a new turn, which only the supervisor's new start can bring
//   node automaton-walk.mjs restart <id> <n>     after the restart of the container sandboxd: waits for turns > n
//   node automaton-walk.mjs wallet <id>          wallet_address of the automaton (from automaton.json, through cp) and its
//                                                USDC on the chain of the harness (eth_call balanceOf); the address is never printed
//   node automaton-walk.mjs delete <id>          DELETE /v1/automatons/{id}, then GET gives 404
//   node automaton-walk.mjs judge                AUTOMATON_RESULTS (all phase output) and AUTOMATON_LEDGER (what full.sh read
//                                                from the ledger of cp, read only) to `AUTOMATON_VERDICT ok|fail <reasons>`
//
// Why a turn after the restart is a turn of a new process: after the mock provider's fifth answer the runtime sleeps (the
// tool sleep, 600 s), and after every later answer, which is text only, it sleeps 60 s (src/agent/loop.ts at the pin,
// "[IDLE] No pending inputs"). full.sh restarts sandboxd at once after the crash phase saw its turn, and the restart ends
// every process in that container. At the pin the runtime does not sleep on after a new start: runAgentLoop deletes
// sleep_until and wakes before its first turn (src/agent/loop.ts, "Clear any stale sleep_until"), so the first turn
// after a crash or a restart comes within seconds of the supervisor's start.
//
// Environment: AUTOMATON_WALK_URL (else CONWAY_API_URL), AUTOMATON_WALK_KEY (API key of an account with credits, never
// printed), AUTOMATON_WALK_RPC_URL (else AUTOMATON_RPC_URL, else http://chain:8545).

import { pathToFileURL } from "node:url";

export const FIVE_TURNS = 5;
/** A turn of the runtime in its log (src/agent/loop.ts at d8f8168), TURN_PATTERN of src/automaton/service.ts. */
export const TURN_LINE = /Turn [0-9A-Za-z_-]*: [0-9]* tools/;
/** USDC on Base, the mock of the harness chain sits at the same address (harness/docker-compose.yml). */
export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const GENESIS_PROMPT =
  "You are a test automaton in the sandbox of a local harness. Keep every turn short: call at most one read-only tool, " +
  "then answer in one sentence.";
/**
 * Ends the runtime in the sandbox like a crash (SIGKILL): every process whose command line is the runtime's
 * (`node /opt/automaton/dist/index.js --run`; the bracket keeps this shell's own command line out) and whose HOME is
 * /root, the home of the sandbox (the rebuilt sandboxd maps it to the home it holds for this sandbox, so a runtime of
 * another sandbox in the same container is never hit). The supervisor is a bash process and is left alone.
 */
export const KILL_RUNTIME =
  "n=0; for p in $(pgrep -f 'dist/index[.]js --run'); do " +
  "if tr '\\0' '\\n' < /proc/$p/environ 2>/dev/null | grep -qx 'HOME=/root'; then kill -9 \"$p\" && n=$((n+1)); fi; done; " +
  'echo "killed=$n"';
export const TIMEOUTS = { create: 150_000, turns: 300_000, crash: 180_000, restart: 240_000 };

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** The JSON of every `AUTOMATON_RESULT` line in a text, in order; broken lines are left out. */
export function parseAutomatonResults(text) {
  const out = [];
  for (const line of String(text ?? "").split("\n")) {
    if (!line.startsWith("AUTOMATON_RESULT ")) continue;
    try {
      const r = JSON.parse(line.slice("AUTOMATON_RESULT ".length));
      if (r && typeof r === "object" && typeof r.phase === "string") out.push(r);
    } catch {
      // not a result
    }
  }
  return out;
}

/**
 * Judges the phases of one walk (the last result of each phase counts) with the ledger full.sh read:
 *   {"sandbox_rows":n,"inference_before":n,"inference_after":n,"status":"deleted","hold_mc":0,"consistent":true}
 * { ok: true, reasons: [] } or { ok: false, reasons }. A reason that starts with `credits` means the create answered 402.
 */
export function judgeAutomatonWalk(results, ledger) {
  const reasons = [];
  const list = Array.isArray(results) ? results : [];
  const need = (phase) => {
    const r = [...list].reverse().find((x) => x && x.phase === phase);
    if (!r) reasons.push(`${phase}: missing`);
    return r ?? null;
  };

  const create = need("create");
  if (create) {
    if (create.status === 402) reasons.push("credits: POST /v1/automatons answered 402, nothing was topped up");
    else if (create.status !== 201 || !create.id || !create.sandbox_id) reasons.push(`create: status ${create.status}, expected 201 with id and sandbox_id`);
  }
  const turns = need("turns");
  if (turns) {
    if (!(Number(turns.turns) >= FIVE_TURNS)) reasons.push(`turns: ${turns.turns} turns, expected at least ${FIVE_TURNS}`);
    if (!(Number(turns.log_turns) >= 1)) reasons.push("turns: the log holds no line Turn <id>: <n> tools");
    if (turns.key_in_log !== false) reasons.push("turns: the log shows an API key");
  }
  const crash = need("crash");
  if (crash) {
    if (crash.exec_status !== 200 || crash.exit_code !== 0) reasons.push(`crash: the exec answered ${crash.exec_status} with exit code ${crash.exit_code}`);
    else if (!(Number(crash.killed) >= 1)) reasons.push("crash: the exec ended no runtime process");
    if (!(Number(crash.turns_before) >= FIVE_TURNS)) reasons.push(`crash: ${crash.turns_before} turns before the crash, expected at least ${FIVE_TURNS}`);
    if (!(Number(crash.turns) > Number(crash.turns_before))) reasons.push("crash: no turn after the crash");
  }
  const restarted = need("sandboxd_restart");
  if (restarted && restarted.ok !== true) reasons.push("sandboxd_restart: the container sandboxd did not come back");
  const restart = need("restart");
  if (restart) {
    if (crash && !(Number(restart.turns_before) >= Number(crash.turns))) {
      reasons.push(`restart: counted from ${restart.turns_before}, below the ${crash.turns} turns after the crash`);
    }
    if (!(Number(restart.turns) > Number(restart.turns_before))) reasons.push("restart: no turn after the restart of sandboxd");
  }
  const wallet = need("wallet");
  if (wallet) {
    if (wallet.wallet_ok !== true) reasons.push("wallet: no wallet_address of the runtime");
    if (wallet.wallet_usdc !== "0") reasons.push(`wallet: wallet_usdc ${wallet.wallet_usdc ?? null}, expected 0`);
  }
  const del = need("delete");
  if (del) {
    if (del.status !== 200 || del.state !== "deleted") reasons.push(`delete: status ${del.status}, expected 200 with status deleted`);
    if (del.after !== 404) reasons.push(`delete: the automaton is still there (GET answered ${del.after})`);
  }
  if (!ledger || typeof ledger !== "object") reasons.push("ledger: missing");
  else {
    if (!(Number(ledger.sandbox_rows) >= 1)) reasons.push(`ledger: ${ledger.sandbox_rows} rows of kind sandbox for the automaton's sandbox, expected at least 1`);
    if (!(Number(ledger.inference_after) > Number(ledger.inference_before))) {
      reasons.push(`ledger: no new row of kind inference on the account (${ledger.inference_before} before, ${ledger.inference_after} after)`);
    }
    if (ledger.hold_mc !== 0) reasons.push(`ledger: hold_mc ${ledger.hold_mc}, expected 0`);
    if (ledger.status !== "deleted") reasons.push(`ledger: the sandbox is ${ledger.status}, expected deleted`);
    if (ledger.consistent !== true) reasons.push("ledger: balance and ledger of the account differ");
  }
  return { ok: reasons.length === 0, reasons };
}

/** The phases against apiUrl with apiKey; fetchImpl, now and sleep can be replaced (test/automaton-walk.test.ts). */
export function createAutomatonWalk({ apiUrl, apiKey, rpcUrl = "http://chain:8545", fetchImpl = fetch, now = Date.now, sleep = pause, pollMs = 3000, timeouts = TIMEOUTS }) {
  const base = String(apiUrl).replace(/\/+$/, "");
  const limits = { ...TIMEOUTS, ...timeouts };

  async function call(method, path, body, timeoutMs = 30_000) {
    try {
      const res = await fetchImpl(`${base}${path}`, {
        method,
        headers: { Authorization: apiKey, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const parsed = await res.json().catch(() => ({}));
      return { status: res.status, body: parsed && typeof parsed === "object" ? parsed : {} };
    } catch (e) {
      return { status: null, body: {}, error: String(e?.message ?? e).slice(0, 200) };
    }
  }

  /** Polls the status until done(turns) or the time limit; turns is the highest count seen (a failed exec reads 0). */
  async function waitTurns(id, done, limitMs) {
    const start = now();
    let turns = 0;
    let state = null;
    for (;;) {
      const r = await call("GET", `/v1/automatons/${id}`);
      if (r.status === 200) {
        const t = Number(r.body.turns);
        if (Number.isFinite(t)) turns = Math.max(turns, t);
        state = typeof r.body.status === "string" ? r.body.status : state;
      }
      if (done(turns) || now() - start >= limitMs) break;
      await sleep(pollMs);
    }
    return { turns, state, waited_ms: now() - start };
  }

  async function create(name) {
    const r = await call("POST", "/v1/automatons", { name, genesis_prompt: GENESIS_PROMPT }, limits.create);
    return {
      phase: "create",
      status: r.status,
      id: typeof r.body.id === "string" ? r.body.id : null,
      sandbox_id: typeof r.body.sandbox_id === "string" ? r.body.sandbox_id : null,
      state: typeof r.body.status === "string" ? r.body.status : null,
      ...(r.error ? { error: r.error } : {}),
    };
  }

  async function turns(id, want) {
    const w = await waitTurns(id, (t) => t >= want, limits.turns);
    const logs = await call("GET", `/v1/automatons/${id}/logs`);
    const lines = Array.isArray(logs.body.lines) ? logs.body.lines.map(String) : [];
    return {
      phase: "turns",
      want,
      turns: w.turns,
      state: w.state,
      log_turns: lines.filter((l) => TURN_LINE.test(l)).length,
      key_in_log: lines.some((l) => l.includes(apiKey) || /cnwy_k_[0-9a-f]{8}/.test(l)),
      waited_ms: w.waited_ms,
    };
  }

  async function crash(id) {
    const g = await call("GET", `/v1/automatons/${id}`);
    const before = Number(g.body.turns);
    const sandboxId = typeof g.body.sandbox_id === "string" ? g.body.sandbox_id : null;
    if (g.status !== 200 || !sandboxId || !Number.isFinite(before)) {
      return { phase: "crash", turns_before: Number.isFinite(before) ? before : null, exec_status: null, exit_code: null, killed: 0, turns: null, error: `GET /v1/automatons/{id} answered ${g.status}` };
    }
    const ex = await call("POST", `/v1/sandboxes/${sandboxId}/exec`, { command: KILL_RUNTIME, timeout: 30_000 }, 60_000);
    const killed = Number(/killed=([0-9]+)/.exec(String(ex.body.stdout ?? ""))?.[1] ?? 0);
    const w = await waitTurns(id, (t) => t > before, limits.crash);
    return {
      phase: "crash",
      turns_before: before,
      exec_status: ex.status,
      exit_code: typeof ex.body.exit_code === "number" ? ex.body.exit_code : null,
      killed,
      turns: w.turns,
      waited_ms: w.waited_ms,
    };
  }

  async function restart(id, before) {
    const w = await waitTurns(id, (t) => t > before, limits.restart);
    return { phase: "restart", turns_before: before, turns: w.turns, state: w.state, waited_ms: w.waited_ms };
  }

  async function wallet(id) {
    const g = await call("GET", `/v1/automatons/${id}`);
    const address = typeof g.body.wallet_address === "string" ? g.body.wallet_address : "";
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return { phase: "wallet", wallet_ok: false, wallet_usdc: null };
    const data = `0x70a08231${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
    try {
      const res = await fetchImpl(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: USDC_ADDRESS, data }, "latest"] }),
        signal: AbortSignal.timeout(30_000),
      });
      const body = await res.json();
      const hex = typeof body?.result === "string" && /^0x[0-9a-fA-F]*$/.test(body.result) ? body.result : null;
      return { phase: "wallet", wallet_ok: true, wallet_usdc: hex ? BigInt(hex === "0x" ? 0 : hex).toString() : null };
    } catch (e) {
      return { phase: "wallet", wallet_ok: true, wallet_usdc: null, error: String(e?.message ?? e).slice(0, 200) };
    }
  }

  async function remove(id) {
    const d = await call("DELETE", `/v1/automatons/${id}`, undefined, 150_000);
    const after = await call("GET", `/v1/automatons/${id}`);
    return { phase: "delete", status: d.status, state: typeof d.body.status === "string" ? d.body.status : null, after: after.status };
  }

  return { create, turns, crash, restart, wallet, remove };
}

async function main() {
  const [mode = "", ...args] = process.argv.slice(2);
  if (mode === "judge") {
    const results = parseAutomatonResults(process.env.AUTOMATON_RESULTS ?? "");
    let ledger = null;
    try {
      ledger = JSON.parse(process.env.AUTOMATON_LEDGER ?? "null");
    } catch {
      ledger = null;
    }
    const v = judgeAutomatonWalk(results, ledger);
    console.log(v.ok ? "AUTOMATON_VERDICT ok" : `AUTOMATON_VERDICT fail ${v.reasons.join("; ")}`);
    process.exit(v.ok ? 0 : 1);
  }
  const apiUrl = process.env.AUTOMATON_WALK_URL || process.env.CONWAY_API_URL;
  const apiKey = process.env.AUTOMATON_WALK_KEY;
  const rpcUrl = process.env.AUTOMATON_WALK_RPC_URL || process.env.AUTOMATON_RPC_URL || "http://chain:8545";
  const print = (r) => console.log(`AUTOMATON_RESULT ${JSON.stringify(r)}`);
  if (!apiUrl || !apiKey) {
    print({ phase: mode || "none", error: "AUTOMATON_WALK_URL (or CONWAY_API_URL) and AUTOMATON_WALK_KEY are required" });
    return;
  }
  const w = createAutomatonWalk({ apiUrl, apiKey, rpcUrl });
  const id = /^[a-z0-9]{12}$/.test(args[0] ?? "") ? args[0] : null;
  try {
    if (mode === "create") print(await w.create(args[0] || `e2e-automaton-${Date.now() % 100000}`));
    else if (!id) print({ phase: mode || "none", error: "an automaton id is required" });
    else if (mode === "turns") print(await w.turns(id, Number(args[1] ?? FIVE_TURNS)));
    else if (mode === "crash") print(await w.crash(id));
    else if (mode === "restart") print(await w.restart(id, Number(args[1])));
    else if (mode === "wallet") print(await w.wallet(id));
    else if (mode === "delete") print(await w.remove(id));
    else print({ phase: mode || "none", error: "unknown phase" });
  } catch (e) {
    print({ phase: mode, error: String(e?.message ?? e).slice(0, 200) });
  }
}

// Started as a script, not imported (test/automaton-walk.test.ts imports the phases and the judge).
const evalRun = process.execArgv.some((a) => a === "-e" || a === "--eval" || a.startsWith("--eval=") || a === "-p" || a === "--print");
if (!evalRun && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
