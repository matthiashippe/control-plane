import "./yield-between-tests";
import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

/**
 * `own_ips_checked <file>` in ops/own-ips.sh is the one guard every counter puts in front of `own_ips`: a missing list, a
 * list that names no address itself and a failed `own_ips` end with 2 and one line on stderr that names the file and no
 * address; otherwise it names what `own_ips` names. `conway_own_list` in ops/conway-arrivals.sh goes through it.
 *
 * The scripts come from OPS_UNDER_TEST when it is set (a directory holding own-ips.sh and conway-arrivals.sh), else from
 * ops/ of this repository, so the same cases can be run against an older state of the scripts. No network, no fixed port,
 * documentation addresses only. A fake `ssh` first on PATH answers the SSH_CLIENT probe with FAKE_LIVE when it is set,
 * else exits 255.
 */
const OPS = resolve(process.env.OPS_UNDER_TEST || join(__dirname, "..", "ops"));
const LISTED = "192.0.2.10";
const SEEN = "192.0.2.44";
const ENV_OWN = "198.51.100.7";
const LIVE = "203.0.113.9";
const PLANTED = [LISTED, SEEN, ENV_OWN, LIVE];
const LIST = `${LISTED} 2026-11-01 x\n`;
const FAILING_OWN_IPS = `own_ips() { echo ${LISTED}; return 1; }`;

type Run = { status: number | null; stdout: string; stderr: string };

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function sandbox(list: string | null = LIST) {
  const root = mkdtempSync(join(tmpdir(), "own-ips-checked-"));
  roots.push(root);
  const listFile = join(root, "own.txt");
  if (list !== null) writeFileSync(listFile, list);
  writeFileSync(join(root, "seen.txt"), `${SEEN} 2026-11-01\n`);
  mkdirSync(join(root, "bin"));
  writeFileSync(
    join(root, "bin", "ssh"),
    [
      "#!/bin/sh",
      'for last in "$@"; do :; done',
      'case "$last" in',
      '  *SSH_CLIENT*) if [ -n "$FAKE_LIVE" ]; then echo "$FAKE_LIVE 40000 22"; exit 0; fi; exit 255 ;;',
      "  *) exit 255 ;;",
      "esac",
      "",
    ].join("\n"),
  );
  chmodSync(join(root, "bin", "ssh"), 0o755);

  // body runs after the script is sourced; $1 is the first argument.
  const bash = (script: string, body: string, args: string[], env: Record<string, string> = {}): Run => {
    const r = spawnSync("bash", ["-c", `source ${JSON.stringify(join(OPS, script))}\n${body}`, "_", ...args], {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
      input: "",
      env: {
        // The directory of the running node comes right after the fake ssh: on a CI runner node is not in /usr/bin.
        PATH: `${join(root, "bin")}:${dirname(process.execPath)}:/usr/bin:/bin`,
        HOME: root,
        CP_OWN_IPS_FILE: listFile,
        CP_OWN_IPS_SEEN: join(root, "seen.txt"),
        CP_SSH_KEY: join(root, "no-key"),
        ...env,
      },
    });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  };
  const checked = (file: string, env: Record<string, string> = {}, before = "") =>
    bash("own-ips.sh", `${before}\nown_ips_checked "$1"`, [file], env);
  return { root, listFile, bash, checked };
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).sort();
const lines = (s: string) => s.split("\n").filter((l) => l !== "");
const namesNoAddress = (r: Run) => {
  for (const ip of PLANTED) expect(`${r.stdout}\n${r.stderr}`).not.toContain(ip);
};
// Exit 2, nothing on stdout, exactly one line on stderr that starts with prefix and, when given, names the file.
const stopped = (r: Run, prefix: string, file?: string) => {
  expect(r.status, r.stdout + r.stderr).toBe(2);
  expect(r.stdout).toBe("");
  const err = lines(r.stderr);
  expect(err, r.stderr).toHaveLength(1);
  expect(err[0].startsWith(prefix), err[0]).toBe(true);
  if (file) expect(err[0]).toContain(file);
  namesNoAddress(r);
};
const ALL = { CP_OWN_IPS: ENV_OWN, FAKE_LIVE: LIVE };

describe("own_ips_checked is the one guard in front of own_ips", () => {
  it("own_ips_checked returns 2 with one line naming the file when the list is missing", () => {
    const s = sandbox(null);
    const none = join(s.root, "none.txt");
    stopped(s.checked(none, ALL), "own_ips_checked: ", none);
  });

  it("own_ips_checked returns 2 with one line naming the file when the list names no address, even with a live, a seen and a CP_OWN_IPS address", () => {
    const s = sandbox("# retired\n\n");
    stopped(s.checked(s.listFile, ALL), "own_ips_checked: ", s.listFile);
  });

  it("own_ips_checked names the addresses own_ips names when the list names one", () => {
    const s = sandbox();
    const r = s.checked(s.listFile, ALL);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stderr).toBe("");
    const reference = s.bash("own-ips.sh", "own_ips 2>/dev/null", [], ALL);
    expect(reference.status, reference.stdout + reference.stderr).toBe(0);
    expect(words(r.stdout)).toEqual(words(reference.stdout));
    for (const ip of PLANTED) expect(words(r.stdout)).toContain(ip);
  });

  it("own_ips_checked returns 2 when own_ips ends with an exit other than 0", () => {
    const s = sandbox();
    stopped(s.checked(s.listFile, ALL, FAILING_OWN_IPS), "own_ips_checked: ");
  });

  it("conway_own_list returns 2 when own_ips ends with an exit other than 0", () => {
    const s = sandbox();
    const out = join(s.root, "out");
    const r = s.bash("conway-arrivals.sh", `${FAILING_OWN_IPS}\nconway_own_list "$1"`, [out], {
      CP_OWN_IPS: s.listFile,
      FAKE_LIVE: LIVE,
    });
    expect(r.status, r.stdout + r.stderr).toBe(2);
    expect(existsSync(out) ? readFileSync(out, "utf8") : "").toBe("");
    const err = lines(r.stderr);
    expect(err, r.stderr).toHaveLength(1);
    expect(err[0].startsWith("conway-arrivals: "), err[0]).toBe(true);
    namesNoAddress(r);
  });

  it("conway_own_list writes the addresses own_ips names, one per line", () => {
    const s = sandbox();
    const out = join(s.root, "out");
    const r = s.bash("conway-arrivals.sh", 'conway_own_list "$1"', [out], { CP_OWN_IPS: s.listFile, FAKE_LIVE: LIVE });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const reference = s.bash("own-ips.sh", "own_ips 2>/dev/null", [], {
      CP_OWN_IPS_FILE: s.listFile,
      CP_OWN_IPS: "",
      FAKE_LIVE: LIVE,
    });
    expect(reference.status, reference.stdout + reference.stderr).toBe(0);
    const written = readFileSync(out, "utf8");
    expect(written.endsWith("\n")).toBe(true);
    for (const l of written.split("\n").slice(0, -1)) expect(l).toMatch(/^\S+$/);
    expect(lines(written).sort()).toEqual(words(reference.stdout));
  });
});
