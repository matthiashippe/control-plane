#!/usr/bin/env bash
# Has anything that indexes the web ever looked at this service?
#
# On 2026-09-22, in 17,944 log lines covering two and a half days, there was not one crawler of any
# kind: no Googlebot, no Bing, no preview bot that unfurls a link in a chat window, no AI crawler.
# Everything on our side is in order, which is what makes the number worth watching rather than
# fixing: robots.txt allows everything and names the sitemap, the sitemap lists eight pages and all
# of them answer 200, the repository is public with cp.hippe.eu in its description, its homepage
# field and four times in the README.
#
# That held for 2.9 days and then stopped holding, on the same day, at 17:56 UTC: **eighteen seconds
# after three comments were posted to Conway issues #392, #376 and #372, Googlebot arrived for the
# first time.** robots.txt, then the landing page twice, then /v1/status with the landing page as
# its referrer, which is our own inline script running, so it rendered the page rather than reading
# the markup. Six requests from 66.249.70.7 and .8.
#
# The explanation that stood here until then is therefore wrong, and it is worth saying plainly
# rather than replacing it with a better guess: it said a crawler never comes because every public
# link sits in GitHub user content carrying rel="nofollow", so no crawl signal is passed. One
# comment on a public issue was enough. Whether Google followed the nofollow link anyway (it has
# treated it as a hint and not an instruction since 2019), or whether one of the preview fetchers
# that hit us in the same second put the URL in front of it, this log cannot say. What it can say
# is that the door was never shut, and three comments opened it in under twenty seconds.
#
#   ops/visibility.sh
#
# Exit 0 when the answer is "nothing has come yet and our side is in order", 1 when our side is
# not in order, 2 when it could not look. The first crawler is news; it is printed loudly.
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="${CP_URL:-https://cp.hippe.eu}"
KEY="${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}"
HOST="${CP_HOST:-root@76.13.144.207}"

# A log from a file, so a finding of "nothing" can be shown to be a finding rather than
# blindness. See the same switch in ops/depth.sh and the reason it had to be added there.
if [[ -n "${CP_VISIBILITY_LOG:-}" ]]; then
  log=$(mktemp); trap 'rm -f "$log"' EXIT
  cp "${CP_VISIBILITY_LOG}" "$log"
  echo "(log from ${CP_VISIBILITY_LOG}, not from the VM)" >&2
else
  log=$(mktemp); trap 'rm -f "$log"' EXIT
  if ! timeout 45 ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=5 "$HOST" \
    'docker exec deploy-caddy-1 cat /var/log/caddy/access.log | gzip -c' 2>/dev/null | gunzip > "$log"; then
    echo "COULD NOT TELL: the access log was not readable in 45 seconds." >&2
    echo "        A hiccup on the ssh connection, not a finding about the service." >&2
    exit 2
  fi
fi

failures=0

echo "Who that indexes the web has been here"
echo

