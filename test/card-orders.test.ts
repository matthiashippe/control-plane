import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";

/*
 * ops/card-orders.sh (goals/karte/01, point 5), offline. A stand-in `ssh` and `docker` sit first in PATH inside a folder
 * from mkdtemp: `ssh` runs the remote command right here with the script on stdin, and `docker compose ... exec -T cp
 * <cmd>` runs <cmd> here from the repo root (so `better-sqlite3` resolves), with CP_DB_PATH on a database this file builds
 * and CP_DIGISTORE_IPN_PASSPHRASE as the rebuilt container has it. No network, no port, no real server.
 */

const ROOT = join(__dirname, "..");
const SCRIPT = join(ROOT, "ops", "card-orders.sh");
const STATUS = join(ROOT, "ops", "status.sh");
const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A made-up address that appears nowhere else, so finding it in an output can only mean the script read it. */
const ADDRESS = "0x00000000000000000000000000000000000000aa";
const ADDRESS_RE = /0x[0-9a-fA-F]{40}/;
const PASSPHRASE = "test-passphrase-9f3c1e7a";

const LINE_RE =
  /^(card_orders live \d+ test \d+ booked \d+ unassigned \d+ pending_rate \d+ reversed \d+|card_shortfall_usd \d+\.\d{2}|ipn_passphrase (set|missing))$/;

type Order = { id: string; mode: "live" | "test"; status: string; address?: string | null; shortfall?: number };

const CREATE = `CREATE TABLE card_orders (
  order_id TEXT PRIMARY KEY, product_id TEXT, address TEXT NULL, mode TEXT, status TEXT, vendor_eur_cents INTEGER,
  rate_e4 INTEGER, rate_date TEXT, credited_mc INTEGER, reversed_mc INTEGER, shortfall_mc INTEGER, created_at TEXT,
  updated_at TEXT)`;

/** One row of every status, with the mode that goes with it, and 123400 mc of shortfall in total (1.234 USD, 100000 mc per USD). */
const EVERY_STATUS: Order[] = [
  { id: "o-booked-1", mode: "live", status: "booked", address: ADDRESS, shortfall: 100_000 },
  { id: "o-test-1", mode: "test", status: "test", address: ADDRESS },
  { id: "o-unassigned-1", mode: "live", status: "unassigned", address: null },
  { id: "o-pending-1", mode: "live", status: "pending_rate", address: ADDRESS, shortfall: 23_400 },
  { id: "o-reversed-1", mode: "live", status: "reversed", address: ADDRESS },
];

type Setup = { orders?: Order[] | null; passphrase?: string | null; sshFails?: boolean };

function makeDb(dir: string, orders: Order[] | null): string {
  const path = join(dir, "cp.db");
  const db = new Database(path);
  // Another table, so "no card_orders" means exactly that and not an empty file.
  db.exec("CREATE TABLE ledger (id INTEGER PRIMARY KEY, amount_mc INTEGER)");
  if (orders) {
    db.exec(CREATE);
    const add = db.prepare(
      `INSERT INTO card_orders VALUES (@id, 'p-1', @address, @mode, @status, 1000, 10800, '2026-11-20', 0, 0, @shortfall,
       '2026-11-21T10:00:00Z', '2026-11-21T10:00:00Z')`,
    );
    for (const o of orders) add.run({ id: o.id, address: o.address ?? null, mode: o.mode, status: o.status, shortfall: o.shortfall ?? 0 });
  }
  db.close();
  return path;
}

function fakeTools(bin: string, dbPath: string, passphrase: string | null, sshFails: boolean) {
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, "ssh"),
    sshFails
      ? // A connection that drops mid-answer: some output, then the exit of ssh, which alone must decide.
        "#!/usr/bin/env bash\necho 'card_orders live 9 test 9 booked 9 unassigned 9 pending_rate 9 reversed 9'\nexit 255\n"
      : [
          "#!/usr/bin/env bash",
          // Only the call of ops/card-orders.sh runs here; every other ssh of ops/status.sh gets no answer.
          'cmd="${@: -1}"',
          'case "$cmd" in *"--on-server") exec bash -c "$cmd" ;; *) exit 255 ;; esac',
          "",
        ].join("\n"),
  );
  writeFileSync(
    join(bin, "docker"),
    [
      "#!/usr/bin/env bash",
      // docker compose -f <file> exec -T cp <cmd...>: drop everything up to the service name, run the rest as the container.
      'while [ "$#" -gt 0 ] && [ "$1" != cp ]; do shift; done',
      '[ "$#" -gt 0 ] || exit 1',
      "shift",
      `cd ${JSON.stringify(ROOT)} || exit 1`,
      `export CP_DB_PATH=${JSON.stringify(dbPath)}`,
      passphrase === null ? "unset CP_DIGISTORE_IPN_PASSPHRASE" : `export CP_DIGISTORE_IPN_PASSPHRASE=${JSON.stringify(passphrase)}`,
      'exec "$@"',
      "",
    ].join("\n"),
  );
  chmodSync(join(bin, "ssh"), 0o755);
  chmodSync(join(bin, "docker"), 0o755);
}

