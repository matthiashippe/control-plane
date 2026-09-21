#!/usr/bin/env bash
# Every check this project has, in one run.
#
# By 2026-09-21 there were six ways to ask whether the live service is still what we say it is,
# and each cycle ran a different subset of them by hand. A check that exists and does not run is
# almost as useless as one that does not exist, and picking which to run by memory is exactly how
# the gap opens.
#
# Two depths, because two of the checks leave traces. The shallow run only reads. The deep run also
# provisions throwaway agents and posts one-cent jobs that it cancels again, so it belongs in a
# cycle that has a reason to doubt the supply side, not in every one.
#
#   ops/check-all.sh           read-only: health, Conway, market, journeys, numbers
#   ops/check-all.sh --deep    also the MCP route and the skill route, end to end
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="${CP_URL:-https://cp.hippe.eu}"
DEEP=0
[[ "${1:-}" == "--deep" ]] && DEEP=1

# The two production probes below walk the whole supply side: an MCP host takes the six tools and
# a Conway runtime takes the skill file, both against the live service, both end to end. Until
# 2026-09-21 they ran only when somebody passed --deep, and no cycle ever did. A check that needs
# to be remembered is a check that does not run: exactly what had just been fixed one level up,
# where the market hygiene block sat behind an environment variable nobody exported.
#
# They cost nothing any more (neither claims a starter grant), so the only reason left to skip them
# is the minute they take. That is worth paying once a day, not once per cycle, so they run
# whenever the last successful run is more than a day old. `--deep` still forces one.
STAMPS="${CP_PROBE_STAMPS:-.scratch/probes}"
mkdir -p "$STAMPS"
faellig() {
  local stamp="$STAMPS/$1"
  [[ ! -f "$stamp" ]] && return 0
  local alter=$(( $(date -u +%s) - $(date -u -r "$stamp" +%s 2>/dev/null || echo 0) ))
  (( alter > ${CP_PROBE_MAX_AGE:-86400} ))
}
if faellig mcp-production || faellig skill-production; then
  DEEP=1
  echo "(the production probes are due: their last clean run is more than a day old)"
fi
declare -a PASSED=() FAILED=()

run() {
  local name="$1"; shift
  local out
  out=$("$@" 2>&1)
  local code=$?
  if (( code == 0 )); then
    PASSED+=("$name")
    printf '  ok    %-34s %s\n' "$name" "$(printf '%s' "$out" | tail -1 | cut -c1-60)"
  else
    FAILED+=("$name")
    printf '  FAIL  %-34s exit %s\n' "$name" "$code"
    printf '%s\n' "$out" | tail -4 | sed 's/^/        /'
  fi
  # The caller's exit code, not the printf's. Without this line `run ... && touch stamp` stamps a
  # failed probe as a clean run, because an if/else ends with whatever its last branch returned and
  # that is always a successful printf. The script sets no -e, so returning non-zero here aborts
  # nothing; it only makes the status readable.
  return $code
}

echo "Handsel, all checks against $BASE"
echo

# The service itself, before anything that depends on it. If this is red nothing else means much.
run "health from outside" bash -c "code=\$(curl -s -o /dev/null -m 10 -w '%{http_code}' $BASE/health); [[ \$code == 200 ]] && echo \"\$code\" || { echo \"\$code\"; exit 1; }"

# Our own public claim about Conway. Returns 1 when their onboarding works again, which would make
# the front page untrue.
run "conway still broken" ./ops/conway-zustand.sh

run "market guards" env CP_URL="$BASE" pnpm -s tsx harness/e2e/markt.ts
run "journeys match the service" ./ops/journeys-pruefen.sh
run "pages say nothing obviously wrong" ./ops/seiten-pruefen.sh
# Added 2026-09-21. The three series below were printed by this script and never checked, so a cron
# entry that stops firing would leave the same last point in every cycle's output and this script
# would keep saying ALL CHECKS OK next to it.
run "the daily jobs still ran" ./ops/freshness.sh

if (( DEEP )); then
  run "MCP route end to end" env CP_URL="$BASE" OPERATOR_WALLET="${OPERATOR_WALLET:-harness/state/mainnet-wallet.json}" pnpm -s tsx ops/mcp-against-production.ts \
    && touch "$STAMPS/mcp-production"
  run "skill route end to end" env CP_URL="$BASE" OPERATOR_WALLET="${OPERATOR_WALLET:-harness/state/mainnet-wallet.json}" ./ops/skill-against-production.sh \
    && touch "$STAMPS/skill-production"
fi

echo
# The one number the plan hangs on, printed last so it is the thing left on the screen.
open=$(curl -s -m 10 "$BASE/bounties.json" | grep -o '"id"' | wc -l | tr -d ' ')
echo "open jobs: ${open:-?}"
# Not gated on OPENROUTER_API_KEY any more. That key buys the provider numbers and nothing else,
# but it stood in front of the whole block, so on every cycle that did not export it the market
# hygiene below was skipped in silence. On 2026-09-21 that was every cycle of the day, including
# the one where a key of ours went unclassified and `foreign buyers` read 1.
if true; then
  ./ops/status.sh 2>/dev/null | python3 -c "
import json, sys
try:
    db = json.load(sys.stdin)['db']
    m = db['market']
    u = db.get('uncollected_mc', 0)
except Exception:
    sys.exit(0)
