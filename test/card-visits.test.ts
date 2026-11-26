import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ops/card-visits.sh counts two things in the Caddy access log, as sums without any address (kunden 15):
 * how often a person (not a bot, not one of our own addresses) opened a card page /card/<n>, and how
 * many answers 402 on /v1/chat/completions went to runtimes whose User-Agent is automaton-maintained/<v>,
 * per version. There are no fixture files: every case writes its planted log and own list into a temp
 * dir, so a counter that goes blind or starts counting the wrong thing turns these red.
 */
const ROOT = join(__dirname, "..");
const SCRIPT = join(ROOT, "ops", "card-visits.sh");

// 2026-11-19T14:00:00Z and 15:00:00Z as the window of every case.
const SINCE = "2026-11-19T14:00:00Z";
const UNTIL = "2026-11-19T15:00:00Z";
const T0 = Date.UTC(2026, 10, 19, 14, 0, 0) / 1000;
const T1 = Date.UTC(2026, 10, 19, 15, 0, 0) / 1000;

// Documentation addresses only (RFC 5737). OWN_IP is on the planted own list.
const OWN_IP = "192.0.2.254";
const WALLET = "0x" + "ab".repeat(20);

const line = (ts: number, ip: string, method: string, uri: string, status: number, agent: string) =>
  JSON.stringify({
    ts,
    status,
    request: { client_ip: ip, remote_ip: ip, method, uri, headers: { "User-Agent": [agent], Referer: [""] } },
  });

const MOZ = "Mozilla/5.0 (X11; Linux x86_64) Firefox/133.0";
const CHAT = "/v1/chat/completions";

// Every rule once, in both directions where the window allows it.
const PLANTED = [
  line(T0, "203.0.113.10", "GET", `/card/5?address=${WALLET}`, 402, MOZ), // person, at --since: counts
  line(T0 + 60, "203.0.113.11", "HEAD", "/card/7", 200, MOZ), // person
  line(T0 + 120, "198.51.100.20", "GET", "/card/5", 200, "Mozilla/5.0 (compatible; Googlebot/2.1)"), // bot
  line(T0 + 180, "198.51.100.21", "GET", `/card/5?address=${WALLET}`, 200, ""), // empty agent: bot
  line(T0 + 240, "198.51.100.22", "GET", "/card/9", 200, "Some-CRAWLER/1.0"), // bot, any case
  line(T0 + 300, OWN_IP, "GET", `/card/5?address=${WALLET}`, 200, MOZ), // own
  line(T0 + 360, "203.0.113.13", "GET", "/cards", 200, MOZ), // not a card page
  line(T0 + 420, "203.0.113.13", "GET", "/card.json", 200, MOZ), // not a card page
  line(T0 + 480, "203.0.113.13", "GET", "/card", 200, MOZ), // not a card page
  line(T0 + 540, "203.0.113.14", "POST", "/card/5", 200, MOZ), // wrong method
  line(T0 - 1, "203.0.113.15", "GET", "/card/5", 200, MOZ), // one second before --since
  line(T1, "203.0.113.16", "GET", "/card/5", 200, MOZ), // exactly at --until
  line(T0 + 600, "203.0.113.30", "POST", CHAT, 402, "node"), // 402 to another runtime
  line(T0 + 660, "203.0.113.31", "POST", CHAT, 402, "automaton-maintained/0.2.10"),
  line(T0 + 720, "203.0.113.32", "POST", CHAT, 402, "automaton-maintained/0.2.10 (linux; node 22)"),
  line(T0 + 780, "203.0.113.33", "POST", CHAT, 402, "automaton-maintained/0.2.2"),
  line(T0 + 840, "203.0.113.34", "POST", `${CHAT}?stream=1`, 402, "automaton-maintained/0.2.1 node/22"),
  line(T0 + 900, "203.0.113.35", "POST", CHAT, 200, "automaton-maintained/0.2.1"), // paid, not 402
  line(T0 + 960, OWN_IP, "POST", CHAT, 402, "automaton-maintained/0.2.1"), // own
  line(T0 + 1020, "203.0.113.36", "GET", CHAT, 402, "automaton-maintained/0.2.1"), // wrong method
  line(T0 - 1, "203.0.113.37", "POST", CHAT, 402, "automaton-maintained/0.2.1"), // before --since
];

