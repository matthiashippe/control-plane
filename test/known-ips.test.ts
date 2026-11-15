import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

/**
 * The repository is public, so every public IPv4 address in a tracked file has to be accounted for. An address is accounted for
 * when it stands in ops/known-ips.txt (with its kind and the evidence for it), in ops/own-ips.txt (our own machines) or in
 * ops/crawler-ips.txt (crawlers proven by their PTR record). Everything else has to be replaced by an address from the
 * documentation ranges (RFC 5737), because an unlisted public address may belong to a real visitor.
 *
 * The list keeps its own rules here as well, so that they hold after the goal that introduced them: every line has the form
 * <address> <kind> <evidence>, an address of kind erfunden stands only in files a goal may not change, and every entry still has
 * a finding outside the list, so the list never turns into a permit for an address that comes later. Findings are the tracked
 * files of the scan root and of the work tree that tracks the list.
 *
 * An entry whose evidence is (fetcher-cache) is checked against the cache of ops/fetchers.py where that cache exists: the line
 * reads exactly <address> datacenter <operator> (fetcher-cache), and the cache holds the address with kind datacenter and the
 * same operator. Without the cache (CI) that case is skipped, the others still run. Only the list of this repository is held
 * against the default cache; any other list (a fixture from CP_KNOWN_IPS) only against a cache named explicitly, because a
 * fixture holds documentation addresses that the real cache never has, and the outcome would depend on the host.
 *
 * Every datacenter line names its evidence in a fixed form, with or without the cache: a line whose text mentions the fetcher
 * cache in any spelling reads exactly <address> datacenter <operator> (fetcher-cache), and every other one carries a bracket
 * (<source> <YYYY-MM-DD>) or (<source> <YYYY-MM-DD>, ...) with the source ops/fetchers.py lookup, RIPE RDAP or ARIN RDAP and a
 * real calendar day. A misspelt evidence would otherwise drop the line out of the check against the cache without a word.
 *
 * This test needs no lookup and no network, so it runs in check and in CI. The failure message names the count, the files or
 * the line numbers, never an address.
 *
 *   CP_KNOWN_IPS       the list to read instead of ops/known-ips.txt (/dev/null is an empty list)
 *   CP_SCAN_ROOT       the git work tree to scan instead of this repository
 *   CP_FETCHER_CACHE   the cache of ops/fetchers.py, read only; default for the own list ~/.cache/control-plane/fetcher-cache.tsv
 */
const ROOT = join(__dirname, "..");
const fromRoot = (p: string): string => (isAbsolute(p) ? p : resolve(ROOT, p));
const KNOWN = fromRoot(process.env.CP_KNOWN_IPS || "ops/known-ips.txt");
const SCAN_ROOT = fromRoot(process.env.CP_SCAN_ROOT || ROOT);
// The same cache path as test/visitor-addresses.test.ts, but the default only for the list of this repository; an empty path
// never exists, so a fixture list without an explicit cache skips the check against the cache, on every host alike.
const OWN_LIST = KNOWN === join(ROOT, "ops", "known-ips.txt");
const CACHE = process.env.CP_FETCHER_CACHE || (OWN_LIST ? join(homedir(), ".cache", "control-plane", "fetcher-cache.tsv") : "");
// The evidence that points at the cache, and the only form a line carrying it may have.
const FETCHER_CACHE = "(fetcher-cache)";
const CACHE_LINE = /^((?:[0-9]{1,3}\.){3}[0-9]{1,3}) datacenter ([^ ].*) \(fetcher-cache\)$/;
// Any spelling of the fetcher cache in a line; such a line must read exactly CACHE_LINE.
const MENTIONS_CACHE = /fetcher.?cache/i;
// The bracket of a lookup: source and calendar day, then a comma or the closing bracket.
const LOOKUP = /\((ops\/fetchers\.py lookup|RIPE RDAP|ARIN RDAP) ([0-9]{4})-([0-9]{2})-([0-9]{2})[,)]/;
// The same candidate pattern as test/visitor-addresses.test.ts.
const IPV4 = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;

