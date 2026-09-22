#!/usr/bin/env bash
# How far down the landing page do people actually get?
#
# `ops/traffic.sh` has reported "0 of N who opened the page went on to a second one" for days, with
# the honest footnote that anchor links leave no log line. Since the rebuild the only in-page
# navigation is anchors, so that number cannot tell a reader who went through the whole page and
# left from somebody who bounced at the fold, and those two call for opposite work.
#
# Four one-pixel images carry the answer, `loading="lazy"` and no script, because the CSP pins the
# one inline script by hash. A browser defers a lazy image until it comes near the viewport, so a
# request for /px/close.png is somebody who reached the last screen.
#
# Exit 0: a reading, or an empty window that two measures agree on.
# Exit 1: browsers were here and the mechanism did not fire. That is a finding about this repo.
# Exit 2: could not tell (log unreadable, or a constant that contradicts itself).
#
#   ops/depth.sh          last 24 hours
#   ops/depth.sh 72       last 72 hours
#
# Both directions, against two planted logs that ship with this script:
#
#   CP_DEPTH_LOG=ops/fixtures/depth-reader-and-renderer.log ops/depth.sh 24
#       one reader whose four pixels are spread over forty seconds and one renderer whose four
#       arrive inside a fifth of a second. Must count the reader and print "not a reader: 1".
#   CP_DEPTH_LOG=ops/fixtures/depth-renderers-only.log ops/depth.sh 24
#       two renderers, one of which stops after three pixels. Must print WORTHLESS and no table.
#
# `/px/top.png` is the control. It sits in the first screen and is lazy like the rest, so a browser
# that just fetches every lazy image at once fires it together with the others. When top and close
# arrive within a second of each other for everybody, this says the signal is worthless rather than
# reporting a scroll that never happened.
set -euo pipefail

# When the pixels went live. Page loads before this could never have fetched one, and counting
# them in the denominator is the mistake this repo keeps finding elsewhere: a population that could
# not have produced the signal, sitting under the number anyway. The first reading would have said
# "1 of 11, 9 per cent" for what is really 1 of 1.
#
# A constant, and it checks itself in both directions: a /px/ request from before it means it is
# set too late, and a value in the future means somebody typed the local clock. The second half was
# missing on the first day and the first value was exactly that mistake, CEST written as UTC, two
# hours and forty minutes ahead, so the script would have discarded every real reader in silence
# until the clock caught up. `ops/deploy-window.sh` exists because of the same trap; the lesson
# there was to take the time from the machine, and this took it from my head.
SINCE_UTC="${CP_PIXELS_SINCE:-2026-09-22T10:07:23Z}"

HOURS="${1:-24}"
KEY="${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}"
HOST="${CP_HOST:-root@76.13.144.207}"
# Not built here: this line and the two traffic scripts got it wrong the same way, so it lives in
# one place now and keeps a written history of every address this machine has had.
source "$(dirname "$0")/own-ips.sh"
OWN=$(eigene_ips)

# A log from a file instead of from the VM, so the counting can be shown to work rather than
# assumed to. A filter that throws everything away prints exactly what an empty log prints, and on
# 2026-09-22 this script had to be proved in both directions: the real log says nobody, and a
# planted browser reader in a file has to come out the other end as one.
log=$(mktemp); trap 'rm -f "$log"' EXIT
if [[ -n "${CP_DEPTH_LOG:-}" ]]; then
  cp "${CP_DEPTH_LOG}" "$log"
  echo "(log from ${CP_DEPTH_LOG}, not from the VM)" >&2
else
# gzip on the far side: the log is 20 MB and plain cat runs into the timeout. See ops/traffic.sh.
if ! timeout 45 ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=5 "$HOST" \
  'docker exec deploy-caddy-1 cat /var/log/caddy/access.log | gzip -c' 2>/dev/null | gunzip > "$log"; then
  echo "COULD NOT TELL: the access log was not readable in 45 seconds." >&2
  echo "        A hiccup on the ssh connection, not a finding about the page. Run it again." >&2
  exit 2
fi
fi

python3 - "$HOURS" "$OWN" "$log" "$SINCE_UTC" <<'PY'
import datetime, json, sys, collections

