import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The sandbox of test/relink-comments.test.ts, after test/answers-sandbox.ts.
 *
 * Every run happens in a throwaway copy of ops/relink_rules.py, ops/relink-comments.py and src/public/error-pages.ts with `gh`,
 * `curl` and `ssh` replaced by fakes on PATH: no network, no port, and every call the tool makes lands in a log.
 *
 * The fake `gh` serves the threads and comments of test/fixtures/relink/threads.json from a state file, stores the body of every
 * PATCH there and hands it back on the next read, the way GitHub would. FAKE_READBACK answers the read of a patched comment with
 * another text instead. FAKE_GH_FAIL makes every call fail like an unreachable GitHub. A call that would create something (method
 * POST, which `gh api` uses by default as soon as a field or an input is given) is logged and fails.
 */
const ROOT = join(__dirname, "..");
export const FIXTURE = JSON.parse(readFileSync(join(__dirname, "fixtures", "relink", "threads.json"), "utf8")) as {
  issues: { number: number; title: string }[];
  comments: { id: number; issue: number; user: string; body: string }[];
};

const FAKE_GH = `#!/usr/bin/env python3
import json, os, re, sys
args = sys.argv[1:]
stdin = sys.stdin.read() if "--input" in args else None
with open(os.environ["FAKE_GH_LOG"], "a", encoding="utf-8") as fh:
    fh.write(json.dumps({"args": args, "stdin": stdin}) + "\\n")
if os.environ.get("FAKE_GH_FAIL"):
    print("gh: error connecting to api.github.com", file=sys.stderr)
    sys.exit(1)
method = args[args.index("-X") + 1] if "-X" in args else ("POST" if {"-f", "-F", "--input", "--field", "--raw-field"} & set(args) else "GET")
path = next(a for a in args[1:] if not a.startswith("-") and a not in ("GET", "PATCH", "POST") and "=" not in a)
state_file = os.environ["FAKE_STATE"]
state = json.load(open(state_file, encoding="utf-8"))
def out(obj):
    print(json.dumps(obj, ensure_ascii=False))
if method == "POST":
    print("gh: the fake refuses to create anything", file=sys.stderr)
    sys.exit(1)
if path == "search/issues":
    q = next(a for a in args if a.startswith("q="))
    login = re.search(r"commenter:(\\S+)", q).group(1)
    have = {c["issue"] for c in state["comments"] if c["user"] == login}
    for i in state["issues"]:
        if i["number"] in have:
            out({"number": i["number"], "title": i["title"]})
elif m := re.fullmatch(r"repos/Conway-Research/automaton/issues/comments/(\\d+)", path):
    c = next((c for c in state["comments"] if str(c["id"]) == m.group(1)), None)
    if c is None:
        print("gh: Not Found (HTTP 404)", file=sys.stderr)
        sys.exit(1)
    if method == "PATCH":
        c["body"] = json.loads(stdin)["body"]
        c["patched"] = True
        json.dump(state, open(state_file, "w", encoding="utf-8"))
        print(c["id"])
    else:
        body = os.environ["FAKE_READBACK"] if c.get("patched") and "FAKE_READBACK" in os.environ else c["body"]
        out({"id": c["id"], "user": c["user"], "body": body,
             "issue_url": f"https://api.github.com/repos/Conway-Research/automaton/issues/{c['issue']}"})
elif m := re.fullmatch(r"repos/Conway-Research/automaton/issues/(\\d+)/comments", path):
    for c in state["comments"]:
        if str(c["issue"]) == m.group(1):
            out({"id": c["id"], "user": c["user"], "body": c["body"]})
elif m := re.fullmatch(r"repos/Conway-Research/automaton/issues/(\\d+)", path):
    out({"title": next(i["title"] for i in state["issues"] if str(i["number"]) == m.group(1))})
else:
    print(f"gh: the fake does not know {path}", file=sys.stderr)
    sys.exit(1)
`;

