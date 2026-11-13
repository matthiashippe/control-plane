import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * `own_ips` in ops/own-ips.sh learns the address this machine goes out through from the live ssh connection. Until
 * betrieb 03 every such call appended a newly seen address to ops/own-ips.txt, a tracked file, so any check with network
 * left the repository dirty and `check` red. Now it writes only with CP_OWN_IPS_WRITE=1, still counts the address for the
 * current run, and says on stderr how to keep it.
 *
 * Everything runs without network: `ssh` on PATH is a fake that answers the SSH_CLIENT probe with 192.0.2.77, the access
 * log fetch from ops/access-log.sh with planted lines, and everything else with exit 255. Addresses come from the
 * documentation ranges only. The real ops/own-ips.txt is only ever copied, never written, and every run has HOME in a temp
 * dir, so the default seen file under ~/.local/state is never the real one either.
 */
const OPS = join(__dirname, "..", "ops");
const LIVE = "192.0.2.77";
const LATER = "192.0.2.78";
const STRANGER = "198.51.100.23";
const AT = "2026-11-01T12:00:00";
const T0 = Date.parse(`${AT}Z`) / 1000;

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function logLine(offset: number, ip: string, method: string, uri: string, status: number): string {
  return JSON.stringify({ ts: T0 + offset, request: { remote_ip: ip, method, uri }, status });
}

/** A temp dir with a fake ssh in bin/ and, optionally, a planted access log it serves. */
function sandbox(accessLog: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), "own-ips-write-"));
  mkdirSync(join(root, "bin"));
  const planted = join(root, "planted-access.log");
  writeFileSync(planted, accessLog.map((r) => `${r}\n`).join(""));
  writeFileSync(
    join(root, "bin", "ssh"),
    [
      "#!/bin/sh",
      'for last in "$@"; do :; done',
      'case "$last" in',
      `  *SSH_CLIENT*) echo "\${FAKE_LIVE:-${LIVE}} 40000 22" ;;`,
      `  *"docker exec deploy-caddy-1"*) gzip -c < ${JSON.stringify(planted)} ;;`,
      "  *) exit 255 ;;",
      "esac",
      "",
    ].join("\n"),
  );
  chmodSync(join(root, "bin", "ssh"), 0o755);
  const env = (extra: Record<string, string> = {}) => ({
    PATH: `${join(root, "bin")}:/usr/bin:/bin`,
    HOME: root,
    ...extra,
  });
  return { root, env };
}

/** A copy of the real list that does not name the live address. */
function listWithoutLive(root: string): string {
  const list = join(root, "own-ips.txt");
  const kept = readFileSync(join(OPS, "own-ips.txt"), "utf8")
    .split("\n")
    .filter((l) => !l.startsWith(`${LIVE} `))
    .join("\n");
  writeFileSync(list, kept);
  return list;
}

