#!/usr/bin/env bash
# Who was here, and where did they come from?
#
# The question that opens every loop cycle, and by hand it is the same chain of ssh, jq and sort
# every time. What matters is the FIRST request of an IP: only there is the referrer that says
# through which channel somebody arrived. Every follow-up request carries cp.hippe.eu and is
# worthless.
#
#   ops/traffic.sh          last 24 hours
#   ops/traffic.sh 72       last 72 hours
set -euo pipefail

HOURS="${1:-24}"
KEY="${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}"
HOST="${CP_HOST:-root@76.13.144.207}"
# The operator's own line, the VM itself and the code-host. Without this filter the picture
# consists of us.
#
# The code-host (Google Cloud, 35.242.237.124) joined on 2026-09-20 and is the most treacherous of
# the three: any job that runs ops/check-journeys.sh or harness/e2e/markt.ts against production
# otherwise shows up as a stranger probing exactly the new market paths. That is precisely the
# signal we are waiting for, and it would be our own.
source "$(dirname "$0")/own-ips.sh"
OWN=$(eigene_ips)
# That list is a starting point, not the answer. Our own address is not a constant: on 2026-09-22
# between 06:41 and 07:02 UTC this machine's line reconnected and got 62.224.55.59 instead of
# 82.194.125.90, and the next run of this script presented our own check-all.sh as the best news
# the service had ever had: a stranger who opened the page, walked on to nine more, and provisioned
# two wallets. Every error a measurement makes about itself points the flattering way.
#
# So the list is now assembled from evidence, in `own_addresses` below, and what it adds is
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
# A planted log, so the evidence lines below can be proved in both directions. Every other
# measuring tool here has one (CP_DEPTH_LOG, CP_VISIBILITY_LOG, CP_ERROR_PATTERN, CP_WINDOW_NOW) and
# loop-constraints.md requires it of anything that can report "none": without a counter-proof a
# zero is indistinguishable from blindness. Fixtures under ops/fixtures/.
if [[ -n "${CP_TRAFFIC_LOG:-}" ]]; then
  cp "${CP_TRAFFIC_LOG}" "$log"
  echo "(log from ${CP_TRAFFIC_LOG}, not from the VM)" >&2
elif ! timeout 45 ssh -i "$KEY" -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=3 "$HOST" \
  'docker exec deploy-caddy-1 cat /var/log/caddy/access.log | gzip -c' 2>/dev/null | gunzip > "$log"; then
  echo "ERROR: the access log could not be fetched within 45 seconds." >&2
  echo "       That is no finding about the service. Check it separately:" >&2
  echo "       curl -s -o /dev/null -m 10 -w '%{http_code}\n' https://cp.hippe.eu/health" >&2
  exit 2
fi
if [[ ! -s "$log" ]]; then
  echo "ERROR: the access log came back empty. Is deploy-caddy-1 running?" >&2
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
own_addresses() {
  local checkers
  checkers=$(jq -r 'select(((.request.headers["User-Agent"] // [""])[0]) | startswith("control-plane-check")) | .request.remote_ip' "$log" 2>/dev/null | sort -u)
  printf '%s\n' $OWN $checkers | grep -v '^$' | sort -u
}
added=$(comm -13 <(printf '%s\n' $OWN | sort -u) <(own_addresses))
OWN=$(own_addresses | tr '\n' ' ')
own_json=$(printf '%s' "$OWN" | tr ' ' '\n' | grep -v '^$' | jq -R . | jq -sc .)

echo "Requests to cp.hippe.eu in the last $HOURS hours"
if [[ -n "$added" ]]; then
  echo "(counted as ours beyond the configured list: $(printf '%s' "$added" | tr '\n' ' '))"
  echo "(these sent our own checker UA; addresses of this machine live in ops/own-ips.txt)"
fi
echo

