import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ops/claim-keyless.sh decides which keyless handle we minted ourselves by the address the `201 POST /v1/auth/keyless`
 * came from. It used to read our addresses straight from ops/own-ips.txt, which only grows by hand now, so a handle our
 * own probe minted from the live address or from an address remembered in CP_OWN_IPS_SEEN read as a stranger and counted
 * in `wallets_foreign`. It now takes `own_ips` from ops/own-ips.sh and stops with exit 2 when that list is missing.
 *
 * Everything runs without network in a temp copy of the scripts: `ssh` on PATH is a fake that answers the SSH_CLIENT
 * probe with 192.0.2.77, the access log fetch with a planted gzip log, the wallet query with planted rows, and everything
 * else with exit 255. Addresses come from the documentation ranges only. The real checkout is never run, and HOME and
 * CP_OWN_IPS_SEEN point into the temp dir, so the real state directory is never touched.
 */
const REPO = join(__dirname, "..");
const LIVE = "192.0.2.77";
const SEEN_ONLY = "203.0.113.9";
const STRANGER = "198.51.100.23";
const AT = "2026-11-01T12:00:00";
const T0 = Date.parse(`${AT}Z`) / 1000;
const HANDLE = "key:4d1c0ffee0ddba11";
const COPIES = ["ops/claim-keyless.sh", "ops/own-ips.sh", "ops/access-log.sh", "ops/db-report.cjs", "src/bounties/ours.ts"];
const GUARDED = ["src/bounties/ours.ts", "ops/db-report.cjs", "ops/own-ips.txt"];

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** A temp copy of the scripts with a fake ssh that reports one handle minted from `minter`. */
function sandbox(minter: string) {
  const root = mkdtempSync(join(tmpdir(), "claim-keyless-"));
  for (const f of COPIES) {
    mkdirSync(join(root, f, ".."), { recursive: true });
    copyFileSync(join(REPO, f), join(root, f));
  }
  const kept = readFileSync(join(REPO, "ops", "own-ips.txt"), "utf8")
    .split("\n")
    .filter((l) => ![LIVE, SEEN_ONLY, STRANGER].some((ip) => l.startsWith(`${ip} `)))
    .join("\n");
  writeFileSync(join(root, "ops", "own-ips.txt"), kept);
  writeFileSync(join(root, "seen.txt"), `${SEEN_ONLY} 2026-11-01\n`);

  const accessLog = join(root, "planted-access.log");
  writeFileSync(
    accessLog,
    `${JSON.stringify({ ts: T0, request: { client_ip: minter, method: "POST", uri: "/v1/auth/keyless" }, status: 201 })}\n`,
  );
  const rows = join(root, "planted-rows.txt");
  writeFileSync(rows, `${HANDLE} ${AT} 0 0 0\n`);

  mkdirSync(join(root, "bin"));
  writeFileSync(
    join(root, "bin", "ssh"),
    [
      "#!/bin/sh",
      'for last in "$@"; do :; done',
      'case "$last" in',
      `  *SSH_CLIENT*) echo "${LIVE} 40000 22" ;;`,
      `  *"docker exec deploy-caddy-1"*) gzip -c < ${JSON.stringify(accessLog)} ;;`,
      `  *better-sqlite3*) cat ${JSON.stringify(rows)} ;;`,
      "  *) exit 255 ;;",
      "esac",
      "",
    ].join("\n"),
  );
  chmodSync(join(root, "bin", "ssh"), 0o755);

  const before = Object.fromEntries(GUARDED.map((f) => [f, sha256(join(root, f))]));
  return { root, before };
}

function claim(root: string) {
  const r = spawnSync("bash", [join(root, "ops", "claim-keyless.sh")], {
    cwd: root,
    encoding: "utf8",
    timeout: 60_000,
    env: {
      PATH: `${join(root, "bin")}:/usr/bin:/bin`,
      HOME: root,
      CP_OWN_IPS_SEEN: join(root, "seen.txt"),
    },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function expectUntouched(root: string, before: Record<string, string>) {
  for (const f of GUARDED) {
    if (existsSync(join(root, f))) expect(sha256(join(root, f)), f).toBe(before[f]);
  }
}

describe("ops/claim-keyless.sh takes our own addresses from own_ips", () => {
  it("counts an address that is only in the CP_OWN_IPS_SEEN file as ours", () => {
    const { root, before } = sandbox(SEEN_ONLY);
    const r = claim(root);
    expect(r.status, r.stderr).toBe(0);
    const lines = r.stdout.split("\n");
    expect(lines.some((l) => l.startsWith("  OURS ") && l.includes(`minted from ${SEEN_ONLY}`)), r.stdout).toBe(true);
    expect(lines).toContain("1 handle(s) would be written. Run with --write.");
    expectUntouched(root, before);
  });

  it("counts the address seen live as ours although no list names it", () => {
    const { root, before } = sandbox(LIVE);
    const r = claim(root);
    expect(r.status, r.stderr).toBe(0);
    const lines = r.stdout.split("\n");
    expect(lines.some((l) => l.startsWith("  OURS ") && l.includes(`minted from ${LIVE}`)), r.stdout).toBe(true);
    expect(lines).toContain("1 handle(s) would be written. Run with --write.");
    expectUntouched(root, before);
  });

  it("still calls an address in no list a stranger and offers nothing", () => {
    const { root, before } = sandbox(STRANGER);
    const r = claim(root);
    expect(r.status, r.stderr).toBe(0);
    const lines = r.stdout.split("\n");
    expect(lines.some((l) => l.startsWith("  STRANGER") && l.includes(STRANGER)), r.stdout).toBe(true);
    expect(lines.some((l) => l.startsWith("  OURS "))).toBe(false);
    expect(lines).toContain("nothing to claim");
    expectUntouched(root, before);
  });

  it("stops with exit 2 when the list of own addresses is missing", () => {
    const { root, before } = sandbox(SEEN_ONLY);
    rmSync(join(root, "ops", "own-ips.txt"));
    const r = claim(root);
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(2);
    const lines = r.stdout.split("\n");
    expect(lines.some((l) => l.startsWith("  OURS ") || l.startsWith("  STRANGER")), r.stdout).toBe(false);
    expect(r.stderr).toContain("own_ips");
    expect(existsSync(join(root, "ops", "own-ips.txt"))).toBe(false);
    expectUntouched(root, before);
  });
});
