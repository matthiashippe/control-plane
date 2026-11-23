#!/usr/bin/env node
// Starts of the video /video/move.mp4, per week and by the page it was started on (goals/reichweite/03, Punkt 8). This is the lead
// number of the video: how many foreign people pressed play, and whether on the start page or on an error page.
//
//   node ops/video-starts.mjs                      the whole access log over ops/access-log.sh (read only, needs loop.env)
//   node ops/video-starts.mjs --log <file>         Caddy JSON lines from a file instead
//   node ops/video-starts.mjs --own-ips <file>     our own addresses from a file, first word of each line; without it they come
//                                                  from own_ips in ops/own-ips.sh (the list ops/own-ips.txt, the live address and
//                                                  the remembered ones; for --log the offline answer)
//   node ops/video-starts.mjs --days <n>           the window up to now, in days (default 7); CP_NOW in epoch seconds replaces
//                                                  the clock
//
// A start is a foreign address with its first request on /video/move.mp4 (path without query) that answered 200 or 206 inside
// the window; each address counts once per window. Left out: our own addresses, our own checker (user agent
// control-plane-check/1.0) and crawlers (bot, crawl, spider or slurp in the user agent, any case). The page is the path of the
// referrer: `/` is home, `/errors/<slug>` is errors, anything else and no referrer at all is other.
//
// Output, exactly one line:
//   video_starts days <n> total <n> home <n> errors <n> other <n>
// Exit 2 with `log unreadable` when the log cannot be read, which is not a finding about traffic; exit 1 on an unknown argument.
// No line this tool prints names an address.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VIDEO = "/video/move.mp4";
const CHECKER = "control-plane-check/1.0";
const CRAWLER = /bot|crawl|spider|slurp/i;
const DAY = 86400;

/** Our own addresses: the first word of every line that is not empty and not a comment. */
export function ownIpsOf(text) {
  return new Set(String(text).split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => l.split(/\s+/)[0]));
}

const first = (headers, name) => {
  const v = headers?.[name];
  return Array.isArray(v) ? String(v[0] ?? "") : typeof v === "string" ? v : "";
};

/** The page a start came from, by the path of its referrer: home, errors or other. */
function pageOf(referrer) {
  let p = "";
  try { p = new URL(referrer).pathname; } catch { return "other"; }
  if (p === "/") return "home";
  if (/^\/errors\/[a-z0-9-]+\/?$/.test(p)) return "errors";
  return "other";
}

/**
 * Counts the starts of the video. `lines` are Caddy JSON access log lines (strings or parsed objects); `opts` holds `ownIps`
 * (a Set), `now` (epoch seconds) and `days`. Returns `{ total, home, errors, other }`. Nothing in the result names an address.
 */
export function countVideoStarts(lines, opts) {
  const { ownIps, now, days } = opts;
  const from = now - days * DAY;
  const hits = [];
  for (const line of lines) {
    let e = line;
    if (typeof line === "string") {
      if (!line.trim()) continue;
      try { e = JSON.parse(line); } catch { continue; }
    }
    const ts = Number(e?.ts), req = e?.request ?? {}, status = Number(e?.status);
    if (!Number.isFinite(ts) || ts < from || ts > now || (status !== 200 && status !== 206)) continue;
    if (String(req.uri ?? "").split(/[?#]/)[0] !== VIDEO) continue;
    const ip = String(req.client_ip || req.remote_ip || "");
    if (!ip || ownIps.has(ip)) continue;
    const agent = first(req.headers, "User-Agent");
    if (agent.includes(CHECKER) || CRAWLER.test(agent)) continue;
    hits.push({ ts, ip, page: pageOf(first(req.headers, "Referer")) });
  }
  hits.sort((a, b) => a.ts - b.ts);
  const out = { total: 0, home: 0, errors: 0, other: 0 };
  const seen = new Set();
  for (const h of hits) {
    if (seen.has(h.ip)) continue;
    seen.add(h.ip);
    out.total++;
    out[h.page]++;
  }
  return out;
}

/** The one line of the output. */
export function formatVideoStarts(result, days) {
  return `video_starts days ${days} total ${result.total} home ${result.home} errors ${result.errors} other ${result.other}`;
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
    console.error("usage: node ops/video-starts.mjs [--log <file>] [--own-ips <file>] [--days <n>]");
    process.exit(1);
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
  console.log(formatVideoStarts(countVideoStarts(text.split("\n"), { ownIps: own, now, days: args.days }), args.days));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
