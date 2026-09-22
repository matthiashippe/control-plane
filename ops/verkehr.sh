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
source "$(dirname "$0")/eigene-ips.sh"
OWN=$(eigene_ips)
# That list is a starting point, not the answer. Our own address is not a constant: on 2026-09-22
# between 06:41 and 07:02 UTC this machine's line reconnected and got 62.224.55.59 instead of
# 82.194.125.90, and the next run of this script presented our own check-all.sh as the best news
# the service had ever had: a stranger who opened the page, walked on to nine more, and provisioned
# two wallets. Every error a measurement makes about itself points the flattering way.
#
# So the list is now assembled from evidence, in `eigene_adressen` below, and what it adds is
# printed. A filter that grows in silence can hide a real visitor just as easily.

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
# gzip on the far side, because the access log is 20 MB and growing.
#
# Measured on 2026-09-22: `cat` over ssh took 40 seconds for 20,726,086 bytes and the same file
# through `gzip -c` took 4.5. The 45 second timeout below started firing intermittently on this
# very run, and the failure looks exactly like an outage on a tool whose whole job is to tell an
# outage from a quiet minute. JSON logs compress about tenfold, so this buys back the margin
# without changing a byte of what is read.
#
# The real answer is log rotation, and that lives in deploy/, which is not touched without a human.
if ! timeout 45 ssh -i "$KEY" -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=3 "$HOST" \
  'docker exec deploy-caddy-1 cat /var/log/caddy/access.log | gzip -c' 2>/dev/null | gunzip > "$log"; then
  echo "FEHLER: das Zugriffslog war in 45 Sekunden nicht zu holen." >&2
  echo "        Das ist kein Befund ueber den Dienst. Pruefe ihn getrennt:" >&2
  echo "        curl -s -o /dev/null -m 10 -w '%{http_code}\n' https://cp.hippe.eu/health" >&2
  exit 2
fi
if [[ ! -s "$log" ]]; then
  echo "FEHLER: das Zugriffslog kam leer zurueck. Laeuft deploy-caddy-1?" >&2
  exit 2
fi

# Who is us, according to this run rather than according to a constant typed in earlier.
#
# `eigene_ips` above brings the written history of every address this machine has had, including
# the one the ssh connection comes from right now. On top of that, this log has a second source
# only it can see: every address that sent `control-plane-check/1.0`, the user agent our own checks
# use and nobody else does.
#
# That rule can be spoofed, and a stranger who set the header would disappear from this report.
# The trade is worth taking: a visitor hiding themselves is far-fetched, the addresses folded in
# are printed below, and the failure it prevents happened twice in one day.
eigene_adressen() {
  local pruefer
  pruefer=$(jq -r 'select(((.request.headers["User-Agent"] // [""])[0]) | startswith("control-plane-check")) | .request.remote_ip' "$log" 2>/dev/null | sort -u)
  printf '%s\n' $OWN $pruefer | grep -v '^$' | sort -u
}
dazu=$(comm -13 <(printf '%s\n' $OWN | sort -u) <(eigene_adressen))
OWN=$(eigene_adressen | tr '\n' ' ')
own_json=$(printf '%s' "$OWN" | tr ' ' '\n' | grep -v '^$' | jq -R . | jq -sc .)

echo "Requests to cp.hippe.eu in the last $HOURS hours"
if [[ -n "$dazu" ]]; then
  echo "(counted as ours beyond the configured list: $(printf '%s' "$dazu" | tr '\n' ' '))"
  echo "(these sent our own checker UA; addresses of this machine live in ops/eigene-ips.txt)"
fi
echo

