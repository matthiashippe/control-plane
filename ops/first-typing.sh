#!/usr/bin/env bash
# Did a stranger type their own text into the box?
#
# The one number of the week of 24.09.2026, and it is deliberately not money and not visits.
# Money cannot happen this week: a buyer still needs a card and that waits on a Stripe account.
# Visits are worthless as a signal here: 16 of the 46 addresses on 22./23.09. were a fetcher fleet
# arriving within three minutes of a link going out, and a fetcher does not type forty words.
#
# Typing is the first act in this funnel that costs effort, that no machine fakes, and that needs
# neither wallet nor card nor Stripe.
#
#   ops/first-typing.sh              the last 7 days
#   ops/first-typing.sh 1            today
#   ops/first-typing.sh --selftest   plant every case and check each is sorted correctly
#
# **Nothing new is stored for this.** The count comes out of Caddy's access log, which already
# records the URI, and deploy/Caddyfile deletes `brief` from it before the line is written. The
# marks that make the count possible ride in the URL: `via=form` from the hidden field in the box,
# `src=ex1`/`ex2` on our two example links, `src=<channel>` from a printed card or a message. So
# the page's promise that nothing is stored stays true word for word, which matters more than the
# number, because the promise is what makes somebody paste real work.
set -uo pipefail

DAYS="${1:-7}"
KEY="${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}"
HOST="${CP_HOST:-root@76.13.144.207}"
DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ "${1:-}" == "--selftest" ]]; then
  # Six planted lines, one per case, and the script has to sort each into the right bucket. A
  # counter that cannot be shown a planted hit is a counter that measures nothing.
  log=$(mktemp)
  now=$(date -u +%s)
  {
    printf '{"ts":%s,"request":{"remote_ip":"9.9.9.1","uri":"/check?via=form&kind=factual"},"status":200}\n' "$now"
    # Two hours later: a return. And one minute later: the same person pressing the button twice,
    # which must NOT read as coming back, or every double-click inflates the one number of the week.
    printf '{"ts":%s,"request":{"remote_ip":"9.9.9.1","uri":"/check?via=form&kind=factual"},"status":200}\n' "$((now + 7200))"
    printf '{"ts":%s,"request":{"remote_ip":"9.9.9.3","uri":"/check?src=nit&via=form"},"status":200}\n' "$((now + 60))"
    printf '{"ts":%s,"request":{"remote_ip":"9.9.9.2","uri":"/check?src=ex1&kind=factual"},"status":200}\n' "$now"
    printf '{"ts":%s,"request":{"remote_ip":"9.9.9.3","uri":"/check?src=nit&via=form"},"status":200}\n' "$now"
    printf '{"ts":%s,"request":{"remote_ip":"9.9.9.4","uri":"/b?src=nit"},"status":302}\n' "$now"
    printf '{"ts":%s,"request":{"remote_ip":"9.9.9.5","uri":"/check"},"status":200}\n' "$now"
  } > "$log"
  out=$(CP_TYPING_LOG="$log" CP_TYPING_OWN=" " "$DIR/first-typing.sh" 30 2>&1)
  echo "$out"
  fails=0
  check() { grep -qE "$1" <<<"$out" || { echo "  FAIL expected /$1/"; fails=1; }; }
  check "typed their own text: *4"          # two runs from .1, two from .3
  check "people who typed: *2"              # .1 and .3, counted once each
  check "came back: *1"                     # .1 came back after two hours; .3 double-clicked
  check "clicked an example: *1"            # .2
  check "scanned a card: *1"                # .4
  check "nit"                               # the channel is named
  [[ $fails -eq 0 ]] && echo "selftest passed" || echo "selftest FAILED"
  rm -f "$log"
  exit $fails
fi

source "$DIR/own-ips.sh"
OWN="${CP_TYPING_OWN-$(own_ips)}"

log="${CP_TYPING_LOG:-}"
if [[ -z "$log" ]]; then
  log=$(mktemp); trap 'rm -f "$log"' EXIT
  if ! timeout 60 ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=5 "$HOST" \
    'docker exec deploy-caddy-1 cat /var/log/caddy/access.log | gzip -c' 2>/dev/null | gunzip > "$log"; then
    echo "COULD NOT TELL: the access log was not readable. Not a finding about the week." >&2
    exit 2
  fi
fi

python3 - "$log" "$DAYS" "$OWN" <<'PY'
import datetime, json, sys
from collections import defaultdict
from urllib.parse import urlparse, parse_qs

path, days, own_raw = sys.argv[1:4]
own = set(own_raw.split())
since = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=int(days))

typed = defaultdict(list)     # address -> timestamps of its own-text runs
examples, cards = set(), defaultdict(set)
channels = defaultdict(set)

for raw in open(path):
    raw = raw.strip()
    if not raw.startswith("{"):
        continue
    try:
        row = json.loads(raw)
    except ValueError:
        continue
    at = datetime.datetime.fromtimestamp(row["ts"], datetime.timezone.utc)
    if at < since:
        continue
    req = row.get("request", {})
    ip = req.get("remote_ip")
    if ip in own:
        continue
    parsed = urlparse(req.get("uri", ""))
    q = parse_qs(parsed.query)
    src = (q.get("src") or [""])[0]
    if parsed.path == "/b":
        cards[src or "(none)"].add(ip)
        continue
    if parsed.path != "/check":
        continue
    # An example click and a typed draft are told apart by the marks and by nothing else. A run
    # carrying src=ex1 or ex2 came from our own link; `via=form` came from the box.
    if src.startswith("ex"):
        examples.add(ip)
        continue
    if (q.get("via") or [""])[0] == "form":
        typed[ip].append(at)
        if src:
            channels[src].add(ip)

runs = sum(len(v) for v in typed.values())
# "Came back" is the only figure here that separates a favour from a need: somebody does a favour
# once. 72 hours, and unasked, which the log cannot prove -- it can only show nobody was written to
# in between, and that is a question for the tally sheet, not for this script.
returning = sum(1 for v in typed.values() if len(v) > 1 and (max(v) - min(v)) > datetime.timedelta(minutes=10))

print(f"last {days} day(s), everything from our own addresses removed")
print()
print(f"  typed their own text:  {runs} run(s)")
print(f"  people who typed:      {len(typed)}")
print(f"  came back:             {returning}  (typed twice, more than ten minutes apart)")
print(f"  clicked an example:    {len(examples)}")
print(f"  scanned a card:        {sum(len(v) for v in cards.values())}")
for src, ips in sorted(cards.items()):
    print(f"      {src}: {len(ips)} address(es)")
if channels:
    print()
    print("  typed, by channel:")
    for src, ips in sorted(channels.items()):
        print(f"      {src}: {len(ips)} person(s)")
print()
if runs == 0:
    print("NOBODY TYPED.  That is the honest reading and it is not the same as nobody came: a")
    print("               visit costs nothing and proves nothing. Read it next to the tally sheet")
    print("               of conversations, because 0 out of 20 means the hook is wrong and 0 out")
    print("               of 4 means the channel never happened.")
PY