print(f\"foreign buyers: {m['foreign_buyers']}   foreign agents: {m['foreign_agents']}   \"
      f\"awarded: {m['awarded']}   fee earned: {m['fee_earned_mc']/1000:.2f} c   \"
      f\"starter pool left: {m['starter_pool_left_mc']/1000:.0f} c \"
      f\"(of {m['starter_granted']} grants, {m['starter_granted_ours']} to us)\")
print(f\"written off by the token estimate: {u/1000:.2f} c\")
unbekannt = m.get('unclassified_key_names', [])
for name in unbekannt:
    print(f\"FAILED  a key named '{name}' is on neither list. Either a tool of ours forgot to \"
          f\"register its name in ops/db-report.cjs, or somebody who is not us showed up.\")
if unbekannt:
    # Not a LOOK any more. While a name is unclassified, every number that splits us from the
    # market is wrong by an unknown amount, and foreign_buyers is the number the whole plan hangs
    # on. Four times in one day a tool of ours arrived without its name and a number about the
    # market quietly became a number about us; each time the report said LOOK and the cycle
    # carried on. Either it is ours and belongs on the list, or it is a stranger and is the best
    # news this project has had, and both deserve more than a line somebody skims.
    sys.exit(3)
if m['our_submissions_on_open']:
    print(f\"FAILED  {m['our_submissions_on_open']} submission(s) of ours sit on a live job. \"
          f\"The open list publishes that count, so strangers are being shown a number about us.\")
    sys.exit(3)
" || markt_hygiene=$?
  # `|| true` used to swallow everything here, which was right for "no JSON to read" and wrong for
  # a real finding: exit 3 from the block above meant nothing at all. Only that one code counts as
  # a failure, so a missing report is still tolerated and a dirty market is not.
  if [[ "${markt_hygiene:-0}" == "3" ]]; then
    FAILED+=("market hygiene")
  fi
else
  echo "(no OPENROUTER_API_KEY, so the market numbers are skipped)"
fi

# Whether the directory a stranger's automaton searches in knows this service exists.
# Printed and not failed: absence is today's expected state, and the line is the finding.
./ops/own-x402-listing.sh 2>/dev/null || true

echo
# The two daily series, read into the cycle instead of sitting in a log file.
#
# `ops/x402-zeitreihe.sh` and `ops/conway-zeitreihe.sh` both run by cron on the VM and both print
# what moved since the previous point. Until 2026-09-21 that printing went to
# /var/log/cp-x402.log and /var/log/cp-conway.log, which no cycle opened. Each script carries the
# sentence that a series nobody reads is a file, and then wrote into one. So the last point of each
# comes here, where the cycle already looks.
#
# The VM only hands over two lines; the reading happens locally, because a nested heredoc over ssh
# is a quoting puzzle and this is a diagnostic, not a place to be clever.
reihen=$(timeout 25 ssh -i "${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}" -o BatchMode=yes -o ConnectTimeout=8 \
  "${CP_HOST:-root@76.13.144.207}" \
  'echo "x402 $(wc -l < /opt/control-plane/x402/kennzahlen.ndjson 2>/dev/null || echo 0) $(tail -1 /opt/control-plane/x402/kennzahlen.ndjson 2>/dev/null)";
   echo "conway $(wc -l < /opt/control-plane/conway/repo.ndjson 2>/dev/null || echo 0) $(tail -1 /opt/control-plane/conway/repo.ndjson 2>/dev/null)";
   echo "money $(wc -l < /opt/control-plane/conway-money/metrics.ndjson 2>/dev/null || echo 0) $(tail -1 /opt/control-plane/conway-money/metrics.ndjson 2>/dev/null)"' 2>/dev/null)

if [[ -n "$reihen" ]]; then
  printf '%s\n' "$reihen" | python3 -c "
import json, sys
for zeile in sys.stdin:
    teile = zeile.strip().split(' ', 2)
    if len(teile) < 3 or not teile[2].startswith('{'):
        print(f'{teile[0] if teile else \"?\"} series: no point yet')
        continue
    name, n, roh = teile[0], teile[1], teile[2]
    try:
        d = json.loads(roh)
    except json.JSONDecodeError:
        print(f'{name} series: the last line is not readable')
        continue
    if name == 'money':
        print(f\"money  {d['measured_at'][:10]}, {n} point(s): \"
              f\"{d['topup_usdc_30d']:,.0f} USDC in 30 days from {d['topup_wallets_30d']} wallets, \"
              f\"{d['topups_30d']} purchases, pay endpoint {d.get('pay_endpoint_status', '?')}, \"
              f\"data through {d['data_through'][:10]}\")
    elif name == 'x402':
        print(f\"x402   {d['stichtag'][:10]}, {n} point(s): {d['urls_eindeutig']:,} services, \"
              f\"{d['aufrufe_30d']:,} calls, top10 {d['anteil_top10']}%, \"
              f\"{d['ohne_nachfragedaten']} without demand data\")
    else:
        print(f\"conway {d['stichtag'][:10]}, {n} point(s): last push {d['last_push'][:10]}, \"
              f\"{d['onboarding_issues']} onboarding issues, newest #{d['newest_onboarding_issue']}, \"
              f\"last maintainer comment {(d['last_write_access_comment'] or 'never')[:10]}, \"
              f\"PR370 {d['pr370_state']}\")
"
else
  echo "(the daily series could not be read; that says nothing about the service)"
fi

echo
if (( ${#FAILED[@]} == 0 )); then
  echo "ALL CHECKS OK (${#PASSED[@]} of ${#PASSED[@]})"
  exit 0
fi
echo "CHECKS FAILED: ${FAILED[*]}"
exit 1