// One line of ops/known-ips.txt besides comments and blank lines, the same pattern as the goal that introduced the list.
const LINE = /^((?:[0-9]{1,3}\.){3}[0-9]{1,3}) (datacenter|crawler|erfunden|eigene) [^ ].*$/;
// Paths no goal may change; an address of kind erfunden may only be left there.
const FROZEN = /^(?:goals\/|docs\/audit\/|\.github\/|deploy\/|harness\/|LOOP\.md$|loop-constraints\.md$|loop-dauerauftrag\.md$)/;

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

interface ListEntry {
  line: number;
  ip: string;
  kind: string;
}

// Every line except comments and blank lines; entry is null when the line breaks the format.
function listLines(path: string): Array<{ line: number; entry: ListEntry | null }> {
  if (!existsSync(path)) throw new Error(`address list missing: ${path}`);
  const out: Array<{ line: number; entry: ListEntry | null }> = [];
  readFileSync(path, "utf-8")
    .split("\n")
    .forEach((text, i) => {
      if (text === "" || text.startsWith("#")) return;
      const m = LINE.exec(text);
      out.push({ line: i + 1, entry: m && toNumber(m[1]) !== null ? { line: i + 1, ip: m[1], kind: m[2] } : null });
    });
  return out;
}

// The work tree that tracks the list, or null for a list outside git (a scratch file in a test).
function listWorkTree(list: string): string | null {
  const dir = dirname(list);
  const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "--", basename(list)], { cwd: dir, encoding: "utf-8" });
  if (tracked.status !== 0) return null;
  const top = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf-8" });
  return top.status === 0 ? top.stdout.trim() : null;
}

// Every text file tracked in the scan root and in the work tree of the list, the list itself excluded, by repository path.
function findingFiles(): Array<{ rel: string; text: string }> {
  const list = realpathSync(KNOWN);
  const seen = new Set<string>();
  const out: Array<{ rel: string; text: string }> = [];
  for (const root of [SCAN_ROOT, listWorkTree(KNOWN)]) {
    if (root === null) continue;
    for (const rel of trackedFiles(root)) {
      const path = join(root, rel);
      if (!existsSync(path) || !statSync(path).isFile()) continue;
      const real = realpathSync(path);
      if (real === list || seen.has(real)) continue;
      seen.add(real);
      const buf = readFileSync(path);
      if (buf.includes(0)) continue;
      out.push({ rel, text: buf.toString("utf-8") });
    }
  }
  return out;
}

// Address to owner and kind from the cache of ops/fetchers.py; comment and blank lines do not count.
function cacheEntries(path: string): Map<string, Array<{ owner: string; kind: string }>> {
  const out = new Map<string, Array<{ owner: string; kind: string }>>();
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    if (line === "" || line.startsWith("#")) continue;
    const [ip, owner = "", kind = ""] = line.split("\t");
    out.set(ip, [...(out.get(ip) ?? []), { owner, kind }]);
  }
  return out;
}

// Why a list line carrying (fetcher-cache) does not hold against the cache, or null when it does.
function cacheFinding(text: string, cache: Map<string, Array<{ owner: string; kind: string }>>): string | null {
  const m = CACHE_LINE.exec(text);
  if (m === null) {
    if (!/^\S+ datacenter /.test(text)) return "kind is not datacenter";
    return `text besides the operator and ${FETCHER_CACHE}`;
  }
  const rows = cache.get(m[1]);
  if (rows === undefined) return "address not in the cache";
  if (!rows.some((r) => r.kind === "datacenter")) return "kind in the cache is not datacenter";
  if (!rows.some((r) => r.kind === "datacenter" && r.owner === m[2])) return "other operator in the cache";
  return null;
}

