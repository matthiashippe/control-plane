import "./yield-between-tests";
import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ops/anzeigen-rechnung.py counts the foreign addresses at the payment route, the denominator of the conversion, and
 * takes our own addresses from `own_ips` in ops/own-ips.sh: the list file, the live address and every address in
 * CP_OWN_IPS_SEEN. A list without an address or without a file ends the program with exit 2 instead of counting on
 * with an empty list.
 *
 * Every case runs a copy of the program and of ops/own-ips.sh in a temp dir, with a fake ops/access-log.sh that prints
 * a planted log and a fake `ssh` first on PATH that answers the SSH_CLIENT probe with FAKE_LIVE when it is set and exits
 * 255 otherwise. No network, no fixed port, documentation addresses only.
 */
const REPO = join(__dirname, "..");
const PLANTED = ["203.0.113.99", "198.51.100.23", "192.0.2.50"];
const OWN = "203.0.113.99 2026-11-01  planted own address\n";
const MARKET = JSON.stringify({
  db: { market: { foreign_payers: 1, foreign_topup_mc: 100000, foreign_margin_mc: 1000, foreign_inference_mc: 10000, open_bounties: 0 } },
});
const SEEN_LINE = /Adressen, die das Angebot ansahen\s+(\d+)\s*$/m;

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

type Run = { status: number | null; stdout: string; stderr: string };

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function sandbox(own = OWN) {
  const root = mkdtempSync(join(tmpdir(), "anzeigen-rechnung-own-ips-"));
  roots.push(root);
  mkdirSync(join(root, "ops"));
  for (const f of ["ops/anzeigen-rechnung.py", "ops/own-ips.sh"]) copyFileSync(join(REPO, f), join(root, f));
  writeFileSync(join(root, "own.txt"), own);
  writeFileSync(
    join(root, "access.log"),
    PLANTED.map((ip) => JSON.stringify({ request: { client_ip: ip, method: "GET", uri: "/pay/planted" }, status: 200 })).join("\n") + "\n",
  );
  writeFileSync(join(root, "ops", "access-log.sh"), `#!/bin/sh\ncat ${JSON.stringify(join(root, "access.log"))}\n`);
  chmodSync(join(root, "ops", "access-log.sh"), 0o755);
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

  const run = (env: Record<string, string> = {}): Run => {
    const r = spawnSync("python3", ["ops/anzeigen-rechnung.py"], {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
      input: MARKET,
      env: {
        PATH: `${join(root, "bin")}:/usr/bin:/bin`,
        HOME: root,
        CP_OWN_IPS_FILE: join(root, "own.txt"),
        CP_OWN_IPS_SEEN: join(root, "seen.txt"),
        ...env,
      },
    });
    for (const l of `${r.stdout}\n${r.stderr}`.split("\n")) for (const ip of PLANTED) expect(l).not.toContain(ip);
    expect(sha256(join(root, "own.txt"))).toBe(before);
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  };
  const seen = (body: string) => writeFileSync(join(root, "seen.txt"), body);
  return { root, run, seen };
}

const counted = (r: Run) => {
  const m = r.stdout.match(SEEN_LINE);
  expect(m, r.stdout + r.stderr).toBeTruthy();
  return Number(m![1]);
};

describe("ops/anzeigen-rechnung.py takes our own addresses from own_ips", () => {
  it("an address only in CP_OWN_IPS_SEEN is not counted at the payment route", () => {
    const s = sandbox();
    s.seen("198.51.100.23 2026-11-01\n");
    expect(counted(s.run())).toBe(1);

    // The other direction in the same case: without the seen file that address is foreign again.
    rmSync(join(s.root, "seen.txt"));
    expect(counted(s.run())).toBe(2);
  });

  it("the live address is not counted at the payment route", () => {
    const s = sandbox();
    expect(counted(s.run({ FAKE_LIVE: "198.51.100.23" }))).toBe(1);
  });

  it("stops with exit 2 when the own list names no address even with a live address and a seen address", () => {
    const s = sandbox("# no own address\n");
    s.seen("192.0.2.50 2026-11-01\n");
    const r = s.run({ FAKE_LIVE: "198.51.100.23" });
    expect(r.status, r.stdout + r.stderr).toBe(2);
    expect(r.stderr).toContain("own_ips");
    expect(r.stdout).not.toContain("Adressen, die das Angebot ansahen");
  });

  it("stops with exit 2 when the own list is missing", () => {
    const s = sandbox();
    const r = s.run({ CP_OWN_IPS_FILE: join(s.root, "missing.txt") });
    expect(r.status, r.stdout + r.stderr).toBe(2);
    expect(r.stderr).toContain("own_ips");
    expect(r.stdout).not.toContain("Adressen, die das Angebot ansahen");
  });
});
