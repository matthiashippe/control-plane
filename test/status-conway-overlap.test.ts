import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * ops/status.sh reports in every run whether a wallet that tops up at Conway also pays here (kunden 07): the field
 * `conway_overlap` carries the counts of the line `OVERLAP topped up` of ops/conway-payers.sh (wallets, known, inference,
 * paid, paid_conway_after) and the window of its line `PAYERS`. When the source cannot be read, the field is
 * `{"status": "unknown", "reason": ...}` and never a zero. An output with an address or a hash in it stops the field: none
 * of it is passed on, because the status JSON lands in reports and comments of a public repo.
 *
 * No network and no server: `ssh`, `curl` and `openssl` are fakes on PATH like in test/status-alarm-path.test.ts.
 * CP_CONWAY_PAYERS_CMD replaces the call of ops/conway-payers.sh; the first case runs the real script on its fixtures, the
 * others a planted script with a planted output and exit code. Without CP_CONWAY_PAYERS_CMD the real script runs in its
 * production mode against the fake ssh, which does not answer.
 *
 * STATUS_UNDER_TEST points the test at another copy of ops/status.sh, so the counter-proof can run it against an older one.
 */
const OPS = join(__dirname, "..", "ops");
const STATUS = process.env.STATUS_UNDER_TEST ? resolve(process.env.STATUS_UNDER_TEST) : join(OPS, "status.sh");
const FIXTURES = join(OPS, "fixtures");
const ADDRESS = "0x00000000000000000000000000000000000000a1";
const HASH = "ab".repeat(32);
const ADDRESS_OR_HASH = /0x[0-9a-fA-F]{40}|[0-9a-f]{64}/;

const PAYERS = "PAYERS window 2026-10-19T12:00:00Z to 2026-11-18T12:00:00Z: 16 wallets, 12 topped up, 950.00 USDC, 0 ours left out";
const OVERLAP = (t: number, a: number, b: number, c: number, d: number) =>
  `OVERLAP topped up: ${t} wallets, ${a} known here, ${b} with inference here, ${c} paid here, ${d} paid Conway after their last payment here`;
const ALL = "OVERLAP all: 16 wallets, 0 known here, 0 with inference here, 0 paid here, 0 paid Conway after their last payment here";

type Run = { status: number | null; stdout: string; out: string; json: Record<string, unknown> | undefined };

function run(source: { cmd?: string; output?: string; rc?: number } | null): Run {
  const root = mkdtempSync(join(tmpdir(), "status-conway-overlap-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  const fake = (name: string, lines: string[]) => {
    writeFileSync(join(bin, name), ["#!/bin/sh", ...lines].join("\n") + "\n");
    chmodSync(join(bin, name), 0o755);
  };
  fake("ssh", ["exit 255"]);
  fake("curl", ["exit 7"]);
  fake("openssl", ["exit 1"]);
  const env: Record<string, string> = {
    PATH: `${bin}:/usr/bin:/bin`,
    HOME: root,
    CP_URL: "https://status.invalid",
    CP_DEPLOY_HOST: "root@server.invalid",
    CP_DEPLOY_KEY: join(root, "no-key"),
    CP_HOST: "root@server.invalid",
    CP_SSH_KEY: join(root, "no-key"),
  };
  if (source?.cmd !== undefined) {
    env.CP_CONWAY_PAYERS_CMD = source.cmd;
  } else if (source) {
    const out = join(root, "planted-output");
    writeFileSync(out, source.output ?? "");
    const script = join(root, "planted-payers.sh");
    writeFileSync(script, `#!/bin/sh\ncat ${JSON.stringify(out)}\nexit ${source.rc ?? 0}\n`);
    chmodSync(script, 0o755);
    env.CP_CONWAY_PAYERS_CMD = script;
  }
  const r = spawnSync("bash", [STATUS], { cwd: root, encoding: "utf8", timeout: 120_000, env });
  let json: Record<string, unknown> | undefined;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = undefined;
  }
  return { status: r.status, stdout: r.stdout, out: `${r.stdout}${r.stderr}`, json };
}

