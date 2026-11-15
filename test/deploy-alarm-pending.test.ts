import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

/**
 * A deploy alarm that did not go out must still reach somebody. ops/deploy-window.sh ends with exit 3 when the alarm was due
 * but the ssh call of ops/deploy-alarm.sh failed; ops/deploy-alarm.sh keeps count and time in `<state>.deploy-502` when the
 * POST failed or the crontab names no webhook; ops/watchdog.sh sends that file on its next run and removes it only after a
 * delivered POST.
 *
 * No network: `ssh`, `curl`, `docker`, `openssl` and `sleep` are fakes on PATH, every state lives in mkdtemp, and every
 * crontab sets CP_WATCHDOG_STATE to a temp directory. Addresses come from the documentation ranges only.
 */
const REPO = join(__dirname, "..");
const URL = "https://alarm.invalid/planted-topic";
const IP = /(\d{1,3}\.){3}\d{1,3}/;

// ---------------------------------------------------------------------------------------------------------------- window

const OWN = "192.0.2.10";
const STRANGER = "198.51.100.23";
const STARTED = "2026-11-01T12:00:00.123456789Z";
const T0 = Date.parse("2026-11-01T12:00:00Z") / 1000;
const COPIES = ["ops/deploy-window.sh", "ops/own-ips.sh", "ops/access-log.sh", "ops/deploy-alarm.sh"];

function window(alarmExit: number) {
  const root = mkdtempSync(join(tmpdir(), "deploy-alarm-pending-window-"));
  for (const f of COPIES) {
    mkdirSync(join(root, f, ".."), { recursive: true });
    copyFileSync(join(REPO, f), join(root, f));
  }
  writeFileSync(join(root, "ops", "own-ips.txt"), `${OWN} 2026-11-01  planted own address\n`);
  const row = JSON.stringify({ ts: T0 + 3, request: { remote_ip: STRANGER, method: "POST", uri: "/v1/chat/completions" }, status: 502 });
  writeFileSync(join(root, "planted-access.log.gz"), gzipSync(`${row}\n`));
  mkdirSync(join(root, "bin"));
  writeFileSync(
    join(root, "bin", "ssh"),
    [
      "#!/bin/sh",
      'for last in "$@"; do :; done',
      'case "$last" in',
      `  *SSH_CLIENT*) echo "${OWN} 40000 22" ;;`,
      `  *"docker inspect"*) echo "${STARTED}" ;;`,
      `  *deploy-caddy-1*) cat ${JSON.stringify(join(root, "planted-access.log.gz"))} ;;`,
      `  *"bash -s"*) cat > /dev/null; exit ${alarmExit} ;;`,
      "  *) exit 255 ;;",
      "esac",
      "",
    ].join("\n"),
  );
  chmodSync(join(root, "bin", "ssh"), 0o755);
  writeFileSync(join(root, "bin", "fake-sleep"), "#!/bin/sh\nexit 0\n");
  chmodSync(join(root, "bin", "fake-sleep"), 0o755);
  const r = spawnSync("bash", [join(root, "ops", "deploy-window.sh")], {
    cwd: root,
    encoding: "utf8",
    timeout: 60_000,
    env: {
      PATH: `${join(root, "bin")}:/usr/bin:/bin`,
      HOME: root,
      CP_OWN_IPS_SEEN: join(root, "seen.txt"),
      CP_WINDOW_NOW: "2026-11-01T12:00:20",
      CP_WINDOW_SLEEP: join(root, "bin", "fake-sleep"),
    },
  });
  const out = `${r.stdout}${r.stderr}`;
  return { status: r.status, out, lines: out.split("\n").filter(Boolean) };
}

// ----------------------------------------------------------------------------------------------------------------- alarm

