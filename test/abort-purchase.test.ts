import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ops/abort-purchase.sh sets the provider's activity per UTC day and model against what our ledger
 * and inference_aborts bought, and spreads the gap over the aborts without an answer (abrechnung 04).
 * These tests run it on planted files, without network, in both directions: a gap that must be
 * estimated, a day that must be reported as noise, and a tolerance that would blind it.
 */
const SCRIPT = join(__dirname, "..", "ops", "abort-purchase.sh");

function plant(): { activity: string; rows: string } {
  const dir = mkdtempSync(join(tmpdir(), "abort-purchase-"));
  const activity = join(dir, "activity.json");
  const rows = join(dir, "rows.jsonl");
  writeFileSync(
    activity,
    JSON.stringify({
      data: [
        // 2026-11-20: equal on both sides, split over two endpoints of the same model.
        { date: "2026-11-20", model: "openai/gpt-5-mini", endpoint_id: "e1", usage: 0.004, requests: 1 },
        { date: "2026-11-20", model: "openai/gpt-5-mini", endpoint_id: "e2", usage: 0.006, requests: 1 },
        // 2026-11-21: two aborts without an answer, 300 mc more at the provider.
        { date: "2026-11-21", model: "openai/gpt-5-mini", endpoint_id: "e1", usage: 0.023, requests: 3 },
        // 2026-11-20: no abort, 5000 mc more at the provider.
        { date: "2026-11-20", model: "openai/gpt-5.2", endpoint_id: "e3", usage: 0.25, requests: 2 },
      ],
    }),
  );
  const row = (o: Record<string, unknown>) => JSON.stringify({ provider: "openrouter", ...o });
  writeFileSync(
    rows,
    [
      row({ src: "ledger", at: "2026-11-20T10:00:00.000Z", model: "openai/gpt-5-mini", purchase_mc: 1000 }),
      row({ src: "ledger", at: "2026-11-21T10:00:00.000Z", model: "openai/gpt-5-mini", purchase_mc: 2000 }),
      row({ src: "abort", at: "2026-11-21T11:00:00.000Z", model: "openai/gpt-5-mini", purchase_mc: 0, answered: 0 }),
      row({ src: "abort", at: "2026-11-21T12:00:00.000Z", model: "openai/gpt-5-mini", purchase_mc: 0, answered: 0 }),
      row({ src: "ledger", at: "2026-11-20T10:00:00.000Z", model: "openai/gpt-5.2", purchase_mc: 20000 }),
    ].join("\n") + "\n",
  );
  return { activity, rows };
}

const env = { ...process.env, AP_NOW: "2026-11-23T08:00:00Z", AP_SINCE: "2026-11-10" };

