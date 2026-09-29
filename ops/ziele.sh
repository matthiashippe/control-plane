#!/usr/bin/env bash
# Every goal and every sub-goal, measured against production, in one run.
#
# Matthias on 2026-09-29: "ich moechte dass du in jedem loop die goals und die sub goals alle
# pruefst und erst aufhoerst wenn wir alle goals erreichen."
#
# That is a standing instruction, and this repository already knows what happens to standing
# instructions that live in somebody's head: "a check that needs to be remembered is a check that
# does not run" (ops/check-all.sh). ZIELE.md carries the four dates and the sub-goals as prose
# with checkboxes, and prose cannot go red. On 2026-09-29 that file still named a merchant account
# as "the only remaining door into the x402 catalogue", two days after we were listed without one,
# and named five USDC as the thing blocking a settlement that had already happened. Nobody was
# lying; nobody had re-measured.
#
# So the numbers come from the service and from the day's directory scan, never from the file, and
# the file keeps only the reasoning. Every line prints target, actual and the verdict.
#
#   ops/ziele.sh              the four goals and every sub-goal
#   ops/ziele.sh --short      the verdicts without the explanations
#   ops/ziele.sh --selftest   the counter-proof, reads nothing from production
#
# Exit 0 when every goal is met, 1 when at least one is open, 2 when it could not look. An open
# goal is the normal state and not a failure; the code is there so a cycle can branch on it.
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="${CP_URL:-https://postyourprice.com}"
[[ "${1:-}" == "--short" ]] && export CP_ZIELE_SHORT=1

# The counter-proof, and it is the whole reason this file may be trusted to say "erreicht".
#
# A verdict function that has only ever seen one state is a constant with extra steps. These two
# runs put the same code in front of planted numbers: one where nothing is reached and one where
# everything is, and the second must print ALLE ZIELE ERREICHT. Nothing here touches the network.
if [[ "${1:-}" == "--selftest" ]]; then
  fail=0
  leer='{"paying_wallets":{"total":0,"not_ours":0},"thinking_wallets":{"total":0,"not_ours":0}}'
  leer_r='{"db":{"market":{"foreign_gmv_30d_mc":0,"foreign_fee_30d_mc":0,"foreign_buyers":0,"open_bounties":0,"starter_grants_left":0,"unclassified_key_names":["fremd"],"stray_submissions_on_open":2,"fiverr_orders_30d":0,"settled_payments_non_conway":0}}}'
  voll='{"paying_wallets":{"total":9,"not_ours":9},"thinking_wallets":{"total":40,"not_ours":40}}'
  voll_r='{"db":{"market":{"foreign_gmv_30d_mc":30000000000,"foreign_fee_30d_mc":3000000000,"foreign_buyers":4,"open_bounties":5,"starter_grants_left":9,"unclassified_key_names":[],"stray_submissions_on_open":0,"fiverr_orders_30d":3,"settled_payments_non_conway":2}}}'

  out=$(printf '%s\n%s\n' "$leer" "$leer_r" | CP_ZIELE_LISTED_N=0 python3 ./ops/ziele.py); code=$?
  n=$(printf '%s' "$out" | grep -c '^  OFFEN')
  if (( code == 1 )) && (( n == 13 )); then
    echo "  ok      nichts erreicht: 13 von 13 Zahlen offen, Exit 1"
  else
    echo "  FAILED  nichts erreicht gab Exit $code und $n offene Zahlen, erwartet 1 und 13"; fail=1
  fi

  out=$(printf '%s\n%s\n' "$voll" "$voll_r" | CP_ZIELE_LISTED_N=3 python3 ./ops/ziele.py); code=$?
  if (( code == 0 )) && printf '%s' "$out" | grep -q 'ALLE ZIELE ERREICHT'; then
    echo "  ok      alles erreicht: Exit 0 und die Zeile, die es sagt"
  else
    echo "  FAILED  alles erreicht gab Exit $code ohne die Zeile"; fail=1
  fi

  # Und die Richtung dazwischen, weil ein Schalter, der nur ganz oder gar nicht kann, keine
  # Messung ist: eine einzige Zahl bewegt sich, genau eine Zeile muss umspringen.
  fast=$(printf '%s' "$voll_r" | sed 's/"open_bounties":5/"open_bounties":0/')
  out=$(printf '%s\n%s\n' "$voll" "$fast" | CP_ZIELE_LISTED_N=3 python3 ./ops/ziele.py); code=$?
  n=$(printf '%s' "$out" | grep -c '^  OFFEN')
  if (( code == 1 )) && (( n == 1 )); then
    echo "  ok      ein leeres Brett allein macht genau eine Zahl offen"
  else
    echo "  FAILED  ein leeres Brett gab Exit $code und $n offene Zahlen, erwartet 1 und 1"; fail=1
  fi

  out=$(printf 'kein json\n' | python3 ./ops/ziele.py); code=$?
  if (( code == 2 )); then
    echo "  ok      unlesbare Eingabe ist unentschieden, nicht erreicht"
  else
    echo "  FAILED  unlesbare Eingabe gab Exit $code, erwartet 2"; fail=1
  fi

  (( fail == 0 )) && echo "ZIELE SELFTEST OK" || echo "ZIELE SELFTEST FAILED"
  exit $fail
fi

status=$(curl -s -m 20 "$BASE/v1/status")
report=$(./ops/status.sh 2>/dev/null)
if [[ -z "$status" || -z "$report" ]]; then
  echo "could not read the service ($BASE)"
  exit 2
fi

# Is our host in today's directory scan? ops/own-x402-listing.sh owns that question and carries
# its own counter-proof, so this only takes its verdict and the two can never disagree.
listed=$(./ops/own-x402-listing.sh 2>/dev/null | grep -c '^LISTED' || true)

printf '%s\n%s\n' "$status" "$report" | CP_ZIELE_LISTED_N="$listed" python3 ./ops/ziele.py
