import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * `[INFO] webhook delivered` in the watchdog log only proves that ntfy accepted the POST, and ntfy accepts every topic. With a
 * wrong topic in the crontab of the server the watchdog logs a delivery every day while nothing reaches a phone. So
 * ops/status.sh reads the messages of the topic itself (CP_ALERT_WEBHOOK from the local environment, `json?poll=1&since=12h`)
 * and reports `alarm_path.received`: the last sign of life and the last message of the watchdog on the topic, and a status.
 * `red` when the last delivery from the log is younger than 11 hours (ntfy caches 12 hours) and no watchdog message on the
 * topic is at most 300 seconds older than it or later; `unknown` without CP_ALERT_WEBHOOK, with an unreadable topic or without
 * a delivery that must still be on the topic. `red` turns `alarm_path.status` red, `unknown` leaves it alone.
 *
 * No network and no server: `ssh`, `curl` and `openssl` are fakes on PATH, like in test/status-alarm-path.test.ts. The fake
 * `curl` writes its arguments into a file, reads its configuration from stdin only for `-K -` (and keeps it in another file),
 * and answers only the poll of the planted topic with the planted lines; every other call exits 7. CP_NOW is
 * 2026-11-13T12:00:00Z, CP_ALERT_WEBHOOK points at an address under `.invalid` with a made-up topic.
 *
 * STATUS_UNDER_TEST points the test at another copy of ops/status.sh, so the counter-proof can run it against an older one.
 */
const STATUS = process.env.STATUS_UNDER_TEST
  ? resolve(process.env.STATUS_UNDER_TEST)
  : join(__dirname, "..", "ops", "status.sh");
const NOW = 1794571200;
const HOST = "alerts.invalid";
const TOPIC = "made-up-topic-4711";
const WEBHOOK = `https://${HOST}/${TOPIC}`;

type Received = { last_alive: string | null; last_message: string | null; status: string };
type AlarmPath = {
  unreachable_24h: number | null;
  last_unreachable: string | null;
  last_delivered: string | null;
  status: string;
  received?: Received;
};

type Run = { status: number | null; stdout: string; stderr: string; out: string; args: string; config: string; alarm: AlarmPath | undefined };

