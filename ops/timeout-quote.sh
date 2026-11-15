#!/usr/bin/env bash
# Timeout quote of /v1/chat/completions per model and day (abrechnung 02). Reads only.
#
#   ops/timeout-quote.sh                      production: the whole Caddy access log (ops/access-log.sh) joined with the
#                                             inference rows of the ledger and inference_aborts, per model, day and origin
#   ops/timeout-quote.sh --join CADDY ROWS    the same join from files; CADDY may be `-` for stdin
#   ops/timeout-quote.sh --since-rollout      production, database only: calls that carry their own duration (written since
#                                             the rollout of abrechnung 02), per model
#   ops/timeout-quote.sh --rows ROWS          the same from a file of rows; `-` for stdin
#   ops/timeout-quote.sh --compare            production: both measurements over the same period (TQ_SINCE, TQ_UNTIL)
#   ops/timeout-quote.sh --compare-files CADDY ROWS   the same from files
#   ops/timeout-quote.sh --selftest           no network: planted lines, a quote above 0 where a long call was planted and
#                                             exactly 0 where none was
#
# A call counts when it is a POST to /v1/chat/completions that ended with status 200 or was aborted
# by the client (Caddy logs status 0). It is a timeout when it ran at least TQ_LIMIT_S seconds,
# default 59.5: the runtime gives up after 60 seconds on its own clock, which starts before Caddy
# sees the request, so its timeouts end at 59.9 s in the log (three of them on 2026-11-10). A strict
# "over 60.0 s" would count none of them and read as blindness.
#
# The Caddy log has duration and client address but no model; the ledger has the model but, before
# abrechnung 02, no duration. The join takes for each request the ledger or abort row whose
# generation ID (`gen-<unix start>-...`) started within 2 s of the request and was written before
# the request ended plus 15 s (an abort was booked up to 8 s after the client left). A request that
# found none takes the model of a row written while it ran (the coalescer answered it with another
# request's answer); the rest is `unattributed`. Origin is `own` for an address `own_ips` from
# ops/own-ips.sh names (the list in CP_OWN_IPS_FILE, the address this machine is seen with live, every
# address in CP_OWN_IPS_SEEN and in CP_OWN_IPS) and `foreign` otherwise. Only production and --join
# ask `own_ips`; a list that is missing or names no address stops them with exit 2 before any number.
# No address, wallet or balance is ever printed; the database is opened with `readonly: true` inside
# the container.
#
# Output: a markdown table `| model | day | origin | requests | timeouts | quote |`, one line per model,
# day and origin, then one line per model and origin over all days (day `all`).
#
# --compare (abrechnung 03) counts the join ("caddy") and the database alone ("service") over one
# period: TQ_SINCE and TQ_UNTIL as ISO time in UTC, by default from the first ledger row with
# `duration_ms` to the last line. Per model one line `| model | caddy | requests | timeouts | quote |`
# and one line `| model | service | ... |`, then the deviation (caddy minus service) and one line per
# cause with the number of calls and its signed share: `coalesced` (a request without a row of its
# own that ended within 2 s of a request with one: the coalescer answered both at the same moment),
# `clock` (a timeout on Caddy's clock and not on the service's `duration_ms`, or the other way round),
# `unmatched` (a request without a row, or a row without a request). The shares add up to the
# deviation; if they do not, the tool exits 3 without printing a cause.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIMIT_S="${TQ_LIMIT_S:-59.5}"
# The ways that do not tell own from foreign (--rows, --since-rollout, --compare, --compare-files,
# --selftest) pass this in place of the own list, so the counter keeps its argument positions.
NO_OWN_LIST="-no-own-list-"

# Writes our own addresses to $1, one per line, from `own_ips` (ops/own-ips.sh). Exits 2 with one
# line on stderr when the list `own_ips` reads is missing, names no address itself, or `own_ips`
# fails: a missing or empty list must never read as "every caller is foreign", and the live address
# or a remembered one must not stand in for the list. The stderr of `own_ips` is dropped because it
# can name the live address.
own_list() {
  local target="$1" file list
  # shellcheck source=ops/own-ips.sh
  source "$ROOT/ops/own-ips.sh"
  file="$CP_OWN_IPS_FILE"
  if [ ! -f "$file" ]; then
    echo "TIMEOUT QUOTE FAIL: own_ips has no list of our own addresses ($file is missing), so nothing is counted." >&2
    exit 2
  fi
  # Read the way `own_ips` reads it: a line not starting with # that has a first field.
  if ! awk '!/^#/ && NF { n++ } END { exit !n }' "$file"; then
    echo "TIMEOUT QUOTE FAIL: own_ips has an empty list of our own addresses ($file names none), so nothing is counted." >&2
    exit 2
  fi
  # stdin stays with the caller: --join reads the Caddy log from it when CADDY is `-`, and ssh would eat it.
  if ! list=$(own_ips 2>/dev/null </dev/null); then
    echo "TIMEOUT QUOTE FAIL: own_ips could not name our own addresses, so nothing is counted." >&2
    exit 2
  fi
  printf '%s\n' "$list" | tr ' ' '\n' | grep -v '^$' >"$target"
  if [ ! -s "$target" ]; then
    echo "TIMEOUT QUOTE FAIL: own_ips named no own address, so nothing is counted." >&2
    exit 2
  fi
}

