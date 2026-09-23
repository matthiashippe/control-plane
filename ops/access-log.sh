#!/usr/bin/env bash
# The whole access log, oldest line first, including everything Caddy has rotated away.
#
# Found on 2026-09-23 at 20:00 UTC, and it had already produced a false reading. Caddy rotated
# `access.log` by SIZE at 17:28 that day, leaving `access-2026-09-23T17-28-44.857-size.log.gz`
# next to it and a fresh file with 273 lines. Every traffic script read only `access.log`, so one
# cycle reported "3 address(es) came from a github.com page, 3 of which ran the page script" and
# the next, forty minutes later, reported "Nobody has ever arrived here from a github.com page."
# Nothing had changed outside. The history had simply moved one file to the left.
#
# That is the failure this repository keeps guarding against, in its most expensive form: not a
# number that is wrong, but a tool that cannot tell "nothing happened" from "I am blind", said
# with the word "ever" in it. Every decision here is made off these scripts.
#
# `roll_size` and `roll_keep_for` live in deploy/Caddyfile, which is not touched without a human,
# and they are not the problem anyway. Rotation is correct behaviour; reading one file of several
# was the mistake.
#
#   ops/access-log.sh            everything, oldest first, on stdout
#   ops/access-log.sh --stats    the files it reads, on stderr, nothing on stdout
#   ops/access-log.sh --span     how many hours of history the tools can see, one line
#
# Exit 2 means the log could not be read, which is not a finding about traffic.
set -uo pipefail

KEY="${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}"
HOST="${CP_HOST:-root@76.13.144.207}"

# One ssh call, not one per file: the rotated files are named by timestamp, `sort` puts them in
# order, and the decompression happens inside the container so only compressed bytes cross the
# wire. The current file goes last because it is the newest.
#
# The log lives INSIDE the caddy container, not on the host, which the first version of this got
# wrong and which failed loudly rather than quietly: an empty stream is treated as unreadable
# below, not as a quiet day.
#
# `gzip -dc` and not `zcat`: the caddy image is alpine and does not ship zcat.
INNER='cd /var/log/caddy 2>/dev/null || exit 3;
       for f in $(ls -1 access-*.log.gz 2>/dev/null | sort); do gzip -dc "$f" 2>/dev/null; done;
       cat access.log 2>/dev/null'

if [[ "${1:-}" == "--stats" ]]; then
  ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 "$HOST" \
    "docker exec deploy-caddy-1 ls -la /var/log/caddy/" >&2 || exit 2
  exit 0
fi

# How far back the tools can actually see, in hours.
#
# The point of a number here is that the blindness above was silent. A rotation moves history out
# of view without any script noticing, so the span is measured and checked (ops/check-all.sh)
# rather than assumed: on a service that has been running since 19 September, a log that reaches
# back forty minutes is a tool that has gone blind, not a quiet day.
if [[ "${1:-}" == "--span" ]]; then
  "$0" | python3 -c '
import json, sys, datetime
first = last = None
lines = 0
for raw in sys.stdin:
    raw = raw.strip()
    if not raw.startswith("{"):
        continue
    try:
        ts = json.loads(raw)["ts"]
    except Exception:
        continue
    lines += 1
    first = ts if first is None or ts < first else first
    last = ts if last is None or ts > last else last
if first is None:
    print("access log: no parsable lines at all")
    raise SystemExit(2)
span = (last - first) / 3600
a = datetime.datetime.fromtimestamp(first, datetime.timezone.utc)
b = datetime.datetime.fromtimestamp(last, datetime.timezone.utc)
print(f"access log: {lines} line(s), {span:.1f} h, {a:%m-%d %H:%M} to {b:%m-%d %H:%M} UTC")
raise SystemExit(0 if span >= 24 else 3)
'
  exit $?
fi

out=$(mktemp); trap 'rm -f "$out"' EXIT
if ! timeout 120 ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=5 \
  "$HOST" "docker exec deploy-caddy-1 sh -c '$INNER' | gzip -c" 2>/dev/null | gunzip > "$out"; then
  echo "access-log: could not read the log. This says nothing about traffic." >&2
  exit 2
fi
if [[ ! -s "$out" ]]; then
  echo "access-log: the log is empty, which on a running service means it could not be read." >&2
  exit 2
fi
cat "$out"
