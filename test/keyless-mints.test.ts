import "./yield-between-tests";
import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ops/keyless-mints.sh counts `POST /v1/auth/keyless` per day, kind of caller and status, without our own addresses,
 * and prints only sums. It is how the crawler that emptied the keyless door from 2026-11-11 on was counted, and how the
 * fix is checked against the same numbers.
 *
 * Everything runs without network: `ssh` on PATH is a fake that logs every call and answers the SSH_CLIENT probe with
 * FAKE_LIVE when that is set, else exits 255. Addresses come from the documentation ranges only, HOME and
 * CP_OWN_IPS_SEEN point into a temp dir, and the list of own addresses is a temp file, so neither the real list nor the
 * real state directory is touched.
 */
const REPO = join(__dirname, "..");
const SCRIPT = join(REPO, "ops", "keyless-mints.sh");
const CRAWLER_UA = "ExampleCrawler/1.0 (+https://crawler.example/about)";
const OWN_LISTED = "203.0.113.99";
const LIVE = "192.0.2.77";
const SEEN = "198.51.100.23";
const PLANTED_ADDRESSES = [
  "198.51.100.10",
  "198.51.100.11",
  "198.51.100.12",
  "192.0.2.50",
  "192.0.2.51",
  "192.0.2.52",
  "192.0.2.53",
  "192.0.2.54",
  "192.0.2.55",
  OWN_LISTED,
  LIVE,
  SEEN,
];
const PLANTED_AGENTS = [CRAWLER_UA, "node/22.11.0", "python-requests/2.31"];
const DAY_11 = Date.parse("2026-11-11T12:00:00Z") / 1000;
const DAY_12 = Date.parse("2026-11-12T12:00:00Z") / 1000;

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function line(ts: number, ip: string, method: string, uri: string, status: number, ua: string): string {
  return JSON.stringify({ ts, request: { client_ip: ip, method, uri, headers: { "User-Agent": [ua] } }, status });
}

/** A temp dir with the planted log lines, the own list and a fake ssh. */
function sandbox(logLines: string[], ownList = `${OWN_LISTED} 2026-11-01  planted own address\n`) {
  const root = mkdtempSync(join(tmpdir(), "keyless-mints-"));
  dirs.push(root);
  writeFileSync(join(root, "caddy.jsonl"), `${logLines.join("\n")}\n`);
  writeFileSync(join(root, "own.txt"), ownList);
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
  return { root, ownHash: sha256(join(root, "own.txt")) };
}

