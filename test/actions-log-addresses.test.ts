import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32 } from "node:zlib";

/**
 * ops/actions-log-addresses.sh counts the stranger addresses in the logs of GitHub Actions runs of this public repository,
 * before Matthias deletes those logs and after. It prints counts only, never an address, and a failing `gh` ends with exit 2
 * and no `total` line, so a network error is never read as zero.
 *
 * Everything here runs without network: logs are planted directories, and `gh` on PATH is a fake. Addresses come from the
 * documentation ranges and private ranges only.
 */
const SCRIPT = join(__dirname, "..", "ops", "actions-log-addresses.sh");
const IPV4 = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/;
// Any group of hex digits next to a colon that is not a clock time: catches every IPv6 address the fixtures plant.
const IPV6 = /(?:[0-9a-f]{0,4}:){2,}[0-9a-f]{0,4}|2001|db8|fe80|fd00|ffff/i;

type Run = { status: number | null; stdout: string; out: string; lines: string[] };

function workspace() {
  const root = mkdtempSync(join(tmpdir(), "actions-log-addresses-"));
  mkdirSync(join(root, "bin"));
  const empty = join(root, "empty");
  writeFileSync(empty, "");
  const own = join(root, "own");
  writeFileSync(own, "# planted\n198.51.100.1 2026-11-13 planted own address\n");
  const run = (args: string[], env: Record<string, string> = {}): Run => {
    const r = spawnSync("bash", [SCRIPT, ...args], {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
      env: {
        PATH: `${join(root, "bin")}:/usr/bin:/bin`,
        HOME: root,
        CP_OWN_IPS_FILE: own,
        CP_KNOWN_IPS: empty,
        CP_CRAWLER_IPS: empty,
        ...env,
      },
    });
    const out = `${r.stdout}${r.stderr}`;
    return { status: r.status, stdout: r.stdout, out, lines: r.stdout.split("\n").filter(Boolean) };
  };
  const file = (rel: string, body: string): string => {
    const path = join(root, rel);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, body);
    return path;
  };
  const gh = (script: string): void => {
    const path = join(root, "bin", "gh");
    writeFileSync(path, `#!/bin/sh\n${script}\n`);
    chmodSync(path, 0o755);
  };
  return { root, run, file, gh };
}

