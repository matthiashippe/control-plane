#!/usr/bin/env node
// sandboxd: control API and port proxy of the sandbox server, built after docs/sandbox/plan.md
// (sections Isolation, Netz, Grenzen, Verbindung) and the paths of docs/sandbox/vertrag.md.
// Node 22, built-ins only, no build step: `node /opt/sandboxd/sandboxd.mjs`.
// Every command goes through the injected `run`, so the tests replay Docker without Docker.

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

// ---- limits (docs/sandbox/plan.md, Grenzen and Verbindung)

export const MAX_SKEW_MS = 60_000;
export const REPLAY_WINDOW_MS = 300_000;
export const EXEC_DEFAULT_MS = 30_000;
export const EXEC_MAX_MS = 600_000;
export const IDEMPOTENCY_MS = 600_000;
export const IDLE_MS = 24 * 3600_000;
export const MAX_RUN_MS = 30 * 24 * 3600_000;
export const STOPPED_KEEP_MS = 7 * 24 * 3600_000;
export const OWNER_SLOTS = 2;
export const BODY_LIMIT = 16 * 1024 * 1024;

export const TIERS = [
  { name: "small", vcpu: 1, memory_mb: 512, disk_gb: 5, pids: 256, slots: 1 },
  { name: "medium", vcpu: 1, memory_mb: 1024, disk_gb: 10, pids: 512, slots: 2 },
];
const TIER_HINT = `supported tiers: ${TIERS.map((t) => `${t.name} (memory_mb ${t.memory_mb}, vcpu ${t.vcpu}, disk_gb ${t.disk_gb})`).join(", ")}`;

const CAPS = ["CHOWN", "DAC_OVERRIDE", "FOWNER", "FSETID", "SETUID", "SETGID", "KILL"];
const OWNER_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ID_RE = /^[a-z0-9]{10}$/;

export function loadConfig(env = process.env) {
  const int = (v, d) => {
    const n = Number.parseInt(v ?? "", 10);
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  return {
    host: "127.0.0.1",
    apiPort: int(env.SANDBOXD_API_PORT, 8730),
    proxyPort: int(env.SANDBOXD_PROXY_PORT, 8731),
    keysDir: env.SANDBOXD_KEYS_DIR || "/etc/sandboxd/keys",
    stateFile: env.SANDBOXD_STATE || "/var/lib/sandboxd/state.json",
    disksDir: env.SANDBOXD_DISKS || "/var/lib/sandboxd/disks",
    mntDir: env.SANDBOXD_MNT || "/var/lib/sandboxd/mnt",
    image: env.SANDBOXD_IMAGE || "sandboxd-base:1",
    slots: int(env.SANDBOXD_SLOTS, 10),
    domain: (env.SANDBOXD_DOMAIN || "").trim().toLowerCase(),
    sweepS: int(env.SANDBOXD_SWEEP_S, 60),
  };
}

// ---- the domain of exposed ports (goals/sandbox/07)

/** The zone of the payment service. A customer's service never gets a name in it (goals/sandbox/ANNAHMEN.md, Goal 07). */
export const PAYMENT_ZONE = "postyourprice.com";
const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** The domain for public URLs of exposed ports, lowercased without a trailing dot; throws for an empty or malformed name and for the payment zone. */
export function assertPortsDomain(domain) {
  const d = String(domain ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!d) throw new Error("SANDBOXD_DOMAIN is not set: exposed ports need a domain of their own");
  if (d === PAYMENT_ZONE || d.endsWith(`.${PAYMENT_ZONE}`)) {
    throw new Error(`SANDBOXD_DOMAIN ${d} is the zone of the payment service ${PAYMENT_ZONE}; exposed ports need a domain of their own`);
  }
  if (!DOMAIN_RE.test(d)) throw new Error(`SANDBOXD_DOMAIN ${d} is not a domain name`);
  return d;
}

// ---- signature (docs/sandbox/plan.md, Verbindung, byte for byte)

const PKCS8_ED25519_PREFIX = "302e020100300506032b657004220420";
const SPKI_ED25519_PREFIX = "302a300506032b6570032100";

const toBytes = (body) => (body == null ? Buffer.alloc(0) : typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body));

