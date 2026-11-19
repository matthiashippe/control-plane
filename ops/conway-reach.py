#!/usr/bin/env python3
"""How many operators of the Conway payers we could reach, per public way (kunden 02). Reads only.

    python3 ops/conway-reach.py --way erc8004|social|issues [--payers <file>]
    python3 ops/conway-reach.py --selftest

Prints one number: how many of the payers who topped up at Conway in the window of
ops/conway-payers.sh can be left a message over that way which somebody reads. Without --payers the
list comes from `CP_PAYERS_LIST=<temp> bash ops/conway-payers.sh` (production, read only); with it,
from a file of one address per line. No address, hash, name or URI is ever printed.

The ways, each where the runtime at pin d8f8168 leaves something public:

  erc8004  the ERC-8004 registration (src/registry/erc8004.ts): the payer owns a token of the identity
           registry on Base, and the agent card its agentURI points to names a service endpoint we
           could write to (http, https, mailto), not only the wallet. Read with eth_call on
           mainnet.base.org and eth_getLogs on base.drpc.org (both public); the card from a data: URI,
           IPFS through a public gateway or http(s).
  social   the social relay (socialRelayUrl in src/types.ts): if the relay host resolves and answers,
           every payer with the default relay has an inbox there; if not, nobody does.
  issues   the upstream repo (the address the runtime prints in its status, src/index.ts): the payer's
           address appears in an issue or comment of Conway-Research/automaton, where a reply reaches
           whoever posted it. Read with `gh api search/issues`.

Nothing is sent: no message, no comment, no transaction. Exit 1 on a wrong argument, 2 when the list
of payers cannot be read or is empty, 3 when the network gives no answer for a payer.
"""
import argparse, base64, json, os, socket, subprocess, sys, tempfile, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RPC = os.environ.get("CP_REACH_RPC", "https://mainnet.base.org")
# mainnet.base.org answers every eth_getLogs with "request limit reached"; dRPC serves logs over at most
# 100 blocks on its free plan, and this tool asks for one block at a time.
LOGS_RPC = os.environ.get("CP_REACH_LOGS_RPC", "https://base.drpc.org")
IDENTITY_REGISTRY = "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432"  # CONTRACTS.mainnet.identity, src/registry/erc8004.ts
TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
RELAY = "https://social.conway.tech"  # DEFAULT_CONFIG.socialRelayUrl, src/types.ts
REPO = "Conway-Research/automaton"
IPFS_GATEWAY = "https://ipfs.io/ipfs/"
AGENT = "ops-conway-reach"


class NoAnswer(Exception):
    pass


class Net:
    """The real network. Every call is a read."""

    def rpc(self, method, params):
        body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
        url = LOGS_RPC if method == "eth_getLogs" else RPC
        for attempt in range(10):
            try:
                req = urllib.request.Request(url, body, {"content-type": "application/json", "user-agent": AGENT})
                answer = json.load(urllib.request.urlopen(req, timeout=30))
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    time.sleep(2 + 2 * attempt)
                    continue
                raise NoAnswer(f"rpc {method}: http {e.code}")
            except (OSError, ValueError) as e:
                raise NoAnswer(f"rpc {method}: {type(e).__name__}")
            if "error" in answer and "limit" in str(answer["error"]).lower():
                time.sleep(2 + 2 * attempt)
                continue
            time.sleep(0.3)
            if "error" in answer:
                raise NoAnswer(f"rpc {method}: error")
            return answer["result"]
        raise NoAnswer(f"rpc {method}: rate limited")

    def get(self, url):
        try:
            req = urllib.request.Request(url, headers={"user-agent": AGENT})
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.status, r.read(200_000).decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            return e.code, ""
        except (OSError, ValueError):
            return None, ""

    def resolves(self, host):
        try:
            socket.getaddrinfo(host, 443)
            return True
        except OSError:
            return False

    def issues(self, address):
        r = subprocess.run(
            ["gh", "api", "-X", "GET", "search/issues", "-f", f"q={address} repo:{REPO}", "--jq", ".total_count"],
            capture_output=True, text=True, timeout=60,
        )
        time.sleep(2.5)  # the search API allows 30 requests a minute
        if r.returncode != 0 or not r.stdout.strip().isdigit():
            raise NoAnswer("github search")
        return int(r.stdout.strip())