function run(log: string, opts: { topic?: string; curlRc?: number; webhook?: string | null } = {}): Run {
  const root = mkdtempSync(join(tmpdir(), "status-alarm-received-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  const logPath = join(root, "cp-watchdog.log");
  writeFileSync(logPath, log);
  const argsPath = join(root, "curl-args");
  const configPath = join(root, "curl-config");
  const bodyPath = join(root, "topic-body");
  writeFileSync(bodyPath, opts.topic ?? "");
  const fake = (name: string, lines: string[]) => {
    writeFileSync(join(bin, name), ["#!/bin/sh", ...lines].join("\n") + "\n");
    chmodSync(join(bin, name), 0o755);
  };
  fake("ssh", [
    'case "$*" in',
    '  *" bash -s") script=$(cat) ;;',
    "  *) exit 255 ;;",
    "esac",
    `printf '%s\\n' "$script" | CP_WATCHDOG_LOG=${JSON.stringify(logPath)} CP_NOW=${NOW} bash -s`,
  ]);
  fake("curl", [
    `printf '%s\\n' "$*" >> ${JSON.stringify(argsPath)}`,
    'case " $* " in',
    '  *" -K - "*) cfg=$(cat) ;;',
    "  *) exit 7 ;;",
    "esac",
    `printf '%s\\n' "$cfg" >> ${JSON.stringify(configPath)}`,
    `case "$cfg" in *'url = "${WEBHOOK}/json?poll=1&since=12h"'*) ;; *) exit 7 ;; esac`,
    ...(opts.curlRc ? [`exit ${opts.curlRc}`] : []),
    `cat ${JSON.stringify(bodyPath)}`,
  ]);
  fake("openssl", ["exit 1"]);
  const env: Record<string, string> = {
    PATH: `${bin}:/usr/bin:/bin`,
    HOME: root,
    CP_URL: "https://status.invalid",
    CP_DEPLOY_HOST: "root@server.invalid",
    CP_DEPLOY_KEY: join(root, "no-key"),
    CP_NOW: String(NOW),
  };
  if (opts.webhook !== null) env.CP_ALERT_WEBHOOK = opts.webhook ?? WEBHOOK;
  const r = spawnSync("bash", [STATUS], { cwd: root, encoding: "utf8", timeout: 60_000, env });
  let alarm: AlarmPath | undefined;
  try {
    alarm = JSON.parse(r.stdout).alarm_path;
  } catch {
    alarm = undefined;
  }
  const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
  return {
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
    out: `${r.stdout}${r.stderr}`,
    args: read(argsPath),
    config: read(configPath),
    alarm,
  };
}

const at = (iso: string) => Date.parse(iso) / 1000;
const delivered = (t: string) => `${t} [INFO] webhook delivered\n`;
const message = (title: string | null, iso: string) =>
  JSON.stringify({
    id: `m${at(iso)}`,
    time: at(iso),
    expires: at(iso) + 43200,
    event: "message",
    topic: TOPIC,
    ...(title === null ? {} : { title }),
    message: "planted message",
    priority: 1,
  }) + "\n";
const UNKNOWN: Received = { last_alive: null, last_message: null, status: "unknown" };

describe("ops/status.sh checks that a delivery of the watchdog really reached the topic", () => {
  it("a sign of life on the topic is ok", () => {
    const r = run(delivered("2026-11-13T11:00:00Z"), { topic: message("control-plane ALIVE", "2026-11-13T11:00:00Z") });
    expect(r.status, r.out).toBe(0);
    expect(r.alarm, r.out).toEqual({
      unreachable_24h: 0,
      last_unreachable: null,
      last_delivered: "2026-11-13T11:00:00Z",
      status: "ok",
      received: { last_alive: "2026-11-13T11:00:00Z", last_message: "2026-11-13T11:00:00Z", status: "ok" },
    });
    expect(r.config, r.out).toContain(`${WEBHOOK}/json?poll=1&since=12h`);
  });

  it("a delivery that never reached the topic is red", () => {
    const r = run(delivered("2026-11-13T11:00:00Z"), {
      topic: message("nightly backup", "2026-11-13T11:00:00Z") + message("control-plane ALIVE", "2026-11-12T00:01:00Z"),
    });
    expect(r.status, r.out).toBe(0);
    expect(r.alarm, r.out).toEqual({
      unreachable_24h: 0,
      last_unreachable: null,
      last_delivered: "2026-11-13T11:00:00Z",
      status: "red",
      received: { last_alive: "2026-11-12T00:01:00Z", last_message: "2026-11-12T00:01:00Z", status: "red" },
    });
  });

  it("a message up to 300 seconds before the delivery counts, one second more does not", () => {
    const topic = message("control-plane WARN", "2026-11-13T10:55:00Z");
    const ok = run(delivered("2026-11-13T11:00:00Z"), { topic });
    expect(ok.alarm?.received, ok.out).toEqual({ last_alive: null, last_message: "2026-11-13T10:55:00Z", status: "ok" });
    expect(ok.alarm?.status, ok.out).toBe("ok");
    const red = run(delivered("2026-11-13T11:00:01Z"), { topic });
    expect(red.alarm?.received, red.out).toEqual({ last_alive: null, last_message: "2026-11-13T10:55:00Z", status: "red" });
    expect(red.alarm?.status, red.out).toBe("red");
  });

  it("a message without the title of the watchdog does not count", () => {
    const r = run(delivered("2026-11-13T11:00:00Z"), {
      topic: message(null, "2026-11-13T11:00:00Z") + message("control-plane", "2026-11-13T11:00:00Z"),
    });
    expect(r.alarm?.received, r.out).toEqual({ last_alive: null, last_message: null, status: "red" });
    expect(r.alarm?.status, r.out).toBe("red");
  });

  it("an unreadable topic is unknown and leaves the status alone", () => {
    const r = run(delivered("2026-11-13T11:00:00Z"), {
      topic: message("nightly backup", "2026-11-13T11:00:00Z"),
      curlRc: 22,
    });
    expect(r.status, r.out).toBe(0);
    expect(r.alarm, r.out).toEqual({
      unreachable_24h: 0,
      last_unreachable: null,
      last_delivered: "2026-11-13T11:00:00Z",
      status: "ok",
      received: UNKNOWN,
    });
    expect(r.config, r.out).toContain("json?poll=1");
  });

  it("a line that is no JSON makes the topic unreadable", () => {
    for (const bad of ["<html>rate limited</html>\n", "42\n", '{"event": "message",\n']) {
      const r = run(delivered("2026-11-13T11:00:00Z"), {
        topic: message("control-plane ALIVE", "2026-11-12T00:01:00Z") + bad,
      });
      expect(r.status, r.out).toBe(0);
      expect(r.alarm, r.out).toEqual({
        unreachable_24h: 0,
        last_unreachable: null,
        last_delivered: "2026-11-13T11:00:00Z",
        status: "ok",
        received: UNKNOWN,
      });
    }
  });

  it("without CP_ALERT_WEBHOOK it is unknown and asks nobody", () => {
    for (const webhook of [null, ""]) {
      const r = run(delivered("2026-11-13T11:00:00Z"), { webhook, topic: message("nightly backup", "2026-11-13T11:00:00Z") });
      expect(r.status, r.out).toBe(0);
      expect(r.alarm, r.out).toEqual({
        unreachable_24h: 0,
        last_unreachable: null,
        last_delivered: "2026-11-13T11:00:00Z",
        status: "ok",
        received: UNKNOWN,
      });
      expect(r.args, r.out).not.toContain("poll");
      expect(r.config, r.out).toBe("");
    }
  });

  it("a delivery older than the cache of the topic is unknown", () => {
    const r = run(delivered("2026-11-13T00:30:00Z"));
    expect(r.status, r.out).toBe(0);
    expect(r.alarm, r.out).toEqual({
      unreachable_24h: 0,
      last_unreachable: null,
      last_delivered: "2026-11-13T00:30:00Z",
      status: "ok",
      received: UNKNOWN,
    });
  });

  it("never shows URL or topic, in the output or in the arguments of curl", () => {
    const red = run(delivered("2026-11-13T11:00:00Z"), { topic: message("nightly backup", "2026-11-13T11:00:00Z") });
    const unreadable = run(delivered("2026-11-13T11:00:00Z"), { topic: message("nightly backup", "2026-11-13T11:00:00Z"), curlRc: 22 });
    expect(red.alarm?.received?.status, red.out).toBe("red");
    expect(unreadable.alarm?.received?.status, unreadable.out).toBe("unknown");
    for (const r of [red, unreadable]) {
      // The poll happened, through stdin: without it a clean output would prove nothing.
      expect(r.config, r.out).toContain(TOPIC);
      for (const secret of [HOST, TOPIC]) {
        expect(r.stdout).not.toContain(secret);
        expect(r.stderr).not.toContain(secret);
        expect(r.args).not.toContain(secret);
      }
    }
  });
});
