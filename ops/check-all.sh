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
# A check has three possible answers, not two: yes, no, and "I could not look".
#
# Everything here asks our own service, where not being able to look is itself a failure worth a
# red line. `ops/conway-zustand.sh` is the exception: it asks somebody else's service a question,
# and a timeout at api.conway.tech (which reported 2 of 8 healthy workers on 22.09.) says nothing
# about us. Until 2026-09-22 there was no third answer, so one such timeout printed CHECKS FAILED
# for the loudest alarm this project has, next to a protocol entry claiming all seven were green.
#
# The third state is opt-in per check, via `--unklar-bei <code>`, because a check that is allowed
# to shrug is a check that can stop working in silence.
declare -a PASSED=() FAILED=() UNKLAR=()

run() {
  local unklar=""
  if [[ "$1" == "--unklar-bei" ]]; then unklar="$2"; shift 2; fi
  local name="$1"; shift
  local out
  out=$("$@" 2>&1)
  local code=$?
  if (( code == 0 )); then
    PASSED+=("$name")
    printf '  ok    %-34s %s\n' "$name" "$(printf '%s' "$out" | tail -1 | cut -c1-60)"
  elif [[ -n "$unklar" ]] && (( code == unklar )); then
    UNKLAR+=("$name")
    printf '  ----  %-34s %s\n' "$name" "$(printf '%s' "$out" | tail -2 | head -1 | cut -c1-60)"
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

# Which of these checks has ever been shown to fail?
#
# A check that has never gone red is a check nobody has verified, and this repo says so about
# tests in loop-constraints.md ("Ein Test, der ohne den zugehoerigen Fix gruen bleibt, ist kein
# Test"). On 2026-09-22 the same question was put to the twelve below, one at a time, by breaking
# what each one guards:
#
#   health              a wrong URL answers 000, the check reports it
#   conway still broken CONWAY_PROBE_TIMEOUT=1 gives the third exit, not a false alarm
#   market guards       DEADLINE_MAX_MS raised to ten years: MARKT FAIL, 1 failure
#   journeys            an invented /v1 path in docs/journeys.md: JOURNEYS FAIL
#   pages               a dead internal link and a renamed doc heading, both named
#   classes             one class with no CSS rule: CLASSES FAILED
#   daily jobs          CP_MAX_AGE_HOURS=1: all four artefacts named with their ages
#   runtime claims      a renamed field in the pattern: WRONG, naming the claim
#   published data      a deleted CSV row: three figures named with both values
#   search engines      a noindex meta tag: VISIBILITY FAILED
#   shown commands      one altered line in the hero: shown-but-not-returned, both directions
#   the way in          nothing had to be broken: its first run was red, on the 401 that named
#                       the three auth steps in words and no path anybody could call
#
# Every one of them went red for the right reason and green again afterwards. Anything added
# below is expected to have been through the same before it is trusted.

echo "Handsel, all checks against $BASE"
echo

# The service itself, before anything that depends on it. If this is red nothing else means much.
run "health from outside" bash -c "code=\$(curl -s -o /dev/null -m 10 -w '%{http_code}' $BASE/health); [[ \$code == 200 ]] && echo \"\$code\" || { echo \"\$code\"; exit 1; }"

# Our own public claim about Conway. Returns 1 when their onboarding works again, which would make
# the front page untrue.
run --unklar-bei 2 "conway still broken" ./ops/conway-zustand.sh

run "market guards" env CP_URL="$BASE" pnpm -s tsx harness/e2e/markt.ts
run "journeys match the service" ./ops/journeys-pruefen.sh
run "pages say nothing obviously wrong" ./ops/seiten-pruefen.sh
# Added 2026-09-21. The three series below were printed by this script and never checked, so a cron
# entry that stops firing would leave the same last point in every cycle's output and this script
# would keep saying ALL CHECKS OK next to it.
run "every class on every page has a rule" ./ops/klassen-pruefen.py
run "the daily jobs still ran" ./ops/freshness.sh

# What we say about somebody else's code, held against their code.
#
# Seven claims about the Conway runtime, checked at the pin and on main. It is the check that
# would have caught B3, B6 and B7 in the adversarial read of 2026-09-22, and it ran only when
# somebody remembered it: no script called it, and its own docstring named a signal ("a new push
# there") that nothing was wired to. A check that runs when somebody thinks of it does not run.
#
# Undetermined rather than red when GitHub cannot be reached: it exits 2 for an unreachable file,
# and a rate limit at api.github.com is not a finding about our claims. Same rule as Conway's
# sign-up, for the same reason.
run --unklar-bei 2 "our claims about the runtime hold" python3 ./ops/upstream-claims.py

# Every published dataset against the CSV beside it. See ops/daten-pruefen.py: the file that
# carried the article's numbers was built by hand, survived the correction of its own source, and
# the README two sections down described the discrepancy while recommending the file.
run --unklar-bei 2 "the published data reproduces" ./ops/daten-pruefen.py

# Whether anything that indexes the web has ever looked at this service, and whether our side of
# that is in order. The first crawler is news; until then the line is the finding. See
# ops/sichtbarkeit.sh: in the first 2.6 days there was not one, and nothing on our side is wrong.
run --unklar-bei 2 "search engines can find us" ./ops/sichtbarkeit.sh

# Every command a page shows, run against the live service. The unit tests prove a page agrees
# with the code in this checkout; this asks whether it agrees with what is deployed, and whether
# the answer the hero prints beside its call is the answer the service gives. See
# ops/befehle-pruefen.sh.
run --unklar-bei 2 "the commands the pages show work" ./ops/befehle-pruefen.sh

# Can somebody who has not read the source get in? Three faults on 2026-09-22 said no, and all
# three were invisible from in here: every answer involved was correct and none was any use.
run "the way in is walkable" ./ops/fremder-client.sh

if (( DEEP )); then
  run "MCP route end to end" env CP_URL="$BASE" OPERATOR_WALLET="${OPERATOR_WALLET:-harness/state/mainnet-wallet.json}" pnpm -s tsx ops/mcp-against-production.ts \
    && touch "$STAMPS/mcp-production"
  run "skill route end to end" env CP_URL="$BASE" OPERATOR_WALLET="${OPERATOR_WALLET:-harness/state/mainnet-wallet.json}" ./ops/skill-against-production.sh \
    && touch "$STAMPS/skill-production"
fi

# How old the proof of the cold start is, and how much has changed since.
#
# `ops/neuling-probe.ts` is the only thing that walks the whole promise on the landing page, from a
# wallet that did not exist to a thought paid for by the grant. It costs a grant, so it is not run
# every cycle, which means its result quietly ages. On 2026-09-22 its last run was fifteen hours,
# 96 commits and twelve deploys behind, and the deploys in between had changed exactly the
# endpoints it walks. Printed, not failed: it is a reminder and not a finding.
alter_des_belegs() {
  local stempel="$1" was="$2" wie="$3"
  if [[ ! -f "$STAMPS/$stempel" ]]; then
    echo "$was: never proven on this checkout. $wie"
    return
  fi
  local zeit commit alter neu
  read -r zeit commit < "$STAMPS/$stempel"
  alter=$(( ($(date -u +%s) - $(date -u -jf %Y-%m-%dT%H:%M:%SZ "$zeit" +%s 2>/dev/null || date -u -d "$zeit" +%s 2>/dev/null || echo 0)) / 3600 ))
  neu=$(git log --oneline "$commit..HEAD" 2>/dev/null | wc -l | tr -d ' ')
  echo "$was last proven ${alter}h ago at ${commit}, ${neu:-?} commit(s) ago ($wie)"
}
alter_des_belegs kaltstart "cold start" "ops/neuling-probe.ts, costs a grant"
alter_des_belegs sicherung "backup restore" "ops/sicherung-probe.sh, costs nothing"

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
fremd = db.get('wallets_foreign')
if fremd is not None:
    liste = [w['address'] if isinstance(w, dict) else w for w in db.get('wallets_foreign_list', [])]
    kurz = ', '.join(a[:10] + '…' for a in liste[:5]) + ('' if len(liste) <= 5 else ', …')
    print(f\"wallets: {db['wallets']} in total, {fremd} of them not ours{': ' + kurz if kurz.strip(', …') else ''}\")
aktiv = db.get('wallets_foreign_active')
if aktiv is not None:
    print(f\"strangers who have thought here: {aktiv}\"
          + ('' if aktiv else '   (the step between provisioning and paying, and nothing counted it until 22.09.)'))
# Printed loudly rather than as a count that moved. A stranger provisioning is the second biggest
# thing that can happen on this service, and on 2026-09-22 one did while the only sign was a total
# going from 2 to 3.
for w in db.get('wallets_foreign_new_24h', []):
    print(f\"NEW     {w['address']} provisioned {w['created_at'][11:16]} UTC, \"
          f\"key {', '.join(w['key_names']) or '(none)'}, \"
          f\"{'has used it' if w['used'] else 'has not used it yet'}\")
uebrig = m.get('starter_grants_left', 0)
print(f\"newcomers the starter pool still carries: {uebrig}\")
if uebrig < 3:
    print(f\"FAILED  the starter pool carries {uebrig} more newcomer(s). /fix, the landing page \"
          f\"and /post all promise a fresh wallet 15 cents, and that promise is about this pot. \"
          f\"Three is the last point at which one probe run cannot empty it before a stranger \"
          f\"arrives. Raise POOL_MC in src/credits/starter.ts, which is Matthias' money, or stop \"
          f\"spending it on ourselves.\")
    sys.exit(3)
seed = m.get('seed_submissions_on_open', 0)
if seed:
    print(f\"seeded: {seed} submission(s) on live jobs come from our own agents (ops/compete.ts). \"
          f\"Subtract that from the counts the landing page publishes.\")
if m.get('stray_submissions_on_open', 0):
    print(f\"FAILED  {m['stray_submissions_on_open']} submission(s) from a tool of ours sit on a \"
          f\"live job. That is a check that escaped its throwaway, not the seeding, and the open \"
          f\"list publishes the count.\")
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
gesamt=$(( ${#PASSED[@]} + ${#FAILED[@]} + ${#UNKLAR[@]} ))
if (( ${#FAILED[@]} == 0 )); then
  # An undetermined check is not a pass, and the summary line is what gets copied into the
  # protocol, so it has to carry the difference or the protocol inherits the lie.
  if (( ${#UNKLAR[@]} )); then
    echo "CHECKS OK (${#PASSED[@]} of $gesamt), NOT DETERMINED: ${UNKLAR[*]}"
  else
    echo "ALL CHECKS OK (${#PASSED[@]} of $gesamt)"
  fi
  exit 0
fi
echo "CHECKS FAILED: ${FAILED[*]}"
(( ${#UNKLAR[@]} )) && echo "NOT DETERMINED: ${UNKLAR[*]}"
exit 1
