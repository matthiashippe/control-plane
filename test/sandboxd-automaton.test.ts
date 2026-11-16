/**
 * sandboxd for a whole automaton in a sandbox (goals/sandbox/08, points 1 and 2), against a fake `run`: no Docker, no
 * network beyond 127.0.0.1 on port 0.
 *
 * CONTAINER_CMD starts automaton-supervise after every container start when the mark /root/.automaton/autostart exists
 * (run here with bash in a temp directory that stands in for /root, with a stub automaton-supervise on PATH); a sandbox
 * with keep_running is skipped by the sweep for idle and for max-runtime; reconcile starts it again after a restart of the
 * host with the same CONTAINER_CMD. The two scripts of the image run against stubs of the runtime and of the setup.
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CONTAINER_CMD, createSandboxd, dockerRunArgs, loadConfig, memoryState, signRequest, TIERS } from "../ops/sandbox/sandboxd.mjs";

const T0 = 1762992000 * 1000;
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const IMAGE_DIR = path.join(__dirname, "..", "ops", "sandbox", "image");
const START = path.join(IMAGE_DIR, "automaton-start");
const SUPERVISE = path.join(IMAGE_DIR, "automaton-supervise");

type RunResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean };

const servers: http.Server[] = [];
const dirs: string[] = [];
const children: { kill: () => void }[] = [];

afterEach(async () => {
  for (const c of children.splice(0)) c.kill();
  for (const s of servers.splice(0)) await new Promise((r) => s.close(() => r(undefined)));
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tmp(prefix: string) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  dirs.push(d);
  return d;
}

/** bash with argv and env, stdout and exit code; killed after timeoutMs. */
function bash(args: string[], env: Record<string, string>, timeoutMs = 20_000) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn("bash", args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (c: string) => (stdout += c));
    child.stderr.setEncoding("utf8").on("data", (c: string) => (stderr += c));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function waitFor(check: () => boolean, ms = 10_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return check();
}

/** A stub automaton-supervise on PATH that writes AUTOMATON_HOME and HOME into $SUPERVISE_SEEN. */
function stubSupervise(dir: string) {
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, "automaton-supervise"), '#!/usr/bin/env bash\necho "home=${AUTOMATON_HOME:-} cwd=$PWD" >> "$SUPERVISE_SEEN"\n', { mode: 0o755 });
  return bin;
}

async function listen(handler: http.RequestListener): Promise<number> {
  const s = http.createServer(handler);
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  return (s.address() as AddressInfo).port;
}

async function setup(initial?: { sandboxes: Record<string, unknown> }) {
  const calls: { cmd: string; args: string[] }[] = [];
  const clock = { t: T0 };
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const state = memoryState(initial);
  const run = async (cmd: string, args: string[]): Promise<RunResult> => {
    calls.push({ cmd, args });
    return { code: 0, stdout: "", stderr: "", timedOut: false };
  };
  const d = createSandboxd({
    run, now: () => clock.t, keys: [publicKey], state,
    config: { slots: 10, disksDir: "/d", mntDir: "/m", image: "sandboxd-base:2", domain: "example.dev" }, log: () => {},
  });
  const port = await listen(d.handleApi);
  async function call(method: string, target: string, payload?: unknown) {
    const body = payload === undefined ? undefined : JSON.stringify(payload);
    const h = signRequest(privateKey, method, target, Math.floor(clock.t / 1000), body);
    const r = await fetch(`http://127.0.0.1:${port}${target}`, { method, headers: { "content-type": "application/json", ...h }, body });
    clock.t += 1000;
    return { status: r.status, json: (await r.json()) as any };
  }
  const dockerCalls = (sub: string) => calls.filter((c) => c.cmd === "docker" && c.args[0] === sub);
  return { d, calls, clock, state, call, dockerCalls };
}

