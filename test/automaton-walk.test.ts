/**
 * The automaton walk of the harness (harness/e2e/automaton-walk.mjs, goals/sandbox/08 point 6), without Docker and without
 * a port: `judgeAutomatonWalk` in both directions (a complete walk with its ledger is ok; too few turns, no turn after the
 * crash, no turn after the restart of sandboxd, a wallet that holds USDC, a ledger without a row sandbox, without new
 * inference, with a hold left or out of step are each a fail), the phases against a fake fetch (they call the routes under
 * /v1/automatons, the exec of the automaton's own sandbox and eth_call balanceOf), and the command that ends the runtime
 * in a real bash: only the runtime process of this home, never another one.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FIVE_TURNS,
  GENESIS_PROMPT,
  KILL_RUNTIME,
  USDC_ADDRESS,
  createAutomatonWalk,
  judgeAutomatonWalk,
  parseAutomatonResults,
} from "../harness/e2e/automaton-walk.mjs";
import { mapRoot } from "../harness/sandboxd/harness-run.mjs";

type R = Record<string, unknown> & { phase: string };

const ID = "abcdefghij12";
const SANDBOX = "abcde12345";
const KEY = `cnwy_k_${"1".repeat(32)}`;
const WALLET = `0x${"ab".repeat(20)}`;

function good(): R[] {
  return [
    { phase: "create", status: 201, id: ID, sandbox_id: SANDBOX, state: "starting" },
    { phase: "turns", want: 5, turns: 5, state: "running", log_turns: 5, key_in_log: false, waited_ms: 21000 },
    { phase: "crash", turns_before: 5, exec_status: 200, exit_code: 0, killed: 1, turns: 6, waited_ms: 12000 },
    { phase: "sandboxd_restart", ok: true },
    { phase: "restart", turns_before: 6, turns: 7, state: "running", waited_ms: 15000 },
    { phase: "wallet", wallet_ok: true, wallet_usdc: "0" },
    { phase: "delete", status: 200, state: "deleted", after: 404 },
  ];
}

const GOOD_LEDGER = { sandbox_rows: 1, inference_before: 6, inference_after: 13, status: "deleted", hold_mc: 0, consistent: true };

function withPhase(phase: string, patch: Record<string, unknown>): R[] {
  return good().map((r) => (r.phase === phase ? { ...r, ...patch } : r));
}

function without(phase: string): R[] {
  return good().filter((r) => r.phase !== phase);
}

function expectFail(results: unknown, ledger: unknown, pattern: RegExp): void {
  const v = judgeAutomatonWalk(results, ledger) as { ok: boolean; reasons: string[] };
  expect(v.ok).toBe(false);
  expect(v.reasons.join("; ")).toMatch(pattern);
}

describe("judgeAutomatonWalk", () => {
  it("passes a complete walk with its ledger", () => {
    expect(judgeAutomatonWalk(good(), GOOD_LEDGER)).toEqual({ ok: true, reasons: [] });
    expect(FIVE_TURNS).toBe(5);
  });

  it("fails with too few turns before the crash", () => {
    expectFail(withPhase("turns", { turns: 4 }), GOOD_LEDGER, /turns: 4 turns, expected at least 5/);
    expectFail(without("turns"), GOOD_LEDGER, /turns: missing/);
    expectFail(withPhase("turns", { log_turns: 0 }), GOOD_LEDGER, /turns: the log holds no line Turn/);
  });

  it("fails without a turn after the crash, or when the exec did not end the runtime", () => {
    expectFail(withPhase("crash", { turns: 5 }), GOOD_LEDGER, /crash: no turn after the crash/);
    expectFail(withPhase("crash", { killed: 0 }), GOOD_LEDGER, /crash: the exec ended no runtime process/);
    expectFail(withPhase("crash", { exec_status: 404, exit_code: null }), GOOD_LEDGER, /crash: the exec/);
    expectFail(withPhase("crash", { turns_before: 4 }), GOOD_LEDGER, /crash: 4 turns before the crash/);
    expectFail(without("crash"), GOOD_LEDGER, /crash: missing/);
  });

  it("fails without a turn after the restart of sandboxd, or when sandboxd did not come back", () => {
    expectFail(withPhase("restart", { turns: 6 }), GOOD_LEDGER, /restart: no turn after the restart of sandboxd/);
    expectFail(withPhase("restart", { turns_before: 5 }), GOOD_LEDGER, /restart: counted from 5/);
    expectFail(withPhase("sandboxd_restart", { ok: false }), GOOD_LEDGER, /sandboxd_restart: the container sandboxd did not come back/);
    expectFail(without("sandboxd_restart"), GOOD_LEDGER, /sandboxd_restart: missing/);
    expectFail(without("restart"), GOOD_LEDGER, /restart: missing/);
  });

  it("fails when the runtime wallet holds USDC or has no address", () => {
    expectFail(withPhase("wallet", { wallet_usdc: "1" }), GOOD_LEDGER, /wallet: wallet_usdc 1, expected 0/);
    expectFail(withPhase("wallet", { wallet_usdc: null }), GOOD_LEDGER, /wallet: wallet_usdc null, expected 0/);
    expectFail(withPhase("wallet", { wallet_ok: false }), GOOD_LEDGER, /wallet: no wallet_address/);
  });

  it("fails when the create, the delete or the log is wrong", () => {
    expectFail(withPhase("create", { status: 402, id: null, sandbox_id: null }), GOOD_LEDGER, /credits: POST \/v1\/automatons answered 402/);
    expectFail(withPhase("create", { status: 501 }), GOOD_LEDGER, /create: status 501/);
    expectFail(withPhase("delete", { status: 404 }), GOOD_LEDGER, /delete: status 404/);
    expectFail(withPhase("delete", { after: 200 }), GOOD_LEDGER, /delete: the automaton is still there/);
    expectFail(withPhase("turns", { key_in_log: true }), GOOD_LEDGER, /turns: the log shows an API key/);
  });

  it.each([
    ["no row of kind sandbox", { ...GOOD_LEDGER, sandbox_rows: 0 }, /ledger: 0 rows of kind sandbox/],
    ["no new inference", { ...GOOD_LEDGER, inference_after: 6 }, /ledger: no new row of kind inference/],
    ["a hold left", { ...GOOD_LEDGER, hold_mc: 1000 }, /ledger: hold_mc 1000, expected 0/],
    ["a sandbox not deleted", { ...GOOD_LEDGER, status: "running" }, /ledger: the sandbox is running, expected deleted/],
    ["balance and ledger out of step", { ...GOOD_LEDGER, consistent: false }, /ledger: balance and ledger of the account differ/],
    ["no ledger at all", null, /ledger: missing/],
  ])("fails on a ledger with %s", (_name, ledger, pattern) => {
    expectFail(good(), ledger, pattern);
  });

  it("reads every AUTOMATON_RESULT line and judges the last one of each phase", () => {
    const text = good().map((r) => `noise\nAUTOMATON_RESULT ${JSON.stringify(r)}`).join("\n") + "\nAUTOMATON_RESULT {broken";
    expect(parseAutomatonResults(text)).toEqual(good());
    const again = [...good(), { phase: "turns", want: 5, turns: 3 }];
    expectFail(again, GOOD_LEDGER, /turns: 3 turns/);
    expectFail(parseAutomatonResults(""), GOOD_LEDGER, /create: missing/);
  });
});

// ---- the phases against a fake control plane and a fake chain

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: any;
}

function fakeCp(opts: { turnsAfter?: (polls: number) => number; usdc?: bigint } = {}) {
  const calls: Call[] = [];
  let polls = 0;
  let deleted = false;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetchImpl = async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = String(init.method ?? "GET");
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method, url, headers, body });
    const u = new URL(url);
    if (u.origin === "http://chain.test") {
      return json(200, { jsonrpc: "2.0", id: body.id, result: `0x${(opts.usdc ?? 0n).toString(16).padStart(64, "0")}` });
    }
    if (headers.authorization !== KEY) return json(401, { error: "unauthorized" });
    if (method === "POST" && u.pathname === "/v1/automatons") {
      return json(201, { id: ID, name: body.name, status: "starting", sandbox_id: SANDBOX, created_at: "2026-11-16T00:00:00.000Z" });
    }
    if (method === "GET" && u.pathname === `/v1/automatons/${ID}`) {
      if (deleted) return json(404, { error: "automaton_not_found" });
      polls += 1;
      const turns = (opts.turnsAfter ?? ((n) => n))(polls);
      return json(200, { id: ID, status: turns > 0 ? "running" : "starting", wallet_address: WALLET, turns, sandbox_id: SANDBOX });
    }
    if (method === "GET" && u.pathname === `/v1/automatons/${ID}/logs`) {
      return json(200, { id: ID, lines: ["[WAKE UP] e2e is alive.", "Turn 01J: 1 tools, 900 tokens", "Turn 01K: 0 tools, 800 tokens"] });
    }
    if (method === "POST" && u.pathname === `/v1/sandboxes/${SANDBOX}/exec`) {
      return json(200, { stdout: "killed=1\n", stderr: "", exit_code: 0 });
    }
    if (method === "DELETE" && u.pathname === `/v1/automatons/${ID}`) {
      deleted = true;
      return json(200, { ok: true, id: ID, status: "deleted" });
    }
    return json(404, { error: "not_found" });
  };
  return { calls, fetchImpl };
}

function walkWith(cp: ReturnType<typeof fakeCp>) {
  let t = 0;
  return createAutomatonWalk({
    apiUrl: "https://cp.test:8443/",
    apiKey: KEY,
    rpcUrl: "http://chain.test",
    fetchImpl: cp.fetchImpl,
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
    pollMs: 3000,
  });
}

const paths = (calls: Call[]) => calls.map((c) => `${c.method} ${new URL(c.url).pathname}`);

describe("the phases of the automaton walk", () => {
  it("create calls POST /v1/automatons with name and genesis_prompt and the key", async () => {
    const cp = fakeCp();
    const r = await walkWith(cp).create("e2e-automaton");
    expect(r).toEqual({ phase: "create", status: 201, id: ID, sandbox_id: SANDBOX, state: "starting" });
    expect(cp.calls).toHaveLength(1);
    expect(cp.calls[0]).toMatchObject({ method: "POST", url: "https://cp.test:8443/v1/automatons", headers: { authorization: KEY } });
    expect(cp.calls[0].body).toEqual({ name: "e2e-automaton", genesis_prompt: GENESIS_PROMPT });
  });

  it("turns polls GET /v1/automatons/{id} until turns >= n, then reads the log", async () => {
    const cp = fakeCp();
    const r = await walkWith(cp).turns(ID, 5);
    expect(r).toMatchObject({ phase: "turns", want: 5, turns: 5, state: "running", log_turns: 2, key_in_log: false });
    expect(paths(cp.calls)).toEqual([...Array(5).fill(`GET /v1/automatons/${ID}`), `GET /v1/automatons/${ID}/logs`]);
  });

  it("turns gives up at its time limit with the turns it saw", async () => {
    const cp = fakeCp({ turnsAfter: () => 2 });
    const r = await walkWith(cp).turns(ID, 5);
    expect(r).toMatchObject({ phase: "turns", want: 5, turns: 2 });
    expect(Number(r.waited_ms)).toBeGreaterThanOrEqual(300_000);
    expectFail(withPhase("turns", r), GOOD_LEDGER, /turns: 2 turns, expected at least 5/);
  });

  it("crash ends the runtime through the exec of the automaton's sandbox and waits for a new turn", async () => {
    const cp = fakeCp({ turnsAfter: (n) => (n <= 2 ? 5 : 6) });
    const r = await walkWith(cp).crash(ID);
    expect(r).toMatchObject({ phase: "crash", turns_before: 5, exec_status: 200, exit_code: 0, killed: 1, turns: 6 });
    const exec = cp.calls.find((c) => c.url.endsWith(`/v1/sandboxes/${SANDBOX}/exec`));
    expect(exec).toMatchObject({ method: "POST", headers: { authorization: KEY } });
    expect(exec!.body.command).toBe(KILL_RUNTIME);
    expect(paths(cp.calls)[0]).toBe(`GET /v1/automatons/${ID}`);
  });

  it("restart waits for a turn above the count before the restart of sandboxd and takes no 0 of a failed exec as the count", async () => {
    const cp = fakeCp({ turnsAfter: (n) => [0, 6, 0, 7][n - 1] ?? 7 });
    const r = await walkWith(cp).restart(ID, 6);
    expect(r).toMatchObject({ phase: "restart", turns_before: 6, turns: 7 });
    expect(paths(cp.calls).every((p) => p === `GET /v1/automatons/${ID}`)).toBe(true);
  });

  it("wallet reads wallet_address of the automaton and its USDC with eth_call balanceOf, and never prints the address", async () => {
    const cp = fakeCp();
    const r = await walkWith(cp).wallet(ID);
    expect(r).toEqual({ phase: "wallet", wallet_ok: true, wallet_usdc: "0" });
    expect(JSON.stringify(r)).not.toContain(WALLET.slice(2));
    const rpc = cp.calls.find((c) => c.url.startsWith("http://chain.test"))!;
    expect(rpc.body).toMatchObject({ jsonrpc: "2.0", method: "eth_call" });
    expect(rpc.body.params).toEqual([{ to: USDC_ADDRESS, data: `0x70a08231${"0".repeat(24)}${WALLET.slice(2)}` }, "latest"]);
    const rich = fakeCp({ usdc: 1_500_000n });
    expect(await walkWith(rich).wallet(ID)).toEqual({ phase: "wallet", wallet_ok: true, wallet_usdc: "1500000" });
  });

  it("delete calls DELETE /v1/automatons/{id} and sees 404 after", async () => {
    const cp = fakeCp();
    const r = await walkWith(cp).remove(ID);
    expect(r).toEqual({ phase: "delete", status: 200, state: "deleted", after: 404 });
    expect(paths(cp.calls)).toEqual([`DELETE /v1/automatons/${ID}`, `GET /v1/automatons/${ID}`]);
  });

  it("a whole walk against the fakes is judged ok with a good ledger", async () => {
    const cp = fakeCp({ turnsAfter: (n) => Math.min(n, 9) });
    const w = walkWith(cp);
    const created = await w.create("e2e-automaton");
    const five = await w.turns(ID, 5);
    const crash = await w.crash(ID);
    const restart = await w.restart(ID, Number(crash.turns));
    const results = [created, five, crash, { phase: "sandboxd_restart", ok: true }, restart, await w.wallet(ID), await w.remove(ID)];
    expect(judgeAutomatonWalk(results, GOOD_LEDGER)).toEqual({ ok: true, reasons: [] });
  });

  it("judge on the command line prints AUTOMATON_VERDICT ok or fail with the reason", () => {
    const file = path.join(__dirname, "..", "harness", "e2e", "automaton-walk.mjs");
    const lines = good().map((r) => `AUTOMATON_RESULT ${JSON.stringify(r)}`).join("\n");
    const run = (ledger: unknown) =>
      spawnSync(process.execPath, [file, "judge"], {
        env: { PATH: process.env.PATH, AUTOMATON_RESULTS: lines, AUTOMATON_LEDGER: JSON.stringify(ledger) },
        encoding: "utf8",
      });
    const ok = run(GOOD_LEDGER);
    expect(ok.stdout.trim().split("\n").pop()).toBe("AUTOMATON_VERDICT ok");
    expect(ok.status).toBe(0);
    const bad = run({ ...GOOD_LEDGER, hold_mc: 100 });
    expect(bad.stdout.trim().split("\n").pop()).toMatch(/^AUTOMATON_VERDICT fail .*hold_mc 100/);
    expect(bad.status).toBe(1);
  });
});

// ---- the command that ends the runtime, in a real bash

const procs: Array<{ pid?: number }> = [];
const tmp: string[] = [];
afterEach(() => {
  for (const p of procs.splice(0)) if (p.pid) try { process.kill(p.pid, "SIGKILL"); } catch { /* gone */ }
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function fakeRuntime(home: string, argv0: string) {
  // A process whose command line reads like the runtime's (`node /opt/automaton/dist/index.js --run`), with HOME set.
  const p = spawn("bash", ["-c", `exec -a "${argv0}" sleep 60`], { env: { PATH: process.env.PATH, HOME: home }, stdio: "ignore" });
  procs.push(p);
  return p;
}

