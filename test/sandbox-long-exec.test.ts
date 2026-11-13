/**
 * Long commands through `POST /v1/sandboxes/{id}/exec` (goals/sandbox/05). The unmodified runtime at d8f8168 aborts
 * every attempt after 30 s, whatever the timeout of the command, tries four times with the same Idempotency-Key and
 * then fails (docs/sandbox/lange-befehle.md, section Vorher). Decided (goals/sandbox/ANNAHMEN.md, Goal 05): a command
 * with a timeout up to EXEC_HOLD_MAX_MS is held as before and its result reaches the runtime through the repeat with
 * the same key; a longer one runs in the background and is answered after EXEC_EARLY_MS, before the runtime aborts,
 * with a text that says it still runs and in which files its output and exit code land.
 *
 * The rebuilt sandboxd is the real `createSandboxd` with a fake Docker (test/sandbox-world.ts); the fake runs
 * `sleep N` on the faked clock of vitest, so no test waits for real.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXEC_EARLY_MS, EXEC_HOLD_MAX_MS, backgroundCommand } from "../src/sandbox/service.js";
import { closeWorlds, sandboxWorld } from "./sandbox-world.js";

afterEach(async () => {
  vi.useRealTimers();
  await closeWorlds();
});

/** Lets real I/O (the HTTP hop to the rebuilt sandboxd) run until `cond` holds. */
async function until(cond: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 5000 && !cond(); i++) await new Promise((r) => setImmediate(r));
  expect(cond(), what).toBe(true);
}

/** A fake Docker whose `bash -lc` runs `sleep N` on the faked clock and prints what the command echoes last. */
function sleepingWorld() {
  const started: string[] = [];
  return sandboxWorld({
    respond: async (cmd, args) => {
      if (cmd !== "docker" || args[0] !== "exec" || !args.includes("-lc")) return undefined;
      const command = args[args.length - 1];
      started.push(command);
      const sleep = /sleep ([0-9]+)/.exec(command);
      if (sleep) await new Promise((r) => setTimeout(r, Number(sleep[1]) * 1000));
      const echo = /echo ([a-z0-9-]+)(?:'|$)/.exec(command);
      return { code: 0, stdout: echo ? `${echo[1]}\n` : "", stderr: "" };
    },
  }).then((w) => ({ ...w, started }));
}

type Pending = { done: boolean; res: { status: number; json: any } | null };
function track(p: Promise<{ status: number; json: any }>): Pending {
  const t: Pending = { done: false, res: null };
  void p.then((r) => {
    t.done = true;
    t.res = r;
  });
  return t;
}

describe("exec with a long timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  it("holds a command with timeout 60000 until its result, and a repeat with the same Idempotency-Key joins it", async () => {
    expect(60000).toBeLessThanOrEqual(EXEC_HOLD_MAX_MS);
    const w = await sleepingWorld();
    const a = w.account();
    const id = (await a.call("POST", "/v1/sandboxes", { name: "long-60" })).json.id as string;
    const body = { command: "cd /root && sleep 60; echo long-60", timeout: 60000 };
    const first = track(a.call("POST", `/v1/sandboxes/${id}/exec`, body, { "Idempotency-Key": "01JC00000000000000000060A1" }));
    await until(() => w.started.length === 1, "the command reached sandboxd");
    await vi.advanceTimersByTimeAsync(31_000);
    expect(first.done).toBe(false);
    // The runtime aborted after 30 s and sends the same request with the same key again.
    const repeat = track(a.call("POST", `/v1/sandboxes/${id}/exec`, body, { "Idempotency-Key": "01JC00000000000000000060A1" }));
    await vi.advanceTimersByTimeAsync(29_000);
    await until(() => first.done && repeat.done, "both answered");
    for (const r of [first.res!, repeat.res!]) {
      expect(r.status).toBe(200);
      expect(r.json).toMatchObject({ stdout: "long-60\n", exit_code: 0 });
    }
    expect(w.started).toEqual([body.command]);
    const sent = w.execs()[0].args;
    expect(sent[sent.length - 1]).toBe(body.command);
  });

  it("answers a command with timeout 180000 in the background after EXEC_EARLY_MS, before the runtime aborts at 30 s", async () => {
    expect(180000).toBeGreaterThan(EXEC_HOLD_MAX_MS);
    expect(EXEC_EARLY_MS).toBeLessThan(30_000);
    const w = await sleepingWorld();
    const a = w.account();
    const id = (await a.call("POST", "/v1/sandboxes", { name: "long-180" })).json.id as string;
    const body = { command: "cd /root && sleep 180; echo long-180", timeout: 180000 };
    const key = { "Idempotency-Key": "01JC0000000000000000180A01" };
    const first = track(a.call("POST", `/v1/sandboxes/${id}/exec`, body, key));
    await until(() => w.started.length === 1, "the command reached sandboxd");
    await vi.advanceTimersByTimeAsync(EXEC_EARLY_MS - 1000);
    expect(first.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    await until(() => first.done, "answered before the command ended");
    expect(first.res!.status).toBe(200);
    const text = String(first.res!.json.stdout);
    expect(first.res!.json.exit_code).toBe(-1);
    expect(text).toMatch(/still running in the background/);
    expect(text).toMatch(/180 seconds/);
    const files = text.match(/\/root\/\.exec\/[0-9a-f]{12}\.(out|err|exit)/g);
    expect(files).toHaveLength(3);
    expect(text).toMatch(/read_file/);
    expect(text).toMatch(/Do not start the command again/);

    // A repeat with the same key starts nothing and gets the same answer at once.
    const again = track(a.call("POST", `/v1/sandboxes/${id}/exec`, body, key));
    await until(() => again.done, "the repeat answered at once");
    expect(again.res!.json).toEqual(first.res!.json);

    // The command keeps running in the sandbox until it ends; then a repeat gets its result.
    await vi.advanceTimersByTimeAsync(160_000);
    await until(() => w.started.length === 1 && w.execs().length === 1, "still one command");
    const late = track(a.call("POST", `/v1/sandboxes/${id}/exec`, body, key));
    await until(() => late.done, "the late repeat answered");
    expect(late.res!.json).toMatchObject({ stdout: "long-180\n", exit_code: 0 });
    expect(w.started).toHaveLength(1);

    // What goes to sandboxd: the command wrapped so its output and exit code land in the files the text names, with
    // its own timeout inside and a longer one for sandboxd, so the exit file is written even when it times out.
    const sent = w.execs()[0].args;
    const wrapped = sent[sent.length - 1];
    const base = files![0].replace(/\.out$/, "");
    expect(wrapped).toBe(backgroundCommand(body.command, base, 180));
    expect(wrapped).toContain("timeout -k 5 180 bash -c 'cd /root && sleep 180; echo long-180'");
  });

  it("gives the result of a long command that ends before EXEC_EARLY_MS as before", async () => {
    const w = await sleepingWorld();
    const a = w.account();
    const id = (await a.call("POST", "/v1/sandboxes", { name: "quick" })).json.id as string;
    const r = track(a.call("POST", `/v1/sandboxes/${id}/exec`, { command: "sleep 5; echo quick", timeout: 180000 }, { "Idempotency-Key": "01JC00000000000000000QUICK" }));
    await until(() => w.started.length === 1, "the command reached sandboxd");
    await vi.advanceTimersByTimeAsync(5_000);
    await until(() => r.done, "answered");
    expect(r.res!.json).toMatchObject({ stdout: "quick\n", exit_code: 0 });
  });

  it("runs a long command without Idempotency-Key once and answers it in the background as well", async () => {
    const w = await sleepingWorld();
    const a = w.account();
    const id = (await a.call("POST", "/v1/sandboxes", { name: "nokey" })).json.id as string;
    const r = track(a.call("POST", `/v1/sandboxes/${id}/exec`, { command: "sleep 600; echo nokey", timeout: 600000 }));
    await until(() => w.started.length === 1, "the command reached sandboxd");
    await vi.advanceTimersByTimeAsync(EXEC_EARLY_MS);
    await until(() => r.done, "answered");
    expect(String(r.res!.json.stdout)).toMatch(/still running in the background/);
    // The longest timeout leaves room for sandboxd to see the wrapper end: 585 s inside, 600 s for sandboxd.
    expect(w.started[0]).toContain("timeout -k 5 585 bash -c");
    await vi.advanceTimersByTimeAsync(600_000);
  });
});