function run(root: string, args: string[], extra: Record<string, string> = {}) {
  const r = spawnSync("bash", [SCRIPT, ...args], {
    cwd: REPO,
    encoding: "utf8",
    timeout: 60_000,
    env: {
      PATH: `${join(root, "bin")}:/usr/bin:/bin`,
      HOME: root,
      CP_OWN_IPS_FILE: join(root, "own.txt"),
      CP_OWN_IPS_SEEN: join(root, "seen.txt"),
      ...extra,
    },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** No planted address and no planted user agent in its words, on stdout or stderr. */
function expectNothingNamed(r: { stdout: string; stderr: string }) {
  for (const ip of PLANTED_ADDRESSES) expect(`${r.stdout}${r.stderr}`, ip).not.toContain(ip);
  for (const ua of PLANTED_AGENTS) expect(`${r.stdout}${r.stderr}`, ua).not.toContain(ua);
}

const rows = (stdout: string) => stdout.split("\n").filter((l) => /^\| \d{4}-/.test(l));

describe("ops/keyless-mints.sh counts keyless mints without naming anybody", () => {
  it("counts keyless mints per day, caller and status", () => {
    const { root, ownHash } = sandbox([
      line(DAY_11, "198.51.100.10", "POST", "/v1/auth/keyless", 201, CRAWLER_UA),
      line(DAY_11 + 1, "198.51.100.11", "POST", "/v1/auth/keyless", 201, CRAWLER_UA),
      line(DAY_11 + 2, "198.51.100.12", "POST", "/v1/auth/keyless", 201, CRAWLER_UA),
      line(DAY_11 + 3, "198.51.100.10", "POST", "/v1/auth/keyless", 429, CRAWLER_UA),
      line(DAY_11 + 4, "198.51.100.11", "POST", "/v1/auth/keyless", 429, CRAWLER_UA),
      line(DAY_11 + 5, "192.0.2.50", "POST", "/v1/auth/keyless", 429, "node"),
      line(DAY_12, "192.0.2.51", "POST", "/v1/auth/keyless", 201, "node/22.11.0"),
      line(DAY_12 + 1, "192.0.2.52", "POST", "/v1/auth/keyless", 201, "python-requests/2.31"),
    ]);
    const r = run(root, ["--file", join(root, "caddy.jsonl")]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.split("\n")[0]).toBe("| day | caller | status | requests |");
    expect(rows(r.stdout)).toEqual([
      "| 2026-11-11 | crawler | 201 | 3 |",
      "| 2026-11-11 | crawler | 429 | 2 |",
      "| 2026-11-11 | node | 429 | 1 |",
      "| 2026-11-12 | node | 201 | 1 |",
      "| 2026-11-12 | other | 201 | 1 |",
    ]);
    expect(r.stdout.split("\n")).toContain("own addresses left out: 0");
    expectNothingNamed(r);
    expect(sha256(join(root, "own.txt"))).toBe(ownHash);
  });

  it("counts only POST /v1/auth/keyless", () => {
    const { root, ownHash } = sandbox([
      line(DAY_11, "192.0.2.50", "POST", "/v1/auth/keyless", 201, "node"),
      line(DAY_11 + 1, "192.0.2.53", "GET", "/v1/auth/keyless", 405, "node"),
      line(DAY_11 + 2, "192.0.2.54", "POST", "/v1/auth/nonce", 200, "node"),
      line(DAY_11 + 3, "192.0.2.55", "POST", "/v1/auth/keyless-other", 404, "node"),
    ]);
    const r = run(root, ["--file", join(root, "caddy.jsonl")]);
    expect(r.status, r.stderr).toBe(0);
    expect(rows(r.stdout)).toEqual(["| 2026-11-11 | node | 201 | 1 |"]);
    expectNothingNamed(r);
    expect(sha256(join(root, "own.txt"))).toBe(ownHash);
  });

  it("leaves out our own addresses from the list, the live address and CP_OWN_IPS_SEEN", () => {
    const { root, ownHash } = sandbox([
      line(DAY_11, OWN_LISTED, "POST", "/v1/auth/keyless", 429, "node"),
      line(DAY_11 + 1, LIVE, "POST", "/v1/auth/keyless", 429, "node"),
      line(DAY_11 + 2, SEEN, "POST", "/v1/auth/keyless", 429, "node"),
      line(DAY_11 + 3, "192.0.2.50", "POST", "/v1/auth/keyless", 429, "node"),
    ]);
    writeFileSync(join(root, "seen.txt"), `${SEEN} 2026-11-10\n`);
    const r = run(root, ["--file", join(root, "caddy.jsonl")], { FAKE_LIVE: LIVE });
    expect(r.status, r.stderr).toBe(0);
    expect(rows(r.stdout)).toEqual(["| 2026-11-11 | node | 429 | 1 |"]);
    expect(r.stdout.split("\n")).toContain("own addresses left out: 3");
    expectNothingNamed(r);

    // The other direction in the same case: without the live address and the seen file, only the listed one is ours.
    rmSync(join(root, "seen.txt"), { force: true });
    const back = run(root, ["--file", join(root, "caddy.jsonl")]);
    expect(back.status, back.stderr).toBe(0);
    expect(rows(back.stdout)).toEqual(["| 2026-11-11 | node | 429 | 3 |"]);
    expect(back.stdout.split("\n")).toContain("own addresses left out: 1");
    expectNothingNamed(back);
    expect(sha256(join(root, "own.txt"))).toBe(ownHash);
  });

  it("stops with exit 2 when the own list names no address", () => {
    const { root, ownHash } = sandbox(
      [line(DAY_11, "192.0.2.50", "POST", "/v1/auth/keyless", 429, "node")],
      "# no own address\n",
    );
    const r = run(root, ["--file", join(root, "caddy.jsonl")], { FAKE_LIVE: LIVE });
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(2);
    expect(r.stdout.split("\n").some((l) => l.startsWith("|"))).toBe(false);
    expect(r.stderr).toContain("own_ips");
    expectNothingNamed(r);
    expect(sha256(join(root, "own.txt"))).toBe(ownHash);
  });

  it("stops with exit 2 when the own list is missing", () => {
    const { root, ownHash } = sandbox([line(DAY_11, "192.0.2.50", "POST", "/v1/auth/keyless", 429, "node")]);
    const r = run(root, ["--file", join(root, "caddy.jsonl")], {
      CP_OWN_IPS_FILE: join(root, "missing.txt"),
      FAKE_LIVE: LIVE,
    });
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(2);
    expect(r.stdout.split("\n").some((l) => l.startsWith("|"))).toBe(false);
    expect(r.stderr).toContain("own_ips");
    expect(existsSync(join(root, "missing.txt"))).toBe(false);
    expectNothingNamed(r);
    expect(sha256(join(root, "own.txt"))).toBe(ownHash);
  });

  it("the selftest passes and calls no real ssh", () => {
    const { root, ownHash } = sandbox([]);
    const r = run(root, ["--selftest"]);
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
    expect(r.stdout.trimEnd().split("\n").at(-1)).toBe("KEYLESS MINTS SELFTEST OK");
    expect(existsSync(join(root, "ssh-calls")), "the selftest puts its own fake ssh in front").toBe(false);
    expectNothingNamed(r);
    expect(sha256(join(root, "own.txt"))).toBe(ownHash);
  });

  it("stops with exit 2 when a keyless line has a ts it cannot read", () => {
    const { root, ownHash } = sandbox([
      line(DAY_11, "192.0.2.50", "POST", "/v1/auth/keyless", 429, "node"),
      JSON.stringify({
        ts: TS_AS_TEXT,
        request: { client_ip: "192.0.2.53", method: "POST", uri: "/v1/auth/keyless", headers: { "User-Agent": ["node"] } },
        status: 429,
      }),
    ]);
    const r = run(root, ["--file", join(root, "caddy.jsonl")]);
    expectUnreadable(r, 1);
    expect(sha256(join(root, "own.txt"))).toBe(ownHash);
  });

  it("stops with exit 2 when a keyless line has no status it can read", () => {
    const { root, ownHash } = sandbox([
      line(DAY_11, "192.0.2.50", "POST", "/v1/auth/keyless", 429, "node"),
      JSON.stringify({
        ts: DAY_11 + 1,
        request: { client_ip: "192.0.2.54", method: "POST", uri: "/v1/auth/keyless", headers: { "User-Agent": ["node"] } },
      }),
      JSON.stringify({
        ts: DAY_11 + 2,
        request: { client_ip: "192.0.2.55", method: "POST", uri: "/v1/auth/keyless", headers: { "User-Agent": ["node"] } },
        status: "n/a",
      }),
    ]);
    const r = run(root, ["--file", join(root, "caddy.jsonl")]);
    expectUnreadable(r, 2);
    expect(sha256(join(root, "own.txt"))).toBe(ownHash);
  });

  it("counts unreadable lines whatever days are asked for", () => {
    const { root, ownHash } = sandbox([
      line(DAY_12, "192.0.2.51", "POST", "/v1/auth/keyless", 201, "node/22.11.0"),
      JSON.stringify({
        ts: TS_AS_TEXT,
        request: { client_ip: "192.0.2.53", method: "POST", uri: "/v1/auth/keyless", headers: { "User-Agent": ["node"] } },
        status: 429,
      }),
    ]);
    const r = run(root, ["--file", join(root, "caddy.jsonl"), "--since", "2026-11-12", "--until", "2026-11-12"]);
    expectUnreadable(r, 1);
    expect(sha256(join(root, "own.txt"))).toBe(ownHash);
  });

  it("unreadable lines elsewhere change nothing", () => {
    const { root, ownHash } = sandbox([
      line(DAY_11, "198.51.100.10", "POST", "/v1/auth/keyless", 201, CRAWLER_UA),
      line(DAY_11 + 1, "198.51.100.11", "POST", "/v1/auth/keyless", 201, CRAWLER_UA),
      line(DAY_11 + 2, "198.51.100.12", "POST", "/v1/auth/keyless", 201, CRAWLER_UA),
      line(DAY_11 + 3, "198.51.100.10", "POST", "/v1/auth/keyless", 429, CRAWLER_UA),
      line(DAY_11 + 4, "198.51.100.11", "POST", "/v1/auth/keyless", 429, CRAWLER_UA),
      line(DAY_11 + 5, "192.0.2.50", "POST", "/v1/auth/keyless", 429, "node"),
      line(DAY_12, "192.0.2.51", "POST", "/v1/auth/keyless", 201, "node/22.11.0"),
      line(DAY_12 + 1, "192.0.2.52", "POST", "/v1/auth/keyless", 201, "python-requests/2.31"),
      JSON.stringify({
        ts: TS_AS_TEXT,
        request: { client_ip: "192.0.2.53", method: "GET", uri: "/v1/auth/keyless", headers: { "User-Agent": ["node"] } },
        status: 405,
      }),
      JSON.stringify({
        ts: TS_AS_TEXT,
        request: { client_ip: "192.0.2.54", method: "POST", uri: "/v1/auth/nonce", headers: { "User-Agent": ["node"] } },
        status: 200,
      }),
      JSON.stringify({
        ts: DAY_12 + 2,
        request: { client_ip: "192.0.2.55", method: "POST", uri: "/v1/auth/keyless-other", headers: { "User-Agent": ["node"] } },
      }),
      "not json",
      '{"ts":',
    ]);
    const r = run(root, ["--file", join(root, "caddy.jsonl")]);
    expect(r.status, r.stderr).toBe(0);
    expect(rows(r.stdout)).toEqual([
      "| 2026-11-11 | crawler | 201 | 3 |",
      "| 2026-11-11 | crawler | 429 | 2 |",
      "| 2026-11-11 | node | 429 | 1 |",
      "| 2026-11-12 | node | 201 | 1 |",
      "| 2026-11-12 | other | 201 | 1 |",
    ]);
    expect(r.stderr).toBe("");
    expectNothingNamed(r);
    expect(r.stdout).not.toContain(TS_AS_TEXT);
    expect(sha256(join(root, "own.txt"))).toBe(ownHash);
  });
});

/** A ts in the form Caddy writes with `time_format iso8601`, which the tool cannot read as seconds. */
const TS_AS_TEXT = "2026-11-11T12:00:00Z";

/** Exit 2, nothing on stdout, and on stderr only the one line with the number of unreadable keyless lines. */
function expectUnreadable(r: { status: number | null; stdout: string; stderr: string }, n: number) {
  expect(r.status, `${r.stdout}${r.stderr}`).toBe(2);
  expect(r.stdout.split("\n").some((l) => l.startsWith("|"))).toBe(false);
  expect(r.stdout).toBe("");
  expect(r.stderr).toBe(
    `keyless-mints: ${n} lines on POST /v1/auth/keyless could not be read (ts or status), so nothing is counted.\n`,
  );
  expectNothingNamed(r);
  expect(`${r.stdout}${r.stderr}`).not.toContain(TS_AS_TEXT);
}

/** The line the tool prints when the access log could not be read, and nothing else on stderr. */
const LOG_UNREADABLE = "keyless-mints: the access log could not be read, which is not a finding about traffic.\n";

/** Replaces the fake ssh: the log fetch prints the given lines gzipped, as the real call does, and then fails with 255. */
function sshPrintsThenFails(root: string, logLines: string[]) {
  writeFileSync(join(root, "fetched.jsonl"), `${logLines.join("\n")}\n`);
  writeFileSync(
    join(root, "bin", "ssh"),
    [
      "#!/bin/sh",
      `echo "$*" >> ${JSON.stringify(join(root, "ssh-calls"))}`,
      'for last in "$@"; do :; done',
      'case "$last" in',
      "  *SSH_CLIENT*) exit 255 ;;",
      `  *) gzip -c < ${JSON.stringify(join(root, "fetched.jsonl"))}; exit 255 ;;`,
      "esac",
      "",
    ].join("\n"),
  );
  chmodSync(join(root, "bin", "ssh"), 0o755);
}

describe("ops/keyless-mints.sh without --file reads the log over ssh", () => {
  it("stops with exit 2 when the access log cannot be read", () => {
    const { root, ownHash } = sandbox([]);
    const r = run(root, []);
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr).toBe(LOG_UNREADABLE);
    expect(readFileSync(join(root, "ssh-calls"), "utf8")).toContain("deploy-caddy-1");
    expectNothingNamed(r);
    expect(sha256(join(root, "own.txt"))).toBe(ownHash);
  });

  it("the access log wins over unreadable keyless lines", () => {
    const { root, ownHash } = sandbox([]);
    sshPrintsThenFails(root, [
      JSON.stringify({
        ts: TS_AS_TEXT,
        request: { client_ip: "192.0.2.53", method: "POST", uri: "/v1/auth/keyless", headers: { "User-Agent": ["node"] } },
        status: 429,
      }),
    ]);
    const r = run(root, []);
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr).toBe(LOG_UNREADABLE);
    expect(readFileSync(join(root, "ssh-calls"), "utf8")).toContain("deploy-caddy-1");
    expectNothingNamed(r);
    expect(`${r.stdout}${r.stderr}`).not.toContain(TS_AS_TEXT);
    expect(sha256(join(root, "own.txt"))).toBe(ownHash);
  });
});