function ownIps(root: string, env: NodeJS.ProcessEnv) {
  const r = spawnSync("bash", ["-c", `source ${JSON.stringify(join(OPS, "own-ips.sh"))}; own_ips`], {
    cwd: root,
    encoding: "utf8",
    timeout: 60_000,
    env,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("own_ips writes to the list only with CP_OWN_IPS_WRITE=1", () => {
  it("leaves the list byte-identical without the variable, still counts the live address and says how to keep it", () => {
    const { root, env } = sandbox();
    const list = listWithoutLive(root);
    const before = sha256(list);
    const r = ownIps(root, env({ CP_OWN_IPS_FILE: list }));
    expect(r.status, r.stderr).toBe(0);
    expect(sha256(list)).toBe(before);
    expect(r.stdout.split(" ")).toContain(LIVE);
    expect(r.stderr).toContain("CP_OWN_IPS_WRITE=1");
  });

  it("does not write with any value other than 1", () => {
    const { root, env } = sandbox();
    const list = listWithoutLive(root);
    const before = sha256(list);
    const r = ownIps(root, env({ CP_OWN_IPS_FILE: list, CP_OWN_IPS_WRITE: "yes" }));
    expect(r.status, r.stderr).toBe(0);
    expect(sha256(list)).toBe(before);
    expect(r.stdout.split(" ")).toContain(LIVE);
  });

  it("appends exactly one line for the live address with CP_OWN_IPS_WRITE=1", () => {
    const { root, env } = sandbox();
    const list = listWithoutLive(root);
    const before = readFileSync(list, "utf8").split("\n").filter(Boolean);
    const r = ownIps(root, env({ CP_OWN_IPS_FILE: list, CP_OWN_IPS_WRITE: "1" }));
    expect(r.status, r.stderr).toBe(0);
    const after = readFileSync(list, "utf8").split("\n").filter(Boolean);
    expect(after.length).toBe(before.length + 1);
    const added = after.filter((l) => !before.includes(l));
    expect(added).toHaveLength(1);
    expect(added[0].startsWith(`${LIVE} `)).toBe(true);
    expect(added[0].endsWith("this machine, seen live")).toBe(true);
    expect(r.stdout.split(" ")).toContain(LIVE);
  });

  it("leaves the list byte-identical with CP_OWN_IPS_WRITE=1 when the address is already listed", () => {
    const { root, env } = sandbox();
    const list = join(root, "own-ips.txt");
    writeFileSync(list, `# planted\n${LIVE} 2026-11-01  this machine, seen live\n`);
    const before = sha256(list);
    const r = ownIps(root, env({ CP_OWN_IPS_FILE: list, CP_OWN_IPS_WRITE: "1" }));
    expect(r.status, r.stderr).toBe(0);
    expect(sha256(list)).toBe(before);
    expect(r.stdout.split(" ")).toContain(LIVE);
  });

  it("keeps CP_OWN_IPS and the live address apart from the first listed address", () => {
    const { root, env } = sandbox();
    const list = join(root, "own-ips.txt");
    writeFileSync(list, "# planted\n198.51.100.40 2026-11-01  planted own address\n");
    const r = ownIps(root, env({ CP_OWN_IPS_FILE: list, CP_OWN_IPS: "203.0.113.5" }));
    expect(r.status, r.stderr).toBe(0);
    const out = r.stdout.split(" ");
    expect(out).toContain("203.0.113.5");
    expect(out).toContain("198.51.100.40");
    expect(out).toContain(LIVE);
  });

  it("still returns 1 when the list is missing", () => {
    const { root, env } = sandbox();
    const r = ownIps(root, env({ CP_OWN_IPS_FILE: join(root, "absent.txt") }));
    expect(r.status).toBe(1);
  });
});

describe("own_ips remembers live addresses outside the checkout", () => {
  it("counts an address seen in an earlier run as ours in a later one, without touching the list", () => {
    const { root, env } = sandbox();
    const list = listWithoutLive(root);
    const before = sha256(list);
    const seen = join(mkdtempSync(join(tmpdir(), "own-ips-seen-")), "state", "own-ips-seen.txt");
    const first = ownIps(root, env({ CP_OWN_IPS_FILE: list, CP_OWN_IPS_SEEN: seen }));
    expect(first.status, first.stderr).toBe(0);
    const second = ownIps(root, env({ CP_OWN_IPS_FILE: list, CP_OWN_IPS_SEEN: seen, FAKE_LIVE: LATER }));
    expect(second.status, second.stderr).toBe(0);
    const out = second.stdout.split(" ");
    expect(out).toContain(LATER);
    expect(out).toContain(LIVE);
    expect(sha256(list)).toBe(before);
    const lines = readFileSync(seen, "utf8").split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(new RegExp(`^${LIVE.replace(/\./g, "\\.")} \\d{4}-\\d{2}-\\d{2}$`));
  });

  it("does not add a second line for an address it already remembers", () => {
    const { root, env } = sandbox();
    const list = listWithoutLive(root);
    const seen = join(root, "seen.txt");
    ownIps(root, env({ CP_OWN_IPS_FILE: list, CP_OWN_IPS_SEEN: seen }));
    const after = sha256(seen);
    const r = ownIps(root, env({ CP_OWN_IPS_FILE: list, CP_OWN_IPS_SEEN: seen }));
    expect(r.status, r.stderr).toBe(0);
    expect(sha256(seen)).toBe(after);
  });

  it("uses XDG_STATE_HOME for the default seen file", () => {
    const { root, env } = sandbox();
    const list = listWithoutLive(root);
    const state = mkdtempSync(join(tmpdir(), "own-ips-xdg-"));
    const r = ownIps(root, env({ CP_OWN_IPS_FILE: list, XDG_STATE_HOME: state }));
    expect(r.status, r.stderr).toBe(0);
    const seen = join(state, "control-plane", "own-ips-seen.txt");
    expect(readFileSync(seen, "utf8").startsWith(`${LIVE} `)).toBe(true);
  });

  it("still answers when the seen file cannot be written", () => {
    const { root, env } = sandbox();
    const list = listWithoutLive(root);
    const blocker = join(root, "not-a-dir");
    writeFileSync(blocker, "");
    const r = ownIps(root, env({ CP_OWN_IPS_FILE: list, CP_OWN_IPS_SEEN: join(blocker, "seen.txt") }));
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.split(" ")).toContain(LIVE);
  });
});

describe("ops/deploy-window.sh --at with a fake ssh leaves the list next to the script unchanged", () => {
  it("counts the live address as ours and names no stranger", () => {
    const { root, env } = sandbox([
      logLine(5, LIVE, "GET", "/health", 502),
      logLine(10, STRANGER, "GET", "/v1/credits/balance", 200),
    ]);
    const ops = join(root, "ops");
    mkdirSync(ops);
    for (const f of ["deploy-window.sh", "own-ips.sh", "access-log.sh"]) {
      copyFileSync(join(OPS, f), join(ops, f));
      chmodSync(join(ops, f), 0o755);
    }
    const list = join(ops, "own-ips.txt");
    writeFileSync(list, readFileSync(listWithoutLive(root)));
    const before = sha256(list);
    // No CP_OWN_IPS_FILE, so the default path next to the script is the one in play.
    const r = spawnSync("bash", [join(ops, "deploy-window.sh"), "--at", AT], {
      cwd: root,
      encoding: "utf8",
      timeout: 120_000,
      env: env({ CP_WINDOW_NOW: "" }),
    });
    const out = `${r.stdout}${r.stderr}`;
    expect(sha256(list), out).toBe(before);
    expect(r.stdout).toMatch(/^ours {5}1 request\(s\)/m);
    expect(r.stdout.split("\n")).toContain("BAD GATEWAY 0 of 1 request(s) from outside answered 502");
    expect(out.split("\n").some((l) => l.includes(STRANGER))).toBe(false);
    expect(r.status, out).toBe(0);
  });
});
