import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ops/landing-yield.sh counts who arrived on / from a Conway-Research page on GitHub, and how many
 * of those addresses signed in (POST /v1/auth/verify with 200) within 24 hours. It prints sums only,
 * never an address, because the repo is public.
 *
 * Every case here runs without network: the log is a small planted file passed with --log, and the
 * own address list is a temp file passed with CP_OWN_IPS. The own addresses come from own_ips, which asks
 * ssh for the live address, so a fake ssh that answers nothing is first on PATH and CP_OWN_IPS_SEEN points
 * into the temp dir. Only documentation addresses are used.
 */
const SCRIPT = join(__dirname, "..", "ops", "landing-yield.sh");
// The shared rule and own_ips, copied next to every copy of the script.
const HELPERS = ["conway-arrivals.sh", "conway_arrivals.py", "own-ips.sh"].map((f) => join(__dirname, "..", "ops", f));
const withHelpers = (dir: string) => {
  for (const h of HELPERS) copyFileSync(h, join(dir, h.split("/").at(-1)!));
};
const FIXTURE = join(__dirname, "..", "ops", "fixtures", "landing-yield.log");

// 2026-11-02T00:00:00Z, the start of every planted window below.
const BASE = 1793577600;
const H = 3600;
const SINCE = "2026-11-02T00:00:00Z";
// BASE + 30 h
const UNTIL = "2026-11-03T06:00:00Z";
const UNTIL_TS = BASE + 30 * H;

const DESKTOP = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const ANDROID_TABLET = "Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const ISSUE = "https://github.com/Conway-Research/automaton/issues/1";

type Line = { ts: number; ip: string; uri: string; method?: string; status?: number; referer?: string; ua?: string };

function line(l: Line): string {
  const headers: Record<string, string[]> = { "User-Agent": [l.ua ?? DESKTOP] };
  if (l.referer !== undefined) headers.Referer = [l.referer];
  return JSON.stringify({
    level: "info",
    ts: l.ts,
    logger: "http.log.access.log0",
    status: l.status ?? 200,
    request: { remote_ip: l.ip, client_ip: l.ip, method: l.method ?? "GET", uri: l.uri, headers },
  });
}

const arrive = (ts: number, ip: string, extra: Partial<Line> = {}): Line => ({ ts, ip, uri: "/", referer: ISSUE, ...extra });
const verify = (ts: number, ip: string, status = 200): Line => ({
  ts,
  ip,
  uri: "/v1/auth/verify",
  method: "POST",
  status,
  ua: "node",
});
// A foreign line at the very end of the window, so no planted window is empty by accident.
const tail = (): Line => ({ ts: UNTIL_TS, ip: "198.51.100.200", uri: "/robots.txt" });

type Run = { status: number | null; stdout: string; stderr: string; lines: string[] };

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "landing-yield-"));
  const ownFile = join(root, "own-ips.txt");
  writeFileSync(ownFile, "# own addresses for this test\n203.0.113.99 2026-11-02  planted own address\n");
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, "bin", "ssh"), "#!/bin/sh\nexit 255\n");
  chmodSync(join(root, "bin", "ssh"), 0o755);
  const log = (lines: Line[]) => {
    const p = join(root, `log-${Math.random().toString(36).slice(2)}.log`);
    writeFileSync(p, lines.map(line).join("\n") + "\n");
    return p;
  };
  const run = (args: string[], env: Record<string, string> = {}, script = SCRIPT): Run => {
    const r = spawnSync("bash", [script, ...args], {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
      env: { PATH: `${join(root, "bin")}:/usr/bin:/bin`, HOME: root, CP_OWN_IPS: ownFile, CP_OWN_IPS_SEEN: join(root, "seen.txt"), ...env },
    });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, lines: r.stdout.split("\n").filter(Boolean) };
  };
  const measure = (lines: Line[], env: Record<string, string> = {}) =>
    run(["--since", SINCE, "--until", UNTIL, "--log", log([...lines, tail()])], env);
  return { root, ownFile, log, run, measure };
}

