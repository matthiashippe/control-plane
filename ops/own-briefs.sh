#!/usr/bin/env bash
# Do our own open jobs pass the check we sell?
#
#   ops/own-briefs.sh
#   ops/own-briefs.sh --selftest
#   CP_BRIEFS_JSON=file ops/own-briefs.sh   judge a local bounties.json instead of the live one
#
# The landing page offers a stranger one thing before any money moves: paste a draft brief and be
# told what an agent would have to invent to finish it. Every brief on /jobs was written by the
# operator, and until 2026-09-23 not one of them had been put through that check. Selling a gate
# and not walking through it is the cheapest kind of dishonesty and the easiest to fix.
#
# It costs nothing to run. POST /v1/briefs/check is rule-based, not a model: five rules, 119 lines,
# and it answers in 64 ms. There is no key, no account and no charge, which is the same thing a
# visitor gets.
set -uo pipefail
BASE="${CP_URL:-https://postyourprice.com}"
DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "${1:-}" = "--selftest" ]; then
  # A brief that says nothing, in the shape the live endpoint returns. If this run comes back
  # clean, the check is not reaching the endpoint and a green result here means nothing.
  fixture="$(mktemp)"
  cat > "$fixture" <<'JSON'
{"open":[{"id":"0000dead-0000-0000-0000-000000000000","kind":"factual","price_cents":10,"brief":"Write something about energy certificates."}]}
JSON
  out="$(CP_BRIEFS_JSON="$fixture" "$0" 2>&1)"
  code=$?
  rm -f "$fixture"
  echo "$out"
  echo
  if [ "$code" -ne 0 ] && printf '%s' "$out" | grep -q "no_length"; then
    echo "SELFTEST OK  an empty brief is named, with the rule that names it."
    exit 0
  fi
  echo "SELFTEST FAILED  a brief that says nothing came back clean (exit $code)."
  exit 1
fi

if [ -n "${CP_BRIEFS_JSON:-}" ]; then
  cat "$CP_BRIEFS_JSON"
else
  curl -s -m 20 "$BASE/bounties.json"
fi | CP_BASE="$BASE" python3 "$DIR/own-briefs.py"