/** CONTAINER_CMD as the container would run it, with /root, /etc/resolv.conf and sleep infinity moved into dir. */
function localContainerCmd(cmd: string, home: string, dir: string) {
  return cmd
    .replace(/(^|[\s'"=:;&|(])\/root(?=$|[/\s'"&;|)])/g, (_m, pre) => `${pre}${home}`)
    .replace("/etc/resolv.conf", path.join(dir, "resolv.conf"))
    .replace("exec sleep infinity", "wait; exec true");
}

describe("CONTAINER_CMD: automaton-supervise after every container start", () => {
  it("is the command of dockerRunArgs, keeps resolv.conf and sleep infinity, and names the autostart mark", () => {
    const a = dockerRunArgs({ id: "abcdefghij", owner: "acct-a", tier: TIERS[0], mnt: "/m/abcdefghij", image: "sandboxd-base:2" });
    expect(a.slice(-4)).toEqual(["sandboxd-base:2", "bash", "-c", CONTAINER_CMD]);
    expect(CONTAINER_CMD.startsWith('printf "nameserver 1.1.1.1\\nnameserver 9.9.9.9\\n" > /etc/resolv.conf; ')).toBe(true);
    expect(CONTAINER_CMD.endsWith("; exec sleep infinity")).toBe(true);
    expect(CONTAINER_CMD).toContain("/root/.automaton/autostart");
    expect(CONTAINER_CMD).toContain("automaton-supervise");
    // /root stands only after a blank or =, where the harness maps it (mapRoot in harness/sandboxd/harness-run.mjs)
    for (const m of CONTAINER_CMD.matchAll(/\/root/g)) expect([" ", "="]).toContain(CONTAINER_CMD[m.index! - 1]);
  });

  it("parses as bash", async () => {
    const r = await bash(["-n", "-c", CONTAINER_CMD], {});
    expect(r.code, r.stderr).toBe(0);
  });

  it("starts automaton-supervise with AUTOMATON_HOME when the autostart mark exists", async () => {
    const dir = tmp("sandboxd-cmd-on-");
    const home = path.join(dir, "home");
    fs.mkdirSync(path.join(home, ".automaton"), { recursive: true });
    fs.writeFileSync(path.join(home, ".automaton", "autostart"), "");
    const seen = path.join(dir, "seen");
    const bin = stubSupervise(dir);
    const r = await bash(["-c", localContainerCmd(CONTAINER_CMD, home, dir)], { PATH: `${bin}:${process.env.PATH}`, SUPERVISE_SEEN: seen });
    expect(r.code, r.stderr).toBe(0);
    expect(fs.readFileSync(path.join(dir, "resolv.conf"), "utf8")).toBe("nameserver 1.1.1.1\nnameserver 9.9.9.9\n");
    expect(await waitFor(() => fs.existsSync(seen))).toBe(true);
    expect(fs.readFileSync(seen, "utf8")).toContain(`home=${home} `);
  });

  it("starts nothing without the autostart mark, as before", async () => {
    const dir = tmp("sandboxd-cmd-off-");
    const home = path.join(dir, "home");
    fs.mkdirSync(path.join(home, ".automaton"), { recursive: true });
    const seen = path.join(dir, "seen");
    const bin = stubSupervise(dir);
    const r = await bash(["-c", localContainerCmd(CONTAINER_CMD, home, dir)], { PATH: `${bin}:${process.env.PATH}`, SUPERVISE_SEEN: seen });
    expect(r.code, r.stderr).toBe(0);
    expect(fs.readFileSync(path.join(dir, "resolv.conf"), "utf8")).toBe("nameserver 1.1.1.1\nnameserver 9.9.9.9\n");
    await new Promise((res) => setTimeout(res, 500));
    expect(fs.existsSync(seen)).toBe(false);
  });
});

describe("keep_running: no stop for idle or max-runtime", () => {
  it("keeps a sandbox with keep_running running after 25 hours without a call and after 31 days", async () => {
    const s = await setup();
    const r = await s.call("POST", "/v1/sandboxes", { owner: "acct-a", keep_running: true });
    expect(r.status).toBe(201);
    expect(r.json.keep_running).toBe(true);
    const id = r.json.id;
    expect(s.state.snapshot().sandboxes[id].keep_running).toBe(true);
    s.clock.t += 25 * HOUR;
    expect(await s.d.sweep()).toEqual([]);
    s.clock.t += 31 * DAY;
    expect(await s.d.sweep()).toEqual([]);
    expect(s.dockerCalls("stop")).toHaveLength(0);
    expect(s.d.sandboxes()[id].status).toBe("running");
    expect((await s.call("GET", `/v1/sandboxes/${id}`)).json.keep_running).toBe(true);
  });

  it("stops a sandbox without keep_running for idle after 25 hours and for max-runtime after 31 days", async () => {
    const s = await setup();
    const idle = (await s.call("POST", "/v1/sandboxes", { owner: "acct-a" })).json;
    expect(idle.keep_running).toBe(false);
    const busy = (await s.call("POST", "/v1/sandboxes", { owner: "acct-b", keep_running: false })).json;
    await s.call("POST", `/v1/sandboxes/${busy.id}/ports/expose`, { port: 8080 });
    s.clock.t += 25 * HOUR;
    expect(await s.d.sweep()).toEqual([{ id: idle.id, action: "stop", reason: "idle" }]);
    s.clock.t += 30 * DAY;
    // the idle one, stopped for more than 7 days by now, expires in the same sweep
    expect(await s.d.sweep()).toEqual([
      { id: idle.id, action: "delete", reason: "expired" },
      { id: busy.id, action: "stop", reason: "max-runtime" },
    ]);
    expect(s.d.sandboxes()[busy.id].status).toBe("stopped");
  });

  it("treats a sandbox from an older state without the field like before", async () => {
    const t = new Date(T0).toISOString();
    const old = {
      id: "oldsandbox", owner: "acct-a", name: null, tier: "small", vcpu: 1, memory_mb: 512, disk_gb: 5, pids: 256, slots: 1,
      status: "running", created_at: t, started_at: t, stopped_at: null, last_activity: t, ports: [],
    };
    const s = await setup({ sandboxes: { oldsandbox: old } });
    expect((await s.call("GET", "/v1/sandboxes/oldsandbox")).json.keep_running).toBe(false);
    s.clock.t += 25 * HOUR;
    expect(await s.d.sweep()).toEqual([{ id: "oldsandbox", action: "stop", reason: "idle" }]);
  });

  it("answers 400 when keep_running is not a boolean and runs nothing", async () => {
    const s = await setup();
    for (const v of ["yes", 1, 0, null, "true", {}, []]) {
      const r = await s.call("POST", "/v1/sandboxes", { owner: "acct-a", keep_running: v });
      expect(r.status, JSON.stringify(v)).toBe(400);
      expect(r.json.error).toMatch(/keep_running/);
    }
    expect(s.calls).toHaveLength(0);
    expect(s.state.snapshot().sandboxes).toEqual({});
  });
});

describe("reconcile after a restart of the host", () => {
  it("starts a sandbox with keep_running again, with CONTAINER_CMD in its run call", async () => {
    const s = await setup();
    const id = (await s.call("POST", "/v1/sandboxes", { owner: "acct-a", keep_running: true })).json.id;
    const runCall = s.dockerCalls("run")[0];
    expect(runCall.args.slice(-3)).toEqual(["bash", "-c", CONTAINER_CMD]);
    expect(runCall.args.at(-1)).toContain("automaton-supervise");
    s.clock.t += 40 * DAY;
    for (const mounted of [false, true]) {
      const lines: string[] = [];
      const d2 = createSandboxd({
        run: async (cmd: string, args: string[]) => {
          lines.push([cmd, ...args].join(" "));
          if (args[0] === "ps" || args[0] === "network") return { code: 0, stdout: `sbx-${id}\n`, stderr: "", timedOut: false };
          return { code: cmd === "mountpoint" && !mounted ? 1 : 0, stdout: "", stderr: "", timedOut: false };
        },
        now: () => s.clock.t, keys: [], state: memoryState(s.state.snapshot()), config: { disksDir: "/d", mntDir: "/m" }, log: () => {},
      });
      expect(await d2.reconcile()).toEqual([]);
      expect(lines).toContain(`docker ${mounted ? "start" : "restart"} sbx-${id}`);
      expect(lines).not.toContain(`docker rm -f sbx-${id}`);
      expect(await d2.sweep()).toEqual([]);
      expect(d2.sandboxes()[id]).toMatchObject({ status: "running", keep_running: true });
    }
  });
});

describe("image sandboxd-base:2", () => {
  it("is the default image of loadConfig", () => {
    expect(loadConfig({}).image).toBe("sandboxd-base:2");
    expect(loadConfig({ SANDBOXD_IMAGE: "x:1" }).image).toBe("x:1");
  });
});

describe("automaton-start", () => {
  /** A home, a stub of setup-headless.mjs that writes automaton.json (or fails with SETUP_FAIL=1), and a stub supervisor. */
  function world() {
    const dir = tmp("automaton-start-");
    const home = path.join(dir, "home");
    fs.mkdirSync(home);
    const js = path.join(dir, "setup-headless.mjs");
    fs.writeFileSync(js, [
      'import fs from "node:fs";',
      'if (process.env.SETUP_FAIL === "1") { console.error("setup broke"); process.exit(1); }',
      'const setup = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));',
      'fs.mkdirSync(process.env.HOME + "/.automaton", { recursive: true });',
      'fs.writeFileSync(process.env.HOME + "/.automaton/automaton.json", JSON.stringify({ name: setup.name }));',
      'fs.writeFileSync(process.env.HOME + "/.automaton/config.json", JSON.stringify({ apiKey: setup.conwayApiKey }));',
      'console.log("wallet created: 0x" + "ab".repeat(20));',
    ].join("\n"));
    const seen = path.join(dir, "seen");
    const env = { PATH: `${stubSupervise(dir)}:${process.env.PATH}`, AUTOMATON_HOME: home, AUTOMATON_SETUP_JS: js, SUPERVISE_SEEN: seen };
    return { dir, home, env, seen, setupFile: path.join(home, ".automaton-setup.json") };
  }
  const SECRET = "cnwy_k_test_secret_value";

  it("sets up once, removes the setup file, sets the autostart mark and starts automaton-supervise", async () => {
    const w = world();
    fs.writeFileSync(w.setupFile, JSON.stringify({ name: "a1", conwayApiKey: SECRET }));
    const r = await bash([START], w.env);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout.trim().split("\n").at(-1)).toBe("AUTOMATON_START ok");
    expect(r.stdout + r.stderr).not.toContain(SECRET);
    expect(r.stdout + r.stderr).not.toMatch(/0x[0-9a-f]{40}/);
    expect(fs.existsSync(w.setupFile)).toBe(false);
    expect(fs.existsSync(path.join(w.home, ".automaton", "autostart"))).toBe(true);
    expect(await waitFor(() => fs.existsSync(w.seen))).toBe(true);
    expect(fs.readFileSync(w.seen, "utf8")).toContain(`home=${w.home} `);
    // a second start with automaton.json in place needs no setup file
    const again = await bash([START], w.env);
    expect(again.stdout.trim()).toBe("AUTOMATON_START ok");
  });

  it("fails without a setup file and without automaton.json", async () => {
    const w = world();
    const r = await bash([START], w.env);
    expect(r.code).toBe(1);
    expect(r.stdout.trim()).toBe("AUTOMATON_START FAIL no setup file");
    expect(fs.existsSync(path.join(w.home, ".automaton", "autostart"))).toBe(false);
  });

  it("reports a failed setup, removes the setup file anyway and sets no mark", async () => {
    const w = world();
    const file = path.join(w.dir, "custom-setup.json");
    fs.writeFileSync(file, JSON.stringify({ name: "a1", conwayApiKey: SECRET }));
    const r = await bash([START, file], { ...w.env, SETUP_FAIL: "1" });
    expect(r.code).not.toBe(0);
    expect(r.stdout.trim().split("\n").at(-1)).toBe("AUTOMATON_START FAIL setup");
    expect(r.stdout + r.stderr).not.toContain(SECRET);
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.existsSync(path.join(w.home, ".automaton", "autostart"))).toBe(false);
    await new Promise((res) => setTimeout(res, 300));
    expect(fs.existsSync(w.seen)).toBe(false);
  });
});

describe("automaton-supervise", () => {
  /** A home with the autostart mark and a stub runtime that counts its runs, exits 3 and removes the mark on run `stopAt`. */
  function world(stopAt: number) {
    const dir = tmp("automaton-supervise-");
    const home = path.join(dir, "home");
    fs.mkdirSync(path.join(home, ".automaton"), { recursive: true });
    fs.writeFileSync(path.join(home, ".automaton", "autostart"), "");
    const rt = path.join(dir, "runtime");
    fs.mkdirSync(path.join(rt, "dist"), { recursive: true });
    fs.writeFileSync(path.join(rt, "dist", "index.js"), [
      'const fs = require("node:fs");',
      'const f = process.env.HOME + "/runs";',
      'const n = (fs.existsSync(f) ? Number(fs.readFileSync(f, "utf8")) : 0) + 1;',
      "fs.writeFileSync(f, String(n));",
      'console.log(`run ${n} ${process.argv.slice(2).join(" ")} cwd=${process.cwd()} home=${process.env.HOME}`);',
      `if (n >= ${stopAt}) fs.rmSync(process.env.HOME + "/.automaton/autostart");`,
      "process.exit(3);",
    ].join("\n"));
    const env = { PATH: `/usr/bin:${process.env.PATH}`, AUTOMATON_HOME: home, AUTOMATON_RUNTIME_DIR: rt, AUTOMATON_RESTART_S: "0" };
    return { home, rt, env, log: path.join(home, ".automaton", "run.log") };
  }

  it("restarts the runtime after every end with a log line and stops when the autostart mark is gone", async () => {
    const w = world(3);
    const r = await bash([SUPERVISE], w.env);
    expect(r.code, r.stderr).toBe(0);
    const log = fs.readFileSync(w.log, "utf8");
    expect(log.match(/^run \d+ --run cwd=.* home=.*$/gm)).toEqual([1, 2, 3].map((n) => `run ${n} --run cwd=${w.rt} home=${w.home}`));
    expect(log.match(/^automaton-supervise: runtime exited with 3, restart in 0 s$/gm)).toHaveLength(3);
    expect(fs.existsSync(path.join(w.home, ".automaton", "supervise.pid"))).toBe(false);
  });

  it("cuts a run.log over 10 MB to its last 5 MB before a start", async () => {
    const w = world(1);
    const big = Buffer.alloc(10485760 + 10, "a");
    big.write("TAIL", big.length - 4);
    fs.writeFileSync(w.log, big);
    const r = await bash([SUPERVISE], w.env);
    expect(r.code, r.stderr).toBe(0);
    const log = fs.readFileSync(w.log, "utf8");
    expect(log.length).toBeLessThan(5242880 + 1000);
    expect(log.length).toBeGreaterThan(5242880);
    expect(log.slice(5242880 - 4, 5242880)).toBe("TAIL");
    expect(log).toContain("run 1 --run");
  });

  it("runs at most once per sandbox: a living supervisor in the pidfile wins, a stale pid does not", async () => {
    const w = world(1);
    const other = spawn("bash", ["-c", "exec -a automaton-supervise sleep 30"], { stdio: "ignore" });
    children.push({ kill: () => other.kill("SIGKILL") });
    await waitFor(() => fs.existsSync(`/proc/${other.pid}/cmdline`) && fs.readFileSync(`/proc/${other.pid}/cmdline`, "utf8").includes("automaton-supervise"));
    const pidfile = path.join(w.home, ".automaton", "supervise.pid");
    fs.writeFileSync(pidfile, `${other.pid}\n`);
    const r = await bash([SUPERVISE], w.env);
    expect(r.code).toBe(0);
    expect(fs.existsSync(w.log)).toBe(false);
    // a pid that lives but is no supervisor (after a container restart pids repeat) does not hold the place
    fs.writeFileSync(pidfile, `${process.pid}\n`);
    const r2 = await bash([SUPERVISE], w.env);
    expect(r2.code).toBe(0);
    expect(fs.readFileSync(w.log, "utf8")).toContain("run 1 --run");
  });
});
