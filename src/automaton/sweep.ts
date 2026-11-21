/**
 * The sweep of hosted automatons (goals/hosting/01): no sandbox stays billed without an automaton that runs in it.
 *
 * 1. A row `failed` whose sandbox still exists (running or stopped in `sandboxes`) gets its sandbox deleted. That is the
 *    sandbox of a start whose clean-up the sandbox server did not confirm, and with keep_running sandboxd never stops it.
 * 2. A row `active` without `started_at` is either from before that column or from a start a restart of the control plane
 *    cut off. Once it is older than START_TIMEOUT_MS plus SWEEP_GRACE_MS, not started in this process (`inFlight`) and its
 *    sandbox runs, the sweep asks the sandbox once with PROBE_COMMAND: the mark of `automaton-start` or a turn in the log
 *    sets `started_at` and the row is never asked again; neither of them makes it `failed` with reason `start_interrupted`,
 *    revokes its key and deletes its sandbox (or step 1 does in the next round).
 *
 * Never on suspicion: when sandboxd does not answer (the probe or the delete without 200), the row stays as it is and the
 * next round tries again. An error at one row does not hold up the others, and the sweep never throws.
 *
 * Never silent (goals/hosting/07): a delete without 200 writes `sweep could not delete sandbox <id> (<status>), retrying next
 * round`, counts in `failed` and keeps its first failure in `sweep_failures` (first_failed_at stays, last_status changes) until
 * the delete succeeds or the sandbox is gone; ops/db-report.cjs reports the rows older than an hour as undeleted_sandboxes. A
 * probe without 200 writes `sweep could not ask sandbox <id> (<status>), retrying next round` and does not count in `failed`.
 */
import type { Db } from "../db.js";
import type { SandboxService } from "../sandbox/service.js";
import { revokeAutomatonKey } from "./keys.js";
import { AUTOSTART_MARK, START_TIMEOUT_MS, TURN_PATTERN } from "./runtime.js";

/** Upload (120 s) and start (120 s) take at most 240 s; START_TIMEOUT_MS plus this grace are 390 s. */
export const SWEEP_GRACE_MS = 5 * 60_000;

/** One exec: whether the mark of `automaton-start` exists and how many turns the log holds. Never the key file of the wallet. */
export const PROBE_COMMAND =
  `if [ -e ${AUTOSTART_MARK} ]; then echo "mark=1"; else echo "mark=0"; fi; ` +
  `echo "turns=$(grep -c '${TURN_PATTERN}' /root/.automaton/run.log 2>/dev/null || true)"`;

export interface SweepOptions {
  db: Db;
  sandboxes: SandboxService;
  now: () => number;
  log: (line: string) => void;
  /** The ids whose createAs runs in this process right now. */
  inFlight: ReadonlySet<string>;
}

interface SweepRow {
  id: string;
  address: string;
  sandbox_id: string | null;
  status: string;
  created_at: string;
}

export interface SweepResult {
  removed: number;
  interrupted: number;
  /** Deletes of the sandbox of a failed automaton that sandboxd did not confirm in this round. */
  failed: number;
}

export async function sweepAutomatons(opts: SweepOptions): Promise<SweepResult> {
  const { db, sandboxes, now, log, inFlight } = opts;
  const result: SweepResult = { removed: 0, interrupted: 0, failed: 0 };
  const iso = (ms: number) => new Date(ms).toISOString();
  const setRow = (id: string, fields: Record<string, string>) => {
    const keys = Object.keys(fields);
    db.prepare(`UPDATE hosted_automatons SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`).run(
      ...keys.map((k) => fields[k]),
      iso(now()),
      id,
    );
  };
  const clearFailure = (id: string) => db.prepare("DELETE FROM sweep_failures WHERE automaton_id = ?").run(id);
  const guard = async (id: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      log(`[automaton] ${id}: sweep failed (${err instanceof Error ? err.message : String(err)})`);
    }
  };

  try {
    const active = db
      .prepare("SELECT id, address, sandbox_id, status, created_at FROM hosted_automatons WHERE status = 'active' AND started_at IS NULL")
      .all() as SweepRow[];
    for (const r of active) {
      await guard(r.id, async () => {
        if (!r.sandbox_id || inFlight.has(r.id)) return;
        const created = Date.parse(r.created_at);
        if (!Number.isFinite(created) || now() - created <= START_TIMEOUT_MS + SWEEP_GRACE_MS) return;
        if (sandboxes.row(r.address, r.sandbox_id)?.status !== "running") return;
        const res = await sandboxes.exec(r.address, r.sandbox_id, { command: PROBE_COMMAND, timeout: 30_000 }, undefined);
        if (res.status !== 200) {
          log(`[automaton] ${r.id}: sweep could not ask sandbox ${r.sandbox_id} (${res.status}), retrying next round`);
          return;
        }
        const stdout = String(res.body.stdout ?? "");
        const mark = /^mark=([01])$/m.exec(stdout)?.[1];
        const turns = /^turns=([0-9]+)$/m.exec(stdout)?.[1];
        if (mark === undefined || turns === undefined) return;
        if (mark === "1" || Number(turns) > 0) {
          setRow(r.id, { started_at: iso(now()) });
          return;
        }
        revokeAutomatonKey(db, r.address, r.id, now());
        setRow(r.id, { status: "failed", reason: "start_interrupted" });
        result.interrupted += 1;
        log(`[automaton] ${r.id}: the start was interrupted, the sweep marks it failed and deletes its sandbox`);
      });
    }

    const failed = db
      .prepare("SELECT id, address, sandbox_id, status, created_at FROM hosted_automatons WHERE status = 'failed' AND sandbox_id IS NOT NULL")
      .all() as SweepRow[];
    for (const r of failed) {
      await guard(r.id, async () => {
        if (inFlight.has(r.id)) return;
        if (!sandboxes.row(r.address, r.sandbox_id!)) {
          clearFailure(r.id);
          return;
        }
        const res = await sandboxes.remove(r.address, r.sandbox_id!);
        if (res.status !== 200) {
          result.failed += 1;
          db.prepare(
            `INSERT INTO sweep_failures (automaton_id, sandbox_id, first_failed_at, last_status) VALUES (?, ?, ?, ?)
             ON CONFLICT(automaton_id) DO UPDATE SET sandbox_id = excluded.sandbox_id, last_status = excluded.last_status`,
          ).run(r.id, r.sandbox_id, iso(now()), res.status);
          log(`[automaton] ${r.id}: sweep could not delete sandbox ${r.sandbox_id} (${res.status}), retrying next round`);
          return;
        }
        clearFailure(r.id);
        result.removed += 1;
        log(`[automaton] ${r.id}: sweep removed the sandbox of a failed automaton`);
      });
    }
  } catch (err) {
    log(`[automaton] sweep failed (${err instanceof Error ? err.message : String(err)})`);
  }
  return result;
}
