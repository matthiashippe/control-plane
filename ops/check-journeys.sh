#!/usr/bin/env bash
# Does the journey book still match the service?
#
# docs/journeys.md is the reference everything else is checked against, and that is exactly why it
# is the file that goes stale most quietly: an endpoint is renamed, the document keeps saying the
# old thing, and nobody notices, because documents have no tests.
#
# This script takes every /v1 and /bounties.json path the document names and asks the running
# instance for it. Anything but a 404 is expected: 401 means protected and present, 200 means public
# and present, 404 means the document describes something that does not exist. The answer itself
# does not matter, existence is the point.
#
#   ops/check-journeys.sh                 against https://cp.hippe.eu
#   CP_URL=http://localhost:8402 ops/check-journeys.sh
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="${CP_URL:-https://postyourprice.com}"
DOC="docs/journeys.md"
failures=0

# Pull the paths out of the document: everything that starts with / after a backtick and looks like
# a path. Query parts and placeholders drop out, we do not check those.
# sed -E, not sed: BSD sed does not know \| in BRE, and then GET and POST stay behind as paths of
# their own and are reported OK with status code 000. A checking tool that reports nonsense as green
# is worse than none; that is exactly what happened on the first run on 20.09.2026.
all_paths=$(grep -oE '`(GET |POST |DELETE )?/[a-zA-Z0-9/._-]+' "$DOC" \
  | sed -E 's/^`//; s/^(GET|POST|DELETE) //' \
  | grep -E '^/' \
  | grep -vE '^/v1/chat/completions$' \
  | sort -u)

# A document about how somebody gets in also names files on the machine, and on 2026-09-23 it
# gained `/var/log/caddy/access.log` in the paragraph explaining what the address-bar route costs.
# Everything in backticks starting with a slash was a route to this checker, so it asked the
# service for the Caddy log, got a 404 and reported that the document or the service was lying.
# Neither was.
#
# These six are the absolute roots of a Unix filesystem. None of them can be a route here: every
# route this service serves is /, /v1/..., a page name or a .json or .txt file at the top level,
# and adding /var or /etc as a route is not a thing that will happen. The list is deliberately
# short and the skipped lines are PRINTED, because a filter that quietly drops paths is how a
# checking tool stops checking without anybody noticing.
FILESYSTEM_ROOTS='^/(var|etc|opt|usr|tmp|root|home)/'
skipped=$(printf '%s\n' "$all_paths" | grep -E "$FILESYSTEM_ROOTS" || true)
paths=$(printf '%s\n' "$all_paths" | grep -vE "$FILESYSTEM_ROOTS" || true)

[[ -n "$paths" ]] || { echo "ERROR: not a single path read from $DOC"; exit 2; }

echo "Journey book against $BASE"
echo
if [[ -n "$skipped" ]]; then
  while read -r f; do
    [[ -n "$f" ]] && printf "    %-7s %-34s %s\n" "skipped" "$f" "a file on the machine, not a route"
  done <<< "$skipped"
fi

for p in $paths; do
  code=$(curl -s -o /dev/null -m 15 -w "%{http_code}" "$BASE$p")
  if [[ "$code" == "404" ]]; then
    printf 'ERROR   %-34s 404: the document names a path that does not exist\n' "$p"
    failures=$((failures + 1))
  else
    printf 'OK      %-34s %s\n' "$p" "$code"
  fi
done

# Inference separately, because GET gives a 405 on it and that says nothing about existence.
code=$(curl -s -o /dev/null -m 15 -w "%{http_code}" -X POST -H 'content-type: application/json' -d '{}' "$BASE/v1/chat/completions")
if [[ "$code" == "404" ]]; then
  printf 'ERROR   %-34s 404\n' "/v1/chat/completions"; failures=$((failures + 1))
else
  printf 'OK      %-34s %s\n' "/v1/chat/completions" "$code"
fi

echo
if (( failures == 0 )); then
  echo "JOURNEYS OK: every path named exists."
  exit 0
fi
echo "JOURNEYS FAIL: $failures path(s) from $DOC do not exist. Either the document or the service is lying."
exit 1