# The line every cycle reads first, and the one that did not exist until 2026-09-22.
#
# Answering "was a person here" took three scripts and a hand check of every address, five times in
# one evening. The signals were always the same, so they live here now. None of them is proof on
# its own and the sum of them is not proof either; what they buy is the difference between an
# address that behaves like a person and one that does not, which is the only distinction this
# service has ever needed and the one it kept making by hand.
#
# A person, as far as a log can tell, is an address that SCROLLED: it fetched a lazy pixel from
# below the first screen, and not all of them inside one second. Everything else is weaker and the
# first version of this section proved it by reporting eighteen people where there were two. Its
# test was "the inline script ran", and every rendering fetcher runs the script; Googlebot was in
# that list, and so were eight Google Cloud addresses that loaded the page once and left.
#
# Three further conditions, each of which caught something real:
#   - not all marks inside one second, which is a renderer with a viewport tall enough to hold the
#     whole page (34.116.225.162 and .146.142 on 2026-09-22, four pixels in under a second);
#   - no second browser identity from the same address within a minute, which caught
#     35.243.23.139, the only address that ever followed a link here. It carried four identities
#     (Pixel 4a, Windows Chrome, Android Firefox, Mac Safari) and a referrer of "http://cp.hippe.eu"
#     with no path. It is a link checker;
#   - fewer than three addresses out of its /24 across the whole log, which is the shape of a scan.
#
# Addresses that loaded the page and produced no mark below the fold are counted and named on one
# line, because "nobody scrolled" and "nobody came" are different findings and this section must
# not merge them.
echo "-- Who of them behaved like a person, over the whole log --"
jq -r --argjson own "$own_json" \
  "$FOREIGN | [(.ts|tostring), .request.remote_ip, (.request.uri // \"\"), ((.request.headers.Referer // [\"\"])[0]), ((.request.headers[\"User-Agent\"] // [\"\"])[0])] | @tsv" "$log" \
  | python3 -c '
import sys, collections

people = collections.defaultdict(
    lambda: {"agents": [], "ran_script": False, "marks": set(), "mark_times": {}, "paths": set(), "first": None, "from": ""}
)
networks = collections.defaultdict(set)

for line in sys.stdin:
    parts = line.rstrip("\n").split("\t")
    if len(parts) != 5:
        continue
    stamp, ip, path, referrer, agent = parts
    try:
        stamp = float(stamp)
    except ValueError:
        continue
    path = path.split("?")[0]
    networks[".".join(ip.split(".")[:3])].add(ip)
    if "Mozilla/" not in agent:
        continue
    entry = people[ip]
    entry["agents"].append((stamp, agent))
    if entry["first"] is None or stamp < entry["first"]:
        entry["first"] = stamp
        entry["from"] = referrer
    if path.startswith("/v1/status") and "cp.hippe.eu" in referrer:
        entry["ran_script"] = True
    if path.startswith("/px/") and path.endswith(".png"):
        mark = path[4:-4]
        entry["marks"].add(mark)
        entry["mark_times"].setdefault(mark, stamp)
    elif not path.startswith("/px/") and path != "/favicon.ico":
        entry["paths"].add(path)

def swapped(stamped):
    browsers = sorted(stamped)
    for (t1, a1), (t2, a2) in zip(browsers, browsers[1:]):
        if a1 != a2 and t2 - t1 < 60:
            return True
    return False

ORDER = ["top", "proof", "market", "close", "end"]

def all_at_once(stamps):
    # Two or more marks inside one second is a renderer, the same test ops/depth.sh applies.
    # Measured on 2026-09-22: headless Chrome ignores loading="lazy" and fetches every pixel on
    # load, at a desktop size and at a 390x700 phone viewport alike. A real browser does not:
    # 80.218.182.64 fetched top at 18:03:49 and proof at 18:04:11. The gap is the evidence, not
    # the mark. Requiring three marks let 34.31.186.92 through, which took top and proof in the
    # same second and was reported here as a second reader who got past the proof section.
    return len(stamps) >= 2 and max(stamps) - min(stamps) < 1.0

