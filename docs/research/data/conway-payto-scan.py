#!/usr/bin/env python3
"""Every USDC transfer into Conway's payTo address on Base, for a range of blocks.

The full history up to block 51,528,050 is already in `2026-09-19-conway-payto-transfers.csv` and
took half an hour to collect. This script exists for the part that comes after: a daily delta is
around 22 chunks and runs in seconds, which is what makes a time series affordable.

    python3 conway-payto-scan.py --from-block 51528051

Writes CSV rows (no header) to stdout, oldest first, and progress to stderr. The columns match the
existing file exactly, so the two concatenate:

    block,timestamp_utc,from,usdc,tx_hash

Two traps, both paid for on 2026-09-19:
  * The public RPC answers Python's default User-Agent with 403. A real one fixes it.
  * It throws "over rate limit" on fast loops, so a refused chunk is retried after a pause rather
    than dropped. A dropped chunk is a silent hole in a series nobody can spot afterwards.
"""
import argparse, json, sys, time, urllib.error, urllib.request

RPC = "https://mainnet.base.org"
USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
PAYTO = "0x21DD37E3E4eA6CCC0a5C98A4944702eDE6E7Be10"
TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
CHUNK = 2000
USER_AGENT = "control-plane-research/1.0 (+https://cp.hippe.eu)"


class TooMuchAtOnce(RuntimeError):
    """The node refused because the answer would be too large. Ask for a smaller range."""


def rpc(method: str, params: list, attempts: int = 6):
    """One JSON-RPC call, with the rate limit treated as a wait rather than an error."""
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    pause = 1.0
    for attempt in range(attempts):
        request = urllib.request.Request(
            RPC, data=body, headers={"Content-Type": "application/json", "User-Agent": USER_AGENT}
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                answer = json.load(response)
            if "error" in answer:
                message = str(answer["error"])
                if "rate limit" in message.lower() and attempt < attempts - 1:
                    time.sleep(pause); pause *= 2
                    continue
                raise RuntimeError(f"{method}: {message}")
            return answer["result"]
        except urllib.error.HTTPError as failure:
            # 413 is the answer being too big, not the request, and no number of retries makes a
            # block range hold fewer transfers. Raised as its own type so the caller can halve the
            # range instead of trying the same thing six times, which is what happened on
            # 2026-09-23: the daily scan failed, retried for a minute and gave up.
            if failure.code == 413:
                raise TooMuchAtOnce(f"{method}: {failure}") from failure
            if attempt == attempts - 1:
                raise RuntimeError(f"{method}: {failure}") from failure
            time.sleep(pause); pause *= 2
        except (urllib.error.URLError, TimeoutError) as failure:
            if attempt == attempts - 1:
                raise RuntimeError(f"{method}: {failure}") from failure
            time.sleep(pause); pause *= 2
    raise RuntimeError(f"{method}: gave up after {attempts} attempts")


def latest_block() -> int:
    return int(rpc("eth_blockNumber", []), 16)


def block_time(block: int, cache: dict) -> str:
    """UTC timestamp of a block. Cached, because many transfers share one block."""
    if block not in cache:
        header = rpc("eth_getBlockByNumber", [hex(block), False])
        cache[block] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(int(header["timestamp"], 16)))
    return cache[block]


# The smallest range worth asking for. Below this a 413 is not about the range any more, and
# halving forever would turn one bad answer into thousands of calls.
MIN_CHUNK = 25


def get_logs(start: int, end: int, payto_topic: str, depth: int = 0):
    """The logs in one range, halving the range whenever the node says the answer is too large.

    Base produces a block every two seconds, so CHUNK of 2000 is about 67 minutes of chain, and it
    held for months. It stops holding the day a busy stretch puts more transfers in that window
    than the node will serialise, and that day was 2026-09-23. Nothing about the range is wrong;
    it is simply too wide now, and it will be too wide again.
    """
    try:
        return rpc("eth_getLogs", [{
            "address": USDC,
            "fromBlock": hex(start),
            "toBlock": hex(end),
            "topics": [TRANSFER, None, payto_topic],
        }])
    except TooMuchAtOnce:
        if end - start + 1 <= MIN_CHUNK:
            raise
        middle = start + (end - start) // 2
        print(f"# {start}-{end} too large, splitting at {middle}", file=sys.stderr)
        return get_logs(start, middle, payto_topic, depth + 1) + get_logs(middle + 1, end, payto_topic, depth + 1)


def scan(first: int, last: int):
    cache: dict[int, str] = {}
    found = 0
    payto_topic = "0x" + PAYTO[2:].lower().rjust(64, "0")
    for start in range(first, last + 1, CHUNK):
        end = min(start + CHUNK - 1, last)
        logs = get_logs(start, end, payto_topic)
        for entry in logs:
            block = int(entry["blockNumber"], 16)
            sender = "0x" + entry["topics"][1][-40:]
            amount = int(entry["data"], 16) / 1_000_000
            yield f'{block},{block_time(block, cache)},{sender},{amount:.6f},{entry["transactionHash"]}'
            found += 1
        print(f"# {start}-{end}: {found} transfers so far", file=sys.stderr)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--from-block", type=int, required=True)
    parser.add_argument("--to-block", type=int, help="default: the chain head minus --confirmations")
    parser.add_argument("--confirmations", type=int, default=30,
                        help="blocks left alone at the head, so a reorg cannot rewrite a line already written")
    args = parser.parse_args()

    last = args.to_block if args.to_block is not None else latest_block() - args.confirmations
    if last < args.from_block:
        print(f"# nothing to do: head is at {last}, already scanned through {args.from_block - 1}", file=sys.stderr)
        return 0
    print(f"# scanning {args.from_block} to {last} ({last - args.from_block + 1} blocks)", file=sys.stderr)
    for row in scan(args.from_block, last):
        print(row)
    print(f"# done, scanned through {last}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
