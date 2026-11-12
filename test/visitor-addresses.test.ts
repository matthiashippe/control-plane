import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The repository is public. ops/fetchers.py classifies the addresses from the production access log and keeps them in a cache outside
 * the repository; the ones it does not recognise as a data centre are addresses of real visitors. They must not appear in any tracked
 * file. The ones removed in fehler 02 did not come from the cache file but from comments that runs wrote about a visit, so this test
 * holds the line after the merge.
 *
 * Same set as the second check of fehler 02 point 2: every cached address whose kind is not "datacenter", minus our own addresses
 * (ops/own-ips.txt) and the documented crawler addresses (ops/crawler-ips.txt). The failure message names the count and the files,
 * never an address. Without a cache (CI) there is nothing to compare against, so the test is skipped rather than reported green.
 */
const ROOT = join(__dirname, "..");
const CACHE = process.env.CP_FETCHER_CACHE || join(homedir(), ".cache", "control-plane", "fetcher-cache.tsv");
const IPV4 = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;

function listedAddresses(file: string): Set<string> {
  const path = join(ROOT, file);
  if (!existsSync(path)) return new Set();
  const out = new Set<string>();
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const m = /^[0-9.]+/.exec(line);
    if (m) out.add(m[0]);
  }
  return out;
}

function visitorAddresses(): Set<string> {
  const allowed = new Set([...listedAddresses("ops/own-ips.txt"), ...listedAddresses("ops/crawler-ips.txt")]);
  const out = new Set<string>();
  // Line 1 is the header, as in the awk of the check (NR>1).
  for (const line of readFileSync(CACHE, "utf-8").split("\n").slice(1)) {
    if (!line) continue;
    const [ip, , kind] = line.split("\t");
    if (kind !== "datacenter" && !allowed.has(ip)) out.add(ip);
  }
  return out;
}

describe("no tracked file carries the address of a real visitor", () => {
  it.skipIf(!existsSync(CACHE))("finds none of the cached visitor addresses in git ls-files", () => {
    const visitors = visitorAddresses();
    const files = spawnSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf-8" }).stdout.split("\0").filter(Boolean);
    expect(files.length).toBeGreaterThan(0);

    const hits = new Map<string, number>();
    for (const file of files) {
      const path = join(ROOT, file);
      if (!existsSync(path)) continue;
      const buf = readFileSync(path);
      // grep reports binary files without their matches; do the same.
      if (buf.includes(0)) continue;
      const found = new Set(buf.toString("utf-8").match(IPV4) ?? []);
      const n = [...found].filter((ip) => visitors.has(ip)).length;
      if (n > 0) hits.set(file, n);
    }

    const total = [...hits.values()].reduce((a, b) => a + b, 0);
    const where = [...hits.entries()].map(([file, n]) => `${file} (${n})`).join(", ");
    expect(total, `${total} visitor address(es) in ${hits.size} file(s): ${where}`).toBe(0);
  });
});