scrolled, loaded_only, dropped = [], [], collections.Counter()
for ip, entry in people.items():
    if not entry["ran_script"]:
        dropped["never ran the page script"] += 1
        continue
    if swapped(entry["agents"]):
        dropped["changed browser identity within a minute"] += 1
        continue
    if len(networks[".".join(ip.split(".")[:3])]) > 2:
        dropped["one of three or more addresses from its /24"] += 1
        continue
    # Both pages have a control mark in their first screen, and neither of them proves a scroll.
    # Hard-coding only "top" would have counted a /fix reader who fetched fix-top and nothing else
    # as somebody who scrolled.
    below = [m for m in entry["marks"] if m not in ("top", "fix-top")]
    if below and not all_at_once(list(entry["mark_times"].values())):
        scrolled.append((entry["first"], ip, entry))
    else:
        loaded_only.append(ip)

if not scrolled:
    print("   nobody scrolled. Not one address fetched a mark from below the first screen.")
else:
    print(f"   {len(scrolled)} address(es) scrolled, oldest first:")
    for _, ip, entry in sorted(scrolled):
        reached = [m for m in ORDER if m in entry["marks"]]
        depth = reached[-1] if reached else "no mark"
        went = sorted(p for p in entry["paths"] if p != "/")
        came = entry["from"] if entry["from"] else "typed or unknown"
        print(f"     {ip:<16} from {came[:46]}")
        did = ", ".join(went) if went else "nothing, left from the page"
        print(f"                      read to: {depth:<10} then: {did}")
if loaded_only:
    print(f"   {len(loaded_only)} more loaded the page and left no mark below the fold:")
    print("     " + ", ".join(sorted(loaded_only)[:10]) + ("" if len(loaded_only) <= 10 else ", ..."))
    print("     That is a fetcher rendering once, or a person who did not scroll. The page cannot")
    print("     tell those apart, and calling them readers is how this section first said eighteen.")
# Never drop silently. A filter that removes addresses without saying how many is indistinguishable
# from a quiet log, and this section exists precisely to tell those two apart.
if dropped:
    print("   set aside before any of that:")
    for reason, n in dropped.most_common():
        print(f"     {n:>4}  {reason}")
' || true
echo

ROWS="${CP_TRAFFIC_LINES:-25}"
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
all_firsts=$(jq -r --argjson own "$own_json" \
  "$FOREIGN | [(.ts|floor|tostring), .request.remote_ip, .request.uri, (.status|tostring), ((.request.headers.Referer // [\"-\"])[0]), ((.request.headers[\"User-Agent\"] // [\"-\"])[0]|.[0:40])] | @tsv" "$log" \
  | sort -k2,2 -k1,1n | awk -F'\t' '!seen[$2]++')
firsts=$(printf '%s\n' "$all_firsts" | awk -F'\t' -v s="$since" '$1 > s' | sort -k1,1n)
earlier=$(printf '%s\n' "$all_firsts" | awk -F'\t' -v s="$since" '$1 <= s' | grep -c . || true)
active_earlier=$(jq -r --argjson since "$since" --argjson own "$own_json" \
  "select(.ts > \$since) | $FOREIGN | .request.remote_ip" "$log" 2>/dev/null | sort -u \
  | comm -12 - <(printf '%s\n' "$all_firsts" | awk -F'\t' -v s="$since" '$1 <= s {print $2}' | sort -u) | grep -c . || true)
total=$(printf '%s\n' "$firsts" | grep -c . || true)
echo "   ($total address(es) here for the first time in this window; $earlier known from before, $active_earlier of them active again)"

# A returning visitor named, not counted. A count of one is the same shape as a count of none to
# anybody reading the report, and this is the rarer and more interesting of the two kinds of
# visit: somebody who came back without being reminded.
if (( active_earlier > 0 )); then
  jq -r --argjson since "$since" --argjson own "$own_json" \
    "select(.ts > \$since) | $FOREIGN | .request.remote_ip" "$log" 2>/dev/null | sort -u \
    | comm -12 - <(printf '%s\n' "$all_firsts" | awk -F'\t' -v s="$since" '$1 <= s {print $2}' | sort -u) \
    | while read -r ip; do
        [[ -z "$ip" ]] && continue
        row=$(printf '%s\n' "$all_firsts" | awk -F'\t' -v ip="$ip" '$2 == ip')
        ts=$(printf '%s' "$row" | cut -f1); ref=$(printf '%s' "$row" | cut -f5)
        paths=$(jq -r --argjson since "$since" --arg ip "$ip" \
          'select(.ts > $since) | select(.request.remote_ip == $ip) | .request.uri' "$log" \
          | sort -u | head -4 | tr '\n' ' ')
        printf '   back:  %-16s first seen %s from %s, now %s\n' "$ip" \
          "$(date -u -r "$ts" +%m-%d\ %H:%M 2>/dev/null || echo "$ts")" "${ref:0:40}" "${paths:0:60}"
      done
