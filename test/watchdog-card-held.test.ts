import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ops/watchdog.sh reports card orders the IPN held (goals/wache/03, point 4): one warning per new held order, nothing while the
 * count stays, and a failed POST comes again in the next run.
 *
 * No network: `curl` (health check, sandboxd and webhook), `docker` (the service container), `openssl` (certificate) and `sleep`
 * are fakes on PATH. The real ops/card-breaker.sh runs next to the watchdog and asks the fake `docker exec deploy-cp-1 node -e
 * <query> <module> <clock> [--held]`: with `--held` as the last argument it answers the planted count of held orders, else the
 * line of a breaker that stays off; the shorter call of ops/credit-runway.sh gets a balance that stays fine. The fake webhook
 * fails with exit 22 while the file `fail-next` exists and removes it, and writes every successful POST into a log.
 * WATCHDOG_UNDER_TEST replaces the script (for the counter-proof of the goal), else ops/watchdog.sh.
 */
const WATCHDOG = process.env.WATCHDOG_UNDER_TEST || join(__dirname, "..", "ops", "watchdog.sh");
const ADDRESS_RE = /0x[0-9a-fA-F]{40}/;

const CREDIT_FINE = JSON.stringify({
  credits: JSON.stringify({ data: { total_credits: 50, total_usage: 10 } }),
  key: JSON.stringify({ data: { label: "masked", usage_weekly: 7 } }),
});
const BREAKER_OFF = "card_refunds_60d 0 shortfall_usd 0.00 breaker off";

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "watchdog-card-held-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  const posts = join(root, "posts.log");
  const credit = join(root, "credit.json");
  const breaker = join(root, "breaker.txt");
  const held = join(root, "held.txt");
  const failNext = join(root, "fail-next");
  writeFileSync(posts, "");
  writeFileSync(credit, CREDIT_FINE);
  writeFileSync(breaker, `${BREAKER_OFF}\n`);
  const fake = (name: string, lines: string[]) => {
    writeFileSync(join(bin, name), ["#!/bin/bash", ...lines].join("\n") + "\n");
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
  fake("docker", [
    '[ "$1" = exec ] && [ "$2" = deploy-cp-1 ] || exit 1',
    `if [ "\${!#}" = --held ]; then cat "${held}"; elif [ "$#" -ge 6 ]; then cat "${breaker}"; else cat "${credit}"; fi`,
  ]);
  fake("openssl", ["exit 1"]);
  fake("sleep", ["exit 0"]);
  const state = join(mkdtempSync(join(tmpdir(), "watchdog-card-held-state-")), "state");
  const run = (heldAnswer: string, opts: { failPost?: boolean } = {}) => {
    writeFileSync(held, heldAnswer ? `${heldAnswer}\n` : "");
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
  const stored = () => (existsSync(`${state}.card-held`) ? readFileSync(`${state}.card-held`, "utf8").trim() : null);
  return { run, postLines, stored };
}

const heldWarnings = (lines: string[]) => lines.filter((l) => l.includes("control-plane WARN: card order held:"));

describe("ops/watchdog.sh reports every new held card order once", () => {
  it("posts one warning when an order is held", () => {
    const s = sandbox();
    const quiet = s.run("card_orders_held 0");
    expect(quiet.out).toContain("[INFO] card orders held still 0");
    expect(s.postLines()).toEqual([]);
    const r = s.run("card_orders_held 1");
    const all = s.postLines();
    expect(all.length, r.out).toBe(1);
    expect(heldWarnings(all).length).toBe(1);
    expect(all[0]).toContain("Title: control-plane WARN");
    expect(all[0]).toContain("Priority: high");
    expect(all[0]).toContain(
      "card order held: 1 new, 1 in total, paid while the card checkout was closed, nothing credited",
    );
    expect(all[0]).not.toMatch(ADDRESS_RE);
    expect(r.out).toContain("[WARN] card order held: 1 new, 1 in total");
    expect(s.stored()).toBe("1");
  }, 180_000);

  it("posts nothing more while the number of held orders stays", () => {
    const s = sandbox();
    // No state file yet counts as 0, so the first run already reports the held order.
    s.run("card_orders_held 2");
    expect(heldWarnings(s.postLines())).toHaveLength(1);
    expect(s.postLines()[0]).toContain("card order held: 2 new, 2 in total");
    const later = [s.run("card_orders_held 2"), s.run("card_orders_held 2")];
    for (const r of later) expect(r.out).toContain("[INFO] card orders held still 2");
    expect(s.postLines().length).toBe(1);
    expect(s.stored()).toBe("2");
  }, 180_000);

  it("posts again when another order is held", () => {
    const s = sandbox();
    s.run("card_orders_held 1");
    s.run("card_orders_held 1");
    s.run("card_orders_held 3");
    const all = s.postLines();
    expect(heldWarnings(all).length).toBe(2);
    expect(all.length).toBe(2);
    expect(all[1]).toContain("card order held: 2 new, 3 in total");
    expect(s.stored()).toBe("3");
  }, 180_000);

  it("keeps the count and posts again on the next run when the post failed", () => {
    const s = sandbox();
    s.run("card_orders_held 0");
    const failed = s.run("card_orders_held 1", { failPost: true });
    expect(failed.out).toContain("[WARN] webhook unreachable");
    expect(s.postLines()).toEqual([]);
    // Still no stored count, which counts as 0: the held order is not marked as reported.
    expect(s.stored()).toBe(null);
    s.run("card_orders_held 1");
    expect(heldWarnings(s.postLines()).length).toBe(1);
    expect(s.postLines()[0]).toContain("card order held: 1 new, 1 in total");
    expect(s.stored()).toBe("1");
    s.run("card_orders_held 1");
    expect(s.postLines().length).toBe(1);
  }, 240_000);

  it("posts nothing when ops/card-breaker.sh --held cannot be read", () => {
    const s = sandbox();
    s.run("card_orders_held 1");
    expect(heldWarnings(s.postLines())).toHaveLength(1);
    // The unreadable answer of the tool, a line with an address behind it, a wrong format and no answer at all.
    for (const answer of ["card_breaker unreadable", `card_orders_held 5 0x${"ab".repeat(20)}`, "card_orders_held x", ""]) {
      const r = s.run(answer);
      expect(r.out).toContain("[WARN] card orders held unreadable, nothing posted");
      expect(r.out).not.toMatch(ADDRESS_RE);
      expect(s.stored()).toBe("1");
    }
    expect(s.postLines().length).toBe(1);
    // Readable again with the same count: still no second post.
    s.run("card_orders_held 1");
    expect(s.postLines().length).toBe(1);
  }, 300_000);
});
