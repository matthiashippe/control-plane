import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * ops/status.sh reports whether the alarm path works: it counts the lines `[WARN] webhook unreachable` of the last 24 hours in
 * the watchdog log on the server (ops/webhook-unreachable.sh, sent over ssh), takes the last failed and the last delivered POST
 * from the whole log (ops/webhook-last.sh, sent the same way) and writes `alarm_path` into its JSON. From 3 lines on the status
 * is `red` unless a `[INFO] webhook delivered` came after the last failure, below that `ok`, and without a readable log
 * `unknown` with `null`. An unreadable answer of ops/webhook-last.sh gives `null` for both times and keeps `red` from 3.
 * A last delivery older than 26 hours is `red` even without a failed POST, because the watchdog posts a sign of life every UTC
 * day and silence means it no longer runs or no longer posts. ops/status.sh reads the clock from CP_NOW like the scripts.
 *
 * No network and no server: `ssh`, `curl` and `openssl` are fakes on PATH. The fake `ssh` runs a call ending in `bash -s` locally,
 * with the planted log in CP_WATCHDOG_LOG and a fixed CP_NOW, and exits 255 for every other call, like a server that does not
 * answer. CP_NOW is 2026-11-13T12:00:00Z. With `brokenLast` it answers the script that looks for `webhook delivered` with a line
 * that is no time at all.
 *
 * STATUS_UNDER_TEST points the test at another copy of ops/status.sh, so the counter-proof can run it against an older one.
 */
const STATUS = process.env.STATUS_UNDER_TEST
  ? resolve(process.env.STATUS_UNDER_TEST)
  : join(__dirname, "..", "ops", "status.sh");
const NOW = 1794571200;
// Without CP_ALERT_WEBHOOK ops/status.sh does not read the topic (test/status-alarm-received.test.ts).
const NOT_ASKED = { last_alive: null, last_message: null, status: "unknown" };

type AlarmPath = {
  unreachable_24h: number | null;
  last_unreachable: string | null;
  last_delivered: string | null;
  status: string;
  received: { last_alive: string | null; last_message: string | null; status: string };
};

