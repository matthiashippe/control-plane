import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * ops/status.sh reports whether the alarm path works: it counts the lines `[WARN] webhook unreachable` of the last 24 hours in
 * the watchdog log on the server (ops/webhook-unreachable.sh, sent over ssh) and writes `alarm_path` into its JSON. From 3 lines
 * on the status is `red`, below that `ok`, and without a readable log `unknown` with `null`.
 *
 * No network and no server: `ssh`, `curl` and `openssl` are fakes on PATH. The fake `ssh` runs a call ending in `bash -s` locally,
 * with the planted log in CP_WATCHDOG_LOG and a fixed CP_NOW, and exits 255 for every other call, like a server that does not
 * answer. CP_NOW is 2026-11-13T12:00:00Z.
 *
 * STATUS_UNDER_TEST points the test at another copy of ops/status.sh, so the counter-proof can run it against an older one.
 */
const STATUS = process.env.STATUS_UNDER_TEST
  ? resolve(process.env.STATUS_UNDER_TEST)
  : join(__dirname, "..", "ops", "status.sh");
const NOW = 1794571200;

type AlarmPath = { unreachable_24h: number | null; status: string };

function run(log: string | null): { status: number | null; out: string; alarm: AlarmPath | undefined } {
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
    `  *" bash -s") CP_WATCHDOG_LOG=${JSON.stringify(logPath)} CP_NOW=${NOW} exec bash -s ;;`,
    "  *) exit 255 ;;",
    "esac",
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

describe("ops/status.sh reports a failed alarm path from the watchdog log", () => {
  it("3 lines in the last 24 hours are red", () => {
    const r = run(unreachable("2026-11-13T11:50:00Z", "2026-11-13T11:45:00Z", "2026-11-12T12:01:00Z"));
    expect(r.status, r.out).toBe(0);
    expect(r.alarm, r.out).toEqual({ unreachable_24h: 3, status: "red" });
  });

  it("2 lines in the last 24 hours are ok", () => {
    const r = run(unreachable("2026-11-13T11:50:00Z", "2026-11-13T11:45:00Z"));
    expect(r.status, r.out).toBe(0);
    expect(r.alarm, r.out).toEqual({ unreachable_24h: 2, status: "ok" });
  });

  it("3 lines older than 24 hours are ok with 0", () => {
    const r = run(unreachable("2026-11-12T11:59:59Z", "2026-11-12T11:00:00Z", "2026-11-01T00:00:00Z"));
    expect(r.status, r.out).toBe(0);
    expect(r.alarm, r.out).toEqual({ unreachable_24h: 0, status: "ok" });
  });

  it("a missing log is unknown with null", () => {
    const r = run(null);
    expect(r.status, r.out).toBe(0);
    expect(r.alarm, r.out).toEqual({ unreachable_24h: null, status: "unknown" });
  });

  it("other lines do not count", () => {
    const r = run(
      unreachable("2026-11-13T11:50:00Z", "2026-11-13T11:45:00Z") +
        "2026-11-13T11:55:00Z [WARN] credit unreadable\n" +
        "2026-11-13T11:56:00Z [OUTAGE] HTTP 500, twice in a row\n" +
        "2026-11-13T11:57:00Z [WARN] webhook unreachable again\n",
    );
    expect(r.status, r.out).toBe(0);
    expect(r.alarm, r.out).toEqual({ unreachable_24h: 2, status: "ok" });
  });
});
