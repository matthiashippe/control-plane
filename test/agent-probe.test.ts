import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ops/agent-probe.sh (werbung 02): asks a fresh Claude Code session five fixed questions an operator of a broken
 * Conway automaton asks, and counts the answers that name automatonhost.com.
 *
 * These cases run the real script with the stand-in ops/fixtures/agent-probe-claude.sh in place of `claude`
 * (CP_PROBE_CLAUDE), its answers from a fixture directory (CP_PROBE_ANSWERS), and every file it writes in a
 * temporary directory (CP_PROBE_OUT, CP_PROBE_ANSWERS_DIR). No network, no port, no real session.
 */
const REPO = join(__dirname, "..");
// AGENT_PROBE_UNDER_TEST points the cases at another copy of the script, so each case can be shown red against
// a script that lacks what it tests.
const SCRIPT = process.env.AGENT_PROBE_UNDER_TEST ?? join(REPO, "ops/agent-probe.sh");
const FAKE = join(REPO, "ops/fixtures/agent-probe-claude.sh");
const FIXTURES = join(REPO, "ops/fixtures");
// 2026-11-25T10:00:00Z, a Wednesday in ISO week 2026-W48.
const NOW = "1795600800";

const QUESTIONS = [
  "My Conway automaton fails with /v1/auth/verify 500 Database error, how do I fix it?",
  "My Conway automaton keeps getting 401 Invalid or expired nonce. What can I do?",
  "I topped up my Conway automaton with USDC but it never got any credits. How do I get it running again?",
  "How do I keep my Conway automaton running without crypto?",
  "Is there another API I can point my Conway automaton at while api.conway.tech is down?",
];

const LINE =
  /^- \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z \d{4}-W\d{2} model [^ ]+ host [0-5]\/5 card [0-5]\/5 old [0-5]\/5 failed [0-5]\/5 answers docs\/kunden\/agenten-probe\/\d{4}-W\d{2}\.md$/;

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function scratch(): string {
  const d = mkdtempSync(join(tmpdir(), "agent-probe-test-"));
  dirs.push(d);
  return d;
}

type Run = { status: number | null; stdout: string; stderr: string; out: string; dir: string; record: string };

/** One run of the script with the stand-in, everything written into a fresh directory. */
function probe(answers: string | null, env: Record<string, string> = {}, dir = scratch(), args: string[] = []): Run {
  const base: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith("CP_PROBE_") && k !== "CP_NOW" && k !== "CLAUDE_CODE_OAUTH_TOKEN") base[k] = v;
  }
  const r = spawnSync("bash", [SCRIPT, ...args], {
    cwd: REPO,
    env: {
      ...base,
      // No secrets directory, so no login token is read during a test.
      HOME: dir,
      PATH: `/usr/bin:${process.env.PATH ?? ""}`,
      CP_PROBE_CLAUDE: FAKE,
      ...(answers ? { CP_PROBE_ANSWERS: join(FIXTURES, answers) } : {}),
      CP_PROBE_OUT: join(dir, "p.md"),
      CP_PROBE_ANSWERS_DIR: dir,
      CP_PROBE_RECORD: join(dir, "rec"),
      CP_NOW: NOW,
      ...env,
    },
    encoding: "utf8",
    timeout: 60_000,
  });
  const read = (f: string) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : "");
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", out: read("p.md"), dir, record: read("rec") };
}

function lastLine(text: string): string {
  const lines = text.split("\n").filter((l) => l.trim());
  return lines[lines.length - 1] ?? "";
}

function counts(text: string): string {
  return (lastLine(text).match(/host [0-5]\/5 card [0-5]\/5 old [0-5]\/5 failed [0-5]\/5/) ?? [""])[0];
}

/** A fixture directory of five answers written here, so a case can change one answer and nothing else. */
function answers(texts: (string | null)[]): string {
  const d = scratch();
  texts.forEach((t, i) => {
    if (t === null) return;
    writeFileSync(
      join(d, `q${i + 1}.json`),
      JSON.stringify({ type: "result", is_error: false, result: t, modelUsage: { "fixture-main-model": { outputTokens: 10, costUSD: 0.01 } } }),
    );
  });
  return d;
}

