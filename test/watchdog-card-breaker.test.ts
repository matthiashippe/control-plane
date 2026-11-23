import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ops/watchdog.sh reports the breaker of the card checkout (goals/wache/01, point 5): one warning when it turns on, one message
 * when the checkout opens again, nothing while the state stays, and a failed POST comes again in the next run.
 *
 * No network: `curl` (health check, sandboxd and webhook), `docker` (the service container), `openssl` (certificate) and `sleep`
 * are fakes on PATH. The real ops/card-breaker.sh --container runs and asks the fake `docker exec deploy-cp-1 node -e <query>
 * <module> <clock>`, which answers with the planted line of the container; the shorter call of ops/credit-runway.sh gets a
 * balance that stays fine. The fake webhook fails with exit 22 while the file `fail-next` exists and removes it, and writes every
 * successful POST into a log.
 */
const WATCHDOG = join(__dirname, "..", "ops", "watchdog.sh");
const ADDRESS = "0x" + "ab".repeat(20);
const ADDRESS_RE = /0x[0-9a-fA-F]{40}/;

const CREDIT_FINE = JSON.stringify({
  credits: JSON.stringify({ data: { total_credits: 50, total_usage: 10 } }),
  key: JSON.stringify({ data: { label: "masked", usage_weekly: 7 } }),
});
const ON = "card_refunds_60d 3 shortfall_usd 51.20 breaker on";
const OFF = "card_refunds_60d 1 shortfall_usd 12.00 breaker off";

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "watchdog-card-breaker-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  const posts = join(root, "posts.log");
  const credit = join(root, "credit.json");
  const breaker = join(root, "breaker.txt");
  const failNext = join(root, "fail-next");
  writeFileSync(posts, "");
  writeFileSync(credit, CREDIT_FINE);
  const fake = (name: string, lines: string[]) => {
    writeFileSync(join(bin, name), ["#!/bin/sh", ...lines].join("\n") + "\n");
    chmodSync(join(bin, name), 0o755);
  };
  fake("curl", [
    'case "$*" in',
    `  *"-X POST"*) if [ -e "${failNext}" ]; then rm -f "${failNext}"; exit 22; fi;`,
    `    for a in "$@"; do printf '%s\\t' "$a"; done >> "${posts}"; echo >> "${posts}" ;;`,
    "  */health*) printf 200 ;;",
    "  *) exit 7 ;;",
    "esac",
  ]);
  // ops/card-breaker.sh hands module and clock after the query, ops/credit-runway.sh nothing.
  fake("docker", [
    '[ "$1" = exec ] && [ "$2" = deploy-cp-1 ] || exit 1',
    `if [ "$#" -ge 6 ]; then cat "${breaker}"; else cat "${credit}"; fi`,
  ]);
  fake("openssl", ["exit 1"]);
  fake("sleep", ["exit 0"]);
  const state = join(mkdtempSync(join(tmpdir(), "watchdog-card-breaker-state-")), "state");
  const run = (breakerAnswer: string, opts: { failPost?: boolean } = {}) => {
    writeFileSync(breaker, breakerAnswer ? `${breakerAnswer}\n` : "");
    if (opts.failPost) writeFileSync(failNext, "");
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
  const stored = () => (existsSync(`${state}.card-breaker`) ? readFileSync(`${state}.card-breaker`, "utf8").trim() : null);
  return { run, postLines, stored };
}

const warnings = (lines: string[]) => lines.filter((l) => l.includes("control-plane WARN: card breaker on:"));
const opened = (lines: string[]) => lines.filter((l) => l.includes("control-plane OK: card breaker off:"));
const unreadable = (lines: string[]) => lines.filter((l) => l.includes("card breaker unreadable"));

