/**
 * Waiting for a command in the background (goals/sandbox/09). The runtime at d8f8168 shows the model only the text of
 * an exec answer (`exit_code: X\nstdout: S\nstderr: E`), so the answer to a command still running names, in the field
 * `wait_command` and as the last line of stdout, a command the model calls with exec and no timeout (EXEC_DEFAULT_MS):
 * it waits up to EXEC_WAIT_S seconds for `<tag>.exit`, then prints exit code, output and errors, or says the command
 * is still running. The command itself runs here in a real bash with a small `seconds`, never with 25 s.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EXEC_DEFAULT_MS, EXEC_EARLY_MS, EXEC_HOLD_MAX_MS, EXEC_WAIT_S, waitCommand } from "../src/sandbox/service.js";
import { mapRoot } from "../harness/sandboxd/harness-run.mjs";
import { closeWorlds, sandboxWorld } from "./sandbox-world.js";

afterEach(async () => {
  vi.useRealTimers();
  await closeWorlds();
});

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** A fresh `<dir>/.exec/<tag>` base, as the wrapper of a command in the background writes it. */
function freshBase(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-wait-"));
  dirs.push(dir);
  fs.mkdirSync(path.join(dir, ".exec"));
  return path.join(dir, ".exec", "0a1b2c3d4e5f");
}

/** The files a command in the background leaves when it has ended. */
function ended(base: string, out: string, err: string, code: number): void {
  fs.writeFileSync(`${base}.out`, out);
  fs.writeFileSync(`${base}.err`, err);
  fs.writeFileSync(`${base}.exit`, `${code}\n`);
}

function runWait(command: string) {
  const started = Date.now();
  const r = spawnSync("bash", ["-lc", command], { encoding: "utf8", timeout: 20_000 });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, ms: Date.now() - started };
}

/** Lets real I/O (the HTTP hop to the rebuilt sandboxd) run until `cond` holds. */
async function until(cond: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 5000 && !cond(); i++) await new Promise((r) => setImmediate(r));
  expect(cond(), what).toBe(true);
}

