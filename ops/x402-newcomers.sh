#!/usr/bin/env bash
# Who walked through the door into the x402 catalogues, and did we?
#
# On 2026-09-23 the header of ops/own-x402-listing.sh concluded, after seven measurements, that
# "the loop has no door it can walk through". Every one of those measurements asked the
# facilitators about their APIs. None asked the only question that decides it: **does anybody get
# in, and how many a day?**
#
# Asked on 2026-09-24 against the daily raw scans that had been piling up unread since 20.09.:
# 141 hosts entered the two catalogues between 21.09. and that morning, 93 at CDP and 48 at PayAI,
# about 47 a day. Ten of them speak x402 version 1 as we do, and two of them are ephemeral
# `trycloudflare.com` tunnels that nothing would ever crawl. The door is open and busy.
#
# That one number turned a closed goal back into an open one, and it cost a diff of two files that
# were already on disk. So it runs every cycle now.
#
#   ops/x402-newcomers.sh            since the previous scan
#   ops/x402-newcomers.sh 3          since three scans ago
#   ops/x402-newcomers.sh --selftest plant a newcomer and check it is seen
#
# Exit 0 always: this is a reading, not a check. It goes to 1 only when it cannot read the scans,
# because a silent zero here is what let the wrong conclusion stand for a day.
set -uo pipefail

KEY="${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}"
HOST="${CP_HOST:-root@76.13.144.207}"
BACK="${1:-1}"

if [[ "${1:-}" == "--selftest" ]]; then
  a=$(mktemp); b=$(mktemp)
  printf 'verzeichnis,host,x402_version,netzwerk\ncdp,alt.example,2,base\n' > "$a"
  printf 'verzeichnis,host,x402_version,netzwerk\ncdp,alt.example,2,base\ncdp,neu.example,1,base\npayai,postyourprice.com,1,base\n' > "$b"
  out=$(CP_X402_OLD="$a" CP_X402_NEW="$b" "$0" 2>&1)
  echo "$out"
  fails=0
  # Two are planted: a stranger and ourselves. The first version of this line said one, and the
  # selftest went red against a tool that was right, which is the same class of error as a tool
  # that goes green against one that is wrong.
  grep -q "2 new host" <<<"$out" || { echo "  FAIL the planted newcomers were not seen"; fails=1; }
  grep -q "speaking version 1, as we do: 2" <<<"$out" || { echo "  FAIL v1 newcomers not counted"; fails=1; }
  grep -qi "WE ARE IN" <<<"$out" || { echo "  FAIL our own host was not recognised"; fails=1; }
  rm -f "$a" "$b"
  [[ $fails -eq 0 ]] && echo "selftest passed" || echo "selftest FAILED"
  exit $fails
fi

old="${CP_X402_OLD:-}"; new="${CP_X402_NEW:-}"
if [[ -z "$old" || -z "$new" ]]; then
  files=$(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 "$HOST" \
    'ls -1 /opt/control-plane/x402/roh/*.csv.gz 2>/dev/null | sort' 2>/dev/null)
  count=$(grep -c . <<<"$files")
  if (( count < BACK + 1 )); then
    echo "x402-newcomers: only $count scan(s) on the VM, need $((BACK + 1)). Not a finding." >&2
    exit 1
  fi
  newf=$(tail -1 <<<"$files"); oldf=$(tail -$((BACK + 1)) <<<"$files" | head -1)
  old=$(mktemp); new=$(mktemp); trap 'rm -f "$old" "$new"' EXIT
  ssh -i "$KEY" -o BatchMode=yes "$HOST" "gzip -dc '$oldf'" > "$old" 2>/dev/null
  ssh -i "$KEY" -o BatchMode=yes "$HOST" "gzip -dc '$newf'" > "$new" 2>/dev/null
  echo "comparing $(basename "$oldf") with $(basename "$newf")"
fi

python3 - "$old" "$new" <<'PY'
import csv, sys, collections
def hosts(p):
    out = {}
    with open(p, newline="") as fh:
        for r in csv.DictReader(fh):
            out.setdefault((r.get("verzeichnis"), r.get("host")), r)
    return out
old, new = hosts(sys.argv[1]), hosts(sys.argv[2])
fresh = [new[k] for k in new if k not in old]
gone = [k for k in old if k not in new]
print()
print(f"  {len(fresh)} new host(s), {len(gone)} gone, {len(new)} listed now")
if fresh:
    by_dir = collections.Counter(r.get("verzeichnis") for r in fresh)
    by_ver = collections.Counter(f"v{r.get('x402_version')}" for r in fresh)
    print(f"      by directory: {dict(by_dir)}   by version: {dict(by_ver)}")
    # Version 1 is what this service speaks. If v1 newcomers keep appearing, version is not the
    # reason we are absent, and that is the fact that reopened this goal on 2026-09-24.
    v1 = [r for r in fresh if r.get("x402_version") == "1"]
    print(f"      speaking version 1, as we do: {len(v1)}")
    for r in v1[:6]:
        print(f"        {r.get('verzeichnis'):6} {r.get('host')[:52]}")
ours = [k for k in new if k[1] in ("postyourprice.com", "cp.hippe.eu")]
print()
if ours:
    print(f"  WE ARE IN: {', '.join(d + '/' + h for d, h in ours)}")
else:
    print("  not us: neither postyourprice.com nor cp.hippe.eu is in either catalogue.")
    print("  Since 2026-09-24 the offer carries the shape the specification asks for")
    print("  (bazaar.discoverable, inputSchema, outputSchema, routeTemplate). Cataloguing happens")
    print("  on a settled payment, and the operator wallet holds no USDC, so none can be triggered.")
PY
