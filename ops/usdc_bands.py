"""The counting of ops/usdc-bands.sh (kunden 18). Reads only, prints counts only.

    python3 -B ops/usdc_bands.py window <since> <until>
        exit 0 when both are strict ISO UTC and since < until, else 1
    python3 -B ops/usdc_bands.py count <db-json> <log> <own> <tiers-json> <since> <until>
        the four output lines
    python3 -B ops/usdc_bands.py fake-rpc <balances-json> <port-file>
        selftest only: a JSON-RPC on 127.0.0.1 with a port the system picks, written to <port-file>; it
        answers eth_chainId with Base and balanceOf of the USDC contract from <balances-json>
        ({"<address>": <atomic USDC> | "error"}); an address it does not know holds 0

<db-json> is what ops/db-report.cjs prints with CP_REPORT=topup-bands: the foreign addresses with a `grant`
or `topup` ledger row in the window and the number of foreign `topup` rows of exactly 1 USD. Each address is
read with balanceOf on the USDC contract on Base (eth_call, block latest) over CP_USDC_RPC (default
https://mainnet.base.org): under 1 USDC, from 1 to under 5, 5 or more, or unreadable when the RPC gives no
answer for it or the entry is no address. Before that, eth_chainId must answer 8453, else nothing is counted.

<log> is a Caddy JSON access log, read with read_log from ops/conway_arrivals.py (path without the query).
<own> is the list ops/conway-arrivals.sh wrote with conway_own_list. PAY 1 counts every request on /pay/1 or
a path below /pay/1/ from a foreign address with since <= ts < until, by status: 402, 200 or other.

<tiers-json> is {"env": <value of CP_TOPUP_TIERS_USD in the container, null when not set>, "image": <the list
TOPUP_TIERS_USD of the image as text, null when not read>}. Like payConfigFromEnv in src/payments/pay.ts an
empty or missing value means the list of the image; the tier 1 is sold when the list holds 1.

Exit 2 when the JSON, the log, the own list, the tiers or the RPC cannot be read; exit 1 on a wrong argument
or a time that is not strict ISO UTC. No address, hash, IP or amount per address ever reaches stdout;
diagnostics go to stderr.
"""
import datetime
import http.server
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import conway_arrivals as ca  # noqa: E402

ISO = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z")
ADDRESS = re.compile(r"0x[0-9a-f]{40}")
RPC = os.environ.get("CP_USDC_RPC", "https://mainnet.base.org")
# A RPC on loopback (the planted one of the selftest) never goes through a proxy: urllib sends 127.0.0.1 to http_proxy
# too, and a dead proxy would turn every read into unreadable. Any other RPC keeps the proxy settings of the environment.
OPEN = (
    urllib.request.build_opener(urllib.request.ProxyHandler({})).open
    if urllib.parse.urlsplit(RPC).hostname in ("127.0.0.1", "localhost", "::1")
    else urllib.request.urlopen
)
USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"  # USDC on Base, the asset of /pay/ (src/payments/pay.ts)
BALANCE_OF = "0x70a08231"
BASE_CHAIN_ID = 8453
ONE_USDC = 1_000_000
FIVE_USDC = 5 * ONE_USDC
AGENT = "ops-usdc-bands"


class NoAnswer(Exception):
    pass


def fail(msg, code=2):
    print(f"usdc-bands: {msg}", file=sys.stderr)
    raise SystemExit(code)


def parse_time(arg, name):
    if not ISO.fullmatch(arg):
        fail(f"--{name} is no strict ISO time in UTC like 2026-11-19T14:30:00Z", 1)
    try:
        return datetime.datetime.strptime(arg, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc).timestamp()
    except ValueError:
        fail(f"--{name} is no valid date and time", 1)


def window(since_arg, until_arg):
    since, until = parse_time(since_arg, "since"), parse_time(until_arg, "until")
    if since >= until:
        fail("--since must be before --until", 1)
    return since, until


def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    for attempt in range(6):
        try:
            req = urllib.request.Request(RPC, body, {"content-type": "application/json", "user-agent": AGENT})
            answer = json.load(OPEN(req, timeout=20))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(1 + 2 * attempt)
                continue
            raise NoAnswer(f"http {e.code}")
        except (OSError, ValueError) as e:
            raise NoAnswer(type(e).__name__)
        if isinstance(answer, dict) and "error" in answer and "limit" in str(answer["error"]).lower():
            time.sleep(1 + 2 * attempt)
            continue
        if not isinstance(answer, dict) or "result" not in answer:
            raise NoAnswer("error")
        return answer["result"]
    raise NoAnswer("rate limited")


def balance(address):
    """Atomic USDC of one address, or None when it cannot be read."""
    if not ADDRESS.fullmatch(address):
        return None
    data = BALANCE_OF + address[2:].rjust(64, "0")
    try:
        raw = rpc("eth_call", [{"to": USDC, "data": data}, "latest"])
        return int(raw, 16)
    except (NoAnswer, TypeError, ValueError):
        return None