/** A fake Docker whose `bash -lc` runs `sleep N` on the faked clock; any other command answers `waited` at once. */
function sleepingWorld() {
  const started: string[] = [];
  return sandboxWorld({
    respond: async (cmd, args) => {
      if (cmd !== "docker" || args[0] !== "exec" || !args.includes("-lc")) return undefined;
      const command = args[args.length - 1];
      started.push(command);
      const sleep = /sleep ([0-9]+);/.exec(command);
      if (sleep && command.includes("timeout -k")) {
        await new Promise((r) => setTimeout(r, Number(sleep[1]) * 1000));
        return { code: 0, stdout: "long\n", stderr: "" };
      }
      return { code: 0, stdout: "waited\n", stderr: "" };
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

/** Starts a 180 s command in the background for account `a` with `key` and returns the answer after EXEC_EARLY_MS. */
async function background(w: Awaited<ReturnType<typeof sleepingWorld>>, a: ReturnType<Awaited<ReturnType<typeof sleepingWorld>>["account"]>, id: string, key: string) {
  const r = track(a.call("POST", `/v1/sandboxes/${id}/exec`, { command: "sleep 180; echo long-180", timeout: 180000 }, { "Idempotency-Key": key }));
  await until(() => w.started.length >= 1, "the command reached sandboxd");
  await vi.advanceTimersByTimeAsync(EXEC_EARLY_MS);
  await until(() => r.done, "answered in the background");
  return r.res!;
}

describe("the answer to a command in the background", () => {
  it("names wait_command, the same as the last line of stdout, and tells the model to call it with exec and no timeout", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const w = await sleepingWorld();
    const a = w.account();
    const id = (await a.call("POST", "/v1/sandboxes", { name: "wait" })).json.id as string;
    const res = await background(w, a, id, "01JC0000000000000000WAIT01");
    expect(res.status).toBe(200);
    expect(res.json.exit_code).toBe(-1);
    const stdout = String(res.json.stdout);
    const lines = stdout.split("\n");
    const wait = res.json.wait_command;
    expect(typeof wait).toBe("string");
    expect(lines[lines.length - 1]).toBe(wait);
    const base = String(res.json.exit_code_file).replace(/\.exit$/, "");
    expect(base).toMatch(/^\/root\/\.exec\/[0-9a-f]{12}$/);
    expect(wait).toBe(waitCommand(base, EXEC_WAIT_S));
    expect(wait).toContain(`[ -f ${base}.exit ]`);
    expect(wait).toContain(`cat ${base}.out`);
    expect(wait).toContain(`cat ${base}.err >&2`);
    expect(wait).not.toContain("\n");
    expect(stdout).toMatch(/call exec with the command on the last line of this answer and no timeout/);
    expect(stdout).toContain(`it waits at most ${EXEC_WAIT_S} seconds`);
    expect(stdout).toMatch(/still running/);
    expect(stdout).toMatch(/Do not start the command again/);
    expect(stdout).not.toMatch(/Read these files later/);
    await vi.advanceTimersByTimeAsync(200_000);
  });

  it("names the same wait_command for a repeat with the same Idempotency-Key, and another one for another key", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const w = await sleepingWorld();
    const a = w.account();
    const id = (await a.call("POST", "/v1/sandboxes", { name: "wait-repeat" })).json.id as string;
    const key = "01JC0000000000000000WAIT02";
    const first = await background(w, a, id, key);
    const again = track(a.call("POST", `/v1/sandboxes/${id}/exec`, { command: "sleep 180; echo long-180", timeout: 180000 }, { "Idempotency-Key": key }));
    await until(() => again.done, "the repeat answered at once");
    expect(again.res!.json.wait_command).toBe(first.json.wait_command);
    expect(String(again.res!.json.stdout).split("\n").pop()).toBe(first.json.wait_command);
    expect(w.started).toHaveLength(1);
    const other = await background(w, a, id, "01JC0000000000000000WAIT03");
    expect(other.json.wait_command).not.toBe(first.json.wait_command);
    await vi.advanceTimersByTimeAsync(200_000);
  });
});

describe("waitCommand in a real bash", () => {
  it("after the end prints the exit code first, then the output, the errors on stderr, and ends with the exit code", () => {
    const base = freshBase();
    ended(base, "line one\nlong-180\n", "warn\n", 3);
    const r = runWait(waitCommand(base, 2));
    expect(r).toMatchObject({
      code: 3,
      stdout: "The command has ended with exit code 3.\nline one\nlong-180\n",
      stderr: "warn\n",
    });
    expect(r.ms).toBeLessThan(1500);
  });

  it("before the end waits at most seconds and says the command is still running, with exit code 0", () => {
    const base = freshBase();
    const r = runWait(waitCommand(base, 2));
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("The command is still running. Run the same command again to wait up to 2 more seconds.\n");
    expect(r.stderr).toBe("");
    // $SECONDS counts whole seconds, so the wait may end up to a second before `seconds`, never after one more round.
    expect(r.ms).toBeGreaterThanOrEqual(1000);
    expect(r.ms).toBeLessThan(4500);
  });

  it("bounds its wait by the clock, not by the number of rounds, when every sleep takes longer than a second", () => {
    const base = freshBase();
    // A sleep that takes 2 s per call, as a slow start of a process in gVisor would stretch each round.
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), "cp-wait-bin-"));
    dirs.push(bin);
    fs.writeFileSync(path.join(bin, "sleep"), "#!/bin/bash\nexec /bin/sleep 2\n", { mode: 0o755 });
    // The time of the wait command itself, taken by bash right before and after it, so the start of node's child and of
    // the shell under the load of a parallel test run does not count.
    const clock = "${EPOCHREALTIME/[.,]/}";
    const r = runWait(`PATH=${bin}:$PATH; t0=${clock}; ${waitCommand(base, 3)}; echo "waited_us=$((${clock} - t0))" >&2`);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("The command is still running. Run the same command again to wait up to 3 more seconds.\n");
    const waited = /^waited_us=([0-9]+)$/m.exec(r.stderr);
    expect(waited, r.stderr).not.toBeNull();
    const ms = Number(waited![1]) / 1000;
    // By the clock it ends at most one round after 3 s, about 4 s; by the number of rounds it would be 6 s.
    expect(ms).toBeGreaterThanOrEqual(2000);
    expect(ms).toBeLessThan(4500);
  });

  it("stops waiting as soon as the command ends", async () => {
    const base = freshBase();
    const started = Date.now();
    const child = spawn("bash", ["-lc", waitCommand(base, 10)]);
    let stdout = "";
    child.stdout.on("data", (d) => (stdout += String(d)));
    const code = new Promise<number | null>((r) => child.on("close", (c) => r(c)));
    await new Promise((r) => setTimeout(r, 1200));
    ended(base, "late\n", "", 0);
    expect(await code).toBe(0);
    expect(stdout).toBe("The command has ended with exit code 0.\nlate\n");
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("passes exit code 124 through when the command was stopped at its timeout", () => {
    const base = freshBase();
    ended(base, "started\n", "", 124);
    const r = runWait(waitCommand(base, 2));
    expect(r.code).toBe(124);
    expect(r.stdout).toBe("The command has ended with exit code 124.\nstarted\n");
  });

  it("works in the rebuilt sandboxd of the harness, which maps /root to the home of the sandbox", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "cp-wait-home-"));
    dirs.push(home);
    fs.mkdirSync(path.join(home, ".exec"));
    ended(path.join(home, ".exec", "t9"), "long-x\n", "", 0);
    const mapped = mapRoot(waitCommand("/root/.exec/t9", 2), home);
    expect(mapped).not.toMatch(/(^|[^A-Za-z0-9_.-])\/root\//);
    const r = runWait(mapped);
    expect(r).toMatchObject({ code: 0, stdout: "The command has ended with exit code 0.\nlong-x\n" });
  });
});

describe("the call of wait_command stays held and under 30 s", () => {
  it("fits EXEC_WAIT_S plus 5 s into EXEC_DEFAULT_MS, and holds the command with EXEC_DEFAULT_MS instead of the background", async () => {
    expect(EXEC_WAIT_S * 1000 + 5000).toBeLessThanOrEqual(EXEC_DEFAULT_MS);
    expect(EXEC_DEFAULT_MS).toBeLessThanOrEqual(EXEC_HOLD_MAX_MS);
    const w = await sleepingWorld();
    const a = w.account();
    const id = (await a.call("POST", "/v1/sandboxes", { name: "wait-held" })).json.id as string;
    const wait = waitCommand("/root/.exec/0a1b2c3d4e5f");
    // The runtime sends no own timeout for this call, and then 30000 ms (EXEC_DEFAULT_MS).
    for (const body of [{ command: wait }, { command: wait, timeout: EXEC_DEFAULT_MS }]) {
      const res = await a.call("POST", `/v1/sandboxes/${id}/exec`, body, { "Idempotency-Key": `01JC000000000000WAITHELD${w.started.length}` });
      expect(res.status).toBe(200);
      expect(res.json).toEqual({ stdout: "waited\n", stderr: "", exit_code: 0 });
      expect(res.json.wait_command).toBeUndefined();
    }
    expect(w.started).toEqual([wait, wait]);
  });
});
