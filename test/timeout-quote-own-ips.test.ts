import "./yield-between-tests";
import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ops/timeout-quote.sh tells our own calls from foreign ones by `own_ips` from ops/own-ips.sh: the list file
 * (CP_OWN_IPS_FILE), the address this machine is seen with live, every address in CP_OWN_IPS_SEEN and in CP_OWN_IPS.
 * A list without an address or without a file stops the tool with exit 2 before any table line, and only the ways that
 * need the origin (production and --join) ever reach `ssh`.
 *
 * No network, no fixed port, documentation addresses only. A fake `ssh` first on PATH appends every call to
 * <tmp>/ssh-calls and answers the SSH_CLIENT probe with FAKE_LIVE when it is set, else exits 255.
 */
const SCRIPT = join(__dirname, "..", "ops", "timeout-quote.sh");
const PLANTED = ["203.0.113.99", "198.51.100.23", "192.0.2.50"];
const OWN = "203.0.113.99 2026-11-01  planted own address\n";
// 2026-11-10T01:00:00Z
const T = 1794268800 + 3600;

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

// The same form as `line` in the selftest of ops/timeout-quote.sh.
const line = (ts: number, ip: string) =>
  JSON.stringify({
    level: "info",
    ts,
    logger: "http.log.access.log0",
    request: { client_ip: ip, remote_ip: ip, method: "POST", uri: "/v1/chat/completions" },
    duration: 2.0,
    status: 200,
  });

type Run = { status: number | null; stdout: string; stderr: string };

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function sandbox(own = OWN) {
  const root = mkdtempSync(join(tmpdir(), "timeout-quote-own-ips-"));
  roots.push(root);
  writeFileSync(join(root, "own.txt"), own);
  writeFileSync(join(root, "rows.jsonl"), "");
  writeFileSync(join(root, "caddy.jsonl"), [line(T, "198.51.100.23"), line(T + 60, "192.0.2.50")].join("\n") + "\n");
  mkdirSync(join(root, "bin"));
  writeFileSync(
    join(root, "bin", "ssh"),
    [
      "#!/bin/sh",
      `echo "$*" >> ${JSON.stringify(join(root, "ssh-calls"))}`,
      'for last in "$@"; do :; done',
      'case "$last" in',
      '  *SSH_CLIENT*) if [ -n "$FAKE_LIVE" ]; then echo "$FAKE_LIVE 40000 22"; exit 0; fi; exit 255 ;;',
      "  *) exit 255 ;;",
      "esac",
      "",
    ].join("\n"),
  );
  chmodSync(join(root, "bin", "ssh"), 0o755);
  const before = sha256(join(root, "own.txt"));

  const run = (args: string[], env: Record<string, string> = {}): Run => {
    const r = spawnSync("bash", [SCRIPT, ...args], {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
      env: {
        PATH: `${join(root, "bin")}:/usr/bin:/bin`,
        HOME: root,
        CP_OWN_IPS_FILE: join(root, "own.txt"),
        CP_OWN_IPS_SEEN: join(root, "seen.txt"),
        ...env,
      },
    });
    // Counts only: no line of stdout or stderr may name an address, whichever list it came from.
    for (const l of `${r.stdout}\n${r.stderr}`.split("\n")) for (const ip of PLANTED) expect(l).not.toContain(ip);
    expect(sha256(join(root, "own.txt"))).toBe(before);
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  };
  const join2 = (env: Record<string, string> = {}) => run(["--join", join(root, "caddy.jsonl"), join(root, "rows.jsonl")], env);
  const seen = (body: string) => writeFileSync(join(root, "seen.txt"), body);
  const sshCalls = () => (existsSync(join(root, "ssh-calls")) ? readFileSync(join(root, "ssh-calls"), "utf8") : "");
  return { root, run, join2, seen, sshCalls };
}

const row = (origin: string, n: number) => `| unattributed | all | ${origin} | ${n} | 0 | 0.0 % |`;

describe("ops/timeout-quote.sh takes our own addresses from own_ips", () => {
  it("an address only in CP_OWN_IPS_SEEN counts as own", () => {
    const s = sandbox();
    s.seen("198.51.100.23 2026-11-01\n");
    const r = s.join2();
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain(row("own", 1));
    expect(r.stdout).toContain(row("foreign", 1));

    // The other direction in the same case: without the seen file both calls are foreign.
    rmSync(join(s.root, "seen.txt"));
    const without = s.join2();
    expect(without.status, without.stdout + without.stderr).toBe(0);
    expect(without.stdout).toContain(row("foreign", 2));
    expect(without.stdout).not.toContain("| own |");
  });

  it("the live address counts as own", () => {
    const s = sandbox();
    const r = s.join2({ FAKE_LIVE: "198.51.100.23" });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain(row("own", 1));
    expect(r.stdout).toContain(row("foreign", 1));
  });

  it("an address in CP_OWN_IPS counts as own", () => {
    const s = sandbox();
    const r = s.join2({ CP_OWN_IPS: "192.0.2.50" });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain(row("own", 1));
    expect(r.stdout).toContain(row("foreign", 1));
  });

  it("an address in the list file counts as own", () => {
    const s = sandbox(OWN + "198.51.100.23 2026-11-01\n");
    const r = s.join2();
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain(row("own", 1));
    expect(r.stdout).toContain(row("foreign", 1));
  });

  it("stops with exit 2 when the own list names no address even with a live address and a seen address", () => {
    const s = sandbox("# no own address\n");
    s.seen("192.0.2.50 2026-11-01\n");
    const r = s.join2({ FAKE_LIVE: "198.51.100.23" });
    expect(r.status, r.stdout + r.stderr).toBe(2);
    expect(r.stdout.split("\n").some((l) => l.startsWith("|"))).toBe(false);
    expect(r.stderr).toContain("own_ips");
  });

  it("stops with exit 2 when the own list is missing", () => {
    const s = sandbox();
    const r = s.join2({ CP_OWN_IPS_FILE: join(s.root, "missing.txt") });
    expect(r.status, r.stdout + r.stderr).toBe(2);
    expect(r.stdout.split("\n").some((l) => l.startsWith("|"))).toBe(false);
    expect(r.stderr).toContain("own_ips");
  });

  it("rows, compare-files and selftest never call ssh", () => {
    const s = sandbox();
    const rows = s.run(["--rows", join(s.root, "rows.jsonl")], { FAKE_LIVE: "198.51.100.23" });
    expect(rows.status, rows.stdout + rows.stderr).toBe(0);
    const cmp = s.run(["--compare-files", join(s.root, "caddy.jsonl"), join(s.root, "rows.jsonl")], {
      FAKE_LIVE: "198.51.100.23",
      TQ_SINCE: "2026-11-10T00:00:00Z",
      TQ_UNTIL: "2026-11-11T00:00:00Z",
    });
    expect(cmp.status, cmp.stdout + cmp.stderr).toBe(0);
    const self = s.run(["--selftest"], { FAKE_LIVE: "198.51.100.23" });
    expect(self.status, self.stdout + self.stderr).toBe(0);
    expect(self.stdout.trim().split("\n").at(-1)).toBe("TIMEOUT QUOTE SELFTEST OK");
    expect(s.sshCalls()).toBe("");
    // Proof that the fake is on the path the counter takes: --join reaches it.
    s.join2();
    expect(s.sshCalls()).not.toBe("");
  });
});
