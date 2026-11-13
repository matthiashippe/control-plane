#!/usr/bin/env python3
"""DNS records and origin certificate of the sandbox host (docs/sandbox/plan.md, ## Netz and ## Verbindung, goals/sandbox/07).

Runs on the code-host only. Two zones, two tokens, each never printed and never leaving the code-host:

- the zone of the payment service, postyourprice.com, token CLOUDFLARE_HTC_API_TOKEN. Here only ctl.sbx.postyourprice.com
  (A, not proxied, no AAAA) is managed, and the old wildcard *.postyourprice.com must be gone.
- the zone of exposed ports, the domain from SANDBOXD_DOMAIN in sandboxd.service, token CLOUDFLARE_SBX_API_TOKEN, scoped to
  that zone only (Zone DNS Edit, Zone SSL and Certificates Edit, Zone Settings Edit). Managed: *.<domain> (A, proxied) and the
  SSL mode Full (strict).

A token is read from the environment or from ~/brain/connectors/secrets.env.

  cloudflare.py dns-check <ip>      payment zone: one CHANGE line per record that would change, last line CF DNS OK changed=0
  cloudflare.py dns-apply <ip>      payment zone: create ctl.sbx, delete exactly the record(s) named *.postyourprice.com
  cloudflare.py ports-check <ip>    ports zone, read only: one CHANGE line per deviation, last line PORTS DNS OK
  cloudflare.py ports-apply <ip>    ports zone: create *.<domain>, set SSL to Full (strict); never deletes a record
  cloudflare.py origin-cert <dir>   write origin.pem and origin.key for *.<domain> and <domain> into <dir> (0600)
  cloudflare.py zone-digest <zone>  read only: sha256 over the sorted records except *.<zone> and the SSL mode, first 12 hex
  cloudflare.py --selftest          without network: the planners report planted deviations and a clean zone not

A managed name that already exists with other content is reported as a conflict and left as it is. Emergency switch for abuse
of exposed ports: delete the one record *.<domain> in the ports zone; the payment zone is never touched by that.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

PAYMENT_ZONE = "postyourprice.com"
API = "https://api.cloudflare.com/client/v4"
HERE = Path(__file__).resolve().parent
TOKENS = {"payment": "CLOUDFLARE_HTC_API_TOKEN", "ports": "CLOUDFLARE_SBX_API_TOKEN"}


def ports_domain():
    """The domain of exposed ports, from sandboxd.service, so it is written down in one place only."""
    text = (HERE / "sandboxd.service").read_text(encoding="utf-8")
    m = re.search(r"^Environment=SANDBOXD_DOMAIN=([a-z0-9.-]+)$", text, re.M)
    if not m:
        sys.exit("cloudflare: no SANDBOXD_DOMAIN in sandboxd.service")
    d = m.group(1)
    if d == PAYMENT_ZONE or d.endswith("." + PAYMENT_ZONE):
        sys.exit("cloudflare: SANDBOXD_DOMAIN is the payment zone")
    return d


def token(kind):
    name = TOKENS[kind]
    t = os.environ.get(name)
    if t:
        return t
    path = Path.home() / "brain" / "connectors" / "secrets.env"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.startswith(name + "="):
                v = line.split("=", 1)[1].strip().strip('"').strip("'")
                if v:
                    return v
    sys.exit(f"cloudflare: no token {name}")


def call(kind, method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Authorization", "Bearer " + token(kind))
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            out = json.load(r)
    except urllib.error.HTTPError as e:
        out = json.load(e)
    if not out.get("success"):
        codes = [(e.get("code"), e.get("message")) for e in out.get("errors") or []]
        sys.exit(f"cloudflare: {method} {path.split('?')[0]} failed: {codes}")
    return out["result"]


def kind_of(zone):
    return "payment" if zone == PAYMENT_ZONE else "ports"


def zone_id(zone):
    res = call(kind_of(zone), "GET", f"/zones?name={zone}")
    if not res:
        sys.exit(f"cloudflare: zone {zone} not found for this token")
    return res[0]["id"]


def records(zone, z):
    return call(kind_of(zone), "GET", f"/zones/{z}/dns_records?per_page=500")


def ssl_mode(zone, z):
    return call(kind_of(zone), "GET", f"/zones/{z}/settings/ssl")["value"]


# ---- planners: pure, so the selftest can feed them planted zones

def plan_payment(recs, ip):
    """[(action, record)] for the payment zone: ctl.sbx create/ok/conflict, *.postyourprice.com remove while it exists."""
    out = []
    w = {"type": "A", "name": f"ctl.sbx.{PAYMENT_ZONE}", "content": ip, "proxied": False}
    same = [r for r in recs if r["name"] == w["name"] and r["type"] in ("A", "AAAA", "CNAME")]
    if not same:
        out.append(("create", w))
    elif len(same) == 1 and same[0]["type"] == "A" and same[0]["content"] == ip and same[0]["proxied"] is False:
        out.append(("ok", w))
    else:
        out.append(("conflict", w))
    for r in recs:
        if r["name"] == f"*.{PAYMENT_ZONE}":
            out.append(("remove", r))
    return out


def plan_ports(recs, ssl, ip, domain):
    """[(action, what)] for the ports zone: *.<domain> A proxied to ip, SSL strict."""
    out = []
    w = {"type": "A", "name": f"*.{domain}", "content": ip, "proxied": True}
    same = [r for r in recs if r["name"] == w["name"] and r["type"] in ("A", "AAAA", "CNAME")]
    if not same:
        out.append(("create", w))
    elif len(same) == 1 and same[0]["type"] == "A" and same[0]["content"] == ip and same[0]["proxied"] is True:
        out.append(("ok", w))
    else:
        out.append(("conflict", w))
    out.append(("ok" if ssl == "strict" else "ssl", {"type": "SSL", "name": domain, "content": "strict", "have": ssl}))
    return out


def digest(recs, ssl, zone):
    keep = sorted(
        (
            {k: r.get(k) for k in ("type", "name", "content", "proxied", "ttl", "priority", "data")}
            for r in recs
            if r["name"] != f"*.{zone}"
        ),
        key=lambda r: json.dumps(r, sort_keys=True),
    )
    blob = json.dumps({"records": keep, "ssl": ssl}, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode()).hexdigest()[:12]


def report(steps, ok_line, drift_word):
    changed = 0
    for action, w in steps:
        if action != "ok":
            changed += 1
            extra = f" proxied={str(w['proxied']).lower()}" if "proxied" in w else f" want={w['content']} have={w.get('have')}"
            print(f"CHANGE {drift_word} {action} {w['type']} {w['name']}{extra}")
    print(ok_line if changed == 0 else f"{ok_line.rsplit(' ', 1)[0].replace(' OK', '')} DRIFT changed={changed}")
    return changed


# ---- commands

def dns_check(ip):
    z = zone_id(PAYMENT_ZONE)
    return report(plan_payment(records(PAYMENT_ZONE, z), ip), "CF DNS OK changed=0", "dns")


def dns_apply(ip):
    z = zone_id(PAYMENT_ZONE)
    for action, w in plan_payment(records(PAYMENT_ZONE, z), ip):
        if action == "create":
            call("payment", "POST", f"/zones/{z}/dns_records", {**w, "ttl": 1})
            print(f"created {w['type']} {w['name']}")
        elif action == "remove":
            call("payment", "DELETE", f"/zones/{z}/dns_records/{w['id']}")
            print(f"deleted {w['type']} {w['name']}")
        elif action == "conflict":
            sys.exit(f"cloudflare: {w['name']} exists with other content, left unchanged")
    return dns_check(ip)


def ports_check(ip):
    domain = ports_domain()
    z = zone_id(domain)
    return report(plan_ports(records(domain, z), ssl_mode(domain, z), ip, domain), "PORTS DNS OK", "ports")


def ports_apply(ip):
    domain = ports_domain()
    z = zone_id(domain)
    for action, w in plan_ports(records(domain, z), ssl_mode(domain, z), ip, domain):
        if action == "create":
            call("ports", "POST", f"/zones/{z}/dns_records", {**w, "ttl": 1})
            print(f"created {w['type']} {w['name']}")
        elif action == "ssl":
            call("ports", "PATCH", f"/zones/{z}/settings/ssl", {"value": "strict"})
            print(f"ssl {domain} strict")
        elif action == "conflict":
            sys.exit(f"cloudflare: {w['name']} exists with other content, left unchanged")
    return ports_check(ip)


def zone_digest(zone):
    z = zone_id(zone)
    print(digest(records(zone, z), ssl_mode(zone, z), zone))
    return 0


def origin_cert(directory):
    domain = ports_domain()
    d = Path(directory)
    key, csr = d / "origin.key", d / "origin.csr"
    subprocess.run(["openssl", "ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", str(key)], check=True)
    os.chmod(key, 0o600)
    subprocess.run(["openssl", "req", "-new", "-key", str(key), "-subj", f"/CN=*.{domain}", "-out", str(csr)], check=True)
    res = call("ports", "POST", "/certificates", {
        "hostnames": [f"*.{domain}", domain],
        "requested_validity": 5475,
        "request_type": "origin-ecc",
        "csr": csr.read_text(),
    })
    pem = d / "origin.pem"
    pem.write_text(res["certificate"])
    os.chmod(pem, 0o600)
    csr.unlink()
    print(f"origin certificate for *.{domain} until {res.get('expires_on')}")
    return 0


def selftest():
    fails = 0

    def expect(name, want, got):
        nonlocal fails
        if want == got:
            print(f"ok   {name}")
        else:
            print(f"FAIL {name}: want {want!r}, got {got!r}")
            fails += 1

    ip, dom = "192.0.2.10", "example.dev"
    ctl = {"id": "1", "type": "A", "name": f"ctl.sbx.{PAYMENT_ZONE}", "content": ip, "proxied": False, "ttl": 1}
    wild = {"id": "2", "type": "A", "name": f"*.{PAYMENT_ZONE}", "content": ip, "proxied": True, "ttl": 1}
    apex = {"id": "3", "type": "A", "name": PAYMENT_ZONE, "content": "198.51.100.1", "proxied": True, "ttl": 1}
    acts = lambda steps: [(a, w["name"]) for a, w in steps]
    expect("payment zone clean", [("ok", ctl["name"])], acts(plan_payment([ctl, apex], ip)))
    expect("payment wildcard is removed, nothing else", [("ok", ctl["name"]), ("remove", wild["name"])],
           acts(plan_payment([ctl, wild, apex], ip)))
    expect("payment ctl missing is created", [("create", ctl["name"])], acts(plan_payment([apex], ip)))
    expect("payment ctl proxied is a conflict", [("conflict", ctl["name"])], acts(plan_payment([{**ctl, "proxied": True}], ip)))

    pw = {"id": "4", "type": "A", "name": f"*.{dom}", "content": ip, "proxied": True, "ttl": 1}
    ports = lambda recs, ssl: [a for a, _ in plan_ports(recs, ssl, ip, dom)]
    expect("ports zone clean", ["ok", "ok"], ports([pw], "strict"))
    expect("ports record missing", ["create", "ok"], ports([], "strict"))
    expect("ports record not proxied", ["conflict", "ok"], ports([{**pw, "proxied": False}], "strict"))
    expect("ports record other address", ["conflict", "ok"], ports([{**pw, "content": "198.51.100.9"}], "strict"))
    expect("ports ssl full is not strict", ["ok", "ssl"], ports([pw], "full"))
    expect("ports zone clean prints PORTS DNS OK", 0, report(plan_ports([pw], "strict", ip, dom), "PORTS DNS OK", "ports"))
    expect("ports drift counts", 2, report(plan_ports([], "flexible", ip, dom), "PORTS DNS OK", "ports"))

    base = digest([ctl, apex], "full", PAYMENT_ZONE)
    expect("digest ignores the wildcard", base, digest([wild, ctl, apex], "full", PAYMENT_ZONE))
    expect("digest ignores order and ids", base, digest([{**apex, "id": "x"}, ctl], "full", PAYMENT_ZONE))
    expect("digest sees a changed record", True, base != digest([ctl, {**apex, "content": "198.51.100.2"}], "full", PAYMENT_ZONE))
    expect("digest sees a removed record", True, base != digest([ctl], "full", PAYMENT_ZONE))
    expect("digest sees the ssl mode", True, base != digest([ctl, apex], "strict", PAYMENT_ZONE))
    expect("digest is 12 hex", True, bool(re.fullmatch(r"[0-9a-f]{12}", base)))
    expect("ports domain is not the payment zone", True, ports_domain() != PAYMENT_ZONE and not ports_domain().endswith("." + PAYMENT_ZONE))

    print("CLOUDFLARE SELFTEST OK" if fails == 0 else f"CLOUDFLARE SELFTEST FAILED ({fails})")
    return 1 if fails else 0


COMMANDS = {
    "dns-check": lambda a: 1 if dns_check(a) else 0,
    "dns-apply": lambda a: 1 if dns_apply(a) else 0,
    "ports-check": lambda a: 1 if ports_check(a) else 0,
    "ports-apply": lambda a: 1 if ports_apply(a) else 0,
    "origin-cert": origin_cert,
    "zone-digest": zone_digest,
}

if __name__ == "__main__":
    if sys.argv[1:] == ["--selftest"]:
        sys.exit(selftest())
    if len(sys.argv) != 3 or sys.argv[1] not in COMMANDS:
        sys.exit(__doc__)
    sys.exit(COMMANDS[sys.argv[1]](sys.argv[2]))