// own_ips asks ssh for the live address. A fake ssh that answers nothing goes first on PATH, and
// CP_OWN_IPS_SEEN points into a temp dir, so no case reaches the network or the state directory.
const STUB = mkdtempSync(join(tmpdir(), "card-visits-stub-"));
writeFileSync(join(STUB, "ssh"), "#!/bin/sh\nexit 255\n");
chmodSync(join(STUB, "ssh"), 0o755);
const LOG = join(STUB, "access.jsonl");
writeFileSync(LOG, PLANTED.join("\n") + "\n");
const OWN = join(STUB, "own.txt");
writeFileSync(OWN, `${OWN_IP} 2026-11-19  planted own address\n`);

const quiet = (): Record<string, string | undefined> => {
  const env: Record<string, string | undefined> = { ...process.env, PATH: `${STUB}:${process.env.PATH}`, CP_OWN_IPS_SEEN: join(STUB, "seen.txt") };
  delete env.CP_OWN_IPS_WRITE;
  return env;
};

const run = (args: string[], env: Record<string, string> = {}) =>
  spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    timeout: 60_000,
    env: { ...quiet(), CP_OWN_IPS: OWN, ...env },
  });

describe("ops/card-visits.sh", () => {
  it("passes its own selftest without network", () => {
    const r = run(["--selftest"]);
    const lines = r.stdout.trim().split("\n");
    expect(lines.at(-1)).toMatch(/^SELFTEST OK/);
    expect(lines.filter((l) => l.startsWith("ok ")).length).toBeGreaterThanOrEqual(8);
    expect(r.stdout).not.toMatch(/^FAIL/m);
    expect(r.stdout).not.toMatch(/([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}|address=/);
    expect(r.status).toBe(0);
  }, 120_000);

  it("prints exactly the planted counts and nothing else", () => {
    const r = run(["--log", LOG, "--since", SINCE, "--until", UNTIL]);
    expect(r.stdout).toBe(
      [
        `CARD VISITS since ${SINCE} until ${UNTIL}: 2 by people, 3 by bots, 1 from own addresses`,
        `MAINTAINED 402 since ${SINCE} until ${UNTIL}: 4 answers 402 on /v1/chat/completions to automaton-maintained runtimes`,
        "MAINTAINED 402 VERSION automaton-maintained/0.2.1: 1",
        "MAINTAINED 402 VERSION automaton-maintained/0.2.2: 1",
        "MAINTAINED 402 VERSION automaton-maintained/0.2.10: 2",
        "",
      ].join("\n"),
    );
    expect(r.status).toBe(0);
  });

  it("prints no address, no wallet and no query", () => {
    const r = run(["--log", LOG, "--since", "2026-11-19T00:00:00Z", "--until", "2026-11-20T00:00:00Z"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("CARD VISITS");
    expect(r.stdout).not.toMatch(/([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}|address=|\?/);
  });

  it("counts our own address as a person once it is no longer on the own list", () => {
    const other = join(mkdtempSync(join(tmpdir(), "card-visits-")), "own.txt");
    writeFileSync(other, "192.0.2.253 2026-11-19  not in the planted log\n");
    const r = run(["--log", LOG, "--since", SINCE, "--until", UNTIL], { CP_OWN_IPS: other });
    const lines = r.stdout.split("\n");
    expect(lines[0]).toBe(`CARD VISITS since ${SINCE} until ${UNTIL}: 3 by people, 3 by bots, 0 from own addresses`);
    expect(lines[1]).toContain(": 5 answers 402");
    expect(lines[2]).toBe("MAINTAINED 402 VERSION automaton-maintained/0.2.1: 2");
    expect(r.status).toBe(0);
  });

  it("counts since inclusive and until exclusive, and moving the edges takes the outer lines in", () => {
    const inside = run(["--log", LOG, "--since", SINCE, "--until", UNTIL]);
    expect(inside.stdout.split("\n")[0]).toContain(": 2 by people,");
    const early = "2026-11-19T13:59:59Z";
    const r1 = run(["--log", LOG, "--since", early, "--until", UNTIL]);
    expect(r1.stdout.split("\n")[0]).toBe(`CARD VISITS since ${early} until ${UNTIL}: 3 by people, 3 by bots, 1 from own addresses`);
    expect(r1.stdout.split("\n")[1]).toContain(": 5 answers 402");
    const late = "2026-11-19T15:00:01Z";
    const r2 = run(["--log", LOG, "--since", SINCE, "--until", late]);
    expect(r2.stdout.split("\n")[0]).toBe(`CARD VISITS since ${SINCE} until ${late}: 3 by people, 3 by bots, 1 from own addresses`);
    const later = "2026-11-19T14:00:01Z";
    const r3 = run(["--log", LOG, "--since", later, "--until", UNTIL]);
    expect(r3.stdout.split("\n")[0]).toContain(": 1 by people,");
  });

  it("exits 2 when the log cannot be read", () => {
    const r = run(["--log", join(STUB, "no-such-file.log"), "--since", SINCE, "--until", UNTIL]);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe("");
  });

  it("exits 2 when the own list is missing or empty", () => {
    const missing = run(["--log", LOG, "--since", SINCE, "--until", UNTIL], { CP_OWN_IPS: join(STUB, "no-such-list.txt") });
    expect(missing.status).toBe(2);
    expect(missing.stdout).toBe("");
    const empty = join(mkdtempSync(join(tmpdir(), "card-visits-")), "own.txt");
    writeFileSync(empty, "# nothing here\n");
    const r = run(["--log", LOG, "--since", SINCE, "--until", UNTIL], { CP_OWN_IPS: empty });
    expect(r.status).toBe(2);
    expect(r.stdout).toBe("");
  });

  it("refuses times that are not strict ISO in UTC and wrong arguments", () => {
    for (const [s, u] of [
      ["yesterday", UNTIL],
      [SINCE, "2026-11-19 15:00:00"],
      ["2026-11-19T14:00:00+01:00", UNTIL],
      ["2026-13-19T14:00:00Z", UNTIL],
    ]) {
      expect(run(["--log", LOG, "--since", s, "--until", u]).status).toBe(1);
    }
    expect(run(["--log", LOG, "--since", SINCE]).status).toBe(1);
    expect(run(["--log", LOG, "--since", SINCE, "--until", UNTIL, "--bogus"]).status).toBe(1);
  });

  // Production runs without sourcing loop.env first. The script then has to find host and key there
  // itself, like ops/github-yield.sh. A fake ssh records how it was called and fails.
  const production = (env: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "card-visits-env-"));
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
    const base: Record<string, string | undefined> = {
      ...process.env,
      CP_OWN_IPS: OWN,
      CP_OWN_IPS_SEEN: join(dir, "seen.txt"),
      HOME: home,
      PATH: `${bin}:${process.env.PATH}`,
    };
    delete base.CP_OWN_IPS_WRITE;
    delete base.CP_HOST;
    delete base.CP_SSH_KEY;
    delete base.OPENROUTER_API_KEY;
    const r = spawnSync("bash", [SCRIPT, "--since", SINCE, "--until", UNTIL], { encoding: "utf8", timeout: 60_000, env: { ...base, ...env } });
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
    expect(r.stdout).toBe("");
  });

  it("keeps host and key from the environment over loop.env", () => {
    const { r, calls } = production({ CP_HOST: "env@host.invalid", CP_SSH_KEY: "/nowhere/from_env" });
    expect(calls).toContain("ARGS -i /nowhere/from_env ");
    expect(calls).toContain(" env@host.invalid ");
    expect(calls).not.toContain("probe@host.invalid");
    expect(r.status).toBe(2);
  });
});
