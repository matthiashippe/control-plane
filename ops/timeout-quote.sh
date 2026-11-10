#!/usr/bin/env bash
# Timeout quote of /v1/chat/completions per model and day (abrechnung 02). Reads only.
#
#   ops/timeout-quote.sh                      production: the whole Caddy access log (ops/access-log.sh) joined with the
#                                             inference rows of the ledger and inference_aborts, per model, day and origin
#   ops/timeout-quote.sh --join CADDY ROWS    the same join from files; CADDY may be `-` for stdin
#   ops/timeout-quote.sh --since-rollout      production, database only: calls that carry their own duration (written since
#                                             the rollout of abrechnung 02), per model
#   ops/timeout-quote.sh --rows ROWS          the same from a file of rows; `-` for stdin
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
# request's answer); the rest is `unattributed`. Origin is `own` for an address in ops/own-ips.txt
# and `foreign` otherwise. No address, wallet or balance is ever printed; the database is opened with
# `readonly: true` inside the container.
#
# Output: a markdown table `| model | day | origin | requests | timeouts | quote |`, one line per model,
# day and origin, then one line per model and origin over all days (day `all`).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIMIT_S="${TQ_LIMIT_S:-59.5}"
OWN_FILE="${CP_OWN_IPS_FILE:-$ROOT/ops/own-ips.txt}"

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
  count join "$TQ_DIR/caddy.jsonl" "$TQ_DIR/rows.jsonl" "$OWN_FILE" "$LIMIT_S"
}

since_rollout() {
  load_env
  TQ_DIR="$(mktemp -d)"
  trap 'rm -rf "$TQ_DIR"' EXIT
  fetch_rows "$TQ_DIR/rows.jsonl" || {
    echo "TIMEOUT QUOTE FAIL: ledger not readable" >&2
    exit 2
  }
  count rows "$TQ_DIR/rows.jsonl" "${TQ_SINCE:-}" "$OWN_FILE" "$LIMIT_S"
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

  if [ "$all_ok" = 1 ]; then
    echo "TIMEOUT QUOTE SELFTEST OK"
    return 0
  fi
  echo "TIMEOUT QUOTE SELFTEST FAIL"
  return 1
}

case "${1:-}" in
  --selftest) selftest ;;
  --join) count join "${2:?CADDY file or -}" "${3:?ROWS file}" "$OWN_FILE" "$LIMIT_S" ;;
  --rows) count rows "${2:?ROWS file or -}" "${TQ_SINCE:-}" "$OWN_FILE" "$LIMIT_S" ;;
  --since-rollout) since_rollout ;;
  "") production ;;
  -h | --help) sed -n '2,31p' "$0" | sed 's/^# \{0,1\}//' ;;
  *)
    echo "unknown switch: $1" >&2
    exit 2
    ;;
esac
