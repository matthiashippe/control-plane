import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * ops/status.sh reads the topic of the alarm path back only with CP_ALERT_WEBHOOK in its environment, and the ops triage is
 * its regular reader. Step 2 of the skill used to pass only OPENROUTER_API_KEY, so `alarm_path.received` was always `unknown`
 * there. The skill must pass the webhook from secrets.env in the environment of that one call (no export, no argument, the
 * value never printed), treat a red `received` as a finding, two `unknown` in a row as a hint, and keep URL and topic out of
 * STATE.md and loop-run-log.md.
 *
 * The case for step 2 runs the command from the skill itself with `bash -c`: HOME is a fresh directory with a made-up
 * brain/connectors/secrets.env, and ops/status.sh is a fake that records the number of its arguments and both values.
 *
 * TRIAGE_SKILL_UNDER_TEST points the test at another copy of the skill, so the counter-proof can run it against an older one.
 */
const SKILL = process.env.TRIAGE_SKILL_UNDER_TEST
  ? resolve(process.env.TRIAGE_SKILL_UNDER_TEST)
  : join(__dirname, "..", ".claude", "skills", "ops-triage", "SKILL.md");
const MADE_UP_WEBHOOK = "https://alerts.invalid/made-up-topic";

const text = () => readFileSync(SKILL, "utf8");

/** The numbered step `n` of the section "Ablauf", up to the next numbered step or heading. */
function step(n: number): string {
  const lines = text().split("\n");
  const start = lines.findIndex((l) => l.startsWith(`${n}. `));
  if (start < 0) return "";
  let end = lines.findIndex((l, i) => i > start && (/^\d+\. /.test(l) || l.startsWith("#")));
  if (end < 0) end = lines.length;
  return lines.slice(start, end).join("\n");
}

/** The command of step 2: the content of its code block, or its first inline code span when it has none. */
function stepTwoCommand(): string {
  const block = step(2);
  const fenced = /```[a-z]*\n([\s\S]*?)\n\s*```/.exec(block);
  if (fenced) return fenced[1].trim();
  const inline = /`([^`]+)`/.exec(block);
  return inline ? inline[1].trim() : "";
}

/** Bullets and numbered steps with their wrapped continuation lines joined into one line each. */
function items(): string[] {
  const out: string[] = [];
  for (const line of text().split("\n")) {
    if (/^(- |\d+\. )/.test(line)) out.push(line.trim());
    else if (/^\s+\S/.test(line) && out.length) out[out.length - 1] += ` ${line.trim()}`;
    else out.push(line.trim());
  }
  return out.filter(Boolean);
}

describe("the ops triage hands the alarm path to ops/status.sh and reads alarm_path.received", () => {
  it("step 2 hands CP_ALERT_WEBHOOK to ops/status.sh in its environment, not as an argument", () => {
    const command = stepTwoCommand();
    expect(command).toContain("ops/status.sh");

    const home = mkdtempSync(join(tmpdir(), "ops-triage-home-"));
    mkdirSync(join(home, "brain", "connectors"), { recursive: true });
    writeFileSync(
      join(home, "brain", "connectors", "secrets.env"),
      `OTHER=1\nOPENROUTER_API_KEY=test-key\nCP_ALERT_WEBHOOK=${MADE_UP_WEBHOOK}\n`,
    );
    const work = mkdtempSync(join(tmpdir(), "ops-triage-work-"));
    mkdirSync(join(work, "ops"));
    const record = join(work, "record");
    writeFileSync(
      join(work, "ops", "status.sh"),
      [
        "#!/bin/sh",
        `printf 'args=%s\\n' "$#" > "${record}"`,
        `printf 'webhook=%s\\n' "\${CP_ALERT_WEBHOOK-<unset>}" >> "${record}"`,
        `printf 'key=%s\\n' "\${OPENROUTER_API_KEY-<unset>}" >> "${record}"`,
        "echo '{}'",
      ].join("\n") + "\n",
    );
    chmodSync(join(work, "ops", "status.sh"), 0o755);

    const r = spawnSync("bash", ["-c", command], {
      cwd: work,
      encoding: "utf8",
      timeout: 30_000,
      env: { PATH: "/usr/bin:/bin", HOME: home },
    });
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
    expect(existsSync(record), command).toBe(true);
    expect(readFileSync(record, "utf8").split("\n").filter(Boolean)).toEqual([
      "args=0",
      `webhook=${MADE_UP_WEBHOOK}`,
      "key=test-key",
    ]);
    // Nothing but the fake output of ops/status.sh: the value is never printed.
    expect(`${r.stdout}${r.stderr}`).not.toContain("made-up-topic");
  });

  it("step 2 never exports the webhook", () => {
    const skill = text();
    expect(skill).not.toMatch(/export\s+CP_ALERT_WEBHOOK/);
    expect(skill).not.toMatch(/ops\/status\.sh[ \t]+(CP_ALERT_WEBHOOK|\$)/);
    expect(stepTwoCommand()).toMatch(/CP_ALERT_WEBHOOK=\$\(grep '\^CP_ALERT_WEBHOOK=' ~\/brain\/connectors\/secrets\.env \| cut -d= -f2-\) ops\/status\.sh$/);
  });

  it("a red received is a finding and two unknown in a row a hint", () => {
    const all = items();
    const red = all.filter((l) => l.includes("alarm_path.received.status") && l.includes("`red`") && /Befund/.test(l));
    expect(red, "an item that makes a red alarm_path.received.status a finding").toHaveLength(1);
    expect(red[0]).toMatch(/last_delivered/);
    expect(red[0]).toMatch(/last_message/);
    expect(red[0]).toMatch(/last_alive/);
    const unknown = all.filter(
      (l) => l.includes("`unknown`") && /zwei Läufen? in Folge/.test(l) && /Hinweis/.test(l) && l.includes("received"),
    );
    expect(unknown, "an item that makes two unknown in a row a hint").toHaveLength(1);
  });

  it("the run log line names received and nothing names URL or topic", () => {
    expect(step(5)).toContain("loop-run-log.md");
    expect(step(5)).toContain("`received <status>`");
    const rule = items().filter(
      (l) => /URL/.test(l) && /Thema/.test(l) && l.includes("STATE.md") && l.includes("loop-run-log.md") && /\bnie\b/.test(l),
    );
    expect(rule, "a rule that keeps URL and topic out of STATE.md and loop-run-log.md").toHaveLength(1);
    expect(text()).not.toMatch(/https?:\/\//);
  });
});
