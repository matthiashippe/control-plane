import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * ops/status.sh compares the last delivery of the watchdog with the topic only while that delivery is younger than 11 hours
 * (ntfy caches 12 hours). With one sign of life just after 00:00 UTC a quiet day had no such delivery from about 11:05 UTC on,
 * so `alarm_path.received` was `unknown` for the rest of the day. The watchdog therefore posts a sign of life in each of three
 * windows per UTC day, starting at 00:00, 08:00 and 16:00 UTC, and stores the window (`YYYY-MM-DDTHH`) only after the POST
 * went through. A stamp of the old format (`YYYY-MM-DD`) counts as a missing window.
 *
 * Same fakes as test/watchdog-alive.test.ts (`curl`, `docker`, `openssl`, `sleep`, `date` on PATH, health 200, credit fine,
 * no network), but the fake `date` reads the whole moment from a file, so a case can move the clock over a day in steps of
 * 30 minutes. The fake webhook fails with exit 22 while the file `fail-all` exists and writes every successful POST into a
 * log, prefixed with the moment of the fake clock.
 *
 * WATCHDOG_UNDER_TEST points the test at another copy of the watchdog. That copy runs in its own ops/ next to copies of the
 * helper scripts of this ops/, so an older copy fails only for what it lacks itself.
 */
const OPS = join(__dirname, "..", "ops");
const UNDER_TEST = process.env.WATCHDOG_UNDER_TEST ? resolve(process.env.WATCHDOG_UNDER_TEST) : null;
const HOST = "alerts.invalid";
const TOPIC = "made-up-topic-0815";
const WEBHOOK = `https://${HOST}/${TOPIC}`;
const DAY = "2026-11-13";

const creditOk = JSON.stringify({
  credits: JSON.stringify({ data: { total_credits: 50, total_usage: 10 } }),
  key: JSON.stringify({ data: { label: "masked", usage_weekly: 7 } }),
});

const at = (iso: string) => Date.parse(iso) / 1000;
const iso = (seconds: number) => new Date(seconds * 1000).toISOString().replace(".000Z", "Z");

/** Every moment from `from` to `to` (both included) in steps of 30 minutes. */
function halfHours(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = at(from); t <= at(to); t += 1800) out.push(iso(t));
  return out;
}

type Result = { status: number | null; stdout: string; stderr: string };

/**
 * Runs a command without blocking the worker: a case runs up to 49 watchdogs in a row, and with spawnSync the worker could
 * not answer vitest for that long under load.
 */
function run(cmd: string, args: string[], opts: { cwd?: string; env: Record<string, string> }): Promise<Result> {
  return new Promise((done) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
    child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.on("close", (status) => {
      clearTimeout(timer);
      done({ status, stdout, stderr });
    });
  });
}

function fake(bin: string, name: string, lines: string[]) {
  writeFileSync(join(bin, name), ["#!/bin/sh", ...lines].join("\n") + "\n");
  chmodSync(join(bin, name), 0o755);
}

function watchdogScript(root: string): string {
  if (!UNDER_TEST) return join(OPS, "watchdog.sh");
  const ops = join(root, "ops");
  mkdirSync(ops);
  for (const f of readdirSync(OPS)) {
    if (f.endsWith(".sh") || f.endsWith(".cjs")) copyFileSync(join(OPS, f), join(ops, f));
  }
  copyFileSync(UNDER_TEST, join(ops, "watchdog.sh"));
  return join(ops, "watchdog.sh");
}

type Post = { at: string; title: string; line: string };