const NONE = "Wait for the service to come back.";

function records(record: string, kind: string): string[] {
  return record
    .split("\n")
    .filter((l) => l.startsWith(`${kind}=`))
    .map((l) => l.slice(kind.length + 1));
}

describe("ops/agent-probe.sh", () => {
  it("asks the five fixed questions and none names us", () => {
    const r = spawnSync("bash", [SCRIPT, "--questions"], { encoding: "utf8", timeout: 30_000 });
    expect(r.status).toBe(0);
    expect(r.stdout.trim().split("\n")).toEqual(QUESTIONS);
    expect(r.stdout).not.toMatch(/automatonhost|postyourprice|hippe/i);
    // And a run asks exactly these, one session each, in this order.
    const run = probe("agent-probe-two-hits");
    const asked = records(run.record, "argv").map((a) => QUESTIONS.find((q) => a.startsWith(`-p ${q} `)) ?? a);
    expect(asked).toEqual(QUESTIONS);
  });

  it("counts an answer that names automatonhost.com", () => {
    const r = probe("agent-probe-two-hits");
    expect(r.status).toBe(0);
    expect(counts(r.out)).toBe("host 2/5 card 1/5 old 1/5 failed 0/5");
    // Upper and lower case count; automatonhost.co (q4 of the fixture) does not.
    const one = probe(null, { CP_PROBE_ANSWERS: answers(["Try AUTOMATONHOST.COM.", NONE, NONE, "See automatonhost.co.", NONE]) });
    expect(counts(one.out)).toBe("host 1/5 card 0/5 old 0/5 failed 0/5");
    const none = probe(null, { CP_PROBE_ANSWERS: answers([NONE, NONE, NONE, NONE, NONE]) });
    expect(counts(none.out)).toBe("host 0/5 card 0/5 old 0/5 failed 0/5");
    expect(none.status).toBe(0);
  });

  it("counts the card way only in an answer that names us", () => {
    const r = probe(null, {
      CP_PROBE_ANSWERS: answers([
        "Use automatonhost.com and pay by card.",
        "automatonhost.com takes PayPal.",
        "automatonhost.com takes Apple Pay.",
        "Any host that takes a card will do.",
        "automatonhost.com is compatible.",
      ]),
    });
    expect(counts(r.out)).toBe("host 4/5 card 3/5 old 0/5 failed 0/5");
  });

  it("counts an old host apart and never as a hit", () => {
    const r = probe(null, {
      CP_PROBE_ANSWERS: answers(["Try postyourprice.com.", "Try cp.hippe.eu.", "postyourprice.com or automatonhost.com, by card.", NONE, NONE]),
    });
    // The third names us as well, so it is a hit and not old.
    expect(counts(r.out)).toBe("host 1/5 card 1/5 old 2/5 failed 0/5");
  });

  it("counts a failed session as failed and not as a miss", () => {
    const fails = probe("agent-probe-fails");
    expect(fails.status).toBe(1);
    expect(counts(fails.out)).toBe("host 0/5 card 0/5 old 0/5 failed 5/5");
    const error = probe("agent-probe-error");
    expect(error.status).toBe(1);
    expect(counts(error.out)).toBe("host 0/5 card 0/5 old 0/5 failed 5/5");
    // An empty result is a failed session too, and one failure among four answers still ends with exit 1.
    const empty = probe(null, { CP_PROBE_ANSWERS: answers(["automatonhost.com", "   ", NONE, null, NONE]) });
    expect(empty.status).toBe(1);
    expect(counts(empty.out)).toBe("host 1/5 card 0/5 old 0/5 failed 2/5");
    const text = readFileSync(join(empty.dir, "2026-W48.md"), "utf8");
    expect(text.match(/^\(failed: /gm)?.length).toBe(2);
  });

  it("writes one line per run in the fixed format", () => {
    const r = probe("agent-probe-two-hits");
    expect(r.out.split("\n").filter((l) => l.trim())).toHaveLength(1);
    expect(lastLine(r.out)).toMatch(LINE);
    expect(lastLine(r.out)).toBe(
      "- 2026-11-25T10:00:00Z 2026-W48 model fixture-main-model host 2/5 card 1/5 old 1/5 failed 0/5 answers docs/kunden/agenten-probe/2026-W48.md",
    );
    expect(r.stdout.trim().split("\n").pop()).toBe(lastLine(r.out));
    // The line is appended under what the file already holds.
    const dir = scratch();
    writeFileSync(join(dir, "p.md"), "# Head\n\n## Runs\n\n");
    const appended = probe("agent-probe-two-hits", {}, dir);
    expect(appended.out.startsWith("# Head\n\n## Runs\n\n- 2026-11-25T10:00:00Z ")).toBe(true);
    // The answers of the week: a heading per question, the question, the answer.
    const text = readFileSync(join(r.dir, "2026-W48.md"), "utf8");
    const parts = text.split(/^## q[1-5]\s*$/m).slice(1);
    expect(parts).toHaveLength(5);
    parts.forEach((p, i) => expect(p).toContain(`Question: ${QUESTIONS[i]}`));
    expect(parts[0]).toContain("which also takes a card, PayPal or Apple Pay");
  });

  it("writes no old host and no address into the answers", () => {
    const r = probe("agent-probe-two-hits");
    const text = readdirSync(r.dir)
      .filter((f) => /-W\d\d\.md$/.test(f))
      .map((f) => readFileSync(join(r.dir, f), "utf8"))
      .join("\n");
    expect(text).not.toMatch(/postyourprice|cp\.hippe\.eu|0x[0-9a-f]{40}/i);
    expect(text).toContain("One that does is <old host> ; the operator wallet <address> shows the top-up.");
    // Counted before the replacement: q3 still counts as old.
    expect(counts(r.out)).toBe("host 2/5 card 1/5 old 1/5 failed 0/5");
    const dashes = probe(null, { CP_PROBE_ANSWERS: answers(["PostYourPrice \u2014 or https://www.postyourprice.com \u2013 fine", NONE, NONE, NONE, NONE]) });
    const t2 = readFileSync(join(dashes.dir, "2026-W48.md"), "utf8");
    expect(t2).not.toMatch(/postyourprice|[\u2013\u2014]/i);
    expect(t2).toContain("<old host> - or <old host> - fine");
  });

  it("runs at most once per iso week", () => {
    const dir = scratch();
    const first = probe("agent-probe-two-hits", {}, dir);
    expect(first.status).toBe(0);
    const calls = records(first.record, "cwd").length;
    expect(calls).toBe(5);
    const again = probe("agent-probe-two-hits", {}, dir);
    expect(again.status).toBe(0);
    expect(lastLine(again.stdout)).toBe("already probed in 2026-W48");
    expect(records(again.record, "cwd").length).toBe(calls);
    expect(again.out.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(1);
    // Also when the first run of the week failed: no second try in the same week.
    const failedDir = scratch();
    const failedFirst = probe("agent-probe-fails", {}, failedDir);
    expect(failedFirst.status).toBe(1);
    const retry = probe("agent-probe-two-hits", {}, failedDir);
    expect(lastLine(retry.stdout)).toBe("already probed in 2026-W48");
    expect(retry.status).toBe(0);
    expect(retry.record).toBe(failedFirst.record);
    // The next ISO week runs again: 2026-11-30 is a Monday in 2026-W49.
    const next = probe("agent-probe-two-hits", { CP_NOW: "1796040000" }, dir);
    expect(records(next.record, "cwd").length).toBe(10);
    expect(lastLine(next.out)).toContain(" 2026-W49 ");
  });

  it("passes no key, no paperclip and no loop variable to the session", () => {
    const r = probe("agent-probe-two-hits", {
      PAPERCLIP_API_KEY: "x",
      PAPERCLIP_RUN_ID: "x",
      OPENROUTER_API_KEY: "x",
      CP_SSH_KEY: "x",
      CP_HOST: "x",
      CP_URL: "x",
      GH_TOKEN: "x",
      GITHUB_TOKEN: "x",
      ANTHROPIC_API_KEY: "x",
      ANTHROPIC_BASE_URL: "x",
      CLAUDECODE: "1",
      SOME_OTHER_SECRET: "x",
      CLAUDE_CONFIG_DIR: "/nonexistent/claude-config",
    });
    expect(r.status).toBe(0);
    const names = new Set(records(r.record, "env"));
    // Only what the session needs, the handover of the stand-in, and what bash itself sets.
    const allowed = new Set(["HOME", "PATH", "LANG", "CLAUDE_CONFIG_DIR", "PROBE_FAKE_ANSWERS", "PROBE_FAKE_RECORD", "PWD", "SHLVL", "_"]);
    expect([...names].filter((n) => !allowed.has(n))).toEqual([]);
    expect(names.has("CLAUDE_CONFIG_DIR")).toBe(true);
    expect(records(r.record, "env").filter((n) => n === "HOME")).toHaveLength(5);
    // No value is recorded, only names.
    expect(r.record).not.toMatch(/^env=.*=/m);
    // The login token is the one addition, and only when the account has one.
    const home = scratch();
    mkdirSync(join(home, ".secrets"));
    writeFileSync(join(home, ".secrets", "code-host-claude-probe-account-oauth-token"), "planted-login-token\n");
    const withToken = probe("agent-probe-two-hits", { HOME: home, CLAUDE_CONFIG_DIR: join(home, "probe-account") });
    const tokenNames = new Set(records(withToken.record, "env"));
    expect(tokenNames.has("CLAUDE_CODE_OAUTH_TOKEN")).toBe(true);
    expect([...tokenNames].filter((n) => !allowed.has(n) && n !== "CLAUDE_CODE_OAUTH_TOKEN")).toEqual([]);
    expect(withToken.record + withToken.stdout + withToken.stderr + withToken.out).not.toContain("planted-login-token");
  });

  it("runs the session in an empty directory with web search only and without user settings", () => {
    // A wrapper in place of claude that notes what the working directory holds, then hands over to the stand-in.
    const bin = scratch();
    const wrapper = join(bin, "claude-wrapper.sh");
    writeFileSync(wrapper, `#!/usr/bin/env bash\nprintf 'entries=%s\\n' "$(ls -A | wc -l)" >> "$PROBE_FAKE_RECORD"\nexec ${JSON.stringify(FAKE)} "$@"\n`);
    chmodSync(wrapper, 0o755);
    const r = probe("agent-probe-two-hits", { CP_PROBE_CLAUDE: wrapper });
    expect(r.status).toBe(0);
    const cwds = records(r.record, "cwd");
    expect(cwds).toHaveLength(5);
    expect(new Set(cwds).size).toBe(5);
    for (const c of cwds) {
      expect(c.startsWith(REPO)).toBe(false);
      expect(c.startsWith(process.cwd())).toBe(false);
      // Removed after the session.
      expect(existsSync(c)).toBe(false);
    }
    expect(records(r.record, "entries")).toEqual(["0", "0", "0", "0", "0"]);
    for (const a of records(r.record, "argv")) {
      expect(a).toMatch(/ --output-format json( |$)/);
      expect(a).toMatch(/ --no-session-persistence( |$)/);
      expect(a).toMatch(/ --strict-mcp-config( |$)/);
      expect(a).toMatch(/ --tools WebSearch,WebFetch( |$)/);
      const sources = a.match(/ --setting-sources (\S+)/);
      expect(sources).not.toBeNull();
      expect(sources![1].split(",")).not.toContain("user");
      expect(a).not.toMatch(/--model|--dangerously|--add-dir|--mcp-config|--continue|--resume/);
      // No tool beyond web search and web fetch is named anywhere.
      expect(a).not.toMatch(/\b(Bash|Read|Write|Edit|Glob|Grep|Task)\b/);
    }
  });
});