describe("a short exec answers as before", () => {
  it("passes the command unchanged and gives its result", async () => {
    const w = await sandboxWorld();
    const a = w.account();
    const id = (await a.call("POST", "/v1/sandboxes", { name: "short" })).json.id as string;
    const res = await a.call("POST", `/v1/sandboxes/${id}/exec`, { command: "cd /root && echo ok", timeout: 30000 }, { "Idempotency-Key": "01JC000000000000000SHORT01" });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ stdout: "ok\n", stderr: "", exit_code: 0 });
    const sent = w.execs()[0].args;
    expect(sent[sent.length - 1]).toBe("cd /root && echo ok");
  });
});

describe("backgroundCommand in a real bash", () => {
  const run = (command: string, seconds: number) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-exec-"));
    const base = path.join(dir, "exec", "t1");
    const r = spawnSync("bash", ["-lc", backgroundCommand(command, base, seconds)], { encoding: "utf8", timeout: 20_000 });
    const read = (ext: string) => (fs.existsSync(`${base}.${ext}`) ? fs.readFileSync(`${base}.${ext}`, "utf8") : null);
    const out = { code: r.status, stdout: r.stdout, stderr: r.stderr, files: { out: read("out"), err: read("err"), exit: read("exit") } };
    fs.rmSync(dir, { recursive: true, force: true });
    return out;
  };

  it("gives stdout, stderr and the exit code as the command does, and writes them to the files", () => {
    const r = run('echo "it\'s \\"quoted\\""; echo oops >&2; exit 3', 10);
    expect(r).toEqual({
      code: 3,
      stdout: `it's "quoted"\n`,
      stderr: "oops\n",
      files: { out: `it's "quoted"\n`, err: "oops\n", exit: "3\n" },
    });
  });

  it("stops the command at its timeout and writes 124 to the exit file", () => {
    const r = run("echo started; sleep 5; echo never", 1);
    expect(r.code).toBe(124);
    expect(r.files).toEqual({ out: "started\n", err: "", exit: "124\n" });
  });
});
