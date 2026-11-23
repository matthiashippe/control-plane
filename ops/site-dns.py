#!/usr/bin/env python3
"""A records of the service host automatonhost.com (move goal 01, the move notes under docs/).

Runs on the code-host only. One zone, automatonhost.com, token CLOUDFLARE_HTC_API_TOKEN from the environment or from
~/brain/connectors/secrets.env, never printed. Wanted: A automatonhost.com and A www.automatonhost.com on <ip>, not
proxied, because Caddy on the payment server fetches the certificate itself, as it does for postyourprice.com.

  site-dns.py check <ip>    read only: CHANGE dns create A <name> per missing record, CHANGE dns differs A <name> per
                            record that exists with other content; last line SITE DNS OK changed=0 or SITE DNS DRIFT
                            changed=<n>. Exit 0 only without a CHANGE line.
  site-dns.py apply <ip>    creates missing records (POST) and nothing else. It never changes or removes a record: one
                            that differs ends the run with exit 1 before anything is written.
  site-dns.py --selftest    without network: the planner and apply against planted zones; last line SITE DNS SELFTEST OK
"""
import ipaddress
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ZONE = "automatonhost.com"
NAMES = ("automatonhost.com", "www.automatonhost.com")
API = "https://api.cloudflare.com/client/v4"
TOKEN = "CLOUDFLARE_HTC_API_TOKEN"


def token():
    t = os.environ.get(TOKEN)
    if t:
        return t
    path = Path.home() / "brain" / "connectors" / "secrets.env"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.startswith(TOKEN + "="):
                v = line.split("=", 1)[1].strip().strip('"').strip("'")
                if v:
                    return v
    sys.exit(f"site-dns: no token {TOKEN}")


def cloudflare(method, path, body=None):
    """GET or POST against the Cloudflare API. No other method exists here, so nothing can change or remove a record."""
    if method not in ("GET", "POST"):
        sys.exit(f"site-dns: method {method} is not allowed")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Authorization", "Bearer " + token())
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            out = json.load(r)
    except urllib.error.HTTPError as e:
        out = json.load(e)
    if not out.get("success"):
        codes = [(e.get("code"), e.get("message")) for e in out.get("errors") or []]
        sys.exit(f"site-dns: {method} {path.split('?')[0]} failed: {codes}")
    return out["result"]


def zone_id(call):
    res = call("GET", f"/zones?name={ZONE}")
    if not res:
        sys.exit(f"site-dns: zone {ZONE} not found for this token")
    return res[0]["id"]


def records(call, z):
    return call("GET", f"/zones/{z}/dns_records?per_page=500")


def valid_ip(ip):
    try:
        return isinstance(ipaddress.ip_address(ip), ipaddress.IPv4Address)
    except ValueError:
        return False


# ---- planner: pure, so the selftest can feed it planted zones

def plan(recs, ip):
    """[(action, name)] per wanted name: create (nothing under that name), ok (one A on ip, not proxied), differs."""
    out = []
    for name in NAMES:
        same = [r for r in recs if r.get("name") == name and r.get("type") in ("A", "AAAA", "CNAME")]
        if not same:
            out.append(("create", name))
        elif len(same) == 1 and same[0]["type"] == "A" and same[0].get("content") == ip and same[0].get("proxied") is False:
            out.append(("ok", name))
        else:
            out.append(("differs", name))
    return out


def report(steps, out=print):
    changed = 0
    for action, name in steps:
        if action != "ok":
            changed += 1
            out(f"CHANGE dns {action} A {name}")
    out("SITE DNS OK changed=0" if changed == 0 else f"SITE DNS DRIFT changed={changed}")
    return changed


# ---- commands

def check(ip, call=cloudflare, out=print):
    z = zone_id(call)
    return 0 if report(plan(records(call, z), ip), out) == 0 else 1


def apply(ip, call=cloudflare, out=print):
    z = zone_id(call)
    steps = plan(records(call, z), ip)
    differs = [name for action, name in steps if action == "differs"]
    if differs:
        report(steps, out)
        out(f"site-dns: {', '.join(differs)} exists with other content; nothing was written")
        return 1
    for action, name in steps:
        if action == "create":
            call("POST", f"/zones/{z}/dns_records", {"type": "A", "name": name, "content": ip, "proxied": False, "ttl": 1})
            out(f"created A {name}")
    return check(ip, call, out)


