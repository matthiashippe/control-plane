#!/usr/bin/env bash
# Who was here, and where did they come from?
#
# The question that opens every loop cycle, and by hand it is the same chain of ssh, jq and sort
# every time. What matters is the FIRST request of an IP: only there is the referrer that says
# through which channel somebody arrived. Every follow-up request carries cp.hippe.eu and is
# worthless.
#
#   ops/verkehr.sh          last 24 hours
#   ops/verkehr.sh 72       last 72 hours
set -euo pipefail

HOURS="${1:-24}"
KEY="${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}"
HOST="${CP_HOST:-root@76.13.144.207}"
# The operator's own line and the VM itself. Without this filter the picture consists of us.
OWN="${CP_OWN_IPS:-82.194.125.90 76.13.144.207}"

since=$(( $(date -u +%s) - HOURS * 3600 ))
# Handed to jq as a JSON list, not as an expression assembled by hand: a `paste -d' and '` only
# takes the first character as the separator, which left the filter silently broken.
own_json=$(printf '%s' "$OWN" | tr ' ' '\n' | jq -R . | jq -sc .)
FOREIGN='select(.request.remote_ip as $ip | ($own | index($ip)) == null)' 

log=$(mktemp); trap 'rm -f "$log"' EXIT
ssh -i "$KEY" -o ConnectTimeout=10 "$HOST" \
  'docker exec deploy-caddy-1 cat /var/log/caddy/access.log' 2>/dev/null > "$log"

echo "Requests to cp.hippe.eu in the last $HOURS hours"
echo

echo "-- First request per foreign IP (this is where the referrer is) --"
jq -r --argjson since "$since" --argjson own "$own_json" \
  "select(.ts > \$since) | $FOREIGN | [(.ts|floor|tostring), .request.remote_ip, .request.uri, (.status|tostring), ((.request.headers.Referer // [\"-\"])[0]), ((.request.headers[\"User-Agent\"] // [\"-\"])[0]|.[0:40])] | @tsv" "$log" \
  | sort -k2,2 -k1,1n | awk -F'\t' '!seen[$2]++' | sort -k1,1n \
  | while IFS=$'\t' read -r ts ip uri st ref ua; do
      printf '%s  %-16s %-28s %3s  %-28s %s\n' "$(date -u -r "$ts" +%m-%d\ %H:%M 2>/dev/null || echo "$ts")" "$ip" "${uri:0:28}" "$st" "${ref:0:28}" "$ua"
    done

echo
echo "-- Foreign referrers (everything that is not us) --"
jq -r --argjson since "$since" "select(.ts > \$since) | (.request.headers.Referer // [\"-\"])[0]" "$log" \
  | grep -v '^-$' | grep -v 'cp\.hippe\.eu' | sort | uniq -c | sort -rn || echo "  none"

echo
# The landing page pulls its numbers with `fetch("/v1/status")` (src/public/index.html). A real
# browser therefore leaves TWO lines, `/` and shortly after `/v1/status`. A fetcher without
# JavaScript leaves only the first, no matter how genuine its user agent looks. On 20.09.2026 two
# requests came from the same /24 of Web2Objects LLC with a Mac Safari string and neither loaded
# anything afterwards: a proxy crawler, not a person.
#
# What `JS` does NOT prove: that a human sat in front of it. Modern crawlers execute JavaScript, and
# of the nine IPs that fetched both on 20.09., most sat in data centre ranges (34.x, 52.x,
# 205.169.x). The column separates two classes of fetchers, not human from machine. Together with
# the origin of the IP it becomes meaningful, on its own it does not.
echo "-- Did anybody really open the page? (JS = browser, raw = fetcher) --"
jq -r --argjson since "$since" --argjson own "$own_json" \
  "select(.ts > \$since) | $FOREIGN | select(.request.uri == \"/\" or .request.uri == \"/v1/status\") | [.request.remote_ip, .request.uri] | @tsv" "$log" \
  | sort -u | awk -F'\t' '{ seen[$1] = seen[$1] $2 " " } END {
      empty = 1
      for (ip in seen) {
        js = (seen[ip] ~ /\/v1\/status/ && seen[ip] ~ /\/ /) ? "JS " : "raw"
        printf "   %-4s %s\n", js, ip; empty = 0
      }
      if (empty) print "   nobody fetched / or /v1/status"
    }' | sort -k1,1 -k2,2

echo
echo "-- Error answers to strangers (what a visitor got to see) --"
jq -r --argjson since "$since" --argjson own "$own_json" \
  "select(.ts > \$since) | $FOREIGN | select(.status >= 400) | select(.request.uri | test(\"wp-|php|\\\\.env|\\\\.git|admin|xmlrpc\") | not) | [(.status|tostring), .request.uri] | @tsv" "$log" \
  | sort | uniq -c | sort -rn | head -10 || echo "  none"
