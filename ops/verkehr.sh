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
# The operator's own line, the VM itself and the code-host. Without this filter the picture
# consists of us.
#
# The code-host (Google Cloud, 35.242.237.124) joined on 2026-09-20 and is the most treacherous of
# the three: any job that runs ops/journeys-pruefen.sh or harness/e2e/markt.ts against production
# otherwise shows up as a stranger probing exactly the new market paths. That is precisely the
# signal we are waiting for, and it would be our own.
OWN="${CP_OWN_IPS:-82.194.125.90 76.13.144.207 35.242.237.124}"

since=$(( $(date -u +%s) - HOURS * 3600 ))
# Handed to jq as a JSON list, not as an expression assembled by hand: a `paste -d' and '` only
# takes the first character as the separator, which left the filter silently broken.
own_json=$(printf '%s' "$OWN" | tr ' ' '\n' | jq -R . | jq -sc .)
FOREIGN='select(.request.remote_ip as $ip | ($own | index($ip)) == null)' 

log=$(mktemp); trap 'rm -f "$log"' EXIT
# ConnectTimeout only covers making the connection, not the transfer. On 2026-09-20 this call hung
# past two minutes twice while the same fetch took a second on either side of it, and both times
# the first reading was that the observation tool was broken. That is the dangerous reading: a tool
# that hangs looks like a tool problem, and the next real outage gets waved away as one. So it now
# fails fast and says which half failed, instead of sitting there.
if ! timeout 45 ssh -i "$KEY" -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=3 "$HOST" \
  'docker exec deploy-caddy-1 cat /var/log/caddy/access.log' 2>/dev/null > "$log"; then
  echo "FEHLER: das Zugriffslog war in 45 Sekunden nicht zu holen." >&2
  echo "        Das ist kein Befund ueber den Dienst. Pruefe ihn getrennt:" >&2
  echo "        curl -s -o /dev/null -m 10 -w '%{http_code}\n' https://cp.hippe.eu/health" >&2
  exit 2
fi
if [[ ! -s "$log" ]]; then
  echo "FEHLER: das Zugriffslog kam leer zurueck. Laeuft deploy-caddy-1?" >&2
  exit 2
fi

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
echo "-- Foreign referrers, and what the visit became --"
# A count of clicks answers the wrong question. The one the standing order asks every cycle is
# whether the issue answers are a channel, and a channel is not a click: it is somebody who
# arrived and then did something. So each referrer is shown with the distinct addresses it
# brought and every path those addresses touched afterwards, in order.
#
# `/` alone means they looked and left. `/bounties.json` means they went for the market.
# `/v1/auth/nonce` means somebody started provisioning, and that is the line worth waking up for.
#
# Our own addresses are filtered out here, same as everywhere else. They were not, until
# 2026-09-21: the section showed two referrers from Conway issues #353 and #371 with one address
# behind them that walked on to /bounties.json and /receipts.json, and that address was our own.
# Two of the three issues have no answer posted at all, so the only possible source was one of us
# clicking through from GitHub. That is the worst shape a measurement error can take, because the
# section exists to answer exactly one question and the wrong answer was the one we were hoping
# for. The number of dropped rows is printed, so the filter can never silently swallow everything.
ours=$(jq -r --argjson since "$since" --argjson own "$own_json" \
  "select(.ts > \$since) | select(.request.remote_ip as \$ip | (\$own | index(\$ip)) != null) | ((.request.headers.Referer // [\"-\"])[0])" "$log" \
  | grep -v '^-$' | grep -vc 'cp\.hippe\.eu' || true)
jq -r --argjson since "$since" --argjson own "$own_json" \
  "select(.ts > \$since) | $FOREIGN | [((.request.headers.Referer // [\"-\"])[0]), .request.remote_ip, .request.uri] | @tsv" "$log" \
  | grep -v $'^-\t' | grep -v 'cp\.hippe\.eu' \
  | python3 -c '
import sys, collections
vonher = collections.defaultdict(lambda: collections.defaultdict(list))
for zeile in sys.stdin:
    teile = zeile.rstrip("\n").split("\t")
    if len(teile) != 3:
        continue
    ref, ip, pfad = teile
    vonher[ref][ip].append(pfad)
