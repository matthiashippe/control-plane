#!/usr/bin/env bash
# Live check of the release manager after a rollout (LOOP.md, Release). Reads only.
#
#   ops/live.sh              against https://postyourprice.com and, over ssh, the production ledger
#   ops/live.sh --selftest   no network: proves every check against planted data, in both directions
#
# One line per check, `OK <check>: ...` or `FAIL <check>: ...`, then `LIVE OK` or `LIVE FAIL`; exit 1
# as soon as one check fails. Later goals append their live check here (a judge function, a planted
# case in the selftest, a call in live mode).
#
# Live mode needs the variables from ~/.config/control-plane/loop.env (CP_HOST, CP_SSH_KEY) and is
# run from the code-host only. The ledger is opened with `readonly: true` inside the container; the
# script writes nothing anywhere, restarts nothing and never prints an address or a balance.
#
# Checks:
#   health   GET /health answers 200
#   status   GET /v1/status answers 200 with a JSON object
#   refund   the credit for the five calls of 2026-11-10 whose answers never arrived
#            (src/credits/aborted.ts) is in the ledger exactly once, over exactly 79229 mc
#   domains  GET /v1/domains/search from the code-host (an own address, ops/own-ips.txt) without a key answers 401 from
#            the auth in front of the route, not the 404 of the fallback route (domains 01). Reads only, buys nothing,
#            and creates no key, because provisioning one would write into production
#   timeout-quote  the timeout quote per model since the rollout of abrechnung 02, from the durations in the ledger and in
#            inference_aborts (ops/timeout-quote.sh --since-rollout); shown, and FAIL only when it cannot be read
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="${LIVE_URL:-https://postyourprice.com}"
REFUND_KEY="refund:client-aborted-2026-11-10"
REFUND_MC=79229

# The ledger query, the same text in production and in the selftest. It counts refund rows of the
# batch key and sums them; nothing else leaves the database. better-sqlite3 is what the container
# has; node:sqlite is only the fallback for a local node whose ABI does not match the installed
# build (selftest on a machine with a newer node first on PATH).
# shellcheck disable=SC2016
QUERY_JS='const [file, key] = process.argv.slice(1); let db; try { db = require("better-sqlite3")(file, { readonly: true }); } catch (e) { const { DatabaseSync } = require("node:sqlite"); db = new DatabaseSync(file, { readOnly: true }); } const r = db.prepare("SELECT count(*) AS n, coalesce(sum(delta_mc), 0) AS s FROM ledger WHERE kind = ? AND ref = ?").get("refund", key); console.log(r.n + " " + r.s);'

FAILED=0
say() {
  echo "$1"
  case "$1" in FAIL*) FAILED=1 ;; esac
}

judge_health() { # $1 = HTTP status
  if [ "$1" = "200" ]; then echo "OK health: /health 200"; else echo "FAIL health: /health answered ${1:-nothing}"; fi
}

judge_status() { # $1 = HTTP status, $2 = first character of the body
  if [ "$1" = "200" ] && [ "$2" = "{" ]; then
    echo "OK status: /v1/status 200"
  else
    echo "FAIL status: /v1/status answered ${1:-nothing}"
  fi
}

judge_refund() { # $1 = "<rows> <sum mc>" from QUERY_JS
  local n s
  read -r n s <<<"${1:-}"
  if ! [[ "${n:-}" =~ ^[0-9]+$ && "${s:-}" =~ ^-?[0-9]+$ ]]; then
    echo "FAIL refund: ledger query gave no answer"
  elif [ "$n" -eq 0 ]; then
    echo "FAIL refund: no credit for the aborted calls of 2026-11-10"
  elif [ "$n" -gt 1 ]; then
    echo "FAIL refund: credited $n times"
  elif [ "$s" -ne "$REFUND_MC" ]; then
    echo "FAIL refund: credit over $s mc, expected $REFUND_MC mc"
  else
    echo "OK refund: credited once, $REFUND_MC mc"
  fi
}

DOMAINS_PATH="/v1/domains/search?query=livecheck&tlds=com"