describe("ops/abort-purchase.sh", () => {
  it("estimates 150 mc per abort and reports the noise day from planted files", () => {
    const { activity, rows } = plant();
    const run = spawnSync("bash", [SCRIPT, "--files", activity, rows], { encoding: "utf8", timeout: 60_000, env });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/^\| 2026-11-21 \| openai\/gpt-5-mini \| 2300 \| 2000 \| 300 \| 2 \| 150 \|$/m);
    expect(run.stdout).toMatch(/^\| 2026-11-20 \| openai\/gpt-5-mini \| 1000 \| 1000 \| 0 \| 0 \| - \|$/m);
    expect(run.stdout).toContain("noise 2026-11-20 openai/gpt-5.2: 5000");
    expect(run.stdout).not.toContain("noise 2026-11-20 openai/gpt-5-mini");
    expect(run.stdout).toContain("purchase without sale openai/gpt-5-mini: 300");
  }, 120_000);

  it("subtracts the baseline of the days without abort from the estimate", () => {
    const dir = mkdtempSync(join(tmpdir(), "abort-purchase-baseline-"));
    const activity = join(dir, "activity.json");
    const rows = join(dir, "rows.jsonl");
    // Gaps of 700 and 900 mc on two days without an abort, 1100 mc on a day with one abort without an answer.
    writeFileSync(
      activity,
      JSON.stringify({
        data: [
          { date: "2026-11-20", model: "openai/gpt-5-mini", usage: 0.017 },
          { date: "2026-11-21", model: "openai/gpt-5-mini", usage: 0.019 },
          { date: "2026-11-22", model: "openai/gpt-5-mini", usage: 0.021 },
        ],
      }),
    );
    const row = (o: Record<string, unknown>) => JSON.stringify({ provider: "openrouter", model: "openai/gpt-5-mini", ...o });
    writeFileSync(
      rows,
      [
        row({ src: "ledger", at: "2026-11-20T10:00:00.000Z", purchase_mc: 1000 }),
        row({ src: "ledger", at: "2026-11-21T10:00:00.000Z", purchase_mc: 1000 }),
        row({ src: "ledger", at: "2026-11-22T10:00:00.000Z", purchase_mc: 1000 }),
        row({ src: "abort", at: "2026-11-22T11:00:00.000Z", purchase_mc: 0, answered: 0 }),
      ].join("\n") + "\n",
    );
    const run = spawnSync("bash", [SCRIPT, "--files", activity, rows], { encoding: "utf8", timeout: 60_000, env });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/^baseline openai\/gpt-5-mini: 800$/m);
    expect(run.stdout).toMatch(/^\| 2026-11-22 \| openai\/gpt-5-mini \| 2100 \| 1000 \| 1100 \| 1 \| 300 \|$/m);
    expect(run.stdout).toContain("purchase without sale openai/gpt-5-mini: 300 (");
  }, 120_000);

  it("passes its own selftest without network", () => {
    const run = spawnSync("bash", [SCRIPT, "--selftest"], { encoding: "utf8", timeout: 60_000 });
    expect(run.stdout).toContain("ok   purchase two aborts without answer, 150 per abort");
    expect(run.stdout).toContain("ok   purchase no abort and 5000 mc more is noise");
    expect(run.stdout.trim().split("\n").at(-1)).toBe("ABORT PURCHASE SELFTEST OK");
    expect(run.status).toBe(0);
  }, 120_000);

  it("fails its selftest when the tolerance makes it blind to noise", () => {
    const run = spawnSync("bash", [SCRIPT, "--selftest"], {
      encoding: "utf8",
      timeout: 60_000,
      env: { ...process.env, AP_TOLERANCE_MC: "1000000" },
    });
    expect(run.stdout).toContain("FAIL purchase no abort and 5000 mc more is noise");
    expect(run.stdout.trim().split("\n").at(-1)).toBe("ABORT PURCHASE SELFTEST FAIL");
    expect(run.status).toBe(1);
  }, 120_000);

  it("names a counting killed from outside in its selftest instead of only a wrong number", () => {
    // A node on PATH that SIGKILLs itself on its second call, like a sweep of another runner in the
    // same worktree (audit 2026-11-12, line 84): the selftest must say which counting died and how.
    const dir = mkdtempSync(join(tmpdir(), "abort-purchase-kill-"));
    const fake = join(dir, "node");
    writeFileSync(
      fake,
      [
        "#!/usr/bin/env bash",
        `f="${join(dir, "calls")}"; n=$(( $(cat "$f" 2>/dev/null || echo 0) + 1 )); echo $n >"$f"`,
        'if [ "$n" = 2 ]; then kill -9 $$; fi',
        `exec "${process.execPath}" "$@"`,
      ].join("\n") + "\n",
      { mode: 0o755 },
    );
    const run = spawnSync("bash", [SCRIPT, "--selftest"], {
      encoding: "utf8",
      timeout: 60_000,
      env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ""}` },
    });
    expect(run.stdout).toMatch(/^FAIL purchase counting day later exited 137 \(killed by signal 9, not a result of the counting\)$/m);
    expect(run.stdout).not.toMatch(/^FAIL purchase counting (planted|quiet|drift) /m);
    expect(run.stdout.trim().split("\n").at(-1)).toBe("ABORT PURCHASE SELFTEST FAIL");
    expect(run.status).toBe(1);
  }, 120_000);

  it("stops with exit 2 before any request when the management key is missing", () => {
    const home = mkdtempSync(join(tmpdir(), "abort-purchase-home-"));
    const clean: NodeJS.ProcessEnv = { ...process.env, HOME: home, HTTPS_PROXY: "http://127.0.0.1:9" };
    delete clean.OPENROUTER_MANAGEMENT_KEY;
    const run = spawnSync("bash", [SCRIPT], { encoding: "utf8", timeout: 60_000, env: clean });
    expect(run.stderr + run.stdout).toContain("OPENROUTER_MANAGEMENT_KEY missing");
    expect(run.status).toBe(2);
  }, 120_000);
});
