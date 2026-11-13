/**
 * The rebuilt sandboxd of the harness (harness/sandboxd/, goals/sandbox/04): the real `createSandboxd` of
 * ops/sandbox/sandboxd.mjs with the Docker stand-in of harness/sandboxd/harness-run.mjs, started in this process on
 * 127.0.0.1 port 0. The control plane's side is the real one: the key pair `loadOrCreateClientKey` writes on the first
 * start of cp (sandbox-client.key and sandbox-client.pub) and the signed client of src/sandbox/client.ts. Commands run
 * for real, as processes; the home of a sandbox is a directory under the mount dir of the stand-in.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CLIENT_PUB_FILE, SandboxdUnavailable, createSandboxdClient, loadOrCreateClientKey } from "../src/sandbox/client.js";
import { createSandboxd } from "../ops/sandbox/sandboxd.mjs";
import { createSandboxd as harnessCreateSandboxd, startHarnessSandboxd } from "../harness/sandboxd/start.mjs";
import { mapRoot } from "../harness/sandboxd/harness-run.mjs";

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