function sums(r: Run) {
  const m = r.lines[0]?.match(
    /^LANDING YIELD (\S+) to (\S+): (\d+) arrived on \/ from github\.com\/Conway-Research, (\d+) signed in within 24 hours, (\d+) still inside 24 hours$/,
  );
  const d = r.lines[1]?.match(/^BY DEVICE: (\d+) phone, (\d+) other$/);
  const w = r.lines[2]?.match(/^WINDOW (\S+) to (\S+): (\d+) log line\(s\), (\d+) foreign address\(es\)$/);
  expect(m, r.stdout + r.stderr).toBeTruthy();
  expect(d, r.stdout + r.stderr).toBeTruthy();
  expect(w, r.stdout + r.stderr).toBeTruthy();
  return {
    since: m![1],
    until: m![2],
    arrived: Number(m![3]),
    signedIn: Number(m![4]),
    open: Number(m![5]),
    phone: Number(d![1]),
    other: Number(d![2]),
    lines: Number(w![3]),
    foreign: Number(w![4]),
  };
}

describe("ops/landing-yield.sh counts arrivals from Conway-Research on / and their sign-in within 24 hours", () => {
  it("counts a sign-in 23 hours after the arrival as signed in", () => {
    const s = sandbox();
    const r = s.measure([arrive(BASE + H, "192.0.2.10"), verify(BASE + 24 * H, "192.0.2.10")]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.lines).toHaveLength(3);
    const n = sums(r);
    expect(n.since).toBe(SINCE);
    expect(n.until).toBe(UNTIL);
    expect(n.arrived).toBe(1);
    expect(n.signedIn).toBe(1);
    expect(n.open).toBe(0);
  });

  it("does not count a sign-in 25 hours after the arrival, and that arrival is no longer open", () => {
    const s = sandbox();
    const n = sums(s.measure([arrive(BASE + 2 * H, "192.0.2.11"), verify(BASE + 27 * H, "192.0.2.11")]));
    expect(n.arrived).toBe(1);
    expect(n.signedIn).toBe(0);
    expect(n.open).toBe(0);
  });

  it("does not count a sign-in that answered 500, nor one after --until, nor one before the arrival", () => {
    const s = sandbox();
    const n = sums(
      s.measure([
        verify(BASE + H, "192.0.2.14"),
        arrive(BASE + 3 * H, "192.0.2.12"),
        verify(BASE + 4 * H, "192.0.2.12", 500),
        arrive(BASE + 2 * H, "192.0.2.14"),
        arrive(BASE + 20 * H, "192.0.2.15"),
        verify(UNTIL_TS + 60, "192.0.2.15"),
      ]),
    );
    expect(n.arrived).toBe(3);
    expect(n.signedIn).toBe(0);
  });

  it("treats a Conway referrer on /fix, a Conway-Research-fake referrer and another referrer as no arrival", () => {
    const s = sandbox();
    const n = sums(
      s.measure([
        { ts: BASE + 3 * H, ip: "198.51.100.20", uri: "/fix", referer: ISSUE },
        verify(BASE + 4 * H, "198.51.100.20"),
        arrive(BASE + 4 * H, "198.51.100.21", { referer: "https://github.com/Conway-Research-fake/" }),
        arrive(BASE + 5 * H, "198.51.100.22", { referer: "https://www.google.com/" }),
        arrive(BASE + 5 * H, "198.51.100.24", { referer: "https://github.com/Conway-Researcher" }),
        arrive(BASE + 6 * H, "198.51.100.25", { uri: "/fix?from=/", referer: ISSUE }),
      ]),
    );
    expect(n.arrived).toBe(0);
    expect(n.signedIn).toBe(0);
    // The control: the bare organisation URL and a query string on / are arrivals.
    const c = sums(
      s.measure([
        arrive(BASE + 4 * H, "198.51.100.21", { referer: "https://github.com/Conway-Research" }),
        arrive(BASE + 5 * H, "198.51.100.22", { uri: "/?ref=gh" }),
      ]),
    );
    expect(c.arrived).toBe(2);
  });

  it("excludes an own address with the referrer and a sign-in, and counts it once the list does not name it", () => {
    const s = sandbox();
    const planted = [arrive(BASE + 2 * H, "203.0.113.99"), verify(BASE + 3 * H, "203.0.113.99")];
    const own = sums(s.measure(planted));
    expect(own.arrived).toBe(0);
    expect(own.signedIn).toBe(0);
    expect(own.foreign).toBe(1);
    // An empty list stops the tool, so the other direction names one address that is not in the log.
    const other = join(s.root, "other-own.txt");
    writeFileSync(other, "192.0.2.254 2026-11-02  not in the log\n");
    const foreign = sums(s.measure(planted, { CP_OWN_IPS: other }));
    expect(foreign.arrived).toBe(1);
    expect(foreign.signedIn).toBe(1);
    expect(foreign.foreign).toBe(2);
  });

  it("counts an arrival one hour before --until without a sign-in as still open", () => {
    const s = sandbox();
    const n = sums(s.measure([arrive(UNTIL_TS - H, "192.0.2.13"), arrive(BASE + 5 * H, "192.0.2.16")]));
    expect(n.arrived).toBe(2);
    expect(n.signedIn).toBe(0);
    expect(n.open).toBe(1);
  });

  it("counts an iPhone with Mobile as a phone and an Android without Mobile as other", () => {
    const s = sandbox();
    const n = sums(
      s.measure([
        arrive(BASE + H, "192.0.2.10", { ua: IPHONE }),
        arrive(BASE + 2 * H, "192.0.2.11", { ua: ANDROID_TABLET }),
        arrive(BASE + 3 * H, "192.0.2.12"),
      ]),
    );
    expect(n.arrived).toBe(3);
    expect(n.phone).toBe(1);
    expect(n.other).toBe(2);
  });

  it("counts an address once, takes its first arrival, and ignores an arrival before --since", () => {
    const s = sandbox();
    const r = s.measure([
      arrive(BASE - H, "203.0.113.50"),
      arrive(BASE + H, "192.0.2.10", { ua: IPHONE }),
      arrive(BASE + H + 5, "192.0.2.10"),
      verify(BASE + 24 * H + 1, "192.0.2.10"),
    ]);
    const n = sums(r);
    expect(n.arrived).toBe(1);
    // 23 h after the first arrival, so the second GET / does not move the deadline.
    expect(n.signedIn).toBe(1);
    expect(n.phone).toBe(1);
    expect(n.lines).toBe(4);
    expect(n.foreign).toBe(2);
    // Sums only: no address may leave this tool.
    expect(r.stdout + r.stderr).not.toMatch(/\b(192\.0\.2|198\.51\.100|203\.0\.113)\.\d+/);
  });

  it("exits 2 on an empty window and says it is blind, not quiet", () => {
    const s = sandbox();
    const r = s.run(["--since", "2026-10-01T00:00:00Z", "--until", "2026-10-02T00:00:00Z", "--log", s.log([arrive(BASE, "192.0.2.10")])]);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr).toMatch(/blind/i);
  });

  it("exits 2 when the log or the own list cannot be read, or --until lies before --since", () => {
    const s = sandbox();
    const log = s.log([arrive(BASE + H, "192.0.2.10"), tail()]);
    expect(s.run(["--since", SINCE, "--until", UNTIL, "--log", join(s.root, "missing.log")]).status).toBe(2);
    expect(s.run(["--since", SINCE, "--until", UNTIL, "--log", log], { CP_OWN_IPS: join(s.root, "missing.txt") }).status).toBe(2);
    expect(s.run(["--since", UNTIL, "--until", SINCE, "--log", log]).status).toBe(2);
  });

  it("exits 1 on an unknown flag, an unparsable date, a missing value or a missing --since", () => {
    const s = sandbox();
    const log = s.log([arrive(BASE + H, "192.0.2.10"), tail()]);
    expect(s.run(["--since", SINCE, "--until", UNTIL, "--log", log, "--verbose"]).status).toBe(1);
    expect(s.run(["--since", "yesterday", "--until", UNTIL, "--log", log]).status).toBe(1);
    expect(s.run(["--since", SINCE, "--until", "2026-13-40T00:00:00Z", "--log", log]).status).toBe(1);
    expect(s.run(["--since"]).status).toBe(1);
    expect(s.run(["--until", UNTIL, "--log", log]).status).toBe(1);
  });

  it("uses the run time rounded down to the second when --until is missing", () => {
    const s = sandbox();
    const now = Math.floor(Date.now() / 1000);
    const log = s.log([arrive(now - 2 * H, "192.0.2.10"), { ts: now - 60, ip: "192.0.2.10", uri: "/v1/status" }]);
    const since = new Date((now - 3 * H) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
    const r = s.run(["--since", since, "--log", log]);
    expect(r.status, r.stderr).toBe(0);
    const n = sums(r);
    expect(n.since).toBe(since);
    expect(n.until).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    const until = Date.parse(n.until) / 1000;
    expect(until).toBeGreaterThanOrEqual(now);
    expect(until).toBeLessThanOrEqual(now + 60);
    expect(n.arrived).toBe(1);
    expect(n.open).toBe(1);
  });

  it("reads the log through ops/access-log.sh without --log, and exits 2 when that cannot read it", () => {
    const s = sandbox();
    const dir = join(s.root, "ops");
    mkdirSync(dir);
    const copy = join(dir, "landing-yield.sh");
    copyFileSync(SCRIPT, copy);
    withHelpers(dir);
    const reader = join(dir, "access-log.sh");
    writeFileSync(reader, 'echo "access-log: could not read the log." >&2\nexit 2\n');
    expect(s.run(["--since", SINCE, "--until", UNTIL], {}, copy).status).toBe(2);
    const planted = s.log([arrive(BASE + H, "192.0.2.10"), verify(BASE + 2 * H, "192.0.2.10"), tail()]);
    writeFileSync(reader, `cat '${planted}'\n`);
    const r = s.run(["--since", SINCE, "--until", UNTIL], {}, copy);
    expect(r.status, r.stderr).toBe(0);
    const n = sums(r);
    expect(n.arrived).toBe(1);
    expect(n.signedIn).toBe(1);
  });

  it("passes its selftest against the fixture, which holds only documentation addresses", () => {
    const s = sandbox();
    const r = s.run(["--selftest"]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.lines.at(-1)).toBe("SELFTEST OK");
    expect(r.lines.some((l) => l.startsWith("SELFTEST FAILED"))).toBe(false);
    const addresses = readFileSync(FIXTURE, "utf8").match(/"(remote_ip|client_ip)": *"[^"]*"/g) ?? [];
    expect(addresses.length).toBeGreaterThan(0);
    for (const a of addresses) expect(a).toMatch(/"(192\.0\.2|198\.51\.100|203\.0\.113)\.\d{1,3}"$/);
  }, 120_000);

  it("fails its selftest when the 24 hour deadline is taken out of a copy of the script", () => {
    const s = sandbox();
    const dir = join(s.root, "ops");
    mkdirSync(join(dir, "fixtures"), { recursive: true });
    copyFileSync(FIXTURE, join(dir, "fixtures", "landing-yield.log"));
    const copy = join(dir, "landing-yield.sh");
    withHelpers(dir);
    const text = readFileSync(SCRIPT, "utf8");
    const marker = "DEADLINE = 24 * 3600";
    expect(text).toContain(marker);
    writeFileSync(copy, text.replace(marker, "DEADLINE = 48 * 3600"));
    const r = s.run(["--selftest"], {}, copy);
    expect(r.status, r.stdout + r.stderr).toBe(1);
    expect(r.lines.at(-1)).toMatch(/^SELFTEST FAILED: /);
  }, 120_000);
});
