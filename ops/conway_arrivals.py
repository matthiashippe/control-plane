"""The rule for an arrival from Conway-Research, once, for ops/landing-yield.sh and ops/github-yield.sh.

Both tools count the same thing: an address that came from a Conway-Research page on GitHub and later
signed in. Until messung 03 each held its own copy of that rule, and the copies drifted apart (one
read the referrer case-blind, one did not). What stays in each tool: its window, its deadline, the
device split, /pay/, the bare referrer, the wallets and every output line.

The own addresses come from ops/conway-arrivals.sh, which asks `own_ips` and writes one address per
line; this module only reads that file. No function here prints an address.

Imported by the inline Python of both tools, with the ops directory put on sys.path first.
"""
import json
import re
from collections import namedtuple

# A referrer from the Conway-Research organisation: the bare organisation URL or any page below it,
# in any case. Conway-Research-fake and Conway-Researcher are other names and do not match.
REFERRER = re.compile(r"^https://github\.com/Conway-Research(/|$)", re.I)

SIGN_IN_METHOD = "POST"
SIGN_IN_PATH = "/v1/auth/verify"
SIGN_IN_STATUS = 200

# One access log line: time, address, method, path without the query, status, Referer, User-Agent.
Row = namedtuple("Row", "ts ip method path status referer agent")


class Unreadable(Exception):
    """A file the count depends on cannot be read; the caller decides what to say and exits 2."""


def from_conway(referer):
    return bool(REFERRER.match(referer or ""))


def is_sign_in(method, path, status):
    return method == SIGN_IN_METHOD and path == SIGN_IN_PATH and status == SIGN_IN_STATUS


def own_addresses(path):
    """The list ops/conway-arrivals.sh wrote. Missing or empty is never read as "nobody is us"."""
    try:
        with open(path, encoding="utf-8") as f:
            text = f.read()
    except OSError as e:
        raise Unreadable(f"the own address list from own_ips cannot be read ({e.strerror})")
    own = {l.split()[0] for l in text.splitlines() if l.strip() and not l.lstrip().startswith("#")}
    if not own:
        raise Unreadable("the own address list from own_ips is empty")
    return own


def read_log(path):
    """Every access line of the log in file order, and how many non-empty lines were not access lines."""
    try:
        f = open(path, encoding="utf-8", errors="replace")
    except OSError as e:
        raise Unreadable(f"the log cannot be read ({e.strerror})")
    rows, broken = [], 0
    with f:
        for raw in f:
            raw = raw.strip()
            if not raw:
                continue
            try:
                r = json.loads(raw)
                ts = float(r["ts"])
            except (ValueError, KeyError, TypeError, IndexError):
                broken += 1
                continue
            q = r.get("request")
            q = q if isinstance(q, dict) else {}
            h = q.get("headers")
            h = h if isinstance(h, dict) else {}

            def first(k):
                v = h.get(k) or [""]
                return str((v[0] if isinstance(v, list) and v else v) or "")

            # client_ip is the address Caddy resolved for the client; remote_ip is the peer. They are
            # the same here (no trusted_proxies in deploy/Caddyfile), and remote_ip is what
            # ops/traffic.sh reads, so it is the fallback for lines that lack client_ip.
            ip = str(q.get("client_ip") or q.get("remote_ip") or "")
            path_only = str(q.get("uri") or "").split("?", 1)[0]
            rows.append(Row(ts, ip, str(q.get("method") or ""), path_only, r.get("status"), first("Referer"), first("User-Agent")))
    return rows, broken
