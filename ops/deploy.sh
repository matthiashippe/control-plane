#!/usr/bin/env bash
# The conditions in loop-constraints.md, enforced instead of remembered.
#
# "Before every deploy, without exception: pnpm test green, and on every change to the runtime
# path pnpm e2e green as well." That has been the rule since 19.09. and `deploy/rollout.sh` never
# checked it, because `deploy/**` is not touched without a human. So the rule lived entirely in
# whoever was typing, and on 2026-09-22 that failed: a cycle read "1 failed | 465 passed", took
# it for the output of a counter-proof it had just run, and rolled out anyway. The failing test
# was the one holding docs/bounties.md against the MCP server's own schema, and the deploy was
# harmless by luck rather than by check.
#
#   ops/deploy.sh                  tests, e2e, then deploy/rollout.sh
#   ops/deploy.sh --no-e2e "why"   skips the runtime harness, and makes you say why out loud
#
# Anything this script prints before the rollout is a reason not to deploy. It passes every
# argument after its own through to deploy/rollout.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

E2E=1
REASON=""
if [[ "${1:-}" == "--no-e2e" ]]; then
  E2E=0
  REASON="${2:-}"
  if [[ -z "$REASON" ]]; then
    echo "FAILED: --no-e2e needs a reason as the next argument." >&2
    echo "        The harness is the only thing that runs the unmodified upstream runtime against" >&2
    echo "        this build. Skipping it is a decision, and a decision has a reason." >&2
    exit 2
  fi
  shift 2
fi

echo "1/3  pnpm test"
if ! pnpm -s test > /tmp/cp-deploy-test.log 2>&1; then
  echo
  tail -25 /tmp/cp-deploy-test.log
  echo
  echo "NOT DEPLOYING: the test suite is red." >&2
  echo "               loop-constraints.md makes this unconditional, and the one time it was" >&2
  echo "               waved through the red test was holding the documentation against the" >&2
  echo "               server's own schema." >&2
  exit 1
fi
echo "     $(grep -E '^\s+Tests ' /tmp/cp-deploy-test.log | tail -1 | sed 's/^ *//')"

if [[ "$E2E" == "1" ]]; then
  echo "2/3  pnpm e2e"
  if ! pnpm -s e2e > /tmp/cp-deploy-e2e.log 2>&1; then
    echo
    tail -20 /tmp/cp-deploy-e2e.log
    echo
    # Name the cause that is in the log, not the one that is usually true.
    #
    # On 2026-09-23 at 11:20 and again at 11:26 UTC this refused twice with "the harness did not
    # come up green". The harness was fine. Two lines above sat `failed to do request: Head
    # "https://registry-1.docker.io/...": net/http: TLS handshake timeout`, and the e2e run cannot
    # start a container whose base image it cannot pull. Measured right afterwards: auth.docker.io
    # answered in 4.1 s with 200, registry-1.docker.io/v2/ ran into a 20 s timeout, and the image
    # was not in the local cache.
    #
    # The sentence sent the reader to look at the harness, where nothing was wrong, and it did it
    # on a day when the change waiting to go out was on the runtime path. A refusal that names the
    # wrong cause costs more than no refusal, because it is acted on.
    if grep -qE 'registry-1\.docker\.io|TLS handshake|failed to do request' /tmp/cp-deploy-e2e.log; then
      echo "NOT DEPLOYING: the e2e run could not fetch its base image from the Docker registry." >&2
      echo "               That is the network between this machine and registry-1.docker.io, and" >&2
      echo "               it says nothing about the change you are trying to deploy. Try" >&2
      echo "               'docker pull node:22-bookworm-slim' once and run this again; with the" >&2
      echo "               image in the local cache the e2e run does not touch the registry." >&2
    else
      echo "NOT DEPLOYING: the harness did not come up green." >&2
    fi
    exit 1
  fi
  echo "     $(grep -E '^E2E ' /tmp/cp-deploy-e2e.log | tail -1)"
else
  echo "2/3  e2e skipped: $REASON"
fi

echo "3/3  deploy/rollout.sh"
deploy/rollout.sh "$@"

echo
echo "Now read the window: ops/deploy-window.sh"