fi
if (( total > ROWS )); then
  echo "   ($((total - ROWS)) older address(es) not shown; the referrer section below counts all $total)"
fi
printf '%s\n' "$firsts" | tail -n "$ROWS" \
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
# Every foreign request of the WHOLE log, not only the ones carrying a referrer and not only the
# ones inside the window. The window decides which referrers are reported; the rest is the evidence
# about the addresses behind them, and that evidence is worthless if it stops at the window edge.
jq -r --argjson own "$own_json" \
  "$FOREIGN | [(.ts|tostring), ((.request.headers.Referer // [\"-\"])[0]), .request.remote_ip, .request.uri, ((.request.headers[\"User-Agent\"] // [\"-\"])[0])] | @tsv" "$log" \
  | python3 -c '
import sys, collections

# A referrer is a string somebody put in a header, and a scanner can put anything there. On
# 2026-09-22 at 18:57:39 an address arrived on /fix with `Referer: https://bing.com/`, which would
# have been the first search referrer this project has seen. It was not one: the /24 behind it had sent six
# addresses since 20.09., one to five requests each, always / then /v1/status, and 205.169.39.191
# changed its Windows version between 02:17:36 and 02:17:39 from the same address. No browser does
# that. Printed beside the github referrers with nothing to tell them apart, that line reads like a
# channel, and a channel is what this section exists to find.
#
# So every address now carries what it did afterwards. None of these signals is proof on its own;
# together they are the difference between somebody who arrived and somebody who scanned.
window_start = float(sys.argv[1])
seen = collections.defaultdict(
    lambda: {"paths": [], "agents": set(), "agent_times": [], "pixel": False, "ran_script": False}
)
by_referrer = collections.defaultdict(lambda: collections.defaultdict(list))
networks = collections.defaultdict(set)

# A person uses more than one tool, and that is not a tell. The Korean operator on 2026-09-22 shows
# up with three user agents from one address (node, curl, Safari) and went from curl to Safari
# inside twenty-three seconds, which is what trying a thing in the terminal and then looking at it
# in the browser looks like. Speed alone therefore marked the most valuable visitor this service
# has had as a scanner, which is the wrong answer in the worst possible place.
#
# What no person does is arrive as one browser and come back as a different browser seconds later.
# 205.169.39.191 did exactly that at 02:17:36 and 02:17:39, Windows NT 6.1 then NT 10.0, both
# claiming to be Chrome. So the tell is two BROWSER identities in quick succession, not two tools.
AGENT_SWAP_SECONDS = 60

def swapped_browsers(stamped_agents):
    browsers = sorted((t, a) for t, a in stamped_agents if "Mozilla/" in a)
    for (t1, a1), (t2, a2) in zip(browsers, browsers[1:]):
        if a1 != a2 and t2 - t1 < AGENT_SWAP_SECONDS:
            return True
    return False

for line in sys.stdin:
    parts = line.rstrip("\n").split("\t")
    if len(parts) != 5:
        continue
    stamp, referrer, ip, path, agent = parts
    try:
        stamp = float(stamp)
    except ValueError:
        continue
    entry = seen[ip]
    entry["paths"].append(path)
    if agent and agent != "-":
        entry["agents"].add(agent)
        entry["agent_times"].append((stamp, agent))
    if path.startswith("/px/"):
        entry["pixel"] = True
    # The inline script fetches /v1/status with the page as its referrer. Nothing else does, so
    # this is the one line in the log that says a real engine ran the page rather than read it.
    if path.startswith("/v1/status") and "cp.hippe.eu" in referrer:
        entry["ran_script"] = True
    networks[".".join(ip.split(".")[:3])].add(ip)
    if stamp > window_start and referrer not in ("-", "") and "cp.hippe.eu" not in referrer:
        by_referrer[referrer][ip].append(path)

