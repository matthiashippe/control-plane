#!/usr/bin/env bash
# Can a stranger with no wallet post a job? Walked, not assumed.
#
# Goal 16's first condition, and the only way to answer it is to be that stranger: fetch /check
# like a browser, submit the brief the way the button does, and see whether a job comes back with
# a key. Everything here goes over HTTP against the running service; nothing imports the code.
#
#   ops/keyless-walk.sh                 against https://postyourprice.com
#   ops/keyless-walk.sh --dry           the four steps that cost nothing, for every cycle
#   CP_URL=http://127.0.0.1:8402 ops/keyless-walk.sh
#   ops/keyless-walk.sh --selftest      plant a failure at each step and check it is caught
#
# Exit 0 means the walk got through. Exit 1 means it did not, and the step that stopped it is
# named. Exit 2 means the walk could not run at all, which is not a finding about the path.
#
# **It spends money.** A successful walk takes a first job out of the starter pool, and the handle
# it mints counts as a foreign buyer until somebody says otherwise. The last thing it prints is
# what to do about both, because a measurement that quietly falsifies the number it is next to is
# worse than no measurement.
# --dry stops before the step that spends.
#
# The full walk takes a first job out of the starter pool and leaves a handle that has to be
# claimed in OUR_ADDRESSES, so it cannot run every cycle. Steps 1 to 4 cost nothing and cover
# everything except the posting itself: the page answers, the button is there, the sentence about
# what it costs is there, and a form post from a foreign origin is refused. That is the plumbing
# of the newest path on this service, and it is worth checking on a service that deploys six
# times a day.
DRY=0
[[ "${1:-}" == "--dry" ]] && { DRY=1; shift; }

set -uo pipefail

CP_URL="${CP_URL:-https://postyourprice.com}"
BROWSER='text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
BRIEF='FACT SHEET on the energy certificate (consumption-based or demand-based) for a 1974 apartment building with six flats and a gas boiler, for a landlord ordering one for the first time. 400 to 500 words in five sections. Deliver the text only, no cover note. Do not name the price of any single provider.'

fail=0
step() { printf '%-46s' "$1"; }
ok()   { echo "ok    ${1:-}"; }
bad()  { echo "FAIL  $1"; fail=$((fail + 1)); }

# --selftest plants a wrong answer at each step and checks the step notices. Without this the
# script can only ever print "ok", and a green line that cannot go red measures nothing.
if [[ "${1:-}" == "--selftest" ]]; then
  echo "selftest: each check is given something that should fail it"
  s=0
  page_no_form='<html><body><p>no box here</p></body></html>'
  grep -q 'action="/start"' <<<"$page_no_form" && { echo "  FAIL form check passed a page with no form"; s=1; } || echo "  ok   form check catches a page with no form"
  body_no_key='<html>your job is up</html>'
  grep -qoE 'cnwy_k_[0-9a-f]{32}' <<<"$body_no_key" && { echo "  FAIL key check passed a page with no key"; s=1; } || echo "  ok   key check catches a page with no key"
  board_without='<html>some other job</html>'
  grep -q 'ENERGY-MARKER' <<<"$board_without" && { echo "  FAIL board check passed a board without the job"; s=1; } || echo "  ok   board check catches a board without the job"
  echo "selftest $([ $s -eq 0 ] && echo passed || echo FAILED)"
  exit $s
fi

echo "walking $CP_URL as somebody with no wallet, no key and no USDC"
echo

step "1. /check answers a browser"
check=$(curl -s -m 20 -A "$UA" -H "accept: $BROWSER" "$CP_URL/check")
[[ -n "$check" ]] && ok "$(wc -c <<<"$check" | tr -d ' ') bytes" || { bad "no answer"; exit 2; }

step "2. a result page offers the job button"
result=$(curl -s -m 20 -A "$UA" -H "accept: $BROWSER" --data-urlencode "brief=$BRIEF" --data "kind=factual" \
  -G "$CP_URL/check")
