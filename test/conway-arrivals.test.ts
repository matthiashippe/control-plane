import "./yield-between-tests";
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ops/landing-yield.sh and ops/github-yield.sh count the same arrival: a request from a Conway-Research page on
 * GitHub, later followed by `POST /v1/auth/verify` with 200. The rule for that arrival and for our own addresses lives
 * once in ops/conway-arrivals.sh and ops/conway_arrivals.py, and the own addresses come from `own_ips` in
 * ops/own-ips.sh: the list, the address this machine is seen with live, and every address in CP_OWN_IPS_SEEN.
 *
 * Every case runs both tools in a temp copy of the scripts, with a planted log passed by --log and a fake `ssh` first
 * on PATH that answers the SSH_CLIENT probe with FAKE_LIVE when it is set and exits 255 otherwise. No network, no
 * fixed port, documentation addresses only, and HOME and CP_OWN_IPS_SEEN point into the temp dir.
 */
const REPO = join(__dirname, "..");
const COPIES = [
  "ops/landing-yield.sh",
  "ops/github-yield.sh",
  "ops/conway-arrivals.sh",
  "ops/conway_arrivals.py",
  "ops/own-ips.sh",
  "ops/access-log.sh",
];
const PLANTED = ["203.0.113.99", "198.51.100.23", "192.0.2.50", "198.51.100.200"];
const OWN = "203.0.113.99 2026-11-01  planted own address\n";
const SEEN_ONLY = "198.51.100.23";
const STRANGER = "192.0.2.50";
// 2026-11-02T00:00:00Z
const BASE = 1793577600;
const H = 3600;
const ISSUE = "https://github.com/Conway-Research/automaton/issues/1";

type Line = { ts: number; ip: string; uri: string; method?: string; status?: number; referer?: string };

function line(l: Line): string {
  const headers: Record<string, string[]> = { "User-Agent": ["Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0"] };
  if (l.referer !== undefined) headers.Referer = [l.referer];
  return JSON.stringify({
    level: "info",
    ts: l.ts,
    logger: "http.log.access.log0",
    status: l.status ?? 200,
    request: { remote_ip: l.ip, client_ip: l.ip, method: l.method ?? "GET", uri: l.uri, headers },
  });
}

const arrive = (ts: number, ip: string, referer = ISSUE): Line => ({ ts, ip, uri: "/", referer });
const verify = (ts: number, ip: string): Line => ({ ts, ip, uri: "/v1/auth/verify", method: "POST", status: 200 });
// A foreign line late in the window, so no planted window is empty by accident.
const tail = (): Line => ({ ts: BASE + 20 * H, ip: "198.51.100.200", uri: "/robots.txt" });

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

type Run = { status: number | null; stdout: string; stderr: string };

function sandbox(lines: Line[], own = OWN) {
  const root = mkdtempSync(join(tmpdir(), "conway-arrivals-"));
  for (const f of COPIES) {
    if (!existsSync(join(REPO, f))) continue;
    mkdirSync(join(root, f, ".."), { recursive: true });
    copyFileSync(join(REPO, f), join(root, f));
  }
  writeFileSync(join(root, "own.txt"), own);
  writeFileSync(join(root, "access.log"), [...lines, tail()].map(line).join("\n") + "\n");
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

  const run = (tool: "landing" | "github", env: Record<string, string> = {}): Run => {
    const args =
      tool === "landing"
        ? ["ops/landing-yield.sh", "--since", "2026-11-02T00:00:00Z", "--until", "2026-11-03T00:00:00Z", "--log", join(root, "access.log")]
        : ["ops/github-yield.sh", "--since", "2026-11-02T00:00:00Z", "--log", join(root, "access.log")];
    const r = spawnSync("bash", [join(root, args[0]), ...args.slice(1)], {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
      env: {
        PATH: `${join(root, "bin")}:/usr/bin:/bin`,
        HOME: root,
        CP_OWN_IPS: join(root, "own.txt"),
        CP_OWN_IPS_SEEN: join(root, "seen.txt"),
        ...env,
      },
    });
    // Sums only: no stdout line may name an address, whichever list it came from.
    for (const l of r.stdout.split("\n")) for (const ip of PLANTED) expect(l).not.toContain(ip);
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  };
  const unchanged = () => expect(sha256(join(root, "own.txt"))).toBe(before);
  return { root, run, unchanged };
}

