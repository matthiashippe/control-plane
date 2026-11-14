import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Our own addresses are known by one rule: `own_ips` in ops/own-ips.sh, which adds the live address and every address in
 * CP_OWN_IPS_SEEN to the list. A tool that reads the list file past it counts our own calls as foreign. So no file under
 * ops/ besides ops/own-ips.sh may name own-ips.txt outside a comment. Reads files only: no network, no git.
 */
const REPO = join(__dirname, "..");
const OPS = join(REPO, "ops");
const EXT = /\.(sh|py|cjs|mjs|js|ts)$/;
const NAMES_LIST = /(?<![\w-])own-ips\.txt/;
const COMMENT = /^\s*(#|\/\/|\/\*|\*)/;

const readsListPastOwnIps = (line: string): boolean => !COMMENT.test(line) && NAMES_LIST.test(line);

function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, e.name);
    const rel = relative(REPO, path).split("\\").join("/");
    if (e.isDirectory()) {
      if (rel === "ops/fixtures") continue;
      out.push(...files(path));
    } else if (e.isFile() && EXT.test(e.name) && rel !== "ops/own-ips.sh") {
      out.push(rel);
    }
  }
  return out;
}

describe("own-ips.txt is read only through own_ips", () => {
  it("no file under ops/ besides ops/own-ips.sh names own-ips.txt outside a comment", () => {
    const hits: string[] = [];
    for (const rel of files(OPS).sort()) {
      readFileSync(join(REPO, rel), "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (readsListPastOwnIps(line)) hits.push(`${rel}:${i + 1}`);
        });
    }
    expect(hits, `read past own_ips: ${hits.join(", ")}`).toEqual([]);
  });

  it("the matcher trips on a direct read and passes comments and known-ips.txt", () => {
    for (const hit of [
      'OWN_FILE="${CP_OWN_IPS_FILE:-$ROOT/ops/own-ips.txt}"',
      'own = set(open("ops/own-ips.txt").read().split())',
      'print("Ours are out: ops/own-ips.txt")',
    ])
      expect(readsListPastOwnIps(hit), hit).toBe(true);
    for (const pass of ["# default ops/own-ips.txt", "  // ops/own-ips.txt", 'KNOWN="$ROOT/ops/known-ips.txt"', 'source "$HERE/own-ips.sh"'])
      expect(readsListPastOwnIps(pass), pass).toBe(false);
  });
});
