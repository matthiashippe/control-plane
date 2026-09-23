#!/usr/bin/env bash
# Does every scheduled job still point at a file that exists?
#
#   ops/cron-points-somewhere.sh
#   ops/cron-points-somewhere.sh --selftest
#
# Why this exists. The language pass on 2026-09-22 renamed ops/x402-zeitreihe.sh and
# ops/conway-zeitreihe.sh. The crontab on the VM still named the old files, so from the next
# morning both jobs ran, found nothing, and wrote "/bin/sh: 1: ...: not found" into a log nobody
# reads. Two daily measurements stopped and the only sign was a freshness check going red 26 hours
# later, which is one hour of warning for a job that runs once a day.
#
# A cron entry is the one place a rename cannot be followed by the compiler, the tests or grep
# across the repository, because the reference lives on another machine.
set -uo pipefail
HOST="${CP_DEPLOY_HOST:-root@76.13.144.207}"
KEY="${CP_DEPLOY_KEY:-$HOME/.ssh/id_ed25519_automaton}"

if [ "${1:-}" = "--selftest" ]; then
  # A crontab naming one file that is there and one that is not. A check that cannot tell those
  # apart is a check that would have passed on 2026-09-23 while two jobs were dead.
  work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
  mkdir -p "$work/ops"; : > "$work/ops/exists.sh"
  cat > "$work/crontab" <<CRON
40 4 * * * $work/ops/exists.sh >> /var/log/a.log 2>&1
50 4 * * * $work/ops/gone.sh >> /var/log/b.log 2>&1
# 0 5 * * * $work/ops/commented-out.sh
CRON
  out="$(CP_CRONTAB_FILE="$work/crontab" "$0" 2>&1)"; code=$?
  echo "$out"
  echo
  if [ "$code" -ne 0 ] && printf '%s' "$out" | grep -q "gone.sh" && ! printf '%s' "$out" | grep -q "commented-out"; then
    echo "SELFTEST OK  the missing file is named, the present one is not, and a commented line is"
    echo "             not a job."
    exit 0
  fi
  echo "SELFTEST FAILED  exit $code; it cannot tell a live path from a dead one."
  exit 1
fi

if [ -n "${CP_CRONTAB_FILE:-}" ]; then
  cat "$CP_CRONTAB_FILE"
else
  ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 "$HOST" 'crontab -l 2>/dev/null'
fi > /tmp/cron-check.$$
trap 'rm -f /tmp/cron-check.$$' EXIT

# Collect every path first, then ask once.
#
# The first version ran `ssh test -f` inside the `while read` loop, and ssh reads standard input:
# it swallowed the rest of the crontab after the first line. Five jobs, one checked, and the
# report said "all 1 scheduled job(s) point at a file that exists", which is true and useless.
paths=$(sed -E 's/^[[:space:]]*#.*$//' /tmp/cron-check.$$ \
  | sed -E 's#[a-z][a-z0-9+.-]*://[^[:space:]]*##g' \
  | grep -oE '(/[a-zA-Z0-9._-]+)+\.(sh|ts|py|cjs)' | sort -u)

found=$(printf '%s' "$paths" | grep -c . || true)
missing=0
if [ "$found" -gt 0 ]; then
  if [ -n "${CP_CRONTAB_FILE:-}" ]; then
    verdicts=$(printf '%s\n' $paths | while IFS= read -r p; do
      [ -f "$p" ] && echo "ok $p" || echo "MISSING $p"
    done)
  else
    # One ssh for all of them, with the list on the command line rather than on stdin.
    verdicts=$(ssh -n -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 "$HOST" \
      "for p in $paths; do [ -f \"\$p\" ] && echo \"ok \$p\" || echo \"MISSING \$p\"; done" 2>/dev/null)
  fi
  printf '%s\n' "$verdicts" | while IFS=' ' read -r verdict path; do
    [ -n "$path" ] && printf '  %-7s %s\n' "$verdict" "$path"
  done
  missing=$(printf '%s' "$verdicts" | grep -c '^MISSING' || true)
fi

echo
if [ "$found" -eq 0 ]; then
  echo "COULD NOT TELL: no scheduled job named a script path at all, which is not what this"
  echo "                crontab looked like when it was written."
  exit 2
fi
if [ "$missing" -gt 0 ]; then
  echo "CRON BROKEN: $missing of $found scheduled job(s) name a file that is not there."
  echo "             They run, fail in a log nobody reads, and the first sign is a freshness"
  echo "             check going red a day later."
  exit 1
fi
echo "CRON OK: all $found scheduled job(s) point at a file that exists."