ZEILEN="${CP_VERKEHR_ZEILEN:-25}"
echo "-- First request per foreign IP (this is where the referrer is) --"
# The first request of an address, not the first one inside the window. Until 2026-09-22 the
# window filter ran first, so an address whose real first visit was three days ago and which came
# back yesterday appeared here as new, carrying the referrer of the LATER request. That is almost
# always empty or internal, and this line is the one the standing order points at every cycle:
# the referrer of a first request is the evidence about where people come from. Getting it from
# the wrong request answers the question with a blank.
#
# So: the earliest request of every foreign address over the WHOLE log, and only then the window.
# Addresses that were already here before it are counted separately, because a returning visitor
# is a stronger signal than a new one and must not be silently dropped or silently renamed "new".
alle_ersten=$(jq -r --argjson own "$own_json" \
  "$FOREIGN | [(.ts|floor|tostring), .request.remote_ip, .request.uri, (.status|tostring), ((.request.headers.Referer // [\"-\"])[0]), ((.request.headers[\"User-Agent\"] // [\"-\"])[0]|.[0:40])] | @tsv" "$log" \
  | sort -k2,2 -k1,1n | awk -F'\t' '!seen[$2]++')
erste=$(printf '%s\n' "$alle_ersten" | awk -F'\t' -v s="$since" '$1 > s' | sort -k1,1n)
frueher=$(printf '%s\n' "$alle_ersten" | awk -F'\t' -v s="$since" '$1 <= s' | grep -c . || true)
aktiv_frueher=$(jq -r --argjson since "$since" --argjson own "$own_json" \
  "select(.ts > \$since) | $FOREIGN | .request.remote_ip" "$log" 2>/dev/null | sort -u \
  | comm -12 - <(printf '%s\n' "$alle_ersten" | awk -F'\t' -v s="$since" '$1 <= s {print $2}' | sort -u) | grep -c . || true)
gesamt=$(printf '%s\n' "$erste" | grep -c . || true)
echo "   ($gesamt address(es) here for the first time in this window; $frueher known from before, $aktiv_frueher of them active again)"

# A returning visitor named, not counted. A count of one is the same shape as a count of none to
# anybody reading the report, and this is the rarer and more interesting of the two kinds of
# visit: somebody who came back without being reminded.
if (( aktiv_frueher > 0 )); then
  jq -r --argjson since "$since" --argjson own "$own_json" \
    "select(.ts > \$since) | $FOREIGN | .request.remote_ip" "$log" 2>/dev/null | sort -u \
    | comm -12 - <(printf '%s\n' "$alle_ersten" | awk -F'\t' -v s="$since" '$1 <= s {print $2}' | sort -u) \
    | while read -r ip; do
        [[ -z "$ip" ]] && continue
        zeile=$(printf '%s\n' "$alle_ersten" | awk -F'\t' -v ip="$ip" '$2 == ip')
        ts=$(printf '%s' "$zeile" | cut -f1); ref=$(printf '%s' "$zeile" | cut -f5)
        pfade=$(jq -r --argjson since "$since" --arg ip "$ip" \
          'select(.ts > $since) | select(.request.remote_ip == $ip) | .request.uri' "$log" \
          | sort -u | head -4 | tr '\n' ' ')
        printf '   back:  %-16s first seen %s from %s, now %s\n' "$ip" \
          "$(date -u -r "$ts" +%m-%d\ %H:%M 2>/dev/null || echo "$ts")" "${ref:0:40}" "${pfade:0:60}"
      done
fi
if (( gesamt > ZEILEN )); then
  echo "   ($((gesamt - ZEILEN)) older address(es) not shown; the referrer section below counts all $gesamt)"
