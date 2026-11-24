import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The block `-- Agent fetches --` of ops/traffic.sh (werbung 02): requests by agents that fetch a page for a
 * person (Claude-User, ChatGPT-User, Perplexity-User, MistralAI-User, DuckAssistBot), per name, with our own
 * addresses counted apart.
 *
 * These cases run the real script with a planted log (CP_TRAFFIC_LOG, ops/fixtures/traffic-agent-fetchers.log),
 * a fixed clock (CP_NOW), a fixed page list (CP_PAGES, so no sitemap is fetched) and a directory first on PATH
 * that holds a fake `ssh` (exit 255) and a fake `curl` that answers nothing, as in test/traffic-hosts.test.ts.
 * No network, no port, documentation addresses only.
 */
const REPO = join(__dirname, "..");
// TRAFFIC_UNDER_TEST points the cases at another copy of the script (with ops/ beside it), so each case can be
// shown red against a script that lacks what it tests.
const SCRIPT = process.env.TRAFFIC_UNDER_TEST ?? join(REPO, "ops/traffic.sh");
const FIXTURE = join(REPO, "ops/fixtures/traffic-agent-fetchers.log");
// 2026-11-20T12:00:00Z
const NOW = "1795176000";
const OUR_ADDRESS = "198.51.100.7";

type Run = { status: number | null; stdout: string; stderr: string };

function run(args: string[], env: Record<string, string> = {}, log = FIXTURE): Run {
  const root = mkdtempSync(join(tmpdir(), "traffic-agents-"));
  try {
    const bin = join(root, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "ssh"), "#!/bin/sh\nexit 255\n");
    writeFileSync(join(bin, "curl"), "#!/bin/sh\nexit 0\n");
    chmodSync(join(bin, "ssh"), 0o755);
    chmodSync(join(bin, "curl"), 0o755);
    const base: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined && k !== "CP_URL" && k !== "CP_OWN_HOSTS" && k !== "CP_OWN_IPS" && k !== "CP_PAGES") base[k] = v;
    }
    const r = spawnSync("bash", [SCRIPT, ...args], {
      env: {
        ...base,
        PATH: `${bin}:/usr/bin:${process.env.PATH ?? ""}`,
        HOME: root,
        CP_OWN_IPS_SEEN: join(root, "seen.txt"),
        CP_SSH_KEY: join(root, "no-key"),
        CP_TRAFFIC_LOG: log,
        CP_NOW: NOW,
        CP_PAGES: "/ /katalog /check /fix /post",
        CP_OWN_IPS: OUR_ADDRESS,
        ...env,
      },
      encoding: "utf8",
      timeout: 60_000,
    });
    return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** The lines of the agent block, from its heading to the blank line after it. */
function block(stdout: string): string[] {
  const lines = stdout.split("\n");
  const start = lines.indexOf("-- Agent fetches --");
  if (start < 0) return [];
  const end = lines.indexOf("", start);
  return lines.slice(start, end < 0 ? undefined : end);
}

const logDirs: string[] = [];
afterAll(() => {
  for (const d of logDirs) rmSync(d, { recursive: true, force: true });
});