if not by_referrer:
    print("  none")
for referrer, addresses in sorted(by_referrer.items(), key=lambda kv: -len(kv[1])):
    print(f"  {referrer}")
    print(f"    {len(addresses)} address(es)")
    for ip, paths in addresses.items():
        known, ordered = set(), []
        for path in paths:
            if path not in known:
                known.add(path)
                ordered.append(path)
        # More than one distinct path, not "a path other than /". An address whose single request
        # lands on /fix has not gone anywhere, and on 2026-09-22 the scanner carrying a bing.com
        # referrer was marked "went further" for exactly one request.
        mark = "  <-- went further" if len(ordered) > 1 else ""
        print("    %-16s %s%s" % (ip, " -> ".join(ordered[:6]), mark))
        entry = seen[ip]
        evidence = [str(len(entry["paths"])) + " request(s) all told"]
        if entry["ran_script"]:
            evidence.append("ran the page script")
        if entry["pixel"]:
            evidence.append("fetched a depth pixel")
        if swapped_browsers(entry["agent_times"]):
            evidence.append("changed browser identity within a minute, which no person does")
        elif len(entry["agents"]) > 1:
            evidence.append(str(len(entry["agents"])) + " tools from this one address over time")
        siblings = networks[".".join(ip.split(".")[:3])]
        if len(siblings) > 2:
            evidence.append(str(len(siblings)) + " addresses from this /24 in the whole log")
        print("                     " + ", ".join(evidence))
' "$since" || true
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
      { if (!seen[$1 SUBSEP $2]++) { n[$1]++; days[$1] = days[$1] $2 " " }
        if (count[$1] < 3) paths[$1] = paths[$1] $3 " "
        count[$1]++ }
      END {
        total = 0; returning = 0; printed = 0
        limit = (ENVIRON["CP_TRAFFIC_LINES"] == "" ? 25 : ENVIRON["CP_TRAFFIC_LINES"]) + 0
        for (ip in n) {
          total++
          if (n[ip] > 1) {
            returning++
            if (printed < limit) { printed++; printf "   %-16s %d days: %s\n      %s\n", ip, n[ip], days[ip], paths[ip] }
          }
        }
        if (total == 0) { print "   no foreign address in the log at all"; exit }
        if (returning > printed) printf "   (%d more returning address(es) not shown)\n", returning - printed
        printf "   %d of %d foreign address(es) were here on more than one day.\n", returning, total
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
      { if (!ip_seen[$1 SUBSEP $2]++) addresses[$1]++
        if (!day_seen[$1 SUBSEP $3]++) { days[$1]++; list[$1] = list[$1] $3 " " } }
      END {
        networks = 0; sum = 0; returning = 0
        for (network in addresses) { networks++; sum += addresses[network]; if (days[network] > 1) returning++ }
        if (networks == 0) { print "   no foreign network in the log"; exit }
        for (network in addresses) {
          if (addresses[network] > 1 || days[network] > 1)
            printf "   %-16s %d address(es) over %d day(s): %s\n", network ".x", addresses[network], days[network], list[network]
        }
        printf "   %d address(es) in %d network(s); %d network(s) were here on more than one day.\n", sum, networks, returning
      }'

echo
echo "-- Error answers to strangers (what a visitor got to see) --"
jq -r --argjson since "$since" --argjson own "$own_json" \
  "select(.ts > \$since) | $FOREIGN | select(.status >= 400) | select(.request.uri | test(\"wp-|php|\\\\.env|\\\\.git|admin|xmlrpc\") | not) | [(.status|tostring), .request.uri] | @tsv" "$log" \
  | sort | uniq -c | sort -rn | head -10 || echo "  none"
