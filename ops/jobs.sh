#!/usr/bin/env bash
# What the code-host is working on, without hanging when it cannot be reached.
#
# The dispatcher runs behind Tailscale SSH, and that connection sometimes demands a fresh
# browser login. When it does, plain ssh prints a URL and then waits, silently, for a human who is
# not there. On 2026-09-21 that cost two observation cycles: the whole chain ran into its timeout
# and the first reading both times was that the observation was broken, when in fact the service
# was healthy and only the job host wanted a login.
#
# So: BatchMode, a short timeout, and an answer that names the cause and what to do about it.
# Never let a tool that watches for trouble become the trouble.
#
#   ops/jobs.sh            open jobs for this repo
#   ops/jobs.sh --all      every job on the host
set -uo pipefail

HOST="${CODE_HOST:-code-host}"
REPO="${CP_JOB_REPO:-control-plane}"
ARGS=("job" "list")
[[ "${1:-}" == "--all" ]] && ARGS+=("--all")

out=$(timeout 20 ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new \
      "$HOST" "${ARGS[@]}" 2>&1)
code=$?

if printf '%s' "$out" | grep -q "login.tailscale.com"; then
  url=$(printf '%s' "$out" | grep -o 'https://login.tailscale.com/a/[a-z0-9]*' | head -1)
  echo "BLOCKED: the code-host wants a fresh Tailscale login. Nothing is wrong with the service."
  echo "         A human has to open this once, in a browser:"
  echo "         ${url:-https://login.tailscale.com/}"
  echo "         Until then no ticket can be started, collected or closed."
  exit 3
fi

if (( code != 0 )); then
  echo "BLOCKED: the code-host did not answer in 20 seconds (exit $code)."
  echo "         This says nothing about cp.hippe.eu. Check that separately:"
  echo "         curl -s -o /dev/null -m 10 -w '%{http_code}\n' https://cp.hippe.eu/health"
  exit 3
fi

mine=$(printf '%s\n' "$out" | grep -c "$REPO" || true)
printf '%s\n' "$out" | head -1
printf '%s\n' "$out" | grep "$REPO" || echo "  (no job for $REPO)"
echo
echo "$mine job(s) for $REPO."