fi
printf '%s\n' "$erste" | tail -n "$ZEILEN" \
  | while IFS=$'\t' read -r ts ip uri st ref ua; do
      [[ -z "$ts" ]] && continue
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
# Did anybody come back?
#
# Every other section here reads one window, so somebody who visits on Monday and again on Friday
# looks like two strangers. Working it out by hand on 2026-09-22 took one query and produced the
# first new fact in hours: 2 of 46 foreign addresses had been here on more than one day, and both
# were tools walking API paths rather than people.
#
# On a service waiting for its first user, a returning visitor is the strongest signal short of a
# payment. It deserves a line rather than an afternoon of curiosity.
#
# This one ignores the window on purpose and reads the whole log, so the first line says how far
# back that goes. Caddy rotates it, so the answer changes without warning.
echo "-- Did anybody come back? (the whole log, not the window) --"
jq -r --argjson own "$own_json" \
  "$FOREIGN | select(.request.uri | test(\"wp-|php|\\\\.env|\\\\.git|admin|xmlrpc|/vendor|/actuator|/cgi\") | not)
   | [.request.remote_ip, (.ts | strftime(\"%Y-%m-%d\")), .request.uri] | @tsv" "$log" \
  | sort -u | awk -F'\t' '
      # The day goes on the list once, not once per distinct path: the rows are unique by
      # (ip, day, path), so appending outside this guard printed the same date three times.
      { if (!seen[$1 SUBSEP $2]++) { n[$1]++; tage[$1] = tage[$1] $2 " " }
        if (count[$1] < 3) pfade[$1] = pfade[$1] $3 " "
        count[$1]++ }
      END {
        gesamt = 0; wieder = 0; gedruckt = 0
        grenze = (ENVIRON["CP_VERKEHR_ZEILEN"] == "" ? 25 : ENVIRON["CP_VERKEHR_ZEILEN"]) + 0
        for (ip in n) {
          gesamt++
          if (n[ip] > 1) {
            wieder++
            if (gedruckt < grenze) { gedruckt++; printf "   %-16s %d days: %s\n      %s\n", ip, n[ip], tage[ip], pfade[ip] }
          }
        }
        if (gesamt == 0) { print "   no foreign address in the log at all"; exit }
        if (wieder > gedruckt) printf "   (%d more returning address(es) not shown)\n", wieder - gedruckt
        printf "   %d of %d foreign address(es) were here on more than one day.\n", wieder, gesamt
      }'

echo
# And the same question one level up, because an address is not a visitor.
#
# On 2026-09-22 the log held 50 foreign addresses in 41 /24 networks. One of those networks,
# 205.169.39.x, had five addresses and thirteen requests spread over three days, all with the same
# two Windows user agents. Counted by address that is five strangers who each came once; counted by
# network it is one thing that keeps coming back, which is the more useful reading and the one
# nothing was doing.
#
# A /24 is an assumption, not a fact: two neighbours in one can be unrelated, and on mobile or in a
# cloud range they usually are. So both numbers are printed and neither replaces the other.
echo "-- The same, by network (a /24 is an assumption, not a fact) --"
jq -r --argjson own "$own_json" \
  "$FOREIGN | select(.request.uri | test(\"wp-|php|\\\\.env|\\\\.git|admin|xmlrpc|/vendor|/actuator|/cgi\") | not)
   | [(.request.remote_ip | split(\".\")[0:3] | join(\".\")), .request.remote_ip, (.ts | strftime(\"%Y-%m-%d\"))] | @tsv" "$log" \
  | sort -u | sort -k1,1 -k3,3 | awk -F'\t' '
      { if (!ip_seen[$1 SUBSEP $2]++) adressen[$1]++
        if (!tag_seen[$1 SUBSEP $3]++) { tage[$1]++; liste[$1] = liste[$1] $3 " " } }
      END {
        netze = 0; summe = 0; wieder = 0
        for (netz in adressen) { netze++; summe += adressen[netz]; if (tage[netz] > 1) wieder++ }
        if (netze == 0) { print "   no foreign network in the log"; exit }
        for (netz in adressen) {
          if (adressen[netz] > 1 || tage[netz] > 1)
            printf "   %-16s %d address(es) over %d day(s): %s\n", netz ".x", adressen[netz], tage[netz], liste[netz]
        }
        printf "   %d address(es) in %d network(s); %d network(s) were here on more than one day.\n", summe, netze, wieder
      }'

echo
echo "-- Error answers to strangers (what a visitor got to see) --"
jq -r --argjson since "$since" --argjson own "$own_json" \
  "select(.ts > \$since) | $FOREIGN | select(.status >= 400) | select(.request.uri | test(\"wp-|php|\\\\.env|\\\\.git|admin|xmlrpc\") | not) | [(.status|tostring), .request.uri] | @tsv" "$log" \
  | sort | uniq -c | sort -rn | head -10 || echo "  none"
