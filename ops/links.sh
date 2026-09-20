#!/usr/bin/env bash
# Do all the links on the landing page still lead somewhere?
#
# Not in the smoke test but here: the smoke test runs on every deploy and must not depend on GitHub
# or Basescan. This check belongs before moments when strangers read the page, so before an article
# or a post that spreads the address.
#
#   ops/links.sh                against production
#   ops/links.sh http://localhost:8402
set -euo pipefail

BASE="${1:-https://cp.hippe.eu}"
broken=0

echo "Links on $BASE/"
page=$(curl -fsS --max-time 20 "$BASE/")

# External targets, once each, following redirects.
while read -r url; do
  [[ -z "$url" ]] && continue
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 25 -L "$url" || echo "000")
  if [[ "$code" == "200" ]]; then
    printf '  OK   %s\n' "$url"
  else
    printf '  FAIL %s  -> %s\n' "$url" "$code"
    broken=$((broken + 1))
  fi
done < <(printf '%s' "$page" | grep -oE 'href="https?://[^"]+"' | sed 's/href="//; s/"$//' | sort -u)

# Anchors inside the page: an href="#impressum" without id="impressum" would go unnoticed otherwise.
while read -r anchor; do
  [[ -z "$anchor" ]] && continue
  if printf '%s' "$page" | grep -q "id=\"$anchor\""; then
    printf '  OK   #%s\n' "$anchor"
  else
    printf '  FAIL #%s  -> no element with that id\n' "$anchor"
    broken=$((broken + 1))
  fi
done < <(printf '%s' "$page" | grep -oE 'href="#[^"]+"' | sed 's/href="#//; s/"$//' | sort -u)

if [[ "$broken" -gt 0 ]]; then
  echo "$broken link(s) broken."
  exit 1
fi
echo "All links fine."
