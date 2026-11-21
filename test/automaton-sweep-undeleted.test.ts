/**
 * A sandbox the sweep cannot delete is no longer silent (goals/hosting/07): every failed delete of the sandbox of a failed
 * automaton writes a log line, counts in `failed` and keeps its first failure in `sweep_failures` until the delete succeeds;
 * a probe without 200 writes a line of its own; ops/db-report.cjs reports the failures older than an hour as
 * undeleted_sandboxes. Through the real automaton service, the real sandbox service and the rebuilt sandboxd of
 * test/sandbox-world.ts, whose DELETE answers what the case needs; the sweep and the report are never replaced.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { createAutomatonService, START_TIMEOUT_MS } from "../src/automaton/service.js";
import { SWEEP_GRACE_MS, sweepAutomatons } from "../src/automaton/sweep.js";
import { closeWorlds, STEP } from "./sandbox-world.js";
import { automatonWorld } from "./automaton-world.js";

afterEach(closeWorlds);

const PROMPT = "Watch the price of one thing and write a short note about it every hour.";
const HOUR = 3_600_000;

type World = Awaited<ReturnType<typeof automatonWorld>>;
type Answer = { status: number; body: unknown } | undefined;

function hosted(w: World) {
  const lines: string[] = [];
  const log = (l: string) => lines.push(l);
  const svc = createAutomatonService({ db: w.db, sandboxes: w.service, publicUrl: () => "https://example.dev", now: () => w.clock.t, log });
  /**
   * One round of the sweep on the clock of the world, as the billing round runs it, with nothing in flight. Called directly
   * because `sweep()` of the automaton service keeps its result to removed and interrupted (goals/hosting/ANNAHMEN.md, Goal 07).
   */
  const sweep = () => sweepAutomatons({ db: w.db, sandboxes: w.service, now: () => w.clock.t, log, inFlight: new Set() });
  return { svc, sweep, lines };
}

const failures = (w: World) => w.db.prepare("SELECT * FROM sweep_failures ORDER BY automaton_id").all() as Record<string, any>[];
const ledgerOf = (w: World, sandboxId: string) => w.sandboxRows().filter((r) => r.ref.startsWith(`sandbox:${sandboxId}:`));

/** A world whose DELETE answers `deleteAnswer()` and a failed automaton whose sandbox sandboxd did not delete. */
async function failedWithSandbox(deleteAnswer: () => Answer, opts: { db?: ReturnType<typeof openDb>; t0?: number } = {}) {
  const w = await automatonWorld({ ...opts, startFails: true, answer: (m) => (m === "DELETE" ? deleteAnswer() : undefined) });
  const acct = w.account();
  const h = hosted(w);
  const res = await h.svc.create(acct.address, acct.key, { name: "failing", genesis_prompt: PROMPT });
  expect(res.status).toBe(501);
  const id = String(res.body.id);
  const sandboxId = (w.db.prepare("SELECT sandbox_id FROM hosted_automatons WHERE id = ?").get(id) as { sandbox_id: string }).sandbox_id;
  expect(w.row(sandboxId)).toMatchObject({ status: "running" });
  return { w, ...h, id, sandboxId };
}

describe("a delete the sandbox server refuses", () => {
  const refusals = [
    { status: 500, body: { error: "internal" } },
    { status: 409, body: { error: "conflict" } },
  ];
  for (const refused of refusals) {
    it(`with status ${refused.status} counts as failed, writes the line and keeps the first failure`, async () => {
      const { w, sweep, lines, id, sandboxId } = await failedWithSandbox(() => refused);
      expect(await sweep()).toEqual({ removed: 0, interrupted: 0, failed: 1 });
      expect(lines).toContain(`[automaton] ${id}: sweep could not delete sandbox ${sandboxId} (501), retrying next round`);
      expect(failures(w)).toEqual([{ automaton_id: id, sandbox_id: sandboxId, first_failed_at: new Date(w.clock.t).toISOString(), last_status: 501 }]);
      expect(w.row(sandboxId)).toMatchObject({ status: "running" });
    });
  }

  it("keeps first_failed_at at a second failed sweep an hour later", async () => {
    const { w, sweep, lines, id, sandboxId } = await failedWithSandbox(() => ({ status: 500, body: { error: "down" } }));
    expect(await sweep()).toEqual({ removed: 0, interrupted: 0, failed: 1 });
    const first = new Date(w.clock.t).toISOString();
    w.clock.t += HOUR;
    expect(await sweep()).toEqual({ removed: 0, interrupted: 0, failed: 1 });
    expect(failures(w)).toEqual([{ automaton_id: id, sandbox_id: sandboxId, first_failed_at: first, last_status: 501 }]);
    expect(lines.filter((l) => l.includes("sweep could not delete sandbox"))).toHaveLength(2);
  });

  it("is forgotten once the delete succeeds, and no ledger row of that sandbox follows for 30 minutes", async () => {
    let down = true;
    const { w, sweep, lines, id, sandboxId } = await failedWithSandbox(() => (down ? { status: 500, body: { error: "down" } } : undefined));
    expect(await sweep()).toEqual({ removed: 0, interrupted: 0, failed: 1 });
    expect(failures(w)).toHaveLength(1);
    down = false;
    expect(await sweep()).toEqual({ removed: 1, interrupted: 0, failed: 0 });
    expect(failures(w)).toEqual([]);
    expect(lines).toContain(`[automaton] ${id}: sweep removed the sandbox of a failed automaton`);
    expect(w.row(sandboxId)).toMatchObject({ status: "deleted", hold_mc: 0 });
    const booked = ledgerOf(w, sandboxId).length;
    for (let i = 0; i < 5; i++) {
      w.clock.t += STEP;
      await w.service.tick();
    }
    expect(ledgerOf(w, sandboxId)).toHaveLength(booked);
  });
});

