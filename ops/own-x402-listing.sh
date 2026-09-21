#!/usr/bin/env bash
# Are we in the directory our own audience searches in?
#
# An agent does not browse. It reads a facilitator's catalogue, and that catalogue is the only
# place a stranger's automaton finds this service without a human recommending it. We scan both
# public ones every morning for the article: 20,789 paid services on 2026-09-21, and not one row
# of them ours.
#
# That is not a missing registration. There is no registration: a facilitator catalogues a seller
# as a side effect of a payment, keyed on the `resource` the seller declares. Ours is built by
# `payResource` in src/payments/pay.ts as `/pay/{usd}/{recipient}` with the recipient substituted,
# so every payment hands the catalogue a different URL with a stranger's wallet inside it. PayAI
# has recorded settlements for `https://cp.hippe.eu/pay/5/0xd24f37d0…` and none of the 20,789
# catalogued resources anywhere has a wallet address in its path.
#
# Changing that lives in src/payments/**, which loop-constraints.md keeps locked without a human.
# What this script does is the other half: make the answer visible every cycle, so the day it flips
# is a day somebody notices rather than a day nobody looked.
#
#   ops/own-x402-listing.sh
#
# Exit 0 either way. Absence is today's expected state and not a failure of the service; the line
# it prints is the finding.
set -uo pipefail

HOST="${CP_HOST:-root@76.13.144.207}"
KEY="${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}"
UNSER="${CP_OWN_HOST:-cp.hippe.eu}"
FACILITATOR="${CP_FACILITATOR_URL:-https://facilitator.payai.network}"

# The scan of the day, as the cron left it. Reading the raw file rather than re-scanning: a second
# scan would cost two minutes and could disagree with the series for no reason.
treffer=$(timeout 30 ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=8 "$HOST" \
  "zcat /opt/control-plane/x402/roh/\$(date -u +%F).csv.gz 2>/dev/null | grep -c '$UNSER' || true" 2>/dev/null)
treffer="${treffer:-}"

if [[ -z "$treffer" ]]; then
  echo "listing: today's scan could not be read on the VM, so this says nothing"
  exit 0
fi

if [[ "$treffer" -gt 0 ]]; then
  echo "LISTED  $UNSER appears $treffer time(s) in today's x402 directory scan."
  echo "        That is new. The catalogue is where a stranger's automaton finds this service."
  exit 0
fi

# Not in the catalogue. Then the interesting number is whether the facilitator has recorded any
# settlement for us at all, because that separates "nobody paid" from "paid and not catalogued".
abwicklungen=$(python3 - "$FACILITATOR" <<'PY'
import json, sys, urllib.parse, urllib.request

facilitator = sys.argv[1].rstrip("/")
# The operator wallet's own topup resource: the one payment path we know settled through PayAI.
resource = "https://cp.hippe.eu/pay/5/0xd24f37d0838e62621ed24111164485ded0f0924f"
url = f"{facilitator}/discovery/resources/{urllib.parse.quote(resource, safe='')}/stats"
try:
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "control-plane-check/1.0 (+https://cp.hippe.eu)"})
    with urllib.request.urlopen(req, timeout=20) as r:
        print(json.load(r).get("settlements", {}).get("total", "?"))
except Exception:
    print("?")
PY
)

echo "listing: not in the x402 directory. The facilitator has recorded ${abwicklungen} settlement(s)"
echo "         for our own topup resource, so we pay through it and are still not in its catalogue."
echo "         Cause and fix are in the header of this script; the fix is in a locked path."
exit 0
