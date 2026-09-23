"""Put every open job of ours through the brief check this service sells.

Reads bounties.json on stdin. Exit 0 when every brief is clean, 1 when one is not, 2 when the
check could not be reached, because a brief nobody could check is not a brief that passed.
"""
import sys, os, json, urllib.request, urllib.error

BASE = os.environ.get("CP_BASE", "https://cp.hippe.eu")

try:
    data = json.load(sys.stdin)
except Exception as exc:
    print("COULD NOT TELL: the job list is not JSON (%s)." % exc)
    raise SystemExit(2)

jobs = data.get("open") or []
if not jobs:
    print("No open job to check. That is not a pass, it is an empty list.")
    raise SystemExit(0)

# The address this service calls itself by, so a brief that still names the old one is caught
# before an agent writes it into the work we then pay for.
CANON = os.environ.get("CP_PUBLIC_URL", "https://postyourprice.com").rstrip("/")
CANON_HOST = CANON.split("//")[-1]
# `in os.environ` and not `or`: an empty value means "check against nothing", which is how the
# counter-proof turns this off, and `or` would read that as unset and put the default back. The
# same mistake cost a counter-proof in ops/traffic.sh on 2026-09-23.
_stale_raw = os.environ["CP_STALE_HOSTS"] if "CP_STALE_HOSTS" in os.environ else "cp.hippe.eu"
STALE = [h for h in _stale_raw.split() if h and h != CANON_HOST]

bad = 0
stale_briefs = []
for b in sorted(jobs, key=lambda x: str(x.get("deadline", ""))):
    named = [h for h in STALE if h in (b.get("brief") or "")]
    if named:
        stale_briefs.append((str(b.get("id", ""))[:8], named[0], b.get("submissions")))
    payload = json.dumps({"brief": b.get("brief", ""), "kind": b.get("kind", "factual")}).encode()
    req = urllib.request.Request(
        BASE + "/v1/briefs/check", data=payload,
        headers={"content-type": "application/json",
                 "User-Agent": "control-plane-check/1.0 (+https://cp.hippe.eu)"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            out = json.load(r)
    except Exception as exc:
        print("COULD NOT TELL: %s did not answer (%s)." % (b.get("id", "?")[:8], exc))
        raise SystemExit(2)
    findings = out.get("findings") or []
    head = "%-9s %-9s %4s c  %d word(s)" % (
        str(b.get("id", ""))[:8], b.get("kind", ""), b.get("price_cents", "?"), out.get("words", 0))
    if not findings:
        print("ok      %s" % head)
        continue
    bad += 1
    print("FAILED  %s  %d finding(s)" % (head, len(findings)))
    for f in findings:
        print("        [%s] %s" % (f.get("id", "?"), f.get("missing", "")[:110]))

print()
if stale_briefs:
    # Not a failure of the check the landing page sells, so it does not fail the run. It is a fact
    # about work we are about to pay for: an agent writing a directory entry from one of these
    # briefs puts the old address in it, and the entry outlives the brief.
    #
    # Nothing here rewrites a brief. A brief is what the agents who already submitted worked
    # against, and changing it after the fact would move the goalposts under them. What it does is
    # make sure nobody awards one of these without having seen it.
    print("STALE ADDRESS in %d open brief(s), which an agent may copy into the work:" % len(stale_briefs))
    for bid, host, subs in stale_briefs:
        print("   %-9s names %-14s  %s submission(s) already in" % (bid, host, subs))
    print("   The briefs are not rewritten: they are what the submitted work was written against.")
    print("   Check the winning submission for the address before awarding, and post new jobs")
    print("   with %s." % CANON)
    print()
if bad:
    print("OWN BRIEFS FAILED: %d of %d open job(s) would be flagged by the check on our own" % (bad, len(jobs)))
    print("                   landing page. A stranger pasting them into /check sees this too.")
    raise SystemExit(1)
if stale_briefs:
    print("OWN BRIEFS OK: all %d open job(s) pass the check this service sells, but %d name the "
          "old address." % (len(jobs), len(stale_briefs)))
else:
    print("OWN BRIEFS OK: all %d open job(s) pass the check this service sells." % len(jobs))
