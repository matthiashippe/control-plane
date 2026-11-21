#!/usr/bin/env bash
# Answer quote of POST /v1/chat/completions (abrechnung 07). Reads only.
#
#   ops/answer-quote.sh                 production: the whole Caddy access log through ops/access-log.sh
#   ops/answer-quote.sh --files CADDY   the same count from a file of Caddy JSON lines; `-` for stdin
#   ops/answer-quote.sh --selftest      no network: planted lines, one case per rule below
#
# The timeout quote (ops/timeout-quote.sh) counts only status 200 and 0, so a day on which the service answered 1393
# requests with 503 reads as "0.0 % timeouts". This tool counts the other side: of all answers to POST
# /v1/chat/completions except 4xx, how many were status 200. Status 0 (the client gave up) and every 5xx count in the
# denominator and not in the numerator. 4xx is left out because it is an answer to the client about its own request
# (402 without credits, 401 without sign-in), not an answer the service lost.
#
# A request belongs to the period by its end. Caddy writes the access line when the response is done, so `ts` is the
# end and `ts - duration` the start (the same reading as ops/timeout-quote.sh, whose join finds the ledger row written
# within milliseconds of `ts`). Both edges are included.
#
# Period: TQ_SINCE and TQ_UNTIL, the same variables as the timeout quote, so both lines are measured with one set. An
# empty value means no edge. A date without a time or a time without a zone ends with exit 2: Date.parse("2026-11-17")
# is 17 Nov 00:00 UTC and would silently cut off the last day.
#
# Blind is not empty: a log without a readable line, or one whose first line is later than TQ_SINCE (rotation lost the
# start of the period), ends with exit 2 before any number is printed.
#
# Output, numbers only, never an address or a wallet:
#   period <since> to <until>              ISO time, `start` or `end` for an empty edge
#   status <code>: <n>                     one line per status, ascending, every status including 4xx
#   answers: <200> of <denominator> (<quote> %), excluded 4xx <n>     quote with one decimal, `-` when nothing counts
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck disable=SC2016
COUNT_JS='
const fs = require("fs");
const file = process.argv[1];
const sinceArg = process.env.TQ_SINCE || "", untilArg = process.env.TQ_UNTIL || "";

// A time needs a date, a time of day and a zone; anything shorter is a guess about the edge.
const parseEdge = (name, v) => {
  if (!v) return null;
  const example = "e.g. 2026-11-17T23:59:59Z";
  let why = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) why = "is a date without a time";
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v)) why = "is a time without a zone";
  else if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(v) || !Number.isFinite(Date.parse(v))) why = "is no ISO time";
  if (why) { console.error(`${name} ${why}: ${v}; use the full form, ${example}`); process.exit(2); }
  return Date.parse(v) / 1000;
};
const since = parseEdge("TQ_SINCE", sinceArg), until = parseEdge("TQ_UNTIL", untilArg);

const text = file === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(file, "utf8");
const lines = text.split("\n").filter((l) => l.trim()).flatMap((l) => {
  try { const j = JSON.parse(l); return j && typeof j.ts === "number" && Number.isFinite(j.ts) ? [j] : []; } catch { return []; }
});
if (lines.length === 0) { console.error("access log has no line"); process.exit(2); }
const first = lines.reduce((m, j) => Math.min(m, j.ts), Infinity);
if (since !== null && first > since) { console.error("access log starts after TQ_SINCE"); process.exit(2); }

// The rule this tool is about: 4xx is an answer about the request itself, everything else is an answer we owe.
const excluded = (status) => status >= 400 && status <= 499;
const isCall = (j) => j.request && j.request.method === "POST" && /^\/v1\/chat\/completions(\?|$)/.test(j.request.uri || "") && typeof j.status === "number";
const inPeriod = (end) => (since === null || end >= since) && (until === null || end <= until);

