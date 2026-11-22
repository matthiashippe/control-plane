#!/usr/bin/env node
// Arrivals on the error pages /errors/{slug}, per week and by where they came from (goals/reichweite/01, Punkt 6). The lead number
// of the error pages is the field `search`: people who typed the error text of their automaton into a search engine and landed here.
//
//   node ops/error-pages-arrivals.mjs                      the whole access log over ops/access-log.sh (read only, needs loop.env)
//   node ops/error-pages-arrivals.mjs --log <file>         Caddy JSON lines from a file instead
//   node ops/error-pages-arrivals.mjs --own-ips <file>     our own addresses from a file, first word of each line; without it they
//                                                          come from own_ips in ops/own-ips.sh (the list ops/own-ips.txt, the live
//                                                          address and the remembered ones; for --log the offline answer)
//   node ops/error-pages-arrivals.mjs --days <n>           the window up to now, in days (default 7); CP_NOW in epoch seconds
//                                                          replaces the clock
//
// An arrival is a foreign address with its first request on a path /errors/<slug> that answered 200 inside the window. Left out:
// our own addresses, our own checker (user agent control-plane-check/1.0) and crawlers (bot, crawl, spider or slurp in the user
// agent, any case). Where it came from is the host of its referrer: `search` when it contains an entry of SEARCH_REFERRERS in
// ops/traffic.sh, `github` for github.com, `other` for anything else and for no referrer at all. The slugs and their order are
// those of ERROR_PAGES in src/public/error-pages.ts, read from the file so this tool runs on plain Node without a build.
//
// Output, exactly four lines:
//   error_pages_arrivals days <n> search <n> github <n> other <n>
//   error_page <slug> search <n> github <n> other <n>          once per page, in the order of ERROR_PAGES
// Exit 2 with `log unreadable` when the log cannot be read, which is not a finding about traffic; exit 1 on an unknown argument.
// No line this tool prints names an address.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECKER = "control-plane-check/1.0";
const CRAWLER = /bot|crawl|spider|slurp/i;
const DAY = 86400;

/** The slugs of ERROR_PAGES, in their order, from the source text of src/public/error-pages.ts. */
export function errorSlugsOf(source) {
  return [...String(source).matchAll(/\bslug:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]);
}

/** The entries of SEARCH_REFERRERS in ops/traffic.sh, so both tools call the same hosts a search engine. */
export function searchHostsOf(trafficSh) {
  const line = /^SEARCH_REFERRERS\s*=\s*\(([^)]*)\)/m.exec(String(trafficSh));
  return line ? [...line[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
}

/** Our own addresses: the first word of every line that is not empty and not a comment. */
export function ownIpsOf(text) {
  return new Set(String(text).split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => l.split(/\s+/)[0]));
}

const first = (headers, name) => {
  const v = headers?.[name];
  return Array.isArray(v) ? String(v[0] ?? "") : typeof v === "string" ? v : "";
};

/** Where a referrer came from: search, github or other. */
function originOf(referrer, searchHosts) {
  let host = "";
  try { host = new URL(referrer).hostname.toLowerCase(); } catch { return "other"; }
  if (searchHosts.some((s) => host.includes(s))) return "search";
  if (host === "github.com" || host.endsWith(".github.com")) return "github";
  return "other";
}

/**
 * Counts the arrivals on the error pages. `lines` are Caddy JSON access log lines (strings or parsed objects); `opts` holds `slugs`,
 * `searchHosts`, `ownIps` (a Set), `now` (epoch seconds) and `days`. Returns `{ total, pages }`, each count `{ search, github, other }`,
 * `pages` keyed by slug in the order of `slugs`. Nothing in the result names an address.
 */
