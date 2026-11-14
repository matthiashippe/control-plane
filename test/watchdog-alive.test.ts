import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * ops/watchdog.sh reports changes of state only, so on a quiet day it posts nothing, and a dead webhook left no trace: no POST,
 * no line `[WARN] webhook unreachable`, and ops/status.sh kept reporting the alarm path as ok. The watchdog therefore posts a
 * sign of life with priority `min` in the first run of each UTC day and stores the day stamp only after the POST went through,
 * so a dead webhook leaves one line per run. Every delivered POST leaves `[INFO] webhook delivered`.
 *
 * Same setup as test/watchdog-webhook-fail-daily.test.ts: `curl`, `docker`, `openssl`, `sleep` and `date` are fakes on PATH,
 * no network. Health answers 200 and the credit is fine, so nothing but the sign of life is ever posted. The fake `date` reads
 * the day from a file in the sandbox, so a case can move on to the next day. The fake webhook fails with exit 22 (an HTTP error
 * under `--fail`) while the file `fail-all` exists, and writes every successful POST into a log, one argument per field.
 *
 * WATCHDOG_UNDER_TEST points the test at another copy of the watchdog, so the counter-proof can run it against an older one.
 */
const WATCHDOG = process.env.WATCHDOG_UNDER_TEST
  ? resolve(process.env.WATCHDOG_UNDER_TEST)
  : join(__dirname, "..", "ops", "watchdog.sh");
const UNREACHABLE_COUNTER = join(__dirname, "..", "ops", "webhook-unreachable.sh");

const creditOk = JSON.stringify({
  credits: JSON.stringify({ data: { total_credits: 50, total_usage: 10 } }),
  key: JSON.stringify({ data: { label: "masked", usage_weekly: 7 } }),
});

function sandbox(opts: { deadWebhook?: boolean; alive?: string } = {}) {
  const root = mkdtempSync(join(tmpdir(), "watchdog-alive-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  const posts = join(root, "posts.log");
  const container = join(root, "container.json");
  const failAll = join(root, "fail-all");
  const day = join(root, "day");
  writeFileSync(posts, "");
  writeFileSync(container, creditOk);
  writeFileSync(day, "2026-11-13");
  if (opts.deadWebhook) writeFileSync(failAll, "");
  const fake = (name: string, lines: string[]) => {
    writeFileSync(join(bin, name), ["#!/bin/sh", ...lines].join("\n") + "\n");
    chmodSync(join(bin, name), 0o755);
  };
  fake("curl", [
    'case "$*" in',
    `  *"-X POST"*) if [ -e "${failAll}" ]; then exit 22; fi;`,
    `    for a in "$@"; do printf '%s\\t' "$a"; done >> "${posts}"; echo >> "${posts}" ;;`,
    "  */health*) echo 200 ;;",
    "  *) exit 7 ;;",
    "esac",
  ]);
  fake("docker", ['case "$1" in', `  exec) cat "${container}" ;;`, "esac"]);
  fake("openssl", ["exit 1"]);
  fake("sleep", ["exit 0"]);
  fake("date", ['case "$*" in', `  *%F*) cat "${day}" ;;`, `  *) echo "$(cat "${day}")T11:00:00Z" ;;`, "esac"]);
  const state = join(mkdtempSync(join(tmpdir(), "watchdog-alive-state-")), "state");
  const run = () => {
    const env: Record<string, string> = {
      PATH: `${bin}:/usr/bin:/bin`,
      HOME: root,
      CP_URL: "https://watchdog.invalid",
      CP_ALERT_WEBHOOK: "https://hook.invalid/alerts",
      CP_WATCHDOG_STATE: state,
    };
    if (opts.alive !== undefined) env.CP_WATCHDOG_ALIVE = opts.alive;
    const r = spawnSync("bash", [WATCHDOG], { encoding: "utf8", timeout: 60_000, env });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const postLines = () => readFileSync(posts, "utf8").split("\n").filter(Boolean);
  const nextDay = (d: string) => writeFileSync(day, d);
  return { run, postLines, nextDay, root };
}

const unreachableLines = (out: string) => out.split("\n").filter((l) => /^\S+ \[WARN\] webhook unreachable$/.test(l));

describe("ops/watchdog.sh posts a daily sign of life, so a dead webhook shows on a quiet day", () => {
  it("quiet day posts one sign of life with priority min, once per day", () => {
    const s = sandbox();
    const first = s.run();
    expect(first.status, first.out).toBe(0);
    expect(s.postLines().length, first.out).toBe(1);
    expect(s.postLines()[0]).toContain("Priority: min");
    expect(s.postLines()[0]).toContain("daily sign of life");
    expect(first.out).toContain("2026-11-13T11:00:00Z [INFO] webhook delivered");
    expect(unreachableLines(first.out)).toEqual([]);

    const second = s.run();
    expect(second.status, second.out).toBe(0);
    expect(s.postLines().length, second.out).toBe(1);
    expect(second.out).not.toContain("webhook delivered");

    s.nextDay("2026-11-14");
    const nextDay = s.run();
    expect(nextDay.status, nextDay.out).toBe(0);
    expect(s.postLines().length, nextDay.out).toBe(2);
    expect(s.postLines()[1]).toContain("Priority: min");
    expect(nextDay.out).toContain("2026-11-14T11:00:00Z [INFO] webhook delivered");
  }, 180_000);

  it("dead webhook on a quiet day leaves three lines webhook unreachable after three runs", () => {
    const s = sandbox({ deadWebhook: true });
    const outs = [s.run(), s.run(), s.run()].map((r) => r.out);
    const all = outs.join("");
    expect(s.postLines()).toEqual([]);
    expect(unreachableLines(all), all).toEqual([
      "2026-11-13T11:00:00Z [WARN] webhook unreachable",
      "2026-11-13T11:00:00Z [WARN] webhook unreachable",
      "2026-11-13T11:00:00Z [WARN] webhook unreachable",
    ]);
    expect(all).not.toContain("webhook delivered");

    // ops/status.sh counts these lines with ops/webhook-unreachable.sh; 2026-11-13T12:00:00Z is CP_NOW.
    const log = join(s.root, "cp-watchdog.log");
    writeFileSync(log, all);
    const counted = spawnSync("bash", [UNREACHABLE_COUNTER, log], {
      encoding: "utf8",
      env: { PATH: "/usr/bin:/bin", CP_NOW: "1794571200" },
    });
    expect(counted.status, counted.stderr).toBe(0);
    expect(counted.stdout.trim()).toBe("3");
  }, 180_000);

  it("CP_WATCHDOG_ALIVE=0 posts no sign of life", () => {
    const s = sandbox({ deadWebhook: true, alive: "0" });
    const outs = [s.run(), s.run()].map((r) => r.out);
    const all = outs.join("");
    expect(s.postLines()).toEqual([]);
    expect(unreachableLines(all), all).toEqual([]);
    expect(all).not.toContain("sign of life");

    const live = sandbox({ alive: "0" });
    live.run();
    expect(live.postLines()).toEqual([]);
  }, 180_000);
});
