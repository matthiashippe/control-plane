import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every rollout restarts `cp`, and for about 16 seconds Caddy cannot connect to it. Without a retry window Caddy answers 502 at
 * once, and on 2026-11-10 and 2026-11-12 paying automatons got exactly that inside three deploy windows. With `lb_try_duration`
 * Caddy keeps a request whose connection failed and tries again until the new process answers.
 *
 * The runner of `check` has no `caddy` binary, so this reads `deploy/Caddyfile` as text. The behaviour itself is shown by
 * `ops/caddy-retry.sh --selftest` with a real caddy.
 *
 * No `lb_retry_match`: by default Caddy retries only requests whose connection never stood (any method) and a broken answer
 * only for GET. Matching more would buy a broken inference a second time from the provider.
 */
const CADDYFILE = readFileSync(join(__dirname, "..", "deploy", "Caddyfile"), "utf8");
const SELFTEST = readFileSync(join(__dirname, "..", "ops", "caddy-retry.sh"), "utf8");

/** The text between the opening brace of `reverse_proxy <upstream> {` and its matching closing brace. */
function proxyBlock(source: string, upstream: string): string | null {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => l.replace(/#.*/, "").trim() === `reverse_proxy ${upstream} {`);
  if (start < 0) return null;
  let depth = 0;
  const body: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const code = lines[i].replace(/#.*/, "");
    for (const ch of code) {
      if (ch === "{") depth++;
      if (ch === "}") depth--;
    }
    if (i > start) body.push(code);
    if (depth === 0) return body.slice(0, -1).join("\n");
  }
  return null;
}

/** Caddy durations as seconds: `30s`, `250ms`, `1m`, `1m30s`. */
function seconds(value: string): number {
  const units: Record<string, number> = { ms: 0.001, s: 1, m: 60, h: 3600 };
  let total = 0;
  let rest = value;
  const part = /^(\d+(?:\.\d+)?)(ms|s|m|h)/;
  if (!part.test(rest)) return Number.NaN;
  while (rest) {
    const m = part.exec(rest);
    if (!m) return Number.NaN;
    total += Number(m[1]) * units[m[2]];
    rest = rest.slice(m[0].length);
  }
  return total;
}

describe("deploy/Caddyfile holds a request to cp:8402 while the service restarts", () => {
  const block = proxyBlock(CADDYFILE, "cp:8402");

  it("has a reverse_proxy cp:8402 block", () => {
    expect(block).not.toBeNull();
  });

  it("sets lb_try_duration above 0 and at most 30 seconds", () => {
    const m = /^\s*lb_try_duration\s+(\S+)\s*$/m.exec(block ?? "");
    expect(m, "lb_try_duration missing in the reverse_proxy cp:8402 block").not.toBeNull();
    const s = seconds(m![1]);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(30);
  });

  it("sets lb_try_interval so the retries do not spin", () => {
    const m = /^\s*lb_try_interval\s+(\S+)\s*$/m.exec(block ?? "");
    expect(m, "lb_try_interval missing in the reverse_proxy cp:8402 block").not.toBeNull();
    expect(seconds(m![1])).toBeGreaterThan(0);
  });

  it("never retries a request whose connection already stood (no lb_retry_match)", () => {
    expect(CADDYFILE).not.toMatch(/lb_retry_match/);
  });

  it("finds the block in a planted file and misses it where it is absent", () => {
    const planted = "x {\n\treverse_proxy cp:8402 {\n\t\tlb_try_duration 30s\n\t\ttransport http {\n\t\t\tfoo 1s\n\t\t}\n\t}\n}\n";
    expect(proxyBlock(planted, "cp:8402")).toContain("lb_try_duration 30s");
    expect(proxyBlock(planted, "cp:8402")).toContain("foo 1s");
    expect(proxyBlock("x {\n\treverse_proxy other:1 {\n\t}\n}\n", "cp:8402")).toBeNull();
    expect(seconds("30s")).toBe(30);
    expect(seconds("250ms")).toBe(0.25);
    expect(seconds("1m30s")).toBe(90);
    expect(seconds("abc")).toBeNaN();
  });
});

describe("ops/caddy-retry.sh talks to its local caddy without a proxy", () => {
  // The nightly audit runs every check with HTTP_PROXY pointing at a dead port. curl sends even 127.0.0.1 through it unless
  // told not to, and every case would read `got 000`.
  it("passes --noproxy to every curl call", () => {
    const calls = SELFTEST.split("\n").filter((l) => /(^|[\s(])curl\s/.test(l.replace(/#.*/, "")));
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const c of calls) expect(c).toContain("--noproxy '*'");
  });
});
