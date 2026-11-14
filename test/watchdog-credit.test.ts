import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * On 2026-11-11 the balance at the inference provider ran out and nobody heard of it for 28 hours, although ops/watchdog.sh runs on
 * the server every 5 minutes with a webhook. It now asks ops/credit-runway.sh --container as well and reports the change of state
 * only: one warning when the runway falls below the threshold, one message when it is back.
 *
 * No network: `curl` (health check and webhook), `docker` (the service container) and `openssl` (certificate) are fakes on PATH.
 * The fake webhook writes every POST into a log. The planted answer of the container carries the planted key in its label, the
 * way the provider answers with a masked one, so a watchdog that echoed the answer would leak it.
 */
const WATCHDOG = join(__dirname, "..", "ops", "watchdog.sh");
const PLANTED_KEY = ["sk", "or", "v1", "planted1111111111111111111111111111111111111111"].join("-");

const answer = (left: number, weekly: number) =>
  JSON.stringify({
    credits: JSON.stringify({ data: { total_credits: left + 10, total_usage: 10 } }),
    key: JSON.stringify({ data: { label: PLANTED_KEY, usage_weekly: weekly } }),
  });

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "watchdog-credit-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  const posts = join(root, "posts.log");
  const docker = join(root, "docker.log");
  const container = join(root, "container.json");
  writeFileSync(posts, "");
  writeFileSync(docker, "");
  const fake = (name: string, lines: string[]) => {
    writeFileSync(join(bin, name), ["#!/bin/sh", ...lines].join("\n") + "\n");
    chmodSync(join(bin, name), 0o755);
  };
  fake("curl", [
    'case "$*" in',
    `  *"-X POST"*) for a in "$@"; do printf '%s\\t' "$a"; done >> "${posts}"; echo >> "${posts}" ;;`,
    '  */health*) printf 200 ;;',
    "  *) exit 7 ;;",
    "esac",
  ]);
  fake("docker", [
    `printf '%s\\n' "$*" >> "${docker}"`,
    'case "$1" in',
    `  exec) cat "${container}" ;;`,
    "esac",
  ]);
  fake("openssl", ["exit 1"]);
  const state = join(mkdtempSync(join(tmpdir(), "watchdog-state-")), "state");
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
      },
    });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const postLines = () => readFileSync(posts, "utf8").split("\n").filter(Boolean);
  return { run, postLines, dockerLog: () => readFileSync(docker, "utf8") };
}

const credit = (lines: string[], word: "LOW" | "OK") =>
  lines.filter((l) => l.includes("credit") && l.includes(`CREDIT RUNWAY ${word}:`));

describe("ops/watchdog.sh warns once when the provider balance runs low and once when it is back", () => {
  it("three runs with a low balance post one LOW, the run with enough posts one OK, and nothing leaks the key", () => {
    const s = sandbox();
    const out: string[] = [];
    for (let i = 0; i < 3; i++) out.push(s.run(answer(4, 0)).out);
    const afterLow = s.postLines();
    expect(credit(afterLow, "LOW").length).toBe(1);
    expect(credit(afterLow, "OK").length).toBe(0);
    expect(afterLow.length).toBe(1);
    expect(afterLow[0]).toContain("https://openrouter.ai/settings/credits");
    out.push(s.run(answer(40, 7)).out);
    const all = s.postLines();
    expect(credit(all, "LOW").length).toBe(1);
    expect(credit(all, "OK").length).toBe(1);
    expect(all.length).toBe(2);
    expect(all.findIndex((l) => l.includes("CREDIT RUNWAY OK:"))).toBeGreaterThan(all.findIndex((l) => l.includes("CREDIT RUNWAY LOW:")));
    const log = out.join("");
    expect(log.match(/\[WARN\] credit CREDIT RUNWAY LOW: /g)?.length).toBe(1);
    expect(log.match(/\[OK\] credit CREDIT RUNWAY OK: /g)?.length).toBe(1);
    // The counter-proof for the leak check: the container answer the watchdog read does carry the key.
    expect(answer(4, 0)).toContain(PLANTED_KEY);
    expect(s.dockerLog()).toContain("exec deploy-cp-1 node -e");
    for (const line of [...all, ...log.split("\n")]) expect(line).not.toContain(PLANTED_KEY);
  }, 180_000);

  it("a runway that stays above the threshold posts nothing", () => {
    const s = sandbox();
    for (let i = 0; i < 2; i++) expect(s.run(answer(40, 7)).out).not.toContain("[WARN] credit");
    expect(s.postLines()).toEqual([]);
  }, 120_000);

  it("an unreadable answer is [WARN] credit unreadable, keeps the stored state and does not end the warning", () => {
    const s = sandbox();
    s.run(answer(4, 0));
    const failed = s.run("");
    expect(failed.out).toContain("[WARN] credit unreadable");
    expect(credit(s.postLines(), "OK").length).toBe(0);
    const again = s.run(answer(4, 0));
    expect(again.out).not.toContain("CREDIT RUNWAY LOW");
    expect(credit(s.postLines(), "LOW").length).toBe(1);
    s.run(answer(40, 7));
    expect(credit(s.postLines(), "OK").length).toBe(1);
  }, 180_000);

  it("an unreadable answer posts at most once a day", () => {
    const s = sandbox();
    s.run("");
    s.run("");
    const unreadable = s.postLines().filter((l) => l.includes("credit unreadable"));
    expect(unreadable.length).toBe(1);
  }, 120_000);
});
