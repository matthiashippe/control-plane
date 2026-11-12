import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

/**
 * The repository is public, so every public IPv4 address in a tracked file has to be accounted for. An address is accounted for
 * when it stands in ops/known-ips.txt (with its kind and the evidence for it), in ops/own-ips.txt (our own machines) or in
 * ops/crawler-ips.txt (crawlers proven by their PTR record). Everything else has to be replaced by an address from the
 * documentation ranges (RFC 5737), because an unlisted public address may belong to a real visitor.
 *
 * This test needs no lookup and no network, so it runs in check and in CI. The failure message names the count and the files,
 * never an address.
 *
 *   CP_KNOWN_IPS   the list to read instead of ops/known-ips.txt (/dev/null is an empty list)
 *   CP_SCAN_ROOT   the git work tree to scan instead of this repository
 */
const ROOT = join(__dirname, "..");
const fromRoot = (p: string): string => (isAbsolute(p) ? p : resolve(ROOT, p));
const KNOWN = fromRoot(process.env.CP_KNOWN_IPS || "ops/known-ips.txt");
const SCAN_ROOT = fromRoot(process.env.CP_SCAN_ROOT || ROOT);
// The same candidate pattern as test/visitor-addresses.test.ts.
const IPV4 = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;

// Ranges that are not public: this network, private, shared, loopback, link-local, IETF protocol assignments, the three
// documentation ranges, benchmarking, multicast and reserved.
const NOT_PUBLIC: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function toNumber(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function isPublic(ip: string): boolean {
  const n = toNumber(ip);
  if (n === null) return false;
  return !NOT_PUBLIC.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return ((n & mask) >>> 0) === ((toNumber(base)! & mask) >>> 0);
  });
}

function listedAddresses(path: string): Set<string> {
  if (!existsSync(path)) throw new Error(`address list missing: ${path}`);
  const out = new Set<string>();
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const m = /^((?:[0-9]{1,3}\.){3}[0-9]{1,3})(?:\s|$)/.exec(line);
    if (m) out.add(m[1]);
  }
  return out;
}

function trackedFiles(root: string): string[] {
  const r = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf-8" });
  if (r.status !== 0) throw new Error(`git ls-files failed in ${root}`);
  return r.stdout.split("\0").filter(Boolean);
}

describe("no tracked file carries an unaccounted public IPv4 address", () => {
  it("tells public addresses from documentation, private and reserved ones", () => {
    expect(isPublic("192.0.2.7")).toBe(false);
    expect(isPublic("198.51.100.200")).toBe(false);
    expect(isPublic("203.0.113.1")).toBe(false);
    expect(isPublic("10.0.0.8")).toBe(false);
    expect(isPublic("172.31.255.255")).toBe(false);
    expect(isPublic("100.127.0.1")).toBe(false);
    expect(isPublic("224.0.0.0")).toBe(false);
    expect(isPublic("255.255.255.255")).toBe(false);
    expect(isPublic("999.1.1.1")).toBe(false);
    // Built from parts, so that this file holds no public address of its own.
    const ip = (...parts: number[]): string => parts.join(".");
    expect(isPublic(ip(172, 32, 0, 1))).toBe(true);
    expect(isPublic(ip(100, 128, 0, 1))).toBe(true);
    expect(isPublic(ip(198, 20, 0, 1))).toBe(true);
    expect(isPublic(ip(11, 22, 33, 44))).toBe(true);
  });

  it("finds every public address in git ls-files in ops/known-ips.txt, ops/own-ips.txt or ops/crawler-ips.txt", () => {
    const allowed = new Set([
      ...listedAddresses(KNOWN),
      ...listedAddresses(join(ROOT, "ops/own-ips.txt")),
      ...listedAddresses(join(ROOT, "ops/crawler-ips.txt")),
    ]);
    const files = trackedFiles(SCAN_ROOT);
    expect(files.length).toBeGreaterThan(0);

    const unlisted = new Set<string>();
    const hits = new Map<string, number>();
    for (const file of files) {
      const path = join(SCAN_ROOT, file);
      if (!existsSync(path) || !statSync(path).isFile()) continue;
      const buf = readFileSync(path);
      // grep reports binary files without their matches; do the same.
      if (buf.includes(0)) continue;
      const found = new Set(buf.toString("utf-8").match(IPV4) ?? []);
      const bad = [...found].filter((ip) => isPublic(ip) && !allowed.has(ip));
      for (const ip of bad) unlisted.add(ip);
      if (bad.length > 0) hits.set(file, bad.length);
    }

    const where = [...hits.entries()].map(([file, n]) => `${file} (${n})`).join(", ");
    expect(
      unlisted.size,
      `${unlisted.size} unlisted public address(es) in ${hits.size} file(s): ${where}. ` +
        "Replace each with a documentation address or list it in ops/known-ips.txt with its kind and evidence.",
    ).toBe(0);
  });
});
