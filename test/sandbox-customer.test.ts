/**
 * kunden 16: why the first sandbox customer stops.
 *
 * Two halves, both run for real. `ops/db-report.cjs` with CP_REPORT=sandbox-customer is run against a database
 * this file builds, the way ops/sandbox-customer.sh runs it in the container; and the shell tool itself is run
 * against the planted fixtures. Every case has its counter-proof in the same test, so a green line cannot come
 * from a filter that lets nothing through.
 */
import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db.js";
import { HOLD_MC } from "../src/sandbox/service.js";

const LIVE_SANDBOX = "0x2f2817d4985991ba3c078edb4e7d328b051c8098"; // in OURS of ops/db-report.cjs
const TOOL = "0x2222222222222222222222222222222222222222"; // ours by the name of its key
const STRANGER = "0x1111111111111111111111111111111111111111";
const LATER = "0x3333333333333333333333333333333333333333";
const SINCE = "2026-11-21T00:00:00Z";
const UNTIL = "2026-11-22T00:00:00Z";
const ADDRESS = /([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}/;

type Db = ReturnType<typeof openDb>;

function wallet(db: Db, address: string, balanceMc: number, reservedMc = 0) {
  db.prepare("INSERT OR IGNORE INTO wallets (address, balance_mc, reserved_mc, created_at) VALUES (?, ?, ?, ?)").run(
    address,
    balanceMc,
    reservedMc,
    "2026-11-01T00:00:00.000Z",
  );
}

function sandbox(db: Db, id: string, address: string, at: string, status: string, stop: string | null, steps: number) {
  db.prepare(
    "INSERT INTO sandboxes (id, address, name, tier, vcpu, memory_mb, disk_gb, slots, step_mc, hold_mc, status, stop_reason, steps_billed, created_at, updated_at) " +
      "VALUES (?, ?, ?, 'medium', 2, 4096, 20, 1, 300, 0, ?, ?, ?, ?, ?)",
  ).run(id, address, `name-${id}`, status, stop, steps, at, at);
}

function row(db: Db, address: string, kind: string, deltaMc: number, at: string, ref: string) {
  db.prepare("INSERT INTO ledger (address, kind, delta_mc, ref, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    address,
    kind,
    deltaMc,
    ref,
    "{}",
    at,
  );
}

/** The planned database: two strangers with sandboxes, our live check and a tool of ours with theirs. */
function plant(db: Db) {
  wallet(db, STRANGER, 500, 0);
  wallet(db, LATER, 5000, 1000);
  wallet(db, LIVE_SANDBOX, 900000);
  wallet(db, TOOL, 100000);
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    TOOL,
    "hash-tool",
    "cnwy_k_xxxxxxx",
    "ops-sandbox-check",
    "2026-11-01T00:00:00.000Z",
  );
  sandbox(db, "sbx-old", STRANGER, "2026-11-20T10:00:00.000Z", "deleted", "deleted", 1); // before the window
  sandbox(db, "sbx-a1", STRANGER, "2026-11-21T02:27:00.000Z", "stopped", "credit", 3);
  sandbox(db, "sbx-a10", STRANGER, "2026-11-21T05:00:00.000Z", "running", null, 1);
  sandbox(db, "sbx-late", LATER, "2026-11-21T09:00:00.000Z", "stopped", "sandboxd", 0);
  sandbox(db, "sbx-next", LATER, "2026-11-22T00:00:00.000Z", "running", null, 0); // at --until: outside
  sandbox(db, "sbx-live", LIVE_SANDBOX, "2026-11-21T01:00:00.000Z", "running", null, 2);
  sandbox(db, "sbx-tool", TOOL, "2026-11-21T01:30:00.000Z", "running", null, 0);
  row(db, STRANGER, "grant", 15000, "2026-11-21T02:13:00.000Z", "grant-s");
  row(db, STRANGER, "inference", -100, "2026-11-21T02:20:00.000Z", "gen-s-1");
  row(db, STRANGER, "sandbox", -300, "2026-11-21T02:33:00.000Z", "sandbox:sbx-a1:0");
  row(db, STRANGER, "sandbox", -300, "2026-11-21T02:39:00.000Z", "sandbox:sbx-a1:1");
  row(db, STRANGER, "sandbox", -300, "2026-11-21T02:45:00.000Z", "sandbox:sbx-a1:2");
  row(db, STRANGER, "topup", 500000, "2026-11-21T03:00:00.000Z", "x402-s");
  row(db, STRANGER, "sandbox", -300, "2026-11-21T05:06:00.000Z", "sandbox:sbx-a10:0"); // a prefix of sbx-a1
  row(db, STRANGER, "inference", -100, "2026-11-22T00:00:00.000Z", "gen-s-2"); // at --until: outside
  row(db, STRANGER, "topup", 500000, "2026-11-13T12:00:00.000Z", "x402-s-old"); // 8 days before --until
  row(db, LIVE_SANDBOX, "topup", 500000, "2026-11-21T01:00:00.000Z", "x402-live");
  row(db, LIVE_SANDBOX, "sandbox", -300, "2026-11-21T01:06:00.000Z", "sandbox:sbx-live:0");
}

