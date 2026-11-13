import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ops/abort-purchase.sh takes the OpenRouter management key only from its own file
 * ~/.config/control-plane/openrouter-management.env (mode 600), never from the environment or from
 * loop.env, which every role loads. These runs use a HOME from mktemp and no network: the key stage
 * either stops with exit 2, or lets the run through to the next stage, which stops without CP_HOST.
 */
const SCRIPT = join(__dirname, "..", "ops", "abort-purchase.sh");
const PLANTED = "planted-management-key-0123456789";

function home(): { home: string; dir: string } {
  const h = mkdtempSync(join(tmpdir(), "abort-purchase-key-"));
  const dir = join(h, ".config", "control-plane");
  mkdirSync(dir, { recursive: true });
  return { home: h, dir };
}

function run(h: string, extra: NodeJS.ProcessEnv = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: h, HTTPS_PROXY: "http://127.0.0.1:9", ...extra };
  for (const k of ["OPENROUTER_MANAGEMENT_KEY", "AP_MANAGEMENT_KEY_FILE", "CP_HOST", "CP_SSH_KEY", "CP_DEPLOY_KEY"]) {
    if (!(k in extra)) delete env[k];
  }
  const r = spawnSync("bash", [SCRIPT], { encoding: "utf8", timeout: 60_000, env });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

describe("abort-purchase management key file", () => {
  it("ignores a key that is only in loop.env", () => {
    const { home: h, dir } = home();
    writeFileSync(join(dir, "loop.env"), `OPENROUTER_MANAGEMENT_KEY=${PLANTED}\n`, { mode: 0o600 });
    const r = run(h);
    expect(r.status).toBe(2);
    expect(r.out).toContain("OPENROUTER_MANAGEMENT_KEY missing");
    expect(r.out).not.toContain(PLANTED);
  });

  it("ignores a key that is only in the environment", () => {
    const { home: h } = home();
    const r = run(h, { OPENROUTER_MANAGEMENT_KEY: PLANTED });
    expect(r.status).toBe(2);
    expect(r.out).toContain("OPENROUTER_MANAGEMENT_KEY missing");
    expect(r.out).not.toContain(PLANTED);
  });

  it("refuses a key file readable by others", () => {
    const { home: h, dir } = home();
    const file = join(dir, "openrouter-management.env");
    writeFileSync(file, `OPENROUTER_MANAGEMENT_KEY=${PLANTED}\n`);
    chmodSync(file, 0o644);
    const r = run(h);
    expect(r.status).toBe(2);
    expect(r.out).toContain("OPENROUTER_MANAGEMENT_KEY missing");
    expect(r.out).not.toContain("CP_HOST and CP_SSH_KEY are not set");
    expect(r.out).not.toContain(PLANTED);
  });

  it("refuses an empty key file", () => {
    const { home: h, dir } = home();
    writeFileSync(join(dir, "openrouter-management.env"), "OPENROUTER_MANAGEMENT_KEY=\n", { mode: 0o600 });
    const r = run(h);
    expect(r.status).toBe(2);
    expect(r.out).toContain("OPENROUTER_MANAGEMENT_KEY missing");
  });

  it("takes a key file with mode 600 past the key stage", () => {
    const { home: h, dir } = home();
    const file = join(dir, "openrouter-management.env");
    writeFileSync(file, `OPENROUTER_MANAGEMENT_KEY=${PLANTED}\n`);
    chmodSync(file, 0o600);
    const r = run(h);
    expect(r.status).toBe(2);
    expect(r.out).toContain("CP_HOST and CP_SSH_KEY are not set");
    expect(r.out).not.toContain("OPENROUTER_MANAGEMENT_KEY missing");
    expect(r.out).not.toContain(PLANTED);
  });

  it("takes the path from AP_MANAGEMENT_KEY_FILE", () => {
    const { home: h } = home();
    const other = join(mkdtempSync(join(tmpdir(), "abort-purchase-key-other-")), "key.env");
    writeFileSync(other, `OPENROUTER_MANAGEMENT_KEY="${PLANTED}"\n`);
    chmodSync(other, 0o600);
    const r = run(h, { AP_MANAGEMENT_KEY_FILE: other });
    expect(r.status).toBe(2);
    expect(r.out).toContain("CP_HOST and CP_SSH_KEY are not set");
    expect(r.out).not.toContain(PLANTED);
  });
});