/** Lowercase hex SHA-256 of the raw body bytes; no body hashes as the empty string. */
export function bodyHash(body) {
  return crypto.createHash("sha256").update(toBytes(body)).digest("hex");
}

/** METHOD \n PATH \n TIMESTAMP \n BODYHASH, PATH being the request target as sent (path and ?query). */
export function canonicalMessage(method, target, ts, body) {
  return `${String(method).toUpperCase()}\n${target}\n${ts}\n${bodyHash(body)}`;
}

/** Headers X-CP-Timestamp and X-CP-Signature for one request; privateKey is a KeyObject or a PEM string. */
export function signRequest(privateKey, method, target, ts, body) {
  const key = privateKey instanceof crypto.KeyObject ? privateKey : crypto.createPrivateKey(privateKey);
  const sig = crypto.sign(null, Buffer.from(canonicalMessage(method, target, ts, body), "utf8"), key);
  return { "X-CP-Timestamp": String(ts), "X-CP-Signature": sig.toString("base64") };
}

/** Ed25519 private KeyObject from a raw 32-byte seed in hex. */
export function privateKeyFromSeed(seedHex) {
  return crypto.createPrivateKey({ key: Buffer.from(PKCS8_ED25519_PREFIX + seedHex, "hex"), format: "der", type: "pkcs8" });
}

/** Ed25519 public KeyObject from a raw 32-byte public key in hex. */
export function publicKeyFromRaw(publicHex) {
  return crypto.createPublicKey({ key: Buffer.from(SPKI_ED25519_PREFIX + publicHex, "hex"), format: "der", type: "spki" });
}

/** Every `*.pub` file in dir as an Ed25519 public key (SPKI PEM); unreadable or other keys are skipped. */
export function loadKeys(dir, log = () => {}) {
  let names;
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith(".pub")).sort();
  } catch {
    return [];
  }
  const keys = [];
  for (const n of names) {
    try {
      const k = crypto.createPublicKey(fs.readFileSync(path.join(dir, n), "utf8"));
      if (k.asymmetricKeyType === "ed25519") keys.push(k);
      else log(`sandboxd: key ${n} skipped, not ed25519`);
    } catch {
      log(`sandboxd: key ${n} skipped, not a public key`);
    }
  }
  return keys;
}

/** Checks one request; keys is an array of public KeyObjects or a function returning one. */
export function createVerifier({ keys, now }) {
  const seen = new Map(); // accepted signature value -> expiry (ms of the injected clock)
  const keyList = () => (typeof keys === "function" ? keys() : keys) ?? [];
  const fail = (error) => ({ ok: false, error });
  function verify({ method, target, headers, body }) {
    const t = now();
    for (const [s, exp] of seen) if (exp <= t) seen.delete(s);
    const ts = headers["x-cp-timestamp"];
    const sig = headers["x-cp-signature"];
    if (typeof ts !== "string" || typeof sig !== "string" || !ts || !sig) return fail("missing X-CP-Timestamp or X-CP-Signature");
    if (!/^[0-9]{1,15}$/.test(ts)) return fail("X-CP-Timestamp must be unix seconds");
    if (Math.abs(t - Number(ts) * 1000) > MAX_SKEW_MS) return fail("timestamp outside the allowed skew of 60 s");
    const raw = Buffer.from(sig, "base64");
    // Only the canonical padded base64 counts, so a re-encoded copy cannot slip past the replay map.
    if (raw.length !== 64 || raw.toString("base64") !== sig) return fail("X-CP-Signature must be base64 of 64 bytes");
    const msg = Buffer.from(canonicalMessage(method, target, ts, body), "utf8");
    const good = keyList().some((k) => {
      try {
        return crypto.verify(null, msg, k, raw);
      } catch {
        return false;
      }
    });
    if (!good) return fail("signature does not verify");
    if (seen.has(sig)) return fail("replayed signature");
    seen.set(sig, t + REPLAY_WINDOW_MS);
    return { ok: true };
  }
  return { verify, seen };
}

// ---- proxy host

/** `sbx-<id>-<port>.<domain>` (any case, optional :port) to { id, port }, else null. */
export function parseProxyHost(host, domain) {
  if (typeof host !== "string" || typeof domain !== "string") return null;
  const h = host.trim().toLowerCase().replace(/:[0-9]+$/, "");
  const suffix = `.${domain.toLowerCase()}`;
  if (!h.endsWith(suffix)) return null;
  const m = /^sbx-([a-z0-9]{10})-([1-9][0-9]{0,4})$/.exec(h.slice(0, -suffix.length));
  if (!m) return null;
  const port = Number(m[2]);
  return port <= 65535 ? { id: m[1], port } : null;
}

