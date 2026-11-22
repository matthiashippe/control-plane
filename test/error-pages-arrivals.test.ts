import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error plain ESM module under ops/, no declaration file
import { countErrorArrivals, formatArrivals, searchHostsOf, errorSlugsOf, ownIpsOf } from "../ops/error-pages-arrivals.mjs";
import { ERROR_PAGES } from "../src/public/error-pages.js";

/**
 * The counter behind the lead number of the error pages (goals/reichweite/01, Punkt 6), without a network: every line below comes
 * from documentation addresses (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24), never from a real visitor.
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOL = path.join(ROOT, "ops", "error-pages-arrivals.mjs");
const SLUGS = ERROR_PAGES.map((p) => p.slug);
const SEARCH = searchHostsOf(readFileSync(path.join(ROOT, "ops", "traffic.sh"), "utf8"));
const NOW = 1790110000;
const BROWSER = "Mozilla/5.0 (X11; Linux x86_64) Chrome/141.0";

type Line = { ts?: number; status?: number; ip?: string; uri?: string; agent?: string; referer?: string };
const line = ({ ts = NOW - 3600, status = 200, ip = "192.0.2.7", uri = "/errors/invalid-or-expired-nonce", agent = BROWSER, referer }: Line) =>
  JSON.stringify({
    ts, status,
    request: { remote_ip: ip, client_ip: ip, uri, headers: { "User-Agent": [agent], ...(referer === undefined ? {} : { Referer: [referer] }) } },
  });
const count = (lines: string[], own: string[] = []) =>
  countErrorArrivals(lines, { slugs: SLUGS, searchHosts: SEARCH, ownIps: new Set(own), now: NOW, days: 7 });

describe("ops/error-pages-arrivals.mjs", () => {
  it("counts a search arrival on an error page", () => {
    const r = count([line({ referer: "https://www.google.com/" })]);
    expect(r.total).toEqual({ search: 1, github: 0, other: 0 });
    expect(r.pages["invalid-or-expired-nonce"]).toEqual({ search: 1, github: 0, other: 0 });
    expect(count([line({ referer: "https://duckduckgo.com/?q=Invalid+or+expired+nonce" })]).total.search).toBe(1);
  });

  it("counts a github arrival on an error page", () => {
    const r = count([line({ uri: "/errors/credits-never-granted", referer: "https://github.com/Conway-Research/automaton/issues/427" })]);
    expect(r.total).toEqual({ search: 0, github: 1, other: 0 });
    expect(r.pages["credits-never-granted"]).toEqual({ search: 0, github: 1, other: 0 });
  });

  it("counts an arrival without referrer as other", () => {
    expect(count([line({})]).total).toEqual({ search: 0, github: 0, other: 1 });
    expect(count([line({ referer: "https://news.example.com/item" })]).total).toEqual({ search: 0, github: 0, other: 1 });
  });

  it("leaves out our own addresses and our checker", () => {
    expect(count([line({ ip: "203.0.113.5", referer: "https://www.google.com/" })], ["203.0.113.5"]).total).toEqual({ search: 0, github: 0, other: 0 });
    expect(count([line({ agent: "control-plane-check/1.0" })]).total).toEqual({ search: 0, github: 0, other: 0 });
    expect(ownIpsOf("# us\n203.0.113.5 2026-09-19  this machine\n\n")).toEqual(new Set(["203.0.113.5"]));
    // Without --own-ips the tool asks own_ips in ops/own-ips.sh, offline for a log from disk: the list and the remembered ones.
    const dir = mkdtempSync(path.join(os.tmpdir(), "error-pages-own-"));
    try {
      const log = path.join(dir, "access.log"), list = path.join(dir, "list.txt"), seen = path.join(dir, "seen.txt");
      writeFileSync(log, [line({ ip: "203.0.113.5", referer: "https://www.google.com/" }), line({ ip: "203.0.113.6" }), line({ ip: "192.0.2.8" })].join("\n") + "\n");
      writeFileSync(list, "203.0.113.5 2026-11-22  test\n");
      writeFileSync(seen, "203.0.113.6 2026-11-22\n");
      const env = { ...process.env, CP_NOW: String(NOW), CP_OWN_IPS_FILE: list, CP_OWN_IPS_SEEN: seen, CP_OWN_IPS: "" };
      const r = spawnSync(process.execPath, [TOOL, "--log", log], { encoding: "utf8", timeout: 30000, env });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout.split("\n")[0]).toBe("error_pages_arrivals days 7 search 0 github 0 other 1");
      writeFileSync(list, "# names nobody\n");
      const empty = spawnSync(process.execPath, [TOOL, "--log", log], { encoding: "utf8", timeout: 30000, env });
      expect(empty.status).toBe(2);
      expect(empty.stderr).toMatch(/own addresses unreadable/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("leaves out crawlers", () => {
    for (const agent of ["Mozilla/5.0 (compatible; Googlebot/2.1)", "SomeCrawler/1.0", "Spider-X", "Yahoo! Slurp", "bingbot/2.0", "GPTBOT"]) {
      expect(count([line({ agent, referer: "https://www.google.com/" })]).total, agent).toEqual({ search: 0, github: 0, other: 0 });
    }
  });

  it("counts an address once, at its first error page", () => {
    const r = count([
      line({ ts: NOW - 100, uri: "/errors/credits-never-granted", referer: "https://github.com/x" }),
      line({ ts: NOW - 200, uri: "/errors/verify-500-database-error", referer: "https://www.bing.com/" }),
      line({ ts: NOW - 50, uri: "/errors/invalid-or-expired-nonce" }),
    ]);
    expect(r.total).toEqual({ search: 1, github: 0, other: 0 });
    expect(r.pages["verify-500-database-error"]).toEqual({ search: 1, github: 0, other: 0 });
    expect(r.pages["credits-never-granted"]).toEqual({ search: 0, github: 0, other: 0 });
  });

  it("leaves out requests outside the window", () => {
    expect(count([line({ ts: NOW - 7 * 86400 - 1, referer: "https://www.google.com/" })]).total.search).toBe(0);
    expect(count([line({ ts: NOW + 1, referer: "https://www.google.com/" })]).total.search).toBe(0);
    expect(count([line({ ts: NOW - 7 * 86400, referer: "https://www.google.com/" })]).total.search).toBe(1);
  });

  it("leaves out error pages that did not answer 200", () => {
    expect(count([line({ status: 404, uri: "/errors/no-such-page" })]).total).toEqual({ search: 0, github: 0, other: 0 });
    expect(count([line({ status: 500 })]).total).toEqual({ search: 0, github: 0, other: 0 });
    expect(count([line({ status: 304 })]).total).toEqual({ search: 0, github: 0, other: 0 });
    expect(count([line({ uri: "/fix" })]).total).toEqual({ search: 0, github: 0, other: 0 });
  });

  it("uses the search hosts of ops/traffic.sh", () => {
    expect(SEARCH).toEqual(["google.", "bing.", "duckduckgo.", "yandex.", "baidu.", "ecosia.", "search.brave."]);
    for (const host of ["www.google.de", "yandex.ru", "www.ecosia.org", "search.brave.com"]) {
      expect(count([line({ referer: `https://${host}/` })]).total.search, host).toBe(1);
    }
    expect(errorSlugsOf(readFileSync(path.join(ROOT, "src", "public", "error-pages.ts"), "utf8"))).toEqual(SLUGS);
    expect(SLUGS).toEqual(["verify-500-database-error", "invalid-or-expired-nonce", "credits-never-granted"]);
  });

  it("ends with exit 2 when the log cannot be read", () => {
    const r = spawnSync(process.execPath, [TOOL, "--log", path.join(os.tmpdir(), "no-such-dir-error-pages", "access.log")], { encoding: "utf8", timeout: 30000 });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/log unreadable/);
    expect(r.stdout).toBe("");
  });

  it("prints no address", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "error-pages-arrivals-"));
    try {
      const log = path.join(dir, "access.log"), own = path.join(dir, "own");
      writeFileSync(log, [
        line({ ip: "192.0.2.7", referer: "https://www.google.com/" }),
        line({ ip: "198.51.100.9", uri: "/errors/credits-never-granted", referer: "https://github.com/x" }),
        line({ ip: "203.0.113.5" }),
        "not json at all 192.0.2.99",
      ].join("\n") + "\n");
      writeFileSync(own, "203.0.113.5 2026-11-22 test\n");
      const r = spawnSync(process.execPath, [TOOL, "--log", log, "--own-ips", own], { encoding: "utf8", timeout: 30000, env: { ...process.env, CP_NOW: String(NOW) } });
      expect(r.status).toBe(0);
      expect(r.stdout.trim().split("\n")).toEqual(formatArrivals(count([
        line({ ip: "192.0.2.7", referer: "https://www.google.com/" }),
        line({ ip: "198.51.100.9", uri: "/errors/credits-never-granted", referer: "https://github.com/x" }),
      ]), 7, SLUGS));
      expect(r.stdout + r.stderr).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
