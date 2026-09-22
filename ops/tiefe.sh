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
# Exit 0: a reading, or an empty window that two measures agree on.
# Exit 1: browsers were here and the mechanism did not fire. That is a finding about this repo.
# Exit 2: could not tell (log unreadable, or a constant that contradicts itself).
#
#   ops/tiefe.sh          last 24 hours
#   ops/tiefe.sh 72       last 72 hours
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
SEIT_UTC="${CP_PIXEL_SEIT:-2026-09-22T10:07:23Z}"

HOURS="${1:-24}"
KEY="${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}"
HOST="${CP_HOST:-root@76.13.144.207}"
# Not built here: this line and the two traffic scripts got it wrong the same way, so it lives in
# one place now and keeps a written history of every address this machine has had.
source "$(dirname "$0")/eigene-ips.sh"
OWN=$(eigene_ips)

# A log from a file instead of from the VM, so the counting can be shown to work rather than
# assumed to. A filter that throws everything away prints exactly what an empty log prints, and on
# 2026-09-22 this script had to be proved in both directions: the real log says nobody, and a
# planted browser reader in a file has to come out the other end as one.
log=$(mktemp); trap 'rm -f "$log"' EXIT
if [[ -n "${CP_TIEFE_LOG:-}" ]]; then
  cp "${CP_TIEFE_LOG}" "$log"
  echo "(log from ${CP_TIEFE_LOG}, not from the VM)" >&2
else
# gzip on the far side: the log is 20 MB and plain cat runs into the timeout. See ops/verkehr.sh.
if ! timeout 45 ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=5 "$HOST" \
  'docker exec deploy-caddy-1 cat /var/log/caddy/access.log | gzip -c' 2>/dev/null | gunzip > "$log"; then
  echo "COULD NOT TELL: the access log was not readable in 45 seconds." >&2
  echo "        A hiccup on the ssh connection, not a finding about the page. Run it again." >&2
  exit 2
fi
fi

python3 - "$HOURS" "$OWN" "$log" "$SEIT_UTC" <<'PY'
import datetime, json, sys, collections

hours, own_raw, path, pixel_seit = int(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4]
own = set(own_raw.split())
fenster = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=hours)
live = datetime.datetime.fromisoformat(pixel_seit.replace("Z", "+00:00"))
jetzt = datetime.datetime.now(datetime.timezone.utc)
if live > jetzt:
    print(f"COULD NOT TELL: SEIT_UTC is {live:%Y-%m-%d %H:%M} UTC, which is in the future.")
    print(f"                It is {jetzt:%Y-%m-%d %H:%M} UTC now. A go-live that has not happened")
    print("                discards every reader, silently. Somebody typed a local clock.")
    raise SystemExit(2)
# The later of the two: a page load has to be inside the asked-for window AND after the pixels
# existed, or it is in a denominator it cannot belong to.
seit = max(fenster, live)

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
nicht_browser = collections.Counter()
favicon = {}
frueheste_px = None
for roh in open(path):
    roh = roh.strip()
    if not roh.startswith("{"):
        continue
    try:
        z = json.loads(roh)
    except ValueError:
        continue
    at = datetime.datetime.fromtimestamp(z["ts"], datetime.timezone.utc)
    r = z.get("request", {})
    ip = r.get("remote_ip")
    if ip in own or z.get("status") != 200:
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
        ua_f = (r.get("headers", {}).get("User-Agent") or [""])[0]
        if "Mozilla/" in ua_f and at >= seit:
            favicon[ip] = at
        continue
    if uri != "/" and not (uri.startswith("/px/") and uri.endswith(".png")):
        continue
    ua = (r.get("headers", {}).get("User-Agent") or [""])[0]
    if "Mozilla/" not in ua:
        nicht_browser[ua.split()[0] if ua else "(none)"] += 1
        continue
    if uri.startswith("/px/") and uri.endswith(".png"):
        if frueheste_px is None or at < frueheste_px:
            frueheste_px = at
    if at < seit:
        continue
    if uri == "/":
        seiten[ip].append(at)
    elif uri.startswith("/px/") and uri.endswith(".png"):
        pixel[ip][uri[4:-4]].append(at)

# The constant checks itself. A pixel fetched before the moment we say they went live means the
# moment is wrong, and every count under it would be drawn from the wrong window.
frueheste = frueheste_px
if frueheste is not None and frueheste < live:
    print(f"COULD NOT TELL: a pixel was fetched at {frueheste:%Y-%m-%d %H:%M:%S} UTC, before the")
    print(f"                {live:%Y-%m-%d %H:%M} UTC this script calls the go-live. The constant")
    print("                SEIT_UTC is wrong, so the denominator would be too. Fix it first.")
    raise SystemExit(2)

print(f"How far down the landing page people got, last {hours} hours")
print(f"  counting page loads from {seit:%Y-%m-%d %H:%M} UTC, when the pixels went live")
print()
if nicht_browser:
    wer = ", ".join(f"{k} {n}x" for k, n in nicht_browser.most_common(4))
    print(f"  not counted, no browser: {wer}")
if not seiten:
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
zusammen = 0
for ip, laden in seiten.items():
    oben, unten = pixel[ip].get("top"), pixel[ip].get("close")
    if oben and unten and abs((min(unten) - min(oben)).total_seconds()) < 1.0:
        zusammen += 1
mit_top = sum(1 for ip in seiten if pixel[ip].get("top"))

ladungen = sum(len(v) for v in seiten.values())
print(f"  page loads from outside: {ladungen} by {len(seiten)} address(es)")
print(f"  fetched the control pixel: {mit_top}")
if mit_top == 0 and favicon:
    print()
    print(f"  BROKEN: {len(favicon)} browser(s) fetched /favicon.ico in this window and not one")
    print("          fetched the control pixel. The icon needs no javascript and no lazy loading,")
    print("          so this is not an empty window: the depth mechanism did not fire.")
    for ip, at in sorted(favicon.items(), key=lambda x: x[1]):
        print(f"          {at:%m-%d %H:%M} {ip}")
    raise SystemExit(1)
if mit_top == 0:
    print()
    print("  NOT MEASURING: no reader fetched the control either, so nothing here is a scroll.")
    print("                 No /favicon.ico from a browser either, so the likely reason is that")
    print("                 nobody was here rather than that lazy loading is off. A browser that")
    print("                 already has the icon cached would show up in neither, so check with")
    print("                 a fresh one before reading anything below.")
elif zusammen and zusammen == mit_top:
    print()
    print(f"  WORTHLESS: for all {zusammen} of them the top and bottom pixels arrived within a")
    print("             second of each other, which is a browser fetching every lazy image at once")
    print("             and not a reader scrolling. The numbers below mean nothing today.")
if mit_top == 0:
    raise SystemExit(0)
print()
for marke in MARKEN:
    wer = [ip for ip in seiten if pixel[ip].get(marke)]
    anteil = f"{len(wer) / len(seiten) * 100:.0f}%" if seiten else "-"
    print(f"  {WAS[marke]:<28} {len(wer):>3} of {len(seiten)}  {anteil}")
print()
print("  A lazy image is fetched when it comes near the viewport, which is close to being read and")
print("  is not the same thing. This is a floor for attention, never a proof of it.")
PY
