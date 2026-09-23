#!/usr/bin/env bash
# Are we in the directory our own audience searches in?
#
# An agent does not browse. It reads a facilitator's catalogue, and that catalogue is the only
# place a stranger's automaton finds this service without a human recommending it. We scan both
# public ones every morning for the article: 22,493 paid resources on 2026-09-23, and not one row
# of them ours.
#
# WHY NOT IS NOT KNOWN, and saying so is the point of this header.
#
# Until 2026-09-23 it said the cause was the shape of our resource URL: `payResource` in
# src/payments/pay.ts builds `/pay/{usd}/{recipient}` with the payer's wallet substituted, so every
# payment hands the catalogue a different URL, and "none of the 20,789 catalogued resources
# anywhere has a wallet address in its path". It then concluded the fix lived in src/payments/**,
# a path loop-constraints.md keeps locked, and left it there.
#
# That claim was measured on 2026-09-23 against the scan of the day and is false:
#
#   - 75 catalogued resources DO carry a 0x-address in their path, 58 of them in the PayAI
#     directory. pro-api.coingecko.com is listed once per token contract.
#   - 1,612 catalogued resources declare x402Version 1, as we do, so the version is not it either.
#   - Templated paths (`/v0/inboxes/:inbox_id/messages`) are the rare case, 190 of 6,792 PayAI
#     rows, not the entry requirement.
#
# What IS measured, and all of it at once:
#
#   - The facilitator knows our resource. `/discovery/resources/<ours>/stats` answers with
#     settlements 1-9, reliability 100, network base, so the payment path works and is recorded.
#   - The same facilitator's `/discovery/resources` listing, 6,792 rows, does not contain our host.
#   - So the stats store and the listing are not the same store, and being settled does not put a
#     seller in the catalogue.
#
# WHAT WAS RULED OUT ON 2026-09-23, each one measured rather than reasoned:
#
#   - A wallet-shaped segment in the path. 75 catalogued resources carry one.
#   - x402 version 1, which is what we send. 1,408 catalogued entries are v1, 126 of them added in
#     the last 30 days and the newest on the day this was written.
#   - A templated path being the entry requirement. Only 190 of 6,792 PayAI rows have one.
#   - Our combination not being live. GET /supported lists {v1, exact, base} and names `bazaar`
#     among the extensions it supports.
#   - A registration step we forgot. The facilitator's own OpenAPI (GET /openapi.json) has eleven
#     endpoints and exactly two of them write: POST /verify and POST /settle. There is nothing to
#     register with.
#   - Our scan missing us. The catalogue reports total 6,799 and the scan reads 6,792.
#   - The stats endpoint flattering us. Asked about invented resources of the same shape it
#     answers `settlements: "0"`; asked about ours it answers "1-9", last7d 1. It distinguishes.
#
# AND THE ONE THAT TURNS THE QUESTION AROUND: the catalogue is not built from settlements. A
# sample of ten catalogued entries on 2026-09-23 found three with zero settlements, and
# api.paysponge.com is catalogued with a templated path and no settlement at all. So settling does
# not admit a seller and not settling does not keep one out. We have the settlement and not the
# entry; they have the entry and not the settlement.
#
# THE SAME QUESTION ASKED OF THE OTHER CATALOGUE, 2026-09-23:
#
#   - 133 hosts appear in BOTH directories. Membership is not exclusive to the facilitator a
#     seller settles through, so "we settle through PayAI" does not explain being absent from CDP.
#   - CDP still admits x402 version 1, which is what we speak: 202 of its 204 v1 rows were updated
#     in the last 30 days and the newest is today. Version is not the blocker on either side.
#   - CDP's discovery listing reads without a key; every other path on that host answers 401, so
#     there is no public registration surface even to read.
#   - And a correction to the premise this was started from. All 107 rows with 25 or more payers
#     are CDP rows, which looks like demand living in one catalogue and is an artefact: PayAI
#     publishes no payer counts at all, 0 of 6,792 rows carry a number. Nothing published is wrong
#     about this -- docs/research/data/x402-metrics.py restricts its payer statistics to CDP on
#     purpose and /x402 says "services with published demand" -- but the comparison cannot be made.
#
# So the same thing is true of both: we have settled, we are in neither, and neither publishes a
# way in. The loop has no door it can walk through.
#
# WHAT IS LEFT, and it is not a code change in a locked path: the OpenAPI names a merchant portal
# at https://merchant.payai.network for creating an API key, and it answers 200. That is the only
# door in the public surface that is not /verify or /settle. It needs an account, so it is
# Matthias' call and not the loop's, and it is a far smaller ask than the change to
# src/payments/** that this header used to point at.
#
# One confident wrong answer is worse than an open question, because the next cycle spends its
# effort on the change it names. What this script does is make the answer visible every cycle, so
# the day it flips is a day somebody notices rather than a day nobody looked.
#
#   ops/own-x402-listing.sh
#   ops/own-x402-listing.sh --selftest   prove the search finds and misses, on a planted scan
#
# Exit 0 either way. Absence is today's expected state and not a failure of the service; the line
# it prints is the finding.
set -uo pipefail