def tier_one_sold(tiers):
    """CP_TOPUP_TIERS_USD as payConfigFromEnv reads it: empty or missing means the list of the image."""
    if not isinstance(tiers, dict):
        fail("the tiers are not readable, so nothing is counted.")
    raw = tiers.get("env") or tiers.get("image")
    if not isinstance(raw, str) or not raw.strip():
        fail("neither CP_TOPUP_TIERS_USD nor the list of the image is readable, so nothing is counted.")
    listed = []
    for part in raw.split(","):
        try:
            n = float(part.strip())
        except ValueError:
            continue
        if n.is_integer() and n > 0:
            listed.append(int(n))
    return 1 in listed


def read_json(path, what):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        fail(f"{what} is not readable, so nothing is counted.")


def is_pay_one(path):
    return path == "/pay/1" or path.startswith("/pay/1/")


def count(db_file, log_file, own_file, tiers_file, since_arg, until_arg):
    since, until = window(since_arg, until_arg)
    db = read_json(db_file, "the ledger report")
    addresses = db.get("addresses") if isinstance(db, dict) else None
    topups = db.get("topups_1usd") if isinstance(db, dict) else None
    if not isinstance(addresses, list) or not isinstance(topups, int):
        fail("the ledger report is not readable, so nothing is counted.")
    tier_sold = tier_one_sold(read_json(tiers_file, "the tiers"))
    try:
        own = ca.own_addresses(own_file)
    except ca.Unreadable as e:
        fail(f"{e}, so nothing is counted.")
    try:
        rows, broken = ca.read_log(log_file)
    except ca.Unreadable:
        fail("the access log is not readable. This says nothing about traffic.")
    try:
        chain = int(rpc("eth_chainId", []), 16)
    except (NoAnswer, TypeError, ValueError) as e:
        fail(f"the RPC gives no answer ({e}). This says nothing about the wallets.")
    if chain != BASE_CHAIN_ID:
        fail("the RPC is not on Base, so nothing is counted.")

    under = band = five = unreadable = 0
    seen = set()
    for a in addresses:
        a = str(a).lower()
        if a in seen:
            continue
        seen.add(a)
        b = balance(a)
        if b is None:
            unreadable += 1
        elif b < ONE_USDC:
            under += 1
        elif b < FIVE_USDC:
            band += 1
        else:
            five += 1

    p402 = p200 = other = 0
    for r in rows:
        if not (since <= r.ts < until) or not r.ip or r.ip in own or not is_pay_one(r.path):
            continue
        if r.status == 402:
            p402 += 1
        elif r.status == 200:
            p200 += 1
        else:
            other += 1

    print(f"usdc-bands: {len(rows)} log line(s) read, {broken} not access lines", file=sys.stderr)
    print(f"USDC BANDS since {since_arg} until {until_arg}: {len(seen)} foreign addresses with grant or topup, "
          f"{under} under 1 USDC, {band} from 1 to under 5 USDC, {five} 5 USDC or more, {unreadable} unreadable")
    print(f"TOPUPS 1 USD since {since_arg} until {until_arg}: {topups} by foreign addresses")
    print(f"PAY 1 since {since_arg} until {until_arg}: {p402} answers 402, {p200} answers 200, {other} other")
    print(f"TIER 1 SOLD: {'yes' if tier_sold else 'no'}")


def fake_rpc(balances_file, port_file):
    balances = {k.lower(): v for k, v in read_json(balances_file, "the planted balances").items()}

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            req = json.loads(self.rfile.read(int(self.headers.get("content-length") or 0)) or b"{}")
            method, params = req.get("method"), req.get("params") or []
            answer = {"jsonrpc": "2.0", "id": req.get("id")}
            if method == "eth_chainId":
                answer["result"] = hex(BASE_CHAIN_ID)
            elif method == "eth_call" and params and str(params[0].get("to", "")).lower() == USDC:
                address = "0x" + str(params[0].get("data", ""))[-40:].lower()
                v = balances.get(address, 0)
                if v == "error":
                    answer["error"] = {"code": -32000, "message": "execution reverted"}
                else:
                    answer["result"] = "0x" + format(int(v), "064x")
            else:
                answer["error"] = {"code": -32601, "message": "method not found"}
            body = json.dumps(answer).encode()
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    tmp = port_file + ".tmp"
    with open(tmp, "w") as f:
        f.write(str(server.server_address[1]))
    os.replace(tmp, port_file)
    server.serve_forever()


def main(argv):
    if len(argv) == 3 and argv[0] == "window":
        window(argv[1], argv[2])
        return 0
    if len(argv) == 7 and argv[0] == "count":
        count(*argv[1:])
        return 0
    if len(argv) == 3 and argv[0] == "fake-rpc":
        fake_rpc(argv[1], argv[2])
        return 0
    fail("usage: usdc_bands.py window <since> <until> | count <db-json> <log> <own> <tiers-json> <since> <until>"
         " | fake-rpc <balances-json> <port-file>", 1)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