if not vonher:
    print("  none")
for ref, ips in sorted(vonher.items(), key=lambda kv: -len(kv[1])):
    print(f"  {ref}")
    print(f"    {len(ips)} address(es)")
    for ip, pfade in ips.items():
        gesehen, reihe = set(), []
        for pfad in pfade:
            if pfad not in gesehen:
                gesehen.add(pfad)
                reihe.append(pfad)
        weiter = [p for p in reihe if p != "/"]
        marke = "  <-- went further" if weiter else ""
        pfadkette = " -> ".join(reihe[:6])
        print("    %-16s %s%s" % (ip, pfadkette, marke))
' || true
# `|| true`, not `|| echo "  none"`, and not nothing at all. The python above already prints "none"
# when there is nothing to show, and with `pipefail` the greps that filter every line out exit 1,
# so the old fallback fired on top of it and the section said "none" twice. Dropping the fallback
# entirely was worse: `set -e` then killed the script right here, and the report lost the two
# sections below it, which is most of what a cycle looks at.
if [[ "${ours:-0}" -gt 0 ]]; then
  echo "  ($ours row(s) with a foreign referrer came from our own addresses and are not counted)"
fi

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
# Did the page lead anywhere?
#
# Added on 2026-09-21, after the first cycle that asked the question and had to answer it by hand.
# Over the 48 hours to that evening, 36 foreign addresses fetched the landing page and not one of
# them then fetched a second page. That is the only behavioural measurement these logs can yield,
# and until now no cycle looked at it.
#
# "Onward" is a 200 that is HTML and is not the landing page, or one of the three files an agent
# fetches instead of a page. Defining it by the answer and not by a list of known paths means it
# does not rot: a scanner probing /wp-login.php gets a 404 in JSON and never counts, and a page
# added next month counts from its first visit without anybody editing this.
#
# What this does NOT see, and the reason a zero here is not yet a verdict on the page: the landing
# page is a single page with anchor links (#how, #agents, #start). Following one of those leaves no
# line in any log. So this measures leaving the page, not interest in it.
echo "-- Did the page lead anywhere? (a second page, not an anchor) --"
jq -r --argjson since "$since" --argjson own "$own_json" \
  "select(.ts > \$since) | $FOREIGN | select(.status == 200) | [.request.remote_ip, .request.uri, (.resp_headers.\"Content-Type\"[0] // \"\")] | @tsv" "$log" \
  | awk -F'\t' '
      { ip = $1; uri = $2; ct = $3
        if (uri == "/") { landed[ip] = 1; next }
        onward = (ct ~ /text\/html/) || uri == "/bounties.json" || uri == "/llms.txt" || uri == "/.well-known/x402"
        # Distinct paths, not every request. The counter-proof on 2026-09-21 ran against our own
        # address, which has fetched every page hundreds of times, and printed a single line of
        # roughly nine thousand characters. A report is unreadable exactly on the day it finally
        # has something to say, which is the day it matters.
        if (onward && !((ip, uri) in seen_page)) {
          seen_page[ip, uri] = 1
          if (count[ip] < 6) { next_page[ip] = next_page[ip] uri " " }
          else if (count[ip] == 6) { next_page[ip] = next_page[ip] "..." }
          count[ip]++
        }
      }
      END {
        n = 0; moved = 0
        for (ip in landed) {
          n++
          if (ip in next_page) { moved++; printf "   %-16s %d page(s): %s\n", ip, count[ip], next_page[ip] }
        }
        if (n == 0) { print "   nobody fetched the landing page"; exit }
        printf "   %d of %d who opened the page went on to a second one.\n", moved, n
        if (moved == 0) print "   (anchor links leave no log line, so this is a floor, not a verdict)"
      }'

echo
echo "-- Error answers to strangers (what a visitor got to see) --"
jq -r --argjson since "$since" --argjson own "$own_json" \
  "select(.ts > \$since) | $FOREIGN | select(.status >= 400) | select(.request.uri | test(\"wp-|php|\\\\.env|\\\\.git|admin|xmlrpc\") | not) | [(.status|tostring), .request.uri] | @tsv" "$log" \
  | sort | uniq -c | sort -rn | head -10 || echo "  none"