hours, own_raw, path, pixels_since = int(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4]
own = set(own_raw.split())
window = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=hours)
live = datetime.datetime.fromisoformat(pixels_since.replace("Z", "+00:00"))
now = datetime.datetime.now(datetime.timezone.utc)
if live > now:
    print(f"COULD NOT TELL: SINCE_UTC is {live:%Y-%m-%d %H:%M} UTC, which is in the future.")
    print(f"                It is {now:%Y-%m-%d %H:%M} UTC now. A go-live that has not happened")
    print("                discards every reader, silently. Somebody typed a local clock.")
    raise SystemExit(2)
# The later of the two: a page load has to be inside the asked-for window AND after the pixels
# existed, or it is in a denominator it cannot belong to.
since = max(window, live)

MARKS = ["top", "proof", "market", "close", "end"]
WHAT = {
    "top": "the first screen (control)",
    "proof": "past the proof section",
    "market": "past the live market",
    "close": "past the agents section",
    "end": "the last screen, with the buttons",
}

# Per address: when the page was loaded, and when each pixel came back.
page_loads = collections.defaultdict(list)
pixel = collections.defaultdict(lambda: collections.defaultdict(list))
not_a_browser = collections.Counter()
favicon = {}
earliest_px = None
for raw in open(path):
    raw = raw.strip()
    if not raw.startswith("{"):
        continue
    try:
        entry = json.loads(raw)
    except ValueError:
        continue
    at = datetime.datetime.fromtimestamp(entry["ts"], datetime.timezone.utc)
    r = entry.get("request", {})
    ip = r.get("remote_ip")
    if ip in own or entry.get("status") != 200:
        continue
    # A depth measurement needs a browser: lazy loading is what makes a pixel mean anything, and
    # curl, wget and our own checker fetch what they are told to and nothing else. On 2026-09-22
    # this script counted a `curl -o /dev/null` verification of the pixel route, run by me one
    # second after the deploy, as a reader who had seen the first screen. Anything that does not
    # claim to be a browser cannot produce a scroll event, so it is not in the numerator and not
    # in the denominator either.
    uri = (r.get("uri") or "").split("?")[0]
    # A second witness, and the only one that can tell the two failures apart.
    #
    # Zero control pixels means either nobody came or lazy loading never fires, and this script
    # cannot tell which: both print the same line. /favicon.ico is fetched by the browser itself,
    # with no javascript, no lazy loading and nothing of ours involved. If it arrives while the
    # control pixel does not, the mechanism is broken. If neither arrives, nobody was here.
    #
    # A floor and not a count: a browser fetches the icon once and caches it, so a returning
    # reader is invisible here.
    if uri == "/favicon.ico":
        ua_icon = (r.get("headers", {}).get("User-Agent") or [""])[0]
        if "Mozilla/" in ua_icon and at >= since:
            favicon[ip] = at
        continue
    if uri != "/" and not (uri.startswith("/px/") and uri.endswith(".png")):
        continue
    ua = (r.get("headers", {}).get("User-Agent") or [""])[0]
    if "Mozilla/" not in ua:
        not_a_browser[ua.split()[0] if ua else "(none)"] += 1
        continue
    if uri.startswith("/px/") and uri.endswith(".png"):
        if earliest_px is None or at < earliest_px:
            earliest_px = at
    if at < since:
        continue
    if uri == "/":
        page_loads[ip].append(at)
    elif uri.startswith("/px/") and uri.endswith(".png"):
        pixel[ip][uri[4:-4]].append(at)

# The constant checks itself. A pixel fetched before the moment we say they went live means the
# moment is wrong, and every count under it would be drawn from the wrong window.
earliest = earliest_px
if earliest is not None and earliest < live:
    print(f"COULD NOT TELL: a pixel was fetched at {earliest:%Y-%m-%d %H:%M:%S} UTC, before the")
    print(f"                {live:%Y-%m-%d %H:%M} UTC this script calls the go-live. The constant")
    print("                SINCE_UTC is wrong, so the denominator would be too. Fix it first.")
    raise SystemExit(2)

print(f"How far down the landing page people got, last {hours} hours")
print(f"  counting page loads from {since:%Y-%m-%d %H:%M} UTC, when the pixels went live")
print()
if not_a_browser:
    agents = ", ".join(f"{k} {n}x" for k, n in not_a_browser.most_common(4))
    print(f"  not counted, no browser: {agents}")
