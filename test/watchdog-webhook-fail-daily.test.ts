import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * The two messages that ops/watchdog.sh sends at most once a day (`credit unreadable` and the certificate warning) store their
 * day stamp only after the POST went through. When the POST fails, the next run on the same day posts the message exactly once,
 * and a third run on the same day posts nothing.
 *
 * Same setup as test/watchdog-webhook-fail.test.ts: `curl`, `docker`, `openssl`, `sleep` and `date` are fakes on PATH, no network.
 * `date` returns a fixed day, so the test does not depend on running before midnight. The fake webhook fails with exit 22 while
 * the file `fail-next` exists and removes it, and writes every successful POST into a log.
 *
 * WATCHDOG_UNDER_TEST points the test at another copy of the watchdog, so the counter-proof can run it against an older one.
 */
const WATCHDOG = process.env.WATCHDOG_UNDER_TEST
  ? resolve(process.env.WATCHDOG_UNDER_TEST)
  : join(__dirname, "..", "ops", "watchdog.sh");

const answer = (left: number, weekly: number) =>
  JSON.stringify({
    credits: JSON.stringify({ data: { total_credits: left + 10, total_usage: 10 } }),
    key: JSON.stringify({ data: { label: "masked", usage_weekly: weekly } }),
  });

function sandbox(opts: { certExpiring: boolean }) {
  const root = mkdtempSync(join(tmpdir(), "watchdog-webhook-fail-daily-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  const posts = join(root, "posts.log");
  const container = join(root, "container.json");
  const failNext = join(root, "fail-next");
  writeFileSync(posts, "");
  const fake = (name: string, lines: string[]) => {
    writeFileSync(join(bin, name), ["#!/bin/sh", ...lines].join("\n") + "\n");
    chmodSync(join(bin, name), 0o755);
  };
  fake("curl", [
    'case "$*" in',
    `  *"-X POST"*) if [ -e "${failNext}" ]; then rm -f "${failNext}"; exit 22; fi;`,
    `    for a in "$@"; do printf '%s\\t' "$a"; done >> "${posts}"; echo >> "${posts}" ;;`,
    "  */health*) echo 200 ;;",
    "  *) exit 7 ;;",
    "esac",
  ]);
  fake("docker", ['case "$1" in', `  exec) cat "${container}" ;;`, "esac"]);
  fake(
    "openssl",
    opts.certExpiring
      ? [
          "cat >/dev/null",
          'case "$*" in',
          "  *s_client*) echo 'fake certificate' ;;",
          "  *-checkend*) exit 1 ;;",
          "  *-enddate*) echo 'notAfter=Nov 20 00:00:00 2026 GMT' ;;",
          "esac",
        ]
      : ["exit 1"],
  );
  fake("sleep", ["exit 0"]);
  fake("date", ['case "$*" in', "  *%F*) echo 2026-11-12 ;;", "  *) echo 2026-11-12T12:00:00Z ;;", "esac"]);
  const state = join(mkdtempSync(join(tmpdir(), "watchdog-webhook-fail-daily-state-")), "state");
  const run = (containerAnswer: string, failPost = false) => {
    writeFileSync(container, containerAnswer);
    if (failPost) writeFileSync(failNext, "");
    const r = spawnSync("bash", [WATCHDOG], {
      encoding: "utf8",
      timeout: 60_000,
      env: {
        PATH: `${bin}:/usr/bin:/bin`,
        HOME: root,
        CP_URL: "https://watchdog.invalid",
        CP_ALERT_WEBHOOK: "https://hook.invalid/alerts",
        CP_WATCHDOG_STATE: state,
      },
    });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const postLines = () => readFileSync(posts, "utf8").split("\n").filter(Boolean);
  return { run, postLines };
}

const unreadable = (lines: string[]) => lines.filter((l) => l.includes("credit unreadable"));
const certificate = (lines: string[]) => lines.filter((l) => l.includes("certificate expires in less than"));

describe("ops/watchdog.sh posts a once-a-day message again on the same day when the POST to the webhook failed", () => {
  it("credit unreadable: a failed POST is posted exactly once by the next run, a third run posts nothing", () => {
    const s = sandbox({ certExpiring: false });
    const failed = s.run("", true);
    expect(failed.out).toContain("[WARN] webhook unreachable");
    expect(s.postLines()).toEqual([]);
    s.run("");
    expect(unreadable(s.postLines()).length).toBe(1);
    s.run("");
    expect(unreadable(s.postLines()).length).toBe(1);
    expect(s.postLines().length).toBe(1);
  }, 180_000);

  it("certificate warning: a failed POST is posted exactly once by the next run, a third run posts nothing", () => {
    const s = sandbox({ certExpiring: true });
    const failed = s.run(answer(40, 7), true);
    expect(failed.status).toBe(0);
    expect(failed.out).toContain("[WARN] webhook unreachable");
    expect(s.postLines()).toEqual([]);
    s.run(answer(40, 7));
    expect(certificate(s.postLines()).length).toBe(1);
    s.run(answer(40, 7));
    expect(certificate(s.postLines()).length).toBe(1);
    expect(s.postLines().length).toBe(1);
  }, 180_000);
});
