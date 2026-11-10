import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ops/before-the-answers.py and ops/post-the-answers.py used to read only `.scratch/gtm/issue-antworten/`, which is not in the
 * repository, so no goal could put a draft where a reviewer sees it. Both take `--folder <dir in the repo>` now.
 *
 * Every run here happens in a throwaway copy of the two scripts with `gh`, `curl` and `ssh` replaced by fakes on PATH: no network,
 * no GitHub, and every call the scripts make lands in a log. The fake `gh` is how "the dry run posts nothing" is proven, and the
 * `--send 1` case below is the counter-proof that the same log does see a post when one happens.
 */
const OPS = join(__dirname, "..", "ops");

const FAKE_GH = `#!/usr/bin/env python3
import json, os, re, sys
args = sys.argv[1:]
with open(os.environ["FAKE_GH_LOG"], "a", encoding="utf-8") as fh:
    fh.write(json.dumps(args) + "\\n")
path = args[1] if len(args) > 1 else ""
jq = args[args.index("--jq") + 1] if "--jq" in args else ""
answered = set(filter(None, os.environ.get("FAKE_ANSWERED", "").split(",")))
if "-f" in args:
    n = re.search(r"issues/(\\d+)/comments$", path).group(1)
    print(f"https://github.com/Conway-Research/automaton/issues/{n}#issuecomment-1")
elif re.search(r"/issues/\\d+$", path):
    print("open")
elif m := re.search(r"/issues/(\\d+)/comments$", path):
    print("matthiashippe" if m.group(1) in answered else "")
elif "issues/comments?" in path:
    print("0" if "length" in jq else "")
elif path.endswith("/pulls/370"):
    print("open 2026-08-01T00:00:00Z")
elif re.search(r"^repos/[^/]+/[^/]+$", path):
    print("2026-08-26T16:28:14Z")
`;

const GOOD = [
  "<!-- Entwurf, intern -->",
  "The 401 is the retry, not the first answer. The first verify answers 500.",
  "",
  "Disclosure: I run PostYourPrice (https://postyourprice.com), a control plane for this runtime.",
  "",
].join("\n");
const NO_DISCLOSURE = "The 401 is the retry. PostYourPrice at https://postyourprice.com works.\n";

type Run = { status: number | null; out: string; calls: string[][]; log: string };