function run(script: string, dbPath: string, env: Record<string, string>) {
  const base = { ...process.env };
  delete base.CP_REPORT;
  delete base.CP_SINCE;
  delete base.CP_UNTIL;
  // On stdin, the way the container runs it: `node -` resolves better-sqlite3 from the working directory.
  return execFileSync("node", ["-"], {
    input: readFileSync(script, "utf-8"),
    env: { ...base, CP_DB_PATH: dbPath, ...env },
    encoding: "utf-8",
  });
}

function withDb<T>(fn: (dbPath: string, dir: string) => T, fill: (db: Db) => void = plant): T {
  const dir = mkdtempSync(join(tmpdir(), "cp-sandbox-customer-"));
  const path = join(dir, "cp.db");
  try {
    const db = openDb(path);
    fill(db);
    db.close();
    return fn(path, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const report = (dbPath: string, since = SINCE) =>
  run("ops/db-report.cjs", dbPath, { CP_REPORT: "sandbox-customer", CP_SINCE: since, CP_UNTIL: UNTIL });

describe("ops/db-report.cjs with CP_REPORT=sandbox-customer", () => {
  it("never lists our own addresses, by address or by key name, and does list the strangers", () => {
    const j = withDb((p) => JSON.parse(report(p)));
    expect(j.customers.map((c: any) => c.n), "the two strangers, numbered by their first sandbox").toEqual([1, 2]);
    expect(
      j.customers.map((c: any) => [c.balance_mc, c.reserved_mc]),
      "and only they: never 900000 or 100000",
    ).toEqual([
      [500, 0],
      [5000, 1000],
    ]);
    expect(j.hold_mc).toBe(1000);
    expect(j.foreign_topups_week, "the stranger's topup in the week, not ours and not the one 8 days back").toBe(1);
    // The other direction: our topup moved onto a stranger is counted.
    const moved = withDb(
      (p) => JSON.parse(report(p)),
      (db) => {
        plant(db);
        db.prepare("UPDATE ledger SET address = ? WHERE ref = 'x402-live'").run(LATER);
      },
    );
    expect(moved.foreign_topups_week).toBe(2);
  });

  it("keeps every sandbox of a stranger in the window and none outside it", () => {
    const j = withDb((p) => JSON.parse(report(p)));
    expect(j.customers[0].sandboxes.map((s: any) => [s.created_at, s.status, s.stop_reason, s.steps_billed])).toEqual([
      ["2026-11-21T02:27:00.000Z", "stopped", "credit", 3],
      ["2026-11-21T05:00:00.000Z", "running", null, 1],
    ]);
    expect(j.customers[1].sandboxes).toEqual([
      {
        tier: "medium",
        status: "stopped",
        stop_reason: "sandboxd",
        steps_billed: 0,
        created_at: "2026-11-21T09:00:00.000Z",
        last_step_at: null,
      },
    ]);
    expect(j.customers[0].ledger.map((r: any) => r.kind), "the ledger of the window, without the row at --until").toEqual([
      "grant",
      "inference",
      "sandbox",
      "sandbox",
      "sandbox",
      "topup",
      "sandbox",
    ]);
    // The other direction: the window moved back one day takes in the sandbox it left out.
    const wide = withDb((p) => JSON.parse(report(p, "2026-11-20T00:00:00Z")));
    expect(wide.customers[0].sandboxes).toHaveLength(3);
  });

  it("takes the last step of each sandbox from its own rows, never from another sandbox", () => {
    const j = withDb((p) => JSON.parse(report(p)));
    expect(j.customers[0].sandboxes.map((s: any) => s.last_step_at)).toEqual([
      "2026-11-21T02:45:00.000Z",
      "2026-11-21T05:06:00.000Z",
    ]);
    // The other direction: the step of sbx-a10 renamed to sbx-a1 becomes the last step of sbx-a1.
    const moved = withDb(
      (p) => JSON.parse(report(p)),
      (db) => {
        plant(db);
        db.prepare("UPDATE ledger SET ref = 'sandbox:sbx-a1:3' WHERE ref = 'sandbox:sbx-a10:0'").run();
      },
    );
    expect(moved.customers[0].sandboxes.map((s: any) => s.last_step_at)).toEqual(["2026-11-21T05:06:00.000Z", null]);
  });

  it("carries no address, no sandbox id, no key, no ref and no delta_mc in the JSON", () => {
    const [text, dbHasThem] = withDb((p) => {
      const db = openDb(p);
      const n = (db.prepare("select count(*) n from sandboxes where address = ? and id like 'sbx-%'").get(STRANGER) as any).n;
      db.close();
      return [report(p), n] as const;
    });
    expect(dbHasThem, "the database does hold the address and its sandbox ids").toBeGreaterThan(0);
    expect(text).not.toMatch(ADDRESS);
    expect(text).not.toContain("sbx-");
    expect(text).not.toContain("name-");
    expect(text).not.toContain("x402-");
    expect(text).not.toContain("gen-");
    expect(text).not.toContain("delta_mc");
    expect(text).not.toContain("hash-tool");
    expect(text).not.toContain("ops-sandbox-check");
  });

  it("leaves the default report unchanged without CP_REPORT", () => {
    withDb((p, dir) => {
      const plain = run("ops/db-report.cjs", p, {});
      const j = JSON.parse(plain);
      expect(j).not.toHaveProperty("customers");
      expect(j).not.toHaveProperty("hold_mc");
      expect(j).toHaveProperty("wallets", 4);
      // Byte for byte: the same script with the sandbox-customer block cut out prints the same report.
      const source = readFileSync("ops/db-report.cjs", "utf-8");
      const start = source.indexOf('if (process.env.CP_REPORT === "sandbox-customer") {');
      const end = source.indexOf("\n}\n", start);
      expect(start).toBeGreaterThan(0);
      const without = join(dir, "db-report-without.cjs");
      writeFileSync(without, source.slice(0, start) + source.slice(end + 3));
      expect(plain).toBe(run(without, p, {}));
    });
  });

  it("holds its hold_mc against HOLD_MC of the sandbox service", () => {
    const j = withDb((p) => JSON.parse(report(p)));
    expect(j.hold_mc).toBe(HOLD_MC);
  });

  it("refuses a CP_SINCE that is no ISO time in UTC and an empty window", () => {
    withDb((p) => {
      for (const env of [{ CP_SINCE: "2026-11-21" }, { CP_SINCE: UNTIL, CP_UNTIL: UNTIL }]) {
        const r = spawnSync("node", ["ops/db-report.cjs"], {
          env: { ...process.env, CP_DB_PATH: p, CP_REPORT: "sandbox-customer", ...env },
          encoding: "utf-8",
        });
        expect(r.status).toBe(1);
        expect(r.stdout).toBe("");
      }
    });
  });
});

const FIXTURE_DB = "ops/fixtures/sandbox-customer-db.json";
const OWN = "ops/fixtures/sandbox-customer-own-ips.txt";

function tool(own: string, db = FIXTURE_DB, extra: string[] = []) {
  const seen = mkdtempSync(join(tmpdir(), "cp-sandbox-customer-seen-"));
  try {
    return spawnSync(
      "bash",
      [
        "ops/sandbox-customer.sh",
        "--db-json",
        db,
        "--log",
        "ops/fixtures/sandbox-customer.log",
        "--since",
        SINCE,
        "--until",
        UNTIL,
        ...extra,
      ],
      { env: { ...process.env, CP_OWN_IPS: own, CP_OWN_IPS_SEEN: join(seen, "seen.txt") }, encoding: "utf-8" },
    );
  } finally {
    rmSync(seen, { recursive: true, force: true });
  }
}

describe("ops/sandbox-customer.sh against the planted fixtures", () => {
  it("counts what the planned customer called after the halt and after its last inference", () => {
    const r = tool(OWN);
    expect(r.status).toBe(0);
    expect(r.stdout.trim().split("\n")).toEqual([
      `SANDBOX CUSTOMERS since ${SINCE} until ${UNTIL}: 1 foreign customers with a sandbox`,
      "CUSTOMER 1: first sandbox 2026-11-21T02:27:00Z, sandboxes 1, ips 1, balance below hold",
      "SANDBOX 1.1: tier medium, created 2026-11-21T02:27:00Z, status stopped, stop credit, steps 3, last step 2026-11-21T02:45:00Z",
      "LEDGER 1: grant 1, inference 3, sandbox 3, topup 1, last inference 2026-11-21T03:10:00Z",
      "AFTER 1 halt 2026-11-21T02:45:00Z: 6 requests",
      "PATH 1 halt POST /v1/chat/completions 200 x2",
      "PATH 1 halt POST /v1/sandboxes/{id}/exec 402 x2",
      "PATH 1 halt POST /v1/chat/completions 402 x1",
      "PATH 1 halt GET /v1/credits/balance 200 x1",
      "AFTER 1 last-inference 2026-11-21T03:10:00Z: 3 requests",
      "PATH 1 last-inference POST /v1/sandboxes/{id}/exec 402 x1",
      "PATH 1 last-inference POST /v1/chat/completions 402 x1",
      "PATH 1 last-inference GET /v1/credits/balance 200 x1",
      "LAST 1: 2026-11-21T03:31:00Z GET /v1/credits/balance 200",
      `QUIET 1: 20 hours without a request before ${UNTIL}`,
      `WEEK: 1 foreign payments in the 7 days before ${UNTIL}`,
    ]);
    expect(r.stdout).not.toMatch(ADDRESS);
    expect(r.stdout).not.toContain("sbx-");
  });

  it("has no halt for a sandbox stopped by sandboxd, so nothing counts after it", () => {
    const dir = mkdtempSync(join(tmpdir(), "cp-sandbox-customer-halt-"));
    try {
      const d = JSON.parse(readFileSync(FIXTURE_DB, "utf-8"));
      d.customers[0].sandboxes[0].stop_reason = "sandboxd";
      const moved = join(dir, "db.json");
      writeFileSync(moved, JSON.stringify(d));
      const out = tool(OWN, moved).stdout;
      expect(out).toContain("AFTER 1 halt none: 0 requests");
      expect(out).not.toMatch(/^PATH 1 halt /m);
      expect(tool(OWN).stdout).toMatch(/^AFTER 1 halt 2026-11-21T02:45:00Z: 6 requests$/m);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("never matches ours, and does once our address is off the list", () => {
    const dir = mkdtempSync(join(tmpdir(), "cp-sandbox-customer-own-"));
    try {
      const other = join(dir, "own.txt");
      writeFileSync(other, "192.0.2.254\n");
      const ours = tool(OWN).stdout;
      const off = tool(other).stdout;
      expect(ours).toMatch(/^CUSTOMER 1: .*, ips 1, /m);
      expect(off).toMatch(/^CUSTOMER 1: .*, ips 2, /m);
      expect(off).toMatch(/^AFTER 1 halt 2026-11-21T02:45:00Z: 7 requests$/m);
      expect(off).not.toMatch(ADDRESS);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("says the balance covers hold at 1000 mc and is below hold at 999 mc", () => {
    const dir = mkdtempSync(join(tmpdir(), "cp-sandbox-customer-hold-"));
    try {
      const word = (balance: number) => {
        const d = JSON.parse(readFileSync(FIXTURE_DB, "utf-8"));
        d.customers[0].balance_mc = balance;
        const file = join(dir, `db-${balance}.json`);
        writeFileSync(file, JSON.stringify(d));
        return tool(OWN, file).stdout.match(/^CUSTOMER 1: .*, balance (.*)$/m)?.[1];
      };
      expect(word(1000)).toBe("covers hold");
      expect(word(999)).toBe("below hold");
      expect(word(0)).toBe("zero");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits 1 on an empty window and 2 on a log it cannot read", () => {
    expect(tool(OWN, FIXTURE_DB, ["--until", SINCE]).status).toBe(1);
    const r = spawnSync(
      "bash",
      ["ops/sandbox-customer.sh", "--db-json", FIXTURE_DB, "--log", "ops/fixtures/no-such.log", "--since", SINCE],
      { env: { ...process.env, CP_OWN_IPS: OWN }, encoding: "utf-8" },
    );
    expect(r.status).toBe(2);
  });

  it("passes its own selftest, whose lines name halt, ours and hold", () => {
    const r = spawnSync("bash", ["ops/sandbox-customer.sh", "--selftest"], { encoding: "utf-8" });
    expect(r.stdout.trim().split("\n").pop()).toMatch(/^SELFTEST OK/);
    for (const word of ["halt", "ours", "hold"]) expect(r.stdout).toMatch(new RegExp(`^ok .*${word}`, "m"));
  });
});
