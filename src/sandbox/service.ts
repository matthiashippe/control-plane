/**
 * The sandbox API of the control plane (sandbox 03): the rows with `/v1/sandboxes` of
 * docs/sandbox/vertrag.md, answered the way the unmodified runtime at d8f8168 reads them, passed on
 * signed to sandboxd (src/sandbox/client.ts) and billed after docs/sandbox/plan.md, section Preis.
 *
 * Rules that shape every answer here (goals/sandbox/03-…md, Kontext):
 * - No route ever answers 429, 500, 502, 503 or 504. The runtime's HTTP client retries those three
 *   times and counts them for its circuit breaker, which after five in a row fails every call for
 *   60 s, credits and inference included. sandboxd down, slow or refusing our key is a 501, which
 *   the runtime answers on create by starting a local worker.
 * - 404 only for an unknown id or the sandbox of another account (and a file that is not there);
 *   403 never, because the runtime aborts exec and file calls on it.
 * - Billing is per started step of 6 minutes of run time, 100 mc for the small tier and 200 mc for
 *   the medium one, one ledger row `sandbox` per step with ref `sandbox:<id>:<step>` under a unique
 *   index, booked when the step ends or when the sandbox stops. Run time is what sandboxd reports
 *   in `started_at` and `stopped_at`. 1000 mc are reserved when a sandbox starts (`hold_mc`, a
 *   column that survives a restart) and given back when it stops or is deleted.
 */

import crypto from "node:crypto";
import { getAvailableMc, getBalanceMc, mcToCents, postLedger, type Db } from "../db.js";
import { DOC } from "../errors.js";
import { SandboxdUnavailable, type SandboxdClient, type SandboxdReply } from "./client.js";

export const STEP_MS = 6 * 60_000;
export const HOLD_MC = 1000;
export const ACCOUNT_SLOTS = 2;
export const EXEC_DEFAULT_MS = 30_000;
export const EXEC_MAX_MS = 600_000;
/** How long the result of an exec stays available to a repeat with the same Idempotency-Key. */
export const IDEMPOTENCY_MS = 600_000;

export const TIERS = [
  { name: "small", vcpu: 1, memory_mb: 512, disk_gb: 5, slots: 1, step_mc: 100 },
  { name: "medium", vcpu: 1, memory_mb: 1024, disk_gb: 10, slots: 2, step_mc: 200 },
] as const;
type Tier = (typeof TIERS)[number];

const TIER_TEXT = TIERS.map((t) => `${t.name} (memory_mb ${t.memory_mb}, vcpu ${t.vcpu}, disk_gb ${t.disk_gb})`).join(" and ");
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export type SandboxStatus = 200 | 201 | 400 | 402 | 404 | 409 | 501;
export interface Reply {
  status: SandboxStatus;
  body: Record<string, unknown>;
}

interface Row {
  id: string;
  address: string;
  name: string | null;
  tier: string;
  vcpu: number;
  memory_mb: number;
  disk_gb: number;
  slots: number;
  step_mc: number;
  hold_mc: number;
  status: "creating" | "running" | "stopped" | "deleted";
  stop_reason: string | null;
  period_start: string | null;
  period_base: number;
  steps_billed: number;
  created_at: string;
}

/** What sandboxd says about one sandbox (its `view`). */
interface SandboxdView {
  id: string;
  owner?: string;
  status: string;
  started_at?: string | null;
  stopped_at?: string | null;
  created_at?: string;
}

const UNREACHABLE_CREATE =
  "The sandbox server cannot be reached right now, so no sandbox was started and nothing was reserved or " +
  "charged. The runtime handles this answer by starting a local worker instead; a later call can try again.";
const UNREACHABLE =
  "The sandbox server cannot be reached right now, so nothing ran and nothing was charged. Try again in a few minutes.";

