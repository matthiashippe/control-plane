#!/usr/bin/env bash
# Does the preview card still promise something the server will honour?
#
# Four surfaces ask `starterOffer()` before they promise the free first job and stop of their own
# accord when the pool runs dry: the landing page, /post, /jobs and /check. The fifth cannot ask,
# because it is a picture. `/og.png` carries "first job / free, 15 ¢" burned in, shot from
# `src/public/og-card.html`, and it is what every shared link, every chat unfurl and every social
# preview shows.
#
# The handoff has said since 2026-09-22 that no test can notice the pool running out, and that it
# therefore has to be remembered. It can be noticed. `/v1/status` publishes both numbers,
# `starter_credit_cents` and `starter_pool_left_cents`, and the card's claim is in the HTML it is
# shot from. Holding one against the other is this file.
#
# It matters on exactly one day, and that day is the best day this project will have had: the pool
# carries 15 newcomers, and the nine issue answers are written and waiting for a sentence from
# Matthias. If they bring twenty, the pool empties within the hour and every preview shared from
# then on promises 15 cents that the server refuses in the same second.
#
# What it cannot do is read the PNG. A picture has no text, so this compares the SOURCE. When it
# fails, both have to move: the HTML, and a fresh screenshot of it. That limit is printed with the
# failure rather than left for somebody to remember.
#
#   ops/og-card-says-the-truth.sh
#   ops/og-card-says-the-truth.sh --selftest
#
# Exit 0: the card and the server agree. Exit 1: they do not. Exit 2: could not ask.
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="${CP_URL:-https://postyourprice.com}"
CARD="${CP_OG_CARD:-src/public/og-card.html}"

# Both directions in one function, because --selftest has to exercise the same one.
judge() { # credit-cents pool-cents card-html -> prints the verdict, returns 0 when they agree
  local credit="$1" pool="$2" card="$3" promises=0
  # The card promises the offer when it names the free first job at all.
  case "$card" in *"first job"*) promises=1 ;; esac
  if [[ "$pool" -ge "$credit" && "$credit" -gt 0 ]]; then
    if [[ "$promises" -eq 0 ]]; then
      echo "CARD SILENT  the pool still carries the free first job (${pool} c left, ${credit} c each)"
      echo "             and the preview card no longer says so. Every shared link undersells it."
      return 1
    fi
    case "$card" in
      *"${credit} ¢"*|*"${credit} c"*|*"${credit} cent"*)
        echo "AGREES  the card promises ${credit} c and the pool has ${pool} c left, $((pool / credit)) newcomer(s)."
        return 0 ;;
      *)
        echo "WRONG NUMBER the pool grants ${credit} c and the card does not name that figure."
        echo "             A preview that promises a different amount is a promise the server breaks."
        return 1 ;;
    esac
  fi
  # The pool is empty, or smaller than a single grant.
  if [[ "$promises" -eq 1 ]]; then
    echo "CARD LIES    the pool has ${pool} c left and one grant costs ${credit} c, so the next"
    echo "             newcomer gets nothing. The preview card still promises the free first job."
    echo "             TWO things have to move, and this check can only see the first:"
    echo "               1. ${CARD}, the sentence with the free first job"
    echo "               2. a fresh screenshot of it into og.png, because a picture has no text"
    return 1
  fi
  echo "AGREES  the pool is spent (${pool} c left, ${credit} c a grant) and the card does not promise it."
  return 0
}

if [[ "${1:-}" == "--selftest" ]]; then
  fail=0
  with="<div><b>first job</b><span>free, 15 ¢</span></div>"
  without="<div><b>post a job</b><span>you set the price</span></div>"
  # Pool full, card promises: agree.
  judge 15 230 "$with" > /dev/null || { echo "SELFTEST FAILED: a full pool with a promising card must agree"; fail=1; }
  # Pool empty, card promises: the case this file exists for.
  judge 15 0 "$with" > /dev/null && { echo "SELFTEST FAILED: an empty pool with a promising card must not agree"; fail=1; }
  # Pool smaller than one grant: still not enough for the next newcomer.
  judge 15 14 "$with" > /dev/null && { echo "SELFTEST FAILED: a pool under one grant must not agree"; fail=1; }
  # Pool empty, card silent: agree.
  judge 15 0 "$without" > /dev/null || { echo "SELFTEST FAILED: an empty pool with a silent card must agree"; fail=1; }
  # Pool full, card silent: the other direction, and it is also wrong.
  judge 15 230 "$without" > /dev/null && { echo "SELFTEST FAILED: a full pool with a silent card must not agree"; fail=1; }
  # The number drifting apart is its own failure.
  judge 25 230 "$with" > /dev/null && { echo "SELFTEST FAILED: a card naming 15 against a 25 c grant must not agree"; fail=1; }
  [[ "$fail" -eq 0 ]] && echo "SELFTEST OK: six cases, both directions, including the number drifting apart."
  exit "$fail"
fi

[[ -f "$CARD" ]] || { echo "COULD NOT ASK: $CARD is not there" >&2; exit 2; }
status=$(curl -s -m 15 "$BASE/v1/status" 2>/dev/null)
credit=$(printf '%s' "$status" | python3 -c "import sys,json;print(json.load(sys.stdin).get('starter_credit_cents',''))" 2>/dev/null)
pool=$(printf '%s' "$status" | python3 -c "import sys,json;print(json.load(sys.stdin).get('starter_pool_left_cents',''))" 2>/dev/null)
if [[ -z "$credit" || -z "$pool" ]]; then
  echo "COULD NOT ASK: $BASE/v1/status did not answer with both numbers." >&2
  echo "               That is a connection problem, not a finding about the card." >&2
  exit 2
fi

judge "$credit" "$pool" "$(cat "$CARD")"