// ---- docker argv (pure, exported for the tests)

export function networkCreateArgs(id) {
  const name = `sbx-${id}`;
  return ["network", "create", "--driver", "bridge", "--label", "sandboxd=1",
    "--opt", `com.docker.network.bridge.name=${name}`, "--opt", "com.docker.network.bridge.enable_icc=false", name];
}

// Measured on the server: Docker's embedded DNS 127.0.0.11 does not answer under runsc on a user-defined
// network, so the container writes its own resolv.conf (and keeps --dns for the record).
export const CONTAINER_CMD = 'printf "nameserver 1.1.1.1\\nnameserver 9.9.9.9\\n" > /etc/resolv.conf; exec sleep infinity';

// --restart unless-stopped: an OOM kills the gVisor sentry and with it the whole container; docker brings it
// back, while `docker stop` stays sticky, so stop and start keep working. Status comes from state.
export function dockerRunArgs({ id, owner, tier, mnt, image }) {
  const name = `sbx-${id}`;
  return ["run", "-d", "--name", name, "--label", "sandboxd=1", "--label", `sandboxd.owner=${owner}`,
    "--restart", "unless-stopped", "--runtime=runsc", "--network", name, "--dns", "1.1.1.1", "--dns", "9.9.9.9",
    "--memory", `${tier.memory_mb}m`, "--memory-swap", `${tier.memory_mb}m`, "--cpus", String(tier.vcpu),
    "--pids-limit", String(tier.pids), "--security-opt", "no-new-privileges", "--cap-drop", "ALL",
    ...CAPS.flatMap((c) => ["--cap-add", c]), "--cgroup-parent", "sandbox.slice",
    "--mount", `type=bind,src=${mnt},dst=/root`, "--hostname", name, image, "bash", "-c", CONTAINER_CMD];
}

/** Smallest tier that holds the request, or null. */
export function pickTier({ vcpu, memory_mb, disk_gb }) {
  return TIERS.find((t) => (memory_mb ?? 0) <= t.memory_mb && (vcpu ?? 1) <= t.vcpu && (disk_gb ?? 0) <= t.disk_gb) ?? null;
}

// ---- state

/** State in one JSON file, written atomically (tmp file and rename). */
export function createFileState(file) {
  return {
    load() {
      try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
      } catch (e) {
        if (e && e.code === "ENOENT") return { sandboxes: {} };
        throw e;
      }
    },
    save(data) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
      fs.renameSync(tmp, file);
    },
  };
}

export function memoryState(initial = { sandboxes: {} }) {
  let snap = JSON.stringify(initial);
  return { load: () => JSON.parse(snap), save: (d) => { snap = JSON.stringify(d); }, snapshot: () => JSON.parse(snap) };
}

// ---- real command runner

/** spawn with argv (no shell), stdin from input, SIGKILL after timeoutMs. Never rejects. */
export function spawnRun(cmd, args, { input, timeoutMs = 120_000 } = {}) {
  const CAP = 8 * 1024 * 1024;
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      resolve({ code: 127, stdout: "", stderr: String(e?.message ?? e), timedOut: false });
      return;
    }
    const out = [];
    const err = [];
    let outLen = 0;
    let errLen = 0;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (c) => { if (outLen < CAP) { out.push(c); outLen += c.length; } });
    child.stderr.on("data", (c) => { if (errLen < CAP) { err.push(c); errLen += c.length; } });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: 127, stdout: "", stderr: String(e?.message ?? e), timedOut: false });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: timedOut ? null : code, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), timedOut });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input ?? undefined);
  });
}

// ---- the daemon

const HOP = new Set(["connection", "keep-alive", "proxy-connection", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]);
const stripHop = (h) => Object.fromEntries(Object.entries(h).filter(([k]) => !HOP.has(k.toLowerCase())));
const iso = (ms) => new Date(ms).toISOString();
const newId = () => {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.randomBytes(10), (b) => abc[b % 36]).join("");
};

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let len = 0;
    req.on("data", (c) => {
      len += c.length;
      if (len > limit) { resolve(null); req.destroy(); return; }
      parts.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(parts)));
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  const b = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, { "content-type": "application/json", "content-length": b.length });
  res.end(b);
}

