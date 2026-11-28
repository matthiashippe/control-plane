import { describe, expect, it } from "vitest";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db.js";

/**
 * ops/usdc-bands.sh counts, without any address in its output (kunden 18): the foreign addresses with a start
 * grant or a topup in a window by their USDC on Base today, their topups of the tier 1 USD, the answers on
 * /pay/1/ and whether production sells the tier 1. Three halves, all run for real: the new report
 * CP_REPORT=topup-bands of ops/db-report.cjs against a database with the schema of the service, the counting
 * of ops/usdc_bands.py against a JSON-RPC on a port the system picks, and the selftest of the script.
 */
const ROOT = join(__dirname, "..");
const SCRIPT = join(ROOT, "ops", "usdc-bands.sh");
const PY = join(ROOT, "ops", "usdc_bands.py");

const OURS = "0x2f2817d4985991ba3c078edb4e7d328b051c8098"; // in OURS of ops/db-report.cjs
const TOOL = "0x2222222222222222222222222222222222222222"; // ours by the name of its key
const STRANGER = "0x1111111111111111111111111111111111111111";
const MIXED = "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD"; // stored in mixed case
const EARLY = "0x3333333333333333333333333333333333333333";
const THINKER = "0x4444444444444444444444444444444444444444";
const SINCE = "2026-11-06T00:00:00Z";
const UNTIL = "2026-11-28T00:00:00Z";
const ADDRESS = /([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}/;
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

type Db = ReturnType<typeof openDb>;

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

function plant(db: Db) {
  for (const a of [OURS, TOOL, STRANGER, MIXED, EARLY, THINKER]) {
    db.prepare("INSERT OR IGNORE INTO wallets (address, balance_mc, reserved_mc, created_at) VALUES (?, 0, 0, ?)").run(
      a,
      "2026-11-01T00:00:00.000Z",
    );
  }
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    TOOL,
    "hash-tool",
    "cnwy_k_xxxxxxx",
    "ops-sandbox-check",
    "2026-11-01T00:00:00.000Z",
  );
  row(db, STRANGER, "grant", 15000, "2026-11-06T00:00:00.000Z", "grant-s"); // exactly at --since: counts
  row(db, STRANGER, "topup", 100000, "2026-11-07T00:00:00.000Z", "x402-s-1"); // 1 USD
  row(db, MIXED, "topup", 100000, "2026-11-08T00:00:00.000Z", "x402-m-1"); // 1 USD
  row(db, MIXED, "topup", 500000, "2026-11-09T00:00:00.000Z", "x402-m-5"); // 5 USD: not the tier 1
  row(db, EARLY, "topup", 100000, "2026-11-05T23:59:59.000Z", "x402-e-1"); // before --since
  row(db, EARLY, "grant", 15000, "2026-11-28T00:00:00.000Z", "grant-e"); // exactly at --until: outside
  row(db, THINKER, "inference", -100, "2026-11-10T00:00:00.000Z", "gen-t"); // no grant, no topup
  row(db, OURS, "topup", 100000, "2026-11-10T00:00:00.000Z", "x402-ours");
  row(db, TOOL, "grant", 15000, "2026-11-10T00:00:00.000Z", "grant-tool");
  row(db, TOOL, "topup", 100000, "2026-11-10T01:00:00.000Z", "x402-tool");
}

function run(script: string, dbPath: string, env: Record<string, string>) {
  const base = { ...process.env };
  delete base.CP_REPORT;
  delete base.CP_SINCE;
  delete base.CP_UNTIL;
  return execFileSync("node", ["-"], {
    input: readFileSync(script, "utf-8"),
    env: { ...base, CP_DB_PATH: dbPath, ...env },
    encoding: "utf-8",
  });
}

