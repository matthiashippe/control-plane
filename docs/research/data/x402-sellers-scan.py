#!/usr/bin/env python3
"""Inflow measurement for x402 seller wallets on Base.

Counts every USDC transfer to the payTo addresses listed below inside a block window
(default 302,400 blocks = 7 days at a 2 s block time) and prints transfers, sum and the number of
distinct payers per seller. The same method as the Conway measurement of 19.09.2026, only with
several addresses in one run (topics[2] as an OR list), so that a single pass is enough.

    python3 x402-sellers-scan.py [block window]

Collected on 19.09.2026 from 19:15 UTC, head block 51,528,083 and 51,528,206 (second run),
152 chunks of 2,000 blocks per run, no failed chunks. The public RPC
mainnet.base.org limits eth_getLogs to 2,000 blocks and does not answer Python urllib without a
User-Agent, hence the curl UA in the header. Result: 2026-09-20-x402-sellers-7d.csv.
"""
import json, time, urllib.request, sys, csv, collections

RPC = "https://mainnet.base.org"
USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

# Ranks 1 to 10 of the agent402 leaderboard (7-day window, fetched 19.09.2026 18:20 UTC),
# Conway as the reference, plus the payTo addresses of the prepaid candidates checked by hand.
SELLERS = {
    "0x7284d41b5b852f2bd4c99bdf95043d84452d299c": "AX1 Console",
    "0x325bdf6f7efab24a2210c48c1b64cab2eae1d430": "StableEnrich",
    "0xe9030014f5dae217d0a152f02a043567b16c1abf": "BlockRun.AI",
    "0x17cd53c04d707ef0dd615ef56c633f02915a7905": "keyring-agent",
    "0x158e90dd58fbe897ed8c244f472febee37283d00": "agents.chain.link",
    "0xade02dff58b0316f04cd59806e3fdb4690fe89ab": "Deepline GTM",
    "0xcfa26f13c6c18307033ece13bbb8f470da5b4dbe": "StableSocial",
    "0x66d7c2f952362bfb24fd7f02a9bec9c754ea83bc": "api.strale.io",
    "0x6c0752c09e7f6fa6526fcdf40e456a159ebb5621": "AgentUtility.ai",
    "0xa13d363aecccf878ec64f6eb687eb4a771fb0599": "RobinX",
    "0x21dd37e3e4ea6ccc0a5c98a4944702ede6e7be10": "Conway (Referenz)",
    "0xdc59fa7b64988b846e76ec9849bb68f889071506": "JarvisClaw",
    "0x428df107e32e08288fcac6567f4f40bc4eab4da0": "Lazaretto",
    "0x966e1ae22996545015b1414b35234b10719d7ad4": "Satelink RPC",
    "0x3d7611b43f4b761e641e51a1f64abb21fdbbb914": "SibFly",
    "0x5cc3c4e5020ec3d81e392658efe7b27966872ce7": "MoneyMachine x402",
    "0xf375b89bb5785386f5cbb63e815c924787af79cf": "agentdata-nl",
    "0xf2a6416ebb0c594ab2977695bed061729ddeb47b": "Kaisha API",
    "0x833ca7dcdb6a681ddc0c15982ef0d609bceb3a5e": "Asset Forge",
}
TOPIC2 = ["0x" + "0" * 24 + a[2:].lower() for a in SELLERS]


def rpc(payload, tries=6):
    for i in range(tries):
        try:
            req = urllib.request.Request(
                RPC, data=json.dumps(payload).encode(),
                headers={"Content-Type": "application/json", "User-Agent": "curl/8.5.0"})
            r = json.loads(urllib.request.urlopen(req, timeout=40).read())
            if "error" in r:
                time.sleep(1.5 * (i + 1))
                continue
            return r["result"]
        except Exception:
            time.sleep(1.5 * (i + 1))
    return None


window = int(sys.argv[1]) if len(sys.argv) > 1 else 302400
head = int(rpc({"jsonrpc": "2.0", "method": "eth_blockNumber", "params": [], "id": 1}), 16)
start = head - window
print(f"head={head} from={start} window={window} blocks", flush=True)

rows, failed, done, b = [], 0, 0, start
while b <= head:
    to = min(b + 1999, head)
    res = rpc({"jsonrpc": "2.0", "method": "eth_getLogs", "params": [
        {"fromBlock": hex(b), "toBlock": hex(to), "address": USDC,
         "topics": [TOPIC, None, TOPIC2]}], "id": 1})
    if res is None:
        failed += 1
    else:
        for lg in res:
            rows.append((int(lg["blockNumber"], 16), "0x" + lg["topics"][2][-40:],
                         "0x" + lg["topics"][1][-40:], int(lg["data"], 16) / 1e6,
                         lg["transactionHash"]))
    done += 1
    if done % 25 == 0:
        print(f"  chunk {done} block {to} logs {len(rows)} failed {failed}", flush=True)
    b = to + 1

agg = collections.defaultdict(lambda: [0, 0.0, set()])
for _, seller, payer, val, _tx in rows:
    a = agg[seller]
    a[0] += 1
    a[1] += val
    a[2].add(payer)

print(f"\nCHUNKS {done} FAILED {failed} LOGS {len(rows)}")
w = csv.writer(sys.stdout)
w.writerow(["seller_address", "name", "transfers", "usdc", "unique_payers"])
for addr, name in SELLERS.items():
    n, usd, payers = agg.get(addr, [0, 0.0, set()])
    w.writerow([addr, name, n, f"{usd:.6f}", len(payers)])
