import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Two gaps of the credit warning in ops/watchdog.sh, found in the review of fehler 01:
 *
 * 1. The credit check runs before the health check and goes through `docker exec`. A hanging Docker daemon must not hold the
 *    watchdog, or the outage alarm never comes either.
 * 2. After the one LOW warning the watchdog stayed silent until the balance was back, even when it fell to 0, the state of
 *    2026-11-11 that answered every inference request of every customer with 503. It now warns exactly once more for that.
 *
 * No network: `curl` (health check and webhook), `docker` (the service container) and `openssl` (certificate) are fakes on PATH.
 * The fake webhook writes every POST into a log, the fake curl notes every health request.
 */
const WATCHDOG = join(__dirname, "..", "ops", "watchdog.sh");

const answer = (left: number, weekly: number) =>
  JSON.stringify({
    credits: JSON.stringify({ data: { total_credits: left + 10, total_usage: 10 } }),
    key: JSON.stringify({ data: { label: "masked", usage_weekly: weekly } }),
  });

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "watchdog-kritik-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  const posts = join(root, "posts.log");
  const health = join(root, "health.log");
  const container = join(root, "container.json");
  const hang = join(root, "hang");
  writeFileSync(posts, "");
  writeFileSync(health, "");
  const fake = (name: string, lines: string[]) => {
    writeFileSync(join(bin, name), ["#!/bin/sh", ...lines].join("\n") + "\n");
    chmodSync(join(bin, name), 0o755);
  };
  fake("curl", [
    'case "$*" in',
    `  *"-X POST"*) for a in "$@"; do printf '%s\\t' "$a"; done >> "${posts}"; echo >> "${posts}" ;;`,
    `  */health*) echo health >> "${health}"; printf 200 ;;`,
    "  *) exit 7 ;;",
    "esac",
  ]);
  fake("docker", [
    'case "$1" in',
    `  exec) if [ -e "${hang}" ]; then sleep 300; fi; cat "${container}" ;;`,
    "esac",
  ]);
  fake("openssl", ["exit 1"]);
  const state = join(mkdtempSync(join(tmpdir(), "watchdog-kritik-state-")), "state");
  const run = (containerAnswer: string, opts: { hang?: boolean; timeoutMs?: number } = {}) => {
    writeFileSync(container, containerAnswer);
    if (opts.hang) writeFileSync(hang, "");
    else if (existsSync(hang)) rmSync(hang);
    const started = Date.now();
    // Asynchronous on purpose: a spawnSync of up to 50 s per run held the worker's event loop, and with the runs of the next tests
    // vitest's fixed 60 s timeout for its own worker RPC fired before the answer could be read ("Timeout calling onTaskUpdate",
    // audit 2026-11-13 line 5). The script and every assertion are unchanged.
    return new Promise<{ status: number | null; out: string; ms: number }>((resolve, reject) => {
      const child = spawn("bash", [WATCHDOG], {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          PATH: `${bin}:/usr/bin:/bin`,
          HOME: root,
          CP_URL: "https://watchdog.invalid",
          CP_ALERT_WEBHOOK: "https://hook.invalid/alerts",
          CP_WATCHDOG_STATE: state,
          CP_WATCHDOG_ALIVE: "0",
        },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
      child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));
      const timer = setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs ?? 60_000);
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on("close", (status) => {
        clearTimeout(timer);
        resolve({ status, out: `${stdout}${stderr}`, ms: Date.now() - started });
      });
    });
  };
  const postLines = () => readFileSync(posts, "utf8").split("\n").filter(Boolean);
  const healthRequests = () => readFileSync(health, "utf8").split("\n").filter(Boolean).length;
  return { run, postLines, healthRequests };
}

const credit = (lines: string[]) => lines.filter((l) => l.includes("credit"));
const low = (lines: string[]) => credit(lines).filter((l) => l.includes("LOW"));
const empty = (lines: string[]) => credit(lines).filter((l) => l.includes("empty"));
const ok = (lines: string[]) => credit(lines).filter((l) => l.includes("CREDIT RUNWAY OK:"));

describe("ops/watchdog.sh is not held by a hanging docker exec", () => {
  it("hanging docker: the run ends within 90 seconds, still asks /health and says the credit is unreadable", async () => {
    const s = sandbox();
    const r = await s.run(answer(40, 7), { hang: true, timeoutMs: 150_000 });
    expect(r.status).not.toBeNull();
    expect(r.ms).toBeLessThanOrEqual(90_000);
    expect(s.healthRequests()).toBeGreaterThanOrEqual(1);
    expect(r.out).toContain("[WARN] credit unreadable");
    expect(r.status).toBe(0);
  }, 180_000);
});

describe("ops/watchdog.sh warns once more when the balance is empty", () => {
  it("empty after LOW: two runs at 4 USD, three at 0 USD and one at 40 USD post one LOW, then one empty, then one OK", async () => {
    const s = sandbox();
    for (let i = 0; i < 2; i++) await s.run(answer(4, 0));
    expect(low(s.postLines()).length).toBe(1);
    expect(empty(s.postLines()).length).toBe(0);
    for (let i = 0; i < 3; i++) await s.run(answer(0, 0));
    const afterEmpty = s.postLines();
    expect(low(afterEmpty).length).toBe(1);
    expect(empty(afterEmpty).length).toBe(1);
    expect(afterEmpty.length).toBe(2);
    expect(afterEmpty[1]).toContain("https://openrouter.ai/settings/credits");
    await s.run(answer(40, 7));
    const all = s.postLines();
    expect(low(all).length).toBe(1);
    expect(empty(all).length).toBe(1);
    expect(ok(all).length).toBe(1);
    expect(all.length).toBe(3);
    const at = (pick: (l: string[]) => string[]) => all.indexOf(pick(all)[0]);
    expect(at(low)).toBeLessThan(at(empty));
    expect(at(empty)).toBeLessThan(at(ok));
  }, 240_000);

  it("empty on the first run: a balance of 0 USD without a LOW before posts exactly once", async () => {
    const s = sandbox();
    for (let i = 0; i < 3; i++) await s.run(answer(0, 0));
    const all = s.postLines();
    expect(all.length).toBe(1);
    expect(empty(all).length).toBe(1);
  }, 180_000);

  it("empty below zero: a balance of -0.16 USD after LOW counts as empty", async () => {
    const s = sandbox();
    await s.run(answer(4, 0));
    await s.run(answer(-0.16, 0));
    await s.run(answer(-0.16, 0));
    const all = s.postLines();
    expect(low(all).length).toBe(1);
    expect(empty(all).length).toBe(1);
    expect(all.length).toBe(2);
  }, 180_000);
});