describe("ops/status.sh shows the counts of the line OVERLAP topped up as conway_overlap", () => {
  it("counts: the real script on its fixtures arrives as numbers with its window", () => {
    const cmd = `bash ${JSON.stringify(join(OPS, "conway-payers.sh"))} --transfers ${JSON.stringify(
      join(FIXTURES, "conway-payers-transfers.csv"),
    )} --db-json ${JSON.stringify(join(FIXTURES, "conway-payers-db.json"))}`;
    const r = run({ cmd });
    expect(r.status, r.out).toBe(0);
    expect(r.json?.conway_overlap, r.out).toEqual({
      status: "ok",
      window: { from: "2026-10-19T12:00:00Z", to: "2026-11-18T12:00:00Z" },
      wallets: 3,
      known: 2,
      inference: 1,
      paid: 1,
      paid_conway_after: 1,
    });
  });

  it("counts: every number comes from its own place in the line, none is fixed", () => {
    const r = run({ output: [PAYERS, OVERLAP(12, 5, 4, 3, 2), ALL].join("\n") + "\n" });
    expect(r.status, r.out).toBe(0);
    expect(r.json?.conway_overlap, r.out).toEqual({
      status: "ok",
      window: { from: "2026-10-19T12:00:00Z", to: "2026-11-18T12:00:00Z" },
      wallets: 12,
      known: 5,
      inference: 4,
      paid: 3,
      paid_conway_after: 2,
    });
  });

  it("unknown: a source that exits non-zero gives unknown with a reason, never a zero", () => {
    const r = run({ output: [PAYERS, OVERLAP(12, 0, 0, 0, 0), ALL].join("\n") + "\n", rc: 2 });
    expect(r.status, r.out).toBe(0);
    const field = r.json?.conway_overlap as Record<string, unknown> | undefined;
    expect(field?.status, r.out).toBe("unknown");
    expect(typeof field?.reason, r.out).toBe("string");
    expect(Object.keys(field ?? {}).sort(), r.out).toEqual(["reason", "status"]);
  });

  it("unknown: a source without the line OVERLAP topped up or without the window is unknown", () => {
    for (const output of [`${PAYERS}\n${ALL}\n`, `${OVERLAP(12, 5, 4, 3, 2)}\n${ALL}\n`, "", "garbage\n"]) {
      const r = run({ output });
      expect(r.status, r.out).toBe(0);
      expect((r.json?.conway_overlap as Record<string, unknown> | undefined)?.status, `${JSON.stringify(output)}: ${r.out}`).toBe(
        "unknown",
      );
    }
  });

  it("unknown: the production path without an answer of the server is unknown", () => {
    const r = run(null);
    expect(r.status, r.out).toBe(0);
    expect((r.json?.conway_overlap as Record<string, unknown> | undefined)?.status, r.out).toBe("unknown");
  });

  it("no address and no hash: an output that carries one stops the field and none of it is passed on", () => {
    const planted = [
      [`${PAYERS} ${ADDRESS}`, OVERLAP(12, 5, 4, 3, 2), ALL],
      [PAYERS, `${OVERLAP(12, 5, 4, 3, 2)} 0x${"Ab".repeat(20)}`, ALL],
      [PAYERS, OVERLAP(12, 5, 4, 3, 2), ALL, HASH],
    ];
    for (const lines of planted) {
      const r = run({ output: lines.join("\n") + "\n" });
      expect(r.status, r.out).toBe(0);
      const field = r.json?.conway_overlap as Record<string, unknown> | undefined;
      expect(field?.status, r.out).toBe("unknown");
      expect(String(field?.reason), r.out).toMatch(/address or hash/);
      expect(r.out).not.toMatch(ADDRESS_OR_HASH);
    }
  });

  it("the other fields of the report stay as they were", () => {
    const r = run({ output: [PAYERS, OVERLAP(12, 5, 4, 3, 2), ALL].join("\n") + "\n" });
    expect(Object.keys(r.json ?? {}), r.out).toEqual([
      "at",
      "health",
      "cert_days_left",
      "alarm_path",
      "vm",
      "db",
      "openrouter",
      "payto_usdc_base",
      "conway_overlap",
      "card_orders",
    ]);
  });
});
