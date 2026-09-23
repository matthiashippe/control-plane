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
source "$(dirname "$0")/own-ips.sh"
OWN=$(eigene_ips)
SSH=(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10)

# `eigene_ips` asks the VM which address this machine goes out through right now and keeps every
# one it has ever seen. A constant alone went stale on 2026-09-22 when the line reconnected, and
# here that counts our own post-deploy checks as strangers inside the window: the one number this
# script exists to produce, wrong in the direction that looks like traffic.

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
# outage from a quiet minute.
#
# Re-measured on 2026-09-23 at 30,657,499 bytes: 1.1 seconds end to end, and gzip turns the file
# into 1.3 MB on the wire. So the compression buys more than tenfold and the timeout is nowhere
# near. The margin is worth knowing because the log grows about 10 MB a day and nothing rotates it;
# at this rate the 45 seconds hold for a long time, and the number to watch is the transfer, not
# the file.
#
# The real answer is log rotation, and that lives in deploy/, which is not touched without a human.
if ! timeout 45 "${SSH[@]}" -o ServerAliveInterval=5 "$HOST" \
  'docker exec deploy-caddy-1 cat /var/log/caddy/access.log | gzip -c' 2>/dev/null | gunzip > "$log"; then
  echo "COULD NOT TELL: the access log was not readable in 45 seconds." >&2
  echo "        A hiccup on the ssh connection, not a finding about the deploy. Run it again." >&2
  exit 2
fi

python3 - "$started" "$LEAD_SECONDS" "$TAIL_SECONDS" "$OWN" "$log" <<'PY'
import datetime, json, os, sys

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

# A window that has not finished yet is an interim result, and saying "nobody was affected" about
# it is a statement about time that has not passed.
#
# What decides that is the clock, not the last line in the log. The first version asked whether the
# newest log entry was older than the end of the window, and on a service where nobody comes that
# is true forever: at 18:48 UTC on 2026-09-22, three minutes after a window that ended at 18:47:55,
# it still printed PARTIAL and told the reader to run it again later. There was nothing to wait
# for. The last request had been at 18:46:24 because that was the last request, not because the
# log was behind, and the script says so itself two lines further down.
#
# So the test is now `now < until`, and the newest entry is only reported as context. Set
# CP_WINDOW_NOW to an ISO timestamp to move the clock and check both directions.
now_raw = os.environ.get("CP_WINDOW_NOW", "")
now = (
    datetime.datetime.fromisoformat(now_raw).replace(tzinfo=datetime.timezone.utc)
    if now_raw
    else datetime.datetime.now(datetime.timezone.utc)
)
if now < until:
    missing = int((until - now).total_seconds())
    print(f"PARTIAL  the window has {missing} s left to run, it ends at {until:%H:%M:%S} UTC.")
    if newest is not None:
        print(f"         The log currently reaches to {newest:%H:%M:%S} UTC.")
    print("         This is an interim result and not an answer. The log itself is not behind:")
    print("         a request shows up in it within a second, measured on 2026-09-21.")
elif newest is not None and newest < until:
    quiet = int((until - newest).total_seconds())
    print(f"COMPLETE the window is over. Nothing was logged in its last {quiet} s, which on this")
    print(f"         service means nobody came, not that the log lags behind ({newest:%H:%M:%S} UTC).")

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
