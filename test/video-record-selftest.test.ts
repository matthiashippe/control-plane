import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ops/video-record.sh records the public transcript of a run against the live service, and its guard keeps a key, an address
 * or a secret out of that transcript. Its selftest proves the whole run against stand-ins in both directions, without network
 * and without a port; running it here keeps the guard from breaking unnoticed between recordings (goals/reichweite/04, point 5,
 * after test/live-selftest.test.ts). Neither script changes for this test.
 */
const ROOT = join(__dirname, "..");
const VIDEO_SH = join(ROOT, "ops", "video-record.sh");
const LIVE_SH = join(ROOT, "ops", "automaton-live.sh");

/**
 * The selftest starts a few dozen processes and took 27 s alone on the code-host; under load it takes longer. It runs without
 * blocking the worker, past vitest's fixed 60 s worker RPC timer. Patience, not a threshold: nothing asserts the duration.
 */
const T = 360_000;
const runSelftest = (script: string) =>
  new Promise<{ out: string; status: number | null }>((resolve) => {
    const child = spawn("bash", [script, "--selftest"], { stdio: ["ignore", "pipe", "pipe"], timeout: 300_000 });
    let out = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (out += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (out += chunk));
    child.on("close", (status) => resolve({ out, status }));
  });

const lastLine = (out: string) => out.trimEnd().split("\n").at(-1);

/** The script with its guard replaced by one that lets every line through, the way the check of point 5 does it with sed. */
const withoutGuard = (source: string) => {
  const lines = source.split("\n");
  const start = lines.indexOf("guard() {");
  const end = lines.indexOf("}", start);
  if (start < 0 || end < 0) throw new Error("ops/video-record.sh has no function guard() { ... } any more");
  return [...lines.slice(0, start), "guard() { cat; }", ...lines.slice(end + 1)].join("\n");
};

const modelLine = (file: string) => readFileSync(file, "utf8").split("\n").find((l) => l.startsWith("MODEL_JS="));

describe("ops/video-record.sh", () => {
  it("passes its own selftest without network", async () => {
    const run = await runSelftest(VIDEO_SH);
    expect(run.out).not.toContain("selftest must not reach the network");
    expect(run.out).not.toMatch(/^FAIL /m);
    expect(run.out).toContain("ok   guard ends with: VIDEO RECORD FAIL the output held a key, an address or a secret");
    expect(lastLine(run.out)).toBe("VIDEO RECORD SELFTEST OK");
    expect(run.status).toBe(0);
  }, T);

  it("fails its selftest when guard lets every line through", async () => {
    const dir = mkdtempSync(join(tmpdir(), "video-record-"));
    try {
      mkdirSync(join(dir, "ops"));
      for (const d of ["docs", "src"]) symlinkSync(join(ROOT, d), join(dir, d));
      const copy = join(dir, "ops", "video-record.sh");
      const source = readFileSync(VIDEO_SH, "utf8");
      writeFileSync(copy, withoutGuard(source));
      expect(readFileSync(copy, "utf8")).not.toBe(source);
      const run = await runSelftest(copy);
      expect(run.out).toMatch(/^FAIL guard 'key': withheld=0, expected 1$/m);
      expect(lastLine(run.out)).toBe("VIDEO RECORD SELFTEST FAIL");
      expect(run.status).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, T);

  it("keeps MODEL_JS the same in video-record.sh and automaton-live.sh", () => {
    const a = modelLine(LIVE_SH);
    const b = modelLine(VIDEO_SH);
    expect(a).toBeTruthy();
    expect(a).toMatch(/claude\|anthropic/);
    expect(b).toBe(a);
  });
});
