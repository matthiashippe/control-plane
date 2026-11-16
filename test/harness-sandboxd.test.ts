/**
 * The rebuilt sandboxd of the harness (harness/sandboxd/, goals/sandbox/04): the real `createSandboxd` of
 * ops/sandbox/sandboxd.mjs with the Docker stand-in of harness/sandboxd/harness-run.mjs, started in this process on
 * 127.0.0.1 port 0. The control plane's side is the real one: the key pair `loadOrCreateClientKey` writes on the first
 * start of cp (sandbox-client.key and sandbox-client.pub) and the signed client of src/sandbox/client.ts. Commands run
 * for real, as processes; the home of a sandbox is a directory under the mount dir of the stand-in.
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CLIENT_PUB_FILE, SandboxdUnavailable, createSandboxdClient, loadOrCreateClientKey } from "../src/sandbox/client.js";
import { CONTAINER_CMD, createSandboxd } from "../ops/sandbox/sandboxd.mjs";
import { createSandboxd as harnessCreateSandboxd, startHarnessSandboxd } from "../harness/sandboxd/start.mjs";
import { autostartCommand, createHarnessRun, mapRoot, processesOfHome } from "../harness/sandboxd/harness-run.mjs";

const stops: Array<() => Promise<void>> = [];
const dirs: string[] = [];

afterEach(async () => {
  for (const s of stops.splice(0)) await s();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

async function harness(opts: { withKey?: boolean } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-sandboxd-"));
  dirs.push(root);
  const data = path.join(root, "cp-data");
  fs.mkdirSync(data);
  // What cp does on its first start (src/index.ts): the key pair next to the database.
  const key = opts.withKey === false ? null : loadOrCreateClientKey(data);
  const s = await startHarnessSandboxd({
    host: "127.0.0.1",
    port: 0,
    keysDir: data,
    stateFile: path.join(root, "state.json"),
    dockerStateFile: path.join(root, "docker.json"),
    mntDir: path.join(root, "mnt"),
    disksDir: path.join(root, "disks"),
    log: () => {},
  });
  stops.push(s.close);
  const client = key ? createSandboxdClient({ baseUrl: s.url, privateKey: key.privateKey, timeoutMs: 15_000 }) : null;
  return { root, data, key, client, ...s };
}

describe("harness sandboxd: the real daemon with a Docker stand-in", () => {
  it("is the createSandboxd of ops/sandbox/sandboxd.mjs, not a copy", () => {
    expect(harnessCreateSandboxd).toBe(createSandboxd);
  });

  it("reads the public key cp wrote as sandbox-client.pub and refuses everything else with 401", async () => {
    const h = await harness();
    expect(CLIENT_PUB_FILE).toBe("sandbox-client.pub");
    expect(fs.existsSync(path.join(h.data, "sandbox-client.pub"))).toBe(true);

    const unsigned = await fetch(`${h.url}/v1/sandboxes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ owner: "o-test" }),
    });
    expect(unsigned.status).toBe(401);

    const other = crypto.generateKeyPairSync("ed25519").privateKey;
    const stranger = createSandboxdClient({ baseUrl: h.url, privateKey: other, timeoutMs: 15_000 });
    const refused = await stranger.request("POST", "/v1/sandboxes", { owner: "o-test" }).catch((e) => e);
    expect(refused).toBeInstanceOf(SandboxdUnavailable);
    expect((refused as SandboxdUnavailable).reason).toContain("401");

    expect(h.docker()).toEqual({ containers: {}, networks: [] });
    expect(Object.keys(h.d.sandboxes())).toHaveLength(0);
    const ok = await h.client!.request("GET", "/v1/sandboxes");
    expect(ok).toEqual({ status: 200, body: { sandboxes: [] } });
  });

  it("loads the keys on every request, so a key cp writes after the start counts at once", async () => {
    const h = await harness({ withKey: false });
    const key = crypto.generateKeyPairSync("ed25519");
    const client = createSandboxdClient({ baseUrl: h.url, privateKey: key.privateKey, timeoutMs: 15_000 });
    await expect(client.request("GET", "/v1/sandboxes")).rejects.toBeInstanceOf(SandboxdUnavailable);
    fs.writeFileSync(path.join(h.data, "sandbox-client.pub"), key.publicKey.export({ type: "spki", format: "pem" }));
    expect((await client.request("GET", "/v1/sandboxes")).status).toBe(200);
  });

  it("creates, runs echo ok for real, writes and reads a file, and after DELETE has no sandbox left", async () => {
    const h = await harness();
    const c = h.client!;
    const created = await c.request("POST", "/v1/sandboxes", { owner: "o-test", name: "walk-1", memory_mb: 512, vcpu: 1, disk_gb: 5 });
    expect(created.status).toBe(201);
    const id = String(created.body.id);
    expect(id).toMatch(/^[a-z0-9]{10}$/);
    expect(created.body).toMatchObject({ status: "running", tier: "small", owner: "o-test" });
    const home = path.join(h.root, "mnt", id);
    expect(h.docker().containers).toEqual({ [`sbx-${id}`]: { home, running: true } });
    expect(h.docker().networks).toEqual([`sbx-${id}`]);

    const echo = await c.request("POST", `/v1/sandboxes/${id}/exec`, { command: "echo ok", timeout: 30000 });
    expect(echo).toEqual({ status: 200, body: { stdout: "ok\n", stderr: "", exit_code: 0 } });
    // A real process: its exit code and its working directory, the home of this sandbox where the runtime says /root.
    const where = await c.request("POST", `/v1/sandboxes/${id}/exec`, { command: "cd /root && pwd && exit 3" });
    expect(where.body).toMatchObject({ stdout: `${home}\n`, exit_code: 3 });

    const text = `harness-${crypto.randomBytes(6).toString("hex")}\nline two\n`;
    const up = await c.request("POST", `/v1/sandboxes/${id}/files/upload/json`, { path: "/root/notes/walk.txt", content: text });
    expect(up).toEqual({ status: 200, body: { ok: true } });
    expect(fs.readFileSync(path.join(home, "notes", "walk.txt"), "utf8")).toBe(text);
    const read = await c.request("GET", `/v1/sandboxes/${id}/files/read?path=${encodeURIComponent("/root/notes/walk.txt")}`);
    expect(read).toEqual({ status: 200, body: { content: text } });
    const missing = await c.request("GET", `/v1/sandboxes/${id}/files/read?path=${encodeURIComponent("/root/nothing.txt")}`);
    expect(missing.status).toBe(404);

    const listed = await c.request("GET", "/v1/sandboxes");
    expect((listed.body.sandboxes as Array<{ id: string }>).map((s) => s.id)).toEqual([id]);

    const del = await c.request("DELETE", `/v1/sandboxes/${id}`);
    expect(del).toEqual({ status: 200, body: { ok: true, id } });
    expect(await c.request("GET", "/v1/sandboxes")).toEqual({ status: 200, body: { sandboxes: [] } });
    expect((await c.request("POST", `/v1/sandboxes/${id}/exec`, { command: "echo ok" })).status).toBe(404);
    expect(h.docker()).toEqual({ containers: {}, networks: [] });
    expect(fs.existsSync(home)).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(h.root, "state.json"), "utf8"))).toEqual({ sandboxes: {} });
    expect(JSON.parse(fs.readFileSync(path.join(h.root, "docker.json"), "utf8"))).toEqual({ containers: {}, networks: [] });
  });

  it("maps /root in arguments and shell commands to the home of the sandbox and nothing else", () => {
    expect(mapRoot("/root/x.txt", "/h/a")).toBe("/h/a/x.txt");
    expect(mapRoot("/root", "/h/a")).toBe("/h/a");
    expect(mapRoot("cd /root && echo ok", "/h/a")).toBe("cd /h/a && echo ok");
    expect(mapRoot("cat '/root/a b'", "/h/a")).toBe("cat '/h/a/a b'");
    expect(mapRoot("/rootfs/x", "/h/a")).toBe("/rootfs/x");
    expect(mapRoot("/srv/root/x", "/h/a")).toBe("/srv/root/x");
  });
});

// ---- the autostart of CONTAINER_CMD in the stand-in (goals/sandbox/08, point 6)

/** A stub automaton-supervise in a PATH of its own: one line `<pid> <AUTOMATON_HOME>` per start, then it sleeps. */
function stubPath(root: string): string {
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(
    path.join(bin, "automaton-supervise"),
    '#!/usr/bin/env bash\necho "$$ $AUTOMATON_HOME" >> "$AUTOMATON_HOME/supervise.started"\nexec sleep 300\n',
    { mode: 0o755 },
  );
  return `${bin}:${process.env.PATH}`;
}

