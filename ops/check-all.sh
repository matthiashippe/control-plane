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
due() {
  local stamp="$STAMPS/$1"
  [[ ! -f "$stamp" ]] && return 0
  local age=$(( $(date -u +%s) - $(date -u -r "$stamp" +%s 2>/dev/null || echo 0) ))
  (( age > ${CP_PROBE_MAX_AGE:-86400} ))
}
if due mcp-production || due skill-production; then
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
# The third state is opt-in per check, via `--undetermined-on <code>`, because a check that is
# allowed to shrug is a check that can stop working in silence.
declare -a PASSED=() FAILED=() UNDETERMINED=()

# Where a failing check's whole output goes, so the summary can repeat it.
FAILDIR="$(mktemp -d)"
trap 'rm -rf "$FAILDIR"' EXIT

# Has this name already been used in this run?
#
# On 2026-09-23 a run of this script reported "CHECKS OK (13 of 14)" while one check had not run
# at all and another had run twice. The cause was editing this file while it was executing: bash
# reads a script from disk as it goes, and shifting the bytes under it made it resume mid-line,
# which also produced two "command not found" lines nobody would connect to a missing check. The
# count was right because the duplicate filled the gap.
#
# The lesson about editing a running script is a lesson for whoever edits it. What belongs here is
# the part the report can know by itself: a name it has already seen means the list of checks is
# not what it looks like, whatever the reason, and a report that cannot notice that is worth less
# than its own summary line.
# One string rather than a walk over the three arrays: this script runs under `set -u`, and an
# empty array is an unbound variable in the bash that ships with macOS, so the guard would abort
# the run it exists to protect.
SEEN_NAMES=""
seen_name() {
  case "$SEEN_NAMES" in
    *"|$1|"*) return 0 ;;
  esac
  return 1
}

