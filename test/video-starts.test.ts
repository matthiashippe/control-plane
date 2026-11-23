import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error plain ESM module under ops/, no declaration file
import { countVideoStarts, formatVideoStarts, ownIpsOf } from "../ops/video-starts.mjs";

/**
 * The counter behind the lead number of the video (goals/reichweite/03, Punkt 8), without a network: every line below comes from
 * documentation addresses (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24), never from a real visitor.
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOL = path.join(ROOT, "ops", "video-starts.mjs");
const NOW = 1790110000;
const BROWSER = "Mozilla/5.0 (X11; Linux x86_64) Chrome/141.0";
const HOME = "https://automatonhost.com/";
const ERROR_PAGE = "https://automatonhost.com/errors/invalid-or-expired-nonce";
const NONE = { total: 0, home: 0, errors: 0, other: 0 };

type Line = { ts?: number; status?: number; ip?: string; uri?: string; agent?: string; referer?: string };
const line = ({ ts = NOW - 3600, status = 200, ip = "192.0.2.7", uri = "/video/move.mp4", agent = BROWSER, referer }: Line) =>
  JSON.stringify({
    ts, status,
    request: { remote_ip: ip, client_ip: ip, uri, headers: { "User-Agent": [agent], ...(referer === undefined ? {} : { Referer: [referer] }) } },
  });
const count = (lines: string[], own: string[] = []) => countVideoStarts(lines, { ownIps: new Set(own), now: NOW, days: 7 });
const run = (args: string[], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [TOOL, ...args], { encoding: "utf8", timeout: 30000, env: { ...process.env, CP_NOW: String(NOW), ...env } });

describe("ops/video-starts.mjs", () => {
  it("counts a start on the start page", () => {
    expect(count([line({ referer: HOME })])).toEqual({ total: 1, home: 1, errors: 0, other: 0 });
    expect(count([line({ referer: "https://automatonhost.com/?ref=readme" })])).toEqual({ total: 1, home: 1, errors: 0, other: 0 });
    expect(count([line({ uri: "/video/move.mp4?v=2", referer: HOME })])).toEqual({ total: 1, home: 1, errors: 0, other: 0 });
    // No referrer, or a page that is neither the start page nor an error page, is other.
    expect(count([line({})])).toEqual({ total: 1, home: 0, errors: 0, other: 1 });
    expect(count([line({ referer: "https://automatonhost.com/fix" })])).toEqual({ total: 1, home: 0, errors: 0, other: 1 });
    expect(count([line({ referer: "not a url" })])).toEqual({ total: 1, home: 0, errors: 0, other: 1 });
  });

  it("counts a start on an error page", () => {
    expect(count([line({ referer: ERROR_PAGE })])).toEqual({ total: 1, home: 0, errors: 1, other: 0 });
    expect(count([line({ referer: "https://automatonhost.com/errors/credits-never-granted/" })])).toEqual({ total: 1, home: 0, errors: 1, other: 0 });
    expect(count([line({ referer: "https://automatonhost.com/errors/" })])).toEqual({ total: 1, home: 0, errors: 0, other: 1 });
  });

  it("counts an address once per window", () => {
    const r = count([
      line({ ts: NOW - 100, ip: "192.0.2.7", referer: HOME }),
      line({ ts: NOW - 200, ip: "192.0.2.7", referer: ERROR_PAGE }),
      line({ ts: NOW - 50, ip: "192.0.2.7", status: 206, referer: HOME }),
      line({ ts: NOW - 300, ip: "198.51.100.9", referer: HOME }),
    ]);
    // The first request of 192.0.2.7 came from the error page, so that is where its one start counts.
    expect(r).toEqual({ total: 2, home: 1, errors: 1, other: 0 });
  });

  it("counts a 206 range request as a start", () => {
    expect(count([line({ status: 206, referer: HOME })])).toEqual({ total: 1, home: 1, errors: 0, other: 0 });
    for (const status of [304, 404, 416, 500]) expect(count([line({ status, referer: HOME })]), String(status)).toEqual(NONE);
    expect(count([line({ uri: "/video/move-poster.png", referer: HOME })])).toEqual(NONE);
    expect(count([line({ uri: "/video/move.mp4.bak", referer: HOME })])).toEqual(NONE);
  });

  it("leaves out our own addresses and our checker", () => {
    expect(count([line({ ip: "203.0.113.5", referer: HOME })], ["203.0.113.5"])).toEqual(NONE);
    expect(count([line({ agent: "control-plane-check/1.0", referer: HOME })])).toEqual(NONE);
    expect(ownIpsOf("# us\n203.0.113.5 2026-09-19  this machine\n\n")).toEqual(new Set(["203.0.113.5"]));
    // Without --own-ips the tool asks own_ips in ops/own-ips.sh, offline for a log from disk: the list and the remembered ones.
    const dir = mkdtempSync(path.join(os.tmpdir(), "video-starts-own-"));
    try {
      const log = path.join(dir, "access.log"), list = path.join(dir, "list.txt"), seen = path.join(dir, "seen.txt");
      writeFileSync(log, [line({ ip: "203.0.113.5", referer: HOME }), line({ ip: "203.0.113.6", referer: HOME }), line({ ip: "192.0.2.8", referer: ERROR_PAGE })].join("\n") + "\n");
      writeFileSync(list, "203.0.113.5 2026-11-22  test\n");
      writeFileSync(seen, "203.0.113.6 2026-11-22\n");
      const env = { CP_OWN_IPS_FILE: list, CP_OWN_IPS_SEEN: seen, CP_OWN_IPS: "" };
      const r = run(["--log", log], env);
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toBe("video_starts days 7 total 1 home 0 errors 1 other 0\n");
      writeFileSync(list, "# names nobody\n");
      const empty = run(["--log", log], env);
      expect(empty.status).toBe(2);
      expect(empty.stderr).toMatch(/own addresses unreadable/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("leaves out crawlers", () => {
    for (const agent of ["Mozilla/5.0 (compatible; Googlebot/2.1)", "SomeCrawler/1.0", "Spider-X", "Yahoo! Slurp", "bingbot/2.0", "GPTBOT"]) {
      expect(count([line({ agent, referer: HOME })]), agent).toEqual(NONE);
    }
  });

  it("leaves out requests outside the window", () => {
    expect(count([line({ ts: NOW - 7 * 86400 - 1, referer: HOME })])).toEqual(NONE);
    expect(count([line({ ts: NOW + 1, referer: HOME })])).toEqual(NONE);
    expect(count([line({ ts: NOW - 7 * 86400, referer: HOME })])).toEqual({ total: 1, home: 1, errors: 0, other: 0 });
    expect(countVideoStarts([line({ ts: NOW - 2 * 86400, referer: HOME })], { ownIps: new Set(), now: NOW, days: 1 })).toEqual(NONE);
  });

  it("ends with exit 2 when the log cannot be read", () => {
    const r = run(["--log", path.join(os.tmpdir(), "no-such-dir-video-starts", "access.log")]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/log unreadable/);
    expect(r.stdout).toBe("");
  });

  it("prints no address", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "video-starts-"));
    try {
      const log = path.join(dir, "access.log"), own = path.join(dir, "own");
      const lines = [
        line({ ip: "192.0.2.7", status: 206, referer: HOME }),
        line({ ip: "198.51.100.9", referer: ERROR_PAGE }),
        line({ ip: "198.51.100.10" }),
        line({ ip: "203.0.113.5", referer: HOME }),
        "not json at all 192.0.2.99",
      ];
      writeFileSync(log, lines.join("\n") + "\n");
      writeFileSync(own, "203.0.113.5 2026-11-22 test\n");
      const r = run(["--log", log, "--own-ips", own, "--days", "3"]);
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toBe("video_starts days 3 total 3 home 1 errors 1 other 1\n");
      expect(formatVideoStarts({ total: 3, home: 1, errors: 1, other: 1 }, 3)).toBe(r.stdout.trim());
      expect(r.stdout + r.stderr).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
