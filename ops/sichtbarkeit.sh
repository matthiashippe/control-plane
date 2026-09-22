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
# The reason is upstream of anything in this repo. A crawler arrives by following a link, and every
# public link to this service sits inside GitHub user content, which carries rel="nofollow" and
# passes no crawl signal. Two and a half days is also not long for a domain nobody links.
#
#   ops/sichtbarkeit.sh
#
# Exit 0 when the answer is "nothing has come yet and our side is in order", 1 when our side is
# not in order, 2 when it could not look. The first crawler is news; it is printed loudly.
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="${CP_URL:-https://cp.hippe.eu}"
KEY="${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}"
HOST="${CP_HOST:-root@76.13.144.207}"

log=$(mktemp); trap 'rm -f "$log"' EXIT
if ! timeout 45 ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=5 "$HOST" \
  'docker exec deploy-caddy-1 cat /var/log/caddy/access.log | gzip -c' 2>/dev/null | gunzip > "$log"; then
  echo "COULD NOT TELL: the access log was not readable in 45 seconds." >&2
  echo "        A hiccup on the ssh connection, not a finding about the service." >&2
  exit 2
fi

fehler=0

echo "Who that indexes the web has been here"
echo

python3 - "$log" <<'PY'
import collections, datetime, json, re, sys

# Named rather than pattern-matched on "bot", because half the scanners on this log call themselves
# a bot and none of them index anything.
NAMEN = ("googlebot|bingbot|duckduckbot|yandex|baiduspider|slurp|applebot|ahrefsbot|semrushbot|"
         "mj12bot|dotbot|petalbot|gptbot|oai-searchbot|chatgpt-user|claudebot|claude-web|ccbot|"
         "perplexitybot|amazonbot|bytespider|facebookexternalhit|twitterbot|linkedinbot|"
         "telegrambot|discordbot|slackbot|whatsapp|redditbot|pinterest")

treffer = collections.Counter()
erste, letzte = {}, {}
zeilen = 0
frueheste = None
for roh in open(sys.argv[1]):
    roh = roh.strip()
    if not roh.startswith("{"):
        continue
    try:
        z = json.loads(roh)
    except ValueError:
        continue
    zeilen += 1
    at = datetime.datetime.fromtimestamp(z["ts"], datetime.timezone.utc)
    if frueheste is None or at < frueheste:
        frueheste = at
    ua = (z.get("request", {}).get("headers", {}).get("User-Agent") or ["-"])[0]
    m = re.search(NAMEN, ua, re.I)
    if not m:
        continue
    name = m.group(0).lower()
    treffer[name] += 1
    if name not in erste or at < erste[name]:
        erste[name] = at
    letzte[name] = max(letzte.get(name, at), at)

alter = datetime.datetime.now(datetime.timezone.utc) - frueheste if frueheste else None
tage = alter.days + alter.seconds / 86400 if alter else 0
print(f"  log covers {zeilen:,} requests over {tage:.1f} days, from {frueheste:%Y-%m-%d %H:%M} UTC")
print()
if treffer:
    print("  FIRST CRAWLER: something that indexes the web has found this service.")
    for name, n in treffer.most_common():
        print(f"    {name:22s} {n:5d} request(s), first {erste[name]:%m-%d %H:%M}, last {letzte[name]:%m-%d %H:%M} UTC")
else:
    print(f"  Nothing. Not one crawler, preview bot or AI crawler in {tage:.1f} days.")
    print("  A crawler arrives by following a link, and every public link to this service sits in")
    print("  GitHub user content, which is rel=nofollow and passes no crawl signal. Until something")
    print("  links it from a page that is crawled, this number stays at zero however good the page is.")
PY

echo
echo "-- Our side of it --"
robots=$(curl -s -m 10 "$BASE/robots.txt" || true)
if printf '%s' "$robots" | grep -qi "^Allow: /" && printf '%s' "$robots" | grep -qi "^Sitemap: "; then
  echo "  ok      robots.txt allows everything and names the sitemap"
else
  echo "  FAILED  robots.txt does not allow crawling or does not name the sitemap:"
  printf '%s\n' "$robots" | sed 's/^/          /'
  fehler=1
fi

karte=$(curl -s -m 10 "$BASE/sitemap.xml" || true)
urls=$(printf '%s' "$karte" | grep -o '<loc>[^<]*</loc>' | sed 's/<[^>]*>//g' || true)
anzahl=$(printf '%s\n' "$urls" | grep -c . || true)
if (( anzahl == 0 )); then
  echo "  FAILED  sitemap.xml lists no URL at all"
  fehler=1
else
  schlecht=0
  while read -r u; do
    [[ -z "$u" ]] && continue
    code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$u")
    [[ "$code" == "200" ]] || { echo "  FAILED  $u answers $code and is in the sitemap"; schlecht=1; }
  done <<< "$urls"
  (( schlecht )) && fehler=1
  (( schlecht )) || echo "  ok      all $anzahl page(s) in the sitemap answer 200"
fi

# A page that forbids indexing cannot be indexed, however many crawlers come.
if curl -s -m 10 -D - -o /dev/null "$BASE/" | grep -qi "^x-robots-tag:.*noindex"; then
  echo "  FAILED  the landing page sends X-Robots-Tag: noindex"
  fehler=1
elif curl -s -m 10 "$BASE/" | grep -qi '<meta[^>]*name="robots"[^>]*noindex'; then
  echo "  FAILED  the landing page carries a noindex meta tag"
  fehler=1
else
  echo "  ok      nothing on the landing page forbids indexing"
fi

echo
if (( fehler )); then
  echo "VISIBILITY FAILED: something on our side keeps crawlers out."
  exit 1
fi
echo "VISIBILITY OK on our side. What is missing is a link from a page that gets crawled,"
echo "and that is a decision about posting, not a change to this repository."
