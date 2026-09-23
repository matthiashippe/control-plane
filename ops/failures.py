"""Every stranger who got an error, newest trouble first, with what they were after.

Reads Caddy's JSON access log on stdin. Three groups leave the list and only one of them leaves
it silently:

  ours      addresses in CP_OWN_ADDRESSES. Our own tests are 6,700 of the errors in this log.
  scanners  anybody asking for wp-login.php, /.env and their relatives. Counted, not hidden.
  quiet     addresses whose every request worked. They are the point of the service, not a finding.
"""
import sys, os, json, datetime, collections, re

OURS = set((os.environ.get("CP_OWN_ADDRESSES") or "").split())

# A probe, not a person. Anchored on the path so that a legitimate path containing one of these
# words by accident does not vanish: /v1/credits/history holds no match here, and that is checked
# by the test beside this file.
SCAN = re.compile(
    r"(^|/)(wp-[a-z]+|xmlrpc|\.env|\.git|\.aws|\.ssh|phpinfo|phpmyadmin)"
    r"|/(vendor|actuator|cgi-bin|telescope|debug|backup|config\.json|admin)(/|$)"
    # Anything ending in .php. This service has never served a line of PHP, so a request for one
    # is a probe by definition. Naming the files one by one missed info.php, php.php, i.php and
    # pi.php from a single scanner on 2026-09-20, which then sat in the list as a visitor.
    r"|\.php(\?|$)"
    r"|\.(sql|bak|old|zip|tar\.gz)$",
    re.I,
)

# 404 on these is noise every site gets and nobody is failing at anything.
BORING = {"/favicon.ico", "/favicon.png", "/favicon.svg", "/apple-touch-icon.png",
          "/apple-touch-icon-precomposed.png", "/robots.txt", "/sitemap.xml", "/ads.txt",
          "/.well-known/security.txt"}

errors = collections.defaultdict(list)
worked = collections.Counter()
# A 3xx is not a request that worked. It is an instruction, and whether it was carried out is a
# separate fact: the address in Helsinki got four 308s on 2026-09-21 and never asked for the
# target, because httpx does not follow redirects unless told to. Counting those four as "worked"
# read as "this caller is fine", which is the opposite of what happened.
redirected = collections.Counter()
probes = collections.Counter()
boring = 0
# Which paths have ever answered anybody with a 2xx. An address that asked only for paths that
# have never existed here was looking for another server, whatever its user agent says, and saying
# so is more use than guessing at its intent.
real_paths = set()

for line in sys.stdin:
    try:
        e = json.loads(line)
    except Exception:
        continue
    r = e.get("request", {})
    ip = r.get("remote_ip", "")
    status = e.get("status", 0)
    uri = r.get("uri", "")
    path = uri.split("?")[0]
    if status < 400:
        real_paths.add(path)
    if ip in OURS:
        continue
    if 300 <= status < 400:
        redirected[ip] += 1
        continue
    if status < 400:
        worked[ip] += 1
        continue
    if SCAN.search(uri):
        probes[ip] += 1
        continue
    if path in BORING:
        boring += 1
        continue
    ua = (r.get("headers", {}).get("User-Agent") or ["-"])[0]
    errors[ip].append((e.get("ts", 0), r.get("method", ""), uri, status, ua))

# A probe request is always out, and the regex above has already taken it. What is left to decide
# is the address: scanning is a property of the caller, not of one request. The PHP scanner on
# 2026-09-20 also sent four POSTs to /, which is not a probe path, and filtering per request left
# those four sitting in the list as a visitor who had tried something four times. So an address
# that probed at least twice, and probed at least as often as it did anything else, goes entirely.
#
# The two numbers are different questions and the report prints both: how many addresses probed at
# all, and how many requests that was.
scanners = set(probes)
swept = {ip for ip, n in probes.items() if n >= 2 and n >= len(errors.get(ip, []))}
for ip in swept:
    errors.pop(ip, None)

SUMMARY = "--summary" in sys.argv

if SUMMARY:
    # One line for ops/check-all.sh. The standing order puts an error a real user saw above every
    # task in the backlog, so it has to be visible in the run that happens every cycle, not only
    # in a tool somebody remembers to call.
    if not errors:
        print("nobody from outside has an unanswered error (%d probe(s) set aside)" % sum(probes.values()))
    else:
        newest = max(max(h[0] for h in hits) for hits in errors.values())
        when = datetime.datetime.fromtimestamp(newest, datetime.timezone.utc)
        stuck = sum(1 for ip, hits in errors.items()
                    if worked.get(ip, 0) == 0)
        print("%d stranger(s) got an error, %d of them never got anything to work; newest %s UTC"
              % (len(errors), stuck, when.strftime("%m-%d %H:%M")))
    sys.exit(0)

print("-- strangers who got an error --")
print("   %d address(es). Set aside: %d scanner address(es) with %d probe(s), %d boring 404(s)." % (
    len(errors), len(scanners), sum(probes.values()), boring))
if not OURS:
    print("   (CP_OWN_ADDRESSES is empty, so our own tests are in this list too.)")
print()

if not errors:
    print("   Nobody. Every request from outside that was not a probe was answered.")
    sys.exit(0)

# Newest trouble first: an error from an hour ago is worth more than one from four days ago, and
# sorting by count puts whoever retried most at the top, which is not the same question.
def last_at(hits):
    return max(h[0] for h in hits)

for ip, hits in sorted(errors.items(), key=lambda kv: -last_at(kv[1])):
    hits.sort()
    first = datetime.datetime.fromtimestamp(hits[0][0], datetime.timezone.utc)
    last = datetime.datetime.fromtimestamp(hits[-1][0], datetime.timezone.utc)
    days = len({datetime.datetime.fromtimestamp(h[0], datetime.timezone.utc).date() for h in hits})
    codes = collections.Counter(h[3] for h in hits)
    ua = hits[0][4][:44]
    ok = worked.get(ip, 0)
    print("   %-15s %s" % (ip, ua))
    span = first.strftime("%m-%d %H:%M") if len(hits) == 1 else "%s to %s" % (
        first.strftime("%m-%d %H:%M"), last.strftime("%m-%d %H:%M"))
    print("       %d error(s) over %d day(s), %s" % (len(hits), days, span))
    # Whether anything ever worked for them is the difference between somebody who is using this
    # service and somebody who never got in at all.
    redir = redirected.get(ip, 0)
    if ok == 0 and redir == 0:
        print("       nothing from this address has ever worked")
    elif ok == 0:
        print("       nothing worked; %d request(s) got a redirect, and no request for a target "
              "ever followed" % redir)
    else:
        print("       %d request(s) from this address did work%s" % (
            ok, ", %d more got a redirect" % redir if redir else ""))
    # A path that has never answered anybody is not a path they got wrong; it is a path that was
    # never here. Somebody asking only for those was looking for a different server.
    asked = {h[2].split("?")[0] for h in hits}
    unknown = asked - real_paths
    if unknown == asked:
        print("       not one of these paths has ever existed here, so this is a probe for "
              "another server")
    print("       codes: %s" % ", ".join("%s x%d" % (c, n) for c, n in sorted(codes.items())))
    paths = collections.Counter("%s %s" % (h[1], h[2][:44]) for h in hits)
    for p, n in paths.most_common(5):
        print("         %-50s %s" % (p, "x%d" % n if n > 1 else ""))
    if len(paths) > 5:
        print("         ... %d more distinct path(s)" % (len(paths) - 5))
    print()
