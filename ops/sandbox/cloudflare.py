#!/usr/bin/env python3
"""DNS records and origin certificate of the sandbox host (docs/sandbox/plan.md, ## Netz and ## Verbindung).

Runs on the code-host only. The Cloudflare token comes from CLOUDFLARE_HTC_API_TOKEN or is read from
~/brain/connectors/secrets.env; it is never printed and never leaves the code-host.

  cloudflare.py dns-check <ip>     print one line per record that would change, last line CF DNS OK changed=<n>
  cloudflare.py dns-apply <ip>     create the missing records; never changes or deletes an existing record
  cloudflare.py origin-cert <dir>  write origin.pem and origin.key for *.postyourprice.com into <dir> (0600)

Only these names are managed: *.postyourprice.com (A, proxied) and ctl.sbx.postyourprice.com (A, not proxied, no AAAA).
A managed name that already exists with other content is reported as a conflict and left as it is.
"""
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

ZONE = "postyourprice.com"
API = "https://api.cloudflare.com/client/v4"


def token():
    t = os.environ.get("CLOUDFLARE_HTC_API_TOKEN")
    if t:
        return t
    path = Path.home() / "brain" / "connectors" / "secrets.env"
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("CLOUDFLARE_HTC_API_TOKEN="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("cloudflare: no token")


def call(method, path, body=None):
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
        sys.exit(f"cloudflare: {method} {path.split('?')[0]} failed: {codes}")
    return out["result"]


def zone_id():
    return call("GET", f"/zones?name={ZONE}")[0]["id"]


def wanted(ip):
    return [
        {"type": "A", "name": f"*.{ZONE}", "content": ip, "proxied": True},
        {"type": "A", "name": f"ctl.sbx.{ZONE}", "content": ip, "proxied": False},
    ]


def plan(ip):
    """[(action, record)] with action create, ok, conflict or remove-aaaa (only reported, never done)."""
    z = zone_id()
    records = call("GET", f"/zones/{z}/dns_records?per_page=500")
    out = []
    for w in wanted(ip):
        same = [r for r in records if r["name"] == w["name"] and r["type"] in ("A", "AAAA", "CNAME")]
        if not same:
            out.append(("create", w))
        elif any(r["type"] == "A" and r["content"] == w["content"] and r["proxied"] == w["proxied"] for r in same) and len(same) == 1:
            out.append(("ok", w))
        else:
            out.append(("conflict", w))
    return z, out


def dns_check(ip):
    _, steps = plan(ip)
    changed = 0
    for action, w in steps:
        if action != "ok":
            changed += 1
            print(f"CHANGE dns {action} {w['type']} {w['name']} proxied={str(w['proxied']).lower()}")
    print(f"CF DNS OK changed={changed}" if changed == 0 else f"CF DNS DRIFT changed={changed}")
    return changed


def dns_apply(ip):
    z, steps = plan(ip)
    for action, w in steps:
        if action == "create":
            call("POST", f"/zones/{z}/dns_records", {**w, "ttl": 1})
            print(f"created {w['type']} {w['name']}")
        elif action == "conflict":
            sys.exit(f"cloudflare: {w['name']} exists with other content, left unchanged")
    return dns_check(ip)


def origin_cert(directory):
    d = Path(directory)
    key, csr = d / "origin.key", d / "origin.csr"
    subprocess.run(["openssl", "ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", str(key)], check=True)
    os.chmod(key, 0o600)
    subprocess.run(["openssl", "req", "-new", "-key", str(key), "-subj", f"/CN=*.{ZONE}", "-out", str(csr)], check=True)
    res = call("POST", "/certificates", {
        "hostnames": [f"*.{ZONE}"],
        "requested_validity": 5475,
        "request_type": "origin-ecc",
        "csr": csr.read_text(),
    })
    pem = d / "origin.pem"
    pem.write_text(res["certificate"])
    os.chmod(pem, 0o600)
    csr.unlink()
    print(f"origin certificate for *.{ZONE} until {res.get('expires_on')}")


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("dns-check", "dns-apply", "origin-cert"):
        sys.exit(__doc__)
    cmd, arg = sys.argv[1], sys.argv[2]
    if cmd == "dns-check":
        sys.exit(1 if dns_check(arg) else 0)
    if cmd == "dns-apply":
        sys.exit(1 if dns_apply(arg) else 0)
    origin_cert(arg)
