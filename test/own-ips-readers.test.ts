import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { existsSync } from "node:fs";
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
// "*" counts as a comment only when followed by whitespace or the end of the line, so a shell case branch "*)" stays code.
const COMMENT = /^\s*(#|\/\/|\/\*|\*(\s|$))/;

const readsListPastOwnIps = (line: string): boolean => !COMMENT.test(line) && NAMES_LIST.test(line);

// A line that hands the list file itself to a reader: CP_OWN_IPS_FILE together with awk, grep or cat as a word, or open(.
const NAMES_LIST_VAR = /CP_OWN_IPS_FILE/;
const READS_FILE = /\b(awk|grep|cat)\b|\bopen\(/;
const readsListFileDirectly = (line: string): boolean =>
  !COMMENT.test(line) && NAMES_LIST_VAR.test(line) && READS_FILE.test(line);

// Files that may read CP_OWN_IPS_FILE directly, each with the reason. Everything else goes through own_ips or own_ips_offline.
const READER_EXCEPTIONS: { path: string; reason: string }[] = [
  {
    path: "ops/actions-log-addresses.sh",
    reason: "counts strangers in public logs, not customers, and needs only the path without a live query (messung 04)",
  },
  { path: "ops/timeout-quote.sh", reason: "checks that the list itself names an address before own_ips is asked" },
  { path: "ops/keyless-mints.sh", reason: "checks that the list itself names an address before own_ips is asked" },
  { path: "ops/anzeigen-rechnung.py", reason: "checks that the list itself names an address before own_ips is asked" },
];

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
      // A shell case branch starts with "*" but is code, not a comment.
      '  *) OWN="$ROOT/ops/own-ips.txt" ;;',
    ])
      expect(readsListPastOwnIps(hit), hit).toBe(true);
    for (const pass of [
      "# default ops/own-ips.txt",
      "  // ops/own-ips.txt",
      " * ops/own-ips.txt",
      'KNOWN="$ROOT/ops/known-ips.txt"',
      'source "$HERE/own-ips.sh"',
    ])
      expect(readsListPastOwnIps(pass), pass).toBe(false);
  });

  it("no file under ops/ besides ops/own-ips.sh and the named exceptions gives CP_OWN_IPS_FILE to awk, grep, cat or open outside a comment", () => {
    const excepted = new Set(READER_EXCEPTIONS.map((e) => e.path));
    const hits: string[] = [];
    for (const rel of files(OPS).sort()) {
      if (excepted.has(rel)) continue;
      readFileSync(join(REPO, rel), "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (readsListFileDirectly(line)) hits.push(`${rel}:${i + 1}`);
        });
    }
    expect(hits, `CP_OWN_IPS_FILE read past own_ips: ${hits.join(", ")}`).toEqual([]);
  });

  it("the reader matcher trips on awk, grep, cat and open with CP_OWN_IPS_FILE and passes a test, an assignment and a comment", () => {
    for (const hit of [
      `  OWN=$(awk '!/^#/ && NF {print $1}' "$CP_OWN_IPS_FILE" | sort -u | tr '\\n' ' ')`,
      'cat "$CP_OWN_IPS_FILE"',
      `grep -v '^#' "$CP_OWN_IPS_FILE"`,
      'own = open(os.environ["CP_OWN_IPS_FILE"]).read()',
    ])
      expect(readsListFileDirectly(hit), hit).toBe(true);
    for (const pass of [
      '[[ ! -f "$CP_OWN_IPS_FILE" ]]',
      'OWN="$CP_OWN_IPS_FILE"',
      'CP_OWN_IPS_FILE="$dir/own.txt" bash "$HERE/x.sh"',
      `# awk '!/^#/' "$CP_OWN_IPS_FILE"`,
      'concatenate "$CP_OWN_IPS_FILE"',
    ])
      expect(readsListFileDirectly(pass), pass).toBe(false);
  });

  it("every named exception is a file under ops/ with a reason", () => {
    expect(READER_EXCEPTIONS.length).toBeGreaterThan(0);
    for (const e of READER_EXCEPTIONS) {
      expect(e.path.startsWith("ops/"), e.path).toBe(true);
      expect(existsSync(join(REPO, e.path)), e.path).toBe(true);
      expect(e.reason.trim(), e.path).not.toBe("");
    }
  });
});