function baseEnv(dir: string, bin: string): Record<string, string> {
  return {
    PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
    HOME: dir,
    CP_DEPLOY_HOST: "test@host.invalid",
    CP_DEPLOY_KEY: join(dir, "no-such-key"),
  };
}

function run({ orders = EVERY_STATUS, passphrase = PASSPHRASE, sshFails = false }: Setup = {}) {
  const dir = mkdtempSync(join(tmpdir(), "cp-card-orders-"));
  dirs.push(dir);
  const bin = join(dir, "bin");
  const dbPath = makeDb(dir, orders);
  fakeTools(bin, dbPath, passphrase, sshFails);
  const r = spawnSync("bash", [SCRIPT], { env: baseEnv(dir, bin), encoding: "utf8", timeout: 20_000 });
  const out = `${r.stdout}${r.stderr}`;
  return { code: r.status, out, lines: r.stdout.trim().split("\n"), dir, dbPath };
}

describe("ops/card-orders.sh", () => {
  it("counts one row of every status and rounds 1.234 USD of shortfall down to card_shortfall_usd 1.23", () => {
    const r = run();
    expect(r.code, r.out).toBe(0);
    expect(r.lines).toEqual([
      "card_orders live 4 test 1 booked 1 unassigned 1 pending_rate 1 reversed 1",
      "card_shortfall_usd 1.23",
      "ipn_passphrase set",
    ]);
  });

  it("rounds down to the cent with whole numbers, also above one dollar and below one cent", () => {
    const big = run({ orders: [{ id: "a", mode: "live", status: "booked", shortfall: 1_234_567_999 }] });
    expect(big.code, big.out).toBe(0);
    expect(big.lines[1]).toBe("card_shortfall_usd 12345.67");
    const tiny = run({ orders: [{ id: "b", mode: "live", status: "booked", shortfall: 999 }] });
    expect(tiny.lines[1]).toBe("card_shortfall_usd 0.00");
  });

  it("never prints an address of the database, in no case", () => {
    const cases: Setup[] = [{}, { passphrase: null }, { orders: null }, { orders: [...EVERY_STATUS].reverse() }];
    for (const c of cases) {
      const r = run(c);
      expect(r.out.length, "the script said something, so the check below has text to look at").toBeGreaterThan(20);
      expect(r.out).not.toContain(ADDRESS);
      expect(r.out).not.toMatch(ADDRESS_RE);
      expect(r.out).not.toContain(PASSPHRASE);
      expect(r.out).not.toContain(r.dir);
      for (const line of r.out.trim().split("\n")) expect(line).toMatch(LINE_RE);
    }
  });

  it("gives zeros and 0.00 when the table card_orders does not exist yet", () => {
    const r = run({ orders: null });
    expect(r.code, r.out).toBe(0);
    expect(r.lines).toEqual([
      "card_orders live 0 test 0 booked 0 unassigned 0 pending_rate 0 reversed 0",
      "card_shortfall_usd 0.00",
      "ipn_passphrase set",
    ]);
  });

  it("says ipn_passphrase missing when the container has the passphrase empty or not at all", () => {
    for (const passphrase of [null, ""]) {
      const r = run({ passphrase });
      expect(r.code, r.out).toBe(0);
      expect(r.lines[2], String(passphrase)).toBe("ipn_passphrase missing");
    }
  });

  it("says ssh failed and exits 2 when the server cannot be asked", () => {
    const r = run({ sshFails: true });
    expect(r.code).toBe(2);
    expect(r.out.trim()).toBe("ssh failed");
  });

  it("ops/status.sh shows the lines card_orders and card_shortfall_usd, and stays whole when the tool fails", () => {
    for (const sshFails of [false, true]) {
      const dir = mkdtempSync(join(tmpdir(), "cp-card-orders-status-"));
      dirs.push(dir);
      const bin = join(dir, "bin");
      fakeTools(bin, makeDb(dir, EVERY_STATUS), PASSPHRASE, sshFails);
      for (const name of ["curl", "openssl"]) {
        writeFileSync(join(bin, name), "#!/bin/sh\nexit 7\n");
        chmodSync(join(bin, name), 0o755);
      }
      const r = spawnSync("bash", [STATUS], {
        cwd: dir,
        encoding: "utf8",
        timeout: 60_000,
        env: { ...baseEnv(dir, bin), CP_URL: "https://status.invalid", CP_CONWAY_PAYERS_CMD: "true" },
      });
      const json = JSON.parse(r.stdout) as { card_orders?: unknown };
      if (sshFails) {
        expect(json.card_orders, r.stdout).toEqual({ status: "unknown", reason: "card-orders exit 2" });
      } else {
        expect(json.card_orders, r.stdout).toEqual({
          status: "ok",
          lines: ["card_orders live 4 test 1 booked 1 unassigned 1 pending_rate 1 reversed 1", "card_shortfall_usd 1.23"],
        });
      }
      expect(r.stdout).not.toContain(ADDRESS);
      expect(r.stdout).not.toContain(PASSPHRASE);
    }
  });
});