/** A log holding only the fixture lines the filter keeps, optionally rewritten. */
function only(keep: (r: { ip: string; ua: string }) => boolean, rewrite: (line: string) => string = (l) => l): string {
  const dir = mkdtempSync(join(tmpdir(), "traffic-agents-log-"));
  logDirs.push(dir);
  const path = join(dir, "access.log");
  const lines = readFileSync(FIXTURE, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .filter((l) => {
      const r = JSON.parse(l).request;
      return keep({ ip: r.remote_ip, ua: (r.headers["User-Agent"] ?? [""])[0] });
    })
    .map(rewrite);
  writeFileSync(path, lines.join("\n") + "\n");
  return path;
}

function zeroBlock(hours = "168"): string[] {
  return [
    "-- Agent fetches --",
    `   0 agent fetch(es) in the last ${hours} hours, 0 from our own addresses`,
    "      0  Claude-User",
    "      0  ChatGPT-User",
    "      0  Perplexity-User",
    "      0  MistralAI-User",
    "      0  DuckAssistBot",
  ];
}

const ADDRESS = /([0-9]{1,3}\.){3}[0-9]{1,3}|[0-9a-fA-F]{1,4}(:[0-9a-fA-F]{1,4}){3,}|[0-9a-fA-F]{1,4}::[0-9a-fA-F]{1,4}|0x[0-9a-fA-F]{40}/;

describe("ops/traffic.sh agent fetches", () => {
  it("counts fetches by agents acting for a person per name", () => {
    const r = run(["168"]);
    expect(r.status).toBe(0);
    expect(block(r.stdout)).toEqual([
      "-- Agent fetches --",
      "   6 agent fetch(es) in the last 168 hours, 1 from our own addresses",
      "      3  Claude-User",
      "      1  ChatGPT-User",
      "      1  Perplexity-User",
      "      1  MistralAI-User",
      "      0  DuckAssistBot",
    ]);
    // The Claude-User fetch 200 hours ago lies outside the window and joins with a wider one.
    expect(block(run(["201"]).stdout)[2]).toBe("      4  Claude-User");
    // A name counts in any case and only as a word: DuckAssistBot in lower case counts, a longer name does not.
    const duck = only(
      (r) => r.ua.includes("MistralAI-User"),
      (l) => l.replace("MistralAI-User/1.0", "duckassistbot/1.1"),
    );
    expect(block(run(["168"], {}, duck).stdout)[6]).toBe("      1  DuckAssistBot");
    const longer = only(
      (r) => r.ua.includes("MistralAI-User"),
      (l) => l.replace("MistralAI-User/1.0", "MistralAI-UserAgentScanner/1.0"),
    );
    expect(block(run(["168"], {}, longer).stdout)).toEqual(zeroBlock());
  }, 90_000);

  it("keeps fetches from our own addresses apart", () => {
    const ours = only((r) => r.ip === OUR_ADDRESS);
    const lines = block(run(["168"], {}, ours).stdout);
    expect(lines[1]).toBe("   1 agent fetch(es) in the last 168 hours, 1 from our own addresses");
    expect(lines[2]).toBe("      1  Claude-User");
    // The same address, not ours this time: still counted, no longer apart. So the 1 above is the filter.
    const stranger = block(run(["168"], { CP_OWN_IPS: "192.0.2.250" }, ours).stdout);
    expect(stranger[1]).toBe("   1 agent fetch(es) in the last 168 hours, 0 from our own addresses");
    // An address that sent our checker user agent elsewhere in the log is ours as well.
    const withChecker = `${readFileSync(ours, "utf8")}${readFileSync(ours, "utf8").replace(/"User-Agent": \["[^"]*"\]/, '"User-Agent": ["control-plane-check/1.0"]')}`;
    writeFileSync(ours, withChecker);
    const checker = block(run(["168"], { CP_OWN_IPS: "192.0.2.250" }, ours).stdout);
    expect(checker[1]).toBe("   1 agent fetch(es) in the last 168 hours, 1 from our own addresses");
  }, 90_000);

  it("does not count a crawler such as ClaudeBot or GPTBot as an agent", () => {
    const crawlers = only((r) => /ClaudeBot|GPTBot|OAI-SearchBot|PerplexityBot/.test(r.ua));
    expect(block(run(["168"], {}, crawlers).stdout)).toEqual(zeroBlock());
    // A crawler mark wins even beside an agent name.
    const both = only(
      (r) => r.ua.includes("GPTBot"),
      (l) => l.replace("GPTBot/1.2", "GPTBot/1.2; ChatGPT-User/1.0"),
    );
    expect(block(run(["168"], {}, both).stdout)).toEqual(zeroBlock());
    // The same lines with an agent name instead of the crawler mark are counted, so the zero is the filter.
    const renamed = only(
      (r) => /ClaudeBot|GPTBot|OAI-SearchBot|PerplexityBot/.test(r.ua),
      // Every mark goes, the one in the bot's own URL too, since a mark in any case keeps a request out.
      (l) => l.replace(/ClaudeBot|GPTBot|OAI-SearchBot|PerplexityBot/gi, "Claude-User"),
    );
    expect(block(run(["168"], {}, renamed).stdout)[2]).toBe("      4  Claude-User");
  }, 90_000);

  it("does not count a name that only stands in the referer", () => {
    const referer = only((r) => r.ip === "192.0.2.40");
    expect(readFileSync(referer, "utf8")).toMatch(/Claude-User/);
    expect(block(run(["168"], {}, referer).stdout)).toEqual(zeroBlock());
    // The same request with the name in its user agent counts.
    const inAgent = only(
      (r) => r.ip === "192.0.2.40",
      (l) => l.replace("Firefox/140.0", "Firefox/140.0 ChatGPT-User/1.0"),
    );
    expect(block(run(["168"], {}, inAgent).stdout)[3]).toBe("      1  ChatGPT-User");
  }, 90_000);

  it("prints every name of the list even at zero", () => {
    const people = only((r) => r.ua.includes("Firefox"));
    const r = run(["24"], {}, people);
    expect(r.status).toBe(0);
    expect(block(r.stdout)).toEqual(zeroBlock("24"));
  }, 90_000);

  it("prints no address in the agent block", () => {
    const r = run(["168"]);
    const lines = block(r.stdout);
    expect(lines.length).toBe(7);
    for (const l of lines) expect(l).not.toMatch(ADDRESS);
    // It stands before every section that prints an address, and the full report still prints its sections.
    const at = r.stdout.indexOf("-- Agent fetches --");
    expect(at).toBeGreaterThan(r.stdout.indexOf("-- Arrivals per host --"));
    for (const later of ["-- Who of them behaved like a person, over the whole log --", "-- First request per foreign IP (this is where the referrer is) --"]) {
      expect(r.stdout.indexOf(later)).toBeGreaterThan(at);
    }
    // The funnel for ops/check-all.sh stays as it was.
    expect(run(["--funnel", "168"]).stdout).not.toContain("-- Agent fetches --");
  }, 90_000);
});

/**
 * --agents (werbung 03): only the block `-- Agent fetches --`, for the weekly run, counted as in the full report.
 * Red against the script of werbung 02, which reads --agents as the window.
 */
describe("ops/traffic.sh --agents", () => {
  it("prints only the agent block with --agents", () => {
    const r = run(["--agents", "168"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(
      [
        "-- Agent fetches --",
        "   6 agent fetch(es) in the last 168 hours, 1 from our own addresses",
        "      3  Claude-User",
        "      1  ChatGPT-User",
        "      1  Perplexity-User",
        "      1  MistralAI-User",
        "      0  DuckAssistBot",
        "",
        "",
      ].join("\n"),
    );
    expect(r.stdout).not.toMatch(ADDRESS);
    // Without a window it takes the window of the full report, 24 hours.
    expect(run(["--agents"]).stdout.split("\n")[1]).toMatch(/ in the last 24 hours, /);
  }, 90_000);

  it("finishes --agents on the fixture log within 20 seconds", () => {
    const started = Date.now();
    const r = run(["--agents", "168"]);
    const seconds = (Date.now() - started) / 1000;
    expect(r.status).toBe(0);
    expect(block(r.stdout)).toHaveLength(7);
    expect(seconds).toBeLessThan(20);
  }, 90_000);

  it("counts the same with --agents as in the full report", () => {
    const ours = only((r) => r.ip === OUR_ADDRESS);
    const cases: [string, Record<string, string>, string | undefined][] = [
      ["168", {}, undefined],
      ["201", {}, undefined],
      ["24", {}, undefined],
      ["168", { CP_OWN_IPS: "192.0.2.250" }, undefined],
      ["168", {}, ours],
    ];
    for (const [hours, env, log] of cases) {
      const full = block(run([hours], env, log).stdout);
      expect(full.length).toBe(7);
      expect(block(run(["--agents", hours], env, log).stdout)).toEqual(full);
    }
  }, 180_000);
});