describe("a probe the sandbox server does not answer", () => {
  it("writes the line could not ask, counts nothing as failed and leaves the row active", async () => {
    let down = false;
    const w = await automatonWorld({ answer: (m, p) => (down && m === "POST" && p.endsWith("/exec") ? { status: 503, body: { error: "down" } } : undefined) });
    const acct = w.account();
    const { svc, sweep, lines } = hosted(w);
    const res = await svc.create(acct.address, acct.key, { name: "old", genesis_prompt: PROMPT });
    const id = String(res.body.id);
    const sandboxId = String(res.body.sandbox_id);
    w.db.prepare("UPDATE hosted_automatons SET started_at = NULL WHERE id = ?").run(id);
    w.clock.t += START_TIMEOUT_MS + SWEEP_GRACE_MS + 60_000;
    down = true;
    expect(await sweep()).toEqual({ removed: 0, interrupted: 0, failed: 0 });
    expect(lines.filter((l) => l.startsWith(`[automaton] ${id}: sweep could not ask sandbox ${sandboxId} (`) && l.endsWith("), retrying next round"))).toHaveLength(1);
    expect(w.db.prepare("SELECT status, started_at FROM hosted_automatons WHERE id = ?").get(id)).toEqual({ status: "active", started_at: null });
    expect(failures(w)).toEqual([]);
  });
});

describe("undeleted_sandboxes in ops/db-report.cjs", () => {
  /** Runs ops/db-report.cjs the way ops/status.sh does, with CP_DB_PATH on a database of the test. */
  const report = (file: string) =>
    JSON.parse(execFileSync("node", ["ops/db-report.cjs"], { env: { ...process.env, CP_DB_PATH: file }, encoding: "utf-8" })) as Record<string, any>;

  async function withFailure(ageMs: number, fn: (db: ReturnType<typeof openDb>, id: string) => void = () => {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-undeleted-"));
    const file = path.join(dir, "cp.db");
    try {
      const db = openDb(file);
      const { w, sweep, id } = await failedWithSandbox(() => ({ status: 500, body: { error: "down" } }), { db, t0: Date.now() - ageMs });
      expect(await sweep()).toEqual({ removed: 0, interrupted: 0, failed: 1 });
      expect(failures(w)).toHaveLength(1);
      fn(db, id);
      db.close();
      return report(file);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it("is 1 for a failure two hours old", async () => {
    expect((await withFailure(2 * HOUR)).undeleted_sandboxes).toBe(1);
  });

  it("is 0 for a failure 30 minutes old", async () => {
    expect((await withFailure(HOUR / 2)).undeleted_sandboxes).toBe(0);
  });

  it("is 0 once the automaton is deleted", async () => {
    const r = await withFailure(2 * HOUR, (db, id) => db.prepare("UPDATE hosted_automatons SET status = 'deleted' WHERE id = ?").run(id));
    expect(r.undeleted_sandboxes).toBe(0);
  });

  it("is null without the table, and the rest of the report still reads", async () => {
    const r = await withFailure(2 * HOUR, (db) => db.exec("DROP TABLE sweep_failures"));
    expect(r.undeleted_sandboxes).toBeNull();
    expect(r.wallets).toBe(1);
    expect(r.automatons).toBe(0);
    expect(r.stuck_payments).toBe(0);
  });
});