describe("ops/watchdog.sh reports the breaker of the card checkout once per change", () => {
  it("posts one warning when the breaker turns on", () => {
    const s = sandbox();
    const quiet = s.run(OFF);
    expect(quiet.out).toContain("[INFO] card breaker still off, shortfall 12.00 USD from 1 refunds in 60 days");
    expect(s.postLines()).toEqual([]);
    expect(s.stored()).toBe("off");
    const r = s.run(ON);
    const all = s.postLines();
    expect(all.length, r.out).toBe(1);
    expect(warnings(all).length).toBe(1);
    expect(all[0]).toContain("Title: control-plane WARN");
    expect(all[0]).toContain("Priority: high");
    expect(all[0]).toContain("shortfall 51.20 USD from 3 refunds in 60 days");
    expect(all[0]).toContain("the limit of 50 USD");
    expect(all[0]).toContain("the card checkout is closed");
    expect(all[0]).not.toMatch(ADDRESS_RE);
    expect(r.out).toContain("[WARN] card breaker on: ");
    expect(s.stored()).toBe("on");
  }, 180_000);

  it("posts nothing more while the breaker stays on", () => {
    const s = sandbox();
    s.run(ON);
    const later = [s.run(ON), s.run(ON)];
    for (const r of later) expect(r.out).toContain("[INFO] card breaker still on, shortfall 51.20 USD");
    expect(warnings(s.postLines()).length).toBe(1);
    expect(s.postLines().length).toBe(1);
  }, 180_000);

  it("posts once when the checkout opens again", () => {
    const s = sandbox();
    s.run(ON);
    const back = s.run(OFF);
    s.run(OFF);
    const all = s.postLines();
    expect(warnings(all).length).toBe(1);
    expect(opened(all).length).toBe(1);
    expect(all.length).toBe(2);
    expect(all[1]).toContain("Title: control-plane OK");
    expect(all[1]).toContain("shortfall 12.00 USD in 60 days is below the limit of 50 USD, the card checkout is open again");
    expect(back.out).toContain("[OK] card breaker off: ");
    expect(s.stored()).toBe("off");
  }, 180_000);

  it("keeps the state and posts again on the next run when the post failed", () => {
    const s = sandbox();
    s.run(OFF);
    const failed = s.run(ON, { failPost: true });
    expect(failed.out).toContain("[WARN] webhook unreachable");
    expect(s.postLines()).toEqual([]);
    expect(s.stored()).toBe("off");
    s.run(ON);
    expect(warnings(s.postLines()).length).toBe(1);
    expect(s.stored()).toBe("on");
    s.run(ON);
    expect(s.postLines().length).toBe(1);
    // The same for the way back.
    s.run(OFF, { failPost: true });
    expect(opened(s.postLines()).length).toBe(0);
    expect(s.stored()).toBe("on");
    s.run(OFF);
    s.run(OFF);
    const all = s.postLines();
    expect(warnings(all).length).toBe(1);
    expect(opened(all).length).toBe(1);
    expect(all.length).toBe(2);
  }, 300_000);

  it("keeps the state when ops/card-breaker.sh cannot be read", () => {
    const s = sandbox();
    // Before the first readable answer (the module is missing until the rollout) an unreadable answer only goes into the log.
    const before = s.run("card_breaker unreadable");
    expect(before.out).toContain("[WARN] card breaker unreadable (card_breaker unreadable), last known state unknown");
    expect(s.postLines()).toEqual([]);
    expect(s.stored()).toBe(null);
    s.run(ON);
    expect(warnings(s.postLines()).length).toBe(1);
    // An answer that is not the one line, here with an address behind it, and no answer at all: the state stays on, one post a day.
    for (const answer of [`${ON} ${ADDRESS}`, "", "card_breaker unreadable"]) {
      const r = s.run(answer);
      expect(r.out).toContain("card breaker unreadable (card_breaker unreadable), last known state on");
      expect(r.out).not.toContain(ADDRESS);
      expect(s.stored()).toBe("on");
    }
    expect(unreadable(s.postLines()).length).toBe(1);
    expect(s.postLines().join("\n")).not.toMatch(ADDRESS_RE);
    // The breaker read again and still on: no second warning. Then off: the one message that the checkout is open again.
    s.run(ON);
    expect(warnings(s.postLines()).length).toBe(1);
    s.run(OFF);
    expect(opened(s.postLines()).length).toBe(1);
    expect(s.postLines().length).toBe(3);
  }, 300_000);
});
