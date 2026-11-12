/**
 * sandboxd against a fake `run`: no Docker, no network beyond 127.0.0.1 on port 0.
 *
 * Covers the signature format of docs/sandbox/plan.md (section Verbindung, including the worked
 * example printed there), the docker argv that carries the limits of section Grenzen and the
 * network rules of section Netz, the exec and file paths of docs/sandbox/vertrag.md, the proxy,
 * and the sweep with a settable clock.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  EXEC_MAX_MS,
  bodyHash,
  canonicalMessage,
  createFileState,
  createSandboxd,
  loadKeys,
  memoryState,
  parseProxyHost,
  privateKeyFromSeed,
  publicKeyFromRaw,
  signRequest,
  spawnRun,
} from "../ops/sandbox/sandboxd.mjs";

const T0 = 1762992000 * 1000;
const HOUR = 3600_000;
const DAY = 24 * HOUR;

type RunResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean };
type Call = { cmd: string; args: string[]; input?: string; timeoutMs?: number };
type Responder = (cmd: string, args: string[]) => Partial<RunResult> | Promise<Partial<RunResult>> | undefined;

const servers: http.Server[] = [];
const dirs: string[] = [];

afterEach(async () => {
  for (const s of servers.splice(0)) await new Promise((r) => s.close(() => r(undefined)));
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

async function listen(handler: http.RequestListener): Promise<number> {
  const s = http.createServer(handler);
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  return (s.address() as AddressInfo).port;
}

async function setup(opts: { respond?: Responder; slots?: number } = {}) {
  const calls: Call[] = [];
  const clock = { t: T0 };
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const state = memoryState();
  const run = async (cmd: string, args: string[], o: { input?: string; timeoutMs?: number } = {}) => {
    calls.push({ cmd, args, input: o.input, timeoutMs: o.timeoutMs });
    const r = (await opts.respond?.(cmd, args)) ?? {};
    return { code: 0, stdout: "", stderr: "", timedOut: false, ...r };
  };
  const d = createSandboxd({
    run,
    now: () => clock.t,
    keys: [publicKey],
    state,
    config: { slots: opts.slots ?? 10, disksDir: "/d", mntDir: "/m", image: "sandboxd-base:1", domain: "postyourprice.com" },
    log: () => {},
  });
  const apiPort = await listen(d.handleApi);
  const proxyPort = await listen(d.handleProxy);

  async function raw(method: string, target: string, body: string | undefined, headers: Record<string, string>) {
    const r = await fetch(`http://127.0.0.1:${apiPort}${target}`, { method, headers: { "content-type": "application/json", ...headers }, body });
    const text = await r.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: r.status, json };
  }
  async function call(method: string, target: string, payload?: unknown, extra: Record<string, string> = {}) {
    const body = payload === undefined ? undefined : JSON.stringify(payload);
    const h = signRequest(privateKey, method, target, Math.floor(clock.t / 1000), body);
    const r = await raw(method, target, body, { ...h, ...extra });
    // Ed25519 is deterministic: the same request in the same second would be a replay, so time moves on.
    clock.t += 1000;
    return r;
  }
  async function make(owner = "acct-a", extra: Record<string, unknown> = {}) {
    const r = await call("POST", "/v1/sandboxes", { owner, ...extra });
    return r;
  }
  async function proxy(host: string, target = "/", init: { method?: string; body?: string } = {}) {
    return new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port: proxyPort, method: init.method ?? "GET", path: target, headers: { host } }, (res) => {
        const parts: Buffer[] = [];
        res.on("data", (c) => parts.push(c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(parts).toString("utf8") }));
      });
      req.on("error", reject);
      req.end(init.body);
    });
  }
  const dockerCalls = (sub: string) => calls.filter((c) => c.cmd === "docker" && c.args[0] === sub);
  return { d, calls, clock, privateKey, publicKey, state, raw, call, make, proxy, dockerCalls };
}

// ---- signature

describe("signature and timestamp", () => {
  it("accepts a valid signature and answers healthz unsigned", async () => {
    const s = await setup();
    expect((await s.call("GET", "/v1/sandboxes")).status).toBe(200);
    const h = await fetch(`http://127.0.0.1:${(servers[0].address() as AddressInfo).port}/healthz`);
    expect(h.status).toBe(200);
    expect(await h.text()).toBe("ok");
  });

  it("rejects missing signature headers with 401 and a JSON error", async () => {
    const s = await setup();
    const r = await s.raw("GET", "/v1/sandboxes", undefined, {});
    expect(r.status).toBe(401);
    expect(typeof r.json.error).toBe("string");
  });

  it("rejects a tampered body", async () => {
    const s = await setup();
    const ts = Math.floor(s.clock.t / 1000);
    const h = signRequest(s.privateKey, "POST", "/v1/sandboxes", ts, JSON.stringify({ owner: "acct-a" }));
    const r = await s.raw("POST", "/v1/sandboxes", JSON.stringify({ owner: "acct-b" }), h);
    expect(r.status).toBe(401);
    expect(s.calls).toHaveLength(0);
  });

  it("rejects a tampered path and a tampered query", async () => {
    const s = await setup();
    const ts = Math.floor(s.clock.t / 1000);
    const h = signRequest(s.privateKey, "GET", "/v1/sandboxes?owner=acct-a", ts, undefined);
    expect((await s.raw("GET", "/v1/sandboxes?owner=acct-b", undefined, h)).status).toBe(401);
    const h2 = signRequest(s.privateKey, "GET", "/v1/sandboxes", ts + 1, undefined);
    expect((await s.raw("GET", "/v1/sandboxes/abcdefghij", undefined, h2)).status).toBe(401);
  });

  it("rejects a signature from an unknown key", async () => {
    const s = await setup();
    const other = crypto.generateKeyPairSync("ed25519").privateKey;
    const h = signRequest(other, "GET", "/v1/sandboxes", Math.floor(s.clock.t / 1000), undefined);
    const r = await s.raw("GET", "/v1/sandboxes", undefined, h);
    expect(r.status).toBe(401);
    expect(r.json.error).toMatch(/signature/);
  });

  it("rejects a timestamp 61 s off in either direction and accepts 59 s", async () => {
    const s = await setup();
    const now = Math.floor(s.clock.t / 1000);
    for (const [delta, status] of [[61, 401], [-61, 401], [59, 200], [-59, 200]] as const) {
      const h = signRequest(s.privateKey, "GET", "/v1/sandboxes", now + delta, undefined);
      const r = await s.raw("GET", "/v1/sandboxes", undefined, h);
      expect(r.status, `delta ${delta}`).toBe(status);
      if (status === 401) expect(r.json.error).toMatch(/timestamp/);
    }
  });

  it("rejects a replay of the same signature within 300 s", async () => {
    const s = await setup();
    const h = signRequest(s.privateKey, "GET", "/v1/sandboxes", Math.floor(s.clock.t / 1000), undefined);
    expect((await s.raw("GET", "/v1/sandboxes", undefined, h)).status).toBe(200);
    s.clock.t += 30_000;
    const again = await s.raw("GET", "/v1/sandboxes", undefined, h);
    expect(again.status).toBe(401);
    expect(again.json.error).toMatch(/replay/);
  });

  it("rejects a re-encoded copy of an accepted signature (replay bypass)", async () => {
    const s = await setup();
    const h = signRequest(s.privateKey, "GET", "/v1/sandboxes", Math.floor(s.clock.t / 1000), undefined);
    expect((await s.raw("GET", "/v1/sandboxes", undefined, h)).status).toBe(200);
    const unpadded = { ...h, "X-CP-Signature": h["X-CP-Signature"].replace(/=+$/, "") };
    expect((await s.raw("GET", "/v1/sandboxes", undefined, unpadded)).status).toBe(401);
  });

  it("builds the canonical message from four lines with the body hash", () => {
    expect(bodyHash(undefined)).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(canonicalMessage("get", "/v1/sandboxes?owner=x", "5", "")).toBe(
      "GET\n/v1/sandboxes?owner=x\n5\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("reproduces the worked example in docs/sandbox/plan.md and the verifier accepts it", async () => {
    const plan = fs.readFileSync(path.join(process.cwd(), "docs", "sandbox", "plan.md"), "utf8");
    const section = plan.split(/^## /m).find((p) => p.startsWith("Verbindung"));
    expect(section, "plan.md has a section ## Verbindung").toBeTruthy();
    expect(section).toMatch(/X-CP-Timestamp/);
    expect(section).toMatch(/X-CP-Signature/);
    const block = [...section!.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1]).find((b) => /^seed: /m.test(b));
    expect(block, "fenced block with seed: in plan.md").toBeTruthy();
    const ex = Object.fromEntries(
      block!.trim().split("\n").map((l) => {
        const i = l.indexOf(": ");
        return [l.slice(0, i), l.slice(i + 2)];
      }),
    ) as Record<string, string>;
    const key = privateKeyFromSeed(ex.seed);
    const derivedPublic = crypto.createPublicKey(key).export({ format: "der", type: "spki" }).toString("hex").slice(-64);
    expect(derivedPublic).toBe(ex.public);
    expect(bodyHash(ex.body)).toBe(ex.bodyhash);
    const message = canonicalMessage(ex.method, ex.path, ex.timestamp, ex.body);
    expect(section).toContain("```\n" + message + "\n```");
    const headers = signRequest(key, ex.method, ex.path, ex.timestamp, ex.body);
    expect(headers["X-CP-Timestamp"]).toBe(ex.timestamp);
    expect(headers["X-CP-Signature"]).toBe(ex.signature);

    const d = createSandboxd({
      run: async () => ({ code: 0, stdout: "", stderr: "", timedOut: false }),
      now: () => Number(ex.timestamp) * 1000,
      keys: [publicKeyFromRaw(ex.public)],
      state: memoryState(),
      log: () => {},
    });
    const port = await listen(d.handleApi);
    const r = await fetch(`http://127.0.0.1:${port}${ex.path}`, { method: ex.method, headers: { ...headers }, body: ex.body });
    expect(r.status).toBe(201);
  });

  it("loads only ed25519 public keys from the keys dir", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sandboxd-keys-"));
    dirs.push(dir);
    const { publicKey } = crypto.generateKeyPairSync("ed25519");
    fs.writeFileSync(path.join(dir, "probe.pub"), publicKey.export({ format: "pem", type: "spki" }));
    fs.writeFileSync(path.join(dir, "junk.pub"), "not a key");
    fs.writeFileSync(path.join(dir, "ignored.txt"), publicKey.export({ format: "pem", type: "spki" }));
    const keys = loadKeys(dir);
    expect(keys).toHaveLength(1);
    expect(keys[0].asymmetricKeyType).toBe("ed25519");
  });
});

// ---- create: limits and network

describe("create: runsc, memory, pids, dns, bridge and no publish", () => {
  it("creates a small sandbox with the docker args of the plan", async () => {
    const s = await setup();
    const r = await s.make("acct-a");
    expect(r.status).toBe(201);
    const id: string = r.json.id;
    expect(id).toMatch(/^[a-z0-9]{10}$/);
    expect(`sbx-${id}`.length).toBeLessThanOrEqual(15);
    expect(r.json).toMatchObject({ status: "running", vcpu: 1, memory_mb: 512, disk_gb: 5, terminal_url: null, created_at: new Date(T0).toISOString() });

    const order = s.calls.map((c) => (c.cmd === "docker" ? `docker ${c.args[0]}${c.args[0] === "network" ? ` ${c.args[1]}` : ""}` : c.cmd));
    expect(order).toEqual(["truncate", "mkfs.ext4", "mkdir", "mount", "docker network create", "docker run"]);
    expect(s.calls[0].args).toEqual(["-s", "5G", `/d/${id}.img`]);
    expect(s.calls[1].args).toEqual(["-q", "-F", `/d/${id}.img`]);
    expect(s.calls[2].args).toEqual(["-p", `/m/${id}`]);
    expect(s.calls[3].args).toEqual(["-o", "loop", `/d/${id}.img`, `/m/${id}`]);

    const netArgs = s.calls[4].args;
    expect(netArgs).toEqual(expect.arrayContaining(["--driver", "bridge", `com.docker.network.bridge.name=sbx-${id}`, "com.docker.network.bridge.enable_icc=false"]));
    expect(netArgs.at(-1)).toBe(`sbx-${id}`);

    const a = s.dockerCalls("run")[0].args;
    const pair = (flag: string, value: string) => a.some((x, i) => x === flag && a[i + 1] === value);
    expect(a).toContain("--runtime=runsc");
    expect(pair("--memory", "512m")).toBe(true);
    expect(pair("--memory-swap", "512m")).toBe(true);
    expect(pair("--pids-limit", "256")).toBe(true);
    expect(pair("--cpus", "1")).toBe(true);
    expect(pair("--security-opt", "no-new-privileges")).toBe(true);
    expect(pair("--cap-drop", "ALL")).toBe(true);
    expect(pair("--dns", "1.1.1.1")).toBe(true);
    expect(pair("--dns", "9.9.9.9")).toBe(true);
    expect(pair("--cgroup-parent", "sandbox.slice")).toBe(true);
    expect(pair("--network", `sbx-${id}`)).toBe(true);
    expect(pair("--mount", `type=bind,src=/m/${id},dst=/root`)).toBe(true);
    expect(pair("--label", "sandboxd.owner=acct-a")).toBe(true);
    const added = a.flatMap((x, i) => (x === "--cap-add" ? [a[i + 1]] : []));
    expect(added.sort()).toEqual(["CHOWN", "DAC_OVERRIDE", "FOWNER", "FSETID", "KILL", "SETGID", "SETUID"]);
    expect(pair("--restart", "unless-stopped")).toBe(true);
    // embedded docker dns does not answer under runsc, so the container writes its own resolv.conf
    expect(a.slice(-4)).toEqual(["sandboxd-base:1", "bash", "-c", 'printf "nameserver 1.1.1.1\\nnameserver 9.9.9.9\\n" > /etc/resolv.conf; exec sleep infinity']);
    // never publish a port, never privileged, never the host network or the docker socket
    for (const bad of ["-p", "--publish", "--publish-all", "-P", "--privileged"]) expect(a).not.toContain(bad);
    expect(a.join(" ")).not.toMatch(/--network[ =]host|docker\.sock|--publish/);

    const listed = await s.call("GET", "/v1/sandboxes?owner=acct-a");
    expect(listed.json.sandboxes.map((x: any) => x.id)).toEqual([id]);
    expect((await s.call("GET", "/v1/sandboxes?owner=acct-b")).json.sandboxes).toEqual([]);
    expect((await s.call("GET", `/v1/sandboxes/${id}`)).json.id).toBe(id);
    expect((await s.call("GET", "/v1/sandboxes/zzzzzzzzzz")).status).toBe(404);
    expect(s.state.snapshot().sandboxes[id].status).toBe("running");
  });

  it("creates a medium sandbox with 1024m memory, 512 pids and 10G disk", async () => {
    const s = await setup();
    const r = await s.make("acct-a", { memory_mb: 1024 });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ memory_mb: 1024, vcpu: 1, disk_gb: 10 });
    expect(s.calls[0].args).toEqual(["-s", "10G", `/d/${r.json.id}.img`]);
    const a = s.dockerCalls("run")[0].args;
    const pair = (flag: string, value: string) => a.some((x, i) => x === flag && a[i + 1] === value);
    expect(pair("--memory", "1024m")).toBe(true);
    expect(pair("--memory-swap", "1024m")).toBe(true);
    expect(pair("--pids-limit", "512")).toBe(true);
  });

  it("answers 400 with the tiers for memory over 1024 and without owner", async () => {
    const s = await setup();
    const big = await s.make("acct-a", { memory_mb: 2048 });
    expect(big.status).toBe(400);
    expect(big.json.error).toMatch(/small/);
    expect(big.json.error).toMatch(/medium/);
    expect((await s.call("POST", "/v1/sandboxes", { memory_mb: 512 })).status).toBe(400);
    expect((await s.make("acct a; rm -rf /")).status).toBe(400);
    expect((await s.make("acct-a", { name: "$(id)" })).status).toBe(400);
    expect(s.calls).toHaveLength(0);
  });
});

describe("slots", () => {
  it("answers 409 for a third small sandbox of one owner and frees the slot on stop", async () => {
    const s = await setup();
    const a = await s.make("acct-a");
    expect(a.status).toBe(201);
    expect((await s.make("acct-a")).status).toBe(201);
    expect((await s.make("acct-a")).status).toBe(409);
    expect((await s.make("acct-a", { memory_mb: 1024 })).status).toBe(409);
    expect((await s.make("acct-b")).status).toBe(201);
    expect((await s.call("POST", `/v1/sandboxes/${a.json.id}/stop`)).status).toBe(200);
    expect((await s.make("acct-a")).status).toBe(201);
    // the stopped one cannot start again while the owner holds two slots
    expect((await s.call("POST", `/v1/sandboxes/${a.json.id}/start`)).status).toBe(409);
  });

  it("answers 503 when the host slots are full", async () => {
    const s = await setup({ slots: 3 });
    expect((await s.make("acct-a", { memory_mb: 1024 })).status).toBe(201);
    expect((await s.make("acct-b")).status).toBe(201);
    const full = await s.make("acct-c");
    expect(full.status).toBe(503);
    expect(full.json.error).toMatch(/slots/);
  });

  it("rolls back on a failed docker run and answers 500", async () => {
    const s = await setup({ respond: (cmd, args) => (cmd === "docker" && args[0] === "run" ? { code: 125, stderr: "boom" } : undefined) });
    const r = await s.make("acct-a");
    expect(r.status).toBe(500);
    const runAt = s.calls.findIndex((c) => c.cmd === "docker" && c.args[0] === "run");
    const after = s.calls.slice(runAt + 1).map((c) => [c.cmd, ...c.args].join(" "));
    const id = s.calls[0].args[2].replace(/^\/d\/|\.img$/g, "");
    expect(after).toEqual([`docker rm -f sbx-${id}`, `docker network rm sbx-${id}`, `umount /m/${id}`, `rmdir /m/${id}`, `rm -f /d/${id}.img`]);
    expect(s.state.snapshot().sandboxes).toEqual({});
    // the failed create holds no slot
    expect((await s.call("GET", "/v1/sandboxes")).json.sandboxes).toEqual([]);
  });

  it("rolls back only what was done when mount fails", async () => {
    const s = await setup({ respond: (cmd) => (cmd === "mount" ? { code: 32 } : undefined) });
    expect((await s.make("acct-a")).status).toBe(500);
    const cmds = s.calls.map((c) => c.cmd);
    expect(cmds).not.toContain("docker");
    expect(cmds.slice(-3)).toEqual(["umount", "rmdir", "rm"]);
  });
});

// ---- exec and files

describe("exec-timeout and idempotent exec", () => {
  it("caps the exec-timeout at 600000 ms and answers 124 on a timeout", async () => {
    const s = await setup({ respond: (cmd, args) => (args[0] === "exec" && args.at(-1) === "sleep 999" ? { code: null, stdout: "partial", timedOut: true } : { stdout: "hi\n" }) });
    const id = (await s.make()).json.id;
    const r = await s.call("POST", `/v1/sandboxes/${id}/exec`, { command: "sleep 999", timeout: 9_999_999 });
    expect(r.status).toBe(200);
    expect(r.json.exit_code).toBe(124);
    expect(r.json.stderr).toMatch(/timed out/);
    const ex = s.dockerCalls("exec");
    expect(ex[0].args).toEqual(["exec", `sbx-${id}`, "bash", "-lc", "sleep 999"]);
    expect(ex[0].timeoutMs).toBe(EXEC_MAX_MS);
    expect(EXEC_MAX_MS).toBe(600_000);
    const ok = await s.call("POST", `/v1/sandboxes/${id}/exec`, { command: "echo hi" });
    expect(ok.json).toEqual({ stdout: "hi\n", stderr: "", exit_code: 0 });
    expect(s.dockerCalls("exec")[1].timeoutMs).toBe(30_000);
  });

  it("runs an exec with the same Idempotency-Key once, also while it still runs", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    let n = 0;
    const s = await setup({
      respond: async (cmd, args) => {
        if (args[0] !== "exec") return undefined;
        n += 1;
        await gate;
        return { stdout: `run ${n}\n`, code: 3 };
      },
    });
    const id = (await s.make()).json.id;
    const key = { "Idempotency-Key": "01JXAMPLEULID" };
    const first = s.call("POST", `/v1/sandboxes/${id}/exec`, { command: "make" }, key);
    await new Promise((r) => setTimeout(r, 50));
    s.clock.t += 1000;
    const second = s.call("POST", `/v1/sandboxes/${id}/exec`, { command: "make" }, key);
    await new Promise((r) => setTimeout(r, 50));
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a.json).toEqual({ stdout: "run 1\n", stderr: "", exit_code: 3 });
    expect(b.json).toEqual(a.json);
    s.clock.t += 9 * 60_000;
    expect((await s.call("POST", `/v1/sandboxes/${id}/exec`, { command: "make" }, key)).json).toEqual(a.json);
    expect(s.dockerCalls("exec")).toHaveLength(1);
    s.clock.t += 2 * 60_000;
    await s.call("POST", `/v1/sandboxes/${id}/exec`, { command: "make" }, key);
    expect(s.dockerCalls("exec")).toHaveLength(2);
  });

  it("answers 409 for exec on a stopped sandbox", async () => {
    const s = await setup();
    const id = (await s.make()).json.id;
    await s.call("POST", `/v1/sandboxes/${id}/stop`);
    // status comes from state, not from docker (the container restarts itself unless stopped)
    expect((await s.call("GET", `/v1/sandboxes/${id}`)).json.status).toBe("stopped");
    expect(s.dockerCalls("inspect")).toHaveLength(0);
    expect((await s.call("POST", `/v1/sandboxes/${id}/exec`, { command: "true" })).status).toBe(409);
    expect(s.dockerCalls("exec")).toHaveLength(0);
  });
});

describe("files", () => {
  it("uploads through docker exec -i with the content on stdin and a path under /root", async () => {
    const s = await setup();
    const id = (await s.make()).json.id;
    const r = await s.call("POST", `/v1/sandboxes/${id}/files/upload/json`, { path: "app/main.js", content: "console.log(1)\n" });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true });
    const up = s.dockerCalls("exec")[0];
    expect(up.args).toEqual(["exec", "-i", `sbx-${id}`, "sh", "-c", 'mkdir -p "$(dirname "$1")" && cat > "$1"', "sh", "/root/app/main.js"]);
    expect(up.input).toBe("console.log(1)\n");
    await s.call("POST", `/v1/sandboxes/${id}/files/upload/json`, { path: "/tmp/x", content: "" });
    expect(s.dockerCalls("exec")[1].args.at(-1)).toBe("/tmp/x");
  });

  it("reads through docker exec cat and answers 404 when cat fails", async () => {
    const s = await setup({ respond: (cmd, args) => (args[0] === "exec" && args.at(-1) === "/root/missing" ? { code: 1, stderr: "No such file" } : args[0] === "exec" ? { stdout: "hello" } : undefined) });
    const id = (await s.make()).json.id;
    const r = await s.call("GET", `/v1/sandboxes/${id}/files/read?path=${encodeURIComponent("notes/a b.txt")}`);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ content: "hello" });
    expect(s.dockerCalls("exec")[0].args).toEqual(["exec", `sbx-${id}`, "cat", "--", "/root/notes/a b.txt"]);
    expect((await s.call("GET", `/v1/sandboxes/${id}/files/read?path=missing`)).status).toBe(404);
  });
});

// ---- ports and proxy

describe("expose and proxy", () => {
  it("answers expose with the public_url and removes the port again", async () => {
    const s = await setup();
    const id = (await s.make()).json.id;
    const r = await s.call("POST", `/v1/sandboxes/${id}/ports/expose`, { port: 3000 });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ port: 3000, public_url: `https://sbx-${id}-3000.postyourprice.com` });
    expect((await s.call("POST", `/v1/sandboxes/${id}/ports/expose`, { port: 70000 })).status).toBe(400);
    expect((await s.call("DELETE", `/v1/sandboxes/${id}/ports/3000`)).status).toBe(200);
    expect(s.d.sandboxes()[id].ports).toEqual([]);
  });

  it("parses the proxy host case-insensitive and strips the port", () => {
    expect(parseProxyHost("SBX-abcdefghij-8080.PostYourPrice.com:443", "postyourprice.com")).toEqual({ id: "abcdefghij", port: 8080 });
    expect(parseProxyHost("sbx-abcdefghij-0.postyourprice.com", "postyourprice.com")).toBeNull();
    expect(parseProxyHost("sbx-abcdefghij-65536.postyourprice.com", "postyourprice.com")).toBeNull();
    expect(parseProxyHost("sbx-abcdefghij-80.evil.com", "postyourprice.com")).toBeNull();
    expect(parseProxyHost("sbx-abcdefghij-80xpostyourprice.com", "postyourprice.com")).toBeNull();
    expect(parseProxyHost("x.sbx-abcdefghij-80.postyourprice.com", "postyourprice.com")).toBeNull();
    expect(parseProxyHost(undefined, "postyourprice.com")).toBeNull();
  });

  it("answers 404 for an unknown host and for an unexposed port, proxies an exposed one, 502 when upstream is down", async () => {
    const seen: { method?: string; url?: string; body?: string; host?: string }[] = [];
    const upstreamPort = await listen((req, res) => {
      const parts: Buffer[] = [];
      req.on("data", (c) => parts.push(c));
      req.on("end", () => {
        seen.push({ method: req.method, url: req.url, body: Buffer.concat(parts).toString(), host: req.headers.host });
        res.writeHead(201, { "x-up": "1" });
        res.end("from sandbox");
      });
    });
    const s = await setup({ respond: (cmd, args) => (args[0] === "inspect" ? { stdout: "127.0.0.1\n" } : undefined) });
    const id = (await s.make()).json.id;
    const host = `sbx-${id}-${upstreamPort}.postyourprice.com`;

    const unknown = await s.proxy(`sbx-zzzzzzzzzz-${upstreamPort}.postyourprice.com`);
    expect(unknown).toEqual({ status: 404, body: "not found" });
    expect((await s.proxy("postyourprice.com")).status).toBe(404);
    expect(await s.proxy(host)).toEqual({ status: 404, body: "not found" });

    await s.call("POST", `/v1/sandboxes/${id}/ports/expose`, { port: upstreamPort });
    const ok = await s.proxy(host.toUpperCase() + ":443", "/api?x=1", { method: "POST", body: "payload" });
    expect(ok).toEqual({ status: 201, body: "from sandbox" });
    expect(seen[0]).toMatchObject({ method: "POST", url: "/api?x=1", body: "payload" });
    expect(s.dockerCalls("inspect")[0].args).toEqual(["inspect", "-f", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", `sbx-${id}`]);
    await s.proxy(host);
    expect(s.dockerCalls("inspect")).toHaveLength(1);

    await s.call("POST", `/v1/sandboxes/${id}/ports/expose`, { port: 1 });
    expect((await s.proxy(`sbx-${id}-1.postyourprice.com`)).status).toBe(502);

    await s.call("POST", `/v1/sandboxes/${id}/stop`);
    expect((await s.proxy(host)).status).toBe(404);
  });
});

// ---- sweep with a settable clock

describe("sweep: idle, 30 days, expired", () => {
  it("stops an idle sandbox after 24 h without activity", async () => {
    const s = await setup();
    const id = (await s.make()).json.id;
    s.clock.t += 23 * HOUR;
    await s.call("GET", `/v1/sandboxes/${id}`);
    s.clock.t += 23 * HOUR;
    expect(await s.d.sweep()).toEqual([]);
    s.clock.t += HOUR + 1000;
    expect(await s.d.sweep()).toEqual([{ id, action: "stop", reason: "idle" }]);
    expect(s.dockerCalls("stop")[0].args).toEqual(["stop", `sbx-${id}`]);
    expect(s.state.snapshot().sandboxes[id]).toMatchObject({ status: "stopped", stopped_at: new Date(s.clock.t).toISOString() });
  });

  it("does not stop an idle sandbox with an exposed port", async () => {
    const s = await setup();
    const id = (await s.make()).json.id;
    await s.call("POST", `/v1/sandboxes/${id}/ports/expose`, { port: 8080 });
    s.clock.t += 3 * DAY;
    expect(await s.d.sweep()).toEqual([]);
    expect(s.dockerCalls("stop")).toHaveLength(0);
  });

  it("stops a sandbox after 30 days running", async () => {
    const s = await setup();
    const id = (await s.make()).json.id;
    await s.call("POST", `/v1/sandboxes/${id}/ports/expose`, { port: 8080 });
    s.clock.t += 29 * DAY;
    expect(await s.d.sweep()).toEqual([]);
    s.clock.t += DAY + 1000;
    expect(await s.d.sweep()).toEqual([{ id, action: "stop", reason: "max-runtime" }]);
    expect(s.d.sandboxes()[id].status).toBe("stopped");
  });

  it("deletes an expired sandbox 7 days after stop with umount and rm of the image", async () => {
    const s = await setup();
    const id = (await s.make()).json.id;
    await s.call("POST", `/v1/sandboxes/${id}/stop`);
    s.clock.t += 6 * DAY;
    expect(await s.d.sweep()).toEqual([]);
    s.clock.t += DAY + 1000;
    const before = s.calls.length;
    expect(await s.d.sweep()).toEqual([{ id, action: "delete", reason: "expired" }]);
    expect(s.calls.slice(before).map((c) => [c.cmd, ...c.args].join(" "))).toEqual([
      `docker rm -f sbx-${id}`, `docker network rm sbx-${id}`, `umount /m/${id}`, `rm -f /d/${id}.img`, `rmdir /m/${id}`,
    ]);
    expect(s.state.snapshot().sandboxes).toEqual({});
    expect((await s.call("GET", `/v1/sandboxes/${id}`)).status).toBe(404);
  });

  it("deletes through the API with the same cleanup, and starts a stopped sandbox again", async () => {
    const s = await setup();
    const id = (await s.make()).json.id;
    await s.call("POST", `/v1/sandboxes/${id}/stop`);
    const started = await s.call("POST", `/v1/sandboxes/${id}/start`);
    expect(started.json).toMatchObject({ status: "running", stopped_at: null });
    expect(s.dockerCalls("start")[0].args).toEqual(["start", `sbx-${id}`]);
    const before = s.calls.length;
    expect((await s.call("DELETE", `/v1/sandboxes/${id}`)).status).toBe(200);
    expect(s.calls.slice(before).map((c) => c.cmd)).toEqual(["docker", "docker", "umount", "rm", "rmdir"]);
    expect(s.d.sandboxes()).toEqual({});
  });

  it("reconciles labeled containers that are not in state", async () => {
    const s = await setup();
    const id = (await s.make()).json.id;
    const s2calls: Call[] = [];
    const d2 = createSandboxd({
      run: async (cmd: string, args: string[]) => {
        s2calls.push({ cmd, args });
        if (args[0] === "ps") return { code: 0, stdout: `sbx-${id}\nsbx-orphan0000\n`, stderr: "", timedOut: false };
        if (args[0] === "network" && args[1] === "ls") return { code: 0, stdout: `sbx-${id}\nsbx-orphan0000\n`, stderr: "", timedOut: false };
        return { code: 0, stdout: "", stderr: "", timedOut: false };
      },
      now: () => s.clock.t,
      keys: [],
      state: memoryState(s.state.snapshot()),
      config: { disksDir: "/d", mntDir: "/m" },
      log: () => {},
    });
    expect(await d2.reconcile()).toEqual(["sbx-orphan0000"]);
    const lines = s2calls.map((c) => [c.cmd, ...c.args].join(" "));
    expect(lines[0]).toBe("docker ps -a --filter label=sandboxd=1 --format {{.Names}}");
    expect(lines).toContain("docker rm -f sbx-orphan0000");
    expect(lines).toContain("docker network rm sbx-orphan0000");
    expect(lines).not.toContain(`docker rm -f sbx-${id}`);
    expect(lines).toContain(`docker start sbx-${id}`);

    // after a reboot the disk is not mounted: mount it, then restart the container onto it
    const s3calls: string[] = [];
    const d3 = createSandboxd({
      run: async (cmd: string, args: string[]) => {
        s3calls.push([cmd, ...args].join(" "));
        return { code: cmd === "mountpoint" ? 1 : 0, stdout: "", stderr: "", timedOut: false };
      },
      now: () => s.clock.t,
      keys: [],
      state: memoryState(s.state.snapshot()),
      config: { disksDir: "/d", mntDir: "/m" },
      log: () => {},
    });
    await d3.reconcile();
    expect(s3calls.slice(-4)).toEqual([`mountpoint -q /m/${id}`, `mkdir -p /m/${id}`, `mount -o loop /d/${id}.img /m/${id}`, `docker restart sbx-${id}`]);
  });
});

// ---- state file and the real runner

describe("state file and spawnRun", () => {
  it("writes state atomically and reads it back", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sandboxd-state-"));
    dirs.push(dir);
    const file = path.join(dir, "sub", "state.json");
    const st = createFileState(file);
    expect(st.load()).toEqual({ sandboxes: {} });
    st.save({ sandboxes: { a: { id: "a" } } });
    expect(st.load()).toEqual({ sandboxes: { a: { id: "a" } } });
    expect(fs.readdirSync(path.dirname(file))).toEqual(["state.json"]);
  });

  it("passes stdin and kills on timeout", async () => {
    const echo = await spawnRun(process.execPath, ["-e", "process.stdin.pipe(process.stdout)"], { input: "abc", timeoutMs: 10_000 });
    expect(echo).toEqual({ code: 0, stdout: "abc", stderr: "", timedOut: false });
    const slow = await spawnRun(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], { timeoutMs: 200 });
    expect(slow.timedOut).toBe(true);
    const missing = await spawnRun("/nonexistent/sandboxd-test-binary", [], { timeoutMs: 1000 });
    expect(missing.code).toBe(127);
  });
});
