#!/usr/bin/env bash
# How far down the landing page do people actually get?
#
# `ops/verkehr.sh` has reported "0 of N who opened the page went on to a second one" for days, with
# the honest footnote that anchor links leave no log line. Since the rebuild the only in-page
# navigation is anchors, so that number cannot tell a reader who went through the whole page and
# left from somebody who bounced at the fold, and those two call for opposite work.
#
# Four one-pixel images carry the answer, `loading="lazy"` and no script, because the CSP pins the
# one inline script by hash. A browser defers a lazy image until it comes near the viewport, so a
# request for /px/close.png is somebody who reached the last screen.
#
#   ops/tiefe.sh          last 24 hours
#   ops/tiefe.sh 72       last 72 hours
#
# `/px/top.png` is the control. It sits in the first screen and is lazy like the rest, so a browser
# that just fetches every lazy image at once fires it together with the others. When top and close
# arrive within a second of each other for everybody, this says the signal is worthless rather than
# reporting a scroll that never happened.
set -euo pipefail

HOURS="${1:-24}"
KEY="${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}"
HOST="${CP_HOST:-root@76.13.144.207}"
OWN="${CP_OWN_IPS:-82.194.125.90 76.13.144.207 35.242.237.124}"
lebend=$(timeout 15 ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=8 "$HOST" 'echo "$SSH_CLIENT"' 2>/dev/null | awk '{print $1}' || true)
[[ -n "$lebend" ]] && OWN="$OWN $lebend"

log=$(mktemp); trap 'rm -f "$log"' EXIT
# gzip on the far side: the log is 20 MB and plain cat runs into the timeout. See ops/verkehr.sh.
if ! timeout 45 ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=5 "$HOST" \
  'docker exec deploy-caddy-1 cat /var/log/caddy/access.log | gzip -c' 2>/dev/null | gunzip > "$log"; then
  echo "COULD NOT TELL: the access log was not readable in 45 seconds." >&2
  echo "        A hiccup on the ssh connection, not a finding about the page. Run it again." >&2
  exit 2
fi

python3 - "$HOURS" "$OWN" "$log" <<'PY'
import datetime, json, sys, collections

hours, own_raw, path = int(sys.argv[1]), sys.argv[2], sys.argv[3]
own = set(own_raw.split())
seit = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=hours)

MARKEN = ["top", "proof", "market", "close"]
WAS = {
    "top": "the first screen (control)",
    "proof": "past the proof section",
    "market": "past the live market",
    "close": "the last screen",
}

# Per address: when the page was loaded, and when each pixel came back.
seiten = collections.defaultdict(list)
pixel = collections.defaultdict(lambda: collections.defaultdict(list))
for roh in open(path):
    roh = roh.strip()
    if not roh.startswith("{"):
        continue
    try:
        z = json.loads(roh)
    except ValueError:
        continue
    at = datetime.datetime.fromtimestamp(z["ts"], datetime.timezone.utc)
    if at < seit:
        continue
    r = z.get("request", {})
    ip = r.get("remote_ip")
    if ip in own or z.get("status") != 200:
        continue
    uri = (r.get("uri") or "").split("?")[0]
    if uri == "/":
        seiten[ip].append(at)
    elif uri.startswith("/px/") and uri.endswith(".png"):
        pixel[ip][uri[4:-4]].append(at)

print(f"How far down the landing page people got, last {hours} hours")
print()
if not seiten:
    print("  Nobody from outside loaded the page in this window. Nothing to say about depth.")
    raise SystemExit(0)

# The control first: without it none of the rest means anything.
zusammen = 0
for ip, laden in seiten.items():
    oben, unten = pixel[ip].get("top"), pixel[ip].get("close")
    if oben and unten and abs((min(unten) - min(oben)).total_seconds()) < 1.0:
        zusammen += 1
mit_top = sum(1 for ip in seiten if pixel[ip].get("top"))

print(f"  page loads from outside: {len(seiten)} by {len(seiten)} address(es)")
print(f"  fetched the control pixel: {mit_top}")
if mit_top == 0:
    print()
    print("  NOT MEASURING: no reader fetched the control either, so nothing here is a scroll.")
    print("                 Either no browser has seen the page since the pixels went in, or lazy")
    print("                 loading is off. Check with a browser before reading anything below.")
elif zusammen and zusammen == mit_top:
    print()
    print(f"  WORTHLESS: for all {zusammen} of them the top and bottom pixels arrived within a")
    print("             second of each other, which is a browser fetching every lazy image at once")
    print("             and not a reader scrolling. The numbers below mean nothing today.")
print()
for marke in MARKEN:
    wer = [ip for ip in seiten if pixel[ip].get(marke)]
    anteil = f"{len(wer) / len(seiten) * 100:.0f}%" if seiten else "-"
    print(f"  {WAS[marke]:<28} {len(wer):>3} of {len(seiten)}  {anteil}")
print()
print("  A lazy image is fetched when it comes near the viewport, which is close to being read and")
print("  is not the same thing. This is a floor for attention, never a proof of it.")
PY