/** The pids the stub wrote, in order. */
function starts(home: string): Array<{ pid: number; home: string }> {
  let text = "";
  try {
    text = fs.readFileSync(path.join(home, "supervise.started"), "utf8");
  } catch {
    return [];
  }
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => ({ pid: Number(l.split(" ")[0]), home: l.slice(l.indexOf(" ") + 1) }));
}

/** Alive and not a zombie. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  try {
    return !/^\d+ \(.*\) Z/.test(fs.readFileSync(`/proc/${pid}/stat`, "utf8"));
  } catch {
    return false;
  }
}

async function until(f: () => boolean, ms = 5000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (f()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return f();
}

const homes: string[] = [];
afterEach(() => {
  // Whatever a failed case left running: only processes whose environment names one of this file's homes.
  for (const h of homes.splice(0)) for (const pid of processesOfHome(h)) process.kill(pid, "SIGKILL");
});

function standIn() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-run-"));
  dirs.push(root);
  const home = path.join(root, "mnt", "abcde12345");
  fs.mkdirSync(home, { recursive: true });
  homes.push(home);
  const env = { ...process.env, PATH: stubPath(root) };
  const stateFile = path.join(root, "docker.json");
  const name = "sbx-abcde12345";
  const runArgs = ["run", "-d", "--name", name, "--mount", `type=bind,src=${home},dst=/root`, "img", "bash", "-c", CONTAINER_CMD];
  const mark = () => {
    fs.mkdirSync(path.join(home, ".automaton"), { recursive: true });
    fs.writeFileSync(path.join(home, ".automaton", "autostart"), "");
  };
  return { root, home, env, stateFile, name, runArgs, mark };
}

describe("harness sandboxd: CONTAINER_CMD's autostart as a real process", () => {
  it("cuts exactly the autostart part out of CONTAINER_CMD, never resolv.conf and never sleep infinity", () => {
    const part = autostartCommand(CONTAINER_CMD);
    expect(CONTAINER_CMD).toContain(part);
    expect(part).toMatch(/^if \[ -f \/root\/\.automaton\/autostart \]; then .*automaton-supervise.* fi$/);
    expect(part).not.toContain("resolv.conf");
    expect(part).not.toContain("sleep infinity");
    const before = 'printf "nameserver 1.1.1.1\\n" > /etc/resolv.conf; exec sleep infinity';
    expect(() => autostartCommand(before)).toThrow(/autostart/);
    expect(() => createHarnessRun({ containerCmd: before })).toThrow(/autostart/);
  });

  it("starts the supervisor on docker run, start and restart when the mark is there, and stop and rm end it", async () => {
    const s = standIn();
    s.mark();
    const h = createHarnessRun({ stateFile: s.stateFile, env: s.env });
    expect((await h.run("docker", s.runArgs)).code).toBe(0);
    expect(await until(() => starts(s.home).length === 1)).toBe(true);
    const [first] = starts(s.home);
    expect(first.home).toBe(s.home);
    expect(await until(() => alive(first.pid))).toBe(true);
    expect(processesOfHome(s.home)).toContain(first.pid);

    expect((await h.run("docker", ["stop", s.name])).code).toBe(0);
    expect(await until(() => !alive(first.pid))).toBe(true);
    expect(processesOfHome(s.home)).toEqual([]);
    expect(h.docker().containers[s.name]).toEqual({ home: s.home, running: false });

    expect((await h.run("docker", ["start", s.name])).code).toBe(0);
    expect(await until(() => starts(s.home).length === 2)).toBe(true);
    const second = starts(s.home)[1];
    expect(await until(() => alive(second.pid))).toBe(true);
    // A start of a running container with its supervisor alive starts no second one.
    expect((await h.run("docker", ["start", s.name])).code).toBe(0);
    await new Promise((r) => setTimeout(r, 300));
    expect(starts(s.home)).toHaveLength(2);

    expect((await h.run("docker", ["restart", s.name])).code).toBe(0);
    expect(await until(() => starts(s.home).length === 3)).toBe(true);
    expect(await until(() => !alive(second.pid))).toBe(true);
    const third = starts(s.home)[2];
    expect(await until(() => alive(third.pid))).toBe(true);

    expect((await h.run("docker", ["rm", "-f", s.name])).code).toBe(0);
    expect(await until(() => !alive(third.pid))).toBe(true);
    expect(processesOfHome(s.home)).toEqual([]);
    expect(h.docker()).toEqual({ containers: {}, networks: [] });
  });

  it("starts nothing without the mark", async () => {
    const s = standIn();
    const h = createHarnessRun({ stateFile: s.stateFile, env: s.env });
    expect((await h.run("docker", s.runArgs)).code).toBe(0);
    expect((await h.run("docker", ["restart", s.name])).code).toBe(0);
    await new Promise((r) => setTimeout(r, 300));
    expect(starts(s.home)).toEqual([]);
    expect(processesOfHome(s.home)).toEqual([]);
  });

  it("runs only the autostart part, with /root mapped to the home, and never the line that writes resolv.conf", async () => {
    const s = standIn();
    s.mark();
    const h = createHarnessRun({ stateFile: s.stateFile, env: s.env });
    await h.run("docker", s.runArgs);
    await h.run("docker", ["restart", s.name]);
    const ran = h.autostarts();
    expect(ran).toHaveLength(2);
    for (const r of ran) {
      expect(r).toEqual({ name: s.name, command: mapRoot(autostartCommand(CONTAINER_CMD), s.home) });
      expect(r.command).not.toContain("resolv.conf");
      expect(r.command).not.toContain("sleep infinity");
      expect(r.command).not.toMatch(/(^|[\s=])\/root(\/|\s|$)/);
    }
    await h.run("docker", ["rm", "-f", s.name]);
  });

  it("loads its state file, so a new stand-in knows the containers and starts the supervisor again on docker start", async () => {
    const s = standIn();
    s.mark();
    const first = createHarnessRun({ stateFile: s.stateFile, env: s.env });
    await first.run("docker", ["network", "create", "--label", "sandboxd=1", s.name]);
    await first.run("docker", s.runArgs);
    expect(await until(() => starts(s.home).length === 1)).toBe(true);
    // What a restart of the container sandboxd does to the processes in it.
    for (const pid of processesOfHome(s.home)) process.kill(pid, "SIGKILL");
    expect(await until(() => processesOfHome(s.home).length === 0)).toBe(true);

    const second = createHarnessRun({ stateFile: s.stateFile, env: s.env });
    expect(second.docker()).toEqual({ containers: { [s.name]: { home: s.home, running: true } }, networks: [s.name] });
    expect((await second.run("docker", ["ps", "-a", "--filter", "label=sandboxd=1", "--format", "{{.Names}}"])).stdout).toBe(`${s.name}\n`);
    expect((await second.run("docker", ["start", s.name])).code).toBe(0);
    expect(await until(() => starts(s.home).length === 2)).toBe(true);
    expect(await until(() => alive(starts(s.home)[1].pid))).toBe(true);
    await second.run("docker", ["rm", "-f", s.name]);
    expect(processesOfHome(s.home)).toEqual([]);
  });

  it("after a restart of the rebuilt sandboxd, reconcile starts the supervisor of a running sandbox with the mark", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-sandboxd-"));
    dirs.push(root);
    const data = path.join(root, "cp-data");
    fs.mkdirSync(data);
    const key = loadOrCreateClientKey(data);
    const env = { ...process.env, PATH: stubPath(root) };
    const opts = {
      host: "127.0.0.1",
      port: 0,
      keysDir: data,
      stateFile: path.join(root, "state.json"),
      dockerStateFile: path.join(root, "docker.json"),
      mntDir: path.join(root, "mnt"),
      disksDir: path.join(root, "disks"),
      env,
      log: () => {},
    };
    const s1 = await startHarnessSandboxd(opts);
    const c1 = createSandboxdClient({ baseUrl: s1.url, privateKey: key.privateKey, timeoutMs: 15_000 });
    const created = await c1.request("POST", "/v1/sandboxes", { owner: "o-test", keep_running: true });
    expect(created.status).toBe(201);
    const id = String(created.body.id);
    const home = path.join(root, "mnt", id);
    homes.push(home);
    // automaton-start sets the mark; at the create there was none, so nothing runs yet.
    expect((await c1.request("POST", `/v1/sandboxes/${id}/exec`, { command: "mkdir -p /root/.automaton && touch /root/.automaton/autostart" })).body).toMatchObject({ exit_code: 0 });
    expect(starts(home)).toEqual([]);
    await s1.close();

    const s2 = await startHarnessSandboxd(opts);
    stops.push(s2.close);
    expect(s2.docker().containers).toEqual({ [`sbx-${id}`]: { home, running: true } });
    expect(await until(() => starts(home).length === 1)).toBe(true);
    expect(starts(home)[0].home).toBe(home);
    expect(await until(() => alive(starts(home)[0].pid))).toBe(true);

    const c2 = createSandboxdClient({ baseUrl: s2.url, privateKey: key.privateKey, timeoutMs: 15_000 });
    expect((await c2.request("DELETE", `/v1/sandboxes/${id}`)).status).toBe(200);
    expect(processesOfHome(home)).toEqual([]);
    expect(s2.docker()).toEqual({ containers: {}, networks: [] });
  });
});

describe("harness sandboxd: a restart of its container, as its own node process", () => {
  it("comes up again with a running sandbox with the mark and starts its supervisor, instead of ending quietly", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-sandboxd-"));
    dirs.push(root);
    const data = path.join(root, "cp-data");
    fs.mkdirSync(data);
    const key = loadOrCreateClientKey(data);
    const files = {
      keysDir: data,
      stateFile: path.join(root, "state.json"),
      dockerStateFile: path.join(root, "docker.json"),
      mntDir: path.join(root, "mnt"),
      disksDir: path.join(root, "disks"),
    };
    // The first life of the container: one sandbox with keep_running and the mark automaton-start sets.
    const s1 = await startHarnessSandboxd({ host: "127.0.0.1", port: 0, ...files, env: { ...process.env, PATH: stubPath(root) }, log: () => {} });
    const c1 = createSandboxdClient({ baseUrl: s1.url, privateKey: key.privateKey, timeoutMs: 15_000 });
    const created = await c1.request("POST", "/v1/sandboxes", { owner: "o-test", keep_running: true });
    const id = String(created.body.id);
    const home = path.join(files.mntDir, id);
    homes.push(home);
    await c1.request("POST", `/v1/sandboxes/${id}/exec`, { command: "mkdir -p /root/.automaton && touch /root/.automaton/autostart" });
    await s1.close();

    // The second life: start.mjs as the container runs it, with nothing else in its event loop before the API listens.
    const child = spawn(process.execPath, [path.resolve("harness/sandboxd/start.mjs")], {
      env: {
        ...process.env,
        PATH: stubPath(root),
        SANDBOXD_HOST: "127.0.0.1",
        SANDBOXD_API_PORT: "0",
        SANDBOXD_KEYS_DIR: files.keysDir,
        SANDBOXD_STATE: files.stateFile,
        SANDBOXD_DOCKER_STATE: files.dockerStateFile,
        SANDBOXD_MNT: files.mntDir,
        SANDBOXD_DISKS: files.disksDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let exited: number | null = null;
    child.stdout.on("data", (b) => (out += String(b)));
    child.stderr.on("data", (b) => (out += String(b)));
    child.on("exit", (code) => (exited = code ?? -1));
    stops.push(async () => {
      if (exited === null) child.kill("SIGKILL");
    });
    const up = await until(() => /api on 127\.0\.0\.1:[0-9]+/.test(out) || exited !== null, 20_000);
    expect(up).toBe(true);
    expect(exited, out).toBeNull();
    expect(out).toMatch(/api on 127\.0\.0\.1:[0-9]+/);
    expect(await until(() => starts(home).length === 1)).toBe(true);
    child.kill("SIGTERM");
    expect(await until(() => exited !== null, 10_000)).toBe(true);
  }, 40_000);
});