// A zip archive with stored (uncompressed) entries, the shape `gh api .../runs/<id>/logs` returns.
function zip(entries: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, body] of Object.entries(entries)) {
    const nameBuf = Buffer.from(name, "utf8");
    const data = Buffer.from(body, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

const STRANGER_LINE = "2026-11-10T20:27:20.6490622Z    20:27:07  203.0.113.7  POST /v1/chat/completions  502\n";

describe("ops/actions-log-addresses.sh counts stranger addresses in Actions logs and names none", () => {
  it("counts per run and distinct over all runs from a directory", () => {
    const w = workspace();
    w.file(
      "logs/1/deploy/3_x.txt",
      "05:57:46  203.0.113.7  POST /v1/chat/completions  503\n" +
        "06:00:01  10.0.0.1  GET /health  200\n" +
        "06:00:02  198.51.100.1  GET /health  200\n" +
        "(new own address 198.51.100.9, written to own-ips.txt)\n",
    );
    w.file(
      "logs/2/0_deploy.txt",
      "16:41:04  203.0.113.7  GET /v1/credits/balance  502\n18:15:25  203.0.113.8  POST /v1/chat/completions  402\n",
    );
    const r = w.run(["--dir", join(w.root, "logs")]);
    expect(r.status, r.out).toBe(0);
    expect(r.lines).toEqual(["1 1", "2 2", "total 2"]);
    expect(r.out).not.toMatch(IPV4);
  });

  it("does not count an address that is not in a request line", () => {
    const w = workspace();
    w.file("logs/5/a.txt", "(new own address 198.51.100.9, written to own-ips.txt)\nconnect 203.0.113.50 refused\n");
    const r = w.run(["--dir", join(w.root, "logs")]);
    expect(r.status, r.out).toBe(0);
    expect(r.lines).toEqual(["5 0", "total 0"]);
  });

  it("counts 0 for a run whose addresses all stand in the three lists or in private ranges", () => {
    const w = workspace();
    const known = w.file("known", "# planted\n192.0.2.20 datacenter planted\n");
    const crawler = w.file("crawler", "# planted\n192.0.2.30 Planted crawl.example\n");
    w.file(
      "logs/7/deploy/1_x.txt",
      "06:00:02  198.51.100.1  GET /health  200\n" +
        "06:00:03  192.0.2.20  GET /v1/models  200\n" +
        "06:00:04  192.0.2.30  GET /robots.txt  200\n" +
        "06:00:05  172.17.0.1  GET /health  200\n" +
        "06:00:06  192.168.1.5  HEAD /  200\n" +
        "06:00:07  127.0.0.1  GET /health  200\n" +
        "06:00:08  169.254.1.1  GET /health  200\n" +
        "06:00:09  0.1.2.3  GET /health  200\n",
    );
    const r = w.run(["--dir", join(w.root, "logs")], { CP_KNOWN_IPS: known, CP_CRAWLER_IPS: crawler });
    expect(r.status, r.out).toBe(0);
    expect(r.lines).toEqual(["7 0", "total 0"]);
  });

  it("sorts runs by numeric id", () => {
    const w = workspace();
    w.file("logs/100/a.txt", STRANGER_LINE);
    w.file("logs/20/a.txt", "");
    const r = w.run(["--dir", join(w.root, "logs")]);
    expect(r.status, r.out).toBe(0);
    expect(r.lines).toEqual(["20 0", "100 1", "total 1"]);
  });

  it("downloads the logs of --runs with gh and counts them", () => {
    const w = workspace();
    w.file("archive.zip", "");
    writeFileSync(
      join(w.root, "archive.zip"),
      zip({ "0_deploy.txt": STRANGER_LINE, "deploy/system.txt": "18:15:25  203.0.113.8  GET /v1/x  402\n" }),
    );
    w.gh(`case "$*" in *runs/11/logs*) cat ${JSON.stringify(join(w.root, "archive.zip"))};; *) exit 9;; esac`);
    const r = w.run(["--runs", "11"]);
    expect(r.status, r.out).toBe(0);
    expect(r.lines).toEqual(["11 2", "total 2"]);
    expect(r.out).not.toMatch(IPV4);
  });

  it("reports a run whose log is gone as no-log and still exits 0", () => {
    const w = workspace();
    writeFileSync(join(w.root, "archive.zip"), zip({ "0_deploy.txt": STRANGER_LINE }));
    w.gh(
      `case "$*" in *runs/12/logs*) echo '{"message":"Not Found"}'; echo 'gh: Not Found (HTTP 404)' >&2; exit 1;;` +
        ` *runs/13/logs*) cat ${JSON.stringify(join(w.root, "archive.zip"))};; *) exit 9;; esac`,
    );
    const r = w.run(["--runs", "13,12"]);
    expect(r.status, r.out).toBe(0);
    expect(r.lines).toEqual(["12 no-log", "13 1", "total 1"]);
  });

  it("ends with exit 2 and no total line when gh fails to list the runs", () => {
    const w = workspace();
    w.gh("echo 'gh: error connecting to api.github.com' >&2; exit 1");
    const r = w.run(["--workflow", "deploy.yml"]);
    expect(r.status, r.out).toBe(2);
    expect(r.stdout).not.toMatch(/^total/m);
  });

  it("ends with exit 2 and no total line when gh fails on a log for another reason than a missing one", () => {
    const w = workspace();
    w.gh("echo 'gh: Server Error (HTTP 502)' >&2; exit 1");
    const r = w.run(["--runs", "14"]);
    expect(r.status, r.out).toBe(2);
    expect(r.stdout).not.toMatch(/^total/m);
  });

  it("lists every run of a workflow, more than the first 20", () => {
    const w = workspace();
    const ids = Array.from({ length: 25 }, (_, i) => 1000 + i);
    w.gh(
      `case "$*" in *workflows/deploy.yml/runs*) printf '${ids.join("\\n")}\\n';;` +
        ` *runs/*/logs*) echo 'gh: Not Found (HTTP 404)' >&2; exit 1;; *) exit 9;; esac`,
    );
    const r = w.run(["--workflow", "deploy.yml"]);
    expect(r.status, r.out).toBe(0);
    expect(r.lines).toEqual([...ids.map((id) => `${id} no-log`), "total 0"]);
  });

  it("asks gh for every page of the workflow runs", () => {
    const w = workspace();
    const args = join(w.root, "args");
    w.gh(`echo "$*" >> ${JSON.stringify(args)}; case "$*" in *workflows/*) echo 1;; *) echo 'gh: Not Found (HTTP 404)' >&2; exit 1;; esac`);
    const r = w.run(["--workflow", "deploy.yml"]);
    expect(r.status, r.out).toBe(0);
    const seen = spawnSync("cat", [args], { encoding: "utf8" }).stdout;
    expect(seen).toMatch(/--paginate/);
    expect(seen).toMatch(/repos\/matthiashippe\/control-plane\/actions\/workflows\/deploy\.yml\/runs/);
  });

  it("names no address on stdout or stderr, even when gh fails with one in its message", () => {
    const w = workspace();
    w.gh("echo 'gh: dial tcp 203.0.113.99:443: connect refused' >&2; exit 1");
    const r = w.run(["--runs", "15"]);
    expect(r.status, r.out).toBe(2);
    expect(r.out).not.toMatch(IPV4);
  });

  it("refuses to run without a source", () => {
    const w = workspace();
    const r = w.run([]);
    expect(r.status, r.out).toBe(2);
    expect(r.stdout).not.toMatch(/^total/m);
  });
});

describe("ops/actions-log-addresses.sh counts stranger IPv6 addresses and names none", () => {
  it("counts the same IPv6 address in two spellings once and skips loopback, link-local, unique-local, own and times", () => {
    const w = workspace();
    const own = w.file("own6", "# planted\n2001:db8::9 2026-11-14 planted own address\n");
    w.file(
      "logs/1/0_deploy.txt",
      "05:57:46  2001:db8::7  POST /v1/chat/completions  503\n" +
        "06:00:01  ::1  GET /health  200\n" +
        "06:00:02  fe80::1  GET /health  200\n" +
        "06:00:03  2001:DB8:0:0:0:0:0:7  GET /health  200\n" +
        "06:00:04  2001:db8:0::9  GET /health  200\n" +
        "06:00:05  fd00::1  GET /health  200\n" +
        "06:00:06  febf:ffff::2  GET /health  200\n" +
        "06:00:07  fc12:3456::3  GET /health  200\n" +
        "06:00:08  ::  GET /health  200\n" +
        "(new own address 2001:db8::5, written to own-ips.txt)\n",
    );
    w.file(
      "logs/2/0_deploy.txt",
      "16:41:04  2001:db8::8  GET /v1/credits/balance  502\n" +
        "18:15:25  203.0.113.7  POST /v1/chat/completions  402\n" +
        "18:15:26  ::ffff:203.0.113.7  GET /health  200\n",
    );
    const r = w.run(["--dir", join(w.root, "logs")], { CP_OWN_IPS_FILE: own });
    expect(r.status, r.out).toBe(0);
    expect(r.lines).toEqual(["1 1", "2 2", "total 3"]);
    expect(r.out).not.toMatch(IPV4);
    expect(r.out).not.toMatch(IPV6);
  });

  it("counts an IPv6 visitor in a timestamped Actions log line", () => {
    const w = workspace();
    w.file("logs/3/a.txt", "2026-11-10T20:27:20.6490622Z    20:27:07  2001:db8:1:2:3:4:5:6  POST /v1/chat/completions  502\n");
    const r = w.run(["--dir", join(w.root, "logs")]);
    expect(r.status, r.out).toBe(0);
    expect(r.lines).toEqual(["3 1", "total 1"]);
  });

  it("never counts a clock time or a timestamp as an address", () => {
    const w = workspace();
    w.file(
      "logs/4/a.txt",
      "2026-11-10T20:27:20.6490622Z    20:27:07  10.0.0.1  GET /health  200\n" + "12:34:56:78  10.0.0.2  GET /health  200\n",
    );
    const r = w.run(["--dir", join(w.root, "logs")]);
    expect(r.status, r.out).toBe(0);
    expect(r.lines).toEqual(["4 0", "total 0"]);
  });

  it("skips an own IPv6 address written in another spelling than the list", () => {
    const w = workspace();
    const own = w.file("own6", "2001:0DB8:0000:0000:0000:0000:0000:0042 2026-11-14 planted\n");
    w.file("logs/6/a.txt", "06:00:01  2001:db8::42  GET /health  200\n06:00:02  [2001:db8::43]:443  GET /health  200\n");
    const r = w.run(["--dir", join(w.root, "logs")], { CP_OWN_IPS_FILE: own });
    expect(r.status, r.out).toBe(0);
    expect(r.lines).toEqual(["6 1", "total 1"]);
  });

  it("counts ::ffff: before an IPv4 address once, as that IPv4 address, also in hex", () => {
    const w = workspace();
    w.file(
      "logs/8/a.txt",
      "06:00:01  ::ffff:203.0.113.9  GET /health  200\n" +
        "06:00:02  ::ffff:cb00:7109  GET /health  200\n" +
        "06:00:03  203.0.113.9  GET /health  200\n" +
        "06:00:04  ::ffff:10.0.0.1  GET /health  200\n" +
        "06:00:05  ::ffff:c633:6401  GET /health  200\n",
    );
    const r = w.run(["--dir", join(w.root, "logs")]);
    expect(r.status, r.out).toBe(0);
    expect(r.lines).toEqual(["8 1", "total 1"]);
  });

  it("does not take invalid colon groups or words for addresses", () => {
    const w = workspace();
    w.file(
      "logs/9/a.txt",
      "06:00:01  1:2:3:4:5:6:7:8:9  GET /health  200\n" +
        "06:00:02  2001:db8::1::2  GET /health  200\n" +
        "06:00:03  12345::1  GET /health  200\n" +
        "06:00:04  Foo::Bar  GET /v1/chat:completions  200\n",
    );
    const r = w.run(["--dir", join(w.root, "logs")]);
    expect(r.status, r.out).toBe(0);
    expect(r.lines).toEqual(["9 0", "total 0"]);
  });

  it("does not count an IPv6 address outside a request line", () => {
    const w = workspace();
    w.file("logs/10/a.txt", "(new own address 2001:db8::5, written to own-ips.txt)\nconnect [2001:db8::50]:443 refused\n");
    const r = w.run(["--dir", join(w.root, "logs")]);
    expect(r.status, r.out).toBe(0);
    expect(r.lines).toEqual(["10 0", "total 0"]);
  });
});