const landingArrived = (r: Run) => {
  const m = r.stdout.match(/: (\d+) arrived on \/ from github\.com\/Conway-Research, (\d+) signed in within 24 hours,/);
  expect(m, r.stdout + r.stderr).toBeTruthy();
  return { arrived: Number(m![1]), signedIn: Number(m![2]) };
};
const githubArrived = (r: Run) => {
  const m = r.stdout.match(/^GITHUB YIELD since \S+: (\d+) arrived from github\.com\/Conway-Research, (\d+) signed in, \d+ paid$/m);
  expect(m, r.stdout + r.stderr).toBeTruthy();
  return { arrived: Number(m![1]), signedIn: Number(m![2]) };
};

const bothSignIn = [arrive(BASE + H, SEEN_ONLY), verify(BASE + 2 * H, SEEN_ONLY), arrive(BASE + 3 * H, STRANGER), verify(BASE + 4 * H, STRANGER)];

describe("ops/conway-arrivals.sh and ops/conway_arrivals.py hold one rule for both yield tools", () => {
  it("both tools stop with exit 2 when the own list is empty", () => {
    const s = sandbox(bothSignIn, "# no own address\n");
    for (const tool of ["landing", "github"] as const) {
      const r = s.run(tool);
      expect(r.status, r.stdout + r.stderr).toBe(2);
      expect(r.stdout.split("\n").some((l) => l.startsWith("LANDING YIELD") || l.startsWith("GITHUB YIELD"))).toBe(false);
      expect(r.stderr).toContain("own_ips");
    }
    s.unchanged();
  });

  it("both tools stop with exit 2 when the own list is missing", () => {
    const s = sandbox(bothSignIn);
    for (const tool of ["landing", "github"] as const) {
      const r = s.run(tool, { CP_OWN_IPS: join(s.root, "missing.txt") });
      expect(r.status, r.stdout + r.stderr).toBe(2);
      expect(r.stdout).not.toMatch(/arrived/);
      expect(r.stderr).toContain("own_ips");
    }
    s.unchanged();
  });

  it("an address only in CP_OWN_IPS_SEEN is not foreign in either tool", () => {
    const s = sandbox(bothSignIn);
    writeFileSync(join(s.root, "seen.txt"), `${SEEN_ONLY} 2026-11-01\n`);
    const landing = s.run("landing");
    expect(landing.status, landing.stderr).toBe(0);
    expect(landingArrived(landing)).toEqual({ arrived: 1, signedIn: 1 });
    const github = s.run("github");
    expect(github.status, github.stderr).toBe(0);
    expect(githubArrived(github)).toEqual({ arrived: 1, signedIn: 1 });
    // The other direction in the same log: without the remembered address both count it.
    rmSync(join(s.root, "seen.txt"));
    expect(landingArrived(s.run("landing")).arrived).toBe(2);
    expect(githubArrived(s.run("github")).arrived).toBe(2);
    s.unchanged();
  });

  it("the live address is not foreign in either tool", () => {
    const s = sandbox(bothSignIn);
    for (const tool of ["landing", "github"] as const) {
      // own_ips remembers the live address in CP_OWN_IPS_SEEN; drop it so each tool proves the live path alone.
      rmSync(join(s.root, "seen.txt"), { force: true });
      const r = s.run(tool, { FAKE_LIVE: SEEN_ONLY });
      expect(r.status, r.stderr).toBe(0);
      expect((tool === "landing" ? landingArrived(r) : githubArrived(r)).arrived).toBe(1);
    }
    expect(readFileSync(join(s.root, "ssh-calls"), "utf8")).toContain("SSH_CLIENT");
    s.unchanged();
  });

  it("landing-yield counts a lowercase conway-research referrer like github-yield does", () => {
    const s = sandbox([arrive(BASE + H, STRANGER, "https://github.com/conway-research/automaton/issues/1"), verify(BASE + 2 * H, STRANGER)]);
    const landing = s.run("landing");
    expect(landing.status, landing.stderr).toBe(0);
    expect(landingArrived(landing).arrived).toBe(1);
    const github = s.run("github");
    expect(github.status, github.stderr).toBe(0);
    expect(githubArrived(github).arrived).toBe(1);
    s.unchanged();
  });
});
