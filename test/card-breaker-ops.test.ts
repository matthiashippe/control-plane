import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { openDb } from "../src/db.js";

/*
 * ops/card-breaker.sh (goals/wache/01, point 4), offline. A stand-in `ssh` and `docker` sit first in PATH inside a folder from
 * mkdtemp: `ssh` runs the remote command right here with the script on stdin, and `docker exec deploy-cp-1 node <args...>` runs
 * node here from the repo root with tsx (so `better-sqlite3` and the TypeScript of src/payments/card-way.ts resolve), with
 * CP_DB_PATH on a database this file builds with openDb. CP_CARD_WAY_JS points the script at src/payments/card-way.ts instead of
 * the compiled /app/dist/payments/card-way.js of the container. No network, no port, no real server. Fixed clock via CP_WINDOW_NOW.
 */

const ROOT = join(__dirname, "..");
const SCRIPT = join(ROOT, "ops", "card-breaker.sh");
const STATUS = join(ROOT, "ops", "status.sh");
const CARD_WAY = join(ROOT, "src", "payments", "card-way.ts");
const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A made-up address that appears nowhere else, so finding it in an output can only mean the script read it. */
const ADDRESS = "0x" + "ab".repeat(20);
const ADDRESS_RE = /0x[0-9a-fA-F]{40}/;
const LINE_RE = /^card_refunds_60d \d+ shortfall_usd \d+\.\d{2} breaker (on|off)$/;

const NOW = "2026-11-22T12:00:00Z";
const DAY_MS = 86_400_000;
const daysBefore = (now: string, days: number) => new Date(Date.parse(now) - days * DAY_MS).toISOString();

type Order = { id: string; mode?: "live" | "test"; status?: string; shortfall: number; updated: string };

function makeDb(dir: string, orders: Order[] | null): string {
  const path = join(dir, "cp.db");
  if (orders === null) {
    // Another table, so "no card_orders" means exactly that and not an empty file.
    const db = new Database(path);
    db.exec("CREATE TABLE ledger (id INTEGER PRIMARY KEY, amount_mc INTEGER)");
    db.close();
    return path;
  }
  const db = openDb(path);
  const add = db.prepare(
    "INSERT INTO card_orders (order_id, product_id, address, mode, status, credited_mc, reversed_mc, shortfall_mc, created_at, " +
      "updated_at) VALUES (?, '771280', ?, ?, ?, ?, 0, ?, ?, ?)",
  );
  for (const o of orders) {
    add.run(o.id, ADDRESS, o.mode ?? "live", o.status ?? "reversed", o.shortfall, o.shortfall, o.updated, o.updated);
  }
  db.close();
  return path;
}

function fakeTools(bin: string, dbPath: string, sshFails: boolean, dockerLog: string) {
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, "ssh"),
    sshFails
      ? // A connection that drops mid-answer: some output, then the exit of ssh, which alone must decide.
        "#!/usr/bin/env bash\necho 'card_refunds_60d 9 shortfall_usd 9.99 breaker off'\nexit 255\n"
      : [
          "#!/usr/bin/env bash",
          // Only the call of ops/card-breaker.sh runs here; every other ssh of ops/status.sh gets no answer.
          'cmd="${@: -1}"',
          'case "$cmd" in *"bash -s -- --container") exec bash -c "$cmd" ;; *) exit 255 ;; esac',
          "",
        ].join("\n"),
  );
  writeFileSync(
    join(bin, "docker"),
    [
      "#!/usr/bin/env bash",
      `printf '%s %s %s %s\\n' "$1" "$2" "$3" "$4" >> ${JSON.stringify(dockerLog)}`,
      // docker exec <container> node <args...>: run node here as the container would, with tsx for the TypeScript module.
      '[ "$1" = exec ] && [ "$2" = deploy-cp-1 ] && [ "$3" = node ] || exit 1',
      "shift 3",
      `cd ${JSON.stringify(ROOT)} || exit 1`,
      `export CP_DB_PATH=${JSON.stringify(dbPath)}`,
      'exec node --import tsx "$@"',
      "",
    ].join("\n"),
  );
  chmodSync(join(bin, "ssh"), 0o755);
  chmodSync(join(bin, "docker"), 0o755);
}