HOST="${CP_HOST:-root@76.13.144.207}"
KEY="${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}"
# Every name this service answers to, not the one that was canonical when this line was written.
# It said `cp.hippe.eu` alone, and from the move on 2026-09-22 a listing under postyourprice.com
# would have been reported as "not in the directory" by the one tool that exists to notice it.
CP_OWN_HOSTS="${CP_OWN_HOSTS:-cp.hippe.eu postyourprice.com}"
FACILITATOR="${CP_FACILITATOR_URL:-https://facilitator.payai.network}"
# The operator wallet's own topup resource: the one payment path we know settled through PayAI.
# The old host on purpose, because that is the URL that was actually paid and recorded.
OWN_RESOURCE="${CP_OWN_RESOURCE:-https://cp.hippe.eu/pay/5/0xd24f37d0838e62621ed24111164485ded0f0924f}"

# One place that decides whether a scan contains us, because --selftest has to run the same one the
# measurement runs. `grep -c`, never `grep -q`: -q closes the pipe on the first hit, the writer
# takes SIGPIPE, and under pipefail the pipeline then fails on the runs that FOUND something.
hits_in() { # scan-file -> the number of rows naming one of our hosts
  local pattern
  pattern=$(printf '%s' "$CP_OWN_HOSTS" | tr ' ' '|' | sed 's/\./\\./g')
  /usr/bin/grep -cE "$pattern" "$1" 2>/dev/null || true
}

if [[ "${1:-}" == "--selftest" ]]; then
  absent=$(mktemp); present=$(mktemp); trap 'rm -f "$absent" "$present"' EXIT
  header="verzeichnis,resource,host,x402_version,netzwerk,betrag_atomar,last_updated,last_called_at,calls_30d,unique_payers_30d,hat_bazaar_block"
  printf '%s\n' "$header" \
    "cdp,https://api.onesource.io/api/chain/erc20-balance,api.onesource.io,2,eip155:8453,3000,,,940,934,1" \
    "payai,https://pro-api.coingecko.com/x402/token_price/0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b,pro-api.coingecko.com,2,eip155:8453,1000,,,,,1" > "$absent"
  cp "$absent" "$present"
  # A listing under the NEW host, which the old single-name search could not have seen.
  printf '%s\n' "payai,https://postyourprice.com/pay/:usd/:address,postyourprice.com,1,eip155:8453,5000000,,,,,1" >> "$present"
  fail=0
  n=$(hits_in "$absent")
  [[ "$n" -eq 0 ]] || { echo "SELFTEST FAILED: found us in a scan that does not contain us ($n row(s))"; fail=1; }
  n=$(hits_in "$present")
  [[ "$n" -eq 1 ]] || { echo "SELFTEST FAILED: a listing under postyourprice.com was not found ($n row(s))"; fail=1; }
  # A wallet address in a path must not be mistaken for us: the coingecko row carries one.
  [[ "$(hits_in "$absent")" -eq 0 ]] || { echo "SELFTEST FAILED: a 0x path counted as ours"; fail=1; }
  [[ "$fail" -eq 0 ]] && echo "SELFTEST OK: absence reads as absence, and a listing under either host is found."
  exit "$fail"
fi

# The scan of the day, as the cron left it, pulled whole rather than grepped on the far side: the
# row count is part of the finding. A scan that failed to download is an empty file, and an empty
# file grepped remotely answers 0, which reads exactly like "not listed".
scan=$(mktemp); trap 'rm -f "$scan"' EXIT
timeout 60 ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=8 "$HOST" \
  "zcat /opt/control-plane/x402/roh/\$(date -u +%F).csv.gz 2>/dev/null" > "$scan" 2>/dev/null

rows=$(awk 'END {print NR}' "$scan")
if [[ "${rows:-0}" -lt 2 ]]; then
  echo "listing: today's scan could not be read on the VM ($rows line(s)), so this says nothing"
  exit 0
fi

found=$(hits_in "$scan")
if [[ "$found" -gt 0 ]]; then
  echo "LISTED  one of our hosts appears $found time(s) in today's x402 directory scan of $rows rows."
  echo "        That is new. The catalogue is where a stranger's automaton finds this service."
  /usr/bin/grep -E "$(printf '%s' "$CP_OWN_HOSTS" | tr ' ' '|' | sed 's/\./\\./g')" "$scan" | head -5 | sed 's/^/        /'
  exit 0
fi

# Not in the catalogue. Then the interesting number is whether the facilitator has recorded any
# settlement for us at all, because that separates "nobody paid" from "paid and not catalogued",
# and it is the whole reason the cause is an open question rather than a missing payment.
settlements=$(python3 - "$FACILITATOR" "$OWN_RESOURCE" <<'PY'
import json, sys, urllib.parse, urllib.request

facilitator, resource = sys.argv[1].rstrip("/"), sys.argv[2]
url = f"{facilitator}/discovery/resources/{urllib.parse.quote(resource, safe='')}/stats"
try:
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "control-plane-check/1.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        print(json.load(r).get("settlements", {}).get("total", "?"))
except Exception:
    print("?")
PY
)

echo "listing: not in the x402 directory. Searched $rows row(s) of today's scan for"
echo "         $(printf '%s' "$CP_OWN_HOSTS" | tr ' ' ',') and found none."
echo "         The facilitator has recorded ${settlements} settlement(s) for our own topup"
echo "         resource, so we pay through it and are still not in its catalogue. Why is NOT"
echo "         known: a wallet in the path and x402 version 1 were both measured out as causes"
echo "         on 2026-09-23. See the header before spending a cycle on a fix."
exit 0