const gone = (p: { exitCode: number | null; signalCode: string | null }) => p.exitCode !== null || p.signalCode !== null;

describe("KILL_RUNTIME", () => {
  it("ends only the runtime process whose HOME is the sandbox's home, never the supervisor or another sandbox's runtime", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "automaton-walk-"));
    tmp.push(root);
    const home = path.join(root, "mnt", "abcde12345");
    const other = path.join(root, "mnt", "zzzzz99999");
    const runtime = fakeRuntime(home, "node /opt/automaton/dist/index.js --run");
    const supervisor = fakeRuntime(home, "bash /usr/local/bin/automaton-supervise");
    const foreign = fakeRuntime(other, "node /opt/automaton/dist/index.js --run");
    await new Promise((r) => setTimeout(r, 200));
    // The rebuilt sandboxd maps /root to the home of the sandbox, the real sandbox has HOME=/root.
    const r = spawnSync("bash", ["-lc", mapRoot(KILL_RUNTIME, home)], { encoding: "utf8" });
    expect(r.stdout.trim()).toBe("killed=1");
    expect(r.status).toBe(0);
    await new Promise((res) => setTimeout(res, 300));
    expect(gone(runtime)).toBe(true);
    expect(runtime.signalCode).toBe("SIGKILL");
    expect(gone(supervisor)).toBe(false);
    expect(gone(foreign)).toBe(false);
  });
});