function baseEnv(dir: string, bin: string, now: string, module: string): Record<string, string> {
  return {
    PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
    HOME: dir,
    CP_DEPLOY_HOST: "test@host.invalid",
    CP_DEPLOY_KEY: join(dir, "no-such-key"),
    CP_WINDOW_NOW: now,
    CP_CARD_WAY_JS: module,
  };
}

type Setup = { orders?: Order[] | null; sshFails?: boolean; now?: string; module?: string; noDb?: boolean };

function setup({ orders = [], sshFails = false, now = NOW, module = CARD_WAY, noDb = false }: Setup = {}) {
  const dir = mkdtempSync(join(tmpdir(), "cp-card-breaker-"));
  dirs.push(dir);
  const bin = join(dir, "bin");
  const dbPath = noDb ? join(dir, "no-such.db") : makeDb(dir, orders);
  const dockerLog = join(dir, "docker.log");
  writeFileSync(dockerLog, "");
  fakeTools(bin, dbPath, sshFails, dockerLog);
  const run = (at: string = now) => {
    const r = spawnSync("bash", [SCRIPT], { env: baseEnv(dir, bin, at, module), encoding: "utf8", timeout: 60_000 });
    return { code: r.status, out: `${r.stdout}${r.stderr}`, lines: r.stdout.trim().split("\n") };
  };
  return { dir, bin, dbPath, run, module, docker: () => readFileSync(dockerLog, "utf8") };
}

