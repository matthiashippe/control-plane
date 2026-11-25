import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ops/agent-probe.sh --week (werbung 04): the line of the week has to pass the gate of the Richtungs-Check, which
 * commits it with its answers in its maintenance PR. The gate accepts in docs/kunden/agenten-probe.md only lines
 * appended after the last one in the format PROBE_LINE without a dash, and under docs/kunden/agenten-probe/ only
 * new files. These cases run the real script with the stand-in ops/fixtures/agent-probe-claude.sh, every file in a
 * temporary directory. No network, no port, no real session. AGENT_PROBE_UNDER_TEST points them at another copy
 * of the script, so each case can be shown red against a script that lacks what it tests.
 */
const REPO = join(__dirname, "..");
const SCRIPT = process.env.AGENT_PROBE_UNDER_TEST ?? join(REPO, "ops/agent-probe.sh");
const FAKE = join(REPO, "ops/fixtures/agent-probe-claude.sh");
const FIXTURES = join(REPO, "ops/fixtures");
// 2026-11-18T11:06:40Z, a Wednesday in ISO week 2026-W47; one week later is 2026-W48, two weeks later 2026-W49.
const W47 = "1795000000";
const W48 = "1795604800";
const W49 = "1796209600";

// Copied word for word from paperclip/lib/loop-gate.mjs of PropertyPilotTech/code-host at commit d1d1f67b (PROBE_LINE,
// agentProbeGrowth and DASHES). No case reads the code-host, so the loop stays checkable without it; a change of the
// gate needs a new copy here.
const PROBE_LINE = /^- \d{4}-W\d{2} \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z model \S.* via (?:sessions|recount)$/;
const DASHES = new RegExp(`[${String.fromCharCode(8211, 8212)}]`);

/** The rule of agentProbeGrowth: every line of `before` stays where it is, each new line is PROBE_LINE without a dash. */
function gateAcceptsProbeLog(before: string, after: string): string[] {
  const lines = (t: string) => {
    const s = String(t ?? "").replace(/\r?\n$/, "");
    return s ? s.split(/\r?\n/) : [];
  };
  const a = lines(before);
  const b = lines(after);
  const at = a.findIndex((l, i) => b[i] !== l);
  if (at >= 0) return [`line ${at + 1} changed or removed`];
  const out: string[] = [];
  for (let n = a.length; n < b.length; n++) {
    if (!PROBE_LINE.test(b[n])) out.push(`new line ${n + 1} is not PROBE_LINE`);
    else if (DASHES.test(b[n])) out.push(`dash in new line ${n + 1}`);
  }
  return out;
}

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function scratch(): string {
  const d = mkdtempSync(join(tmpdir(), "agent-probe-week-test-"));
  dirs.push(d);
  return d;
}

type Run = { status: number | null; stdout: string; stderr: string; out: string; dir: string; record: string };

/** One run of the script with the stand-in; the file of runs, the answers and the record in `dir`. */
function probe(fixture: string | null, env: Record<string, string>, dir: string, args: string[]): Run {
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
      ...(fixture ? { CP_PROBE_ANSWERS: join(FIXTURES, fixture) } : {}),
      CP_PROBE_OUT: join(dir, "p.md"),
      CP_PROBE_ANSWERS_DIR: dir,
      CP_PROBE_RECORD: join(dir, "rec"),
      CP_NOW: W47,
      ...env,
    },
    encoding: "utf8",
    timeout: 60_000,
  });
  const read = (f: string) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : "");
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", out: read("p.md"), dir, record: read("rec") };
}

/** One run with --week, its state directory inside `dir` unless the case names another. */
function week(fixture: string | null, env: Record<string, string> = {}, dir = scratch()): Run {
  return probe(fixture, { CP_PROBE_STATE_DIR: join(dir, "state"), ...env }, dir, ["--week"]);
}

function lastLine(text: string): string {
  const lines = text.split("\n").filter((l) => l.trim());
  return lines[lines.length - 1] ?? "";
}

function newLines(before: string, after: string): string[] {
  expect(after.startsWith(before)).toBe(true);
  return after.slice(before.length).split("\n").filter((l) => l.length > 0);
}