judge_domains() { # $1 = HTTP status, $2 = body
  local err
  err="$(grep -o '"error":"[^"]*"' <<<"${2:-}" | head -n 1)"
  if [ "$1" = "401" ] && [ -n "$err" ] && [ "$err" != '"error":"not_found"' ]; then
    echo "OK domains: ${DOMAINS_PATH%%\?*} 401 without a key, the route is there"
  elif [ "$1" = "404" ]; then
    echo "FAIL domains: ${DOMAINS_PATH%%\?*} answered 404, the route is missing"
  else
    echo "FAIL domains: ${DOMAINS_PATH%%\?*} answered ${1:-nothing} ${err:-without an error field}"
  fi
}

# $1 = output of ops/timeout-quote.sh --since-rollout (or --rows). One line per model over all days, aborted and answered
# calls together: `<model> <timeouts>/<calls> (<quote> %)`.
judge_timeout_quote() {
  local head summary
  head="$(head -n 1 <<<"${1:-}")"
  if [[ "$head" != since\ * ]]; then
    echo "FAIL timeout-quote: no answer from ops/timeout-quote.sh"
    return
  fi
  summary="$(awk -F'|' '
    NR > 1 && $3 ~ /^ *all *$/ {
      m = $2; gsub(/ /, "", m); n[m] += $5; t[m] += $6
    }
    END {
      out = ""
      for (m in n) out = out (out == "" ? "" : ", ") sprintf("%s %d/%d (%.1f %%)", m, t[m], n[m], 100 * t[m] / n[m])
      print out
    }' <<<"$1")"
  if [ -z "$summary" ]; then
    echo "OK timeout-quote: no call since the rollout yet"
  else
    echo "OK timeout-quote: ${head%%,*}: $summary"
  fi
}

selftest() {
  # No network in here, by construction: any attempt is an error.
  curl() { echo "selftest must not reach the network (curl)" >&2; return 99; }
  ssh() { echo "selftest must not reach the network (ssh)" >&2; return 99; }

  local dir
  dir="$(mktemp -d)"
  trap 'rm -rf "$dir"' RETURN

  # Planted ledgers: none, two, one, one too small and two halves of the right sum, each next to decoys the query must not count (an
  # inference row and a refund under another key).
  local plant='const [file, credits, mc] = process.argv.slice(1); let db; try { db = require("better-sqlite3")(file); db.exec("SELECT 1"); } catch (e) { const { DatabaseSync } = require("node:sqlite"); db = new DatabaseSync(file); } db.exec("CREATE TABLE ledger (id INTEGER PRIMARY KEY, address TEXT, kind TEXT, delta_mc INTEGER, ref TEXT)"); const ins = db.prepare("INSERT INTO ledger (address, kind, delta_mc, ref) VALUES (?, ?, ?, ?)"); ins.run("planted-wallet", "inference", -79229, "gen-planted"); ins.run("planted-wallet", "refund", 500, "refund:another-batch"); for (let i = 0; i < Number(credits); i++) ins.run("planted-wallet", "refund", Number(mc), "refund:client-aborted-2026-11-10");'
  local case_ name credits mc expect got code first all_ok=1
  for case_ in "none 0 $REFUND_MC FAIL" "double 2 $REFUND_MC FAIL" "single 1 $REFUND_MC OK" "short 1 61644 FAIL" "split 2 39614 FAIL"; do
    read -r name credits mc expect <<<"$case_"
    (cd "$ROOT" && NODE_NO_WARNINGS=1 node -e "$plant" "$dir/$name.db" "$credits" "$mc") || {
      echo "FAIL selftest: could not plant $name"
      all_ok=0
      continue
    }
    got="$(judge_refund "$(cd "$ROOT" && NODE_NO_WARNINGS=1 node -e "$QUERY_JS" "$dir/$name.db" "$REFUND_KEY")")"
    echo "planted $name: $got"
    [ "${got%% *}" = "$expect" ] || all_ok=0
  done

  # The HTTP judges, both directions.
  for case_ in "200 OK" "502 FAIL" "none FAIL"; do
    read -r code expect <<<"$case_"
    [ "$code" = none ] && code=""
    got="$(judge_health "$code")"
    echo "planted health ${code:-none}: $got"
    [ "${got%% *}" = "$expect" ] || all_ok=0
  done
  for case_ in "200 { OK" "200 < FAIL" "500 { FAIL"; do
    read -r code first expect <<<"$case_"
    got="$(judge_status "$code" "$first")"
    echo "planted status $code $first: $got"
    [ "${got%% *}" = "$expect" ] || all_ok=0
  done

  # The domain route, both directions: the 401 of the auth in front of it, the 404 of the fallback route as it answered
  # before domains 01, a 401 without a JSON error, a 200 (the route would then answer without a key) and no answer.
  local body401='{"error":"Invalid API key","message":"Send the control plane API key"}'
  local body404='{"error":"not_found","message":"No endpoint at /v1/domains/search"}'
  local d_case d_code d_body d_expect
  for d_case in "401|$body401|OK" "404|$body404|FAIL" "401|<html>|FAIL" "200|{\"results\":[]}|FAIL" "||FAIL"; do
    IFS='|' read -r d_code d_body d_expect <<<"$d_case"
    got="$(judge_domains "$d_code" "$d_body")"
    echo "planted domains ${d_code:-none}: $got"
    [ "${got%% *}" = "$d_expect" ] || all_ok=0
  done

  # The timeout quote since the rollout, through the real ops/timeout-quote.sh: a long abort shows a quote above 0, calls
  # without one show exactly 0, a row from before the rollout stays out, and no answer is a FAIL.
  printf '%s\n' '{"src":"ledger","at":"2026-11-11T09:00:00.000Z","ref":"gen-1","model":"openai/gpt-5.2","duration_ms":null}' \
    '{"src":"ledger","at":"2026-11-12T09:00:00.000Z","ref":"gen-2","model":"openai/gpt-5.2","duration_ms":12000}' \
    '{"src":"abort","at":"2026-11-12T10:00:00.000Z","ref":null,"model":"openai/gpt-5.2","duration_ms":59950}' \
    '{"src":"ledger","at":"2026-11-12T11:00:00.000Z","ref":"gen-3","model":"openai/gpt-5-mini","duration_ms":4000}' >"$dir/tq-long.jsonl"
  printf '%s\n' '{"src":"ledger","at":"2026-11-12T09:00:00.000Z","ref":"gen-2","model":"openai/gpt-5.2","duration_ms":12000}' >"$dir/tq-short.jsonl"
  : >"$dir/tq-none.jsonl"
  local tq_case tq_file tq_expect
  for tq_case in "long|openai/gpt-5.2 1/2 (50.0 %)" "long|openai/gpt-5-mini 0/1 (0.0 %)" "short|openai/gpt-5.2 0/1 (0.0 %)" "none|no call since the rollout yet"; do
    tq_file="${tq_case%%|*}"
    tq_expect="${tq_case#*|}"
    got="$(judge_timeout_quote "$(TQ_SINCE='' bash "$ROOT/ops/timeout-quote.sh" --rows "$dir/tq-$tq_file.jsonl" 2>/dev/null)")"
    echo "planted timeout-quote $tq_file: $got"
    case "$got" in "OK timeout-quote: "*"$tq_expect"*) ;; *) all_ok=0 ;; esac
  done
  for tq_case in "" "garbage" "TIMEOUT QUOTE FAIL: ledger not readable"; do
    got="$(judge_timeout_quote "$tq_case")"
    echo "planted timeout-quote answer '${tq_case}': $got"
    [ "${got%% *}" = "FAIL" ] || all_ok=0
  done

  if [ "$all_ok" = 1 ]; then
    echo "LIVE SELFTEST OK"
    return 0
  fi
  echo "LIVE SELFTEST FAIL"
  return 1
}