describe("ops/card-breaker.sh", () => {
  it("prints card_refunds_60d, shortfall_usd and breaker off below the limit", () => {
    const s = setup({
      orders: [
        { id: "live-1", shortfall: 4_999_999, updated: daysBefore(NOW, 10) },
        // A test order never counts, a booked live order is no refund.
        { id: "test-1", mode: "test", shortfall: 5_000_000, updated: daysBefore(NOW, 1) },
        { id: "booked-1", status: "booked", shortfall: 5_000_000, updated: daysBefore(NOW, 1) },
      ],
    });
    const r = s.run();
    expect(r.code, r.out).toBe(0);
    expect(r.lines).toEqual(["card_refunds_60d 1 shortfall_usd 49.99 breaker off"]);
    expect(s.docker()).toContain("exec deploy-cp-1 node -e");
  });

  it("prints breaker on at the limit and off again once the refund is older than 60 days", () => {
    const s = setup({
      orders: [
        { id: "old", shortfall: 3_000_000, updated: daysBefore(NOW, 59) },
        { id: "new", shortfall: 2_000_000, updated: daysBefore(NOW, 1) },
      ],
    });
    const on = s.run();
    expect(on.code, on.out).toBe(0);
    expect(on.lines).toEqual(["card_refunds_60d 2 shortfall_usd 50.00 breaker on"]);
    // Two days later the older refund lies 61 days back and falls out of the window: the checkout opens by itself.
    const off = s.run(daysBefore(NOW, -2));
    expect(off.code, off.out).toBe(0);
    expect(off.lines).toEqual(["card_refunds_60d 1 shortfall_usd 20.00 breaker off"]);
  });

  it("rounds the shortfall down to the cent", () => {
    const big = setup({ orders: [{ id: "a", shortfall: 1_234_567_999, updated: daysBefore(NOW, 3) }] }).run();
    expect(big.code, big.out).toBe(0);
    expect(big.lines).toEqual(["card_refunds_60d 1 shortfall_usd 12345.67 breaker on"]);
    const tiny = setup({ orders: [{ id: "b", shortfall: 999, updated: daysBefore(NOW, 3) }] }).run();
    expect(tiny.lines).toEqual(["card_refunds_60d 1 shortfall_usd 0.00 breaker off"]);
    const below = setup({ orders: [{ id: "c", shortfall: 4_999_000, updated: daysBefore(NOW, 3) }] }).run();
    expect(below.lines).toEqual(["card_refunds_60d 1 shortfall_usd 49.99 breaker off"]);
  });

  it("never prints an address of the database", () => {
    const orders: Order[] = [
      { id: "x-1", shortfall: 5_000_000, updated: daysBefore(NOW, 2) },
      { id: "x-2", mode: "test", shortfall: 1, updated: daysBefore(NOW, 2) },
    ];
    const cases: Setup[] = [{ orders }, { orders: [] }, { orders: null }, { orders, module: join(ROOT, "no-such.js") }];
    for (const c of cases) {
      const s = setup(c);
      const r = s.run();
      expect(r.out.length, "the script said something, so the check below has text to look at").toBeGreaterThan(20);
      expect(r.out).not.toContain(ADDRESS);
      expect(r.out).not.toMatch(ADDRESS_RE);
      expect(r.out).not.toContain(s.dir);
      for (const line of r.out.trim().split("\n")) expect(line).toMatch(/^(card_refunds_60d .*|card_breaker unreadable)$/);
    }
    // The counter-proof: the database the script read does carry the address.
    const s = setup({ orders });
    const db = new Database(s.dbPath, { readonly: true });
    expect(db.prepare("SELECT address FROM card_orders").pluck().all()).toContain(ADDRESS);
    db.close();
    expect(s.run().lines[0]).toMatch(LINE_RE);
  });

  it("says card_breaker unreadable and exits 1 when the module or the table is missing", () => {
    const orders: Order[] = [{ id: "m", shortfall: 1000, updated: daysBefore(NOW, 1) }];
    for (const c of [{ orders, module: join(ROOT, "dist", "no-such", "card-way.js") }, { orders: null }, { noDb: true }] as Setup[]) {
      const r = setup(c).run();
      expect(r.code, JSON.stringify(c.module ?? c.orders ?? "no db")).toBe(1);
      expect(r.out.trim()).toBe("card_breaker unreadable");
    }
    // A clock that is no ISO time never reaches the server.
    const bad = setup({ orders }).run("tomorrow; reboot");
    expect(bad.code).toBe(1);
    expect(bad.out.trim()).toBe("card_breaker unreadable");
  });

  it("says ssh failed and exits 2 when the server cannot be asked", () => {
    const r = setup({ orders: [], sshFails: true }).run();
    expect(r.code).toBe(2);
    expect(r.out.trim()).toBe("ssh failed");
  });

  it("ops/status.sh shows card_breaker red while the breaker is on and unknown when the tool fails", () => {
    const orders: Order[] = [{ id: "s-1", shortfall: 5_000_000, updated: daysBefore(NOW, 5) }];
    const status = (s: ReturnType<typeof setup>, now: string = NOW) => {
      for (const name of ["curl", "openssl"]) {
        writeFileSync(join(s.bin, name), "#!/bin/sh\nexit 7\n");
        chmodSync(join(s.bin, name), 0o755);
      }
      const r = spawnSync("bash", [STATUS], {
        cwd: s.dir,
        encoding: "utf8",
        timeout: 60_000,
        env: { ...baseEnv(s.dir, s.bin, now, s.module), CP_URL: "https://status.invalid", CP_CONWAY_PAYERS_CMD: "true" },
      });
      expect(r.stdout).not.toContain(ADDRESS);
      return (JSON.parse(r.stdout) as { card_breaker?: unknown }).card_breaker;
    };
    const on = setup({ orders });
    expect(status(on)).toEqual({ status: "red", line: "card_refunds_60d 1 shortfall_usd 50.00 breaker on" });
    expect(status(on, daysBefore(NOW, -60))).toEqual({ status: "ok", line: "card_refunds_60d 0 shortfall_usd 0.00 breaker off" });
    expect(status(setup({ orders, sshFails: true }))).toEqual({ status: "unknown", reason: "card-breaker exit 2" });
    expect(status(setup({ orders: null }))).toEqual({ status: "unknown", reason: "card-breaker exit 1" });
  });
});
