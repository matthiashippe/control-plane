/**
 * The sweep of hosted automatons (goals/hosting/01, points 1 and 2): no sandbox stays billed without an automaton that runs
 * in it. Through the real automaton service, the real sandbox service, the real signed client and the rebuilt sandboxd of
 * test/sandbox-world.ts, on the clock of that world. Only the upload of the setup file is held back in the cases that
 * stand for a start cut off by a restart; the sweep itself is never replaced.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { createAutomatonService, START_TIMEOUT_MS } from "../src/automaton/service.js";
import { PROBE_COMMAND, SWEEP_GRACE_MS, sweepAutomatons } from "../src/automaton/sweep.js";
import { createSandboxService, type SandboxService } from "../src/sandbox/service.js";
import { closeWorlds, STEP } from "./sandbox-world.js";
import { automatonWorld } from "./automaton-world.js";

afterEach(closeWorlds);

const PROMPT = "Watch the price of one thing and write a short note about it every hour.";
const DEADLINE = START_TIMEOUT_MS + SWEEP_GRACE_MS;

type World = Awaited<ReturnType<typeof automatonWorld>>;

/** An automaton service of one process on the clock of the world, with an app that serves its routes. */
function hosted(w: World, sandboxes: SandboxService = w.service) {
  const lines: string[] = [];
  const svc = createAutomatonService({ db: w.db, sandboxes, publicUrl: () => "https://example.dev", now: () => w.clock.t, log: (l) => lines.push(l) });
  const app = createApp({ db: w.db, sandbox: sandboxes, automatons: svc, rateLimit: null });
  const call = async (key: string, method: string, target: string) => {
    const res = await app.request(target, { method, headers: { authorization: key } });
    return { status: res.status, json: (await res.json()) as any };
  };
  return { svc, app, call, lines };
}

/** A sandbox service whose upload never answers: the process stops right there, as a restart in that moment would. */
const stuckUpload = (s: SandboxService): SandboxService => ({ ...s, upload: () => new Promise(() => {}) });

const automatonRow = (w: World, id: string) => w.db.prepare("SELECT * FROM hosted_automatons WHERE id = ?").get(id) as Record<string, any>;
const keyRevoked = (w: World, id: string) =>
  (w.db.prepare("SELECT revoked_at FROM api_keys WHERE name = ?").get(`automaton:${id}`) as { revoked_at: string | null }).revoked_at !== null;
const ledgerOf = (w: World, sandboxId: string) => w.sandboxRows().filter((r) => r.ref.startsWith(`sandbox:${sandboxId}:`));
const deletes = (w: World, sandboxId: string) => w.hits.filter((h) => h === `DELETE /v1/sandboxes/${sandboxId}`).length;
const probes = (w: World) => w.execs().filter((c) => c.args[c.args.length - 1] === PROBE_COMMAND).length;

/** Thirty minutes of the clock with a billing tick every step. */
async function halfAnHour(w: World) {
  for (let i = 0; i < 5; i++) {
    w.clock.t += STEP;
    await w.service.tick();
  }
}

