/**
 * Hosted automatons (goals/sandbox/08, docs/sandbox/automaton.md): an account starts with one POST /v1/automatons an
 * automaton that runs entirely here, in a sandbox of its own, on top of createSandboxService (src/sandbox/service.ts): the
 * same reservation, the same steps of 6 minutes, the same 402 with `details`, no second billing.
 *
 * Create: a sandbox with keep_running (sandboxd never stops it for idleness or run time), a key `automaton:<id>` of the
 * account (src/automaton/keys.ts), the setup file (src/automaton/setup.ts) uploaded to /root/.automaton-setup.json, then
 * `automaton-start` in the sandbox, which makes the runtime's wallet and config, deletes the setup file, sets the mark
 * /root/.automaton/autostart and starts the supervisor. From then on the runtime runs after every start of its container
 * (sandboxd's CONTAINER_CMD), after a crash (the supervisor) and after a reboot of the sandbox server (reconcile).
 *
 * Status: `failed` when the start in the sandbox failed or the sandbox is gone, `stopped` (with `reason`) when the sandbox
 * stopped, else `running` once the log of the runtime holds a turn and `starting` before. Nothing here ever reads the
 * key file of the runtime's wallet; the wallet address comes from automaton.json.
 */
import crypto from "node:crypto";
import type { Db } from "../db.js";
import { DOC } from "../errors.js";
import type { Reply, SandboxService } from "../sandbox/service.js";
import { createAutomatonKey, isAutomatonKey, revokeAutomatonKey } from "./keys.js";
import { START_TIMEOUT_MS, TURN_PATTERN } from "./runtime.js";
import { buildSetup, SETUP_PATH } from "./setup.js";
import { sweepAutomatons } from "./sweep.js";

export const GENESIS_MAX = 8000;
export const LOG_LINES = 200;
export { START_TIMEOUT_MS, TURN_PATTERN };
export const START_COMMAND = `AUTOMATON_HOME=/root automaton-start ${SETUP_PATH}`;
/** One exec for the status: the number of turns in the log and the wallet address from automaton.json, never the key file of the wallet. */
export const STATUS_COMMAND =
  `echo "turns=$(grep -c '${TURN_PATTERN}' /root/.automaton/run.log 2>/dev/null || true)"; ` +
  `echo "wallet=$(grep -o '\"walletAddress\": *\"0x[0-9a-fA-F]*\"' /root/.automaton/automaton.json 2>/dev/null | grep -o '0x[0-9a-fA-F]*' | head -1)"`;
export const LOG_COMMAND = `tail -n ${LOG_LINES} /root/.automaton/run.log 2>/dev/null || true`;

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/;
const ID_RE = /^[a-z0-9]{12}$/;

type Status = 200 | 201 | 400 | 402 | 403 | 404 | 409 | 501;

interface Row {
  id: string;
  address: string;
  name: string;
  sandbox_id: string | null;
  status: "active" | "failed" | "deleted";
  reason: string | null;
  created_at: string;
  started_at: string | null;
}

const reply = (status: Status, body: Record<string, unknown>): Reply => ({ status: status as Reply["status"], body });
export const automatonNotFound = (): Reply =>
  reply(404, { error: "automaton_not_found", message: "No automaton with this id belongs to this API key.", docs: DOC.automatons });
const notFound = automatonNotFound;
const invalid = (message: string): Reply => reply(400, { error: "invalid_request", message, docs: DOC.automatons });

/** The log as the customer may see it: every API key and every run of 64 hex digits (a private key) as [redacted]. */
export function redact(text: string): string {
  return text.replace(/cnwy_k_[0-9a-zA-Z]+/g, "[redacted]").replace(/(0x)?[0-9a-fA-F]{64,}/g, "[redacted]");
}

export interface AutomatonServiceOptions {
  db: Db;
  sandboxes: SandboxService;
  /** The public base the runtime calls back (conwayApiUrl and socialRelayUrl). */
  publicUrl: () => string;
  now?: () => number;
  log?: (line: string) => void;
}

export type AutomatonService = ReturnType<typeof createAutomatonService>;