if not page_loads:
    print()
    if favicon:
        print(f"  BROKEN: {len(favicon)} browser(s) fetched /favicon.ico in this window and not one")
        print("          fetched the control pixel. The icon needs no javascript and no lazy")
        print("          loading, so somebody was here and the depth mechanism did not fire.")
        for ip, at in sorted(favicon.items(), key=lambda x: x[1]):
            print(f"          {at:%m-%d %H:%M} {ip}")
        raise SystemExit(1)
    print("  Nobody from outside loaded the page in this window, by two independent measures:")
    print("  no control pixel and no /favicon.ico from a browser. Nothing to say about depth,")
    print("  and nothing that says the mechanism is broken either.")
    raise SystemExit(0)

# The control first: without it none of the rest means anything.
#
# An address whose top and bottom pixel arrive within a second of each other did not scroll. That
# is a renderer with a viewport tall enough to hold the whole page, so every lazy image fires at
# load. It is not a reader and it must not sit in the numerator of "reached the last screen".
#
# The threshold is measured, not chosen. The Swiss visitor on 2026-09-22 fetched top at 18:03:49
# and proof at 18:04:11, twenty-two seconds apart, which is what scrolling a long page looks like.
# Three addresses out of Google Cloud that afternoon (34.116.225.162, .146.142, .210.128, all with
# an iPhone user agent) fetched all four inside a single second.
#
# Until this run the check existed but only fired when EVERY address did it, so a window with two
# renderers and one human printed "the last screen 2 of 3, 67%" and read like two thirds of
# visitors finishing the page. Off by the entire finding.
AT_ONCE_SECONDS = 1.0
AT_ONCE_MARKS = 3
def took_everything_at_once(ip):
    # Across every mark, not only top and close. A renderer that stops before the last pixel would
    # otherwise pass as a reader who got three quarters of the way down, which is the same error
    # one notch quieter. Three marks inside a second is the test: two can be a fast scroll over
    # marks that sit close together, three cannot.
    stamps = [min(v) for v in pixel[ip].values() if v]
    if len(stamps) < AT_ONCE_MARKS:
        return False
    return (max(stamps) - min(stamps)).total_seconds() < AT_ONCE_SECONDS

renderers = {ip for ip in page_loads if took_everything_at_once(ip)}
at_once = len(renderers)
readers = {ip: times for ip, times in page_loads.items() if ip not in renderers}
with_control = sum(1 for ip in page_loads if pixel[ip].get("top"))

loads = sum(len(v) for v in page_loads.values())
print(f"  page loads from outside: {loads} by {len(page_loads)} address(es)")
print(f"  fetched the control pixel: {with_control}")
if with_control == 0 and favicon:
    print()
    print(f"  BROKEN: {len(favicon)} browser(s) fetched /favicon.ico in this window and not one")
    print("          fetched the control pixel. The icon needs no javascript and no lazy loading,")
    print("          so this is not an empty window: the depth mechanism did not fire.")
    for ip, at in sorted(favicon.items(), key=lambda x: x[1]):
        print(f"          {at:%m-%d %H:%M} {ip}")
    raise SystemExit(1)
if with_control == 0:
    print()
    print("  NOT MEASURING: no reader fetched the control either, so nothing here is a scroll.")
    print("                 No /favicon.ico from a browser either, so the likely reason is that")
    print("                 nobody was here rather than that lazy loading is off. A browser that")
    print("                 already has the icon cached would show up in neither, so check with")
    print("                 a fresh one before reading anything below.")
elif at_once:
    print(f"  not a reader, fetched every pixel at once: {at_once}")
if with_control == 0:
    raise SystemExit(0)
if at_once and not readers:
    print()
    print(f"  WORTHLESS: all {at_once} of them fetched three or more pixels inside one second,")
    print("             which is a renderer taking every lazy image at load and not a reader")
    print("             scrolling. Nothing here is a scroll, so there is no table.")
    raise SystemExit(0)
print()
for mark in MARKS:
    who = [ip for ip in readers if pixel[ip].get(mark)]
    share = f"{len(who) / len(readers) * 100:.0f}%" if readers else "-"
    print(f"  {WHAT[mark]:<34} {len(who):>3} of {len(readers)}  {share}")
print()
print("  A lazy image is fetched when it comes near the viewport, which is close to being read and")
print("  is not the same thing. This is a floor for attention, never a proof of it.")
PY