function sandbox(opts: { alive?: string } = {}) {
  const root = mkdtempSync(join(tmpdir(), "watchdog-slots-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  const posts = join(root, "posts.log");
  const container = join(root, "container.json");
  const failAll = join(root, "fail-all");
  const clock = join(root, "now");
  writeFileSync(posts, "");
  writeFileSync(container, creditOk);
  writeFileSync(clock, `${DAY}T00:00:00Z`);
  fake(bin, "curl", [
    'case "$*" in',
    `  *"-X POST"*) if [ -e "${failAll}" ]; then exit 22; fi;`,
    `    printf '%s\\t' "$(cat "${clock}")" >> "${posts}";`,
    `    for a in "$@"; do printf '%s\\t' "$a"; done >> "${posts}"; echo >> "${posts}" ;;`,
    "  */health*) echo 200 ;;",
    "  *) exit 7 ;;",
    "esac",
  ]);
  fake(bin, "docker", ['case "$1" in', `  exec) cat "${container}" ;;`, "esac"]);
  fake(bin, "openssl", ["exit 1"]);
  fake(bin, "sleep", ["exit 0"]);
  fake(bin, "date", [`n=$(cat "${clock}")`, 'case "$*" in', '  *%F*) echo "${n%%T*}" ;;', '  *) echo "$n" ;;', "esac"]);
  const stateDir = mkdtempSync(join(tmpdir(), "watchdog-slots-state-"));
  const state = join(stateDir, "state");
  if (opts.alive !== undefined) writeFileSync(`${state}.alive`, `${opts.alive}\n`);
  const script = watchdogScript(root);
  const runAt = async (moment: string) => {
    writeFileSync(clock, moment);
    const r = await run("bash", [script], {
      env: {
        PATH: `${bin}:/usr/bin:/bin`,
        HOME: root,
        CP_URL: "https://watchdog.invalid",
        CP_ALERT_WEBHOOK: WEBHOOK,
        CP_WATCHDOG_STATE: state,
      },
    });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const postList = (): Post[] =>
    readFileSync(posts, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const fields = line.split("\t");
        const title = fields.find((f) => f.startsWith("Title: "))?.slice("Title: ".length) ?? "";
        return { at: fields[0], title, line };
      });
  const alivePosts = () => postList().filter((p) => p.title === "control-plane ALIVE");
  const dead = (on: boolean) => (on ? writeFileSync(failAll, "") : rmSync(failAll, { force: true }));
  return { run: runAt, postList, alivePosts, dead, root, state };
}

const unreachableLines = (out: string) => out.split("\n").filter((l) => /^\S+ \[WARN\] webhook unreachable$/.test(l));

type Received = { last_alive: string | null; last_message: string | null; status: string };

/**
 * Runs the real ops/status.sh like test/status-alarm-received.test.ts: the fake `ssh` hands the watchdog log to the helper
 * scripts with CP_NOW, the fake `curl` answers only the poll of the planted topic (config on stdin with `-K -`).
 */
async function statusReceived(log: string, topicBody: string, now: string): Promise<{ received: Received | undefined; out: string }> {
  const root = mkdtempSync(join(tmpdir(), "watchdog-slots-status-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  const logPath = join(root, "cp-watchdog.log");
  writeFileSync(logPath, log);
  const bodyPath = join(root, "topic-body");
  writeFileSync(bodyPath, topicBody);
  fake(bin, "ssh", [
    'case "$*" in',
    '  *" bash -s") script=$(cat) ;;',
    "  *) exit 255 ;;",
    "esac",
    `printf '%s\\n' "$script" | CP_WATCHDOG_LOG=${JSON.stringify(logPath)} CP_NOW=${at(now)} bash -s`,
  ]);
  fake(bin, "curl", [
    'case " $* " in',
    '  *" -K - "*) cfg=$(cat) ;;',
    "  *) exit 7 ;;",
    "esac",
    `case "$cfg" in *'url = "${WEBHOOK}/json?poll=1&since=12h"'*) ;; *) exit 7 ;; esac`,
    `cat ${JSON.stringify(bodyPath)}`,
  ]);
  fake(bin, "openssl", ["exit 1"]);
  const r = await run("bash", [join(OPS, "status.sh")], {
    cwd: root,
    env: {
      PATH: `${bin}:/usr/bin:/bin`,
      HOME: root,
      CP_URL: "https://status.invalid",
      CP_DEPLOY_HOST: "root@server.invalid",
      CP_DEPLOY_KEY: join(root, "no-key"),
      CP_NOW: String(at(now)),
      CP_ALERT_WEBHOOK: WEBHOOK,
    },
  });
  let received: Received | undefined;
  try {
    received = JSON.parse(r.stdout).alarm_path?.received;
  } catch {
    received = undefined;
  }
  return { received, out: `${r.stdout}${r.stderr}` };
}

describe("ops/watchdog.sh posts a sign of life in three windows per UTC day", () => {
  it("posts a sign of life at 00:00, 08:00 and 16:00 UTC, once per window", async () => {
    const s = sandbox();
    for (const moment of halfHours(`${DAY}T00:00:00Z`, `${DAY}T23:30:00Z`)) {
      const r = await s.run(moment);
      expect(r.status, `${moment}\n${r.out}`).toBe(0);
    }
    expect(s.alivePosts().map((p) => p.at)).toEqual([
      `${DAY}T00:00:00Z`,
      `${DAY}T08:00:00Z`,
      `${DAY}T16:00:00Z`,
    ]);
    expect(s.postList().length).toBe(3);
    for (const p of s.alivePosts()) expect(p.line).toContain("Priority: min");
    expect(readFileSync(`${s.state}.alive`, "utf8").trim()).toBe(`${DAY}T16`);
  }, 300_000);

  it("at every run of a quiet day the last sign of life is younger than 11 hours", async () => {
    const s = sandbox();
    const moments = [...halfHours(`${DAY}T00:00:00Z`, `${DAY}T23:30:00Z`), "2026-11-14T00:00:00Z"];
    const ages: string[] = [];
    for (const moment of moments) {
      const r = await s.run(moment);
      expect(r.status, `${moment}\n${r.out}`).toBe(0);
      const last = s.alivePosts().at(-1);
      expect(last, moment).toBeDefined();
      const age = at(moment) - at(last!.at);
      if (age > 8 * 3600 + 1800) ages.push(`${moment}: last sign of life ${last!.at}`);
    }
    expect(ages).toEqual([]);
    expect(s.alivePosts().at(-1)?.at).toBe("2026-11-14T00:00:00Z");
  }, 300_000);

  it("a dead webhook is tried again on every run of the window", async () => {
    const s = sandbox({ alive: `${DAY}T00` });
    const before = await s.run(`${DAY}T07:30:00Z`);
    expect(before.status, before.out).toBe(0);
    expect(s.postList(), before.out).toEqual([]);

    s.dead(true);
    for (const moment of [`${DAY}T08:00:00Z`, `${DAY}T08:30:00Z`, `${DAY}T09:00:00Z`]) {
      const r = await s.run(moment);
      expect(r.status, r.out).toBe(0);
      expect(unreachableLines(r.out), r.out).toEqual([`${moment} [WARN] webhook unreachable`]);
      expect(r.out).not.toContain("webhook delivered");
    }
    expect(s.postList()).toEqual([]);

    s.dead(false);
    for (const moment of halfHours(`${DAY}T09:30:00Z`, `${DAY}T15:30:00Z`)) {
      const r = await s.run(moment);
      expect(r.status, r.out).toBe(0);
      expect(unreachableLines(r.out), r.out).toEqual([]);
    }
    expect(s.alivePosts().map((p) => p.at)).toEqual([`${DAY}T09:30:00Z`]);
    expect(s.postList().length).toBe(1);
  }, 300_000);

  it("a stamp of the old format counts as a missing window", async () => {
    const s = sandbox({ alive: DAY });
    const r = await s.run(`${DAY}T11:00:00Z`);
    expect(r.status, r.out).toBe(0);
    expect(s.alivePosts().map((p) => p.at), r.out).toEqual([`${DAY}T11:00:00Z`]);
    expect(r.out).toContain(`${DAY}T11:00:00Z [INFO] webhook delivered`);
    expect(readFileSync(`${s.state}.alive`, "utf8").trim()).toBe(`${DAY}T08`);

    const again = await s.run(`${DAY}T11:30:00Z`);
    expect(again.status, again.out).toBe(0);
    expect(s.alivePosts().length, again.out).toBe(1);
  }, 180_000);

  it("ops/status.sh at 18:00 UTC after a quiet day is never unknown", async () => {
    const s = sandbox();
    let log = "";
    for (const moment of halfHours(`${DAY}T00:00:00Z`, `${DAY}T18:00:00Z`)) {
      const r = await s.run(moment);
      expect(r.status, `${moment}\n${r.out}`).toBe(0);
      log += r.out;
    }
    const now = `${DAY}T18:00:00Z`;
    // ntfy answers `since=12h` with what it still has in its cache.
    const onTopic = s
      .postList()
      .filter((p) => at(p.at) >= at(now) - 12 * 3600)
      .map((p) => JSON.stringify({ event: "message", time: at(p.at), title: p.title, message: "planted message" }) + "\n")
      .join("");

    const ok = await statusReceived(log, onTopic, now);
    expect(ok.received?.status, ok.out).toBe("ok");
    expect(ok.received?.last_alive, ok.out).toBe(`${DAY}T16:00:00Z`);

    const red = await statusReceived(log, "", now);
    expect(red.received?.status, red.out).toBe("red");

    for (const r of [ok, red]) {
      expect(r.received?.status, r.out).not.toBe("unknown");
      expect(r.out).not.toContain(TOPIC);
      expect(r.out).not.toContain(HOST);
    }
  }, 300_000);
});
