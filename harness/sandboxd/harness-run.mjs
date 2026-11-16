// Docker stand-in for the rebuilt sandboxd of the harness (goals/sandbox/04, Kontext).
//
// The real `createSandboxd` from ops/sandbox/sandboxd.mjs sends every step through an injected `run`. This `run`
// keeps network, image and container of a sandbox only as state and runs what goes through `docker exec <name> ...`
// as a real process in the container of the stand-in: no Docker in Docker, no gVisor, no loop disk. The home of a
// sandbox is the directory sandboxd mounts at /root (`--mount type=bind,src=<mnt>,dst=/root`), so `/root` in the
// arguments of an exec points there. Isolation is not what this proves; sandbox 02 measures it on the real server.
//
// Container start (goals/sandbox/08, point 6): on `docker run`, `docker start` and `docker restart` the stand-in runs the
// autostart part of CONTAINER_CMD as a real process, with /root mapped to the home, so `automaton-supervise` runs here
// when automaton-start has set the mark. The rest of CONTAINER_CMD never runs here: writing /etc/resolv.conf would break
// the DNS of the compose network, and `exec sleep infinity` only keeps a real container alive. `docker stop`, `docker rm`
// and `docker restart` end the processes of that container: every process whose environment holds HOME or
// AUTOMATON_HOME set to the home of the sandbox (the supervisor and the runtime are started in a session of their own by
// setsid, so a process group would miss them). The state file is loaded on start, so after a restart of the container
// sandboxd the stand-in knows its containers again and reconcile brings the supervisors back; `running` from the file is
// only a state, the processes died with that container.

import { spawn as spawnChild } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CONTAINER_CMD, spawnRun } from "../../ops/sandbox/sandboxd.mjs";

const ok = (stdout = "") => ({ code: 0, stdout, stderr: "", timedOut: false });
const fail = (stderr, code = 1) => ({ code, stdout: "", stderr, timedOut: false });