const perStatus = new Map();
let ok = 0, denominator = 0, out4xx = 0;
for (const j of lines) {
  if (!isCall(j) || !inPeriod(j.ts)) continue;
  perStatus.set(j.status, (perStatus.get(j.status) || 0) + 1);
  if (excluded(j.status)) { out4xx++; continue; }
  denominator++;
  if (j.status === 200) ok++;
}
const iso = (s, open) => (s === null ? open : new Date(s * 1000).toISOString());
console.log(`period ${iso(since, "start")} to ${iso(until, "end")}`);
for (const [code, n] of [...perStatus].sort((a, b) => a[0] - b[0])) console.log(`status ${code}: ${n}`);
const quote = denominator === 0 ? "-" : `${((ok * 100) / denominator).toFixed(1)} %`;
console.log(`answers: ${ok} of ${denominator} (${quote}), excluded 4xx ${out4xx}`);
'

count() { NODE_NO_WARNINGS=1 node -e "$COUNT_JS" "$1"; }

production() {
  if [ -z "${CP_HOST:-}" ] && [ -f "$HOME/.config/control-plane/loop.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$HOME/.config/control-plane/loop.env"
    set +a
  fi
  local key="${CP_SSH_KEY:-${CP_DEPLOY_KEY:-}}"
  if [ -z "${CP_HOST:-}" ] || [ -z "$key" ]; then
    echo "ANSWER QUOTE FAIL: CP_HOST and CP_SSH_KEY are not set (~/.config/control-plane/loop.env)" >&2
    exit 2
  fi
  # Global, not local: the EXIT trap runs after this function has returned.
  AQ_DIR="$(mktemp -d)"
  trap 'rm -rf "$AQ_DIR"' EXIT
  CP_SSH_KEY="$key" CP_HOST="$CP_HOST" bash "$ROOT/ops/access-log.sh" >"$AQ_DIR/caddy.jsonl" || {
    echo "ANSWER QUOTE FAIL: access log not readable" >&2
    exit 2
  }
  count "$AQ_DIR/caddy.jsonl"
}

selftest() {
  # No network in here, by construction: any attempt is an error.
  curl() { echo "selftest must not reach the network (curl)" >&2; return 99; }
  ssh() { echo "selftest must not reach the network (ssh)" >&2; return 99; }

  local dir all_ok=1
  dir="$(mktemp -d)"
  trap 'rm -rf "$dir"' RETURN

  # A documentation address (RFC 5737) on every line, so the selftest shows that none reaches the output.
  local addr=198.51.100.7
  # A Caddy line: end time (unix), status, method, uri.
  line() { printf '{"level":"info","ts":%s,"logger":"http.log.access.log0","request":{"remote_ip":"%s","client_ip":"%s","method":"%s","uri":"%s"},"duration":1.5,"status":%s}\n' "$1" "$addr" "$addr" "${3:-POST}" "${4:-/v1/chat/completions}" "$2"; }
  # The log reaches back before the period with a line on another path, as the real log does.
  early() { line $((t - 100)) 200 GET /; }
  local t=1794290000 s_iso u_iso
  s_iso="$(date -u -d "@$t" +%Y-%m-%dT%H:%M:%SZ)"
  u_iso="$(date -u -d "@$((t + 600))" +%Y-%m-%dT%H:%M:%SZ)"

  # check <name> <expected exit> <file> <TQ_SINCE> <TQ_UNTIL> <pattern that stdout+stderr must contain>...
  check() {
    local name="$1" want="$2" file="$3" since="$4" until="$5" got rc p miss=""
    shift 5
    got="$(TQ_SINCE="$since" TQ_UNTIL="$until" count "$file" 2>&1)"
    rc=$?
    [ "$rc" = "$want" ] || miss="exit $rc, want $want"
    for p in "$@"; do
      grep -qF -- "$p" <<<"$got" || miss="${miss:+$miss; }missing \"$p\""
    done
    if [ "$want" != 0 ] && grep -q '^answers: ' <<<"$got"; then miss="${miss:+$miss; }a number before exit $want"; fi
    if grep -qE '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b|0x[0-9a-fA-F]{40}' <<<"$got"; then miss="${miss:+$miss; }an address in the output"; fi
    if [ -z "$miss" ]; then
      echo "ok   answers $name"
    else
      echo "FAIL answers $name: $miss"
      all_ok=0
    fi
  }

  # 503 counts in the denominator and not in the numerator.
  { early; line $((t + 10)) 200; line $((t + 20)) 503; line $((t + 30)) 503; } >"$dir/503.jsonl"
  check "503 counts against" 0 "$dir/503.jsonl" "$s_iso" "$u_iso" "status 503: 2" "answers: 1 of 3 (33.3 %), excluded 4xx 0"

  # 4xx is the client's own business and leaves the quote alone.
  { early; line $((t + 10)) 200; line $((t + 20)) 402; line $((t + 30)) 401; line $((t + 40)) 429; } >"$dir/4xx.jsonl"
  check "4xx excluded" 0 "$dir/4xx.jsonl" "$s_iso" "$u_iso" "status 402: 1" "answers: 1 of 1 (100.0 %), excluded 4xx 3"

  # Status 0, the client gave up, is an answer that did not arrive.
  { early; line $((t + 10)) 200; line $((t + 20)) 0; } >"$dir/abort.jsonl"
  check "abort counts against" 0 "$dir/abort.jsonl" "$s_iso" "$u_iso" "status 0: 1" "answers: 1 of 2 (50.0 %), excluded 4xx 0"

  # Edges by the end of the request: on TQ_SINCE and on TQ_UNTIL counts, 1 s before or after does not.
  { line $((t - 1)) 503; line "$t" 200; line $((t + 600)) 200; line $((t + 601)) 503; } >"$dir/edge.jsonl"
  check "period edge" 0 "$dir/edge.jsonl" "$s_iso" "$u_iso" "answers: 2 of 2 (100.0 %), excluded 4xx 0"

  # An empty edge is allowed and reads as the whole log.
  check "period open" 0 "$dir/edge.jsonl" "" "" "period start to end" "answers: 2 of 4 (50.0 %), excluded 4xx 0"

  # A date without a time or a time without a zone stops before any number.
  check "period date without time" 2 "$dir/edge.jsonl" "$s_iso" "2026-11-17" "TQ_UNTIL is a date without a time" "full form"
  check "period time without zone" 2 "$dir/edge.jsonl" "$s_iso" "2026-11-17T23:59:59" "TQ_UNTIL is a time without a zone" "full form"

  # A log that lost the start of the period, and a log without a line, are blind, not quiet.
  { line $((t + 10)) 200; line $((t + 20)) 200; } >"$dir/late.jsonl"
  check "log starts late" 2 "$dir/late.jsonl" "$s_iso" "$u_iso" "access log starts after TQ_SINCE"
  : >"$dir/empty.jsonl"
  check "log empty" 2 "$dir/empty.jsonl" "$s_iso" "$u_iso" "access log has no line"

  # Other methods and paths do not count; a query on the right path does.
  {
    early
    line $((t + 10)) 200
    line $((t + 20)) 503 GET /v1/chat/completions
    line $((t + 30)) 503 POST /v1/models
    line $((t + 40)) 503 POST /v1/chat/completions/extra
    line $((t + 50)) 200 POST "/v1/chat/completions?stream=true"
  } >"$dir/route.jsonl"
  check "other route ignored" 0 "$dir/route.jsonl" "$s_iso" "$u_iso" "answers: 2 of 2 (100.0 %), excluded 4xx 0"

  # Nothing to count is a dash, not 0.0 % and not 100.0 %.
  { early; line $((t + 10)) 402; } >"$dir/none.jsonl"
  check "nothing to count" 0 "$dir/none.jsonl" "$s_iso" "$u_iso" "answers: 0 of 0 (-), excluded 4xx 1"

  if [ "$all_ok" = 1 ]; then
    echo "ANSWER QUOTE SELFTEST OK"
    return 0
  fi
  echo "ANSWER QUOTE SELFTEST FAIL"
  return 1
}

case "${1:-}" in
  --selftest) selftest ;;
  --files) count "${2:?CADDY file or -}" ;;
  "") production ;;
  -h | --help) sed -n '2,29p' "$0" | sed 's/^# \{0,1\}//' ;;
  *)
    echo "unknown switch: $1" >&2
    exit 2
    ;;
esac
