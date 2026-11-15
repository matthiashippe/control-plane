import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ops/deploy-window.sh --log reads a past window from a file and asks nothing over ssh. Our own addresses there are the list,
 * CP_OWN_IPS and the seen file from CP_OWN_IPS_SEEN (default under XDG_STATE_HOME), read through own_ips_offline. An address
 * seen live yesterday and kept only in the seen file must count as ours, or one of our own checks shows up as a stranger with
 * a 502 and the deploy alarm rings for an answer no customer missed.
 *
 * Everything runs without network: list, seen file and access log are planted, `ssh` on PATH is a fake that only leaves a mark,
 * HOME and XDG_STATE_HOME point into a temp directory. Addresses come from the documentation ranges.
 */
const SCRIPT = join(__dirname, "..", "ops", "deploy-window.sh");
const LISTED = "192.0.2.10";
const SEEN = "192.0.2.44";
const AT = "2026-11-01T12:00:00";
const T0 = Date.parse(`${AT}Z`) / 1000;

type Run = { status: number | null; out: string; lines: string[]; sshCalled: boolean };

function row(offset: number, ip: string, method: string, uri: string, status: number): string {
  return JSON.stringify({ ts: T0 + offset, request: { remote_ip: ip, method, uri }, status });
}

function sandbox(opts: { list?: string; seen?: string; seenVar?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "deploy-window-own-seen-"));
  mkdirSync(join(root, "bin"));
  const mark = join(root, "ssh-called");
  writeFileSync(join(root, "bin", "ssh"), `#!/bin/sh\ntouch ${JSON.stringify(mark)}\nexit 255\n`);
  chmodSync(join(root, "bin", "ssh"), 0o755);
  const list = join(root, "own-ips.txt");
  writeFileSync(list, opts.list ?? `# planted\n${LISTED} 2026-11-01  planted own address\n`);
  const state = join(root, "state");
  const seenVar = opts.seenVar ?? true;
  const seen = seenVar ? join(root, "seen.txt") : join(state, "control-plane", "own-ips-seen.txt");
  mkdirSync(join(state, "control-plane"), { recursive: true });
  writeFileSync(seen, opts.seen ?? `${SEEN} 2026-11-14\n`);
  const run = (rows: string[]): Run => {
    const log = join(root, `access-${Math.random().toString(36).slice(2)}.log`);
    writeFileSync(log, rows.map((r) => `${r}\n`).join(""));
    const env: Record<string, string> = {
      PATH: `${join(root, "bin")}:/usr/bin:/bin`,
      HOME: root,
      XDG_STATE_HOME: state,
      CP_OWN_IPS_FILE: list,
    };
    if (seenVar) env.CP_OWN_IPS_SEEN = seen;
    const r = spawnSync("bash", [SCRIPT, "--at", AT, "--log", log], { cwd: root, encoding: "utf8", timeout: 60_000, env });
    const out = `${r.stdout}${r.stderr}`;
    return { status: r.status, out, lines: out.split("\n").filter(Boolean), sshCalled: existsSync(mark) };
  };
  return { run, list, seen };
}

describe("ops/deploy-window.sh --log counts the addresses in CP_OWN_IPS_SEEN as ours", () => {
  it("--log counts an address only in CP_OWN_IPS_SEEN as ours, not as a stranger", () => {
    const r = sandbox().run([row(5, SEEN, "GET", "/health", 502)]);
    expect(r.status, r.out).toBe(0);
    expect(r.lines.filter((l) => /^ours {5}1 request/.test(l))).toHaveLength(1);
    expect(r.out).not.toMatch(/^BAD GATEWAY/m);
  });

  it("--log without CP_OWN_IPS_SEEN reads the seen file under XDG_STATE_HOME", () => {
    const r = sandbox({ seenVar: false }).run([row(5, SEEN, "GET", "/health", 502)]);
    expect(r.status, r.out).toBe(0);
    expect(r.out).not.toMatch(/^BAD GATEWAY/m);
  });

  it("--log still counts an address only in the list as ours", () => {
    const r = sandbox({ seen: "" }).run([row(5, LISTED, "GET", "/health", 502)]);
    expect(r.status, r.out).toBe(0);
    expect(r.out).not.toMatch(/^BAD GATEWAY/m);
  });

  it("--log refuses with exit 2 when the list names no address, even if CP_OWN_IPS_SEEN does", () => {
    const r = sandbox({ list: "# only a comment\n\n", seen: `${SEEN} 2026-11-14\n` }).run([row(5, SEEN, "GET", "/health", 502)]);
    expect(r.status, r.out).toBe(2);
    expect(r.lines.some((l) => l.startsWith("COULD NOT TELL: "))).toBe(true);
    expect(r.out).not.toMatch(/^BAD GATEWAY/m);
  });

  it("--log reads CP_OWN_IPS_SEEN but never writes it and never calls ssh", () => {
    const box = sandbox();
    const seenBefore = readFileSync(box.seen, "utf8");
    const listBefore = readFileSync(box.list, "utf8");
    const r = box.run([row(5, SEEN, "GET", "/health", 502)]);
    expect(r.status, r.out).toBe(0);
    expect(readFileSync(box.seen, "utf8")).toBe(seenBefore);
    expect(readFileSync(box.list, "utf8")).toBe(listBefore);
    expect(r.sshCalled).toBe(false);
  });
});
