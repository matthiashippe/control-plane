import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { join } from "node:path";

const SETUP_SH = join(__dirname, "..", "ops", "sandbox", "setup.sh");

/**
 * ops/sandbox/setup.sh sets up the sandbox host; its selftest proves the image pin and the client key reset against fakes,
 * without network. Without this test only the nightly audit ran it, after the merge, so a goal that labeled the pin
 * sandboxd=1 (the next prune deletes the image, every create answers 501) or broke the reset reached dev unnoticed.
 * The selftest took 9 to 16 s on the code-host and starts dozens of processes; spawn keeps the vitest worker free while it
 * runs. Patience, not a threshold: nothing asserts the duration.
 */
const runSelftest = () =>
  new Promise<{ stdout: string; status: number | null }>((resolve) => {
    const child = spawn("bash", [SETUP_SH, "--selftest"], { stdio: ["ignore", "pipe", "ignore"], timeout: 240_000 });
    let stdout = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.on("close", (status) => resolve({ stdout, status }));
  });

const IMAGE_PIN_CASES = ["desired", "fresh", "rebuild", "again"];
const CLIENT_KEY_RESET_CASES = ["moved", "again", "reinstall", "foreign", "unknown", "no-timer", "ours", "restore", "keep", "late"];

describe("ops/sandbox/setup.sh", () => {
  it("passes its own selftest without network, every case by name", async () => {
    const run = await runSelftest();
    const lines = run.stdout.split("\n").filter((line) => line !== "");
    const missing = [
      ...IMAGE_PIN_CASES.map((c) => `selftest image-pin: ok (${c})`),
      ...CLIENT_KEY_RESET_CASES.map((c) => `selftest client-key-reset: ok (${c})`),
    ].filter((want) => !lines.includes(want));
    expect(missing, run.stdout).toEqual([]);
    expect(lines.filter((line) => / FAIL/.test(line)), run.stdout).toEqual([]);
    expect(lines.at(-1), run.stdout).toBe("SETUP SELFTEST OK");
    expect(run.status, run.stdout).toBe(0);
  }, 300_000);
});
