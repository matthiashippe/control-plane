// Docker stand-in for the rebuilt sandboxd of the harness (goals/sandbox/04, Kontext).
//
// The real `createSandboxd` from ops/sandbox/sandboxd.mjs sends every step through an injected `run`. This `run`
// keeps network, image and container of a sandbox only as state and runs what goes through `docker exec <name> ...`
// as a real process in the container of the stand-in: no Docker in Docker, no gVisor, no loop disk. The home of a
// sandbox is the directory sandboxd mounts at /root (`--mount type=bind,src=<mnt>,dst=/root`), so `/root` in the
// arguments of an exec points there. Isolation is not what this proves; sandbox 02 measures it on the real server.

import fs from "node:fs";
import path from "node:path";
import { spawnRun } from "../../ops/sandbox/sandboxd.mjs";

const ok = (stdout = "") => ({ code: 0, stdout, stderr: "", timedOut: false });
const fail = (stderr, code = 1) => ({ code, stdout: "", stderr, timedOut: false });

/** `/root` as a path in one argument (a shell command included) to the home of the sandbox. */
export function mapRoot(arg, home) {
  return String(arg).replace(/(^|[\s'"=:;&|(])\/root(?=$|[/\s'"&;|)])/g, (_m, pre) => `${pre}${home}`);
}

/**
 * The `run` for createSandboxd, plus what it holds: `docker()` gives { containers, networks }.
 * `stateFile` (optional) gets the same snapshot after every change, so the harness can read it from outside.
 */
export function createHarnessRun({ stateFile = null, spawn = spawnRun } = {}) {
  const containers = {}; // name -> { home, running }
  const networks = new Set();

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

  function docker(args, opts) {
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
      return ok(`${name}\n`);
    }
    if (sub === "rm") {
      if (!containers[last]) return fail(`No such container: ${last}`);
      delete containers[last];
      persist();
      return ok(`${last}\n`);
    }
    if (sub === "ps") return ok(Object.keys(containers).map((n) => `${n}\n`).join(""));
    if (sub === "stop" || sub === "start" || sub === "restart") {
      if (!containers[last]) return fail(`No such container: ${last}`);
      containers[last].running = sub !== "stop";
      persist();
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
    // inspect (the port proxy) stays unanswered: ports are not exposed (sandbox 03, port_exposure_unavailable).
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

  return { run, docker: snapshot };
}