function run(log: string | null, opts: { brokenLast?: boolean } = {}): { status: number | null; out: string; alarm: AlarmPath | undefined } {
  const root = mkdtempSync(join(tmpdir(), "status-alarm-path-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  const logPath = join(root, "cp-watchdog.log");
  if (log !== null) writeFileSync(logPath, log);
  const fake = (name: string, lines: string[]) => {
    writeFileSync(join(bin, name), ["#!/bin/sh", ...lines].join("\n") + "\n");
    chmodSync(join(bin, name), 0o755);
  };
  fake("ssh", [
    'case "$*" in',
    '  *" bash -s") script=$(cat) ;;',
    "  *) exit 255 ;;",
    "esac",
    ...(opts.brokenLast ? ['case "$script" in *"webhook delivered"*) echo "not a time"; exit 0 ;; esac'] : []),
    `printf '%s\\n' "$script" | CP_WATCHDOG_LOG=${JSON.stringify(logPath)} CP_NOW=${NOW} bash -s`,
  ]);
  fake("curl", ["exit 7"]);
  fake("openssl", ["exit 1"]);
  const r = spawnSync("bash", [STATUS], {
    cwd: root,
    encoding: "utf8",
    timeout: 60_000,
    env: {
      PATH: `${bin}:/usr/bin:/bin`,
      HOME: root,
      CP_URL: "https://status.invalid",
      CP_DEPLOY_HOST: "root@server.invalid",
      CP_DEPLOY_KEY: join(root, "no-key"),
      CP_NOW: String(NOW),
    },
  });
  let alarm: AlarmPath | undefined;
  try {
    alarm = JSON.parse(r.stdout).alarm_path;
  } catch {
    alarm = undefined;
  }
  return { status: r.status, out: `${r.stdout}${r.stderr}`, alarm };
}

const unreachable = (...ts: string[]) => ts.map((t) => `${t} [WARN] webhook unreachable\n`).join("");
const delivered = (t: string) => `${t} [INFO] webhook delivered\n`;

describe("ops/status.sh reports a failed alarm path from the watchdog log", () => {
  it("3 lines in the last 24 hours are red", () => {
    const r = run(unreachable("2026-11-13T11:50:00Z", "2026-11-13T11:45:00Z", "2026-11-12T12:01:00Z"));
    expect(r.status, r.out).toBe(0);
    expect(r.alarm, r.out).toEqual({
      unreachable_24h: 3,
      last_unreachable: "2026-11-13T11:50:00Z",
      last_delivered: null,
      status: "red",
      received: NOT_ASKED,
    });
  });

  it("2 lines in the last 24 hours are ok", () => {
    const r = run(unreachable("2026-11-13T11:50:00Z", "2026-11-13T11:45:00Z"));
    expect(r.status, r.out).toBe(0);
    expect(r.alarm, r.out).toEqual({
      unreachable_24h: 2,
      last_unreachable: "2026-11-13T11:50:00Z",
      last_delivered: null,
      status: "ok",
      received: NOT_ASKED,
    });
  });

  it("3 lines older than 24 hours are ok with 0", () => {
    const r = run(unreachable("2026-11-12T11:59:59Z", "2026-11-12T11:00:00Z", "2026-11-01T00:00:00Z"));
    expect(r.status, r.out).toBe(0);
    expect(r.alarm, r.out).toEqual({
      unreachable_24h: 0,
      last_unreachable: "2026-11-12T11:59:59Z",
      last_delivered: null,
      status: "ok",
      received: NOT_ASKED,
    });
  });

  it("a missing log is unknown with null", () => {
    const r = run(null);
    expect(r.status, r.out).toBe(0);
    expect(r.alarm, r.out).toEqual({
      unreachable_24h: null,
      last_unreachable: null,
      last_delivered: null,
      status: "unknown",
      received: NOT_ASKED,
    });
  });

  it("other lines do not count", () => {
    const r = run(
      unreachable("2026-11-13T11:50:00Z", "2026-11-13T11:45:00Z") +
        "2026-11-13T11:55:00Z [WARN] credit unreadable\n" +
        "2026-11-13T11:56:00Z [OUTAGE] HTTP 500, twice in a row\n" +
        "2026-11-13T11:57:00Z [WARN] webhook unreachable again\n" +
        "2026-11-13T11:58:00Z [INFO] webhook delivered again\n",
    );
    expect(r.status, r.out).toBe(0);
    expect(r.alarm, r.out).toEqual({
      unreachable_24h: 2,
      last_unreachable: "2026-11-13T11:50:00Z",
      last_delivered: null,
      status: "ok",
      received: NOT_ASKED,
    });
  });

  it("delivered after the last failure is ok", () => {
    const r = run(
      unreachable("2026-11-13T11:00:00Z", "2026-11-13T11:05:00Z", "2026-11-13T11:10:00Z") +
        delivered("2026-11-13T11:15:00Z"),
    );
    expect(r.status, r.out).toBe(0);
    expect(r.alarm, r.out).toEqual({
      unreachable_24h: 3,
      last_unreachable: "2026-11-13T11:10:00Z",
      last_delivered: "2026-11-13T11:15:00Z",
      status: "ok",
      received: NOT_ASKED,
    });
  });

  it("delivered before the failures is red", () => {
    const r = run(
      delivered("2026-11-13T10:55:00Z") +
        unreachable("2026-11-13T11:00:00Z", "2026-11-13T11:05:00Z", "2026-11-13T11:10:00Z"),
    );
    expect(r.status, r.out).toBe(0);
    expect(r.alarm, r.out).toEqual({
      unreachable_24h: 3,
      last_unreachable: "2026-11-13T11:10:00Z",
      last_delivered: "2026-11-13T10:55:00Z",
      status: "red",
      received: NOT_ASKED,
    });
  });

  it("a delivery older than 26 hours is red", () => {
    const r = run(delivered("2026-11-12T09:59:00Z"));
    expect(r.status, r.out).toBe(0);
    expect(r.alarm, r.out).toEqual({
      unreachable_24h: 0,
      last_unreachable: null,
      last_delivered: "2026-11-12T09:59:00Z",
      status: "red",
      received: NOT_ASKED,
    });
  });

  it("a delivery within 26 hours is ok", () => {
    const r = run(delivered("2026-11-12T10:01:00Z"));
    expect(r.status, r.out).toBe(0);
    expect(r.alarm, r.out).toEqual({
      unreachable_24h: 0,
      last_unreachable: null,
      last_delivered: "2026-11-12T10:01:00Z",
      status: "ok",
      received: NOT_ASKED,
    });
  });

  it("an unreadable answer for the last delivery keeps red from 3 lines", () => {
    const r = run(
      unreachable("2026-11-13T11:00:00Z", "2026-11-13T11:05:00Z", "2026-11-13T11:10:00Z") +
        delivered("2026-11-13T11:15:00Z"),
      { brokenLast: true },
    );
    expect(r.status, r.out).toBe(0);
    expect(r.alarm, r.out).toEqual({
      unreachable_24h: 3,
      last_unreachable: null,
      last_delivered: null,
      status: "red",
      received: NOT_ASKED,
    });
  });
});
