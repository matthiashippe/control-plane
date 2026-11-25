import { spawn } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sandbox as relinkSandbox, type Call } from "./relink-sandbox";

/**
 * The sandbox of test/breaker-comments.test.ts, after test/relink-sandbox.ts and on top of it.
 *
 * test/relink-sandbox.ts gives a throwaway copy of ops/relink-comments.py with its rules and a fake `gh` that serves our comments
 * from a state file. Here ops/breaker-comments.sh and ops/card-breaker.sh are copied next to them, and `ssh` and `curl` on PATH
 * are replaced by fakes: no network, no port, and every call lands in a log.
 *
 * The fake `ssh` swallows the script ops/card-breaker.sh sends on stdin and answers with FAKE_BREAKER (a line of
 * ops/card-breaker.sh --container); FAKE_SSH_FAIL makes it fail like an unreachable server. The fake `curl` is Paperclip: it
 * answers the projects, the agents and the issues of a company from a state file, and stores the body of a POST there as a new
 * issue PRO-<n>. It only answers when the header on stdin (`--config -`) carries the key of the sandbox. FAKE_POST_FAIL makes a
 * POST answer 500.
 */
const ROOT = join(__dirname, "..");
export const FIXTURE = JSON.parse(readFileSync(join(__dirname, "fixtures", "breaker-comments", "comments.json"), "utf8")) as {
  comments: { id: number; issue: number; user: string; text: string }[];
  others: { id: number; issue: number; user: string; text: string }[];
};

export const API_KEY = "sandbox-key-never-printed-7f3a";
export const COMPANY = "company-sandbox";
export const PROJECT = "project-control-plane";
export const TECH_LEAD = "agent-tech-lead";
export const TITLE_ON = "control-plane: card breaker on, comments without card";
export const TITLE_OFF = "control-plane: card breaker off, comments with card";
export const BREAKER_ON = "card_refunds_60d 2 shortfall_usd 61.50 breaker on";
export const BREAKER_OFF = "card_refunds_60d 0 shortfall_usd 0.00 breaker off";

const FAKE_SSH = `#!/usr/bin/env python3
import json, os, sys
sys.stdin.read()
with open(os.environ["FAKE_SSH_LOG"], "a", encoding="utf-8") as fh:
    fh.write(json.dumps({"args": sys.argv[1:]}) + "\\n")
if os.environ.get("FAKE_SSH_FAIL"):
    sys.exit(255)
print(os.environ.get("FAKE_BREAKER", ""))
`;

const FAKE_CURL = `#!/usr/bin/env python3
import json, os, re, sys, urllib.parse
args = sys.argv[1:]
config = sys.stdin.read() if "--config" in args and args[args.index("--config") + 1] == "-" else ""
method = args[args.index("-X") + 1] if "-X" in args else "GET"
url = args[-1]
body = None
if "--data-binary" in args:
    ref = args[args.index("--data-binary") + 1]
    body = open(ref[1:], encoding="utf-8").read() if ref.startswith("@") else ref
with open(os.environ["FAKE_CURL_LOG"], "a", encoding="utf-8") as fh:
    fh.write(json.dumps({"args": args, "stdin": config, "body": body}) + "\\n")
def answer(code, obj):
    sys.stdout.write(json.dumps(obj) + "\\n" + str(code))
    sys.exit(0)
if 'header = "Authorization: Bearer ' + os.environ["FAKE_API_KEY"] + '"' not in config:
    answer(401, {"error": "unauthorized"})
parsed = urllib.parse.urlparse(url)
query = urllib.parse.parse_qs(parsed.query)
state_file = os.environ["FAKE_PC_STATE"]
state = json.load(open(state_file, encoding="utf-8"))
company = os.environ["FAKE_COMPANY"]
path = parsed.path
if path == f"/api/companies/{company}/projects" and method == "GET":
    answer(200, state["projects"])
if path == f"/api/companies/{company}/agents" and method == "GET":
    answer(200, state["agents"])
if path == f"/api/companies/{company}/issues" and method == "GET":
    items = state["issues"]
    if "projectId" in query:
        items = [i for i in items if i["projectId"] == query["projectId"][0]]
    if "status" in query:
        items = [i for i in items if i["status"] in query["status"][0].split(",")]
    answer(200, items)
if path == f"/api/companies/{company}/issues" and method == "POST":
    if os.environ.get("FAKE_POST_FAIL"):
        answer(500, {"error": "the fake refuses"})
    issue = json.loads(body)
    issue["identifier"] = f"PRO-{100 + len(state['issues'])}"
    state["issues"].append(issue)
    json.dump(state, open(state_file, "w", encoding="utf-8"))
    answer(201, issue)
answer(404, {"error": f"the fake does not know {method} {path}"})
`;

/** Runs a child asynchronously; see test/relink-sandbox.ts for why not spawnSync. */
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