/** `/root` as a path in one argument (a shell command included) to the home of the sandbox. */
export function mapRoot(arg, home) {
  return String(arg).replace(/(^|[\s'"=:;&|(])\/root(?=$|[/\s'"&;|)])/g, (_m, pre) => `${pre}${home}`);
}

const AUTOSTART_RE = /if \[ -f \/root\/\.automaton\/autostart \]; then .+? fi(?=;|$)/;

/**
 * The autostart part of a container command (CONTAINER_CMD of sandboxd): `if [ -f /root/.automaton/autostart ]; then ...
 * fi`, nothing before or after it. Throws when the command has no such part, or when the part would touch resolv.conf or
 * end in `sleep infinity`.
 */
export function autostartCommand(cmd = CONTAINER_CMD) {
  const m = AUTOSTART_RE.exec(String(cmd));
  if (!m || !m[0].includes("automaton-supervise")) {
    throw new Error("harness: the container command has no autostart part (if [ -f /root/.automaton/autostart ]; then ... automaton-supervise ... fi)");
  }
  if (/resolv\.conf|sleep infinity/.test(m[0])) throw new Error("harness: the autostart part of the container command does more than start the supervisor");
  return m[0];
}

/** A home a process may be matched by: absolute and at least two levels deep, never `/` or `/root` itself. */
const usableHome = (home) => typeof home === "string" && path.isAbsolute(home) && path.resolve(home).split("/").filter(Boolean).length >= 2;

/**
 * The pids of the processes of one sandbox in this container: every process whose environment holds `HOME=<home>` or
 * `AUTOMATON_HOME=<home>`. Never this process, never pid 1; processes whose environment cannot be read do not count.
 */
export function processesOfHome(home) {
  if (!usableHome(home)) return [];
  const want = new Set([`HOME=${home}`, `AUTOMATON_HOME=${home}`]);
  let names = [];
  try {
    names = fs.readdirSync("/proc");
  } catch {
    return [];
  }
  const pids = [];
  for (const n of names) {
    if (!/^[0-9]+$/.test(n)) continue;
    const pid = Number(n);
    if (pid === process.pid || pid === 1) continue;
    let environ;
    try {
      environ = fs.readFileSync(`/proc/${n}/environ`, "latin1");
    } catch {
      continue;
    }
    if (environ.split("\0").some((v) => want.has(v))) pids.push(pid);
  }
  return pids;
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ends the processes of one sandbox like `docker stop`: SIGTERM, after graceMs SIGKILL. True when none is left. */
export async function killHome(home, { graceMs = 5000, pollMs = 100 } = {}) {
  const end = Date.now() + graceMs;
  for (;;) {
    const pids = processesOfHome(home);
    if (!pids.length) return true;
    const late = Date.now() >= end;
    for (const pid of pids) {
      try {
        process.kill(pid, late ? "SIGKILL" : "SIGTERM");
      } catch {
        // gone in the meantime
      }
    }
    if (late && Date.now() >= end + 5000) return processesOfHome(home).length === 0;
    await pause(pollMs);
  }
}

/** The state file of an earlier run of the stand-in, or null. */
function loadState(stateFile) {
  if (!stateFile) return null;
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch (e) {
    if (e && e.code === "ENOENT") return null;
    throw e;
  }
  const containers = {};
  for (const [name, c] of Object.entries(raw?.containers ?? {})) {
    if (c && typeof c.home === "string") containers[name] = { home: c.home, running: c.running === true };
  }
  const networks = Array.isArray(raw?.networks) ? raw.networks.filter((n) => typeof n === "string") : [];
  return { containers, networks };
}

/**
 * The `run` for createSandboxd, plus what it holds: `docker()` gives { containers, networks }.
 * `stateFile` (optional) gets the same snapshot after every change, so the harness can read it from outside, and is
 * loaded when it exists. `env` is the environment of the autostart processes (default: this process's), `containerCmd`
 * the command whose autostart part runs on every container start (default: CONTAINER_CMD of sandboxd). `autostarts()`
 * lists every autostart command that ran, as { name, command }.
 */
export function createHarnessRun({ stateFile = null, spawn = spawnRun, env = process.env, containerCmd = CONTAINER_CMD, stopGraceMs = 5000 } = {}) {
  const autostart = autostartCommand(containerCmd);
  const loaded = loadState(stateFile);
  const containers = loaded?.containers ?? {}; // name -> { home, running }
  const networks = new Set(loaded?.networks ?? []);
  const autostarts = [];

  const snapshot = () => ({ containers: JSON.parse(JSON.stringify(containers)), networks: [...networks].sort() });
  const persist = () => {
    if (!stateFile) return;
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    const tmp = `${stateFile}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, `${JSON.stringify(snapshot(), null, 2)}\n`);
    fs.renameSync(tmp, stateFile);
  };
  persist();

  /** Removes everything inside dir, keeps dir: what is left of a mount point after umount. */
  const emptyDir = (dir) => {
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      return false;
    }
    for (const n of names) fs.rmSync(path.join(dir, n), { recursive: true, force: true });
    return true;
  };

  /** Runs the autostart part for one container and waits for its shell; what it starts in the background stays. */
  function launch(name) {
    const c = containers[name];
    const command = mapRoot(autostart, c.home);
    autostarts.push({ name, command });
    return new Promise((resolve) => {
      let child;
      try {
        child = spawnChild("bash", ["-c", command], {
          cwd: fs.existsSync(c.home) ? c.home : "/",
          env,
          detached: true,
          stdio: "ignore",
        });
      } catch {
        resolve();
        return;
      }
      child.once("error", () => resolve());
      // Not unref'd: reconcile awaits this before the API listens, and an unref'd child leaves nothing that keeps the event
      // loop alive, so node would end quietly in the middle of the start after a restart of the container sandboxd. What the
      // shell starts in the background is in a session of its own (setsid) and outlives it either way.
      child.once("exit", () => resolve());
    });
  }

  const endProcesses = (name) => killHome(containers[name].home, { graceMs: stopGraceMs });

  async function docker(args, opts) {
    const [sub, ...rest] = args;
    const last = rest[rest.length - 1];
    if (sub === "network") {
      const [op] = rest;
      if (op === "create") {
        if (networks.has(last)) return fail(`network with name ${last} already exists`);
        networks.add(last);
        persist();
        return ok(`${last}\n`);
      }
      if (op === "rm") {
        if (!networks.delete(last)) return fail(`network ${last} not found`);
        persist();
        return ok(`${last}\n`);
      }
      if (op === "ls") return ok([...networks].map((n) => `${n}\n`).join(""));
      return fail(`harness: docker network ${op} not supported`, 125);
    }
    if (sub === "run") {
      const name = rest[rest.indexOf("--name") + 1];
      const mount = rest[rest.indexOf("--mount") + 1] ?? "";
      const home = /(?:^|,)src=([^,]+)/.exec(mount)?.[1];
      if (!name || !home) return fail("harness: docker run needs --name and --mount src=", 125);
      if (containers[name]) return fail(`container name ${name} is already in use`, 125);
      containers[name] = { home, running: true };
      persist();
      await launch(name);
      return ok(`${name}\n`);
    }
    if (sub === "rm") {
      if (!containers[last]) return fail(`No such container: ${last}`);
      await endProcesses(last);
      delete containers[last];
      persist();
      return ok(`${last}\n`);
    }
    if (sub === "ps") return ok(Object.keys(containers).map((n) => `${n}\n`).join(""));
    if (sub === "stop" || sub === "start" || sub === "restart") {
      const c = containers[last];
      if (!c) return fail(`No such container: ${last}`);
      if (sub !== "start") await endProcesses(last);
      // A start of a container that runs is a no-op, unless its processes are gone (a restart of sandboxd's container).
      const start = sub === "restart" || (sub === "start" && (!c.running || processesOfHome(c.home).length === 0));
      c.running = sub !== "stop";
      persist();
      if (start) await launch(last);
      return ok(`${last}\n`);
    }
    if (sub === "exec") {
      const i = rest[0] === "-i" ? 1 : 0;
      const name = rest[i];
      const c = containers[name];
      if (!c) return fail(`Error response from daemon: No such container: ${name}`);
      if (!c.running) return fail(`Error response from daemon: container ${name} is not running`, 126);
      const argv = rest.slice(i + 1).map((a) => mapRoot(a, c.home));
      return spawn(argv[0], argv.slice(1), { input: i ? opts.input : undefined, timeoutMs: opts.timeoutMs });
    }
    // inspect stays unanswered: only the port proxy of sandboxd asks for it, and the harness starts no proxy; it checks
    // expose and remove of a port through the API (harness/e2e/sandbox-walk.mjs), never traffic through the public URL.
    return fail(`harness: docker ${sub} not supported`, 125);
  }

  async function run(cmd, args, opts = {}) {
    const last = args[args.length - 1];
    switch (cmd) {
      // The disk image: the harness keeps a plain directory instead of a loop-mounted ext4 file.
      case "truncate":
      case "mkfs.ext4":
      case "mount":
        return ok();
      case "rm":
        // only `rm -f <disks>/<id>.img`, which never exists here
        return ok();
      case "mkdir":
        fs.mkdirSync(last, { recursive: true });
        return ok();
      case "mountpoint":
        return fs.existsSync(last) ? ok() : fail(`${last} is not a mountpoint`, 32);
      case "umount":
        return emptyDir(last) ? ok() : fail(`umount: ${last}: not mounted`, 32);
      case "rmdir":
        try {
          fs.rmdirSync(last);
          return ok();
        } catch (e) {
          return fail(`rmdir: ${e?.code ?? e}`);
        }
      case "docker":
        return docker(args, opts);
      default:
        return fail(`harness: ${cmd} not supported`, 127);
    }
  }

  return { run, docker: snapshot, autostarts: () => autostarts.map((a) => ({ ...a })) };
}
