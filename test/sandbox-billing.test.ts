/**
 * Billing of sandboxes after docs/sandbox/plan.md, section Preis, with a set clock.
 *
 * One ledger row `sandbox` per started step of 6 minutes, 100 mc for the small tier and 200 mc for
 * the medium one, booked in the same transaction as the balance and exactly once per step
 * (idempotent over `sandbox:<id>:<step>`); 1000 mc reserved while a sandbox runs, and the reservation
 * survives a restart of the service; the sandbox is stopped when the credit is empty, the balance
 * never goes negative, stopped time is not billed, and a call after a topup starts it again.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getAvailableMc, getBalanceMc, openDb, postLedger, reserveMc } from "../src/db.js";
import { createSandboxService } from "../src/sandbox/service.js";
import { grantLiveSandbox, LIVE_SANDBOX_GRANT } from "../src/sandbox/grant.js";
import { LIVE_SANDBOX_ADDRESS } from "../src/bounties/ours.js";
import { MINUTE, STEP, closeWorlds, sandboxWorld } from "./sandbox-world.js";

const dirs: string[] = [];
afterEach(async () => {
  await closeWorlds();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

async function started(balanceMc = 100_000, req: Record<string, unknown> = { memory_mb: 512 }, opts = {}) {
  const w = await sandboxWorld(opts);
  const a = w.account(balanceMc);
  const res = await a.call("POST", "/v1/sandboxes", req);
  expect(res.status).toBe(201);
  return { w, a, id: res.json.id as string };
}

describe("price per started step of 6 minutes", () => {
  it("books 100 mc per step for the small tier, one ledger row each, when the step ends", async () => {
    const { w, a, id } = await started();
    expect(w.sandboxRows()).toEqual([]);
    w.clock.t += STEP - 1000;
    await w.service.tick();
    expect(w.sandboxRows()).toEqual([]);
    w.clock.t += 1000;
    await w.service.tick();
    expect(w.sandboxRows(a.address)).toEqual([{ ref: `sandbox:${id}:0`, delta_mc: -100 }]);
    w.clock.t += 2 * STEP + 30_000;
    await w.service.tick();
    expect(w.sandboxRows(a.address).map((r) => r.delta_mc)).toEqual([-100, -100, -100]);
    expect(w.balance(a.address)).toBe(100_000 - 300);
  });

  it("books 200 mc per step for the medium tier", async () => {
    const { w, a, id } = await started(100_000, { vcpu: 1, memory_mb: 1024, disk_gb: 10 });
    w.clock.t += 2 * STEP;
    await w.service.tick();
    expect(w.sandboxRows(a.address)).toEqual([
      { ref: `sandbox:${id}:0`, delta_mc: -200 },
      { ref: `sandbox:${id}:1`, delta_mc: -200 },
    ]);
  });

  it("books a started step in full when the sandbox stops inside it, and only that one", async () => {
    const { w, a, id } = await started();
    w.clock.t += STEP + 10_000;
    expect((await a.call("DELETE", `/v1/sandboxes/${id}`)).status).toBe(200);
    expect(w.sandboxRows(a.address).map((r) => r.ref)).toEqual([`sandbox:${id}:0`, `sandbox:${id}:1`]);
  });
});

describe("exactly once per step", () => {
  it("is idempotent: a second tick, two ticks at once and a repeated step book nothing twice", async () => {
    const { w, a, id } = await started();
    w.clock.t += 3 * STEP;
    await Promise.all([w.service.tick(), w.service.tick()]);
    await w.service.tick();
    expect(w.sandboxRows(a.address).map((r) => r.ref)).toEqual([0, 1, 2].map((n) => `sandbox:${id}:${n}`));
    // A second service on the same database, as after a double start, books nothing again either.
    const twin = createSandboxService({ db: w.db, client: w.client, now: () => w.clock.t, log: () => {} });
    await twin.tick();
    expect(w.sandboxRows(a.address)).toHaveLength(3);
    // And the database refuses a second row for a step on its own (unique index on the ref).
    expect(() => postLedger(w.db, { address: a.address, kind: "sandbox", deltaMc: -100, ref: `sandbox:${id}:0` })).toThrow(/UNIQUE/);
  });

  it("books ledger row and balance in one transaction: a refused row leaves balance and step count as they were", async () => {
    const { w, a, id } = await started();
    w.db.exec("CREATE TRIGGER refuse_sandbox BEFORE INSERT ON ledger WHEN NEW.kind = 'sandbox' BEGIN SELECT RAISE(ABORT, 'refused'); END");
    w.clock.t += STEP;
    await expect(w.service.tick()).rejects.toThrow(/refused/);
    expect(w.balance(a.address)).toBe(100_000);
    expect(w.row(id)!.steps_billed).toBe(0);
    w.db.exec("DROP TRIGGER refuse_sandbox");
    await w.service.tick();
    expect(w.balance(a.address)).toBe(100_000 - 100);
    const sum = (w.db.prepare("SELECT sum(delta_mc) AS s FROM ledger WHERE address = ?").get(a.address) as { s: number }).s;
    expect(sum).toBe(w.balance(a.address));
  });
});

describe("reserve 1000 mc", () => {
  it("reserves 1000 mc on create, which inference cannot spend", async () => {
    const { w, a } = await started(1500);
    expect(getAvailableMc(w.db, a.address)).toBe(500);
    expect(getBalanceMc(w.db, a.address)).toBe(1500);
    expect(reserveMc(w.db, a.address, 600)).toBe(false);
    expect(reserveMc(w.db, a.address, 500)).toBe(true);
  });

  it("keeps the reservation over a restart, and the first tick after it books what is missing", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-sbx-"));
    dirs.push(dir);
    const file = path.join(dir, "cp.db");
    const { w, a, id } = await started(100_000, { memory_mb: 512 }, { db: openDb(file) });
    w.clock.t += STEP;
    await w.service.tick();
    w.db.close();
    // The service is down for 20 minutes and starts again on the same file (migrate zeroes reserved_mc).
    w.clock.t += 20 * MINUTE;
    const db = openDb(file);
    expect(getAvailableMc(db, a.address)).toBe(100_000 - 100 - 1000);
    const restarted = createSandboxService({ db, client: w.client, now: () => w.clock.t, log: () => {} });
    await restarted.tick();
    // 26 minutes of run time: four finished steps, none of them twice.
    const refs = (db.prepare("SELECT ref FROM ledger WHERE kind = 'sandbox' ORDER BY id").all() as { ref: string }[]).map((r) => r.ref);
    expect(refs).toEqual([0, 1, 2, 3].map((n) => `sandbox:${id}:${n}`));
    db.close();
    // A file database on a busy host: opening and migrating it twice takes seconds, not the default 5.
  }, 60_000);
});

describe("empty credit", () => {
  it("stops the sandbox when the credit cannot pay the next step, never with a negative balance", async () => {
    const { w, a, id } = await started(1250);
    // Ticks half a minute off the step boundaries, so the stop falls inside a started step.
    w.clock.t += 30_000;
    for (let i = 0; i < 20; i++) {
      w.clock.t += MINUTE;
      await w.service.tick();
    }
    // 12 steps of 100 leave 50; the step that began cannot be paid, so the sandbox stops in it.
    for (let i = 0; i < 60; i++) {
      w.clock.t += MINUTE;
      await w.service.tick();
      if (w.row(id)!.status === "stopped") break;
    }
    expect(w.row(id)).toMatchObject({ status: "stopped", stop_reason: "credit", hold_mc: 0 });
    expect(w.hits).toContain(`POST /v1/sandboxes/${id}/stop`);
    expect(w.balance(a.address)).toBe(0);
    const rows = w.sandboxRows(a.address);
    expect(rows.at(-1)!.delta_mc).toBe(-50);
    for (const r of rows) expect(r.delta_mc).toBeLessThan(0);
    expect((w.db.prepare("SELECT min(balance_mc) AS m FROM wallets").get() as { m: number }).m).toBeGreaterThanOrEqual(0);
    expect(w.d.sandboxes()[id].status).toBe("stopped");
  });

  it("bills no stopped time", async () => {
    const { w, a, id } = await started(1250);
    w.clock.t += 80 * MINUTE;
    await w.service.tick();
    await w.service.tick();
    const count = w.sandboxRows(a.address).length;
    expect(w.row(id)!.status).toBe("stopped");
    w.clock.t += 5 * 60 * MINUTE;
    await w.service.tick();
    expect(w.sandboxRows(a.address).length).toBe(count);
  });

  it("bills a sandbox that sandboxd stopped only up to its stopped_at", async () => {
    const { w, a, id } = await started(1_000_000);
    // sandboxd stops it after 24 hours without a call (idle sweep), the control plane looks at 30 hours.
    w.clock.t += 24 * 60 * MINUTE + 3 * MINUTE;
    await w.d.sweep();
    w.clock.t += 6 * 60 * MINUTE;
    await w.service.tick();
    expect(w.row(id)).toMatchObject({ status: "stopped", stop_reason: "sandboxd", hold_mc: 0 });
    // 24 h 3 min ran: 241 started steps, not 300.
    expect(w.sandboxRows(a.address)).toHaveLength(241);
  });
});

describe("topup starts it again", () => {
  it("answers 402 while the credit cannot hold the reservation, and starts the stopped sandbox after a topup", async () => {
    const { w, a, id } = await started(1250);
    w.clock.t += 80 * MINUTE;
    await w.service.tick();
    await w.service.tick();
    expect(w.row(id)!.status).toBe("stopped");
    const refused = await a.call("POST", `/v1/sandboxes/${id}/exec`, { command: "echo ok" });
    expect(refused.status).toBe(402);
    expect(refused.json.details).toEqual({ required_cents: 1, current_balance_cents: 0 });
    expect(w.execs()).toHaveLength(0);
    w.topup(a.address, 5000);
    const res = await a.call("POST", `/v1/sandboxes/${id}/exec`, { command: "echo ok" });
    expect(res.status).toBe(200);
    expect(res.json.stdout).toBe("ok\n");
    expect(w.row(id)).toMatchObject({ status: "running", hold_mc: 1000 });
    expect(w.hits).toContain(`POST /v1/sandboxes/${id}/start`);
    const before = w.sandboxRows(a.address).length;
    const next = w.row(id)!.steps_billed as number;
    w.clock.t += STEP;
    await w.service.tick();
    const rows = w.sandboxRows(a.address);
    expect(rows).toHaveLength(before + 1);
    expect(rows.at(-1)).toEqual({ ref: `sandbox:${id}:${next}`, delta_mc: -100 });
  });
});

describe("the credit of the live-sandbox account", () => {
  it("books 100000 mc once as internal_grant, outside the starter pot, and only where the account exists", () => {
    const db = openDb(":memory:");
    expect(grantLiveSandbox(db)).toEqual({ granted: false, reason: "no_account" });
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(LIVE_SANDBOX_ADDRESS, new Date().toISOString());
    expect(grantLiveSandbox(db)).toEqual({ granted: true });
    expect(grantLiveSandbox(db)).toEqual({ granted: false, reason: "already_granted" });
    expect(getBalanceMc(db, LIVE_SANDBOX_ADDRESS)).toBe(LIVE_SANDBOX_GRANT.mc);
    expect(LIVE_SANDBOX_GRANT.mc).toBe(100_000);
    const rows = db.prepare("SELECT kind, ref, delta_mc FROM ledger WHERE address = ?").all(LIVE_SANDBOX_ADDRESS);
    expect(rows).toEqual([{ kind: "internal_grant", ref: "grant:live-sandbox", delta_mc: 100_000 }]);
    expect((db.prepare("SELECT count(*) AS n FROM ledger WHERE kind = 'grant'").get() as { n: number }).n).toBe(0);
  });
});