/** Starts a create in a process whose upload never answers and waits until its row `active` is written. */
async function cutOffStart(w: World) {
  const acct = w.account();
  const a = hosted(w, stuckUpload(w.service));
  void a.svc.create(acct.address, acct.key, { name: "cut-off", genesis_prompt: PROMPT });
  for (let i = 0; i < 200 && !w.db.prepare("SELECT 1 FROM hosted_automatons WHERE address = ?").get(acct.address); i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  const row = w.db.prepare("SELECT * FROM hosted_automatons WHERE address = ?").get(acct.address) as Record<string, any>;
  expect(row).toMatchObject({ status: "active", started_at: null });
  return { acct, a, id: row.id as string, sandboxId: row.sandbox_id as string, createdAt: Date.parse(row.created_at) };
}

describe("a start that failed and whose sandbox the sandbox server did not delete", () => {
  it("is failed, says nothing about deleted again, and its sandbox still runs", async () => {
    const w = await automatonWorld({ startFails: true, answer: (m) => (m === "DELETE" ? { status: 500, body: { error: "down" } } : undefined) });
    const acct = w.account();
    const { svc, lines } = hosted(w);
    const res = await svc.create(acct.address, acct.key, { name: "failing", genesis_prompt: PROMPT });
    expect(res.status).toBe(501);
    expect(res.body.error).toBe("automaton_start_failed");
    expect(String(res.body.message)).not.toMatch(/deleted again/);
    expect(String(res.body.message)).toMatch(/within a few minutes/);
    const row = automatonRow(w, String(res.body.id));
    expect(row).toMatchObject({ status: "failed", reason: "start_failed", started_at: null });
    expect(w.d.sandboxes()[row.sandbox_id].status).toBe("running");
    expect(w.row(row.sandbox_id)).toMatchObject({ status: "running" });
    expect(lines.some((l) => /the sweep deletes it/.test(l))).toBe(true);
  });

  it("gets its sandbox deleted by the next sweep, and after it tick books no ledger row of that sandbox for 30 minutes", async () => {
    let down = true;
    const w = await automatonWorld({ startFails: true, answer: (m) => (down && m === "DELETE" ? { status: 500, body: { error: "down" } } : undefined) });
    const acct = w.account();
    const { svc, lines } = hosted(w);
    const res = await svc.create(acct.address, acct.key, { name: "failing", genesis_prompt: PROMPT });
    const sandboxId = automatonRow(w, String(res.body.id)).sandbox_id as string;
    down = false;
    expect(await svc.sweep()).toEqual({ removed: 1, interrupted: 0 });
    expect(w.d.sandboxes()[sandboxId]).toBeUndefined();
    expect(w.row(sandboxId)).toMatchObject({ status: "deleted", hold_mc: 0 });
    expect(lines).toContain(`[automaton] ${res.body.id}: sweep removed the sandbox of a failed automaton`);
    const booked = ledgerOf(w, sandboxId).length;
    await halfAnHour(w);
    expect(ledgerOf(w, sandboxId)).toHaveLength(booked);
  });

  it("keeps the 501 that says deleted again when the sandbox server deleted it", async () => {
    const w = await automatonWorld({ startFails: true });
    const acct = w.account();
    const res = await hosted(w).svc.create(acct.address, acct.key, { name: "failing", genesis_prompt: PROMPT });
    expect(res.status).toBe(501);
    expect(String(res.body.message)).toMatch(/deleted again/);
  });
});

describe("sweepAutomatons", () => {
  it("changes no row and does not throw while sandboxd does not answer", async () => {
    let down = false;
    const w = await automatonWorld({ answer: () => (down ? { status: 503, body: { error: "down" } } : undefined) });
    const acct = w.account();
    const { svc } = hosted(w);
    // A failed one whose sandbox still exists, and an old active one without started_at.
    const ok = await svc.create(acct.address, acct.key, { name: "old", genesis_prompt: PROMPT });
    w.db.prepare("UPDATE hosted_automatons SET started_at = NULL WHERE id = ?").run(ok.body.id);
    const other = w.account();
    const second = await svc.create(other.address, other.key, { name: "broken", genesis_prompt: PROMPT });
    w.db.prepare("UPDATE hosted_automatons SET status = 'failed', reason = 'start_failed' WHERE id = ?").run(second.body.id);
    w.clock.t += DEADLINE + 60_000;
    down = true;
    const before = { automatons: w.db.prepare("SELECT * FROM hosted_automatons ORDER BY id").all(), sandboxes: w.db.prepare("SELECT * FROM sandboxes ORDER BY id").all() };
    await expect(svc.sweep()).resolves.toEqual({ removed: 0, interrupted: 0 });
    expect(w.db.prepare("SELECT * FROM hosted_automatons ORDER BY id").all()).toEqual(before.automatons);
    expect(w.db.prepare("SELECT * FROM sandboxes ORDER BY id").all()).toEqual(before.sandboxes);
  });

  it("marks a start a restart cut off failed with start_interrupted after START_TIMEOUT_MS plus SWEEP_GRACE_MS plus 1 ms", async () => {
    const w = await automatonWorld();
    const { acct, id, sandboxId, createdAt } = await cutOffStart(w);
    // The restart: a new process on the same database, with a sandbox service and an automaton service of its own.
    const fresh = createSandboxService({ db: w.db, client: w.client, now: () => w.clock.t, log: () => {} });
    const b = hosted(w, fresh);
    w.clock.t = createdAt + DEADLINE + 1;
    expect(await b.svc.sweep()).toEqual({ removed: 1, interrupted: 1 });
    expect(automatonRow(w, id)).toMatchObject({ status: "failed", reason: "start_interrupted", started_at: null });
    expect(keyRevoked(w, id)).toBe(true);
    expect(w.d.sandboxes()[sandboxId]).toBeUndefined();
    expect(w.row(sandboxId)).toMatchObject({ status: "deleted", hold_mc: 0 });
    const booked = ledgerOf(w, sandboxId).length;
    await halfAnHour(w);
    expect(ledgerOf(w, sandboxId)).toHaveLength(booked);
    // GET /v1/automatons/<id> after the restart.
    const got = await b.call(acct.key, "GET", `/v1/automatons/${id}`);
    expect(got.status).toBe(200);
    expect(got.json).toMatchObject({ id, status: "failed", reason: "start_interrupted" });
  });

  it("leaves the same row active 1 ms before the deadline", async () => {
    const w = await automatonWorld();
    const { id, sandboxId, createdAt } = await cutOffStart(w);
    const b = hosted(w, createSandboxService({ db: w.db, client: w.client, now: () => w.clock.t, log: () => {} }));
    w.clock.t = createdAt + DEADLINE - 1;
    expect(await b.svc.sweep()).toEqual({ removed: 0, interrupted: 0 });
    expect(automatonRow(w, id)).toMatchObject({ status: "active", started_at: null });
    expect(keyRevoked(w, id)).toBe(false);
    expect(w.d.sandboxes()[sandboxId].status).toBe("running");
    expect(probes(w)).toBe(0);
  });

  it("leaves a start that still runs in this process alone after the deadline (inFlight)", async () => {
    const w = await automatonWorld();
    const { a, id, sandboxId, createdAt } = await cutOffStart(w);
    w.clock.t = createdAt + DEADLINE + 60_000;
    expect(await a.svc.sweep()).toEqual({ removed: 0, interrupted: 0 });
    // The same through sweepAutomatons with the set of ids that run in this process.
    const direct = await sweepAutomatons({ db: w.db, sandboxes: w.service, now: () => w.clock.t, log: () => {}, inFlight: new Set([id]) });
    expect(direct).toEqual({ removed: 0, interrupted: 0 });
    expect(automatonRow(w, id)).toMatchObject({ status: "active", started_at: null });
    expect(keyRevoked(w, id)).toBe(false);
    expect(w.d.sandboxes()[sandboxId].status).toBe("running");
    expect(probes(w)).toBe(0);
  });

  it("keeps an old active row without started_at that has the mark active, sets started_at and asks it never again", async () => {
    const w = await automatonWorld();
    const acct = w.account();
    const { svc } = hosted(w);
    const res = await svc.create(acct.address, acct.key, { name: "before-the-column", genesis_prompt: PROMPT });
    const id = String(res.body.id);
    const sandboxId = String(res.body.sandbox_id);
    w.db.prepare("UPDATE hosted_automatons SET started_at = NULL WHERE id = ?").run(id);
    w.clock.t += DEADLINE + 60_000;
    expect(await svc.sweep()).toEqual({ removed: 0, interrupted: 0 });
    expect(automatonRow(w, id)).toMatchObject({ status: "active", started_at: new Date(w.clock.t).toISOString() });
    expect(w.d.sandboxes()[sandboxId].status).toBe("running");
    expect(keyRevoked(w, id)).toBe(false);
    expect(probes(w)).toBe(1);
    await svc.sweep();
    expect(probes(w)).toBe(1);
  });

  it("keeps an old active row without started_at and without the mark active when its log holds a turn", async () => {
    const w = await automatonWorld();
    const acct = w.account();
    const { svc } = hosted(w);
    const res = await svc.create(acct.address, acct.key, { name: "turns-only", genesis_prompt: PROMPT });
    const id = String(res.body.id);
    const sandboxId = String(res.body.sandbox_id);
    w.db.prepare("UPDATE hosted_automatons SET started_at = NULL WHERE id = ?").run(id);
    w.started.delete(`sbx-${sandboxId}`);
    w.logOf(sandboxId, "[2026-11-17] Turn abc_1: 2 tools\n");
    w.clock.t += DEADLINE + 60_000;
    expect(await svc.sweep()).toEqual({ removed: 0, interrupted: 0 });
    expect(automatonRow(w, id)).toMatchObject({ status: "active" });
    expect(automatonRow(w, id).started_at).not.toBeNull();
    expect(w.d.sandboxes()[sandboxId].status).toBe("running");
  });

  it("deletes nothing twice in two sweeps in a row", async () => {
    const w = await automatonWorld();
    const { id, sandboxId, createdAt } = await cutOffStart(w);
    const b = hosted(w, createSandboxService({ db: w.db, client: w.client, now: () => w.clock.t, log: () => {} }));
    w.clock.t = createdAt + DEADLINE + 1;
    expect(await b.svc.sweep()).toEqual({ removed: 1, interrupted: 1 });
    expect(await b.svc.sweep()).toEqual({ removed: 0, interrupted: 0 });
    expect(deletes(w, sandboxId)).toBe(1);
    expect(automatonRow(w, id)).toMatchObject({ status: "failed", reason: "start_interrupted" });
  });
});

describe("started_at", () => {
  it("is set by a successful start right after AUTOMATON_START ok", async () => {
    const w = await automatonWorld();
    const acct = w.account();
    const res = await hosted(w).svc.create(acct.address, acct.key, { name: "started", genesis_prompt: PROMPT });
    expect(res.status).toBe(201);
    expect(automatonRow(w, String(res.body.id)).started_at).toBe(new Date(w.clock.t).toISOString());
  });

  it("is migrated into a database whose hosted_automatons lacks it, and a second open changes nothing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-sweep-"));
    try {
      const file = path.join(dir, "old.db");
      const old = new Database(file);
      old.exec(`
        CREATE TABLE hosted_automatons (
          id TEXT PRIMARY KEY, address TEXT NOT NULL, name TEXT NOT NULL, sandbox_id TEXT, status TEXT NOT NULL,
          reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        INSERT INTO hosted_automatons VALUES ('aaaaaaaaaaaa', '0x01', 'old', 'sbx1', 'active', NULL, '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z');
      `);
      old.close();
      const columns = (db: ReturnType<typeof openDb>) =>
        (db.prepare("PRAGMA table_info(hosted_automatons)").all() as { name: string }[]).map((c) => c.name);
      const first = openDb(file);
      expect(columns(first)).toContain("started_at");
      expect(first.prepare("SELECT id, started_at FROM hosted_automatons").all()).toEqual([{ id: "aaaaaaaaaaaa", started_at: null }]);
      const after = columns(first);
      first.close();
      const second = openDb(file);
      expect(columns(second)).toEqual(after);
      expect(second.prepare("SELECT count(*) AS n FROM hosted_automatons").get()).toEqual({ n: 1 });
      second.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