function alarmBox() {
  const root = mkdtempSync(join(tmpdir(), "deploy-alarm-pending-alarm-"));
  const stateDir = mkdtempSync(join(tmpdir(), "deploy-alarm-pending-state-"));
  const state = join(stateDir, "state");
  mkdirSync(join(root, "bin"));
  const curlExit = join(root, "curl-exit");
  writeFileSync(join(root, "bin", "curl"), `#!/bin/sh\nexit "$(cat ${JSON.stringify(curlExit)})"\n`);
  chmodSync(join(root, "bin", "curl"), 0o755);
  const run = (crontab: string, opts: { curlExit?: number; args?: string[] } = {}) => {
    writeFileSync(curlExit, String(opts.curlExit ?? 0));
    writeFileSync(join(root, "crontab"), crontab);
    const r = spawnSync("bash", [join(REPO, "ops", "deploy-alarm.sh"), ...(opts.args ?? ["2", "12:00:00"])], {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
      env: { PATH: `${join(root, "bin")}:/usr/bin:/bin`, HOME: root, CP_CRONTAB_FILE: join(root, "crontab") },
    });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const withHook = `*/5 * * * * CP_ALERT_WEBHOOK=${URL} CP_WATCHDOG_STATE=${state} /opt/control-plane/repo/ops/watchdog.sh >> /var/log/cp-watchdog.log 2>&1\n`;
  const withoutHook = `*/5 * * * * CP_WATCHDOG_STATE=${state} /opt/control-plane/repo/ops/watchdog.sh >> /var/log/cp-watchdog.log 2>&1\n`;
  return { run, state, stateDir, pending: `${state}.deploy-502`, withHook, withoutHook };
}

function quiet(out: string, stateDir: string) {
  expect(out).not.toContain("planted-topic");
  expect(out).not.toContain("alarm.invalid");
  expect(out).not.toContain(stateDir);
  expect(out).not.toContain("deploy-502");
}

// -------------------------------------------------------------------------------------------------------------- watchdog

function watchdogBox() {
  const root = mkdtempSync(join(tmpdir(), "deploy-alarm-pending-watchdog-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  const posts = join(root, "posts");
  const postFails = join(root, "post-fails");
  const container = join(root, "container.json");
  writeFileSync(
    container,
    JSON.stringify({
      credits: JSON.stringify({ data: { total_credits: 50, total_usage: 10 } }),
      key: JSON.stringify({ data: { label: "masked", usage_weekly: 7 } }),
    }),
  );
  const fake = (name: string, lines: string[]) => {
    writeFileSync(join(bin, name), ["#!/bin/sh", ...lines].join("\n") + "\n");
    chmodSync(join(bin, name), 0o755);
  };
  fake("curl", [
    'case "$*" in',
    `  *"-X POST"*) if [ -e "${postFails}" ]; then exit 22; fi;`,
    `    for a in "$@"; do printf '%s\\n' "$a"; done >> "${posts}"; echo "--end--" >> "${posts}" ;;`,
    "  */health*) echo 200 ;;",
    "  *) exit 7 ;;",
    "esac",
  ]);
  fake("docker", ['case "$1" in', `  exec) cat "${container}" ;;`, "esac"]);
  fake("openssl", ["exit 1"]);
  fake("sleep", ["exit 0"]);
  const state = join(mkdtempSync(join(tmpdir(), "deploy-alarm-pending-wstate-")), "state");
  const pending = `${state}.deploy-502`;
  const run = (opts: { webhook?: boolean; failPost?: boolean } = {}) => {
    if (opts.failPost) writeFileSync(postFails, "");
    else if (existsSync(postFails)) spawnSync("rm", ["-f", postFails]);
    const env: Record<string, string> = {
      PATH: `${bin}:/usr/bin:/bin`,
      HOME: root,
      CP_URL: "https://watchdog.invalid",
      CP_WATCHDOG_STATE: state,
      CP_WATCHDOG_ALIVE: "0",
    };
    if (opts.webhook !== false) env.CP_ALERT_WEBHOOK = "https://hook.invalid/alerts";
    const r = spawnSync("bash", [join(REPO, "ops", "watchdog.sh")], { encoding: "utf8", timeout: 60_000, env });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const calls = (): string[][] => {
    if (!existsSync(posts)) return [];
    const parsed: string[][] = [];
    let cur: string[] = [];
    for (const l of readFileSync(posts, "utf8").split("\n")) {
      if (l === "--end--") {
        parsed.push(cur);
        cur = [];
      } else if (l !== "") cur.push(l);
    }
    return parsed;
  };
  return { run, calls, pending };
}

/** The arguments that follow an `-H` in one call of the fake curl. */
function headers(call: string[]): string[] {
  return call.flatMap((a, i) => (a === "-H" && i + 1 < call.length ? [call[i + 1]] : []));
}

const deployAlarms = (calls: string[][]) => calls.filter((c) => headers(c).includes("Title: deploy-window 502"));

/** The text of a POST: the argument after `--data`, `-d` or `--data-raw`. */
function textOf(call: string[]): string {
  const i = call.findIndex((a) => a === "--data" || a === "-d" || a === "--data-raw");
  return i >= 0 && i + 1 < call.length ? call[i + 1] : "";
}

const KEPT = "2 12:00:00\n5 14:31:07\n";

describe("a deploy alarm that was not sent is kept on the VM and sent by the watchdog", () => {
  it("deploy-window ends with exit 3 for every alarm that was not sent", () => {
    for (const k of [255, 1, 2]) {
      const r = window(k);
      expect(r.lines, r.out).toContain("BAD GATEWAY 1 of 1 request(s) from outside answered 502");
      expect(r.lines, r.out).toContain(`ALARM NOT SENT: exit ${k}`);
      expect(r.status, r.out).toBe(3);
    }
  }, 180_000);

  it("deploy-alarm keeps count and time for the watchdog only when the alarm failed", () => {
    const failed = alarmBox();
    const r1 = failed.run(failed.withHook, { curlExit: 22 });
    expect(r1.status, r1.out).toBe(1);
    expect(existsSync(failed.pending), r1.out).toBe(true);
    expect(readFileSync(failed.pending, "utf8")).toBe("2 12:00:00\n");
    quiet(r1.out, failed.stateDir);

    const noHook = alarmBox();
    const r2 = noHook.run(noHook.withoutHook);
    expect(r2.status, r2.out).toBe(2);
    expect(r2.out).toContain("no webhook in the crontab");
    expect(existsSync(noHook.pending), r2.out).toBe(true);
    expect(readFileSync(noHook.pending, "utf8")).toBe("2 12:00:00\n");
    quiet(r2.out, noHook.stateDir);

    const sent = alarmBox();
    const r3 = sent.run(sent.withHook);
    expect(r3.status, r3.out).toBe(0);
    expect(existsSync(sent.pending), r3.out).toBe(false);
    quiet(r3.out, sent.stateDir);

    const bad = alarmBox();
    const r4 = bad.run(bad.withHook, { args: ["x", "noon"] });
    expect(r4.status, r4.out).toBe(2);
    expect(existsSync(bad.pending), r4.out).toBe(false);
    quiet(r4.out, bad.stateDir);
  });

  it("deploy-alarm appends a second failed alarm to the first", () => {
    const b = alarmBox();
    expect(b.run(b.withHook, { curlExit: 22 }).status).toBe(1);
    expect(b.run(b.withHook, { curlExit: 7, args: ["5", "14:31:07"] }).status).toBe(1);
    expect(readFileSync(b.pending, "utf8")).toBe(KEPT);
  });

  it("watchdog sends a kept deploy alarm with priority high and then removes the file", () => {
    const w = watchdogBox();
    writeFileSync(w.pending, KEPT);
    const r = w.run();
    const sent = deployAlarms(w.calls());
    expect(sent.length, r.out).toBe(1);
    expect(sent[0][sent[0].indexOf("Title: deploy-window 502") - 1]).toBe("-H");
    expect(sent[0][sent[0].indexOf("Priority: high") - 1]).toBe("-H");
    const text = textOf(sent[0]);
    for (const part of ["2", "12:00:00", "5", "14:31:07"]) expect(text, text).toContain(part);
    expect(text).toMatch(/\b2\b/);
    expect(text).toMatch(/\b5\b/);
    expect(text).not.toMatch(IP);
    expect(text).not.toContain("hook.invalid");
    expect(r.out).toContain("[INFO] webhook delivered");
    expect(existsSync(w.pending), r.out).toBe(false);

    const again = w.run();
    expect(deployAlarms(w.calls()).length, again.out).toBe(1);
  }, 120_000);

  it("watchdog keeps the file while the POST fails and sends it on the next run", () => {
    const w = watchdogBox();
    writeFileSync(w.pending, KEPT);
    const failed = w.run({ failPost: true });
    expect(failed.out).toContain("[WARN] webhook unreachable");
    expect(deployAlarms(w.calls()).length).toBe(0);
    expect(existsSync(w.pending), failed.out).toBe(true);
    expect(readFileSync(w.pending, "utf8")).toBe(KEPT);

    const next = w.run();
    expect(deployAlarms(w.calls()).length, next.out).toBe(1);
    expect(existsSync(w.pending), next.out).toBe(false);
  }, 120_000);

  it("watchdog keeps the file without a webhook and sends it once a webhook is set", () => {
    const w = watchdogBox();
    writeFileSync(w.pending, KEPT);
    const bare = w.run({ webhook: false });
    expect(bare.out.split("\n").some((l) => l.includes("[WARN]") && l.includes("deploy alarm")), bare.out).toBe(true);
    expect(existsSync(w.pending), bare.out).toBe(true);
    expect(readFileSync(w.pending, "utf8")).toBe(KEPT);
    expect(w.calls().length).toBe(0);

    const hooked = w.run();
    expect(deployAlarms(w.calls()).length, hooked.out).toBe(1);
    expect(existsSync(w.pending), hooked.out).toBe(false);
  }, 120_000);
});
