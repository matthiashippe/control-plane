import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * When the POST to the webhook fails, ops/watchdog.sh must not store the new state, otherwise the message is lost: before this
 * test, `report` swallowed the error of `curl` and `check_credit` stored `low` anyway, so a webhook that failed exactly in the run
 * where the balance fell below the threshold meant no warning at all until the balance was back.
 *
 * No network: `curl` (health check and webhook), `docker` (the service container), `openssl` (certificate) and `sleep` (the pause
 * between two health attempts) are fakes on PATH. The fake webhook fails with exit 22 (what `curl --fail` gives for an HTTP error)
 * while the file `fail-next` exists and removes it, and writes every successful POST into a log.
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

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "watchdog-webhook-fail-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  const posts = join(root, "posts.log");
  const container = join(root, "container.json");
  const health = join(root, "health-code");
  const failNext = join(root, "fail-next");
  const http500Next = join(root, "http-500-next");
  writeFileSync(posts, "");
  const fake = (name: string, lines: string[]) => {
    writeFileSync(join(bin, name), ["#!/bin/sh", ...lines].join("\n") + "\n");
    chmodSync(join(bin, name), 0o755);
  };
  fake("curl", [
    'case "$*" in',
    `  *"-X POST"*) if [ -e "${failNext}" ]; then rm -f "${failNext}"; exit 22; fi;`,
    `    if [ -e "${http500Next}" ]; then rm -f "${http500Next}"; case "$*" in *--fail*) exit 22 ;; *) exit 0 ;; esac; fi;`,
    `    for a in "$@"; do printf '%s\\t' "$a"; done >> "${posts}"; echo >> "${posts}" ;;`,
    `  */health*) cat "${health}" ;;`,
    "  *) exit 7 ;;",
    "esac",
  ]);
  fake("docker", ['case "$1" in', `  exec) cat "${container}" ;;`, "esac"]);
  fake("openssl", ["exit 1"]);
  fake("sleep", ["exit 0"]);
  const state = join(mkdtempSync(join(tmpdir(), "watchdog-webhook-fail-state-")), "state");
  const run = (
    containerAnswer: string,
    opts: { healthCode?: string; failPost?: boolean; http500Post?: boolean } = {},
  ) => {
    writeFileSync(container, containerAnswer);
    writeFileSync(health, opts.healthCode ?? "200");
    if (opts.failPost) writeFileSync(failNext, "");
    if (opts.http500Post) writeFileSync(http500Next, "");
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

const low = (lines: string[]) => lines.filter((l) => l.includes("credit") && l.includes("CREDIT RUNWAY LOW:"));
const empty = (lines: string[]) => lines.filter((l) => l.includes("credit empty"));
const ok = (lines: string[]) => lines.filter((l) => l.includes("credit") && l.includes("CREDIT RUNWAY OK:"));
const outage = (lines: string[]) => lines.filter((l) => l.includes("OUTAGE") && l.includes("HTTP 500"));
const back = (lines: string[]) => lines.filter((l) => l.includes("reachable again"));

describe("ops/watchdog.sh posts a message again in the next run when the POST to the webhook failed", () => {
  it("LOW: a failed first POST is posted exactly once by the next run, a third run posts nothing", () => {
    const s = sandbox();
    const failed = s.run(answer(4, 0), { failPost: true });
    expect(failed.out).toContain("[WARN] webhook unreachable");
    expect(s.postLines()).toEqual([]);
    s.run(answer(4, 0));
    expect(low(s.postLines()).length).toBe(1);
    s.run(answer(4, 0));
    expect(low(s.postLines()).length).toBe(1);
    expect(s.postLines().length).toBe(1);
  }, 180_000);

  it("empty after LOW: a failed POST for empty is posted exactly once by the next run", () => {
    const s = sandbox();
    s.run(answer(4, 0));
    expect(low(s.postLines()).length).toBe(1);
    s.run(answer(0, 0), { failPost: true });
    expect(empty(s.postLines()).length).toBe(0);
    s.run(answer(0, 0));
    s.run(answer(0, 0));
    const all = s.postLines();
    expect(low(all).length).toBe(1);
    expect(empty(all).length).toBe(1);
    expect(all.length).toBe(2);
  }, 240_000);

  it("OK from low: a failed POST for OK is posted exactly once by the next run", () => {
    const s = sandbox();
    s.run(answer(4, 0));
    s.run(answer(40, 7), { failPost: true });
    expect(ok(s.postLines()).length).toBe(0);
    s.run(answer(40, 7));
    s.run(answer(40, 7));
    const all = s.postLines();
    expect(low(all).length).toBe(1);
    expect(ok(all).length).toBe(1);
    expect(all.length).toBe(2);
  }, 240_000);

  it("OUTAGE: a failed POST is posted exactly once by the next run, every run during the outage exits 1", () => {
    const s = sandbox();
    const failed = s.run(answer(40, 7), { healthCode: "500", failPost: true });
    expect(failed.status).toBe(1);
    expect(failed.out).toContain("[WARN] webhook unreachable");
    expect(s.postLines()).toEqual([]);
    expect(s.run(answer(40, 7), { healthCode: "500" }).status).toBe(1);
    expect(outage(s.postLines()).length).toBe(1);
    expect(s.run(answer(40, 7), { healthCode: "500" }).status).toBe(1);
    expect(outage(s.postLines()).length).toBe(1);
    expect(s.postLines().length).toBe(1);
  }, 180_000);

  it("reachable again: a failed POST is posted exactly once by the next run", () => {
    const s = sandbox();
    s.run(answer(40, 7), { healthCode: "500" });
    expect(outage(s.postLines()).length).toBe(1);
    s.run(answer(40, 7), { failPost: true });
    expect(back(s.postLines()).length).toBe(0);
    s.run(answer(40, 7));
    s.run(answer(40, 7));
    const all = s.postLines();
    expect(outage(all).length).toBe(1);
    expect(back(all).length).toBe(1);
    expect(all.length).toBe(2);
  }, 240_000);

  it("LOW: an answer 500 of the webhook is not taken as delivered, the next run posts exactly once", () => {
    const s = sandbox();
    const failed = s.run(answer(4, 0), { http500Post: true });
    expect(failed.out).toContain("[WARN] webhook unreachable");
    expect(s.postLines()).toEqual([]);
    s.run(answer(4, 0));
    expect(low(s.postLines()).length).toBe(1);
    expect(s.postLines().length).toBe(1);
  }, 180_000);
});
