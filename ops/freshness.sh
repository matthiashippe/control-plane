#!/usr/bin/env bash
# Is everything that is supposed to run daily still running?
#
# Four things on the VM run on a schedule and each one writes its result somewhere. Three of them
# are series that only mean anything if they keep growing, and the fourth is the backup. All four
# share a failure mode that nothing catches: they stop.
#
# A failing run is loud, because every script alerts over CP_ALERT_WEBHOOK and writes a .err file.
# A run that never starts is silent. A cron entry deleted by an edit, a crontab lost with a rebuilt
# machine, a script renamed by a deploy: the series simply stops, `ops/check-all.sh` keeps printing
# the same last point every cycle, and it stays green while doing it. The page built on that series
# keeps showing a number that is quietly weeks old.
#
# So the age of each artefact is checked, not its content. Exit 1 names what has gone stale and by
# how much.
#
#   ops/freshness.sh
set -uo pipefail

HOST="${CP_HOST:-root@76.13.144.207}"
KEY="${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}"
# 26 hours: a daily job gets its window plus two hours of grace, so a run that is merely late does
# not wake anybody, and a run that was skipped entirely does.
MAX_HOURS="${CP_MAX_AGE_HOURS:-26}"

raw=$(timeout 25 ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=8 "$HOST" '
  for pair in "x402:/opt/control-plane/x402/kennzahlen.ndjson:stichtag" \
              "conway-repo:/opt/control-plane/conway/repo.ndjson:stichtag" \
              "conway-money:/opt/control-plane/conway-money/metrics.ndjson:measured_at"; do
    name="${pair%%:*}"; rest="${pair#*:}"; file="${rest%%:*}"; field="${rest##*:}"
    echo "$name $(tail -1 "$file" 2>/dev/null | python3 -c "
import json,sys
try: print(json.load(sys.stdin)[\"$field\"])
except Exception: print(\"none\")
" 2>/dev/null || echo none)"
  done
  echo "backup $(ls -t /opt/control-plane/backups/*.db 2>/dev/null | head -1 | xargs -r stat -c %y | cut -d. -f1 | tr " " "T" || echo none)Z"
' 2>/dev/null)

if [[ -z "$raw" ]]; then
  echo "FRESHNESS UNKNOWN: the VM did not answer. That says nothing about the service." >&2
  exit 2
fi

# The readings go in as an argument, not through a pipe. A heredoc already owns stdin here, and
# piping as well makes the script read its own source: the first attempt did exactly that, found no
# parsable line in it, and printed FRESHNESS OK while measuring nothing. A check that passes
# because it looked at the wrong thing is worse than no check.
python3 - "$MAX_HOURS" "$raw" <<'PY'
import datetime, sys

limit = float(sys.argv[1])
now = datetime.datetime.now(datetime.timezone.utc)
stale = []

for line in sys.argv[2].splitlines():
    parts = line.split()
    if len(parts) != 2:
        continue
    name, stamp = parts
    if stamp in ("none", "noneZ"):
        print(f"MISSING {name}: nothing written at all")
        stale.append(f"{name} (missing)")
        continue
    try:
        # The backup's timestamp comes from the file system in local time on the VM, which is UTC
        # there. Both shapes end in Z and parse the same way.
        when = datetime.datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)
    except ValueError:
        print(f"UNREADABLE {name}: {stamp!r}")
        stale.append(f"{name} (unreadable)")
        continue
    hours = (now - when).total_seconds() / 3600
    if hours > limit:
        print(f"STALE   {name}: {hours:.1f} h old, limit is {limit:.0f}")
        stale.append(f"{name} ({hours:.1f} h)")
    else:
        print(f"ok      {name}: {hours:.1f} h old")

if stale:
    print(f"\nFRESHNESS FAILED: {', '.join(stale)}")
    print("A daily job that stops is silent. Check the crontab on the VM and the matching log in /var/log.")
    sys.exit(1)
print("\nFRESHNESS OK")
PY
