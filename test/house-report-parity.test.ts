import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkHouseReport, ensureHouseJob, HOUSE_CALLS_MAX, HOUSE_PATH_MAX } from "../src/bounties/house.js";
import { openDb } from "../src/db.js";

const ROOT = join(__dirname, "..");

/**
 * ops/db-report.cjs (CP_REPORT=customer-work) keeps its own copy of the rule of checkHouseReport in
 * src/bounties/house.ts, so the house reports it counts are those the service takes. This holds both rules
 * against the same reports at their limits: HOUSE_CALLS_MAX calls, a path of HOUSE_PATH_MAX characters, each
 * method of the list, status 100 and 599, and one beyond each of them. Every case is a submission of its own
 * to a real house job; each of its calls carries the case name in its path, so the calls db-report counts
 * show which case it took.
 */
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
type Call = { method: string; path: string; status: number };
const call = (name: string, extra: Partial<Call> = {}): Call => ({ method: "GET", path: `/case/${name}`, status: 404, ...extra });
const body = (calls: unknown, runtime = "d8f8168", more: Record<string, unknown> = {}) => JSON.stringify({ runtime, calls, ...more });
const pathOf = (name: string, length: number) => `/case/${name}/`.padEnd(length, "x");

const cases: { name: string; valid: boolean; body: string }[] = [
  { name: "calls-max", valid: true, body: body(Array.from({ length: HOUSE_CALLS_MAX }, () => call("calls-max"))) },
  { name: "calls-over", valid: false, body: body(Array.from({ length: HOUSE_CALLS_MAX + 1 }, () => call("calls-over"))) },
  { name: "calls-one", valid: true, body: body([call("calls-one")]) },
  { name: "path-max", valid: true, body: body([call("path-max", { path: pathOf("path-max", HOUSE_PATH_MAX) })]) },
  { name: "path-over", valid: false, body: body([call("path-over", { path: pathOf("path-over", HOUSE_PATH_MAX + 1) })]) },
  { name: "path-no-slash", valid: false, body: body([call("path-no-slash", { path: "case/path-no-slash" })]) },
  ...METHODS.map((method) => ({ name: `method-${method}`, valid: true, body: body([call(`method-${method}`, { method })]) })),
  ...["HEAD", "OPTIONS", "get"].map((method) => ({ name: `method-foreign-${method}`, valid: false, body: body([call(`method-foreign-${method}`, { method })]) })),
  { name: "status-100", valid: true, body: body([call("status-100", { status: 100 })]) },
  { name: "status-599", valid: true, body: body([call("status-599", { status: 599 })]) },
  { name: "status-99", valid: false, body: body([call("status-99", { status: 99 })]) },
  { name: "status-600", valid: false, body: body([call("status-600", { status: 600 })]) },
  { name: "status-fraction", valid: false, body: body([call("status-fraction", { status: 404.5 })]) },
  { name: "runtime-short", valid: false, body: body([call("runtime-short")], "d8f816") },
  { name: "runtime-full", valid: true, body: body([call("runtime-full")], "d8f8168".padEnd(40, "0")) },
  { name: "extra-field", valid: false, body: body([call("extra-field")], "d8f8168", { note: "x" }) },
  { name: "call-extra-field", valid: false, body: body([{ ...call("call-extra-field"), note: "x" }]) },
  { name: "one-bad-call", valid: false, body: body([call("one-bad-call"), call("one-bad-call", { status: 0 })]) },
  { name: "no-calls", valid: false, body: body([]) },
  { name: "not-json", valid: false, body: "calls: none" },
];

/**
 * The moment the house job is posted. createBounty measures its deadline against Date.now(), so the clock is
 * held there while the test runs; with the real clock the job's seven days ran out on 2026-11-27.
 */
const POSTED_AT = new Date("2026-11-20T06:00:00.000Z");
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(POSTED_AT);
});
afterEach(() => {
  vi.useRealTimers();
});

const temps: string[] = [];
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/** A database with one house job and every case as the submission of its own foreign wallet. */
const plant = () => {
  const dir = mkdtempSync(join(tmpdir(), "house-parity-"));
  temps.push(dir);
  const file = join(dir, "cp.db");
  const db = openDb(file);
  const { bounty } = ensureHouseJob(db, POSTED_AT);
  cases.forEach((c, i) => {
    const agent = `0x${(i + 1).toString(16).padStart(40, "c")}`;
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(agent, "2026-11-01T00:00:00.000Z");
    db.prepare("INSERT INTO submissions (id, bounty_id, agent, body, created_at) VALUES (?, ?, ?, ?, ?)").run(
      `parity-${c.name}`, bounty.id, agent, c.body, "2026-11-20T12:00:00.000Z",
    );
  });
  db.close();
  return file;
};

/** The house object of ops/db-report.cjs on that database, run the way ops/customer-work.sh runs it. */
const report = (file: string) => {
  const run = spawnSync(process.execPath, ["-"], {
    cwd: ROOT,
    input: readFileSync(join(ROOT, "ops", "db-report.cjs")),
    env: {
      ...process.env,
      CP_DB_PATH: file,
      CP_REPORT: "customer-work",
      CP_SINCE: "2026-11-20T00:00:00Z",
      CP_UNTIL: "2026-11-21T00:00:00Z",
      CP_CUSTOMER_ADDRESSES: `0x${"e".repeat(40)}`,
    },
    timeout: 60_000,
  });
  expect(run.status).toBe(0);
  return JSON.parse(run.stdout.toString()).house as {
    submissions: number;
    calls: { method: string; path: string; status: number; n: number }[];
  };
};

describe("ops/db-report.cjs house reports", () => {
  it("db-report counts the same house reports as the service, at the limits and one beyond", () => {
    for (const c of cases) expect({ name: c.name, ok: checkHouseReport(c.body).ok }).toEqual({ name: c.name, ok: c.valid });
    const house = report(plant());
    const taken = [...new Set(house.calls.map((k) => k.path.split("/")[2]))].sort();
    const valid = cases.filter((c) => c.valid).map((c) => c.name).sort();
    expect(taken).toEqual(valid);
    expect(house.submissions).toBe(valid.length);
    expect(house.calls.find((k) => k.path === "/case/calls-max")?.n).toBe(HOUSE_CALLS_MAX);
  }, 90_000);
});
