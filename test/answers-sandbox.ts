import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The shared sandbox of test/answers-folder.test.ts and test/answers-approved.test.ts.
 *
 * Every run happens in a throwaway copy of ops/answers_args.py, ops/before-the-answers.py and ops/post-the-answers.py with `gh`,
 * `curl` and `ssh` replaced by fakes on PATH: no network, no GitHub, and every call the scripts make lands in a log.
 *
 * The fake `gh` remembers the body of every comment it is asked to post and hands it back when that comment is read by its id,
 * the way GitHub would (`gh api --jq .body` prints the body and one newline of its own). FAKE_READBACK lets it answer the read with
 * another text instead, or with a 404 when it is set to `404`. FAKE_COMMENTS (a JSON object id -> body) answers reads of comments
 * that were posted before the run, for --verify-posted.
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
comments = json.loads(os.environ.get("FAKE_COMMENTS", "{}"))
store = os.environ["FAKE_GH_LOG"] + ".posted"
os.makedirs(store, exist_ok=True)
if "-f" in args:
    n = re.search(r"issues/(\\d+)/comments$", path).group(1)
    body = next(a for a in args if a.startswith("body="))[len("body="):]
    cid = str(len(os.listdir(store)) + 1)
    with open(os.path.join(store, cid), "w", encoding="utf-8") as fh:
        fh.write(body)
    print(f"https://github.com/Conway-Research/automaton/issues/{n}#issuecomment-{cid}")
elif m := re.search(r"/issues/comments/(\\d+)$", path):
    readback = os.environ.get("FAKE_READBACK")
    if m.group(1) in comments:
        print(comments[m.group(1)])
    elif readback == "404" or not os.path.isfile(os.path.join(store, m.group(1))):
        print("gh: Not Found (HTTP 404)", file=sys.stderr)
        sys.exit(1)
    elif readback is not None:
        print(readback)
    else:
        with open(os.path.join(store, m.group(1)), encoding="utf-8") as fh:
            print(fh.read())
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

export const GOOD = [
  "<!-- Entwurf, intern -->",
  "The 401 is the retry, not the first answer. The first verify answers 500.",
  "",
  "Disclosure: I run PostYourPrice (https://postyourprice.com), a control plane for this runtime.",
  "",
].join("\n");
export const GOOD_BODY =
  "The 401 is the retry, not the first answer. The first verify answers 500.\n\nDisclosure: I run PostYourPrice (https://postyourprice.com), a control plane for this runtime.\n";
export const NO_DISCLOSURE = "The 401 is the retry. PostYourPrice at https://postyourprice.com works.\n";
export const HEADER = "# <iso8601-utc> <issue> <url>\n";

/** The first 12 hex digits of sha256 over a body, computed here and not by the script under test. */
export const sha12 = (body: string) => createHash("sha256").update(body, "utf8").digest("hex").slice(0, 12);

export type Run = { status: number | null; out: string; calls: string[][]; log: string };

export function sandbox(drafts: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "answers-folder-"));
  mkdirSync(join(root, "ops"));
  mkdirSync(join(root, "bin"));
  for (const f of ["answers_args.py", "before-the-answers.py", "post-the-answers.py"]) copyFileSync(join(OPS, f), join(root, "ops", f));
  writeFileSync(join(root, "ops", "posted-answers.log"), HEADER);
  writeFileSync(join(root, "bin", "gh"), FAKE_GH);
  writeFileSync(join(root, "bin", "curl"), "#!/bin/sh\nexit 7\n");
  writeFileSync(join(root, "bin", "ssh"), "#!/bin/sh\nexit 255\n");
  for (const f of ["gh", "curl", "ssh"]) chmodSync(join(root, "bin", f), 0o755);
  const folder = join(root, "goals", "kanal", "antworten");
  mkdirSync(folder, { recursive: true });
  for (const [name, text] of Object.entries(drafts)) writeFileSync(join(folder, name), text);
  const run = (script: string, args: string[], env: Record<string, string> = {}, opts: { isolated?: boolean; cwd?: string } = {}): Run => {
    const log = join(root, `gh-${Math.random().toString(36).slice(2)}.log`);
    writeFileSync(log, "");
    const python = opts.isolated ? ["-I"] : [];
    const r = spawnSync("python3", [...python, opts.cwd ? join(root, "ops", script) : join("ops", script), ...args], {
      cwd: opts.cwd ?? root,
      encoding: "utf8",
      timeout: 60_000,
      env: { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}`, FAKE_GH_LOG: log, ...env },
    });
    const calls = readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as string[]);
    return { status: r.status, out: `${r.stdout}${r.stderr}`, calls, log: readFileSync(join(root, "ops", "posted-answers.log"), "utf8") };
  };
  const posted = (lines: string[]) =>
    writeFileSync(join(root, "ops", "posted-answers.log"), ["# <iso8601-utc> <issue> <url>", ...lines, ""].join("\n"));
  const write = (name: string, text: string) => writeFileSync(join(folder, name), text);
  return { root, folder, run, posted, write };
}

export const posts = (calls: string[][]) => calls.filter((c) => c.includes("-f"));
