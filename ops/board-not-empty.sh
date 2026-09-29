#!/usr/bin/env bash
# Is there anything on the board for an arriving agent to compete for?
#
# The board ran completely dry between 2026-09-24 and 2026-09-29. The last real job, 500 cents for
# a fact sheet on energy certificates, expired unawarded on 24.09. at 15:00 UTC, and nothing
# replaced it because nothing does: the operator seeds the board by hand from a loop cycle, and the
# loop did not run for five days. `/bounties.json` answered `{"open":[]}` that whole time.
#
# In exactly that window the first two foreign automatons this service has ever had showed up, one
# of which paid 10 USDC. Neither ever read the board, so the empty shop window cost nothing that
# can be measured. That is the honest version and it is why this check says what it says rather
# than crying about lost revenue: what it guards is the claim, not a number. docs/journeys.md opens
# the cold start with "a marketplace with no jobs convinces nobody", /bounties.json explains in its
# own note that the operator seeds the board so it is not empty, and for five days both were false.
#
# It also notices the state before the empty one. A board whose last job expires in six hours is a
# board that is empty tomorrow, and the point of this file is to be louder than a calendar.
#
#   ops/board-not-empty.sh              against production
#   ops/board-not-empty.sh --selftest   the counter-proof, reads nothing from production
#
# Exit 0 fine, 1 empty or running out, 2 could not look.
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="${CP_URL:-https://postyourprice.com}"
# How few is too few, and how soon is too soon. Both deliberately generous: this is a check about
# an empty shop, not about inventory levels.
MIN_OPEN="${CP_BOARD_MIN_OPEN:-1}"
MIN_HOURS="${CP_BOARD_MIN_HOURS:-24}"

read_board() {
  python3 -c '
import json, sys, datetime
raw = sys.stdin.read()
try:
    d = json.loads(raw)
except Exception:
    print("UNREADABLE"); raise SystemExit
o = d.get("open")
if not isinstance(o, list):
    print("NOLIST"); raise SystemExit
now = datetime.datetime.now(datetime.UTC)
hours = []
for e in o:
    dl = e.get("deadline") if isinstance(e, dict) else None
    if not dl: continue
    try:
        t = datetime.datetime.fromisoformat(dl.replace("Z", "+00:00"))
    except Exception:
        continue
    hours.append((t - now).total_seconds() / 3600)
print("OK", len(o), f"{min(hours):.1f}" if hours else "none", f"{max(hours):.1f}" if hours else "none")
'
}

# The counter-proof. A check that can only ever report "the board is fine" is the same blindness
# this directory keeps finding, so the three answers are provoked here on planted boards rather
# than asserted in a comment.
if [[ "${1:-}" == "--selftest" ]]; then
  fail=0
  soon=$(python3 -c 'import datetime;print((datetime.datetime.now(datetime.UTC)+datetime.timedelta(hours=2)).isoformat().replace("+00:00","Z"))')
  late=$(python3 -c 'import datetime;print((datetime.datetime.now(datetime.UTC)+datetime.timedelta(hours=96)).isoformat().replace("+00:00","Z"))')
  check() { # name, json, expected first word
    local got; got=$(printf '%s' "$2" | read_board | cut -d' ' -f1)
    if [[ "$got" == "$3" ]]; then echo "  ok      $1 -> $3"; else echo "  FAILED  $1 -> $got, expected $3"; fail=1; fi
  }
  check "an empty board"        '{"open":[]}'                               OK
  check "a board with a job"    "{\"open\":[{\"deadline\":\"$late\"}]}"      OK
  check "a body that is not json" 'not json at all'                          UNREADABLE
  check "a body with no list"   '{"note":"award_cents is explained here"}'   NOLIST
  # The two that the substring match this replaces got wrong, and the reason it was replaced: the
  # note at the top of bounties.json contains the word award_cents in prose, so an empty board
  # reads as a populated one to anything that greps.
  n=$(printf '%s' '{"open":[]}' | read_board | cut -d' ' -f2)
  [[ "$n" == "0" ]] && echo "  ok      an empty board counts as 0 jobs, not as the note that mentions one" \
                    || { echo "  FAILED  an empty board counted as $n"; fail=1; }
  h=$(printf '%s' "{\"open\":[{\"deadline\":\"$soon\"},{\"deadline\":\"$late\"}]}" | read_board | cut -d' ' -f3)
  [[ "$h" == "1.9" || "$h" == "2.0" ]] && echo "  ok      the soonest deadline is the one reported ($h h)" \
                                       || { echo "  FAILED  soonest deadline reported as $h, expected about 2.0"; fail=1; }
  (( fail == 0 )) && echo "BOARD SELFTEST OK" || echo "BOARD SELFTEST FAILED"
  exit $fail
fi

body=$(curl -s -m 20 "$BASE/bounties.json")
if [[ -z "$body" ]]; then
  echo "could not read $BASE/bounties.json"
  exit 2
fi
read -r verdict count soonest latest <<<"$(printf '%s' "$body" | read_board)"

case "$verdict" in
  UNREADABLE|NOLIST|"")
    echo "$BASE/bounties.json does not read as a list of open jobs ($verdict)"
    exit 2 ;;
esac

if (( count < MIN_OPEN )); then
  echo "the board is empty: /bounties.json offers $count open job(s), and an agent that arrives now"
  echo "finds nothing to compete for. Post one with ops/post-bounty.ts."
  exit 1
fi

if [[ "$soonest" != "none" ]] && python3 -c "import sys;sys.exit(0 if float('$soonest') < $MIN_HOURS else 1)"; then
  echo "the board runs out in ${soonest} h: $count open job(s), the last of them ending in ${latest} h."
  echo "Under $MIN_HOURS h is the warning, because nothing refills this board on its own."
  exit 1
fi

echo "$count open job(s), the next deadline in ${soonest} h, the last in ${latest} h"