def selftest():
    fails = 0
    ip = "76.13.144.207"

    def expect(name, want, got):
        nonlocal fails
        if want == got:
            print(f"ok   {name}")
        else:
            print(f"FAIL {name}: want {want!r}, got {got!r}")
            fails += 1

    def a(name, content=ip, proxied=False, rtype="A"):
        return {"id": name, "type": rtype, "name": name, "content": content, "proxied": proxied, "ttl": 1}

    class Fake:
        """A zone in memory: GET reads it, POST adds a record, and every call is kept to show what was sent."""

        def __init__(self, recs):
            self.recs = list(recs)
            self.calls = []

        def __call__(self, method, path, body=None):
            self.calls.append(method)
            if method not in ("GET", "POST"):
                raise AssertionError(f"method {method} sent")
            if path.startswith("/zones?"):
                return [{"id": "z1"}]
            if method == "GET":
                return list(self.recs)
            self.recs.append({**body, "id": body["name"]})
            return body

    quiet = []
    other = a("mail.automatonhost.com", "198.51.100.9")

    expect("empty zone wants both records", [("create", NAMES[0]), ("create", NAMES[1])], plan([], ip))
    expect("clean zone is ok", [("ok", NAMES[0]), ("ok", NAMES[1])], plan([a(NAMES[0]), a(NAMES[1]), other], ip))
    expect("other ip differs", ("differs", NAMES[0]), plan([a(NAMES[0], "198.51.100.1"), a(NAMES[1])], ip)[0])
    expect("proxied differs", ("differs", NAMES[1]), plan([a(NAMES[0]), a(NAMES[1], proxied=True)], ip)[1])
    expect("cname differs", ("differs", NAMES[1]), plan([a(NAMES[0]), a(NAMES[1], "x.example", rtype="CNAME")], ip)[1])
    expect("two records differ", ("differs", NAMES[0]), plan([a(NAMES[0]), {**a(NAMES[0]), "id": "dup"}, a(NAMES[1])], ip)[0])

    lines = []
    expect("check reports a missing record", 1, check(ip, Fake([a(NAMES[0])]), lines.append))
    expect("check names it", ["CHANGE dns create A www.automatonhost.com", "SITE DNS DRIFT changed=1"], lines)
    lines = []
    expect("check on a clean zone", 0, check(ip, Fake([a(NAMES[0]), a(NAMES[1])]), lines.append))
    expect("check says so", ["SITE DNS OK changed=0"], lines)

    fake = Fake([other])
    expect("apply on an empty zone ends clean", 0, apply(ip, fake, quiet.append))
    expect("apply only reads and posts", {"GET", "POST"}, set(fake.calls))
    expect("apply posted two records", 2, fake.calls.count("POST"))
    expect("apply kept the other record", True, other in fake.recs)
    expect("apply wrote both unproxied on the ip", 2, len([r for r in fake.recs if r["name"] in NAMES and r["content"] == ip and r["proxied"] is False]))

    fake = Fake([a(NAMES[0]), a(NAMES[1])])
    expect("apply on a clean zone", 0, apply(ip, fake, quiet.append))
    expect("apply on a clean zone writes nothing", 0, fake.calls.count("POST"))

    fake = Fake([a(NAMES[0], "198.51.100.1")])
    lines = []
    expect("apply with a differing record fails", 1, apply(ip, fake, lines.append))
    expect("apply with a differing record writes nothing", 0, fake.calls.count("POST"))
    expect("apply names the differing record", True, "CHANGE dns differs A automatonhost.com" in lines)

    refused = []
    try:
        cloudflare("OPTIONS", "/zones/z1/dns_records/x")
    except SystemExit as e:
        refused.append(str(e))
    expect("the client refuses any method but GET and POST", True, bool(refused) and "not allowed" in refused[0])
    expect("ip check", (True, False, False), (valid_ip(ip), valid_ip("2001:db8::1"), valid_ip("example.com")))

    if fails:
        print(f"SITE DNS SELFTEST FAILED {fails}")
        return 1
    print("SITE DNS SELFTEST OK")
    return 0


def main(argv):
    if argv[1:] == ["--selftest"]:
        return selftest()
    if len(argv) == 3 and argv[1] in ("check", "apply"):
        ip = argv[2]
        if not valid_ip(ip):
            sys.exit(f"site-dns: {ip} is not an IPv4 address")
        return check(ip) if argv[1] == "check" else apply(ip)
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
