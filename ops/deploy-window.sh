#!/usr/bin/env bash
# Did the last deploy cost a stranger an answer?
#
# `loop-constraints.md` requires this after every rollout: look in the Caddy log and see whether
# the customer got an error in that window. Until now the window was typed by hand, and on
# 2026-09-21 a cycle typed 20:25 for a deploy that happened at 18:25 UTC. The VM runs on UTC and
# the operator reads local time, two hours apart. The check looked at a window that had not
# happened yet, found nothing, and the cycle wrote down "nobody noticed". That was true by luck.
#
# So the window is no longer typed. It comes from when the container actually started, which is
# the deploy, to the second.
#
#   ops/deploy-window.sh          the last deploy
#   ops/deploy-window.sh 300      the same, with a 300 second tail instead of 180
#
# Exit 0 means nobody outside saw an error. Exit 1 means somebody did, and the lines are printed.
# Exit 2 means the check could not run.
#
# The one thing it will not do is say "all good" when it measured nothing. An empty window is the
# normal case on a service this small, and reading it as proof that the deploy was clean is the
# same mistake one layer down.
set -euo pipefail

TAIL_SECONDS="${1:-180}"
LEAD_SECONDS=60
KEY="${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}"
HOST="${CP_HOST:-root@76.13.144.207}"
OWN="${CP_OWN_IPS:-82.194.125.90 76.13.144.207 35.242.237.124}"
SSH=(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10)

# Plus the address this machine goes out through right now, asked of the VM rather than assumed.
# The constant above went stale on 2026-09-22 when the line reconnected, and in this script that
# would have counted our own post-deploy checks as strangers inside the window: the one number the
# script exists to produce, wrong in the direction that looks like traffic.
lebend=$(timeout 15 "${SSH[@]}" "$HOST" 'echo "$SSH_CLIENT"' 2>/dev/null | awk '{print $1}' || true)
[[ -n "$lebend" ]] && OWN="$OWN $lebend"

started=$("${SSH[@]}" "$HOST" 'docker inspect deploy-cp-1 --format "{{.State.StartedAt}}"' 2>/dev/null || true)
if [[ -z "$started" ]]; then
  echo "COULD NOT TELL: the container start time was not readable." >&2
  echo "        Without it the window would be a guess, and a guessed window measures nothing." >&2
  echo "        This says nothing about the deploy. Run it again." >&2
  exit 2
fi

log=$(mktemp); trap 'rm -f "$log"' EXIT
# gzip on the far side, because the access log is 20 MB and growing.
#
# Measured on 2026-09-22: `cat` over ssh took 40 seconds for 20,726,086 bytes and the same file
# through `gzip -c` took 4.5. The 45 second timeout below started firing intermittently on this
# very run, and the failure looks exactly like an outage on a tool whose whole job is to tell an
# outage from a quiet minute. JSON logs compress about tenfold, so this buys back the margin
# without changing a byte of what is read.
#
# The real answer is log rotation, and that lives in deploy/, which is not touched without a human.
if ! timeout 45 "${SSH[@]}" -o ServerAliveInterval=5 "$HOST" \
  'docker exec deploy-caddy-1 cat /var/log/caddy/access.log | gzip -c' 2>/dev/null | gunzip > "$log"; then
  echo "COULD NOT TELL: the access log was not readable in 45 seconds." >&2
  echo "        A hiccup on the ssh connection, not a finding about the deploy. Run it again." >&2
  exit 2
fi

python3 - "$started" "$LEAD_SECONDS" "$TAIL_SECONDS" "$OWN" "$log" <<'PY'
import datetime, json, sys

started_iso, lead, tail, own_raw, path = sys.argv[1:6]
# Docker prints nanoseconds; fromisoformat takes at most microseconds.
head, _, _rest = started_iso.partition(".")
started = datetime.datetime.fromisoformat(head).replace(tzinfo=datetime.timezone.utc)
since = started - datetime.timedelta(seconds=int(lead))
until = started + datetime.timedelta(seconds=int(tail))
own = set(own_raw.split())

strangers = failures = ours = 0
lines = []
newest = None
for raw in open(path):
    raw = raw.strip()
    if not raw.startswith("{"):
        continue
    try:
        row = json.loads(raw)
    except ValueError:
        continue
    at = datetime.datetime.fromtimestamp(row["ts"], datetime.timezone.utc)
    newest = at if newest is None or at > newest else newest
    if not (since <= at <= until):
        continue
    req = row.get("request", {})
    if req.get("remote_ip") in own:
        ours += 1
        continue
    strangers += 1
    if row.get("status", 200) >= 400:
        failures += 1
        lines.append(f"   {at:%H:%M:%S}  {req.get('remote_ip')}  {req.get('method')} {req.get('uri')}  {row['status']}")

print(f"deploy   {started:%Y-%m-%d %H:%M:%S} UTC, taken from the container start")
print(f"window   {since:%H:%M:%S} to {until:%H:%M:%S} UTC, {lead} s before and {tail} s after")
print(f"ours     {ours} request(s), the smoke test and the checks")

# The log ends before the window does when this runs right after the rollout. Saying "nobody was
# affected" then is a statement about a window that is still filling.
if newest is not None and newest < until:
    missing = int((until - newest).total_seconds())
    print(f"PARTIAL  the log ends {missing} s before the window does ({newest:%H:%M:%S} UTC).")
    print(f"         Run it again after {until:%H:%M:%S} UTC. Until then this is an interim")
    print("         result and not an answer. The log itself is not behind: a request shows up")
    print("         in it within a second, measured on 2026-09-21.")

if strangers == 0:
    print("MEASURED NOTHING  no request from outside in the window.")
    print("                  That is not evidence the deploy was clean. It is evidence nobody was")
    print("                  there, which on a service this size is the normal case.")
    sys.exit(0)

if failures:
    print(f"AFFECTED  {failures} of {strangers} request(s) from outside got an error:")
    print("\n".join(lines))
    sys.exit(1)

print(f"CLEAN    {strangers} request(s) from outside in the window, all answered.")
PY