# The rows the database gives, one JSON object per line, without address: when the row was written,
# the generation ID, the model bought and the duration when the row carries one.
# shellcheck disable=SC2016
ROWS_JS='const file = process.argv[1] || "/data/cp.db"; const db = require("better-sqlite3")(file, { readonly: true }); const out = []; for (const r of db.prepare("SELECT created_at AS at, ref, json_extract(meta, ?) AS model, json_extract(meta, ?) AS duration_ms FROM ledger WHERE kind = ?").iterate("$.model", "$.duration_ms", "inference")) out.push(JSON.stringify({ src: "ledger", ...r })); const t = db.prepare("SELECT name FROM sqlite_master WHERE type = ? AND name = ?").get("table", "inference_aborts"); if (t) for (const r of db.prepare("SELECT created_at AS at, ref, model, duration_ms FROM inference_aborts").iterate()) out.push(JSON.stringify({ src: "abort", ...r })); if (out.length) console.log(out.join("\n"));'

# The counting, the same code for production and selftest.
# shellcheck disable=SC2016
COUNT_JS='
const fs = require("fs");
const [mode, a, b, ownFile, limitS] = process.argv.slice(1);
const limit = Number(limitS);
const read = (f) => (f === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(f, "utf8"));
const parseLines = (text) => text.split("\n").filter((l) => l.trim()).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
const rows = (f) => parseLines(read(f)).filter((r) => r && typeof r.model === "string" && typeof r.at === "string").map((r) => {
  const m = /^gen-(\d{9,11})-/.exec(r.ref || "");
  return { ...r, t: Date.parse(r.at) / 1000, start: m ? Number(m[1]) : null, used: false };
});
const table = new Map();
const add = (model, day, origin, timeout) => {
  for (const d of [day, "all"]) {
    const k = [model, d, origin].join("\t");
    const e = table.get(k) || { n: 0, to: 0 };
    e.n += 1;
    if (timeout) e.to += 1;
    table.set(k, e);
  }
};
const print = (header) => {
  console.log(header);
  console.log("| model | day | origin | requests | timeouts | quote |");
  console.log("|---|---|---|---:|---:|---:|");
  const keys = [...table.keys()].sort((x, y) => {
    const [mx, dx, ox] = x.split("\t"), [my, dy, oy] = y.split("\t");
    return mx.localeCompare(my) || (dx === "all") - (dy === "all") || dx.localeCompare(dy) || ox.localeCompare(oy);
  });
  for (const k of keys) {
    const [model, day, origin] = k.split("\t");
    const e = table.get(k);
    console.log(`| ${model} | ${day} | ${origin} | ${e.n} | ${e.to} | ${((100 * e.to) / e.n).toFixed(1)} % |`);
  }
  if (!keys.length) console.log("no calls");
};
if (mode === "join") {
  const own = new Set(read(ownFile).split("\n").map((l) => l.replace(/#.*/, "").trim().split(/\s+/)[0]).filter(Boolean));
  if (!own.size) { console.error("own address list is empty or missing: " + ownFile); process.exit(2); }
  const reqs = parseLines(read(a)).filter((j) => j.request && j.request.method === "POST" && /^\/v1\/chat\/completions(\?|$)/.test(j.request.uri || "") && (j.status === 200 || j.status === 0) && typeof j.ts === "number" && typeof j.duration === "number")
    .map((j) => ({ end: j.ts, start: j.ts - j.duration, d: j.duration, ip: j.request.client_ip || j.request.remote_ip || "" }))
    .sort((x, y) => x.end - y.end);
  const rs = rows(b);
  let unattributed = 0;
  for (const r of reqs) {
    let best = null, bd = Infinity;
    for (const x of rs) {
      if (x.used || x.t < r.start - 1 || x.t > r.end + 15) continue;
      const dist = x.start !== null ? Math.abs(x.start - r.start) : Math.abs(x.t - r.end);
      if (x.start !== null && dist > 2) continue;
      if (dist < bd) { bd = dist; best = x; }
    }
    if (best) best.used = true;
    else best = rs.find((x) => x.t >= r.start - 1 && x.t <= r.end + 1) || null;
    if (!best) unattributed += 1;
    add(best ? best.model : "unattributed", new Date(r.end * 1000).toISOString().slice(0, 10), own.has(r.ip) ? "own" : "foreign", r.d >= limit);
  }
  const first = reqs.length ? new Date(reqs[0].end * 1000).toISOString().slice(0, 16) : "-";
  const last = reqs.length ? new Date(reqs[reqs.length - 1].end * 1000).toISOString().slice(0, 16) : "-";
  print(`period ${first} to ${last} UTC, ${reqs.length} calls, ${unattributed} unattributed, timeout from ${limit} s`);
} else if (mode === "rows") {
  const rs = rows(a).filter((r) => Number.isFinite(Number(r.duration_ms)) && r.duration_ms !== null);
  const since = b || (rs.filter((r) => r.src === "ledger").map((r) => r.at).sort()[0] ?? "");
  const kept = rs.filter((r) => since && r.at >= since);
  for (const r of kept) add(r.model, r.at.slice(0, 10), r.src === "abort" ? "aborted" : "answered", Number(r.duration_ms) >= limit * 1000);
  print(`since ${since || "the rollout (no call with a duration yet)"}, ${kept.length} calls, timeout from ${limit} s`);
} else if (mode === "compare") {
  // Both measurements over the same period (abrechnung 03). Every Caddy request is matched to its own
  // row first (generation start within 2 s, written before the request ended plus 15 s); then each
  // request and each row lands in exactly one class:
  //   pair       a request with its own row that carries a duration: counted by both measurements,
  //              a timeout on one clock and not on the other is cause "clock"
  //   coalesced  a request without its own row that was answered by a row written while it ran
  //   unmatched  a request without any row (or whose row has no duration), or a row without a request
  // A pair and a coalesced request are in the period by the time their row was written, everything
  // else by its own time, so a request and the row that answered it are never split by a boundary.
  const sinceArg = process.argv[6] || "", untilArg = process.argv[7] || "";
  const parseIso = (name, v) => {
    if (!v) return null;
    const t = Date.parse(v);
    if (!/^\d{4}-\d{2}-\d{2}T/.test(v) || !Number.isFinite(t)) { console.error(`${name} is no ISO time in UTC: ${v}`); process.exit(2); }
    return t / 1000;
  };
  const sinceSet = parseIso("TQ_SINCE", sinceArg), untilSet = parseIso("TQ_UNTIL", untilArg);
  const reqs = parseLines(read(a)).filter((j) => j.request && j.request.method === "POST" && /^\/v1\/chat\/completions(\?|$)/.test(j.request.uri || "") && (j.status === 200 || j.status === 0) && typeof j.ts === "number" && typeof j.duration === "number")
    .map((j) => ({ end: j.ts, start: j.ts - j.duration, d: j.duration }))
    .sort((x, y) => x.end - y.end);
  const rs = rows(b);
  const hasDuration = (x) => x.duration_ms !== null && x.duration_ms !== undefined && Number.isFinite(Number(x.duration_ms));
  const firstTimed = rs.filter((x) => hasDuration(x) && x.src === "ledger").map((x) => x.t).sort((p, q) => p - q)[0];
  const since = sinceSet ?? firstTimed ?? null;
  if (since === null) { console.error("no row with a duration yet, nothing to compare; set TQ_SINCE"); process.exit(2); }
  const items = [];
  // First pass: every request that finds its own row. Their end times are what a coalesced retry is matched against.
  const paired = [], lone = [];
  for (const r of reqs) {
    let best = null, bd = Infinity;
    for (const x of rs) {
      if (x.used || x.t < r.start - 1 || x.t > r.end + 15) continue;
      const dist = x.start !== null ? Math.abs(x.start - r.start) : Math.abs(x.t - r.end);
      if (x.start !== null && dist > 2) continue;
      if (dist < bd) { bd = dist; best = x; }
    }
    if (!best) { lone.push(r); continue; }
    best.used = true;
    const item = hasDuration(best)
      ? { kind: "pair", at: best.t, model: best.model, caddyTo: r.d >= limit, serviceTo: Number(best.duration_ms) >= limit * 1000 }
      : { kind: "caddy-only", at: r.end, model: best.model, caddyTo: r.d >= limit };
    items.push(item);
    paired.push({ end: r.end, item });
  }
  // Second pass: a request without a row of its own is coalesced only when it ended within COALESCE_S of a request that
  // has one, because the coalescer hands leader and retry the same answer at the same moment. A row merely written while
  // it ran is not enough: nearly every 60 s call overlaps a row of another request, and a timeout without an abort row (the lost
  // booking this comparison exists to find) would hide under coalesced.
  const COALESCE_S = 2;
  for (const r of lone) {
    let leader = null, ld = Infinity;
    for (const p of paired) {
      const dist = Math.abs(p.end - r.end);
      if (dist <= COALESCE_S && dist < ld) { ld = dist; leader = p.item; }
    }
    if (leader) items.push({ kind: "coalesced", at: leader.at, model: leader.model, caddyTo: r.d >= limit });
    else items.push({ kind: "caddy-only", at: r.end, model: "unattributed", caddyTo: r.d >= limit });
  }
  for (const x of rs) if (!x.used && hasDuration(x)) items.push({ kind: "service-only", at: x.t, model: x.model, serviceTo: Number(x.duration_ms) >= limit * 1000 });
  const until = untilSet ?? Math.max(...items.map((i) => i.at), since);
  const kept = items.filter((i) => i.at >= since && i.at <= until);
  const per = new Map();
  const bump = (model, side, to) => {
    const e = per.get(model) || { caddy: { n: 0, to: 0 }, service: { n: 0, to: 0 } };
    if (side) { e[side].n += 1; if (to) e[side].to += 1; }
    per.set(model, e);
  };
  const cause = { coalesced: { n: 0, req: 0, to: 0 }, clock: { n: 0, req: 0, to: 0 }, unmatched: { n: 0, req: 0, to: 0 } };
  for (const i of kept) {
    if (i.kind === "pair") {
      bump(i.model, "caddy", i.caddyTo); bump(i.model, "service", i.serviceTo);
      if (i.caddyTo !== i.serviceTo) { cause.clock.n += 1; cause.clock.to += i.caddyTo ? 1 : -1; }
    } else if (i.kind === "coalesced") {
      bump(i.model, "caddy", i.caddyTo); bump(i.model, null);
      cause.coalesced.n += 1; cause.coalesced.req += 1; if (i.caddyTo) cause.coalesced.to += 1;
    } else if (i.kind === "caddy-only") {
      bump(i.model, "caddy", i.caddyTo); bump(i.model, null);
      cause.unmatched.n += 1; cause.unmatched.req += 1; if (i.caddyTo) cause.unmatched.to += 1;
    } else {
      bump(i.model, "service", i.serviceTo); bump(i.model, null);
      cause.unmatched.n += 1; cause.unmatched.req -= 1; if (i.serviceTo) cause.unmatched.to -= 1;
    }
  }
  const quote = (e) => (e.n ? `${((100 * e.to) / e.n).toFixed(1)} %` : "-");
  const iso = (s) => new Date(s * 1000).toISOString();
  console.log(`period ${iso(since)} to ${iso(until)} UTC, timeout from ${limit} s`);
  console.log("| model | measure | requests | timeouts | quote |");
  console.log("|---|---|---:|---:|---:|");
  const tot = { caddy: { n: 0, to: 0 }, service: { n: 0, to: 0 } };
  for (const model of [...per.keys()].sort((x, y) => (x === "unattributed") - (y === "unattributed") || x.localeCompare(y))) {
    const e = per.get(model);
    for (const side of ["caddy", "service"]) {
      console.log(`| ${model} | ${side} | ${e[side].n} | ${e[side].to} | ${quote(e[side])} |`);
      tot[side].n += e[side].n; tot[side].to += e[side].to;
    }
  }
  if (!per.size) console.log("no calls");
  const devReq = tot.caddy.n - tot.service.n, devTo = tot.caddy.to - tot.service.to;
  console.log(`deviation requests: ${devReq} (caddy ${tot.caddy.n}, service ${tot.service.n})`);
  console.log(`deviation timeouts: ${devTo} (caddy ${tot.caddy.to}, service ${tot.service.to})`);
  const sumReq = cause.coalesced.req + cause.clock.req + cause.unmatched.req;
  const sumTo = cause.coalesced.to + cause.clock.to + cause.unmatched.to;
  if (sumReq !== devReq || sumTo !== devTo) {
    console.error(`causes do not add up: requests ${sumReq} vs ${devReq}, timeouts ${sumTo} vs ${devTo}`);
    process.exit(3);
  }
  for (const [name, c] of Object.entries(cause)) console.log(`cause ${name}: ${c.n} (requests ${c.req}, timeouts ${c.to})`);
} else {
  console.error("unknown mode " + mode);
  process.exit(2);
}
'

count() { NODE_NO_WARNINGS=1 node -e "$COUNT_JS" "$@"; }

load_env() {
  if [ -z "${CP_HOST:-}" ] && [ -f "$HOME/.config/control-plane/loop.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$HOME/.config/control-plane/loop.env"
    set +a
  fi
  KEY="${CP_SSH_KEY:-${CP_DEPLOY_KEY:-}}"
  if [ -z "${CP_HOST:-}" ] || [ -z "$KEY" ]; then
    echo "TIMEOUT QUOTE FAIL: CP_HOST and CP_SSH_KEY are not set (~/.config/control-plane/loop.env)" >&2
    exit 2
  fi
}

fetch_rows() { # $1 = target file
  ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 "$CP_HOST" "docker exec deploy-cp-1 node -e $(printf %q "$ROWS_JS") /data/cp.db" >"$1" 2>/dev/null
}

production() {
  load_env
  TQ_DIR="$(mktemp -d)"
  trap 'rm -rf "$TQ_DIR"' EXIT
  CP_SSH_KEY="$KEY" CP_HOST="$CP_HOST" bash "$ROOT/ops/access-log.sh" >"$TQ_DIR/caddy.jsonl" || {
    echo "TIMEOUT QUOTE FAIL: access log not readable" >&2
    exit 2
  }
  fetch_rows "$TQ_DIR/rows.jsonl" || {
    echo "TIMEOUT QUOTE FAIL: ledger not readable" >&2
    exit 2
  }
  CP_HOST="$CP_HOST" CP_SSH_KEY="$KEY" own_list "$TQ_DIR/own.txt"
  count join "$TQ_DIR/caddy.jsonl" "$TQ_DIR/rows.jsonl" "$TQ_DIR/own.txt" "$LIMIT_S"
}

compare() {
  load_env
  TQ_DIR="$(mktemp -d)"
  trap 'rm -rf "$TQ_DIR"' EXIT
  CP_SSH_KEY="$KEY" CP_HOST="$CP_HOST" bash "$ROOT/ops/access-log.sh" >"$TQ_DIR/caddy.jsonl" || {
    echo "TIMEOUT QUOTE FAIL: access log not readable" >&2
    exit 2
  }
  fetch_rows "$TQ_DIR/rows.jsonl" || {
    echo "TIMEOUT QUOTE FAIL: ledger not readable" >&2
    exit 2
  }
  count compare "$TQ_DIR/caddy.jsonl" "$TQ_DIR/rows.jsonl" "$NO_OWN_LIST" "$LIMIT_S" "${TQ_SINCE:-}" "${TQ_UNTIL:-}"
}

join_files() { # $1 = CADDY file or -, $2 = ROWS file; own_ips with CP_HOST and CP_SSH_KEY as the environment sets them
  TQ_DIR="$(mktemp -d)"
  trap 'rm -rf "$TQ_DIR"' EXIT
  own_list "$TQ_DIR/own.txt"
  count join "$1" "$2" "$TQ_DIR/own.txt" "$LIMIT_S"
}

since_rollout() {
  load_env
  TQ_DIR="$(mktemp -d)"
  trap 'rm -rf "$TQ_DIR"' EXIT
  fetch_rows "$TQ_DIR/rows.jsonl" || {
    echo "TIMEOUT QUOTE FAIL: ledger not readable" >&2
    exit 2
  }
  count rows "$TQ_DIR/rows.jsonl" "${TQ_SINCE:-}" "$NO_OWN_LIST" "$LIMIT_S"
}

selftest() {
  # No network in here, by construction: any attempt is an error.
  curl() { echo "selftest must not reach the network (curl)" >&2; return 99; }
  ssh() { echo "selftest must not reach the network (ssh)" >&2; return 99; }

  local dir all_ok=1 out
  dir="$(mktemp -d)"
  trap 'rm -rf "$dir"' RETURN

  # Documentation addresses only (RFC 5737): one is ours, one is a stranger.
  printf '# planted\n192.0.2.10 2026-11-10  planted own address\n' >"$dir/own.txt"
  local own=192.0.2.10 stranger=198.51.100.7
  # A Caddy line: end time (unix), duration in s, status, client address.
  line() { printf '{"level":"info","ts":%s,"logger":"http.log.access.log0","request":{"client_ip":"%s","remote_ip":"%s","method":"POST","uri":"/v1/chat/completions"},"duration":%s,"status":%s}\n' "$1" "$4" "$4" "$2" "$3"; }
  # A ledger row: written at (unix), generation start (unix), model.
  row() { printf '{"src":"ledger","at":"%s","ref":"gen-%s-planted","model":"%s","duration_ms":null}\n' "$(date -u -d "@$1" +%Y-%m-%dT%H:%M:%S.000Z)" "$2" "$3"; }

  # Day 2026-11-10 (from 1794268800): a foreign client times out once on gpt-5.2 after 59.9 s (booked 7 s later), a long but
  # answered gpt-5-mini call of 30 s, a coalesced retry answered with the same row, and our own quick call. Decoys the join must
  # not count: a GET, a 401 and a 59.9 s call on another path.
  local t=1794290000
  {
    line $((t + 60)) 59.9 0 "$stranger"
    line $((t + 120)) 30.0 200 "$stranger"
    line $((t + 66)) 5.8 200 "$stranger"
    line $((t + 200)) 2.0 200 "$own"
    printf '{"ts":%s,"request":{"client_ip":"%s","method":"GET","uri":"/v1/chat/completions"},"duration":70,"status":200}\n' $((t + 300)) "$stranger"
    printf '{"ts":%s,"request":{"client_ip":"%s","method":"POST","uri":"/v1/chat/completions"},"duration":70,"status":401}\n' $((t + 310)) "$stranger"
    printf '{"ts":%s,"request":{"client_ip":"%s","method":"POST","uri":"/v1/check"},"duration":59.9,"status":0}\n' $((t + 320)) "$stranger"
  } >"$dir/long.jsonl"
  {
    row $((t + 67)) $((t + 0)) openai/gpt-5.2
    row $((t + 120)) $((t + 90)) openai/gpt-5-mini
    row $((t + 200)) $((t + 198)) openai/gpt-5-mini
  } >"$dir/long-rows.jsonl"
  # The same day without any long call: every request well under the limit.
  {
    line $((t + 10)) 9.0 200 "$stranger"
    line $((t + 120)) 30.0 200 "$stranger"
    line $((t + 200)) 2.0 200 "$own"
  } >"$dir/short.jsonl"
  {
    row $((t + 10)) $((t + 1)) openai/gpt-5.2
    row $((t + 120)) $((t + 90)) openai/gpt-5-mini
    row $((t + 200)) $((t + 198)) openai/gpt-5-mini
  } >"$dir/short-rows.jsonl"

  expect() { # $1 = name, $2 = output, $3 = exact table line that must be there
    if grep -qxF -- "$3" <<<"$2"; then
      echo "ok   $1: $3"
    else
      echo "FAIL $1: missing $3"
      all_ok=0
    fi
  }

  out="$(count join "$dir/long.jsonl" "$dir/long-rows.jsonl" "$dir/own.txt" "$LIMIT_S")" || all_ok=0
  echo "$out" | sed 's/^/  planted long: /'
  expect "long call counted, retry joined to its model" "$out" "| openai/gpt-5.2 | 2026-11-10 | foreign | 2 | 1 | 50.0 % |"
  expect "long call counted over all days" "$out" "| openai/gpt-5.2 | all | foreign | 2 | 1 | 50.0 % |"
  expect "30 s is no timeout" "$out" "| openai/gpt-5-mini | 2026-11-10 | foreign | 1 | 0 | 0.0 % |"
  expect "own address apart" "$out" "| openai/gpt-5-mini | 2026-11-10 | own | 1 | 0 | 0.0 % |"
  expect "decoys left out" "$out" "period 2026-11-10T05:54 to 2026-11-10T05:56 UTC, 4 calls, 0 unattributed, timeout from $LIMIT_S s"

  out="$(count join "$dir/short.jsonl" "$dir/short-rows.jsonl" "$dir/own.txt" "$LIMIT_S")" || all_ok=0
  echo "$out" | sed 's/^/  planted short: /'
  expect "no long call, quote 0" "$out" "| openai/gpt-5.2 | all | foreign | 1 | 0 | 0.0 % |"
  expect "no long call, quote 0" "$out" "| openai/gpt-5-mini | all | foreign | 1 | 0 | 0.0 % |"
  if grep -E '^\| openai/' <<<"$out" | grep -vqE '\| 0 \| 0\.0 % \|$'; then
    echo "FAIL no long call: a quote above 0"
    all_ok=0
  fi

  # Without an own list the join refuses instead of calling us strangers.
  if count join "$dir/long.jsonl" "$dir/long-rows.jsonl" "$dir/missing.txt" "$LIMIT_S" >/dev/null 2>&1; then
    echo "FAIL missing own list accepted"
    all_ok=0
  else
    echo "ok   missing own list refused"
  fi

  # Database only, since the rollout: a row without duration (before) is left out, a long abort and a short answer count.
  {
    printf '{"src":"ledger","at":"2026-11-11T09:00:00.000Z","ref":"gen-1","model":"openai/gpt-5.2","duration_ms":null}\n'
    printf '{"src":"ledger","at":"2026-11-12T09:00:00.000Z","ref":"gen-2","model":"openai/gpt-5.2","duration_ms":12000}\n'
    printf '{"src":"abort","at":"2026-11-12T10:00:00.000Z","ref":null,"model":"openai/gpt-5.2","duration_ms":59950}\n'
    printf '{"src":"abort","at":"2026-11-10T05:37:53.000Z","ref":null,"model":"openai/gpt-5.2","duration_ms":59900}\n'
  } >"$dir/since.jsonl"
  out="$(count rows "$dir/since.jsonl" "" "$dir/own.txt" "$LIMIT_S")" || all_ok=0
  echo "$out" | sed 's/^/  planted since: /'
  expect "since rollout, long abort" "$out" "| openai/gpt-5.2 | 2026-11-12 | aborted | 1 | 1 | 100.0 % |"
  expect "since rollout, short answer" "$out" "| openai/gpt-5.2 | 2026-11-12 | answered | 1 | 0 | 0.0 % |"
  expect "before the rollout left out" "$out" "since 2026-11-12T09:00:00.000Z, 2 calls, timeout from $LIMIT_S s"
  printf '{"src":"ledger","at":"2026-11-12T09:00:00.000Z","ref":"gen-2","model":"openai/gpt-5.2","duration_ms":12000}\n' >"$dir/since-short.jsonl"
  out="$(count rows "$dir/since-short.jsonl" "" "$dir/own.txt" "$LIMIT_S")" || all_ok=0
  expect "since rollout, no long call, quote 0" "$out" "| openai/gpt-5.2 | all | answered | 1 | 0 | 0.0 % |"

  # Both measurements over the same period (abrechnung 03). `iso` turns a unix time into the form the rows carry.
  iso() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%S.000Z; }
  trow() { printf '{"src":"ledger","at":"%s","ref":"gen-%s-planted","model":"%s","duration_ms":%s}\n' "$(iso "$1")" "$2" "$3" "$4"; }
  local c=1794330000
  # Equal: every request has its own row and both clocks agree, one of them a timeout on both.
  {
    line $((c + 10)) 9.0 200 "$stranger"
    line $((c + 130)) 59.9 0 "$stranger"
    line $((c + 200)) 2.0 200 "$own"
  } >"$dir/cmp-equal.jsonl"
  {
    trow $((c + 11)) $((c + 1)) openai/gpt-5.2 8900
    printf '{"src":"abort","at":"%s","ref":null,"model":"openai/gpt-5.2","duration_ms":59800}\n' "$(iso $((c + 135)))"
    trow $((c + 200)) $((c + 198)) openai/gpt-5-mini 1900
  } >"$dir/cmp-equal-rows.jsonl"
  out="$(count compare "$dir/cmp-equal.jsonl" "$dir/cmp-equal-rows.jsonl" "$dir/own.txt" "$LIMIT_S" "" "")" || all_ok=0
  echo "$out" | sed 's/^/  planted equal: /'
  expect "compare equal, caddy" "$out" "| openai/gpt-5.2 | caddy | 2 | 1 | 50.0 % |"
  expect "compare equal, service" "$out" "| openai/gpt-5.2 | service | 2 | 1 | 50.0 % |"
  expect "compare equal, no deviation in requests" "$out" "deviation requests: 0 (caddy 3, service 3)"
  expect "compare equal, no deviation in timeouts" "$out" "deviation timeouts: 0 (caddy 1, service 1)"
  expect "compare equal, cause coalesced 0" "$out" "cause coalesced: 0 (requests 0, timeouts 0)"
  expect "compare equal, cause clock 0" "$out" "cause clock: 0 (requests 0, timeouts 0)"
  expect "compare equal, cause unmatched 0" "$out" "cause unmatched: 0 (requests 0, timeouts 0)"

  # Causes: a leader of 59.7 s in the log and 58.9 s `duration_ms` (clock), a retry the coalescer answered (coalesced).
  # A pair and a request without a row outside TQ_SINCE and TQ_UNTIL must count in neither measurement.
  {
    line $((c - 3600)) 59.9 0 "$stranger"
    line $((c + 60)) 59.7 200 "$stranger"
    line $((c + 60)) 20.0 200 "$stranger"
    line $((c + 300)) 3.0 200 "$stranger"
    line $((c + 7200)) 59.9 0 "$stranger"
  } >"$dir/cmp-causes.jsonl"
  {
    printf '{"src":"abort","at":"%s","ref":null,"model":"openai/gpt-5.2","duration_ms":59900}\n' "$(iso $((c - 3595)))"
    trow $((c + 61)) $((c + 1)) openai/gpt-5.2 58900
    trow $((c + 300)) $((c + 297)) openai/gpt-5-mini 2800
  } >"$dir/cmp-causes-rows.jsonl"
  out="$(count compare "$dir/cmp-causes.jsonl" "$dir/cmp-causes-rows.jsonl" "$dir/own.txt" "$LIMIT_S" "$(iso "$c")" "$(iso $((c + 3600)))")" || all_ok=0
  echo "$out" | sed 's/^/  planted causes: /'
  expect "compare causes, caddy counts the retry and the long leader" "$out" "| openai/gpt-5.2 | caddy | 2 | 1 | 50.0 % |"
  expect "compare causes, service counts the leader only, under the limit" "$out" "| openai/gpt-5.2 | service | 1 | 0 | 0.0 % |"
  expect "compare causes, cause coalesced 1" "$out" "cause coalesced: 1 (requests 1, timeouts 0)"
  expect "compare causes, cause clock 1" "$out" "cause clock: 1 (requests 0, timeouts 1)"
  expect "compare causes, causes add up to the deviation in requests" "$out" "deviation requests: 1 (caddy 3, service 2)"
  expect "compare causes, causes add up to the deviation in timeouts" "$out" "deviation timeouts: 1 (caddy 1, service 0)"
  expect "compare period, lines outside counted in neither" "$out" "cause unmatched: 0 (requests 0, timeouts 0)"
  expect "compare period, the period as set" "$out" "period $(iso "$c") to $(iso $((c + 3600))) UTC, timeout from $LIMIT_S s"

  # Overlap: a lost call (59.9 s, status 0, no row of its own) runs while the leader's row is written, but ends 20 s after
  # every request that has a row. It is unmatched, not coalesced; the retry that ends next to the leader stays coalesced.
  {
    line $((c + 60)) 20.0 200 "$stranger"
    line $((c + 61)) 5.0 200 "$stranger"
    line $((c + 80)) 59.9 0 "$stranger"
  } >"$dir/cmp-overlap.jsonl"
  trow $((c + 60)) $((c + 40)) openai/gpt-5.2 19900 >"$dir/cmp-overlap-rows.jsonl"
  out="$(count compare "$dir/cmp-overlap.jsonl" "$dir/cmp-overlap-rows.jsonl" "$dir/own.txt" "$LIMIT_S" "" "")" || all_ok=0
  echo "$out" | sed 's/^/  planted overlap: /'
  expect "compare overlap, the lost call is unmatched" "$out" "cause unmatched: 1 (requests 1, timeouts 1)"
  expect "compare overlap, only the retry next to the leader is coalesced" "$out" "cause coalesced: 1 (requests 1, timeouts 0)"
  expect "compare overlap, the lost call keeps no model" "$out" "| unattributed | caddy | 1 | 1 | 100.0 % |"
  expect "compare overlap, causes add up to the deviation" "$out" "deviation timeouts: 1 (caddy 1, service 0)"

  if [ "$all_ok" = 1 ]; then
    echo "TIMEOUT QUOTE SELFTEST OK"
    return 0
  fi
  echo "TIMEOUT QUOTE SELFTEST FAIL"
  return 1
}

case "${1:-}" in
  --selftest) selftest ;;
  --join) join_files "${2:?CADDY file or -}" "${3:?ROWS file}" ;;
  --rows) count rows "${2:?ROWS file or -}" "${TQ_SINCE:-}" "$NO_OWN_LIST" "$LIMIT_S" ;;
  --since-rollout) since_rollout ;;
  --compare) compare ;;
  --compare-files) count compare "${2:?CADDY file or -}" "${3:?ROWS file}" "$NO_OWN_LIST" "$LIMIT_S" "${TQ_SINCE:-}" "${TQ_UNTIL:-}" ;;
  "") production ;;
  -h | --help) sed -n '2,44p' "$0" | sed 's/^# \{0,1\}//' ;;
  *)
    echo "unknown switch: $1" >&2
    exit 2
    ;;
esac
