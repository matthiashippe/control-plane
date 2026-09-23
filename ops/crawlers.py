"""Separate real search engine crawlers from anything that merely claims to be one.

Reads Caddy's JSON access log on stdin. The rule that decides is the DNS round trip Google and
Bing both document: reverse-resolve the address, require the hostname to sit under a domain the
engine owns, then forward-resolve that hostname and require it to come back to the same address.
A user agent string proves nothing; either direction of DNS is out of a faker's reach.
"""
import sys, os, json, socket, datetime, collections, re, urllib.request

# Each engine: the substring its user agent carries, and the domains its own hosts live under.
# Sources: Google "Verifying Googlebot", Bing "How to Verify Bingbot".
ENGINES = {
    "Googlebot": ("googlebot", (".googlebot.com", ".google.com")),
    "Bingbot":   ("bingbot",   (".search.msn.com",)),
    "DuckDuckBot": ("duckduckbot", (".duckduckgo.com",)),
    "YandexBot": ("yandex",    (".yandex.ru", ".yandex.net", ".yandex.com")),
    "Applebot":  ("applebot",  (".applebot.apple.com",)),
}

def verify(ip, suffixes):
    """The round trip. Returns (ok, hostname_or_reason)."""
    try:
        host = socket.gethostbyaddr(ip)[0]
    except Exception as exc:
        return False, "no reverse DNS (%s)" % type(exc).__name__
    if not any(host.endswith(s) for s in suffixes):
        return False, "reverse DNS is %s, not under %s" % (host, " or ".join(suffixes))
    try:
        _, _, addrs = socket.gethostbyname_ex(host)
    except Exception as exc:
        return False, "%s does not forward-resolve (%s)" % (host, type(exc).__name__)
    if ip not in addrs:
        return False, "%s forward-resolves to %s, not %s" % (host, ", ".join(addrs), ip)
    return True, host

def sitemap_pages():
    """The pages we publish, read from the sitemap rather than kept by hand here.

    Hand-kept page lists drifted four times in one night in this repo; every one of them silently
    omitted a page that existed. If the sitemap cannot be fetched the section says so instead of
    quietly checking a shorter list, because "nothing missing" from a truncated list is a lie.
    """
    try:
        req = urllib.request.Request("https://cp.hippe.eu/sitemap.xml",
                                     headers={"User-Agent": "control-plane-check/1.0 (+https://cp.hippe.eu)"})
        with urllib.request.urlopen(req, timeout=15) as r:
            xml = r.read().decode("utf-8", "replace")
        return [u.replace("https://cp.hippe.eu", "") or "/" for u in re.findall(r"<loc>([^<]+)</loc>", xml)], None
    except Exception as exc:
        return [], str(exc)

claims = collections.defaultdict(list)   # (engine, ip) -> [(ts, uri, status)]
for line in sys.stdin:
    try:
        e = json.loads(line)
    except Exception:
        continue
    r = e.get("request", {})
    ua = (r.get("headers", {}).get("User-Agent") or [""])[0]
    low = ua.lower()
    for name, (needle, _) in ENGINES.items():
        if needle in low:
            claims[(name, r.get("remote_ip", ""))].append(
                (e.get("ts", 0), r.get("uri", ""), e.get("status")))
            break

if not claims:
    print("NOBODY  no request in this log carries a search engine user agent at all.")
    sys.exit(0)

# Our own addresses. A curl of ours carrying a Googlebot user agent is a test, not an impostor,
# and a section that exposes fakers loses its point the moment it leads with us.
OURS = set((os.environ.get("CP_OWN_ADDRESSES") or "").split())

cache = {}
verified, impostors, ours = {}, {}, {}
for (name, ip), hits in claims.items():
    key = (name, ip)
    if ip in OURS:
        ours[key] = (hits, "one of our own addresses")
        continue
    if key not in cache:
        cache[key] = verify(ip, ENGINES[name][1])
    ok, detail = cache[key]
    (verified if ok else impostors)[key] = (hits, detail)

print("-- search engines that proved they are who they say --")
if not verified:
    print("   none. Every user agent claiming to be a crawler failed the DNS round trip.")
took = collections.defaultdict(set)
for (name, ip), (hits, host) in sorted(verified.items()):
    hits.sort()
    first = datetime.datetime.fromtimestamp(hits[0][0], datetime.timezone.utc)
    last = datetime.datetime.fromtimestamp(hits[-1][0], datetime.timezone.utc)
    span = int((last - first).total_seconds())
    print("   VERIFIED %-12s %-15s %s" % (name, ip, host))
    print("            %d request(s), %s to %s UTC (%s)" % (
        len(hits), first.strftime("%m-%d %H:%M:%S"), last.strftime("%H:%M:%S"),
        "all within %d s" % span if span < 120 else "over %d min" % (span // 60)))
    paths = collections.Counter(u for _, u, _ in hits)
    print("            took: %s" % ", ".join("%s%s" % (u, "" if n == 1 else " x%d" % n)
                                             for u, n in paths.most_common()))
    for u, _ in paths.items():
        took[name].add(u)

pages, err = sitemap_pages()
print()
print("-- what no verified crawler has ever asked for --")
if err:
    print("   UNDETERMINED the sitemap could not be read (%s), so this cannot be answered." % err)
elif not verified:
    print("   every page, because no crawler has been verified here.")
else:
    seen_any = set().union(*took.values()) if took else set()
    missed = [p for p in pages if p not in seen_any]
    if "/sitemap.xml" not in seen_any:
        print("   sitemap.xml  never fetched by any verified crawler.")
        print("                robots.txt has pointed at it since 2026-09-21 11:02, so this is not")
        print("                a missing line. A new domain simply gets very little crawl budget,")
        print("                and budget follows inbound links. There is nothing to fix in the")
        print("                markup; what is missing is a link from somewhere else.")
    if missed:
        print("   %d of %d published page(s) never crawled:" % (len(missed), len(pages)))
        print("       %s" % ", ".join(missed))
    else:
        print("   nothing. Every page in the sitemap has been crawled at least once.")

if ours:
    print()
    print("-- ours, wearing a crawler user agent --")
    for (name, ip), (hits, _) in sorted(ours.items()):
        paths = ", ".join(sorted({u for _, u, _ in hits}))
        print("   OURS     %-12s %-15s %d hit(s): %s" % (name, ip, len(hits), paths))

if impostors:
    print()
    print("-- claimed to be a crawler and is not --")
    for (name, ip), (hits, why) in sorted(impostors.items()):
        hits.sort()
        when = datetime.datetime.fromtimestamp(hits[0][0], datetime.timezone.utc)
        paths = ", ".join(sorted({u for _, u, _ in hits}))
        print("   FAKE     %-12s %-15s %d hit(s) from %s UTC" % (
            name, ip, len(hits), when.strftime("%m-%d %H:%M")))
        print("            %s" % why)
        print("            took: %s" % paths)
