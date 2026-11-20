import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * kunden 05: from 2026-11-11 02:01 to 2026-11-12 08:22 UTC the balance at the inference provider was empty and the largest paying
 * customer got 503 on 1393 requests, while nobody was warned. This drives ops/watchdog.sh over a series of runs in which the balance
 * falls in steps from 9.37 USD to 0 and asks for the order a person on call needs: the first message on the webhook is
 * `CREDIT RUNWAY LOW`, it comes in a run whose balance is still above 0, and only later does `credit empty` follow.
 *
 * No network, the same fakes as test/watchdog-credit.test.ts: `curl` (health check and webhook), `docker` (the answer of the service
 * container that ops/credit-runway.sh --container reads) and `openssl` (certificate) are fakes on PATH. ops/credit-runway.sh itself
 * runs unchanged on the planted answers. The fake webhook writes every POST into a log.
 */
const WATCHDOG = join(__dirname, "..", "ops", "watchdog.sh");

/** The planted answer of the container: `left` USD balance and `weekly` USD of usage in the last 7 days. */
const answer = (left: number, weekly: number) =>
  JSON.stringify({
    credits: JSON.stringify({ data: { total_credits: left + 10, total_usage: 10 } }),
    key: JSON.stringify({ data: { label: "sk-or-v1-***", usage_weekly: weekly } }),
  });

function sandbox(extraEnv: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), "credit-before-503-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  const posts = join(root, "posts.log");
  const container = join(root, "container.json");
  writeFileSync(posts, "");
  const fake = (name: string, lines: string[]) => {
    writeFileSync(join(bin, name), ["#!/bin/sh", ...lines].join("\n") + "\n");
    chmodSync(join(bin, name), 0o755);
  };
  fake("curl", [
    'case "$*" in',
    `  *"-X POST"*) for a in "$@"; do printf '%s\\t' "$a"; done >> "${posts}"; echo >> "${posts}" ;;`,
    "  */health*) printf 200 ;;",
    "  *) exit 7 ;;",
    "esac",
  ]);
  fake("docker", ['case "$1" in', `  exec) cat "${container}" ;;`, "esac"]);
  fake("openssl", ["exit 1"]);
  const state = join(mkdtempSync(join(tmpdir(), "credit-before-503-state-")), "state");
  const run = (containerAnswer: string) => {
    writeFileSync(container, containerAnswer);
    const r = spawnSync("bash", [WATCHDOG], {
      encoding: "utf8",
      timeout: 60_000,
      env: {
        PATH: `${bin}:/usr/bin:/bin`,
        HOME: root,
        CP_URL: "https://watchdog.invalid",
        CP_ALERT_WEBHOOK: "https://hook.invalid/alerts",
        CP_WATCHDOG_STATE: state,
        CP_WATCHDOG_ALIVE: "0",
        ...extraEnv,
      },
    });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const postLines = () => readFileSync(posts, "utf8").split("\n").filter(Boolean);
  return { run, postLines };
}

/** The balance of each run, falling in steps from the 9.37 USD of 2026-11-10 to 0. */
const FALLING = [9.37, 7.5, 5.6, 3.7, 1.8, 0];
/** 7 USD a week is 1 USD a day, so the threshold is the 5 USD floor of CP_CREDIT_WARN_USD (3 days would be only 3 USD). */
const WEEKLY = 7;

/** Runs the series and returns, per webhook message, the index of the run that posted it and its text. */
function series(extraEnv: Record<string, string> = {}) {
  const s = sandbox(extraEnv);
  const messages: { run: number; text: string }[] = [];
  FALLING.forEach((left, i) => {
    const before = s.postLines().length;
    s.run(answer(left, WEEKLY));
    for (const text of s.postLines().slice(before)) messages.push({ run: i, text });
  });
  return messages;
}

describe("ops/watchdog.sh reports a falling provider balance before it is empty", () => {
  it("warns before empty: over six runs from 9.37 USD to 0 the first message is LOW, in a run above 0, before credit empty", () => {
    const messages = series();
    expect(FALLING.length).toBeGreaterThanOrEqual(4);
    expect(messages.length).toBeGreaterThanOrEqual(2);

    const first = messages[0];
    expect(first.text).toContain("control-plane WARN: credit CREDIT RUNWAY LOW: ");
    expect(first.text).not.toContain("credit empty");
    // The first warning comes while there is still money left, so the 503 of 2026-11-11 can still be avoided.
    expect(FALLING[first.run]).toBeGreaterThan(0);
    // It comes in the first run below the 5 USD threshold, not later: 9.37, 7.5 and 5.6 post nothing.
    expect(first.run).toBe(FALLING.findIndex((left) => left < 5));
    expect(messages.filter((m) => m.run < first.run)).toEqual([]);

    const empty = messages.findIndex((m) => m.text.includes("credit empty"));
    expect(empty).toBeGreaterThan(0);
    expect(FALLING[messages[empty].run]).toBe(0);
    expect(messages[empty].run).toBeGreaterThan(first.run);

    // One LOW and one empty, no repetition in between: the run at 1.8 USD stays quiet.
    expect(messages.filter((m) => m.text.includes("CREDIT RUNWAY LOW:") && !m.text.includes("credit empty")).length).toBe(1);
    expect(messages.filter((m) => m.text.includes("credit empty")).length).toBe(1);
    expect(messages.length).toBe(2);
  }, 240_000);
});