/** LEAD and LEAD_NO_CARD out of ops/relink_rules.py, read by python3 -I, so a change of the sentence reaches the tests. */
export async function leads(): Promise<{ LEAD: string; LEAD_NO_CARD: string }> {
  const r = await exec(
    "python3",
    ["-I", "-c", "import json, sys; sys.path.insert(0, 'ops'); import relink_rules as r; print(json.dumps({'LEAD': r.LEAD, 'LEAD_NO_CARD': r.LEAD_NO_CARD}))"],
    { cwd: ROOT },
  );
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}

export type Issue = { title: string; status: string; projectId: string; identifier?: string; description?: string; assigneeAgentId?: string };
export type CurlCall = { args: string[]; stdin: string; body: string | null };
export type Run = {
  status: number | null;
  out: string;
  last: string;
  gh: Call[];
  ssh: { args: string[] }[];
  curl: CurlCall[];
  posts: Issue[];
  state: string | null;
};

/**
 * A sandbox whose comments open with `lead` and a blank line (one of LEAD or LEAD_NO_CARD); `stored` is the content of the state
 * file, or null for no file.
 */
export function sandbox(lead: string, opts: { stored?: string | null; issues?: Issue[] } = {}) {
  const comments = [...FIXTURE.comments.map((c) => ({ ...c, body: `${lead}\n\n${c.text}` })), ...FIXTURE.others.map((c) => ({ ...c, body: c.text }))].map(
    ({ text: _text, ...c }) => c,
  );
  const s = relinkSandbox(comments);
  for (const f of ["breaker-comments.sh", "card-breaker.sh"]) copyFileSync(join(ROOT, "ops", f), join(s.root, "ops", f));
  writeFileSync(join(s.root, "bin", "ssh"), FAKE_SSH);
  writeFileSync(join(s.root, "bin", "curl"), FAKE_CURL);
  for (const f of ["ssh", "curl"]) chmodSync(join(s.root, "bin", f), 0o755);
  const stateDir = mkdtempSync(join(tmpdir(), "breaker-comments-state-"));
  const stateFile = join(stateDir, "card-breaker-comments");
  if (opts.stored != null) writeFileSync(stateFile, `${opts.stored}\n`);
  const pcState = join(s.root, "paperclip.json");
  writeFileSync(
    pcState,
    JSON.stringify({
      projects: [
        { id: "project-other", name: "Other" },
        { id: PROJECT, name: "Control Plane" },
      ],
      agents: [
        { id: "agent-engineer", urlKey: "engineer-cp" },
        { id: TECH_LEAD, urlKey: "tech-lead" },
      ],
      issues: opts.issues ?? [],
    }),
  );
  const read = (f: string) => (existsSync(f) ? readFileSync(f, "utf8") : "");
  const lines = <T>(f: string) => read(f).split("\n").filter(Boolean).map((l) => JSON.parse(l) as T);
  const run = async (args: string[], env: Record<string, string> = {}): Promise<Run> => {
    const tag = Math.random().toString(36).slice(2);
    const logs = { gh: join(s.root, `gh-${tag}.log`), ssh: join(s.root, `ssh-${tag}.log`), curl: join(s.root, `curl-${tag}.log`) };
    const before = (JSON.parse(readFileSync(pcState, "utf8")).issues as Issue[]).length;
    const r = await exec("bash", [join("ops", "breaker-comments.sh"), ...args], {
      cwd: s.root,
      env: {
        HOME: s.root,
        LANG: "C.UTF-8",
        PATH: `${join(s.root, "bin")}:${process.env.PATH}`,
        TMPDIR: tmpdir(),
        CP_STATE_DIR: stateDir,
        CP_DEPLOY_HOST: "server.invalid",
        CP_DEPLOY_KEY: join(s.root, "no-key"),
        PAPERCLIP_API_URL: "http://paperclip.invalid",
        PAPERCLIP_API_KEY: API_KEY,
        PAPERCLIP_COMPANY_ID: COMPANY,
        FAKE_GH_LOG: logs.gh,
        FAKE_STATE: join(s.root, "state.json"),
        FAKE_SSH_LOG: logs.ssh,
        FAKE_CURL_LOG: logs.curl,
        FAKE_PC_STATE: pcState,
        FAKE_API_KEY: API_KEY,
        FAKE_COMPANY: COMPANY,
        CP_RELINK_GAP_SECONDS: "0",
        ...env,
      },
    });
    const out = `${r.stdout}${r.stderr}`;
    const stdoutLines = r.stdout.split("\n").filter(Boolean);
    return {
      status: r.status,
      out,
      last: stdoutLines[stdoutLines.length - 1] ?? "",
      gh: lines<Call>(logs.gh),
      ssh: lines<{ args: string[] }>(logs.ssh),
      curl: lines<CurlCall>(logs.curl),
      posts: (JSON.parse(readFileSync(pcState, "utf8")).issues as Issue[]).slice(before),
      state: existsSync(stateFile) ? readFileSync(stateFile, "utf8") : null,
    };
  };
  /** Replaces the comments of the fake GitHub, e.g. after the Maker sent the approved texts. */
  const setLead = (next: string) => {
    for (const c of FIXTURE.comments) s.setBody(c.id, `${next}\n\n${c.text}`);
  };
  return { root: s.root, stateDir, stateFile, run, setLead };
}