live() {
  if [ -z "${CP_HOST:-}" ] && [ -f "$HOME/.config/control-plane/loop.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$HOME/.config/control-plane/loop.env"
    set +a
  fi
  local key="${CP_SSH_KEY:-${CP_DEPLOY_KEY:-}}"
  if [ -z "${CP_HOST:-}" ] || [ -z "$key" ]; then
    echo "FAIL setup: CP_HOST and CP_SSH_KEY are not set (~/.config/control-plane/loop.env)"
    echo "LIVE FAIL"
    return 1
  fi

  local code body
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$BASE/health")"
  say "$(judge_health "$code")"

  body="$(mktemp)"
  code="$(curl -s -o "$body" -w '%{http_code}' --max-time 15 "$BASE/v1/status")"
  say "$(judge_status "$code" "$(head -c 1 "$body")")"
  rm -f "$body"

  body="$(mktemp)"
  code="$(curl -s -o "$body" -w '%{http_code}' --max-time 15 "$BASE$DOMAINS_PATH")"
  say "$(judge_domains "$code" "$(head -c 2000 "$body")")"
  rm -f "$body"

  local remote answer
  remote="docker exec deploy-cp-1 node -e $(printf %q "$QUERY_JS") /data/cp.db $(printf %q "$REFUND_KEY")"
  answer="$(ssh -i "$key" -o BatchMode=yes -o ConnectTimeout=10 "$CP_HOST" "$remote" 2>/dev/null)"
  say "$(judge_refund "$answer")"

  say "$(judge_timeout_quote "$(CP_HOST="$CP_HOST" CP_SSH_KEY="$key" bash "$ROOT/ops/timeout-quote.sh" --since-rollout 2>/dev/null)")"

  if [ "$FAILED" = 0 ]; then
    echo "LIVE OK"
    return 0
  fi
  echo "LIVE FAIL"
  return 1
}

case "${1:-}" in
  --selftest) selftest ;;
  "") live ;;
  -h | --help) sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//' ;;
  *)
    echo "unknown switch: $1" >&2
    exit 2
    ;;
esac
