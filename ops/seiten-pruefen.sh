#!/usr/bin/env bash
# Do the pages say anything obviously wrong?
#
# `ops/smoke.sh` proves the API and the security headers. Nothing looked at what the pages
# actually say, and twice in a row something visibly wrong went live: "1 jobs paid out" on
# 2026-09-21, and one line next to it "to the agents that won them". Both were caught by reading
# the live page with my eyes, which is not a process.
#
# This is not a design review and cannot be one. It catches the class of mistake that is cheap to
# catch and embarrassing to ship: a placeholder that never got replaced, a template that leaked as
# text, a number rendered as `undefined`, a plural that does not agree with the one in front of it.
#
#   ops/seiten-pruefen.sh [base]
set -uo pipefail
BASE="${1:-${CP_URL:-https://cp.hippe.eu}}"
fehler=0
ok()   { echo "ok      $1"; }
bad()  { fehler=$((fehler+1)); echo "FAILED  $1"; [[ -n "${2:-}" ]] && echo "        $2"; }

for pfad in / /post /terms /jobs /receipts /x402 /conway; do
  antwort=$(curl -s -m 15 -w '\n%{http_code}\n%{content_type}' "$BASE$pfad" 2>/dev/null)
  code=$(printf '%s' "$antwort" | tail -2 | head -1)
  typ=$(printf '%s' "$antwort" | tail -1)
  html=$(printf '%s' "$antwort" | sed '$d' | sed '$d')

  vorher=$fehler
  [[ "$code" == "200" ]] || { bad "$pfad answers $code"; continue; }
  [[ "$typ" == text/html* ]] || bad "$pfad is $typ, not HTML"

  # Text without markup: a sentence split across two elements is still a sentence to a reader.
  text=$(printf '%s' "$html" | sed -e 's/<[^>]*>/ /g' -e 's/  */ /g')

  printf '%s' "$html" | grep -q '<title>[^<]' || bad "$pfad has no title"
  [[ "$(printf '%s' "$html" | grep -c '<h1')" == "1" ]] || bad "$pfad does not have exactly one h1"

  for rest in '<!--MARKET-->' '<!--NUMBERS-->' '${' 'undefined' 'NaN' '[object Object]'; do
    if printf '%s' "$html" | grep -qF "$rest"; then
      bad "$pfad still contains $rest" "$(printf '%s' "$text" | grep -oF -m1 -A0 "$rest" | head -1)"
    fi
  done

  # The plural that keeps slipping, against a named list so prose does not raise false alarms.
  schief=$(printf '%s' "$text" | grep -oE '\b1 (jobs|agents|submissions|services|providers|wallets|tests|calls|attempts|buyers|receipts|entries)\b' | head -1)
  [[ -z "$schief" ]] || bad "$pfad says \"$schief\"" "one of something does not take the plural"

  (( fehler == vorher )) && ok "$pfad: 200 HTML, one h1, nothing unrendered"
done

# The card a link unfurls into, per page, because a broken one is invisible until somebody shares.
for bild in /og.png /og-x402.png; do
  code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$BASE$bild")
  [[ "$code" == "200" ]] && ok "$bild: 200" || bad "$bild answers $code"
done

# Every path the navigation offers has to exist, or the page sends people into a wall.
ziele=$(curl -s -m 15 "$BASE/" | grep -oE 'href="/[a-z0-9.-]*"' | sort -u | sed 's/href="//;s/"//')
for ziel in $ziele; do
  code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$BASE$ziel")
  [[ "$code" =~ ^(200|302)$ ]] || bad "the landing page links $ziel, which answers $code"
done
ok "every internal link on the landing page resolves"

echo
if (( fehler == 0 )); then echo "PAGES OK"; else echo "PAGES FAILED: $fehler"; fi
exit $(( fehler == 0 ? 0 : 1 ))
