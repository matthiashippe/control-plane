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

bad = 0
for b in sorted(jobs, key=lambda x: str(x.get("deadline", ""))):
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
if bad:
    print("OWN BRIEFS FAILED: %d of %d open job(s) would be flagged by the check on our own" % (bad, len(jobs)))
    print("                   landing page. A stranger pasting them into /check sees this too.")
    raise SystemExit(1)
print("OWN BRIEFS OK: all %d open job(s) pass the check this service sells." % len(jobs))
