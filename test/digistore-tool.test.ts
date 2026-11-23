import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ops/digistore.mjs and ops/digistore-release.mjs write into a Digistore24 account that other projects share, and both
 * refuse to write to a product that is not ours (goals/wache/02). Their selftests prove that against a fake account,
 * without network; these cases run them in every check, and in both directions: the tools as they are pass, and a copy
 * whose write gate is switched off must fail. The tools themselves stay untouched.
 */
const OPS = join(__dirname, "..", "ops");
const TOOLS = ["digistore.mjs", "digistore-release.mjs"];

function selftest(dir: string, tool: string) {
  const run = spawnSync(process.execPath, [join(dir, tool), "--selftest"], { encoding: "utf8", timeout: 60_000 });
  return { status: run.status, last: (run.stdout ?? "").trim().split("\n").at(-1) ?? "", stderr: run.stderr };
}

/** Copies both tools into a fresh directory and replaces `from` by `to` in one of them, exactly once. */
function copyWithout(tool: string, from: string, to: string): string {
  const dir = join(mkdtempSync(join(tmpdir(), "digistore-tool-")), "ops");
  mkdirSync(dir);
  for (const t of TOOLS) copyFileSync(join(OPS, t), join(dir, t));
  const file = join(dir, tool);
  const text = readFileSync(file, "utf8");
  // If the line moved or changed, this case must fail instead of passing on an unchanged copy.
  expect(text.split(from).length - 1).toBe(1);
  writeFileSync(file, text.replace(from, to));
  return dir;
}

describe("the selftests of the digistore24 tools", () => {
  it("passes the selftest of ops/digistore.mjs without network", () => {
    const run = selftest(OPS, "digistore.mjs");
    expect(run.last).toBe("SELFTEST OK");
    expect(run.status).toBe(0);
  }, 120_000);

  it("fails the selftest of ops/digistore.mjs once the write gate lets a protected product through", () => {
    const dir = copyWithout("digistore.mjs", "if (PROTECTED.has(id)) throw", "if (false) throw");
    try {
      const run = selftest(dir, "digistore.mjs");
      expect(run.last).toMatch(/^SELFTEST FAILED/);
      expect(run.status).toBe(1);
    } finally {
      rmSync(join(dir, ".."), { recursive: true, force: true });
    }
  }, 120_000);

  it("passes the selftest of ops/digistore-release.mjs without network", () => {
    const run = selftest(OPS, "digistore-release.mjs");
    expect(run.last).toBe("SELFTEST OK");
    expect(run.status).toBe(0);
  }, 120_000);

  it("fails the selftest of ops/digistore-release.mjs once assertOwn lets a foreign product through", () => {
    const dir = copyWithout("digistore-release.mjs", "if (!own.includes(String(id))) throw", "if (false) throw");
    try {
      const run = selftest(dir, "digistore-release.mjs");
      expect(run.last).toMatch(/^SELFTEST FAILED/);
      expect(run.status).toBe(1);
    } finally {
      rmSync(join(dir, ".."), { recursive: true, force: true });
    }
  }, 120_000);
});