const reply = (status: SandboxStatus, body: Record<string, unknown>): Reply => ({ status, body });
const unreachable = (create = false): Reply =>
  reply(501, { error: "sandbox_server_unreachable", message: create ? UNREACHABLE_CREATE : UNREACHABLE, docs: DOC.sandboxes });
const notFound = (): Reply =>
  reply(404, { error: "sandbox_not_found", message: "No sandbox with this id belongs to this API key.", docs: DOC.sandboxes });
const slotsFull = (used: number, needed: number): Reply =>
  reply(409, {
    error: "sandbox_slots_full",
    message:
      `An account runs at most ${ACCOUNT_SLOTS} slots at once, a medium sandbox counts as two. This account uses ${used}, ` +
      `this sandbox needs ${needed}. Nothing was started and nothing was charged; delete or stop one first.`,
    slots_used: used,
    slots_limit: ACCOUNT_SLOTS,
    docs: DOC.sandboxes,
  });
const hostFull = (): Reply =>
  reply(409, {
    error: "sandbox_host_full",
    message: "The sandbox server has no free place right now. Nothing was started and nothing was charged; try again later.",
    docs: DOC.sandboxes,
  });
const PORTS_UNAVAILABLE: Reply = reply(409, {
  error: "port_exposure_unavailable",
  message:
    "Exposing a port of a sandbox is not offered yet: public URLs for sandbox ports need a domain of their own, " +
    "apart from the one this service pays and bills under. The sandbox keeps running and nothing was charged; " +
    "exec and files work as usual.",
  docs: DOC.sandboxes,
});

function insufficient(availableMc: number): Reply {
  return reply(402, {
    error: "INSUFFICIENT_CREDITS",
    message:
      `A sandbox reserves ${HOLD_MC} mc (one hour of the small tier) while it runs, and this key has ` +
      `${mcToCents(availableMc)} cents available. Nothing was started and nothing was charged. Buy credits through ` +
      "/pay (GET /.well-known/x402 lists the tiers) and call again.",
    details: { required_cents: Math.ceil(HOLD_MC / 1000), current_balance_cents: mcToCents(availableMc) },
    docs: DOC.sandboxes,
  });
}

function view(r: Row): Record<string, unknown> {
  return {
    id: r.id,
    status: r.status === "running" ? "running" : "stopped",
    region: "",
    vcpu: r.vcpu,
    memory_mb: r.memory_mb,
    disk_gb: r.disk_gb,
    terminal_url: "",
    created_at: r.created_at,
    name: r.name,
    tier: r.tier,
  };
}