export const HEADER = readFileSync(join(ROOT, "ops", "relinked-comments.log"), "utf8").replace(/^[^#].*\n/gm, "");

/** The first 12 hex digits of sha256 over a text, computed here and not by the tool under test. */
export const sha12 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 12);

export type Call = { args: string[]; stdin: string | null };
export type Run = { status: number | null; out: string; calls: Call[]; log: string };
type Comment = (typeof FIXTURE.comments)[number] & { patched?: boolean };

export function sandbox(comments: Comment[] = FIXTURE.comments) {
  const root = mkdtempSync(join(tmpdir(), "relink-"));
  for (const d of ["ops", "bin", join("src", "public")]) mkdirSync(join(root, d), { recursive: true });
  for (const f of ["relink_rules.py", "relink-comments.py"]) copyFileSync(join(ROOT, "ops", f), join(root, "ops", f));
  copyFileSync(join(ROOT, "src", "public", "error-pages.ts"), join(root, "src", "public", "error-pages.ts"));
  writeFileSync(join(root, "ops", "relinked-comments.log"), HEADER);
  writeFileSync(join(root, "bin", "gh"), FAKE_GH);
  writeFileSync(join(root, "bin", "curl"), "#!/bin/sh\nexit 7\n");
  writeFileSync(join(root, "bin", "ssh"), "#!/bin/sh\nexit 255\n");
  for (const f of ["gh", "curl", "ssh"]) chmodSync(join(root, "bin", f), 0o755);
  const stateFile = join(root, "state.json");
  writeFileSync(stateFile, JSON.stringify({ issues: FIXTURE.issues, comments }));
  const run = (args: string[], env: Record<string, string> = {}): Run => {
    const log = join(root, `gh-${Math.random().toString(36).slice(2)}.log`);
    writeFileSync(log, "");
    const r = spawnSync("python3", ["-I", join("ops", "relink-comments.py"), ...args], {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
      env: {
        ...process.env,
        PATH: `${join(root, "bin")}:${process.env.PATH}`,
        FAKE_GH_LOG: log,
        FAKE_STATE: stateFile,
        CP_RELINK_GAP_SECONDS: "0",
        ...env,
      },
    });
    const calls = readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Call);
    return { status: r.status, out: `${r.stdout}${r.stderr}`, calls, log: readFileSync(join(root, "ops", "relinked-comments.log"), "utf8") };
  };
  /** The rules of the copy, called directly: relink(body, slug). */
  const relink = (body: string, slug: string | null): string => {
    const r = spawnSync(
      "python3",
      ["-I", "-c", "import json, sys; sys.path.insert(0, 'ops'); from relink_rules import relink; print(json.dumps(relink(sys.argv[1], sys.argv[2] or None)))", body, slug ?? ""],
      { cwd: root, encoding: "utf8", timeout: 60_000 },
    );
    if (r.status !== 0) throw new Error(r.stderr);
    return JSON.parse(r.stdout) as string;
  };
  const state = () => JSON.parse(readFileSync(stateFile, "utf8")) as { comments: Comment[] };
  const setBody = (id: number, body: string) => {
    const s = JSON.parse(readFileSync(stateFile, "utf8"));
    s.comments.find((c: Comment) => c.id === id).body = body;
    writeFileSync(stateFile, JSON.stringify(s));
  };
  return { root, run, relink, state, setBody };
}

/** Every call that writes: a method other than GET, or a field or an input, which makes `gh api` default to POST. */
export const writes = (calls: Call[]) =>
  calls.filter((c) => {
    const x = c.args.indexOf("-X");
    const method = x >= 0 ? c.args[x + 1] : c.args.some((a) => ["-f", "-F", "--input", "--field", "--raw-field"].includes(a)) ? "POST" : "GET";
    return method !== "GET";
  });

export const patches = (calls: Call[]) => calls.filter((c) => c.args.includes("PATCH"));

/** The values the dry run printed, id -> sha12, in its order. */
export const values = (out: string) => new Map([...out.matchAll(/^comment (\d+) issue \d+ page \S+ sha12 ([0-9a-f]{12})$/gm)].map((m) => [m[1], m[2]]));

export const approve = (v: Map<string, string>, ids?: string[]) =>
  (ids ?? [...v.keys()]).map((id) => `${id}:${v.get(id)}`).join(",");
