import { spawn } from "node:child_process";
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
/** The header of ops/named-comments.log, the log of --name --send (goals/reichweite/04). */
export const NAMED_HEADER = readFileSync(join(ROOT, "ops", "named-comments.log"), "utf8").replace(/^[^#].*\n/gm, "");

/** The first 12 hex digits of sha256 over a text, computed here and not by the tool under test. */
export const sha12 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 12);

/**
 * Runs a child asynchronously. A synchronous spawnSync blocks the worker event loop, and vitest 3.2 has a fixed 60 s RPC timer
 * in the worker ("Timeout calling onTaskUpdate"): several blocking calls in one test under load tripped it (audit 2026-11-23).
 * The timeout kills this child only.
 */
const exec = (cmd: string, args: string[], opts: { cwd: string; env?: NodeJS.ProcessEnv }) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
    child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });

export type Call = { args: string[]; stdin: string | null };
export type Run = { status: number | null; out: string; calls: Call[]; log: string; named: string };
type Comment = (typeof FIXTURE.comments)[number] & { patched?: boolean };

export function sandbox(comments: Comment[] = FIXTURE.comments) {
  const root = mkdtempSync(join(tmpdir(), "relink-"));
  for (const d of ["ops", "bin", join("src", "public")]) mkdirSync(join(root, d), { recursive: true });
  for (const f of ["relink_rules.py", "relink-comments.py"]) copyFileSync(join(ROOT, "ops", f), join(root, "ops", f));
  copyFileSync(join(ROOT, "src", "public", "error-pages.ts"), join(root, "src", "public", "error-pages.ts"));
  writeFileSync(join(root, "ops", "relinked-comments.log"), HEADER);
  writeFileSync(join(root, "ops", "named-comments.log"), NAMED_HEADER);
  writeFileSync(join(root, "bin", "gh"), FAKE_GH);
  writeFileSync(join(root, "bin", "curl"), "#!/bin/sh\nexit 7\n");
  writeFileSync(join(root, "bin", "ssh"), "#!/bin/sh\nexit 255\n");
  for (const f of ["gh", "curl", "ssh"]) chmodSync(join(root, "bin", f), 0o755);
  const stateFile = join(root, "state.json");
  writeFileSync(stateFile, JSON.stringify({ issues: FIXTURE.issues, comments }));
  const run = async (args: string[], env: Record<string, string> = {}): Promise<Run> => {
    const log = join(root, `gh-${Math.random().toString(36).slice(2)}.log`);
    writeFileSync(log, "");
    const r = await exec("python3", ["-I", join("ops", "relink-comments.py"), ...args], {
      cwd: root,
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
    return {
      status: r.status,
      out: `${r.stdout}${r.stderr}`,
      calls,
      log: readFileSync(join(root, "ops", "relinked-comments.log"), "utf8"),
      named: readFileSync(join(root, "ops", "named-comments.log"), "utf8"),
    };
  };
  /** The rules of the copy, called directly: relink(body, slug). */
  const relink = async (body: string, slug: string | null): Promise<string> => {
    const r = await exec(
      "python3",
      ["-I", "-c", "import json, sys; sys.path.insert(0, 'ops'); from relink_rules import relink; print(json.dumps(relink(sys.argv[1], sys.argv[2] or None)))", body, slug ?? ""],
      { cwd: root },
    );
    if (r.status !== 0) throw new Error(r.stderr);
    return JSON.parse(r.stdout) as string;
  };
  /** The rules of the copy, called directly: name(body). */
  const name = async (body: string): Promise<string> => {
    const r = await exec(
      "python3",
      ["-I", "-c", "import json, sys; sys.path.insert(0, 'ops'); from relink_rules import name; print(json.dumps(name(sys.argv[1])))", body],
      { cwd: root },
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
  return { root, run, relink, name, state, setBody };
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