function sendText(res, status, text) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "content-length": Buffer.byteLength(text) });
  res.end(text);
}

export function createSandboxd({ run, now = Date.now, keys = [], state = memoryState(), config = {}, log = (l) => console.log(l), randomId = newId }) {
  const cfg = { ...loadConfig({}), ...config };
  // An empty domain is allowed for code paths without ports (tests of other parts); the payment zone never is.
  if (cfg.domain) cfg.domain = assertPortsDomain(cfg.domain);
  const data = state.load() ?? {};
  if (!data.sandboxes) data.sandboxes = {};
  const persist = () => state.save(data);
  const verifier = createVerifier({ keys, now });
  const pending = new Map(); // id -> { owner, slots } while a create runs
  const ipCache = new Map();
  const idem = new Map(); // `${id}\n${key}` -> { promise, doneAt }
  const locks = new Map();

  const name = (id) => `sbx-${id}`;
  const imgPath = (id) => path.posix.join(cfg.disksDir, `${id}.img`);
  const mntPath = (id) => path.posix.join(cfg.mntDir, id);
  const publicUrl = (id, port) => `https://sbx-${id}-${port}.${cfg.domain}`;

  function withLock(id, fn) {
    const prev = locks.get(id) ?? Promise.resolve();
    const p = prev.then(fn, fn);
    const tail = p.then(() => {}, () => {});
    locks.set(id, tail);
    tail.then(() => { if (locks.get(id) === tail) locks.delete(id); });
    return p;
  }

  const view = (s) => ({
    id: s.id, status: s.status, owner: s.owner, name: s.name, region: null, tier: s.tier,
    vcpu: s.vcpu, memory_mb: s.memory_mb, disk_gb: s.disk_gb,
    created_at: s.created_at, started_at: s.started_at, stopped_at: s.stopped_at, last_activity: s.last_activity,
    terminal_url: null, ports: s.ports.map((p) => ({ port: p, public_url: publicUrl(s.id, p) })),
  });

  // Slots count running sandboxes and creates in flight; a stopped one frees its place until it starts again.
  function slotError(owner, slots, exceptId) {
    let total = 0;
    let mine = 0;
    for (const s of Object.values(data.sandboxes)) {
      if (s.status !== "running" || s.id === exceptId) continue;
      total += s.slots;
      if (s.owner === owner) mine += s.slots;
    }
    for (const p of pending.values()) {
      total += p.slots;
      if (p.owner === owner) mine += p.slots;
    }
    if (mine + slots > OWNER_SLOTS) return [409, { error: `owner uses ${mine} of ${OWNER_SLOTS} slots, a ${slots === 1 ? "small" : "medium"} sandbox needs ${slots}` }];
    if (total + slots > cfg.slots) return [503, { error: `no free slots on this host (${total} of ${cfg.slots} in use)` }];
    return null;
  }

  async function mustRun(cmd, args, opts = {}) {
    const r = await run(cmd, args, { timeoutMs: 120_000, ...opts });
    if (r.code !== 0 || r.timedOut) {
      log(`sandboxd: step failed: ${cmd} ${args.slice(0, 2).join(" ")} code=${r.code} timedOut=${Boolean(r.timedOut)} ${String(r.stderr ?? "").trim().slice(0, 300)}`);
      const e = new Error(`${cmd} ${args[0] ?? ""}`.trim());
      e.step = true;
      throw e;
    }
    return r;
  }

  async function tryRun(cmd, args, opts = {}) {
    const r = await run(cmd, args, { timeoutMs: 120_000, ...opts });
    if (r.code !== 0 || r.timedOut) log(`sandboxd: cleanup step failed: ${cmd} ${args.join(" ")} code=${r.code}`);
    return r;
  }

  /** Mounts the disk of a sandbox if it is not mounted; true when it had to mount. */
  async function ensureMount(id) {
    const r = await run("mountpoint", ["-q", mntPath(id)], { timeoutMs: 10_000 });
    if (r.code === 0) return false;
    await mustRun("mkdir", ["-p", mntPath(id)]);
    await mustRun("mount", ["-o", "loop", imgPath(id), mntPath(id)]);
    return true;
  }

  async function create(body) {
    const { owner, name: label, vcpu, memory_mb, disk_gb } = body;
    if (typeof owner !== "string" || !OWNER_RE.test(owner)) return [400, { error: "owner is required: 1 to 128 of [A-Za-z0-9._:-]" }];
    if (label != null && (typeof label !== "string" || !NAME_RE.test(label))) return [400, { error: "name: 1 to 64 of [A-Za-z0-9._-]" }];
    for (const [k, v] of Object.entries({ vcpu, memory_mb, disk_gb })) {
      if (v != null && !(typeof v === "number" && Number.isFinite(v) && v > 0)) return [400, { error: `${k} must be a positive number` }];
    }
    const tier = pickTier({ vcpu, memory_mb, disk_gb });
    if (!tier) return [400, { error: `no tier for this request, ${TIER_HINT}` }];
    const busy = slotError(owner, tier.slots);
    if (busy) return busy;
    let id;
    do id = randomId(); while (!ID_RE.test(id) || data.sandboxes[id] || pending.has(id));
    pending.set(id, { owner, slots: tier.slots });
    const img = imgPath(id);
    const mnt = mntPath(id);
    const undo = [];
    // Each undo is registered before its step, so a half-done step is cleaned up too; it runs in reverse order.
    const step = async (cmd, args, undoStep) => {
      if (undoStep) undo.unshift(undoStep);
      await mustRun(cmd, args);
    };
    try {
      await step("truncate", ["-s", `${tier.disk_gb}G`, img], ["rm", ["-f", img]]);
      await step("mkfs.ext4", ["-q", "-F", img]);
      await step("mkdir", ["-p", mnt], ["rmdir", [mnt]]);
      await step("mount", ["-o", "loop", img, mnt], ["umount", [mnt]]);
      await step("docker", networkCreateArgs(id), ["docker", ["network", "rm", name(id)]]);
      await step("docker", dockerRunArgs({ id, owner, tier, mnt, image: cfg.image }), ["docker", ["rm", "-f", name(id)]]);
    } catch (e) {
      for (const [cmd, args] of undo) await tryRun(cmd, args);
      pending.delete(id);
      if (!e.step) throw e;
      return [500, { error: `create failed at ${e.message}, rolled back` }];
    }
    const t = iso(now());
    data.sandboxes[id] = {
      id, owner, name: label ?? null, tier: tier.name, vcpu: tier.vcpu, memory_mb: tier.memory_mb, disk_gb: tier.disk_gb,
      pids: tier.pids, slots: tier.slots, status: "running", created_at: t, started_at: t, stopped_at: null, last_activity: t, ports: [],
    };
    pending.delete(id);
    persist();
    log(`sandboxd: created ${id} tier=${tier.name}`);
    return [201, view(data.sandboxes[id])];
  }

  async function destroy(id) {
    const s = data.sandboxes[id];
    if (!s) return [404, { error: "sandbox not found" }];
    const failed = [];
    for (const [cmd, args] of [
      ["docker", ["rm", "-f", name(id)]],
      ["docker", ["network", "rm", name(id)]],
      ["umount", [mntPath(id)]],
      ["rm", ["-f", imgPath(id)]],
      ["rmdir", [mntPath(id)]],
    ]) {
      const r = await tryRun(cmd, args);
      if (r.code !== 0 || r.timedOut) failed.push(`${cmd} ${args[0]}`);
    }
    delete data.sandboxes[id];
    ipCache.delete(id);
    for (const k of idem.keys()) if (k.startsWith(`${id}\n`)) idem.delete(k);
    persist();
    log(`sandboxd: deleted ${id}${failed.length ? ` with failed steps: ${failed.join(", ")}` : ""}`);
    return [200, { ok: true, id, ...(failed.length ? { warnings: failed } : {}) }];
  }

  async function stop(id) {
    const s = data.sandboxes[id];
    if (!s) return [404, { error: "sandbox not found" }];
    if (s.status === "stopped") return [200, view(s)];
    try {
      await mustRun("docker", ["stop", name(id)], { timeoutMs: 60_000 });
    } catch (e) {
      if (!e.step) throw e;
      return [500, { error: "stop failed" }];
    }
    s.status = "stopped";
    s.stopped_at = iso(now());
    ipCache.delete(id);
    persist();
    return [200, view(s)];
  }

  async function start(id) {
    const s = data.sandboxes[id];
    if (!s) return [404, { error: "sandbox not found" }];
    if (s.status === "running") return [200, view(s)];
    const busy = slotError(s.owner, s.slots, id);
    if (busy) return busy;
    try {
      await ensureMount(id);
      await mustRun("docker", ["start", name(id)], { timeoutMs: 60_000 });
    } catch (e) {
      if (!e.step) throw e;
      return [500, { error: "start failed" }];
    }
    const t = iso(now());
    Object.assign(s, { status: "running", started_at: t, stopped_at: null, last_activity: t });
    ipCache.delete(id);
    persist();
    return [200, view(s)];
  }

  async function exec(s, body, key) {
    if (key != null && (typeof key !== "string" || key.length > 200)) return [400, { error: "Idempotency-Key too long" }];
    const t = now();
    for (const [k, e] of idem) if (e.doneAt != null && t - e.doneAt > IDEMPOTENCY_MS) idem.delete(k);
    const k = key ? `${s.id}\n${key}` : null;
    if (k && idem.has(k)) return [200, await idem.get(k).promise];
    if (s.status !== "running") return [409, { error: "sandbox is stopped" }];
    const { command } = body;
    if (typeof command !== "string" || !command) return [400, { error: "command is required" }];
    let ms = Number(body.timeout);
    if (!Number.isFinite(ms) || ms <= 0) ms = EXEC_DEFAULT_MS;
    ms = Math.min(Math.floor(ms), EXEC_MAX_MS);
    const once = async () => {
      const r = await run("docker", ["exec", name(s.id), "bash", "-lc", command], { timeoutMs: ms });
      if (r.timedOut) return { stdout: r.stdout ?? "", stderr: `${r.stderr ?? ""}\nsandboxd: command timed out after ${ms} ms`, exit_code: 124 };
      return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", exit_code: r.code ?? -1 };
    };
    if (!k) return [200, await once()];
    const entry = { doneAt: null, promise: null };
    entry.promise = once().then(
      (v) => { entry.doneAt = now(); return v; },
      (e) => { idem.delete(k); throw e; },
    );
    idem.set(k, entry);
    return [200, await entry.promise];
  }

  function absPath(p) {
    if (typeof p !== "string" || !p || p.includes("\0")) return null;
    return path.posix.normalize(p.startsWith("/") ? p : path.posix.join("/root", p));
  }

  async function upload(s, body) {
    if (s.status !== "running") return [409, { error: "sandbox is stopped" }];
    const p = absPath(body.path);
    if (!p || typeof body.content !== "string") return [400, { error: "path and content (string) are required" }];
    const r = await run("docker", ["exec", "-i", name(s.id), "sh", "-c", 'mkdir -p "$(dirname "$1")" && cat > "$1"', "sh", p], { input: body.content, timeoutMs: 120_000 });
    if (r.code !== 0 || r.timedOut) return [500, { error: "upload failed", stderr: String(r.stderr ?? "").slice(0, 2000) }];
    return [200, { ok: true }];
  }

  async function readFile(s, query) {
    if (s.status !== "running") return [409, { error: "sandbox is stopped" }];
    const p = absPath(query.get("path"));
    if (!p) return [400, { error: "path is required" }];
    const r = await run("docker", ["exec", name(s.id), "cat", "--", p], { timeoutMs: 60_000 });
    if (r.code !== 0 || r.timedOut) return [404, { error: "file not found" }];
    return [200, { content: r.stdout }];
  }

  function expose(s, body) {
    const port = body.port;
    if (!Number.isInteger(port) || port < 1 || port > 65535) return [400, { error: "port must be an integer 1..65535" }];
    if (!s.ports.includes(port)) s.ports.push(port);
    persist();
    return [200, { port, public_url: publicUrl(s.id, port) }];
  }

  function unexpose(s, port) {
    s.ports = s.ports.filter((p) => p !== port);
    persist();
    return [200, { ok: true, port }];
  }

  async function route(method, target, raw, headers) {
    const u = new URL(target, "http://sandboxd.invalid");
    const p = u.pathname;
    let body = {};
    if (raw.length) {
      try {
        body = JSON.parse(raw.toString("utf8"));
      } catch {
        return [400, { error: "body must be JSON" }];
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) return [400, { error: "body must be a JSON object" }];
    }
    if (p === "/v1/sandboxes") {
      if (method === "POST") return create(body);
      if (method === "GET") {
        const owner = u.searchParams.get("owner");
        const list = Object.values(data.sandboxes).filter((s) => !owner || s.owner === owner).map(view);
        return [200, { sandboxes: list }];
      }
      return [405, { error: "method not allowed" }];
    }
    const m = /^\/v1\/sandboxes\/([a-z0-9]{10})(\/.*)?$/.exec(p);
    if (!m) return [404, { error: "not found" }];
    const id = m[1];
    const s = data.sandboxes[id];
    if (!s) return [404, { error: "sandbox not found" }];
    s.last_activity = iso(now());
    persist();
    const sub = m[2] ?? "";
    const pm = /^\/ports\/([0-9]{1,5})$/.exec(sub);
    if (sub === "" && method === "GET") return [200, view(s)];
    if (sub === "" && method === "DELETE") return withLock(id, () => destroy(id));
    if (sub === "/exec" && method === "POST") return exec(s, body, headers["idempotency-key"]);
    if (sub === "/files/upload/json" && method === "POST") return upload(s, body);
    if (sub === "/files/read" && method === "GET") return readFile(s, u.searchParams);
    if (sub === "/ports/expose" && method === "POST") return expose(s, body);
    if (pm && method === "DELETE") return unexpose(s, Number(pm[1]));
    if (sub === "/stop" && method === "POST") return withLock(id, () => stop(id));
    if (sub === "/start" && method === "POST") return withLock(id, () => start(id));
    return [404, { error: "not found" }];
  }

  async function handleApi(req, res) {
    try {
      if (req.method === "GET" && req.url === "/healthz") return sendText(res, 200, "ok");
      const raw = await readBody(req, BODY_LIMIT);
      if (raw == null) return sendJson(res, 413, { error: "body too large" });
      const v = verifier.verify({ method: req.method, target: req.url, headers: req.headers, body: raw });
      if (!v.ok) {
        log(`sandboxd: 401 ${req.method} ${String(req.url).split("?")[0]}: ${v.error}`);
        return sendJson(res, 401, { error: v.error });
      }
      const [status, payload] = await route(req.method, req.url, raw, req.headers);
      sendJson(res, status, payload);
    } catch (e) {
      log(`sandboxd: 500 ${req.method} ${String(req.url).split("?")[0]}: ${e?.message ?? e}`);
      if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
      else res.destroy();
    }
  }

  async function containerIp(id) {
    if (ipCache.has(id)) return ipCache.get(id);
    const r = await run("docker", ["inspect", "-f", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", name(id)], { timeoutMs: 10_000 });
    const ip = String(r.stdout ?? "").trim();
    if (r.code !== 0 || !net.isIPv4(ip)) throw new Error(`no IPv4 address for ${name(id)}`);
    ipCache.set(id, ip);
    return ip;
  }

  async function handleProxy(req, res) {
    const target = parseProxyHost(req.headers.host, cfg.domain);
    const s = target ? data.sandboxes[target.id] : null;
    if (!s || s.status !== "running" || !s.ports.includes(target.port)) return sendText(res, 404, "not found");
    let ip;
    try {
      ip = await containerIp(s.id);
    } catch (e) {
      log(`sandboxd: proxy ${s.id}: ${e.message}`);
      return sendText(res, 502, "bad gateway");
    }
    const up = http.request({ host: ip, port: target.port, method: req.method, path: req.url, headers: stripHop(req.headers) });
    up.on("response", (ur) => {
      res.writeHead(ur.statusCode ?? 502, stripHop(ur.headers));
      ur.pipe(res);
    });
    up.on("error", (e) => {
      ipCache.delete(s.id);
      log(`sandboxd: proxy ${s.id}:${target.port} upstream error: ${e.message}`);
      if (!res.headersSent) sendText(res, 502, "bad gateway");
      else res.destroy();
    });
    res.on("close", () => { if (!res.writableFinished) up.destroy(); });
    req.pipe(up);
  }

  let sweeping = false;
  async function sweep() {
    if (sweeping) return [];
    sweeping = true;
    try {
      const t = now();
      const due = [];
      for (const s of Object.values(data.sandboxes)) {
        if (s.status === "running") {
          if (t - Date.parse(s.started_at) > MAX_RUN_MS) due.push({ id: s.id, action: "stop", reason: "max-runtime" });
          else if (s.ports.length === 0 && t - Date.parse(s.last_activity) > IDLE_MS) due.push({ id: s.id, action: "stop", reason: "idle" });
        } else if (s.status === "stopped" && s.stopped_at && t - Date.parse(s.stopped_at) > STOPPED_KEEP_MS) {
          due.push({ id: s.id, action: "delete", reason: "expired" });
        }
      }
      const done = [];
      for (const d of due) {
        const [status] = await withLock(d.id, () => (d.action === "stop" ? stop(d.id) : destroy(d.id)));
        log(`sandboxd: sweep ${d.action} ${d.id} (${d.reason}) status=${status}`);
        if (status === 200) done.push(d);
      }
      return done;
    } finally {
      sweeping = false;
    }
  }

  /** On start: remove labeled containers and networks not in state, remount disks, start what state says runs. */
  async function reconcile() {
    const known = new Set(Object.keys(data.sandboxes).map(name));
    const removed = [];
    const ps = await run("docker", ["ps", "-a", "--filter", "label=sandboxd=1", "--format", "{{.Names}}"], { timeoutMs: 30_000 });
    if (ps.code === 0) {
      for (const n of String(ps.stdout).split("\n").map((l) => l.trim()).filter(Boolean)) {
        if (known.has(n)) continue;
        await tryRun("docker", ["rm", "-f", n]);
        removed.push(n);
        log(`sandboxd: reconcile removed container ${n}`);
      }
    } else log("sandboxd: reconcile could not list containers");
    const nets = await run("docker", ["network", "ls", "--filter", "label=sandboxd=1", "--format", "{{.Name}}"], { timeoutMs: 30_000 });
    if (nets.code === 0) {
      for (const n of String(nets.stdout).split("\n").map((l) => l.trim()).filter(Boolean)) {
        if (known.has(n)) continue;
        await tryRun("docker", ["network", "rm", n]);
        log(`sandboxd: reconcile removed network ${n}`);
      }
    }
    for (const s of Object.values(data.sandboxes)) {
      if (s.status !== "running") continue;
      try {
        // After a reboot docker may restart the container (unless-stopped) before the disk is mounted again;
        // it then sees the empty directory on the host disk, so a fresh mount means a restart onto the disk.
        const mounted = await ensureMount(s.id);
        await mustRun("docker", [mounted ? "restart" : "start", name(s.id)], { timeoutMs: 60_000 });
      } catch (e) {
        log(`sandboxd: reconcile could not start ${s.id}: ${e.message}`);
      }
    }
    return removed;
  }

  return { handleApi, handleProxy, sweep, reconcile, verifier, config: cfg, sandboxes: () => data.sandboxes };
}

// ---- main

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
}

export async function main(env = process.env) {
  const config = loadConfig(env);
  config.domain = assertPortsDomain(config.domain);
  for (const d of [config.disksDir, config.mntDir, path.dirname(config.stateFile)]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  const log = (l) => console.log(l);
  log(`sandboxd: ${loadKeys(config.keysDir, log).length} keys in ${config.keysDir}`);
  const d = createSandboxd({
    run: spawnRun, now: Date.now, keys: () => loadKeys(config.keysDir, log), state: createFileState(config.stateFile), config, log,
  });
  await d.reconcile();
  const api = http.createServer(d.handleApi);
  const proxy = http.createServer(d.handleProxy);
  await listen(api, config.apiPort, config.host);
  await listen(proxy, config.proxyPort, config.host);
  log(`sandboxd: api on ${config.host}:${config.apiPort}, proxy on ${config.host}:${config.proxyPort}`);
  const timer = setInterval(() => { d.sweep().catch((e) => log(`sandboxd: sweep failed: ${e?.message ?? e}`)); }, config.sweepS * 1000);
  const shutdown = () => {
    clearInterval(timer);
    api.close();
    proxy.close();
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`sandboxd: failed to start: ${e?.stack ?? e}`);
    process.exit(1);
  });
}