export function countErrorArrivals(lines, opts) {
  const { slugs, searchHosts, ownIps, now, days } = opts;
  const from = now - days * DAY;
  const known = new Set(slugs);
  const zero = () => ({ search: 0, github: 0, other: 0 });
  const total = zero();
  const pages = Object.fromEntries(slugs.map((s) => [s, zero()]));
  const hits = [];
  for (const line of lines) {
    let e = line;
    if (typeof line === "string") {
      if (!line.trim()) continue;
      try { e = JSON.parse(line); } catch { continue; }
    }
    const ts = Number(e?.ts), req = e?.request ?? {};
    if (!Number.isFinite(ts) || ts < from || ts > now || Number(e.status) !== 200) continue;
    const uri = String(req.uri ?? "").split(/[?#]/)[0];
    const m = /^\/errors\/([a-z0-9-]+)\/?$/.exec(uri);
    if (!m || !known.has(m[1])) continue;
    const ip = String(req.client_ip || req.remote_ip || "");
    if (!ip || ownIps.has(ip)) continue;
    const agent = first(req.headers, "User-Agent");
    if (agent.includes(CHECKER) || CRAWLER.test(agent)) continue;
    hits.push({ ts, ip, slug: m[1], origin: originOf(first(req.headers, "Referer"), searchHosts) });
  }
  hits.sort((a, b) => a.ts - b.ts);
  const seen = new Set();
  for (const h of hits) {
    if (seen.has(h.ip)) continue;
    seen.add(h.ip);
    total[h.origin]++;
    pages[h.slug][h.origin]++;
  }
  return { total, pages };
}

/** The four lines of the output. */
export function formatArrivals(result, days, slugs) {
  const c = (x) => `search ${x.search} github ${x.github} other ${x.other}`;
  return [`error_pages_arrivals days ${days} ${c(result.total)}`, ...slugs.map((s) => `error_page ${s} ${c(result.pages[s])}`)];
}

function parseArgs(argv) {
  const out = { log: null, ownIps: null, days: 7 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === "--log" || a === "--own-ips" || a === "--days") {
      if (v === undefined || v.startsWith("--")) return null;
      i++;
      if (a === "--log") out.log = v;
      else if (a === "--own-ips") out.ownIps = v;
      else { if (!/^[1-9][0-9]*$/.test(v)) return null; out.days = Number(v); }
    } else return null;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    console.error("usage: node ops/error-pages-arrivals.mjs [--log <file>] [--own-ips <file>] [--days <n>]");
    process.exit(1);
  }
  const slugs = errorSlugsOf(readFileSync(path.join(ROOT, "src/public/error-pages.ts"), "utf8"));
  const searchHosts = searchHostsOf(readFileSync(path.join(ROOT, "ops/traffic.sh"), "utf8"));
  if (!slugs.length || !searchHosts.length) {
    console.error("error pages arrivals: no slugs in src/public/error-pages.ts or no SEARCH_REFERRERS in ops/traffic.sh");
    process.exit(2);
  }
  let text;
  if (args.log) {
    try { text = readFileSync(args.log, "utf8"); } catch { console.error("log unreadable"); process.exit(2); }
  } else {
    const r = spawnSync("bash", [path.join(ROOT, "ops/access-log.sh")], { encoding: "utf8", maxBuffer: 1 << 30, timeout: 300000 });
    if (r.status !== 0 || !r.stdout) { console.error("log unreadable"); process.exit(2); }
    text = r.stdout;
  }
  let own;
  if (args.ownIps) {
    try { own = ownIpsOf(readFileSync(args.ownIps, "utf8")); } catch { console.error("own addresses unreadable"); process.exit(2); }
  } else {
    // The one rule for our own addresses (test/own-ips-readers.test.ts): own_ips_checked for the live log, own_ips_offline for a
    // log read from disk. Both end non-zero, naming no address, when the list is missing or empty.
    const ask = args.log ? "own_ips_offline" : 'own_ips_checked "$CP_OWN_IPS_FILE"';
    const r = spawnSync("bash", ["-c", `source "$1" && ${ask}`, "own-ips", path.join(ROOT, "ops/own-ips.sh")], { encoding: "utf8", timeout: 60000 });
    if (r.status !== 0 || !r.stdout.trim()) { console.error("own addresses unreadable"); process.exit(2); }
    own = new Set(r.stdout.split(/\s+/).filter(Boolean));
  }
  const now = process.env.CP_NOW ? Number(process.env.CP_NOW) : Math.floor(Date.now() / 1000);
  if (!Number.isFinite(now)) { console.error("CP_NOW is not a number"); process.exit(1); }
  const result = countErrorArrivals(text.split("\n"), { slugs, searchHosts, ownIps: own, now, days: args.days });
  for (const l of formatArrivals(result, args.days, slugs)) console.log(l);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