function positive(v: unknown): number | null | undefined {
  if (v === undefined || v === null) return undefined;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/** Smallest tier that holds the request, or null. Defaults are the runtime's: 1 vCPU, 512 MB, 5 GB. */
export function pickTier(req: { vcpu?: number; memory_mb?: number; disk_gb?: number }): Tier | null {
  const vcpu = req.vcpu ?? 1;
  const mem = req.memory_mb ?? 512;
  const disk = req.disk_gb ?? 5;
  return TIERS.find((t) => mem <= t.memory_mb && vcpu <= t.vcpu && disk <= t.disk_gb) ?? null;
}

export interface SandboxServiceOptions {
  db: Db;
  /** null: no sandbox server is configured, every call that needs one answers 501. */
  client: SandboxdClient | null;
  now?: () => number;
  log?: (line: string) => void;
}

export type SandboxService = ReturnType<typeof createSandboxService>;

export function createSandboxService(opts: SandboxServiceOptions) {
  const { db, client } = opts;
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((l: string) => console.log(l));
  const locks = new Map<string, Promise<unknown>>();
  const execs = new Map<string, { promise: Promise<Reply>; doneAt: number | null }>();

  function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = locks.get(id) ?? Promise.resolve();
    const p = prev.then(fn, fn);
    const tail = p.then(
      () => undefined,
      () => undefined,
    );
    locks.set(id, tail);
    void tail.then(() => {
      if (locks.get(id) === tail) locks.delete(id);
    });
    return p;
  }

  const iso = (ms: number) => new Date(ms).toISOString();
  const getRow = (id: string) => db.prepare("SELECT * FROM sandboxes WHERE id = ?").get(id) as Row | undefined;
  const ownRow = (address: string, id: string) =>
    db
      .prepare("SELECT * FROM sandboxes WHERE id = ? AND address = ? AND status IN ('running', 'stopped')")
      .get(id, address.toLowerCase()) as Row | undefined;
  const slotsInUse = (address: string, exceptId?: string) =>
    (
      db
        .prepare("SELECT coalesce(sum(slots), 0) AS n FROM sandboxes WHERE address = ? AND status IN ('running', 'creating') AND id <> ?")
        .get(address.toLowerCase(), exceptId ?? "") as { n: number }
    ).n;
  const update = (id: string, fields: Partial<Row>) => {
    const keys = Object.keys(fields);
    db.prepare(`UPDATE sandboxes SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`).run(
      ...keys.map((k) => (fields as Record<string, unknown>)[k]),
      iso(now()),
      id,
    );
  };

  /** The random handle sandboxd knows this account by; never the address. */
  function ownerFor(address: string): string {
    const addr = address.toLowerCase();
    const row = db.prepare("SELECT owner FROM sandbox_owners WHERE address = ?").get(addr) as { owner: string } | undefined;
    if (row) return row.owner;
    const owner = `acct-${crypto.randomBytes(12).toString("hex")}`;
    db.prepare("INSERT OR IGNORE INTO sandbox_owners (address, owner, created_at) VALUES (?, ?, ?)").run(addr, owner, iso(now()));
    return (db.prepare("SELECT owner FROM sandbox_owners WHERE address = ?").get(addr) as { owner: string }).owner;
  }

  // When the last call to sandboxd failed (the billing tick asks every minute), a create answers 501
  // at once, before the credit is looked at: a 402 would make the runtime buy credit for a sandbox
  // that cannot start.
  let lastFailure: number | null = null;
  const RECHECK_MS = 60_000;
  const knownDown = () => !client || (lastFailure !== null && now() - lastFailure < RECHECK_MS);

  async function call(method: string, target: string, body?: Record<string, unknown>, o?: { timeoutMs?: number; idempotencyKey?: string }): Promise<SandboxdReply | null> {
    if (!client) return null;
    try {
      const res = await client.request(method, target, body, o);
      lastFailure = null;
      return res;
    } catch (e) {
      lastFailure = now();
      if (e instanceof SandboxdUnavailable) {
        log(`[sandbox] ${method} ${target.split("?")[0]}: ${e.reason}`);
        return null;
      }
      log(`[sandbox] ${method} ${target.split("?")[0]} failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  // ---- billing

  /**
   * Books step `n` of a sandbox once: a second call for the same step finds its row and books nothing.
   * The amount is the price of the step, or what is left on the balance if that is less, so the
   * balance never goes negative. Ledger row and balance in one transaction (postLedger).
   */
  function bookStep(r: Row, n: number): void {
    db.transaction(() => {
      const ref = `sandbox:${r.id}:${n}`;
      const done = db.prepare("SELECT 1 FROM ledger WHERE kind = 'sandbox' AND ref = ?").get(ref);
      if (!done) {
        const amount = Math.min(r.step_mc, Math.max(0, getBalanceMc(db, r.address)));
        if (amount > 0) {
          postLedger(db, {
            address: r.address,
            kind: "sandbox",
            deltaMc: -amount,
            ref,
            settlesHold: true,
            meta: { sandbox: r.id, step: n, tier: r.tier, ...(amount < r.step_mc ? { partial: true } : {}) },
          });
        } else {
          log(`[sandbox] step ${n} of ${r.id} not booked, the balance is empty`);
        }
      }
      db.prepare("UPDATE sandboxes SET steps_billed = max(steps_billed, ?), updated_at = ? WHERE id = ?").run(n + 1, iso(now()), r.id);
    })();
  }

  /** Books every step of the current run up to `count` steps of that run. */
  function bookUpTo(id: string, count: number): void {
    for (;;) {
      const r = getRow(id);
      if (!r) return;
      const n = r.steps_billed;
      if (n - r.period_base >= count) return;
      bookStep(r, n);
    }
  }

  /** Steps of the run that began at `start`: finished ones while it runs, started ones once it stopped at `end`. */
  function stepsOf(start: string | null, end: number | null, at: number): number {
    if (!start) return 0;
    const s = Date.parse(start);
    if (!Number.isFinite(s)) return 0;
    if (end === null) return Math.max(0, Math.floor((at - s) / STEP_MS));
    return Math.max(0, Math.ceil((end - s) / STEP_MS));
  }

  /** Ends the billing of a run that stopped at `end`: every started step, then the reservation goes back. */
  function closeRun(id: string, end: number, status: "stopped" | "deleted", reason: string): void {
    const r = getRow(id);
    if (!r) return;
    if (r.status === "running") bookUpTo(id, stepsOf(r.period_start, end, end));
    update(id, { status, stop_reason: reason, hold_mc: 0 });
  }

  /** One sandbox, one tick: book what is due, follow a stop by sandboxd, stop it when the credit is gone. */
  async function billOne(id: string, v: SandboxdView | null): Promise<void> {
    const r = getRow(id);
    if (!r || r.status !== "running") {
      if (r && r.status === "stopped" && v === null) update(id, { status: "deleted", stop_reason: "sandboxd", hold_mc: 0 });
      return;
    }
    if (v === null) {
      // Gone at sandboxd while we thought it ran. What ran since the last tick is not provable.
      log(`[sandbox] ${id} is gone at sandboxd, billing ends`);
      update(id, { status: "deleted", stop_reason: "sandboxd", hold_mc: 0 });
      return;
    }
    if (v.started_at && v.started_at !== r.period_start) {
      // A run we did not record the start of; it is billed from its own start, the old one stays as booked.
      update(id, { period_start: v.started_at, period_base: r.steps_billed });
    }
    if (v.status !== "running") {
      const end = v.stopped_at ? Date.parse(v.stopped_at) : now();
      closeRun(id, Number.isFinite(end) ? end : now(), "stopped", "sandboxd");
      return;
    }
    const t = now();
    const cur = getRow(id)!;
    bookUpTo(id, stepsOf(cur.period_start, null, t));
    // The step that runs now has begun. If the balance cannot pay it, the sandbox stops here.
    if (getBalanceMc(db, cur.address) < cur.step_mc) {
      const res = await call("POST", `/v1/sandboxes/${id}/stop`, undefined, { timeoutMs: 90_000 });
      if (!res) return;
      if (res.status === 404) {
        update(id, { status: "deleted", stop_reason: "sandboxd", hold_mc: 0 });
        return;
      }
      const stoppedAt = typeof res.body.stopped_at === "string" ? Date.parse(res.body.stopped_at) : now();
      closeRun(id, Number.isFinite(stoppedAt) ? stoppedAt : now(), "stopped", "credit");
      log(`[sandbox] ${id} stopped, the credit is used up`);
    }
  }

  /** The billing tick: one list from sandboxd, then every sandbox we bill. Safe to run twice. */
  async function tick(): Promise<{ checked: number } | null> {
    const res = await call("GET", "/v1/sandboxes");
    if (!res || res.status !== 200 || !Array.isArray(res.body.sandboxes)) return null;
    const views = new Map<string, SandboxdView>();
    for (const v of res.body.sandboxes as SandboxdView[]) if (v && typeof v.id === "string") views.set(v.id, v);
    const rows = db.prepare("SELECT id FROM sandboxes WHERE status IN ('running', 'stopped')").all() as { id: string }[];
    for (const { id } of rows) await withLock(id, () => billOne(id, views.get(id) ?? null));
    const known = new Set((db.prepare("SELECT id FROM sandboxes").all() as { id: string }[]).map((r) => r.id));
    const owners = new Set((db.prepare("SELECT owner FROM sandbox_owners").all() as { owner: string }[]).map((r) => r.owner));
    const creating = (db.prepare("SELECT count(*) AS n FROM sandboxes WHERE status = 'creating'").get() as { n: number }).n;
    if (!creating) {
      for (const v of views.values()) {
        if (!known.has(v.id) && v.owner && owners.has(v.owner)) log(`[sandbox] ${v.id} runs at sandboxd for an account of ours but is not billed here`);
      }
    }
    return { checked: rows.length };
  }

  // ---- the routes

  async function create(address: string, body: unknown): Promise<Reply> {
    const addr = address.toLowerCase();
    const b = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
    const req: { vcpu?: number; memory_mb?: number; disk_gb?: number } = {};
    for (const k of ["vcpu", "memory_mb", "disk_gb"] as const) {
      const v = positive(b[k]);
      if (v === null) return reply(400, { error: "invalid_request", message: `${k} must be a positive number.`, docs: DOC.sandboxes });
      if (v !== undefined) req[k] = v;
    }
    const tier = pickTier(req);
    if (!tier) {
      return reply(400, {
        error: "sandbox_too_large",
        message: `No tier holds this request. Supported tiers: ${TIER_TEXT}. Ask for one of them; nothing was started.`,
        tiers: TIERS.map(({ name, vcpu, memory_mb, disk_gb }) => ({ name, vcpu, memory_mb, disk_gb })),
        docs: DOC.sandboxes,
      });
    }
    const name = typeof b.name === "string" && NAME_RE.test(b.name) ? b.name : null;
    if (knownDown()) return unreachable(true);
    // Slots, credit and the reservation in one transaction, so two creates at once cannot both pass.
    const pendingId = `creating:${crypto.randomBytes(8).toString("hex")}`;
    const refused = db.transaction((): Reply | null => {
      const used = slotsInUse(addr);
      if (used + tier.slots > ACCOUNT_SLOTS) return slotsFull(used, tier.slots);
      const available = getAvailableMc(db, addr);
      if (available < HOLD_MC) return insufficient(available);
      const t = iso(now());
      db.prepare(
        "INSERT INTO sandboxes (id, address, name, tier, vcpu, memory_mb, disk_gb, slots, step_mc, hold_mc, status, created_at, updated_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'creating', ?, ?)",
      ).run(pendingId, addr, name, tier.name, tier.vcpu, tier.memory_mb, tier.disk_gb, tier.slots, tier.step_mc, HOLD_MC, t, t);
      return null;
    })();
    if (refused) return refused;
    const drop = () => db.prepare("DELETE FROM sandboxes WHERE id = ?").run(pendingId);
    const res = await call(
      "POST",
      "/v1/sandboxes",
      { owner: ownerFor(addr), ...(name ? { name } : {}), vcpu: tier.vcpu, memory_mb: tier.memory_mb, disk_gb: tier.disk_gb },
      { timeoutMs: 120_000 },
    );
    if (!res) {
      drop();
      return unreachable(true);
    }
    const v = res.body as unknown as SandboxdView;
    if (res.status === 201 && typeof v.id === "string") {
      update(pendingId, {
        id: v.id,
        status: "running",
        period_start: v.started_at ?? iso(now()),
        period_base: 0,
        steps_billed: 0,
        created_at: v.created_at ?? iso(now()),
      });
      return reply(201, view(getRow(v.id)!));
    }
    drop();
    if (res.status === 409) return slotsFull(slotsInUse(addr), tier.slots);
    if (res.status === 503) return hostFull();
    if (res.status === 400) return reply(400, { error: "invalid_request", message: String(res.body.error ?? "rejected"), docs: DOC.sandboxes });
    return unreachable(true);
  }

  function list(address: string): Reply {
    const rows = db
      .prepare("SELECT * FROM sandboxes WHERE address = ? AND status IN ('running', 'stopped') ORDER BY created_at, id")
      .all(address.toLowerCase()) as Row[];
    return reply(200, { sandboxes: rows.map(view) });
  }

  function get(address: string, id: string): Reply {
    const r = ownRow(address, id);
    return r ? reply(200, view(r)) : notFound();
  }

  /**
   * Starts a sandbox again that stopped (credit used up, idle at sandboxd), once the credit holds the
   * reservation again. null when it runs.
   */
  function ensureRunning(id: string): Promise<Reply | null> {
    return withLock(id, async () => {
      const r = getRow(id);
      if (!r || (r.status !== "running" && r.status !== "stopped")) return notFound();
      if (r.status === "running") return null;
      const took = db.transaction((): Reply | null => {
        const used = slotsInUse(r.address, r.id);
        if (used + r.slots > ACCOUNT_SLOTS) return slotsFull(used, r.slots);
        const available = getAvailableMc(db, r.address);
        if (available < HOLD_MC) return insufficient(available);
        update(id, { hold_mc: HOLD_MC });
        return null;
      })();
      if (took) return took;
      const res = await call("POST", `/v1/sandboxes/${id}/start`, undefined, { timeoutMs: 90_000 });
      if (!res || (res.status !== 200 && res.status !== 404 && res.status !== 409 && res.status !== 503)) {
        update(id, { hold_mc: 0 });
        return unreachable();
      }
      if (res.status === 404) {
        update(id, { status: "deleted", stop_reason: "sandboxd", hold_mc: 0 });
        return notFound();
      }
      if (res.status !== 200) {
        update(id, { hold_mc: 0 });
        return res.status === 503 ? hostFull() : slotsFull(slotsInUse(r.address, r.id), r.slots);
      }
      const started = typeof res.body.started_at === "string" ? res.body.started_at : iso(now());
      update(id, { status: "running", stop_reason: null, period_start: started, period_base: getRow(id)!.steps_billed });
      log(`[sandbox] ${id} started again`);
      return null;
    });
  }

  /** Maps what sandboxd answered on a sandbox path to what the runtime may see. */
  function passOn(id: string, res: SandboxdReply | null, ok: (b: Record<string, unknown>) => Record<string, unknown>): Reply {
    if (!res) return unreachable();
    if (res.status === 200) return reply(200, ok(res.body));
    if (res.status === 404) {
      if (typeof res.body.error === "string" && res.body.error === "file not found") {
        return reply(404, { error: "file_not_found", message: "There is no readable file at this path in the sandbox.", docs: DOC.sandboxes });
      }
      update(id, { status: "deleted", stop_reason: "sandboxd", hold_mc: 0 });
      return notFound();
    }
    if (res.status === 409) {
      return reply(409, { error: "sandbox_stopped", message: "The sandbox stopped in the meantime; call again to start it.", docs: DOC.sandboxes });
    }
    if (res.status === 400) return reply(400, { error: "invalid_request", message: String(res.body.error ?? "rejected"), docs: DOC.sandboxes });
    return unreachable();
  }

  function exec(address: string, id: string, body: unknown, idempotencyKey: string | undefined): Promise<Reply> {
    const r = ownRow(address, id);
    if (!r) return Promise.resolve(notFound());
    const b = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
    if (typeof b.command !== "string" || !b.command) {
      return Promise.resolve(reply(400, { error: "invalid_request", message: "command (a string) is required.", docs: DOC.sandboxes }));
    }
    if (idempotencyKey !== undefined && (idempotencyKey.length === 0 || idempotencyKey.length > 200)) {
      return Promise.resolve(reply(400, { error: "invalid_request", message: "Idempotency-Key must be 1 to 200 characters.", docs: DOC.sandboxes }));
    }
    let ms = Number(b.timeout);
    if (!Number.isFinite(ms) || ms <= 0) ms = EXEC_DEFAULT_MS;
    ms = Math.min(Math.floor(ms), EXEC_MAX_MS);
    const command = b.command;
    const run = async (): Promise<Reply> => {
      const stopped = await ensureRunning(id);
      if (stopped) return stopped;
      const res = await call("POST", `/v1/sandboxes/${id}/exec`, { command, timeout: ms }, { timeoutMs: ms + 30_000, idempotencyKey });
      return passOn(id, res, (o) => ({
        stdout: typeof o.stdout === "string" ? o.stdout : "",
        stderr: typeof o.stderr === "string" ? o.stderr : "",
        exit_code: typeof o.exit_code === "number" ? o.exit_code : -1,
      }));
    };
    if (!idempotencyKey) return run();
    const t = now();
    for (const [k, e] of execs) if (e.doneAt !== null && t - e.doneAt > IDEMPOTENCY_MS) execs.delete(k);
    const key = `${id}\n${idempotencyKey}`;
    const known = execs.get(key);
    // A repeat with the same key starts nothing: it waits for the command that already runs and gets
    // its result, however long the first request was held.
    if (known) return known.promise;
    const entry: { promise: Promise<Reply>; doneAt: number | null } = { promise: Promise.resolve(notFound()), doneAt: null };
    entry.promise = run().then((res) => {
      // Only a result is kept; a sandbox server that was down may be tried again with the same key.
      if (res.status === 501) execs.delete(key);
      else entry.doneAt = now();
      return res;
    });
    execs.set(key, entry);
    return entry.promise;
  }

  async function upload(address: string, id: string, body: unknown): Promise<Reply> {
    const r = ownRow(address, id);
    if (!r) return notFound();
    const b = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
    if (typeof b.path !== "string" || !b.path || typeof b.content !== "string") {
      return reply(400, { error: "invalid_request", message: "path and content (both strings) are required.", docs: DOC.sandboxes });
    }
    const stopped = await ensureRunning(id);
    if (stopped) return stopped;
    const res = await call("POST", `/v1/sandboxes/${id}/files/upload/json`, { path: b.path, content: b.content }, { timeoutMs: 120_000 });
    return passOn(id, res, () => ({ ok: true }));
  }

  async function read(address: string, id: string, filePath: string | undefined): Promise<Reply> {
    const r = ownRow(address, id);
    if (!r) return notFound();
    if (!filePath) return reply(400, { error: "invalid_request", message: "The query parameter path is required.", docs: DOC.sandboxes });
    const stopped = await ensureRunning(id);
    if (stopped) return stopped;
    const res = await call("GET", `/v1/sandboxes/${id}/files/read?path=${encodeURIComponent(filePath)}`, undefined, { timeoutMs: 60_000 });
    return passOn(id, res, (o) => ({ content: typeof o.content === "string" ? o.content : "" }));
  }

  /** Ports stay closed (goals/sandbox/ANNAHMEN.md, Goal 03): nothing goes to sandboxd. */
  function ports(address: string, id: string): Reply {
    return ownRow(address, id) ? PORTS_UNAVAILABLE : notFound();
  }

  /** Not called by the runtime (deleteSandbox is empty at the pin); the own live check cleans up with it. */
  function remove(address: string, id: string): Promise<Reply> {
    if (!ownRow(address, id)) return Promise.resolve(notFound());
    return withLock(id, async () => {
      const res = await call("DELETE", `/v1/sandboxes/${id}`, undefined, { timeoutMs: 120_000 });
      if (!res || (res.status !== 200 && res.status !== 404)) return unreachable();
      closeRun(id, now(), "deleted", "deleted");
      return reply(200, { ok: true, id, status: "deleted" });
    });
  }

  return { create, list, get, exec, upload, read, ports, remove, tick, ownerFor };
}