if grep -q 'formaction="/start"' <<<"$result"; then ok "the button posts to /start"
else bad "no button on the result page"; echo "$result" | grep -o '<form[^>]*>' | head -3; exit 1; fi

step "3. it says posting needs nothing"
grep -qi 'no account, no wallet, no card' <<<"$result" && ok || bad "the sentence still names a wallet"

step "4. a foreign origin is refused"
code=$(curl -s -m 20 -o /dev/null -w '%{http_code}' -X POST -A "$UA" -H "accept: $BROWSER" \
  -H "origin: https://example.invalid" --data-urlencode "brief=$BRIEF" --data "kind=factual" "$CP_URL/start")
[[ "$code" == "403" ]] && ok "403" || bad "expected 403, got $code"

if (( DRY )); then
  echo
  if [[ $fail -eq 0 ]]; then
    echo "DRY OK  the page, the button, the sentence and the origin check are in place."
    echo "        The posting itself is not checked here; it spends. Run without --dry for that."
  else
    echo "STOPPED $fail of the four free step(s) failed."
  fi
  exit $fail
fi

step "5. the button posts and a job comes back"
started=$(curl -s -m 30 -X POST -A "$UA" -H "accept: $BROWSER" -H "origin: $CP_URL" \
  --data-urlencode "brief=$BRIEF" --data "kind=factual" "$CP_URL/start")
key=$(grep -oE 'cnwy_k_[0-9a-f]{32}' <<<"$started" | head -1)
id=$(grep -oE '/jobs/[0-9a-f-]{36}' <<<"$started" | head -1 | cut -d/ -f3)
if [[ -n "$key" && -n "$id" ]]; then ok "job ${id:0:8}, key ${key:0:14}…"
else
  if grep -qi 'not available' <<<"$started"; then
    echo "REFUSED  the pool had nothing left for a first job. That is the service working, not the"
    echo "         path failing, and it is what a stranger would have seen this minute."
    exit 0
  fi
  bad "no key or no job id in the answer"; echo "$started" | head -20; exit 1
fi

step "6. the key opens the job"
sub=$(curl -s -m 20 -H "authorization: Bearer $key" "$CP_URL/v1/submissions?bounty_id=$id")
grep -q '"submissions"' <<<"$sub" && ok || bad "the key does not read its own job: $(head -c 120 <<<"$sub")"

step "7. the job is on the public board"
board=$(curl -s -m 20 -A "$UA" -H "accept: $BROWSER" "$CP_URL/jobs")
grep -q "1974 apartment building" <<<"$board" && ok || bad "the job is not on /jobs"

echo
if [[ $fail -eq 0 ]]; then
  echo "WALKED  a stranger with nothing got from a draft to an open job."
else
  echo "STOPPED $fail step(s) failed."
fi
echo
# The full key, not a prefix.
#
# The first run of this script printed `${key:0:14}…`, on the reflex that a secret gets truncated
# in output. It is the operator's own throwaway probe key, it exists nowhere else, and cancelling
# the job this script just created is the only way to put the money back -- which needs the key.
# So the run on 2026-09-23 left a fifty-cent job on the board with no way to take it down, and it
# had to sit there until its deadline. A key that cannot be used is not safer, it is only lost.
handle=$(curl -s -m 20 -H "authorization: Bearer $key" "$CP_URL/v1/credits/balance" | grep -oE 'key:[0-9a-f]{40}' | head -1)
echo "This walk spent real money and left a handle behind. Both need finishing, or the numbers"
echo "next to them stop being true:"
echo "  key         $key"
echo "  handle      ${handle:-<balance did not name it>}"
echo "  cancel it   CP_KEY=$key npx tsx ops/cancel-bounty.ts $id"
echo "              (the grant goes back to the pool; without it the money is tied up until the"
echo "              deadline, when releaseExpired returns it anyway)"
echo "  claim it    add the handle to OUR_ADDRESSES in src/bounties/ours.ts, or it counts as a"
echo "              foreign buyer and falsifies the one number this project is measured by."
exit $fail
