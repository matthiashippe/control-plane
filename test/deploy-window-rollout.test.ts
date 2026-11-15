import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

/**
 * `deploy.yml` calls ops/deploy-window.sh without arguments about 20 s after the container started. Until now that always
 * printed PARTIAL, because the window runs 180 s past the start, and a `BAD GATEWAY` above 0 reached nobody: the step only
 * wrote a warning into the job log. Without `--at` the tool now waits for the end of the window itself and then sends a
 * stranger's 502 through ops/deploy-alarm.sh to the webhook of the VM.
 *
 * Everything runs without network in a temp copy of the scripts. `ssh` on PATH is a fake that answers the SSH_CLIENT probe,
 * `docker inspect`, the access log fetch and `bash -s` (the alarm), and everything else with exit 255. CP_WINDOW_SLEEP is a
 * fake that only writes down how long it was asked to sleep. Addresses come from the documentation ranges only.
 */
const REPO = join(__dirname, "..");
const OWN = "192.0.2.10";
const STRANGER = "198.51.100.23";
const STARTED = "2026-11-01T12:00:00.123456789Z";
const T0 = Date.parse("2026-11-01T12:00:00Z") / 1000;
const COPIES = ["ops/deploy-window.sh", "ops/own-ips.sh", "ops/access-log.sh", "ops/deploy-alarm.sh"];

type Run = { status: number | null; out: string; lines: string[]; root: string };

function row(offset: number, ip: string, method: string, uri: string, status: number): string {
  return JSON.stringify({ ts: T0 + offset, request: { remote_ip: ip, method, uri }, status });
}

function rollout(rows: string[], opts: { now?: string; args?: string[] } = {}): Run {
  const root = mkdtempSync(join(tmpdir(), "deploy-window-rollout-"));
  for (const f of COPIES) {
    if (!existsSync(join(REPO, f))) continue;
    mkdirSync(join(root, f, ".."), { recursive: true });
    copyFileSync(join(REPO, f), join(root, f));
  }
  writeFileSync(join(root, "ops", "own-ips.txt"), `${OWN} 2026-11-01  planted own address\n`);
  writeFileSync(join(root, "planted-access.log.gz"), gzipSync(rows.map((r) => `${r}\n`).join("")));

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
      `  *"bash -s"*) printf '%s\\n' "$*" > ${JSON.stringify(join(root, "alarm-args"))}; cat > ${JSON.stringify(join(root, "alarm-stdin"))} ;;`,
      "  *) exit 255 ;;",
      "esac",
      "",
    ].join("\n"),
  );
  chmodSync(join(root, "bin", "ssh"), 0o755);
  writeFileSync(join(root, "bin", "fake-sleep"), `#!/bin/sh\necho "$1" >> ${JSON.stringify(join(root, "slept"))}\n`);
  chmodSync(join(root, "bin", "fake-sleep"), 0o755);

  const r = spawnSync("bash", [join(root, "ops", "deploy-window.sh"), ...(opts.args ?? [])], {
    cwd: root,
    encoding: "utf8",
    timeout: 60_000,
    env: {
      PATH: `${join(root, "bin")}:/usr/bin:/bin`,
      HOME: root,
      CP_OWN_IPS_SEEN: join(root, "seen.txt"),
      CP_WINDOW_NOW: opts.now ?? "2026-11-01T12:00:20",
      CP_WINDOW_SLEEP: join(root, "bin", "fake-sleep"),
    },
  });
  const out = `${r.stdout}${r.stderr}`;
  return { status: r.status, out, lines: out.split("\n").filter(Boolean), root };
}

function slept(root: string): string[] | null {
  const f = join(root, "slept");
  return existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean) : null;
}

const CLEAN_LOG = [row(5, STRANGER, "GET", "/v1/models", 200)];
const ALARM_LOG = [row(3, STRANGER, "POST", "/v1/chat/completions", 502)];

describe("ops/deploy-window.sh after a rollout waits for the whole window and raises the alarm on a 502", () => {
  it("waits for the end of the window before it reads the log", () => {
    const r = rollout(CLEAN_LOG);
    const s = slept(r.root);
    expect(s, r.out).not.toBeNull();
    expect(s!.length, r.out).toBe(1);
    expect(s![0]).toMatch(/^\d+$/);
    expect(Number(s![0])).toBeGreaterThanOrEqual(160);
    expect(Number(s![0])).toBeLessThanOrEqual(165);
    expect(r.lines.some((l) => l.startsWith("PARTIAL")), r.out).toBe(false);
    expect(r.lines).toContain("window   11:59:00 to 12:03:00 UTC, 60 s before and 180 s after");
    expect(r.lines.some((l) => l.startsWith("CLEAN")), r.out).toBe(true);
    expect(r.status, r.out).toBe(0);
    expect(existsSync(join(r.root, "alarm-args"))).toBe(false);
  });

  it("does not wait when the window is already over", () => {
    const r = rollout(CLEAN_LOG, { now: "2026-11-01T12:05:00" });
    expect(slept(r.root), r.out).toBeNull();
    expect(r.lines.some((l) => l.startsWith("PARTIAL")), r.out).toBe(false);
    expect(r.status, r.out).toBe(0);
  });

  it("sends the alarm when a stranger got a 502", () => {
    const r = rollout(ALARM_LOG);
    expect(r.status, r.out).toBe(1);
    expect(r.lines).toContain("BAD GATEWAY 1 of 1 request(s) from outside answered 502");
    expect(r.lines).toContain("ALARM SENT");
    expect(existsSync(join(r.root, "alarm-args")), r.out).toBe(true);
    expect(readFileSync(join(r.root, "alarm-args"), "utf8")).toContain("bash -s 1 12:00:00");
    expect(readFileSync(join(r.root, "alarm-stdin")).equals(readFileSync(join(REPO, "ops", "deploy-alarm.sh")))).toBe(true);
    expect(r.lines.filter((l) => l.includes(STRANGER))).toEqual([]);
  });

  it("sends no alarm without a 502", () => {
    const r = rollout([row(3, STRANGER, "GET", "/v1/models", 503)]);
    expect(r.status, r.out).toBe(1);
    expect(r.out).toMatch(/^AFFECTED/m);
    expect(existsSync(join(r.root, "alarm-args"))).toBe(false);
    expect(r.lines.some((l) => l.startsWith("ALARM")), r.out).toBe(false);
  });

  it("never waits and never alarms for a past window", () => {
    const r = rollout(ALARM_LOG, { args: ["--at", "2026-11-01T12:00:00"] });
    expect(r.status, r.out).toBe(1);
    expect(r.lines).toContain("BAD GATEWAY 1 of 1 request(s) from outside answered 502");
    expect(slept(r.root), r.out).toBeNull();
    expect(existsSync(join(r.root, "alarm-args"))).toBe(false);
    expect(r.lines.some((l) => l.startsWith("ALARM")), r.out).toBe(false);
  });
});
