import "./yield-between-tests";
import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ops/anzeigen-rechnung.py takes the denominator of the conversion, the foreign addresses at the payment route, from
 * ./ops/access-log.sh. A log that does not start, ends with an exit other than 0 or runs past its time limit is not a
 * measurement: the program ends with exit 2, an empty stdout and one line on stderr, and counts no part of what the log
 * printed before it failed. The stderr of the log is never forwarded, because it can name the host of the server.
 *
 * Every case runs a copy of the program and of ops/own-ips.sh in a temp dir, with a fake ops/access-log.sh and a fake
 * `ssh` first on PATH that exits 255. No network, no fixed port, documentation addresses only.
 */
const REPO = join(__dirname, "..");
const OWN_IP = "203.0.113.99";
const FOREIGN = ["198.51.100.23", "192.0.2.50"];
const SERVER_IP = "203.0.113.7";
const PLANTED = [OWN_IP, ...FOREIGN, SERVER_IP];
const MARKET = JSON.stringify({
  db: { market: { foreign_payers: 1, foreign_topup_mc: 100000, foreign_margin_mc: 1000, foreign_inference_mc: 10000, open_bounties: 0 } },
});

type Run = { status: number | null; stdout: string; stderr: string; ms: number };

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "anzeigen-rechnung-access-log-"));
  roots.push(root);
  mkdirSync(join(root, "ops"));
  for (const f of ["ops/anzeigen-rechnung.py", "ops/own-ips.sh"]) copyFileSync(join(REPO, f), join(root, f));
  writeFileSync(join(root, "own.txt"), `${OWN_IP} 2026-11-16  planted own address\n`);
  writeFileSync(
    join(root, "access.log"),
    FOREIGN.map((ip) => JSON.stringify({ request: { client_ip: ip, method: "GET", uri: "/pay/planted" }, status: 200 })).join("\n") + "\n",
  );
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, "bin", "ssh"), "#!/bin/sh\nexit 255\n");
  chmodSync(join(root, "bin", "ssh"), 0o755);

  const log = (body: string) => {
    writeFileSync(join(root, "ops", "access-log.sh"), `#!/bin/sh\n${body}\n`);
    chmodSync(join(root, "ops", "access-log.sh"), 0o755);
  };
  const printsLog = `cat ${JSON.stringify(join(root, "access.log"))}`;

  const run = (env: Record<string, string> = {}): Run => {
    const start = Date.now();
    const r = spawnSync("python3", ["ops/anzeigen-rechnung.py"], {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
      input: MARKET,
      env: {
        PATH: `${join(root, "bin")}:/usr/bin:/bin`,
        HOME: root,
        CP_OWN_IPS_FILE: join(root, "own.txt"),
        CP_OWN_IPS_SEEN: join(root, "seen.txt"),
        ...env,
      },
    });
    const ms = Date.now() - start;
    for (const l of `${r.stdout}\n${r.stderr}`.split("\n")) for (const ip of PLANTED) expect(l).not.toContain(ip);
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, ms };
  };
  return { root, log, printsLog, run };
}

const lines = (s: string) => s.split("\n").filter((l) => l !== "");

function stopsWithOneLine(r: Run, says: string) {
  expect(r.status, r.stdout + r.stderr).toBe(2);
  expect(r.stdout).toBe("");
  const err = lines(r.stderr);
  expect(err, r.stderr).toHaveLength(1);
  expect(err[0]).toMatch(/^anzeigen-rechnung: /);
  expect(err[0]).toContain(says);
}

describe("ops/anzeigen-rechnung.py counts only an access log that was read in full", () => {
  it("stops with exit 2 when ops/access-log.sh prints part of the log and ends with exit 1", () => {
    const s = sandbox();
    s.log(`${s.printsLog}\nexit 1`);
    stopsWithOneLine(s.run(), "exit 1");
  });

  it("stops with exit 2 when ops/access-log.sh prints nothing and ends with exit 1", () => {
    const s = sandbox();
    s.log("exit 1");
    stopsWithOneLine(s.run(), "exit 1");
  });

  it("stops with exit 2 when ops/access-log.sh does not start", () => {
    const s = sandbox();
    expect(existsSync(join(s.root, "ops", "access-log.sh"))).toBe(false);
    stopsWithOneLine(s.run(), "did not start");
  });

  it("stops with exit 2 when ops/access-log.sh runs past CP_ACCESS_LOG_TIMEOUT", () => {
    const s = sandbox();
    // exec, so no grandchild keeps the pipe open after the time limit.
    s.log("exec sleep 5");
    const r = s.run({ CP_ACCESS_LOG_TIMEOUT: "1" });
    stopsWithOneLine(r, "ran past");
    expect(r.ms).toBeLessThan(4_000);
  });

  it("stops with exit 2 when CP_ACCESS_LOG_TIMEOUT is not a positive number and never starts ops/access-log.sh", () => {
    const marker = (s: ReturnType<typeof sandbox>) => join(s.root, "access-log-started");
    for (const value of ["abc", "0", "-3", "nan", "inf"]) {
      const s = sandbox();
      s.log(`touch ${JSON.stringify(marker(s))}\n${s.printsLog}`);
      stopsWithOneLine(s.run({ CP_ACCESS_LOG_TIMEOUT: value }), "CP_ACCESS_LOG_TIMEOUT");
      expect(existsSync(marker(s)), value).toBe(false);
    }

    // The other direction: with a positive number the same log starts and is counted.
    const s = sandbox();
    s.log(`touch ${JSON.stringify(marker(s))}\n${s.printsLog}`);
    const r = s.run({ CP_ACCESS_LOG_TIMEOUT: "30" });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(existsSync(marker(s))).toBe(true);
  });

  it("never forwards the stderr of ops/access-log.sh", () => {
    const s = sandbox();
    s.log(`echo "ssh: connect to host ${SERVER_IP} port 22: Connection timed out" >&2\nexit 255`);
    const r = s.run();
    stopsWithOneLine(r, "exit 255");
    expect(r.stdout).not.toContain(SERVER_IP);
    expect(r.stderr).not.toContain(SERVER_IP);
  });

  it("counts a log that ends with exit 0 as before", () => {
    const s = sandbox();
    s.log(`${s.printsLog}\nexit 0`);
    const r = s.run();
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stderr).toBe("");
    expect(r.stdout).toMatch(/^  Adressen, die das Angebot ansahen   2$/m);
    expect(r.stdout).toContain("TRAEGT am oberen Ende des Bands.");
  });
});