run() {
  local undetermined=""
  if [[ "$1" == "--undetermined-on" ]]; then undetermined="$2"; shift 2; fi
  local name="$1"; shift
  if seen_name "$name"; then
    echo "  BROKEN  \"$name\" ran twice. The list of checks is not what it looks like: this script"
    echo "          was probably edited while it was running. Re-run it without touching it."
    FAILED+=("$name ran twice")
    return 1
  fi
  SEEN_NAMES="$SEEN_NAMES|$name|"
  local out
  out=$("$@" 2>&1)
  local code=$?
  if (( code == 0 )); then
    PASSED+=("$name")
    printf '  ok    %-34s %s\n' "$name" "$(printf '%s' "$out" | tail -1 | cut -c1-60)"
  elif [[ -n "$undetermined" ]] && (( code == undetermined )); then
    UNDETERMINED+=("$name")
    # The last line that says something, not the second to last. A check whose verdict is its
    # final line then gets captioned with a blank, which is what happened to check-pages.sh the
    # moment it learned to print one.
    printf '  ----  %-34s %s\n' "$name" "$(printf '%s' "$out" | grep -v '^[[:space:]]*$' | tail -1 | cut -c1-60)"
  else
    FAILED+=("$name")
    printf '  FAIL  %-34s exit %s\n' "$name" "$code"
    printf '%s\n' "$out" | tail -4 | sed 's/^/        /'
    # And the whole of it, kept, because four lines is the wrong four often enough to matter.
    #
    # This check failed twice, on 2026-09-22 at 22:25 and on 2026-09-23 at 01:26, and both times
    # the reason was lost the same way: the four lines here were the summary rather than the
    # failing line, and whoever read the run piped it through tail and cut off even those. Twice
    # is a property of the report, not of the reader. The summary at the end repeats what is in
    # this file, so the reason survives being read from the bottom.
    printf '%s\n' "$out" > "$FAILDIR/$(printf '%s' "$name" | tr -c 'a-zA-Z0-9' '-').txt"
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
# tests in loop-constraints.md ("a test that stays green without the fix it belongs to is not
# a test"). On 2026-09-22 the same question was put to the twelve below, one at a time, by breaking
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
run --undetermined-on 2 "conway still broken" ./ops/conway-zustand.sh

run "market guards" env CP_URL="$BASE" pnpm -s tsx harness/e2e/market.ts
run "journeys match the service" ./ops/check-journeys.sh
run --undetermined-on 2 "pages say nothing obviously wrong" ./ops/check-pages.sh
# Added 2026-09-21. The three series below were printed by this script and never checked, so a cron
# entry that stops firing would leave the same last point in every cycle's output and this script
# would keep saying ALL CHECKS OK next to it.
run --undetermined-on 2 "every class on every page has a rule" ./ops/check-classes.py
# Added 2026-09-23, the day a measurement first existed. Two pages pushed 26 px past the edge of a
# 320 px phone and had done so for as long as they existed; twelve of the sixty foreign addresses
# in the log carry a phone user agent. Exit 2 when there is no Chrome, so a machine without one
# reports "could not tell" rather than a failure.
run --undetermined-on 2 "it fits a small phone" ./ops/phone.sh --quick
# Added the same day, for the same reason one layer over: the light colour scheme had never been
# seen, because headless Chrome reports dark in a plain run and every screenshot this project ever
# took was therefore of the dark one. --quick is one scheme and three pages; the full run is six
# pages in both.
run --undetermined-on 2 "the text is readable in both schemes" ./ops/contrast.sh --quick
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
run --undetermined-on 2 "our claims about the runtime hold" python3 ./ops/upstream-claims.py

# Every published dataset against the CSV beside it. See ops/check-data.py: the file that
# carried the article's numbers was built by hand, survived the correction of its own source, and
# the README two sections down described the discrepancy while recommending the file.
run --undetermined-on 2 "the published data reproduces" ./ops/check-data.py

# Whether anything that indexes the web has ever looked at this service, and whether our side of
# that is in order. The first crawler is news; until then the line is the finding. See
# ops/visibility.sh: in the first 2.6 days there was not one, and nothing on our side is wrong.
run --undetermined-on 2 "search engines can find us" ./ops/visibility.sh

# Every command a page shows, run against the live service. The unit tests prove a page agrees
# with the code in this checkout; this asks whether it agrees with what is deployed, and whether
# the answer the hero prints beside its call is the answer the service gives. See
# ops/check-commands.sh.
run --undetermined-on 2 "the commands the pages show work" ./ops/check-commands.sh

# Can somebody who has not read the source get in? Three faults on 2026-09-22 said no, and all
# three were invisible from in here: every answer involved was correct and none was any use.
run "the way in is walkable" ./ops/stranger-client.sh

if (( DEEP )); then
  run "MCP route end to end" env CP_URL="$BASE" OPERATOR_WALLET="${OPERATOR_WALLET:-harness/state/mainnet-wallet.json}" pnpm -s tsx ops/mcp-against-production.ts \
    && touch "$STAMPS/mcp-production"
  run "skill route end to end" env CP_URL="$BASE" OPERATOR_WALLET="${OPERATOR_WALLET:-harness/state/mainnet-wallet.json}" ./ops/skill-against-production.sh \
    && touch "$STAMPS/skill-production"
fi

# The one number the standing order is actually about, printed where a cycle already looks.
#
# ops/traffic.sh has carried it since 2026-09-22 and ops/check-all.sh did not, so reading the
# report told you the way in is walkable and not whether anybody walks it. Those are different
# questions and the second one is the point: on the night it was written, eighteen addresses had
# opened a page, one had scrolled, and none had opened a second one.
#
# Printed, not failed. Nobody arriving is not a fault in this repository.
echo
./ops/traffic.sh --funnel 2>/dev/null || echo "  (the funnel could not be read; ops/traffic.sh says why)"

# The rule that outranks the backlog, in one line.
#
# "An error a real user saw beats any task in the backlog" has been the standing order for days,
# and there was no way to ask it, so the answer arrived by accident: one caller in Helsinki spent
# three days failing to find the API entry point and surfaced only because a path in an unrelated
# report looked like a formatting bug. ops/failures.sh asks it on purpose; this line says whether
# it is worth opening. Printed, not failed: a 401 to a browser is the correct answer and not a
# fault, and what this cannot judge is which of them was a person.
echo
printf "  "
./ops/failures.sh --summary 2>/dev/null || echo "(the failure list could not be read; ops/failures.sh says why)"

# How old the proof of the cold start is, and how much has changed since.
#
# `ops/newcomer-probe.ts` is the only thing that walks the whole promise on the landing page, from a
# wallet that did not exist to a thought paid for by the grant. It costs a grant, so it is not run
# every cycle, which means its result quietly ages. On 2026-09-22 its last run was fifteen hours,
# 96 commits and twelve deploys behind, and the deploys in between had changed exactly the
# endpoints it walks. Printed, not failed: it is a reminder and not a finding.
age_of_the_proof() {
  local stamp="$1" label="$2" how="$3"
  if [[ ! -f "$STAMPS/$stamp" ]]; then
    echo "$label: never proven on this checkout. $how"
    return
  fi
  local proven_at commit age commits_since seconds
  read -r proven_at commit < "$STAMPS/$stamp"
  # Milliseconds are stripped before parsing. ops/newcomer-probe.ts writes its stamp with
  # `new Date().toISOString()`, which ends in `.536Z`, and the format below does not take that. The
  # parse fell through to `echo 0` and the line read "cold start last proven 497256h ago", an age
  # counted from 1970. It was only noticed because 56 years is absurd; a stamp written a few hours
  # wrong would have passed for real.
  proven_at="${proven_at/.[0-9][0-9][0-9]Z/Z}"
  seconds=$(date -u -jf %Y-%m-%dT%H:%M:%SZ "$proven_at" +%s 2>/dev/null || date -u -d "$proven_at" +%s 2>/dev/null || echo "")
  if [[ -z "$seconds" ]]; then
    # Say it is unreadable rather than print an age derived from nothing.
    echo "$label: stamp at $STAMPS/$stamp is not a date I can read ($proven_at). $how"
    return
  fi
  age=$(( ($(date -u +%s) - seconds) / 3600 ))
  commits_since=$(git log --oneline "$commit..HEAD" 2>/dev/null | wc -l | tr -d ' ')
  echo "$label last proven ${age}h ago at ${commit}, ${commits_since:-?} commit(s) ago ($how)"
}
age_of_the_proof kaltstart "cold start" "ops/newcomer-probe.ts, costs a grant"
age_of_the_proof sicherung "backup restore" "ops/backup-probe.sh, costs nothing"

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
unknown = m.get('unclassified_key_names', [])
for name in unknown:
    print(f\"FAILED  a key named '{name}' is on neither list. Either a tool of ours forgot to \"
          f\"register its name in ops/db-report.cjs, or somebody who is not us showed up.\")
if unknown:
    # Not a LOOK any more. While a name is unclassified, every number that splits us from the
    # market is wrong by an unknown amount, and foreign_buyers is the number the whole plan hangs
    # on. Four times in one day a tool of ours arrived without its name and a number about the
    # market quietly became a number about us; each time the report said LOOK and the cycle
    # carried on. Either it is ours and belongs on the list, or it is a stranger and is the best
    # news this project has had, and both deserve more than a line somebody skims.
    sys.exit(3)
foreign = db.get('wallets_foreign')
if foreign is not None:
    addresses = [w['address'] if isinstance(w, dict) else w for w in db.get('wallets_foreign_list', [])]
    short = ', '.join(a[:10] + '…' for a in addresses[:5]) + ('' if len(addresses) <= 5 else ', …')
    print(f\"wallets: {db['wallets']} in total, {foreign} of them not ours{': ' + short if short.strip(', …') else ''}\")
active = db.get('wallets_foreign_active')
if active is not None:
    print(f\"strangers who have thought here: {active}\"
          + ('' if active else '   (the step between provisioning and paying, and nothing counted it until 22.09.)'))
# Printed loudly rather than as a count that moved. A stranger provisioning is the second biggest
# thing that can happen on this service, and on 2026-09-22 one did while the only sign was a total
# going from 2 to 3.
for w in db.get('wallets_foreign_new_24h', []):
    print(f\"NEW     {w['address']} provisioned {w['created_at'][11:16]} UTC, \"
          f\"key {', '.join(w['key_names']) or '(none)'}, \"
          f\"{'has used it' if w['used'] else 'has not used it yet'}\")
left = m.get('starter_grants_left', 0)
print(f\"newcomers the starter pool still carries: {left}\")
if left < 3:
    print(f\"FAILED  the starter pool carries {left} more newcomer(s). /fix, the landing page \"
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
" || market_hygiene=$?
  # `|| true` used to swallow everything here, which was right for "no JSON to read" and wrong for
  # a real finding: exit 3 from the block above meant nothing at all. Only that one code counts as
  # a failure, so a missing report is still tolerated and a dirty market is not.
  if [[ "${market_hygiene:-0}" == "3" ]]; then
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
# `ops/x402-series.sh` and `ops/conway-series.sh` both run by cron on the VM and both print
# what moved since the previous point. Until 2026-09-21 that printing went to
# /var/log/cp-x402.log and /var/log/cp-conway.log, which no cycle opened. Each script carries the
# sentence that a series nobody reads is a file, and then wrote into one. So the last point of each
# comes here, where the cycle already looks.
#
# The VM only hands over two lines; the reading happens locally, because a nested heredoc over ssh
# is a quoting puzzle and this is a diagnostic, not a place to be clever.
series=$(timeout 25 ssh -i "${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}" -o BatchMode=yes -o ConnectTimeout=8 \
  "${CP_HOST:-root@76.13.144.207}" \
  'echo "x402 $(wc -l < /opt/control-plane/x402/kennzahlen.ndjson 2>/dev/null || echo 0) $(tail -1 /opt/control-plane/x402/kennzahlen.ndjson 2>/dev/null)";
   echo "conway $(wc -l < /opt/control-plane/conway/repo.ndjson 2>/dev/null || echo 0) $(tail -1 /opt/control-plane/conway/repo.ndjson 2>/dev/null)";
   echo "money $(wc -l < /opt/control-plane/conway-money/metrics.ndjson 2>/dev/null || echo 0) $(tail -1 /opt/control-plane/conway-money/metrics.ndjson 2>/dev/null)"' 2>/dev/null)

if [[ -n "$series" ]]; then
  printf '%s\n' "$series" | python3 -c "
import json, sys
for line in sys.stdin:
    parts = line.strip().split(' ', 2)
    if len(parts) < 3 or not parts[2].startswith('{'):
        print(f'{parts[0] if parts else \"?\"} series: no point yet')
        continue
    name, n, raw = parts[0], parts[1], parts[2]
    try:
        d = json.loads(raw)
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
total=$(( ${#PASSED[@]} + ${#FAILED[@]} + ${#UNDETERMINED[@]} ))
if (( ${#FAILED[@]} == 0 )); then
  # An undetermined check is not a pass, and the summary line is what gets copied into the
  # protocol, so it has to carry the difference or the protocol inherits the lie.
  if (( ${#UNDETERMINED[@]} )); then
    echo "CHECKS OK (${#PASSED[@]} of $total), NOT DETERMINED: ${UNDETERMINED[*]}"
  else
    echo "ALL CHECKS OK (${#PASSED[@]} of $total)"
  fi
  exit 0
fi
echo "CHECKS FAILED: ${FAILED[*]}"
(( ${#UNDETERMINED[@]} )) && echo "NOT DETERMINED: ${UNDETERMINED[*]}"
# What actually went wrong, at the bottom where a summary is read. A check that prints a line per
# item says everything in the lines that are not "ok", so those are repeated in full; if there are
# none, the tail of the output is all there is and it goes instead.
for f in "$FAILDIR"/*.txt; do
  [ -e "$f" ] || continue
  echo
  echo "  why it failed:"
  bad=$(grep -vE '^\s*ok\b' "$f" | grep -vE '^\s*$' || true)
  if [ -n "$bad" ]; then
    printf '%s\n' "$bad" | sed 's/^/    /'
  else
    tail -8 "$f" | sed 's/^/    /'
  fi
done
exit 1