class World:
    """A planted world for the selftest: a chain, some pages, some hosts, some issues. No network."""

    def __init__(self, spec):
        self.spec = spec

    def rpc(self, method, params):
        head = self.spec["head"]
        if method == "eth_blockNumber":
            return hex(head)
        if method == "eth_call":
            call, block = params
            data = call["data"]
            at = head if block == "latest" else int(block, 16)
            if data.startswith("0x70a08231"):
                owner = "0x" + data[-40:]
                reg = self.spec["registry"].get(owner)
                return "0x" + ("1" if reg and reg["block"] <= at else "0").rjust(64, "0")
            if data.startswith("0xc87b56dd"):
                token = int(data[10:], 16)
                for reg in self.spec["registry"].values():
                    if reg["token"] == token:
                        raw = reg["uri"].encode()
                        words = (32).to_bytes(32, "big") + len(raw).to_bytes(32, "big") + raw.ljust((len(raw) + 31) // 32 * 32, b"\0")
                        return "0x" + words.hex()
                raise NoAnswer("no token")
        if method == "eth_getLogs":
            f = params[0]
            owner = "0x" + f["topics"][2][-40:]
            reg = self.spec["registry"].get(owner)
            lo, hi = int(f["fromBlock"], 16), int(f["toBlock"], 16)
            if reg and lo <= reg["block"] <= hi:
                return [{"topics": [TRANSFER, "0x" + "0" * 64, f["topics"][2], hex(reg["token"])]}]
            return []
        raise NoAnswer(method)

    def get(self, url):
        page = self.spec.get("http", {}).get(url)
        return (page[0], page[1]) if page else (None, "")

    def resolves(self, host):
        return host in self.spec.get("dns", [])

    def issues(self, address):
        return int(self.spec.get("issues", {}).get(address, 0))


def word(address):
    return "0" * 24 + address[2:]


def owns_token(net, address, block="latest"):
    r = net.rpc("eth_call", [{"to": IDENTITY_REGISTRY, "data": "0x70a08231" + word(address)}, block]) or "0x"
    return r != "0x" and int(r, 16) > 0


def agent_uri(net, address):
    """The agentURI of the payer's registration, or None. The registry is not enumerable, so the block
    of the mint is found by bisecting balanceOf over history and the token id read from its Transfer."""
    if not owns_token(net, address):
        return None
    hi = int(net.rpc("eth_blockNumber", []), 16)
    lo = max(0, hi - 40_000_000)
    if owns_token(net, address, hex(lo)):
        raise NoAnswer("registered before the search window")
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if owns_token(net, address, hex(mid)):
            hi = mid
        else:
            lo = mid
    logs = net.rpc("eth_getLogs", [{
        "address": IDENTITY_REGISTRY, "topics": [TRANSFER, None, "0x" + word(address)],
        "fromBlock": hex(hi), "toBlock": hex(hi),
    }])
    if not logs:
        raise NoAnswer("no mint in its block")
    token = int(logs[0]["topics"][3], 16)
    raw = bytes.fromhex(net.rpc("eth_call", [{"to": IDENTITY_REGISTRY, "data": "0xc87b56dd" + hex(token)[2:].rjust(64, "0")}, "latest"])[2:])
    offset = int.from_bytes(raw[0:32], "big")
    length = int.from_bytes(raw[offset:offset + 32], "big")
    return raw[offset + 32:offset + 32 + length].decode("utf-8", "replace")


def card(net, uri):
    """The agent card behind an agentURI as a dict, or None when it cannot be read."""
    text = None
    if uri.startswith("data:"):
        head, _, payload = uri.partition(",")
        text = base64.b64decode(payload).decode("utf-8", "replace") if head.endswith(";base64") else urllib.parse.unquote(payload)
    else:
        url = IPFS_GATEWAY + uri[len("ipfs://"):] if uri.startswith("ipfs://") else uri
        if url.startswith(("http://", "https://")):
            status, body = net.get(url)
            text = body if status == 200 else None
    try:
        parsed = json.loads(text) if text else None
    except ValueError:
        return None
    return parsed if isinstance(parsed, dict) else None


def writable(c):
    """A service endpoint somebody could write to: http(s) or mailto, not a wallet."""
    services = c.get("services") or c.get("endpoints") or []
    return any(
        isinstance(s, dict) and str(s.get("endpoint", "")).lower().startswith(("http://", "https://", "mailto:"))
        for s in services
    )


def reachable(net, way, payers):
    if way == "erc8004":
        n = 0
        for a in payers:
            uri = agent_uri(net, a)
            c = card(net, uri) if uri else None
            n += 1 if c and writable(c) else 0
        return n
    if way == "social":
        host = urllib.parse.urlparse(RELAY).hostname
        if not net.resolves(host):
            return 0
        status, _ = net.get(RELAY + "/")
        return len(payers) if status is not None and status < 500 else 0
    if way == "issues":
        return sum(1 for a in payers if net.issues(a) > 0)
    raise ValueError(way)


def read_payers(path):
    try:
        with open(path, encoding="utf-8") as f:
            payers = [line.strip().lower() for line in f if line.strip()]
    except OSError:
        return None
    if not payers or any(len(a) != 42 or not a.startswith("0x") for a in payers):
        return None
    return payers


def production_payers():
    fd, path = tempfile.mkstemp(prefix="conway-reach-")
    os.close(fd)
    try:
        r = subprocess.run(
            ["bash", os.path.join(ROOT, "ops", "conway-payers.sh")],
            env={**os.environ, "CP_PAYERS_LIST": path}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=600,
        )
        return read_payers(path) if r.returncode == 0 else None
    finally:
        os.unlink(path)


def selftest():
    p1, p2, p3 = (f"0x{'0' * 36}{x}" for x in ("00c1", "00c2", "00c3"))
    contact = {"type": "x", "services": [{"name": "agentWallet", "endpoint": f"eip155:8453:{p1}"}, {"name": "web", "endpoint": "https://p1.example/inbox"}]}
    wallet_only = {"type": "x", "services": [{"name": "agentWallet", "endpoint": f"eip155:8453:{p2}"}]}
    data_uri = "data:application/json;base64," + base64.b64encode(json.dumps(contact).encode()).decode()

    def world(**over):
        spec = {
            "head": 5_000_000,
            "registry": {
                p1: {"block": 4_123_457, "token": 7, "uri": data_uri},
                p2: {"block": 4_500_001, "token": 9, "uri": "ipfs://cid-p2"},
            },
            "http": {IPFS_GATEWAY + "cid-p2": [200, json.dumps(wallet_only)], RELAY + "/": [200, "ok"]},
            "dns": [],
            "issues": {p3: 2},
        }
        spec.update(over)
        return World(spec)

    payers = [p1, p2, p3]
    fail = 0

    def want(actual, expected, reason):
        nonlocal fail
        if actual == expected:
            print(f"ok   {reason}")
        else:
            print(f"FAIL {reason}\n     want: {expected}\n     got:  {actual}")
            fail = 1

    want(reachable(world(), "erc8004", payers), 1,
         "erc8004: the registered payer whose card names an https endpoint counts, the wallet-only card and the unregistered payer do not")
    want(agent_uri(world(), p1), data_uri, "erc8004: the token is found by bisecting the history to its mint block")
    reg = world().spec["registry"]
    want(reachable(world(registry={p1: {**reg[p1], "uri": "ipfs://cid-p2"}, p2: reg[p2]}), "erc8004", payers), 0,
         "erc8004 counter-proof: with a wallet-only card nobody counts")
    mail = {"type": "x", "services": [{"name": "email", "endpoint": "mailto:p2@example.invalid"}]}
    want(reachable(world(http={IPFS_GATEWAY + "cid-p2": [200, json.dumps(mail)]}), "erc8004", payers), 2,
         "erc8004 counter-proof: a mailto endpoint makes the second payer count")
    want(reachable(world(http={}), "erc8004", payers), 1, "erc8004: a card that does not load counts as unreachable")
    want(reachable(world(), "social", payers), 0, "social: a relay host that does not resolve reaches nobody")
    want(reachable(world(dns=["social.conway.tech"]), "social", payers), 3,
         "social counter-proof: a relay that resolves and answers reaches every payer")
    want(reachable(world(dns=["social.conway.tech"], http={RELAY + "/": [502, ""]}), "social", payers), 0,
         "social: a relay that answers 502 reaches nobody")
    want(reachable(world(), "issues", payers), 1, "issues: the payer named in an upstream issue counts")
    want(reachable(world(issues={}), "issues", payers), 0, "issues counter-proof: without an issue nobody counts")
    out = subprocess.run([sys.executable, __file__, "--way", "issues", "--payers", "/nonexistent/payers.txt"], capture_output=True, text=True)
    want(out.returncode, 2, "an unreadable list of payers exits 2")
    out = subprocess.run([sys.executable, __file__, "--way", "nowhere"], capture_output=True, text=True)
    want(out.returncode, 1, "an unknown way exits 1")
    if fail == 0:
        print("each way counted in both directions on a planted world")
        print("SELFTEST OK")
    else:
        print("SELFTEST FAILED")
    return fail


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--way", choices=["erc8004", "social", "issues"])
    parser.add_argument("--payers")
    parser.add_argument("--selftest", action="store_true")
    try:
        args = parser.parse_args()
    except SystemExit:
        return 1
    if args.selftest:
        return selftest()
    if not args.way:
        parser.print_usage(sys.stderr)
        return 1
    payers = read_payers(args.payers) if args.payers else production_payers()
    if not payers:
        print("conway-reach: the list of payers is not readable or empty. This says nothing about reach.", file=sys.stderr)
        return 2
    try:
        print(reachable(Net(), args.way, payers))
    except NoAnswer as e:
        print(f"conway-reach: no answer from the network ({e}). This says nothing about reach.", file=sys.stderr)
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