function sandbox(drafts: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "answers-folder-"));
  mkdirSync(join(root, "ops"));
  mkdirSync(join(root, "bin"));
  for (const f of ["before-the-answers.py", "post-the-answers.py"]) copyFileSync(join(OPS, f), join(root, "ops", f));
  writeFileSync(join(root, "ops", "posted-answers.log"), "# <iso8601-utc> <issue> <url>\n");
  writeFileSync(join(root, "bin", "gh"), FAKE_GH);
  writeFileSync(join(root, "bin", "curl"), "#!/bin/sh\nexit 7\n");
  writeFileSync(join(root, "bin", "ssh"), "#!/bin/sh\nexit 255\n");
  for (const f of ["gh", "curl", "ssh"]) chmodSync(join(root, "bin", f), 0o755);
  const folder = join(root, "goals", "kanal", "antworten");
  mkdirSync(folder, { recursive: true });
  for (const [name, text] of Object.entries(drafts)) writeFileSync(join(folder, name), text);
  const run = (script: string, args: string[], env: Record<string, string> = {}): Run => {
    const log = join(root, `gh-${Math.random().toString(36).slice(2)}.log`);
    writeFileSync(log, "");
    const r = spawnSync("python3", [join("ops", script), ...args], {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
      env: { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}`, FAKE_GH_LOG: log, ...env },
    });
    const calls = readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as string[]);
    return { status: r.status, out: `${r.stdout}${r.stderr}`, calls, log: readFileSync(join(root, "ops", "posted-answers.log"), "utf8") };
  };
  return { root, folder, run };
}

const posts = (calls: string[][]) => calls.filter((c) => c.includes("-f"));

describe("the issue answers take a folder in the repository", () => {
  it("before-the-answers.py checks the drafts in --folder and only there", () => {
    const s = sandbox({ "434.md": GOOD, "README.md": "# not a draft\n" });
    const withFolder = s.run("before-the-answers.py", ["--folder", "goals/kanal/antworten"]);
    expect(withFolder.out).toContain("#434");
    expect(withFolder.out).toContain("1 still to send: #434");
    expect(withFolder.out).toContain("READY");
    expect(withFolder.status).toBe(0);
    const without = s.run("before-the-answers.py", []);
    expect(without.out).toContain("No drafts to check.");
    expect(without.out).not.toContain("#434");
  }, 120_000);

  it("before-the-answers.py stays a gate in --folder: a draft that names the service without a disclosure is NOT READY", () => {
    const s = sandbox({ "430.md": NO_DISCLOSURE });
    const r = s.run("before-the-answers.py", ["--folder", "goals/kanal/antworten"]);
    expect(r.out).toContain("FAILED  carries a disclosure line");
    expect(r.out).toContain("NOT READY");
    expect(r.status).toBe(1);
  }, 120_000);

  it("before-the-answers.py refuses a --folder that is missing or outside the repository instead of finding no drafts", () => {
    const s = sandbox({ "434.md": GOOD });
    const missing = s.run("before-the-answers.py", ["--folder", "goals/kanal/antwort"]);
    expect(missing.out).toContain("REFUSED");
    expect(missing.out).not.toContain("No drafts to check.");
    expect(missing.status).toBe(1);
    const outside = s.run("before-the-answers.py", ["--folder", tmpdir()]);
    expect(outside.out).toContain("REFUSED");
    expect(outside.status).toBe(1);
    const bare = s.run("before-the-answers.py", ["--folder"]);
    expect(bare.out).toContain("REFUSED");
    expect(bare.status).toBe(1);
  }, 120_000);

  it("post-the-answers.py dry run with --folder shows the draft from that folder and posts nothing", () => {
    const s = sandbox({ "434.md": GOOD });
    const r = s.run("post-the-answers.py", ["--folder", "goals/kanal/antworten"]);
    expect(r.out).toContain("DRY RUN. Nothing was sent.");
    expect(r.out).toContain("#434");
    expect(r.out).toContain("opens: The 401 is the retry");
    expect(r.out).toContain("--folder goals/kanal/antworten");
    expect(r.status).toBe(0);
    expect(posts(r.calls)).toEqual([]);
    expect(r.calls.length).toBeGreaterThan(0);
    expect(r.log).toBe("# <iso8601-utc> <issue> <url>\n");
  }, 120_000);

  it("post-the-answers.py --send 1 with --folder posts that draft, which is what the dry run is measured against", () => {
    const s = sandbox({ "434.md": GOOD });
    const r = s.run("post-the-answers.py", ["--folder", "goals/kanal/antworten", "--send", "1"]);
    expect(r.status).toBe(0);
    const sent = posts(r.calls);
    expect(sent.length).toBe(1);
    expect(sent[0][1]).toBe("repos/Conway-Research/automaton/issues/434/comments");
    expect(sent[0].find((a) => a.startsWith("body="))).toBe(
      "body=The 401 is the retry, not the first answer. The first verify answers 500.\n\nDisclosure: I run PostYourPrice (https://postyourprice.com), a control plane for this runtime.\n",
    );
    expect(r.log).toMatch(/\n\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ 434 https:\/\/github\.com\/Conway-Research\/automaton\/issues\/434#issuecomment-1\n$/);
  }, 120_000);

  it("post-the-answers.py refuses to post when the gate on --folder is NOT READY", () => {
    const s = sandbox({ "430.md": NO_DISCLOSURE });
    const r = s.run("post-the-answers.py", ["--folder", "goals/kanal/antworten", "--send", "1"]);
    expect(r.out).toContain("REFUSED");
    expect(r.status).toBe(1);
    expect(posts(r.calls)).toEqual([]);
  }, 120_000);

  it("post-the-answers.py dry run says nothing is pending when every draft in --folder is already answered", () => {
    const s = sandbox({ "434.md": GOOD });
    const r = s.run("post-the-answers.py", ["--folder", "goals/kanal/antworten"], { FAKE_ANSWERED: "434" });
    expect(r.out).toContain("Nothing pending.");
    expect(r.status).toBe(0);
    expect(posts(r.calls)).toEqual([]);
    expect(existsSync(join(s.folder, "none.md"))).toBe(false);
  }, 120_000);
});
