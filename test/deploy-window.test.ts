import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ops/deploy-window.sh counts what strangers got in the window around a rollout. `deploy.yml` prints its output into the
 * public logs of a public repository, so no line may name an address. `--at` measures a past window, `--log` reads the access
 * log from a file and asks nothing over ssh, and the line `BAD GATEWAY` counts the 502s the restart caused.
 *
 * Everything here runs without network: the access log and the own-address list are planted files, and `ssh` on PATH is a fake
 * that only leaves a mark. Addresses come from the documentation ranges; the stranger is 198.51.100.23.
 */
const SCRIPT = join(__dirname, "..", "ops", "deploy-window.sh");
const STRANGER = "198.51.100.23";
const OWN = "192.0.2.10";
const AT = "2026-11-01T12:00:00";
const T0 = Date.parse(`${AT}Z`) / 1000;

type Run = { status: number | null; out: string; lines: string[]; sshCalled: boolean };

function line(offset: number, ip: string, method: string, uri: string, status: number): string {
  return JSON.stringify({ ts: T0 + offset, request: { remote_ip: ip, method, uri }, status });
}

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "deploy-window-"));
  mkdirSync(join(root, "bin"));
  const mark = join(root, "ssh-called");
  writeFileSync(join(root, "bin", "ssh"), `#!/bin/sh\ntouch ${JSON.stringify(mark)}\nexit 255\n`);
  chmodSync(join(root, "bin", "ssh"), 0o755);
  const own = join(root, "own-ips.txt");
  writeFileSync(own, `# planted\n${OWN} 2026-11-01  planted own address\n`);
  const run = (rows: string[], args: string[] = ["--at", AT]): Run => {
    const log = join(root, `access-${Math.random().toString(36).slice(2)}.log`);
    writeFileSync(log, rows.map((r) => `${r}\n`).join(""));
    const r = spawnSync("bash", [SCRIPT, ...args, "--log", log], {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
      env: { PATH: `${join(root, "bin")}:/usr/bin:/bin`, HOME: root, CP_OWN_IPS_FILE: own },
    });
    const out = `${r.stdout}${r.stderr}`;
    return { status: r.status, out, lines: r.stdout.split("\n").filter(Boolean), sshCalled: existsSync(mark) };
  };
  return { run };
}

describe("ops/deploy-window.sh measures a past window from a file and names no address", () => {
  it("counts a 502 to a stranger inside the window as AFFECTED and BAD GATEWAY 1", () => {
    const r = sandbox().run([line(5, STRANGER, "POST", "/v1/chat/completions", 502)]);
    expect(r.status, r.out).toBe(1);
    expect(r.lines).toContain("BAD GATEWAY 1 of 1 request(s) from outside answered 502");
    expect(r.out).toMatch(/^AFFECTED/m);
    expect(r.out).toMatch(/12:00:05 {2}POST \/v1\/chat\/completions {2}502/);
    expect(r.sshCalled).toBe(false);
  });

  it("does not count the same 502 outside the window", () => {
    const r = sandbox().run([
      line(-3600, STRANGER, "POST", "/v1/chat/completions", 502),
      line(10, STRANGER, "GET", "/v1/credits/balance", 200),
    ]);
    expect(r.status, r.out).toBe(0);
    expect(r.lines).toContain("BAD GATEWAY 0 of 1 request(s) from outside answered 502");
    expect(r.out).toMatch(/^CLEAN/m);
  });

  it("does not count a 502 to one of our own addresses", () => {
    const r = sandbox().run([line(5, OWN, "GET", "/health", 502)]);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/^ours {5}1 request/m);
    expect(r.out).toMatch(/^MEASURED NOTHING/m);
    expect(r.out).not.toMatch(/^BAD GATEWAY/m);
  });

  it("reports an empty window as MEASURED NOTHING, not as clean", () => {
    const r = sandbox().run([]);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/^MEASURED NOTHING/m);
    expect(r.out).not.toMatch(/^CLEAN/m);
  });

  it("names no address and no query in any line, also under NO KEY", () => {
    const r = sandbox().run([
      line(1, STRANGER, "GET", "/v1/credits/balance?brief=x", 502),
      line(2, "203.0.113.7", "GET", "/v1/models", 401),
      line(3, OWN, "GET", "/health", 200),
    ]);
    expect(r.status, r.out).toBe(1);
    expect(r.out).toMatch(/^NO KEY/m);
    expect(r.out).not.toMatch(/(^|[^0-9.])(\d{1,3}\.){3}\d{1,3}([^0-9.]|$)/);
    expect(r.out).not.toContain("?brief");
    expect(r.out).toContain("GET /v1/credits/balance  502");
  });

  it("refuses --log without --at, because the container start needs ssh", () => {
    const r = sandbox().run([], []);
    expect(r.status, r.out).toBe(2);
    expect(r.sshCalled).toBe(false);
  });

  it("the selftest passes and prints no planted address", () => {
    const r = spawnSync("bash", [SCRIPT, "--selftest"], { encoding: "utf8", timeout: 60_000, env: { PATH: "/usr/bin:/bin" } });
    const lines = r.stdout.split("\n").filter(Boolean);
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
    expect(lines.at(-1)).toBe("DEPLOY WINDOW SELFTEST OK");
    expect(lines.filter((l) => l.startsWith("ok   ")).length).toBeGreaterThanOrEqual(5);
    expect(`${r.stdout}${r.stderr}`).not.toContain(STRANGER);
  });
});
