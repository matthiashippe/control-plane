"""Which of these addresses are machines in a data centre?

The derivation round of 2026-09-23 measured the denominator every other number here is read
against, and it is smaller than anybody had assumed: over 96 hours of access log, 229 foreign
addresses, 51 of which ran the page script and 30 of which reached the last depth mark. Of the 45
with at least two marks, seven spent more than five seconds on the page, and five of those seven
are ClaudeBot and three AWS or GCP addresses. **One human reader is proven in four days.**

Four of the eleven proposals in that round miscounted against this, two of them all the way to
"the offer is wrong". That is the failure loop-constraints.md names as the one that cost five
wrong numbers on 2026-09-22, and it is why the denominator gets a tool before the next thing is
built on top of it.

**Reverse DNS, not a list of ranges.** A file of CIDR blocks for AWS, GCP, Azure, OVH, Hetzner and
Linode would be six files to keep current and wrong the week nobody does. Every one of those
providers puts its ownership in the PTR record: `ec2-…compute.amazonaws.com`,
`…bc.googleusercontent.com`, `…cloudapp.azure.com`, `…ovh.net`, `static.…clients.your-server.de`,
`…members.linode.com`. That is the same round trip ops/crawlers.py uses to tell a real Googlebot
from something claiming to be one, it needs no list, and it is right the day a provider adds a
range.

What it does NOT do is decide who is a person. A data centre address is a machine; a residential
address is a machine or a person and this cannot tell which. It removes the half that is certain
and says how many are left, which is the honest shape of the answer.

    ops/access-log.sh | ops/fetchers.py            one line per address: ip <TAB> owner <TAB> kind
    ops/access-log.sh | ops/fetchers.py --summary  the split, in one block, for a cycle to read
    ops/fetchers.py --selftest                     plant both kinds and check they are told apart

The cache is ops/fetcher-cache.tsv and is committed, like ops/own-ips.txt: it is evidence about
what an address was on the day it visited, and a lookup a year later can answer differently.
"""
import json
import os
import pathlib
import socket
import sys

# The substring that gives a provider away in its own PTR record. Sources are each provider's
# documentation of its reverse DNS naming; the check is the substring, not the whole name, because
# every one of them varies the region and the shape around it.
PROVIDERS = {
    "amazonaws.com": "AWS",
    "googleusercontent.com": "GCP",
    # Deliberately NOT "google.com": that would swallow Googlebot, whose crawl-66-249-…
    # .googlebot.com belongs in ops/crawlers.py and is the opposite of noise here. A GCE instance
    # announces itself as …bc.googleusercontent.com; measured against our own log on 2026-09-23.
    "cloudapp.azure.com": "Azure",
    "ovh.net": "OVH",
    "ovh.ca": "OVH",
    "your-server.de": "Hetzner",
    "hetzner.com": "Hetzner",
    "linode.com": "Linode",
    "linodeusercontent.com": "Linode",
    "digitalocean.com": "DigitalOcean",
    "vultr.com": "Vultr",
    "scaleway.com": "Scaleway",
    "contabo.net": "Contabo",
    "hostinger.com": "Hostinger",
    "oraclecloud.com": "Oracle",
}

CACHE = pathlib.Path(__file__).with_name("fetcher-cache.tsv")


def load_cache() -> dict:
    out = {}
    if CACHE.exists():
        for line in CACHE.read_text(encoding="utf-8").splitlines():
            if not line.strip() or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) >= 3:
                out[parts[0]] = (parts[1], parts[2])
    return out


def classify(ip: str, cache: dict) -> tuple:
    """Returns (owner, kind) where kind is 'datacenter' or 'unknown'."""
    if ip in cache:
        return cache[ip]
    try:
        host = socket.gethostbyaddr(ip)[0].lower()
    except Exception:
        # No PTR is not evidence of anything. Plenty of residential lines have none, and so do
        # some cloud hosts. Unknown stays unknown rather than being guessed either way.
        result = ("-", "unknown")
        cache[ip] = result
        return result
    for needle, owner in PROVIDERS.items():
        if host.endswith(needle) or f".{needle}" in host:
            result = (owner, "datacenter")
            cache[ip] = result
            return result
    result = (host[:48], "unknown")
    cache[ip] = result
    return result


def save_cache(cache: dict) -> None:
    lines = ["# ip\towner\tkind. Written by ops/fetchers.py; committed because it is evidence"]
    lines += [f"{ip}\t{owner}\t{kind}" for ip, (owner, kind) in sorted(cache.items())]
    CACHE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def addresses_from(stream) -> list:
    """Takes either plain addresses, one per line, or Caddy's JSON log."""
    seen, out = set(), []
    for raw in stream:
        raw = raw.strip()
        if not raw:
            continue
        ip = None
        if raw.startswith("{"):
            try:
                ip = json.loads(raw).get("request", {}).get("remote_ip")
            except ValueError:
                ip = None
        elif raw.count(".") == 3 or ":" in raw:
            ip = raw.split()[0]
        if ip and ip not in seen:
            seen.add(ip)
            out.append(ip)
    return out


def main() -> int:
    if "--selftest" in sys.argv:
        # Both directions, with addresses whose ownership is a matter of public record: a machine
        # that must be called one, and a name that must not.
        cache = {}
        planted = {
            "52.16.245.145": "datacenter",   # AWS, in our own log since 19.09.
            "34.116.134.70": "datacenter",    # GCP, 70.134.116.34.bc.googleusercontent.com
            "80.218.182.64": "unknown",       # the Swiss line that read the page after issue #392
        }
        bad = 0
        for ip, want in planted.items():
            owner, kind = classify(ip, cache)
            mark = "ok  " if kind == want else "FAIL"
            if kind != want:
                bad = 1
            print(f"  {mark} {ip:16} -> {owner} ({kind}), expected {want}")
        print("selftest " + ("passed" if not bad else "FAILED"))
        return bad

    cache = load_cache()
    before = len(cache)
    own = set((os.environ.get("CP_OWN_IPS_RESOLVED") or "").split())
    ips = [ip for ip in addresses_from(sys.stdin) if ip not in own]
    rows = [(ip, *classify(ip, cache)) for ip in ips]
    if len(cache) != before:
        save_cache(cache)
    dc = [r for r in rows if r[2] == "datacenter"]

    if "--summary" in sys.argv:
        from collections import Counter
        by = Counter(owner for _, owner, kind in rows if kind == "datacenter")
        print(f"{len(rows)} foreign address(es) in the log")
        print(f"  provably a machine in a data centre: {len(dc)}"
              + (f"  ({', '.join(f'{k} {v}' for k, v in by.most_common())})" if by else ""))
        print(f"  not decidable this way:              {len(rows) - len(dc)}")
        print("  The second number is not a count of people. A residential address is a person or")
        print("  a machine and reverse DNS cannot say which; this removes only the half that is")
        print("  certain. Read ops/depth.sh against the second number, never against the first.")
        # Nothing to fail on: this is a denominator, not a check. It goes red only when the log
        # cannot be read, which access-log.sh reports on its own.
        return 0

    for ip, owner, kind in rows:
        print(f"{ip}\t{owner}\t{kind}")
    print(f"# {len(rows)} address(es), {len(dc)} in a data centre, {len(rows) - len(dc)} not decidable this way",
          file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