export function createAutomatonService(opts: AutomatonServiceOptions) {
  const { db, sandboxes } = opts;
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((l: string) => console.log(l));
  const iso = (ms: number) => new Date(ms).toISOString();

  const ownRow = (address: string, id: string) =>
    ID_RE.test(id)
      ? (db.prepare("SELECT * FROM hosted_automatons WHERE id = ? AND address = ? AND status <> 'deleted'").get(id, address.toLowerCase()) as
          | Row
          | undefined)
      : undefined;
  const setRow = (id: string, fields: Partial<Row>) => {
    const keys = Object.keys(fields);
    db.prepare(`UPDATE hosted_automatons SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`).run(
      ...keys.map((k) => (fields as Record<string, unknown>)[k]),
      iso(now()),
      id,
    );
  };

  /** Runs one command in the sandbox of the automaton; null when it did not answer 200. */
  async function run(address: string, sandboxId: string, command: string, timeout = 30_000): Promise<{ stdout: string; exit_code: number } | null> {
    const res = await sandboxes.exec(address, sandboxId, { command, timeout }, undefined);
    if (res.status !== 200) return null;
    return { stdout: String(res.body.stdout ?? ""), exit_code: Number(res.body.exit_code ?? -1) };
  }

  async function view(r: Row): Promise<Record<string, unknown>> {
    const base = { id: r.id, name: r.name, sandbox_id: r.sandbox_id, created_at: r.created_at };
    if (r.status === "failed") return { ...base, status: "failed", reason: r.reason ?? "start_failed", wallet_address: null, turns: 0 };
    const sb = r.sandbox_id ? sandboxes.row(r.address, r.sandbox_id) : undefined;
    if (!sb) return { ...base, status: "failed", reason: "sandbox_gone", wallet_address: null, turns: 0 };
    if (sb.status !== "running") return { ...base, status: "stopped", reason: sb.stop_reason ?? "stopped", wallet_address: null, turns: null };
    const out = await run(r.address, r.sandbox_id!, STATUS_COMMAND);
    const turns = Number(/^turns=([0-9]+)/m.exec(out?.stdout ?? "")?.[1] ?? 0);
    const wallet = /^wallet=(0x[0-9a-fA-F]{40})$/m.exec(out?.stdout ?? "")?.[1] ?? null;
    return { ...base, status: turns > 0 ? "running" : "starting", wallet_address: wallet, turns };
  }

  /** The ids whose createAs runs in this process right now; the sweep leaves them alone (src/automaton/sweep.ts). */
  const inFlight = new Set<string>();
  let sweeping: Promise<{ removed: number; interrupted: number }> | null = null;

  /** Requests with an Idempotency-Key that are still running in this process, by address and key. */
  const pending = new Map<string, Promise<Reply>>();

  /**
   * POST /v1/automatons. With `Idempotency-Key` (1 to 200 characters) a repeat of the same name and genesis prompt gets the
   * automaton the first request created, without a second sandbox and without a second key: while the first one still
   * runs it waits for it, afterwards and after a restart it reads the id from hosted_automaton_requests. The same key with
   * another body answers 409 and asks nothing of sandboxd. Only when the first request created no automaton at all (402,
   * an unreachable sandbox server) does a repeat try again, under the same id.
   */
  async function create(address: string, rawKey: string | undefined, body: unknown, idempotencyKey?: string): Promise<Reply> {
    const addr = address.toLowerCase();
    if (isAutomatonKey(db, rawKey)) {
      return reply(403, {
        error: "forbidden",
        message:
          "This API key belongs to a hosted automaton, and an automaton cannot start another automaton. Nothing was started " +
          "and nothing was charged. Sandboxes of its own (POST /v1/sandboxes) stay open to it.",
        docs: DOC.automatons,
      });
    }
    const b = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
    if (typeof b.name !== "string" || !NAME_RE.test(b.name)) {
      return invalid("name is required: 1 to 64 letters, digits, spaces, dots, underscores or hyphens, starting with a letter or digit.");
    }
    const prompt = b.genesis_prompt;
    if (typeof prompt !== "string" || prompt.trim().length === 0 || prompt.length > GENESIS_MAX) {
      return invalid(`genesis_prompt is required: the text your automaton starts from, 1 to ${GENESIS_MAX} characters.`);
    }
    const newId = () => {
      let id: string;
      do id = crypto.randomBytes(9).toString("base64").toLowerCase().replace(/[^a-z0-9]/g, "").padEnd(12, "0").slice(0, 12);
      while (db.prepare("SELECT 1 FROM hosted_automatons WHERE id = ? UNION SELECT 1 FROM hosted_automaton_requests WHERE automaton_id = ?").get(id, id));
      return id;
    };
    if (idempotencyKey === undefined) return createAs(addr, newId(), b.name, prompt);
    if (idempotencyKey.length === 0 || idempotencyKey.length > 200) {
      return invalid("Idempotency-Key must be 1 to 200 characters. Nothing was started and nothing was charged.");
    }
    const hash = crypto.createHash("sha256").update(JSON.stringify([b.name, prompt])).digest("hex");
    // From here to pending.set nothing awaits, so a second request with the same key always finds the first one.
    const known = db
      .prepare("SELECT request_hash, automaton_id FROM hosted_automaton_requests WHERE address = ? AND idempotency_key = ?")
      .get(addr, idempotencyKey) as { request_hash: string; automaton_id: string } | undefined;
    if (known && known.request_hash !== hash) {
      return reply(409, {
        error: "idempotency_key_reused",
        message:
          "This Idempotency-Key was already used with another name or genesis prompt, so nothing was started and nothing " +
          "was charged. Send the same body again to get that automaton, or a new Idempotency-Key for a new one.",
        docs: DOC.automatons,
      });
    }
    const slot = `${addr}\n${idempotencyKey}`;
    const running = pending.get(slot);
    if (running) return running;
    if (known) {
      const r = db.prepare("SELECT * FROM hosted_automatons WHERE id = ? AND address = ?").get(known.automaton_id, addr) as Row | undefined;
      if (r) {
        return reply(200, {
          id: r.id,
          name: r.name,
          sandbox_id: r.sandbox_id,
          created_at: r.created_at,
          ...(r.status === "active" ? {} : { status: r.status === "deleted" ? "deleted" : "failed", reason: r.reason }),
          message:
            "This Idempotency-Key already created this automaton, so nothing new was started and nothing was charged. " +
            (r.status === "deleted"
              ? "It has been deleted since; send a new Idempotency-Key to create a new one."
              : `GET /v1/automatons/${r.id} shows its status.`),
        });
      }
    }
    // No automaton under this key yet: either the first request, or one that created none (402, sandbox server down).
    const id = known?.automaton_id ?? newId();
    if (!known) {
      db.prepare(
        "INSERT INTO hosted_automaton_requests (address, idempotency_key, request_hash, automaton_id, created_at) VALUES (?, ?, ?, ?, ?)",
      ).run(addr, idempotencyKey, hash, id, iso(now()));
    }
    const promise = createAs(addr, id, b.name, prompt).finally(() => pending.delete(slot));
    pending.set(slot, promise);
    return promise;
  }

  async function createAs(addr: string, id: string, name: string, prompt: string): Promise<Reply> {
    inFlight.add(id);
    try {
      return await startAs(addr, id, name, prompt);
    } finally {
      inFlight.delete(id);
    }
  }

  async function startAs(addr: string, id: string, name: string, prompt: string): Promise<Reply> {
    const sb = await sandboxes.create(addr, { name: `automaton-${id}` }, { keepRunning: true });
    if (sb.status !== 201 || typeof sb.body.id !== "string") return sb;
    const sandboxId = sb.body.id;
    const t = iso(now());
    db.prepare(
      "INSERT INTO hosted_automatons (id, address, name, sandbox_id, status, reason, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', NULL, ?, ?)",
    ).run(id, addr, name, sandboxId, t, t);
    const { key } = createAutomatonKey(db, addr, id, now());
    const setup = buildSetup({ db, address: addr, name: name, genesisPrompt: prompt, apiKey: key, publicUrl: opts.publicUrl() });
    const up = await sandboxes.upload(addr, sandboxId, { path: SETUP_PATH, content: JSON.stringify(setup, null, 2) });
    const started = up.status === 200 ? await run(addr, sandboxId, START_COMMAND, START_TIMEOUT_MS) : null;
    if (!started || started.exit_code !== 0 || !/AUTOMATON_START ok/.test(started.stdout)) {
      // Nothing of it may keep running or keep its key: the sandbox goes, its started step is booked, the key is revoked.
      log(`[automaton] ${id}: the start in the sandbox failed (${up.status !== 200 ? `upload ${up.status}` : started ? `exit ${started.exit_code}` : "exec"})`);
      // A sandbox the sandbox server did not confirm deleting keeps running with keep_running and stays billed until the
      // sweep deletes it (src/automaton/sweep.ts); the answer must not say it is gone.
      const removed = await sandboxes.remove(addr, sandboxId);
      const gone = removed.status === 200 || removed.status === 404;
      if (!gone) log(`[automaton] ${id}: deleting sandbox ${sandboxId} failed (${removed.status}), the sweep deletes it`);
      revokeAutomatonKey(db, addr, id, now());
      setRow(id, { status: "failed", reason: "start_failed" });
      return reply(501, {
        error: "automaton_start_failed",
        message: gone
          ? "The sandbox started, but the automaton in it did not, so the sandbox was deleted again. Its first started step " +
            "of 6 minutes was booked, nothing else. Try again in a few minutes."
          : "The sandbox started, but the automaton in it did not. The sandbox server did not confirm deleting the sandbox, " +
            "so it is deleted within a few minutes, and it is billed only until then. Try again in a few minutes.",
        id,
        docs: DOC.automatons,
      });
    }
    setRow(id, { started_at: iso(now()) });
    log(`[automaton] ${id} started in sandbox ${sandboxId}`);
    return reply(201, {
      id,
      name: name,
      status: "starting",
      sandbox_id: sandboxId,
      created_at: t,
      message:
        "Your automaton is starting in its own sandbox and usually thinks within a minute. Its sandbox and its inference are " +
        `paid from this account's credits. GET /v1/automatons/${id} shows its status, GET /v1/automatons/${id}/logs its log.`,
    });
  }

  /** `onlyId`: the key of a hosted automaton sees only itself (point 12, src/automaton/scope.ts). */
  async function list(address: string, onlyId: string | null = null): Promise<Reply> {
    const rows = (
      db
        .prepare("SELECT * FROM hosted_automatons WHERE address = ? AND status <> 'deleted' ORDER BY created_at, id")
        .all(address.toLowerCase()) as Row[]
    ).filter((r) => onlyId === null || r.id === onlyId);
    const automatons = [];
    for (const r of rows) automatons.push(await view(r));
    return reply(200, { automatons });
  }

  async function get(address: string, id: string): Promise<Reply> {
    const r = ownRow(address, id);
    return r ? reply(200, await view(r)) : notFound();
  }

  async function logs(address: string, id: string): Promise<Reply> {
    const r = ownRow(address, id);
    if (!r) return notFound();
    const sb = r.sandbox_id ? sandboxes.row(r.address, r.sandbox_id) : undefined;
    if (r.status !== "active" || !sb || sb.status !== "running") {
      return reply(200, {
        id,
        lines: [],
        message: "The automaton is not running, so there is no log to read now. Start it with POST /v1/automatons/{id}/start.",
      });
    }
    const out = await run(r.address, r.sandbox_id!, LOG_COMMAND);
    if (!out) {
      return reply(501, {
        error: "sandbox_server_unreachable",
        message: "The sandbox server cannot be reached right now, so the log could not be read. Try again in a few minutes.",
        docs: DOC.automatons,
      });
    }
    const lines = redact(out.stdout).split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    return reply(200, { id, lines: lines.slice(-LOG_LINES) });
  }

  async function stop(address: string, id: string): Promise<Reply> {
    const r = ownRow(address, id);
    if (!r) return notFound();
    if (r.status !== "active" || !r.sandbox_id) return reply(200, await view(r));
    const res = await sandboxes.stop(r.address, r.sandbox_id, "stopped");
    if (res.status !== 200 && res.status !== 404) return res;
    return reply(200, await view(r));
  }

  async function start(address: string, id: string): Promise<Reply> {
    const r = ownRow(address, id);
    if (!r) return notFound();
    if (r.status !== "active" || !r.sandbox_id) {
      return reply(409, {
        error: "automaton_failed",
        message: "This automaton failed and cannot be started again. Delete it and create a new one.",
        docs: DOC.automatons,
      });
    }
    const res = await sandboxes.start(r.address, r.sandbox_id);
    if (res.status !== 200) return res;
    return reply(200, await view(r));
  }

  async function remove(address: string, id: string): Promise<Reply> {
    const r = ownRow(address, id);
    if (!r) return notFound();
    if (r.sandbox_id && sandboxes.row(r.address, r.sandbox_id)) {
      const res = await sandboxes.remove(r.address, r.sandbox_id);
      if (res.status !== 200 && res.status !== 404) return res;
    }
    revokeAutomatonKey(db, r.address, id, now());
    setRow(id, { status: "deleted" });
    return reply(200, { ok: true, id, status: "deleted" });
  }

  /**
   * One sweep at a time (src/automaton/sweep.ts); a call while one runs gets that one. Never throws. The deletes sandboxd
   * refused (`failed` of sweepAutomatons, goals/hosting/07) stay out of this result: they reach the operator through the log
   * line and sweep_failures, and the billing round does not read the result.
   */
  function sweep(): Promise<{ removed: number; interrupted: number }> {
    sweeping ??= sweepAutomatons({ db, sandboxes, now, log, inFlight })
      .then(({ removed, interrupted }) => ({ removed, interrupted }))
      .finally(() => {
        sweeping = null;
      });
    return sweeping;
  }

  return { create, list, get, logs, stop, start, remove, sweep };
}
