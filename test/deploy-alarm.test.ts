import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ops/deploy-alarm.sh runs on the VM, sent there by ops/deploy-window.sh over `ssh … bash -s`. It takes the webhook from the
 * crontab line that sets CP_ALERT_WEBHOOK for ops/watchdog.sh and posts one line without an address. The URL is a secret of a
 * public repository (ops/README.md, Watchdog), so it must never show up in an output that `deploy.yml` prints.
 *
 * Without network: the crontab is a planted file (CP_CRONTAB_FILE), and `curl` on PATH is a fake that writes its arguments
 * down and ends with 0, or with 22 where the POST is meant to fail.
 */
const SCRIPT = join(__dirname, "..", "ops", "deploy-alarm.sh");
const URL = "https://alarm.invalid/planted-topic";
const CRON_LINE = `*/5 * * * * CP_ALERT_WEBHOOK=${URL} /opt/control-plane/repo/ops/watchdog.sh >> /var/log/cp-watchdog.log 2>&1`;

type Run = { status: number | null; stdout: string; stderr: string; calls: string[][] };

function alarm(crontab: string, curlExit = 0, args = ["2", "12:00:00"]): Run {
  const root = mkdtempSync(join(tmpdir(), "deploy-alarm-"));
  mkdirSync(join(root, "bin"));
  const calls = join(root, "curl-calls");
  writeFileSync(
    join(root, "bin", "curl"),
    `#!/bin/sh\nfor a in "$@"; do printf '%s\\n' "$a"; done >> ${JSON.stringify(calls)}\necho "--end--" >> ${JSON.stringify(calls)}\nexit ${curlExit}\n`,
  );
  chmodSync(join(root, "bin", "curl"), 0o755);
  writeFileSync(join(root, "crontab"), crontab);
  const r = spawnSync("bash", [SCRIPT, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    env: { PATH: `${join(root, "bin")}:/usr/bin:/bin`, HOME: root, CP_CRONTAB_FILE: join(root, "crontab") },
  });
  const parsed: string[][] = [];
  if (existsSync(calls)) {
    let cur: string[] = [];
    for (const l of readFileSync(calls, "utf8").split("\n")) {
      if (l === "--end--") {
        parsed.push(cur);
        cur = [];
      } else if (l !== "") cur.push(l);
    }
  }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, calls: parsed };
}

describe("ops/deploy-alarm.sh posts the deploy alarm to the webhook from the crontab", () => {
  it("posts once to the webhook of the watchdog line with count, 502 and time", () => {
    const r = alarm(`# m h dom mon dow command\n${CRON_LINE}\n`);
    expect(r.status, r.stderr).toBe(0);
    expect(r.calls.length).toBe(1);
    expect(r.calls[0]).toContain(URL);
    const text = r.calls[0].find((a) => a.startsWith("deploy window:"));
    expect(text, r.calls[0].join(" ")).toBeDefined();
    expect(text).toMatch(/\b2\b/);
    expect(text).toContain("502");
    expect(text).toContain("12:00:00");
    expect(text).not.toMatch(/(\d{1,3}\.){3}\d{1,3}/);
    expect(`${r.stdout}${r.stderr}`).not.toContain("planted-topic");
  });

  it("ends with exit 2 and calls no curl when the crontab has no webhook", () => {
    const r = alarm("*/5 * * * * /opt/control-plane/repo/ops/watchdog.sh >> /var/log/cp-watchdog.log 2>&1\n");
    expect(r.status).toBe(2);
    expect(r.calls.length).toBe(0);
    expect(r.stderr).toContain("no webhook in the crontab");
  });

  it("does not take the webhook from a commented line", () => {
    const r = alarm(`# ${CRON_LINE}\n`);
    expect(r.status).toBe(2);
    expect(r.calls.length).toBe(0);
    expect(r.stderr).toContain("no webhook in the crontab");
  });

  it("ends with exit 1 when the POST fails and still names no URL", () => {
    const r = alarm(`${CRON_LINE}\n`, 22);
    expect(r.status).toBe(1);
    expect(r.calls.length).toBe(1);
    expect(`${r.stdout}${r.stderr}`).not.toContain("planted-topic");
    expect(`${r.stdout}${r.stderr}`).not.toContain("alarm.invalid");
  });

  it("refuses arguments that are not a count and a time", () => {
    const r = alarm(`${CRON_LINE}\n`, 0, ["x", "noon"]);
    expect(r.status).toBe(2);
    expect(r.calls.length).toBe(0);
    expect(`${r.stdout}${r.stderr}`).not.toContain("planted-topic");
  });
});
