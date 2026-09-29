#!/usr/bin/env bash
# Put the keyless handles our own probes minted onto both "ours" lists.
#
# `POST /v1/auth/keyless` mints by being called, and a GET answers 405, so there is no way to
# prove the door works without spending a handle. On 2026-09-29 that happened four times in one
# morning: a swarm subagent checking the endpoint, a walk of every path in /openapi.json, and
# twice while verifying the fix to that very door. Each one then read as a foreign wallet in
# `wallets_foreign`, which is one of the numbers the plan is measured by.
#
# Three of the four were caught within the hour and written into the lists by hand. The fourth is
# the reason this file exists: a manual step that recurs is a step that will be skipped, and the
# cost of skipping it is a number about the market quietly becoming a number about us. That is the
# error this repository has now made five times (see the comments in ops/db-report.cjs).
#
# Takes the newest keyless handles from the live database, shows what they did, and writes the
# ones you confirm into src/bounties/ours.ts and ops/db-report.cjs with today's date.
#
#   ops/claim-keyless.sh            show the unclaimed handles and what each one did
#   ops/claim-keyless.sh --write    write them into both lists
#
# **Which handle is ours is decided by the address that minted it, not by what it did.** The first
# version of this file used "it has no ledger and no submission" and would have claimed two
# handles that a crawler minted at 11:10:09 and 11:10:28 that day, because a crawler that mints
# and leaves also does nothing. That is the falsification this tool exists to prevent, in the tool
# itself. So every handle is matched against the `201 POST /v1/auth/keyless` in the access log at
# its creation second, and the caller's address decides; `ops/own-ips.txt` says which are ours.
#
# A handle whose mint is not in the log, or that came from an address that is not ours, is never
# offered. A handle that did something is not offered either, whoever minted it: it moved a
# number, and a number that moved deserves a sentence, not a list entry.
set -uo pipefail
cd "$(dirname "$0")/.."

VM="${CP_VM:-76.13.144.207}"
KEY="${CP_VM_KEY:-$HOME/.ssh/id_ed25519_automaton}"
WRITE=0
[[ "${1:-}" == "--write" ]] && WRITE=1

handles=$(ssh -o ConnectTimeout=10 -i "$KEY" "root@$VM" 'cd /opt/control-plane/repo/deploy && docker compose -f docker-compose.prod.yml exec -T cp node -e "
const db=require(\"better-sqlite3\")(\"/data/cp.db\");
for(const w of db.prepare(\"select address,created_at from wallets where address like ? order by created_at\").all(\"key:%\")){
  const led=db.prepare(\"select count(*) n from ledger where address=?\").get(w.address).n;
  const sub=db.prepare(\"select count(*) n from submissions where agent=?\").get(w.address).n;
  const bou=db.prepare(\"select count(*) n from bounties where creator=?\").get(w.address).n;
  console.log([w.address, w.created_at.slice(0,19), led, sub, bou].join(\" \"));
}
"' 2>/dev/null | tr -d '\r')

[[ -z "$handles" ]] && { echo "could not read the handles from $VM"; exit 2; }

# Who minted at which second, from the access log, so the decision rests on the caller and not on
# what the handle happened to do afterwards.
minters=$(./ops/access-log.sh 2>/dev/null | python3 -c '
import json, sys, datetime
for line in sys.stdin:
    line = line.strip()
    if not line.startswith("{"):
        continue
    try:
        d = json.loads(line)
    except Exception:
        continue
    r = d.get("request", {})
    if r.get("method") != "POST" or "/v1/auth/keyless" not in r.get("uri", ""):
        continue
    if d.get("status") != 201:
        continue
    t = datetime.datetime.fromtimestamp(d["ts"], datetime.UTC).isoformat()[:19]
    print(t, r.get("client_ip", "?"))
')
own_ips=$(cat ops/own-ips.txt 2>/dev/null | tr "\n" " ")

unclaimed=()
while read -r addr created led sub bou; do
  [[ -z "$addr" ]] && continue
  if grep -q "$addr" src/bounties/ours.ts 2>/dev/null; then
    printf '  claimed   %s  %s\n' "$addr" "$created"
    continue
  fi
  if [[ "$led" != "0" || "$sub" != "0" || "$bou" != "0" ]]; then
    printf '  DID SOMETHING %s  %s  ledger %s, submissions %s, bounties %s\n' "$addr" "$created" "$led" "$sub" "$bou"
    printf '            Never offered. It moved a number, and that deserves a sentence, not a list entry.\n'
    continue
  fi
  # The mint second, +/- one, because the wallet row and the log line are written by different
  # clocks and a handle minted at 11:10:09.998 can be logged at 11:10:10.
  ip=""
  for t in "$created" "$(python3 -c "
import datetime,sys
t=datetime.datetime.fromisoformat('$created')
print((t+datetime.timedelta(seconds=1)).isoformat())" 2>/dev/null)" \
           "$(python3 -c "
import datetime,sys
t=datetime.datetime.fromisoformat('$created')
print((t-datetime.timedelta(seconds=1)).isoformat())" 2>/dev/null)"; do
    hit=$(printf '%s' "$minters" | grep -F "$t " | head -1 | awk '{print $2}')
    [[ -n "$hit" ]] && { ip="$hit"; break; }
  done
  if [[ -z "$ip" ]]; then
    printf '  UNKNOWN   %s  %s  no mint in the access log at that second\n' "$addr" "$created"
    printf '            Never offered: without the caller there is no way to say whose it is.\n'
    continue
  fi
  if [[ " $own_ips " == *" $ip "* ]]; then
    printf '  OURS      %s  %s  minted from %s\n' "$addr" "$created" "$ip"
    unclaimed+=("$addr")
  else
    printf '  STRANGER  %s  %s  minted from %s\n' "$addr" "$created" "$ip"
    printf '            Never offered. This is somebody else at our door, which is the point.\n'
  fi
done <<< "$handles"

if (( ${#unclaimed[@]} == 0 )); then
  echo
  echo "nothing to claim"
  exit 0
fi

if (( WRITE == 0 )); then
  echo
  echo "${#unclaimed[@]} handle(s) would be written. Run with --write."
  exit 0
fi

today=$(date -u +%Y-%m-%d)
for addr in "${unclaimed[@]}"; do
  python3 - "$addr" "$today" <<'PY'
import pathlib, sys
addr, today = sys.argv[1], sys.argv[2]
note = (f'  // Minted {today} by one of our own probes against production and claimed by\n'
        f'  // ops/claim-keyless.sh: no ledger, no submission, no bounty. It had to be called to be\n'
        f'  // proved, because a GET on that door answers 405.\n'
        f'  "{addr}",\n')
for path in ["src/bounties/ours.ts", "ops/db-report.cjs"]:
    p = pathlib.Path(path); s = p.read_text()
    anchor = '  "ops-%",\n'
    assert s.count(anchor) == 1, f"{path}: anchor {s.count(anchor)}x"
    p.write_text(s.replace(anchor, anchor + note))
print(f"  written   {addr}")
PY
done
echo
echo "now run: pnpm test"
