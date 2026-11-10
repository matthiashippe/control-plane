import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ops/timeout-quote.sh --compare-files CADDY ROWS counts the timeout quote twice over the same
 * period (abrechnung 03): once from the Caddy log joined with the rows ("caddy"), once from the
 * rows alone with their own duration ("service"). Every difference between the two must be
 * explained by exactly one cause, so the causes add up to the deviation, for requests and for
 * timeouts alike. These tests plant files and read the result; no network.
 */
const SCRIPT = join(__dirname, "..", "ops", "timeout-quote.sh");
const dir = mkdtempSync(join(tmpdir(), "tq-compare-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// Documentation address only (RFC 5737).
const CLIENT = "198.51.100.7";
const T0 = 1794330000; // 2026-11-10T17:00:00Z

const iso = (unix: number) => new Date(unix * 1000).toISOString();
/** A Caddy access log line for a chat completion that ended at `end` (unix s) after `duration` s. */
const caddy = (end: number, duration: number, status = 200) =>
  JSON.stringify({ ts: end, request: { client_ip: CLIENT, remote_ip: CLIENT, method: "POST", uri: "/v1/chat/completions" }, duration, status });
/** A ledger row written at `at`, generation started at `start`, with the service's own duration. */
const ledger = (at: number, start: number, model: string, durationMs: number | null) =>
  JSON.stringify({ src: "ledger", at: iso(at), ref: `gen-${start}-planted`, model, duration_ms: durationMs });
const abort = (at: number, model: string, durationMs: number) =>
  JSON.stringify({ src: "abort", at: iso(at), ref: null, model, duration_ms: durationMs });

let n = 0;
function compare(caddyLines: string[], rowLines: string[], env: Record<string, string> = {}) {
  n += 1;
  const c = join(dir, `caddy-${n}.jsonl`);
  const r = join(dir, `rows-${n}.jsonl`);
  writeFileSync(c, caddyLines.join("\n") + "\n");
  writeFileSync(r, rowLines.join("\n") + "\n");
  const run = spawnSync("bash", [SCRIPT, "--compare-files", c, r], {
    encoding: "utf8",
    timeout: 60_000,
    env: { ...process.env, TQ_SINCE: "", TQ_UNTIL: "", ...env },
  });
  return { ...run, out: run.stdout };
}

/** Reads `deviation requests: <n>` and the signed parts of every cause line. */
function balance(out: string) {
  const dev = (what: string) => {
    const m = new RegExp(`^deviation ${what}: (-?\\d+) `, "m").exec(out);
    expect(m, `deviation ${what} line in:\n${out}`).not.toBeNull();
    return Number(m![1]);
  };
  const causes = ["coalesced", "clock", "unmatched"].map((name) => {
    const m = new RegExp(`^cause ${name}: (\\d+) \\(requests (-?\\d+), timeouts (-?\\d+)\\)$`, "m").exec(out);
    expect(m, `cause ${name} line in:\n${out}`).not.toBeNull();
    return { name, n: Number(m![1]), requests: Number(m![2]), timeouts: Number(m![3]) };
  });
  return { requests: dev("requests"), timeouts: dev("timeouts"), causes };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("ops/timeout-quote.sh --compare-files", () => {
  it("counts the same in both measurements when every request has its own row", () => {
    const run = compare(
      [caddy(T0 + 10, 9.0), caddy(T0 + 130, 59.9, 0), caddy(T0 + 200, 2.0)],
      [ledger(T0 + 11, T0 + 1, "openai/gpt-5.2", 8900), abort(T0 + 135, "openai/gpt-5.2", 59800), ledger(T0 + 200, T0 + 198, "openai/gpt-5-mini", 1900)],
    );
    expect(run.status, run.stderr).toBe(0);
    expect(run.out).toContain("| openai/gpt-5.2 | caddy | 2 | 1 | 50.0 % |");
    expect(run.out).toContain("| openai/gpt-5.2 | service | 2 | 1 | 50.0 % |");
    expect(run.out).toContain("| openai/gpt-5-mini | caddy | 1 | 0 | 0.0 % |");
    expect(run.out).toContain("| openai/gpt-5-mini | service | 1 | 0 | 0.0 % |");
    const b = balance(run.out);
    expect(b.requests).toBe(0);
    expect(b.timeouts).toBe(0);
    for (const c of b.causes) expect(c).toMatchObject({ n: 0, requests: 0, timeouts: 0 });
  });

  it("explains a coalesced retry and a clock difference, and the causes add up to the deviation", () => {
    const run = compare(
      [
        // Leader: 59.7 s on Caddy's clock, 58.9 s on the service's clock (the provider call starts later).
        caddy(T0 + 60, 59.7),
        // Retry sent while the leader ran; the coalescer answered it, it has no row of its own.
        caddy(T0 + 60, 20.0),
        caddy(T0 + 300, 3.0),
      ],
      [ledger(T0 + 61, T0 + 1, "openai/gpt-5.2", 58900), ledger(T0 + 300, T0 + 297, "openai/gpt-5-mini", 2800)],
    );
    expect(run.status, run.stderr).toBe(0);
    expect(run.out).toContain("| openai/gpt-5.2 | caddy | 2 | 1 | 50.0 % |");
    expect(run.out).toContain("| openai/gpt-5.2 | service | 1 | 0 | 0.0 % |");
    const b = balance(run.out);
    expect(b.requests).toBe(1);
    expect(b.timeouts).toBe(1);
    expect(b.causes.find((c) => c.name === "coalesced")).toMatchObject({ n: 1, requests: 1, timeouts: 0 });
    expect(b.causes.find((c) => c.name === "clock")).toMatchObject({ n: 1, requests: 0, timeouts: 1 });
    expect(b.causes.find((c) => c.name === "unmatched")).toMatchObject({ n: 0 });
    expect(sum(b.causes.map((c) => c.requests))).toBe(b.requests);
    expect(sum(b.causes.map((c) => c.timeouts))).toBe(b.timeouts);
  });

  it("books unmatched requests and rows with their sign so the sum still equals the deviation", () => {
    const run = compare(
      [caddy(T0 + 10, 9.0), caddy(T0 + 500, 59.9, 0), caddy(T0 + 900, 4.0)],
      [ledger(T0 + 11, T0 + 1, "openai/gpt-5.2", 8900), ledger(T0 + 700, T0 + 640, "openai/gpt-5.2", 59900), ledger(T0 + 701, T0 + 690, "openai/gpt-5.2", 9000)],
    );
    expect(run.status, run.stderr).toBe(0);
    expect(run.out).toContain("| unattributed | caddy | 2 | 1 | 50.0 % |");
    expect(run.out).toContain("| unattributed | service | 0 | 0 | - |");
    const b = balance(run.out);
    expect(b.requests).toBe(0);
    expect(b.timeouts).toBe(0);
    expect(b.causes.find((c) => c.name === "unmatched")).toMatchObject({ n: 4, requests: 0, timeouts: 0 });
    expect(sum(b.causes.map((c) => c.requests))).toBe(b.requests);
    expect(sum(b.causes.map((c) => c.timeouts))).toBe(b.timeouts);
  });

  it("counts a line outside TQ_SINCE and TQ_UNTIL in neither measurement", () => {
    const inside = [caddy(T0 + 10, 9.0)];
    const insideRows = [ledger(T0 + 11, T0 + 1, "openai/gpt-5.2", 8900)];
    const run = compare(
      [caddy(T0 - 3600, 59.9, 0), ...inside, caddy(T0 + 7200, 59.9, 0)],
      [abort(T0 - 3595, "openai/gpt-5.2", 59900), ...insideRows, ledger(T0 + 7300, T0 + 7290, "openai/gpt-5.2", 59900)],
      { TQ_SINCE: iso(T0), TQ_UNTIL: iso(T0 + 3600) },
    );
    expect(run.status, run.stderr).toBe(0);
    expect(run.out).toContain(`period ${iso(T0)} to ${iso(T0 + 3600)}`);
    expect(run.out).toContain("| openai/gpt-5.2 | caddy | 1 | 0 | 0.0 % |");
    expect(run.out).toContain("| openai/gpt-5.2 | service | 1 | 0 | 0.0 % |");
    const b = balance(run.out);
    expect(b.requests).toBe(0);
    expect(b.timeouts).toBe(0);
  });

  it("starts at the first row with a duration when TQ_SINCE is not set", () => {
    const run = compare(
      [caddy(T0 - 600, 59.9, 0), caddy(T0 + 10, 9.0)],
      [ledger(T0 - 593, T0 - 660, "openai/gpt-5.2", null), ledger(T0 + 11, T0 + 1, "openai/gpt-5.2", 8900)],
    );
    expect(run.status, run.stderr).toBe(0);
    expect(run.out).toContain(`period ${iso(T0 + 11)} to`);
    expect(run.out).toContain("| openai/gpt-5.2 | caddy | 1 | 0 | 0.0 % |");
  });

  it("refuses a period it cannot read instead of printing a number", () => {
    const run = compare([caddy(T0 + 10, 9.0)], [ledger(T0 + 11, T0 + 1, "openai/gpt-5.2", 8900)], { TQ_SINCE: "yesterday" });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("TQ_SINCE is no ISO time in UTC");
    expect(run.out).not.toMatch(/^cause /m);
  });
});