// True for a day that exists in the calendar; no comparison with the clock, so the result never changes with the date.
function isCalendarDay(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Why a datacenter line does not name its evidence in the fixed form, or null when it does.
function evidenceFinding(text: string): string | null {
  if (MENTIONS_CACHE.test(text)) {
    return CACHE_LINE.test(text) ? null : "the fetcher cache must stand as exactly (fetcher-cache) at the end of the line";
  }
  const m = LOOKUP.exec(text);
  if (m === null) return "no bracket with ops/fetchers.py lookup, RIPE RDAP or ARIN RDAP and a date YYYY-MM-DD";
  if (!isCalendarDay(Number(m[2]), Number(m[3]), Number(m[4]))) return "the date of the lookup is not a calendar day";
  return null;
}

function addressesIn(text: string): Set<string> {
  return new Set(text.match(IPV4) ?? []);
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
  it("keeps every line of the address list in the form <address> <kind> <evidence>", () => {
    const broken = listLines(KNOWN)
      .filter((l) => l.entry === null)
      .map((l) => l.line);
    expect(
      broken.length,
      `${broken.length} line(s) of the address list break the form <address> <datacenter|crawler|erfunden|eigene> <evidence>: ` +
        `line(s) ${broken.join(", ")}.`,
    ).toBe(0);
  });

  it("leaves an address of kind erfunden only in files a goal may not change", () => {
    const invented = listLines(KNOWN)
      .map((l) => l.entry)
      .filter((e): e is ListEntry => e !== null && e.kind === "erfunden");
    const files = findingFiles().filter((f) => !FROZEN.test(f.rel));
    const lines = new Set<number>();
    const where = new Set<string>();
    for (const f of files) {
      const found = addressesIn(f.text);
      for (const e of invented) {
        if (found.has(e.ip)) {
          lines.add(e.line);
          where.add(f.rel);
        }
      }
    }
    expect(
      lines.size,
      `${lines.size} address(es) of kind erfunden (list line(s) ${[...lines].join(", ")}) stand in file(s) a goal may change: ` +
        `${[...where].join(", ")}. Replace them there with a documentation address.`,
    ).toBe(0);
  });

  it("finds every entry of the address list in a tracked file besides the list", () => {
    const found = new Set<string>();
    for (const f of findingFiles()) for (const ip of addressesIn(f.text)) found.add(ip);
    const stale = listLines(KNOWN)
      .map((l) => l.entry)
      .filter((e): e is ListEntry => e !== null && !found.has(e.ip))
      .map((e) => e.line);
    expect(
      stale.length,
      `${stale.length} entries of the address list stand in no tracked file besides the list: line(s) ${stale.join(", ")}. ` +
        "Remove them from the list.",
    ).toBe(0);
  });

  it("names the source of every datacenter line in a fixed form", () => {
    const bad: string[] = [];
    readFileSync(KNOWN, "utf-8")
      .split("\n")
      .forEach((text, i) => {
        if (text === "" || text.startsWith("#") || !/^\S+ datacenter /.test(text)) return;
        const why = evidenceFinding(text);
        if (why !== null) bad.push(`line ${i + 1}: ${why}`);
      });
    expect(
      bad.length,
      `${bad.length} datacenter line(s) of the address list do not name their evidence in the fixed form (${bad.join("; ")}). ` +
        "Write <address> datacenter <operator> (fetcher-cache), or name the lookup as (<source> <YYYY-MM-DD>) with the source " +
        "ops/fetchers.py lookup, RIPE RDAP or ARIN RDAP.",
    ).toBe(0);
  });

  it.skipIf(!existsSync(CACHE))("holds every (fetcher-cache) line against the cache of ops/fetchers.py", () => {
    const cache = cacheEntries(CACHE);
    const bad: string[] = [];
    readFileSync(KNOWN, "utf-8")
      .split("\n")
      .forEach((text, i) => {
        if (text === "" || text.startsWith("#") || !text.includes(FETCHER_CACHE)) return;
        const why = cacheFinding(text, cache);
        if (why !== null) bad.push(`line ${i + 1}: ${why}`);
      });
    expect(
      bad.length,
      `${bad.length} line(s) of the address list with ${FETCHER_CACHE} do not hold against the cache of ops/fetchers.py ` +
        `(${bad.join("; ")}). The line must read <address> datacenter <operator> ${FETCHER_CACHE}, and the cache must hold the ` +
        "address with kind datacenter and that operator; otherwise name another evidence or replace the address.",
    ).toBe(0);
  });
});