function weekCounts(line: string): string {
  return (line.match(/host [0-5]\/5 card [0-5]\/5 seen [0-5]\/5 old [0-5]\/5 failed [0-5]\/5/) ?? [""])[0];
}

const OLD_W40 =
  "- 2026-W40 2026-10-01T00:00:00Z model x host 0/5 card 0/5 seen 0/5 old 0/5 failed 0/5 answers docs/kunden/agenten-probe/2026-W40.md via sessions";

describe("ops/agent-probe.sh --week through the loop gate", () => {
  it("appends the weekly line on its own line when the log lacks a final newline", () => {
    // A run with sessions.
    const dir = scratch();
    const before = `# Agent probe\n\nText.\n\n${OLD_W40}`;
    writeFileSync(join(dir, "p.md"), before);
    const r = week("agent-probe-strict", {}, dir);
    expect(r.status).toBe(0);
    expect(r.out.startsWith(`${before}\n- 2026-W47 `)).toBe(true);
    expect(gateAcceptsProbeLog(before, r.out)).toEqual([]);
    expect(r.out.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(2);

    // A recount of a week that has an old line and its answers.
    const old = scratch();
    expect(probe("agent-probe-two-hits", {}, old, []).status).toBe(0);
    const oldText = readFileSync(join(old, "p.md"), "utf8").replace(/\n$/, "");
    writeFileSync(join(old, "p.md"), oldText);
    const recount = week(null, {}, old);
    expect(recount.status).toBe(0);
    expect(recount.out.startsWith(`${oldText}\n- 2026-W47 `)).toBe(true);
    expect(lastLine(recount.out)).toMatch(/ via recount$/);
    expect(gateAcceptsProbeLog(oldText, recount.out)).toEqual([]);

    // The carry of a week from the state directory into a file without a final newline.
    const state = join(scratch(), "state");
    expect(week("agent-probe-strict", { CP_PROBE_STATE_DIR: state }).status).toBe(0);
    const carry = scratch();
    writeFileSync(join(carry, "p.md"), "# Agent probe");
    const c = week("agent-probe-strict", { CP_PROBE_STATE_DIR: state }, carry);
    expect(c.status).toBe(0);
    expect(c.record).toBe("");
    expect(c.out).toMatch(/^# Agent probe\n- 2026-W47 [^\n]+ via sessions\n$/);
    expect(gateAcceptsProbeLog("# Agent probe", c.out)).toEqual([]);
  });

  it("appends only after the last line of a log with prose and headings", () => {
    const dir = scratch();
    // Prose, headings, blank lines and blank lines at the end all stay byte for byte.
    const before = `# Agent probe\n\nOne line per week.\n\n## Runs\n\n  indented text\n\n${OLD_W40}\n\n\n`;
    writeFileSync(join(dir, "p.md"), before);
    const r = week("agent-probe-strict", {}, dir);
    expect(r.status).toBe(0);
    const added = newLines(before, r.out);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatch(/^- 2026-W47 .* via sessions$/);
    expect(r.out.endsWith(`${added[0]}\n`)).toBe(true);
    expect(gateAcceptsProbeLog(before, r.out)).toEqual([]);
    // An empty file gets no line break first.
    const empty = scratch();
    writeFileSync(join(empty, "p.md"), "");
    const e = week("agent-probe-strict", {}, empty);
    expect(e.out).toMatch(/^- 2026-W47 [^\n]+\n$/);
    // A later week goes after the line of the earlier one.
    const next = week("agent-probe-two-hits", { CP_NOW: W48 }, dir);
    expect(next.status).toBe(0);
    const more = newLines(r.out, next.out);
    expect(more).toHaveLength(1);
    expect(more[0].startsWith("- 2026-W48 ")).toBe(true);
    expect(gateAcceptsProbeLog(r.out, next.out)).toEqual([]);
  });

  it("writes only lines that the loop gate accepts as PROBE_LINE", () => {
    // The copy of the rule turns red, so a green result below means something.
    expect(gateAcceptsProbeLog("a\nb\n", "a\nb- 2026-W47 x\n")).not.toEqual([]);
    expect(gateAcceptsProbeLog("a\n", `a\n- 2026-W47 2026-11-18T11:06:40Z model x ${String.fromCharCode(8212)} via sessions\n`)).not.toEqual([]);
    expect(gateAcceptsProbeLog("a\n", "a\nfree text\n")).not.toEqual([]);

    const cases: Run[] = [];
    const before = "# Agent probe\n\n";
    for (const fixture of ["agent-probe-strict", "agent-probe-two-hits", "agent-probe-fails", "agent-probe-error"]) {
      const dir = scratch();
      writeFileSync(join(dir, "p.md"), before);
      cases.push(week(fixture, {}, dir));
    }
    // A recount from an old line and its answers.
    const old = scratch();
    probe("agent-probe-two-hits", {}, old, []);
    const oldText = readFileSync(join(old, "p.md"), "utf8");
    const recount = week(null, {}, old);
    expect(gateAcceptsProbeLog(oldText, recount.out)).toEqual([]);
    expect(newLines(oldText, recount.out).every((l) => PROBE_LINE.test(l))).toBe(true);
    for (const r of cases) {
      expect(gateAcceptsProbeLog(before, r.out)).toEqual([]);
      const added = newLines(before, r.out);
      expect(added).toHaveLength(1);
      expect(added[0]).toMatch(PROBE_LINE);
      expect(added[0]).not.toMatch(DASHES);
      expect(r.stdout).not.toMatch(DASHES);
    }
  });

  it("keeps every existing line and answers file when it carries several weeks", () => {
    const state = join(scratch(), "state");
    const a = scratch();
    expect(week("agent-probe-strict", { CP_PROBE_STATE_DIR: state }, a).status).toBe(0);
    expect(week("agent-probe-two-hits", { CP_PROBE_STATE_DIR: state, CP_NOW: W48 }, a).status).toBe(0);
    const b = scratch();
    const before = `# Agent probe\n\nText with a paragraph.\n\n## Runs\n\n${OLD_W40}\n`;
    writeFileSync(join(b, "p.md"), before);
    writeFileSync(join(b, "2026-W47.md"), "keep\n");
    const r = week("agent-probe-strict", { CP_PROBE_STATE_DIR: state, CP_NOW: W49 }, b);
    expect(r.status).toBe(0);
    expect(gateAcceptsProbeLog(before, r.out)).toEqual([]);
    const added = newLines(before, r.out);
    expect(added.map((l) => l.split(" ")[1])).toEqual(["2026-W47", "2026-W48", "2026-W49"]);
    expect(added[0]).toBe(lastLine(readFileSync(join(state, "2026-W47", "line"), "utf8")));
    expect(added[1]).toBe(lastLine(readFileSync(join(state, "2026-W48", "line"), "utf8")));
    // Only the current week asked sessions.
    expect(r.record.split("\n").filter((l) => l.startsWith("cwd="))).toHaveLength(5);
    // The answers file that was there stays; the missing ones are new.
    expect(readFileSync(join(b, "2026-W47.md"), "utf8")).toBe("keep\n");
    expect(readFileSync(join(b, "2026-W48.md"), "utf8")).toBe(readFileSync(join(a, "2026-W48.md"), "utf8"));
    expect(readdirSync(b).filter((f) => /-W\d\d\.md$/.test(f)).sort()).toEqual(["2026-W47.md", "2026-W48.md", "2026-W49.md"]);
    // A second call adds nothing and changes nothing.
    const w49 = readFileSync(join(b, "2026-W49.md"), "utf8");
    const again = week("agent-probe-two-hits", { CP_PROBE_STATE_DIR: state, CP_NOW: W49 }, b);
    expect(again.out).toBe(r.out);
    expect(readFileSync(join(b, "2026-W49.md"), "utf8")).toBe(w49);
    expect(readFileSync(join(b, "2026-W47.md"), "utf8")).toBe("keep\n");
  });

  it("counts an answers file of the week without a line again instead of asking", () => {
    // The answers of a run whose line never reached the file (another worktree, a lost state directory).
    const a = scratch();
    const first = week("agent-probe-two-hits", {}, a);
    expect(first.status).toBe(0);
    const b = scratch();
    mkdirSync(join(b, "fresh-state"));
    const answers = readFileSync(join(a, "2026-W47.md"), "utf8");
    writeFileSync(join(b, "2026-W47.md"), answers);
    writeFileSync(join(b, "p.md"), "# Agent probe\n");
    const r = week("agent-probe-strict", { CP_PROBE_STATE_DIR: join(b, "fresh-state") }, b);
    expect(r.status).toBe(0);
    expect(r.record).toBe("");
    expect(readFileSync(join(b, "2026-W47.md"), "utf8")).toBe(answers);
    // Time from the head of the answers, model the most frequent one, counted by the rules of --week.
    expect(lastLine(r.out)).toBe(
      "- 2026-W47 2026-11-18T11:06:40Z model fixture-main-model host 2/5 card 1/5 seen 0/5 old 1/5 failed 0/5 answers docs/kunden/agenten-probe/2026-W47.md via recount",
    );
    expect(weekCounts(lastLine(r.out))).toBe(weekCounts(lastLine(first.out)));
    expect(lastLine(r.stdout)).toBe(lastLine(r.out));
    expect(gateAcceptsProbeLog("# Agent probe\n", r.out)).toEqual([]);
    expect(readFileSync(join(b, "fresh-state", "2026-W47", "line"), "utf8").trim()).toBe(lastLine(r.out));
    expect(readFileSync(join(b, "fresh-state", "2026-W47", "answers.md"), "utf8")).toBe(answers);
    // A further call prints that line and asks nothing.
    const again = week("agent-probe-strict", { CP_PROBE_STATE_DIR: join(b, "fresh-state") }, b);
    expect(again.record).toBe("");
    expect(again.out).toBe(r.out);
    expect(lastLine(again.stdout)).toBe(lastLine(r.out));
    // On a tie of models the first named one wins.
    const tie = scratch();
    writeFileSync(
      join(tie, "2026-W47.md"),
      [
        "# Agent probe 2026-W47",
        "",
        "Run 2026-11-18T09:00:00Z, one fresh session per question (bash ops/agent-probe.sh --week).",
        ...[1, 2, 3, 4, 5].flatMap((n) => [
          "",
          `## q${n}`,
          "",
          `Question: q${n}`,
          "",
          ...(n === 5 ? ["(failed: the session ended with exit 1)"] : [`Model: ${n % 2 ? "model-b" : "model-a"}`, "", "Wait."]),
        ]),
        "",
      ].join("\n"),
    );
    const t = week("agent-probe-strict", {}, tie);
    expect(t.status).toBe(1);
    expect(t.record).toBe("");
    expect(lastLine(t.out)).toBe(
      "- 2026-W47 2026-11-18T09:00:00Z model model-b host 0/5 card 0/5 seen 0/5 old 0/5 failed 1/5 answers docs/kunden/agenten-probe/2026-W47.md via recount",
    );
  });

  it("refuses to recount an answers file without five questions", () => {
    for (const [text, n] of [
      ["old\n", 0],
      ["# Agent probe 2026-W47\n\n## q1\n\nModel: m\n\nx\n\n## q2\n\nModel: m\n\nx\n\n## q3\n\nModel: m\n\nx\n\n## q4\n\nModel: m\n\nx\n", 4],
    ] as const) {
      const dir = scratch();
      writeFileSync(join(dir, "p.md"), "# Agent probe\n");
      writeFileSync(join(dir, "2026-W47.md"), text);
      const r = week("agent-probe-strict", {}, dir);
      expect(r.status).toBe(1);
      expect(r.record).toBe("");
      expect(r.out).toBe("# Agent probe\n");
      expect(readFileSync(join(dir, "2026-W47.md"), "utf8")).toBe(text);
      expect(r.stderr.split("\n")).toContain(`cannot recount 2026-W47: answers file has ${n} of 5 questions`);
      expect(existsSync(join(dir, "state", "2026-W47", "line"))).toBe(false);
    }
  });
});
