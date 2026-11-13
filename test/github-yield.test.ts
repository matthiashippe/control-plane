import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ops/github-yield.sh counts what the answers in Conway's tracker brought (kanal 03): arrivals whose
 * first request in the window came from github.com/Conway-Research, and how many of those addresses
 * signed in and paid afterwards, as sums without any address. The fixture plants every case in both
 * directions, so a counter that goes blind or starts counting the wrong thing turns these red.
 */
const ROOT = join(__dirname, "..");
const SCRIPT = join(ROOT, "ops", "github-yield.sh");
const LOG = join(ROOT, "ops", "fixtures", "github-yield.log");
const WALLETS = join(ROOT, "ops", "fixtures", "github-yield-wallets.jsonl");
const OWN = join(ROOT, "ops", "fixtures", "github-yield-own-ips.txt");
const SINCE = "2026-11-06T22:20:00Z";

const run = (args: string[], env: Record<string, string> = {}) =>
  spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    timeout: 60_000,
    env: { ...process.env, CP_OWN_IPS: OWN, ...env },
  });

describe("ops/github-yield.sh", () => {
  it("passes its own selftest without network", () => {
    const r = run(["--selftest"]);
    expect(r.stdout.trim().split("\n").at(-1)).toMatch(/^SELFTEST OK/);
    expect(r.status).toBe(0);
  }, 120_000);

  it("counts the planted arrival, sign-in and payment and nothing else", () => {
    const r = run(["--log", LOG, "--wallets", WALLETS, "--since", SINCE]);
    const lines = r.stdout.trim().split("\n");
    expect(lines[0]).toBe(`GITHUB YIELD since ${SINCE}: 3 arrived from github.com/Conway-Research, 1 signed in, 1 paid`);
    expect(lines[1]).toBe(`ALL NEW since ${SINCE}: 3 new wallets, 1 paying wallets`);
    expect(r.stdout).toContain(`BARE GITHUB REFERRER since ${SINCE}: 1 arrived from https://github.com/ without a path`);
    expect(r.status).toBe(0);
  });

  it("prints no address and no wallet", () => {
    const r = run(["--log", LOG, "--wallets", WALLETS, "--since", "2000-01-01T00:00:00Z"]);
    expect(r.status).toBe(0);
    expect(r.stdout).not.toMatch(/([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}/);
  });

  it("counts our own address once it is no longer on the own list", () => {
    const dir = mkdtempSync(join(tmpdir(), "github-yield-"));
    const other = join(dir, "own.txt");
    writeFileSync(other, "192.0.2.254 2026-11-12  not in the fixture\n");
    const r = run(["--log", LOG, "--since", SINCE], { CP_OWN_IPS: other });
    expect(r.stdout.split("\n")[0]).toBe(`GITHUB YIELD since ${SINCE}: 4 arrived from github.com/Conway-Research, 2 signed in, 2 paid`);
  });

  it("does not count an arrival that came before the window", () => {
    const r = run(["--log", LOG, "--since", "2026-11-06T21:00:00Z"]);
    expect(r.stdout.split("\n")[0]).toBe(
      "GITHUB YIELD since 2026-11-06T21:00:00Z: 4 arrived from github.com/Conway-Research, 2 signed in, 1 paid",
    );
  });

  it("says the database was not read when it was given no wallets", () => {
    const r = run(["--log", LOG, "--since", SINCE]);
    expect(r.stdout.split("\n")[1]).toBe(`ALL NEW since ${SINCE}: not read`);
    expect(r.status).toBe(0);
  });

  it("exits 2 on an empty window, because a zero there is blindness", () => {
    const r = run(["--log", LOG, "--since", "2030-01-01T00:00:00Z"]);
    expect(r.status).toBe(2);
    expect(r.stdout).not.toContain("GITHUB YIELD");
  });

  it("exits 2 when the log cannot be read", () => {
    const r = run(["--log", join(ROOT, "ops", "fixtures", "no-such-file.log"), "--since", SINCE]);
    expect(r.status).toBe(2);
  });

  it("exits 2 when the own list is missing", () => {
    const r = run(["--log", LOG, "--since", SINCE], { CP_OWN_IPS: join(ROOT, "ops", "fixtures", "no-such-list.txt") });
    expect(r.status).toBe(2);
  });

  it("refuses a time that is not ISO in UTC", () => {
    const r = run(["--log", LOG, "--since", "yesterday"]);
    expect(r.status).toBe(1);
  });

  // The audit runs the (Netz) line verbatim on the code-host, without sourcing loop.env first. The
  // script then has to find host and key there itself, like ops/live.sh, instead of falling back to a
  // key path that does not exist on that machine. A fake ssh records how it was called and fails.
  const production = (env: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "github-yield-env-"));
    const home = join(dir, "home");
    mkdirSync(join(home, ".config", "control-plane"), { recursive: true });
    writeFileSync(
      join(home, ".config", "control-plane", "loop.env"),
      `CP_HOST=probe@host.invalid\nCP_SSH_KEY=${dir}/from_loop_env\nOPENROUTER_API_KEY=planted-loop-env-secret\n`,
    );
    const bin = join(dir, "bin");
    mkdirSync(bin);
    const record = join(dir, "ssh-calls.txt");
    writeFileSync(
      join(bin, "ssh"),
      `#!/usr/bin/env bash\necho "ARGS $*" >> ${JSON.stringify(record)}\nenv | grep -c planted-loop-env-secret | sed 's/^/LEAK /' >> ${JSON.stringify(record)}\nexit 1\n`,
    );
    chmodSync(join(bin, "ssh"), 0o755);
    const base: Record<string, string | undefined> = { ...process.env, CP_OWN_IPS: OWN, HOME: home, PATH: `${bin}:${process.env.PATH}` };
    delete base.CP_HOST;
    delete base.CP_SSH_KEY;
    delete base.OPENROUTER_API_KEY;
    const r = spawnSync("bash", [SCRIPT, "--since", SINCE], { encoding: "utf8", timeout: 60_000, env: { ...base, ...env } });
    let calls = "";
    try {
      calls = readFileSync(record, "utf8");
    } catch {
      calls = "";
    }
    return { r, calls, dir };
  };

  it("takes host and key from loop.env when the environment has none", () => {
    const { r, calls, dir } = production({});
    expect(calls).toContain(`ARGS -i ${dir}/from_loop_env `);
    expect(calls).toContain(" probe@host.invalid ");
    expect(calls).not.toContain("id_ed25519_automaton");
    expect(calls).not.toMatch(/LEAK [1-9]/);
    expect(r.status).toBe(2);
  });

  it("keeps host and key from the environment over loop.env", () => {
    const { r, calls } = production({ CP_HOST: "env@host.invalid", CP_SSH_KEY: "/nowhere/from_env" });
    expect(calls).toContain("ARGS -i /nowhere/from_env ");
    expect(calls).toContain(" env@host.invalid ");
    expect(calls).not.toContain("probe@host.invalid");
    expect(r.status).toBe(2);
  });
});