crawler_report=$(python3 - "$log" <<'PY'
import collections, datetime, json, re, sys

# Named rather than pattern-matched on "bot", because half the scanners on this log call themselves
# a bot and none of them index anything.
# The AI crawlers of 2025/26 largely dropped "bot" from their names: meta-externalagent,
# google-extended, applebot-extended, anthropic-ai. A planted meta-externalagent walked straight
# through both this list and the pattern below on 2026-09-22, which is exactly the miss the
# unnamed column exists to prevent and did not.
NAMES = ("googlebot|bingbot|duckduckbot|yandex|baiduspider|slurp|applebot|ahrefsbot|semrushbot|"
         "mj12bot|dotbot|petalbot|gptbot|oai-searchbot|chatgpt-user|claudebot|claude-web|ccbot|"
         "perplexitybot|amazonbot|bytespider|facebookexternalhit|twitterbot|linkedinbot|"
         "telegrambot|discordbot|slackbot|whatsapp|redditbot|pinterest|"
         "meta-externalagent|meta-externalfetcher|google-extended|applebot-extended|"
         "anthropic-ai|cohere-ai|diffbot|timpibot|omgili|youbot|imagesiftbot|duckassistbot")

# A named list cannot be complete, and on the day a crawler that is not on it arrives, this script
# would print the same "Nothing" it prints today. So everything that describes itself like a
# fetching machine and is not named gets counted separately. Not an alarm: a column to look at,
# which is what makes a new crawler visible before somebody thinks to add it to the list above.
SUSPECT = re.compile(r"bot|crawl|spider|index|fetch|scrape|archiv|preview|agent|-ai/|search", re.I)

hits = collections.Counter()
unnamed = collections.Counter()
first_seen, last_seen = {}, {}
lines = 0
earliest = None
for raw in open(sys.argv[1]):
    raw = raw.strip()
    if not raw.startswith("{"):
        continue
    try:
        z = json.loads(raw)
    except ValueError:
        continue
    lines += 1
    at = datetime.datetime.fromtimestamp(z["ts"], datetime.timezone.utc)
    if earliest is None or at < earliest:
        earliest = at
    ua = (z.get("request", {}).get("headers", {}).get("User-Agent") or ["-"])[0]
    m = re.search(NAMES, ua, re.I)
    if not m:
        if SUSPECT.search(ua):
            unnamed[ua[:70]] += 1
        continue
    name = m.group(0).lower()
    hits[name] += 1
    if name not in first_seen or at < first_seen[name]:
        first_seen[name] = at
    last_seen[name] = max(last_seen.get(name, at), at)

age = datetime.datetime.now(datetime.timezone.utc) - earliest if earliest else None
days = age.days + age.seconds / 86400 if age else 0
print(f"  log covers {lines:,} requests over {days:.1f} days, from {earliest:%Y-%m-%d %H:%M} UTC")
print()
if hits:
    print("  FIRST CRAWLER: something that indexes the web has found this service.")
    for name, n in hits.most_common():
        print(f"    {name:22s} {n:5d} request(s), first {first_seen[name]:%m-%d %H:%M}, last {last_seen[name]:%m-%d %H:%M} UTC")
else:
    print(f"  Nothing. Not one crawler, preview bot or AI crawler in {days:.1f} days.")
    print("  A crawler arrives by following a link. On 2026-09-22 at 17:56 UTC three comments on")
    print("  public Conway issues brought Googlebot within eighteen seconds, after 2.9 days of")
    print("  nothing, so posting is what moves this number. If it is back at zero, the last link")
    print("  is old news rather than the door being shut.")
    print()
    print("  What this cannot see: a crawler that sends a browser user agent. Nothing in a log tells")
    print("  such a visit apart from a reader, so \"nothing\" here means nothing that says it is one.")

if unnamed:
    print()
    print(f"  Not on the list above, but calls itself a fetching machine ({len(unnamed)} kind(s)):")
    for ua, n in unnamed.most_common(6):
        print(f"    {n:5d}x  {ua}")
    print("  Look at these. One of them being a real crawler is how the list above gets its next entry.")
PY
)
printf '%s\n' "$crawler_report"

echo
echo "-- Our side of it --"
robots=$(curl -s -m 10 "$BASE/robots.txt" || true)
if printf '%s' "$robots" | grep -qi "^Allow: /" && printf '%s' "$robots" | grep -qi "^Sitemap: "; then
  echo "  ok      robots.txt allows everything and names the sitemap"
else
  echo "  FAILED  robots.txt does not allow crawling or does not name the sitemap:"
  printf '%s\n' "$robots" | sed 's/^/          /'
  failures=1
fi

sitemap_xml=$(curl -s -m 10 "$BASE/sitemap.xml" || true)
urls=$(printf '%s' "$sitemap_xml" | grep -o '<loc>[^<]*</loc>' | sed 's/<[^>]*>//g' || true)
count=$(printf '%s\n' "$urls" | grep -c . || true)
if (( count == 0 )); then
  echo "  FAILED  sitemap.xml lists no URL at all"
  failures=1
else
  bad=0
  while read -r u; do
    [[ -z "$u" ]] && continue
    code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$u")
    [[ "$code" == "200" ]] || { echo "  FAILED  $u answers $code and is in the sitemap"; bad=1; }
  done <<< "$urls"
  (( bad )) && failures=1
  (( bad )) || echo "  ok      all $count page(s) in the sitemap answer 200"
fi

# A page that forbids indexing cannot be indexed, however many crawlers come.
if curl -s -m 10 -D - -o /dev/null "$BASE/" | grep -qi "^x-robots-tag:.*noindex"; then
  echo "  FAILED  the landing page sends X-Robots-Tag: noindex"
  failures=1
elif curl -s -m 10 "$BASE/" | grep -qi '<meta[^>]*name="robots"[^>]*noindex'; then
  echo "  FAILED  the landing page carries a noindex meta tag"
  failures=1
else
  echo "  ok      nothing on the landing page forbids indexing"
fi

echo
if (( failures )); then
  echo "VISIBILITY FAILED: something on our side keeps crawlers out."
  exit 1
fi
# The closing line follows the finding above rather than repeating a fixed sentence. Once a crawler
# has been here, "what is missing is a link" is no longer true and would read as an instruction to
# do the thing that already worked; while none has, saying one has would be worse still. So it is
# read out of the report rather than written twice.
# No pipe: see the note in ops/check-pages.sh about grep -q, SIGPIPE and pipefail.
if [[ "$crawler_report" == *"FIRST CRAWLER"* ]]; then
  echo "VISIBILITY OK on our side, and something that indexes the web has been here."
  echo "Whether it stays is a question about new links, not about this repository."
else
  echo "VISIBILITY OK on our side. What is missing is a link from a page that gets crawled,"
  echo "and that is a decision about posting, not a change to this repository."
fi