function withDb<T>(fn: (dbPath: string, dir: string) => T, fill: (db: Db) => void = plant): T {
  const dir = mkdtempSync(join(tmpdir(), "cp-usdc-bands-"));
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

const report = (dbPath: string, since = SINCE, until = UNTIL) =>
  JSON.parse(run("ops/db-report.cjs", dbPath, { CP_REPORT: "topup-bands", CP_SINCE: since, CP_UNTIL: until }));

describe("ops/db-report.cjs with CP_REPORT=topup-bands", () => {
  it("lists every foreign address with a grant or topup in the window once, lowercase, and leaves ours out", () => {
    const j = withDb((p) => report(p));
    expect(j.addresses).toEqual([STRANGER, MIXED.toLowerCase()].sort());
    expect(j.addresses).not.toContain(OURS);
    expect(j.addresses).not.toContain(TOOL);
  });

  it("counts the foreign topups of exactly 1 USD in the window", () => {
    expect(withDb((p) => report(p)).topups_1usd).toBe(2);
  });

  it("takes the rows at the edges in when the window moves, so the window is what keeps them out", () => {
    const j = withDb((p) => report(p, "2026-11-05T00:00:00Z", "2026-11-28T00:00:01Z"));
    expect(j.addresses).toContain(EARLY);
    expect(j.topups_1usd).toBe(3);
  });

  it("lets our own address through once it is no longer ours, so oursClause is what keeps it out", () => {
    const j = withDb(
      (p) => report(p),
      (db) => {
        plant(db);
        db.prepare("UPDATE ledger SET address = ? WHERE address = ?").run(THINKER, OURS);
      },
    );
    expect(j.addresses).toContain(THINKER);
    expect(j.topups_1usd).toBe(3);
  });

  it("leaves the default report unchanged without CP_REPORT", () => {
    withDb((p, dir) => {
      const plain = run("ops/db-report.cjs", p, {});
      expect(JSON.parse(plain)).not.toHaveProperty("addresses");
      const source = readFileSync("ops/db-report.cjs", "utf-8");
      const start = source.indexOf('if (process.env.CP_REPORT === "topup-bands") {');
      const end = source.indexOf("\n}\n", start);
      expect(start).toBeGreaterThan(0);
      const without = join(dir, "db-report-without.cjs");
      writeFileSync(without, source.slice(0, start) + source.slice(end + 3));
      expect(plain).toBe(run(without, p, {}));
    });
  });

  it("refuses a CP_SINCE that is no ISO time in UTC and an empty window", () => {
    withDb((p) => {
      for (const env of [{ CP_SINCE: "2026-11-06" }, { CP_SINCE: UNTIL, CP_UNTIL: UNTIL }]) {
        const r = spawnSync("node", ["ops/db-report.cjs"], {
          env: { ...process.env, CP_DB_PATH: p, CP_REPORT: "topup-bands", ...env },
          encoding: "utf-8",
        });
        expect(r.status).toBe(1);
        expect(r.stdout).toBe("");
      }
    });
  });
});

/** A JSON-RPC on 127.0.0.1 with a port the system picks, answering balanceOf of USDC from `balances`. */
async function withRpc<T>(balances: Record<string, number | "error">, fn: (url: string) => T): Promise<T> {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const q = JSON.parse(body);
      const a: Record<string, unknown> = { jsonrpc: "2.0", id: q.id };
      if (q.method === "eth_chainId") a.result = "0x2105";
      else if (q.method === "eth_call" && String(q.params[0].to).toLowerCase() === USDC) {
        const v = balances["0x" + String(q.params[0].data).slice(-40).toLowerCase()] ?? 0;
        if (v === "error") a.error = { code: -32000, message: "execution reverted" };
        else a.result = "0x" + v.toString(16).padStart(64, "0");
      } else a.error = { code: -32601, message: "method not found" };
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(a));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    const port = (server.address() as AddressInfo).port;
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const w = (n: number) => "0x" + n.toString(16).padStart(40, "0");

function count(rpc: string, addresses: string[], tiers: { env: string | null; image: string | null }) {
  const dir = mkdtempSync(join(tmpdir(), "cp-usdc-bands-py-"));
  try {
    writeFileSync(join(dir, "db.json"), JSON.stringify({ since: SINCE, until: UNTIL, addresses, topups_1usd: 4 }));
    writeFileSync(join(dir, "tiers.json"), JSON.stringify(tiers));
    writeFileSync(join(dir, "own.txt"), "192.0.2.254 planted\n");
    writeFileSync(join(dir, "access.log"), "");
    // Asynchronous, because the RPC answers from this same process.
    return new Promise<{ status: number | null; stdout: string }>((resolve) => {
      const child = spawn(
        "python3",
        ["-B", PY, "count", join(dir, "db.json"), join(dir, "access.log"), join(dir, "own.txt"), join(dir, "tiers.json"), SINCE, UNTIL],
        { env: { ...process.env, CP_USDC_RPC: rpc } },
      );
      let stdout = "";
      child.stdout.on("data", (c) => (stdout += c));
      child.on("close", (status) => {
        rmSync(dir, { recursive: true, force: true });
        resolve({ status, stdout });
      });
    });
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}

const IMAGE = { env: null, image: "1,5,25,100,500,1000,2500" };

describe("ops/usdc_bands.py count", () => {
  it("puts 1.00 and 4.99 USDC in the band, 0.99 under it, 5.00 above it and a failed read in unreadable", async () => {
    const balances = { [w(1)]: 990000, [w(2)]: 1000000, [w(3)]: 4990000, [w(4)]: 5000000, [w(5)]: "error" as const };
    const r = await withRpc(balances, (url) => count(url, [w(1), w(2), w(3), w(4), w(5)], IMAGE));
    expect(r.status).toBe(0);
    expect(r.stdout.split("\n")[0]).toBe(
      `USDC BANDS since ${SINCE} until ${UNTIL}: 5 foreign addresses with grant or topup, 1 under 1 USDC, 2 from 1 to under 5 USDC, 1 5 USDC or more, 1 unreadable`,
    );
    expect(r.stdout.split("\n")[1]).toBe(`TOPUPS 1 USD since ${SINCE} until ${UNTIL}: 4 by foreign addresses`);
    expect(r.stdout).not.toMatch(ADDRESS);
  });

  it("gives a band of 0 when nobody holds 1 to under 5 USDC", async () => {
    const r = await withRpc({ [w(2)]: 999999, [w(3)]: 5000001 }, (url) => count(url, [w(2), w(3)], IMAGE));
    expect(r.stdout.split("\n")[0]).toContain(": 2 foreign addresses with grant or topup, 1 under 1 USDC, 0 from 1 to under 5 USDC, 1 5 USDC or more");
  });

  it("reads the tier 1 as sold from the image when CP_TOPUP_TIERS_USD is empty, and not sold from a list without 1", async () => {
    const yes = await withRpc({}, (url) => count(url, [], { env: "", image: "1,5,25" }));
    const no = await withRpc({}, (url) => count(url, [], { env: "5,25,100", image: "1,5,25" }));
    expect(yes.stdout.trim().split("\n").pop()).toBe("TIER 1 SOLD: yes");
    expect(no.stdout.trim().split("\n").pop()).toBe("TIER 1 SOLD: no");
  });

  it("exits 2 when the RPC is not on Base", async () => {
    const server = createServer((req, res) => {
      req.resume();
      req.on("end", () => res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1" })));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    try {
      const r = await count(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, [w(2)], IMAGE);
      expect(r.status).toBe(2);
      expect(r.stdout).toBe("");
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});

describe("ops/usdc-bands.sh --selftest", () => {
  it("proves every rule in both directions without an address in its output", () => {
    const r = spawnSync("bash", [SCRIPT, "--selftest"], { encoding: "utf-8", cwd: ROOT, timeout: 60_000 });
    const lines = r.stdout.trim().split("\n");
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(lines[lines.length - 1]).toMatch(/^SELFTEST OK/);
    expect(lines.filter((l) => l.startsWith("ok ")).length).toBeGreaterThanOrEqual(8);
    expect(lines.some((l) => l.startsWith("FAIL"))).toBe(false);
    expect(r.stdout).not.toMatch(ADDRESS);
  });

  it("passes with a dead proxy set, because the planted RPC is on loopback", async () => {
    // A port the system picked and that nobody listens on any more: every request through it fails.
    const closed = createServer();
    await new Promise<void>((r) => closed.listen(0, "127.0.0.1", r));
    const dead = `http://127.0.0.1:${(closed.address() as AddressInfo).port}`;
    await new Promise((r) => closed.close(r));
    const env: Record<string, string | undefined> = { ...process.env };
    for (const k of ["NO_PROXY", "no_proxy"]) delete env[k];
    for (const k of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]) env[k] = dead;
    const r = spawnSync("bash", [SCRIPT, "--selftest"], { encoding: "utf-8", cwd: ROOT, timeout: 60_000, env });
    const lines = r.stdout.trim().split("\n");
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(lines[lines.length - 1]).toMatch(/^SELFTEST OK/);
    expect(lines.filter((l) => l.startsWith("ok ")).length).toBeGreaterThanOrEqual(8);
  });
});
