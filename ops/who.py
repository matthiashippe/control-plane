"""One address, everything the log holds about it.

Reads Caddy JSON on stdin. Prints, in this order: what it asked for, what came with the first
request, whether it behaved like a browser, and whether it read anything.
"""
import sys, os, json, socket, datetime, collections

IP = os.environ.get("CP_WHO_IP", "")

# The engines that publish a way to verify themselves, and the domains their hosts live under.
ENGINES = {
    "googlebot": (".googlebot.com", ".google.com"),
    "bingbot": (".search.msn.com",),
    "duckduckbot": (".duckduckgo.com",),
    "applebot": (".applebot.apple.com",),
}

rows = []
for line in sys.stdin:
    try:
        e = json.loads(line)
    except Exception:
        continue
    r = e.get("request", {})
    if r.get("remote_ip") != IP:
        continue
    rows.append(e)

if not rows:
    print("%s: not in the log at all." % IP)
    raise SystemExit(0)

rows.sort(key=lambda e: e.get("ts", 0))
first, last = rows[0], rows[-1]
t0 = datetime.datetime.fromtimestamp(first.get("ts", 0), datetime.timezone.utc)
t1 = datetime.datetime.fromtimestamp(last.get("ts", 0), datetime.timezone.utc)
days = len({datetime.datetime.fromtimestamp(e.get("ts", 0), datetime.timezone.utc).date() for e in rows})

print("%s" % IP)
print("  %d request(s) over %d day(s), %s to %s UTC" % (
    len(rows), days, t0.strftime("%m-%d %H:%M:%S"), t1.strftime("%m-%d %H:%M:%S")))
print()

h0 = first.get("request", {}).get("headers", {})
def head(hs, name):
    v = hs.get(name)
    return v[0] if v else ""

print("-- the first request, which is where the referrer is --")
print("  %s %s -> %s" % (first.get("request", {}).get("method", ""),
                         first.get("request", {}).get("uri", ""), first.get("status")))
ref = head(h0, "Referer")
print("  referrer:        %s" % (ref if ref else "none (typed, a bookmark, or stripped)"))
print("  user agent:      %s" % head(h0, "User-Agent")[:96])
print()

# Crawler verification first, because a user agent claiming Googlebot is worth exactly nothing
# and because the header reading below would otherwise be the first thing a reader sees about a
# crawler. Googlebot sends one of the three and none of the other two, which reads as "privacy
# tools strip them" when the truth is that it is not a browser at all and says so in DNS.
low = head(h0, "User-Agent").lower()
claimed = next((n for n in ENGINES if n in low), None)
if claimed:
    print("-- it claims to be %s, so ask DNS --" % claimed)
    try:
        host = socket.gethostbyaddr(IP)[0]
        under = any(host.endswith(s) for s in ENGINES[claimed])
        back = socket.gethostbyname_ex(host)[2] if under else []
        if under and IP in back:
            print("  VERIFIED  %s resolves to %s and back." % (IP, host))
        elif under:
            print("  FAKE      %s resolves to %s, which does not resolve back to it." % (IP, host))
        else:
            print("  FAKE      reverse DNS is %s, not a host of that engine." % host)
    except Exception as exc:
        print("  FAKE      no usable reverse DNS (%s)." % type(exc).__name__)
    print()

print("-- did it send what a browser sends? --")
accept = head(h0, "Accept")
lang = head(h0, "Accept-Language")
sec = head(h0, "Sec-Fetch-Dest")
asks_html = "text/html" in accept
checks = [
    ("Accept asks for text/html", asks_html, accept[:46] or "(none)"),
    ("Accept-Language is set", bool(lang), lang[:46] or "(none)"),
    ("Sec-Fetch-Dest is document", sec == "document", sec or "(none)"),
]
for name, ok, value in checks:
    print("  %-28s %-3s  %s" % (name, "yes" if ok else "NO", value))
score = sum(1 for _, ok, _ in checks if ok)
print()
if score == 0:
    print("  NOT A BROWSER. None of the three. Any browser sends all of them on a navigation,")
    print("  so the user agent above is a claim and nothing more.")
elif score < 3 and not asks_html:
    print("  not a browser. It did not ask for HTML, which no browser skips on a navigation.")
elif score < 3:
    print("  it sends what a browser sends, in part (%d of 3). Privacy tools strip the other two," % score)
    print("  so this is not proof either way, and a verified crawler above outranks it.")
else:
    print("  it sends what a browser sends, all three. That rules out a plain fetcher and rules")
    print("  in nothing: a headless browser sends real headers too.")
print()

paths = collections.Counter(e.get("request", {}).get("uri", "").split("?")[0] for e in rows)
codes = collections.Counter(e.get("status") for e in rows)
print("-- what it asked for --")
for p, n in paths.most_common(12):
    print("  %-46s %s" % (p[:46], "x%d" % n if n > 1 else ""))
if len(paths) > 12:
    print("  ... %d more distinct path(s)" % (len(paths) - 12))
print("  answers: %s" % ", ".join("%s x%d" % (c, n) for c, n in sorted(codes.items(), key=lambda x: str(x[0]))))
print()

# Did it read anything? The depth pixels are lazy-loaded from below the first screen, so fetching
# one means the page moved. Two of them more than a second apart means a person moved it.
marks = [(e.get("ts", 0), e.get("request", {}).get("uri", "")[4:-4])
         for e in rows if e.get("request", {}).get("uri", "").startswith("/px/")]
print("-- did it read anything? --")
if not marks:
    print("  no depth pixel at all. Either it never rendered the page, or it rendered it and")
    print("  loaded no images, which is what most fetchers that run scripts do.")
else:
    stamps = [t for t, _ in marks]
    span = max(stamps) - min(stamps)
    names = ", ".join(m for _, m in sorted(marks))
    print("  %d mark(s): %s" % (len(marks), names))
    if len(marks) >= 2 and span < 1.0:
        print("  all within %.2f s, so the page was rendered in one go and not scrolled." % span)
    elif len(marks) >= 2:
        print("  %.0f s between the first and the last, so somebody scrolled." % span)
    else:
        print("  one mark only, which is the control in the first screen and proves no scroll.")
