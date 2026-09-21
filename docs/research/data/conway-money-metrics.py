#!/usr/bin/env python3
"""One line of metrics about the money still flowing into Conway, out of the transfer files.

    python3 conway-geld-kennzahlen.py base.csv [delta.csv ...] --json

Every figure the landing page and the article make about Conway's income comes from here, so that
a claim from September can be re-checked in October instead of quietly ageing. The window is the
30 days before the newest transfer in the data, not before today: the data ends where the last
scan ended, and a window that runs past it would report a decline that is only a missing scan.

Keys are English, unlike the older x402 series, because everything new in this repo is
(`loop-constraints.md`, "Alles im Code ist Englisch").
"""
import argparse, collections, csv, datetime, json, sys

FIELDS = ["block", "timestamp_utc", "from", "usdc", "tx_hash"]

# The smallest tier Conway sells is 5 USD (`TOPUP_TIERS` in `src/conway/topup.ts` upstream), so a
# transfer below that cannot be a credit purchase. It matters more than it sounds: in the 30 days
# to 20 September 2026, 18 of 104 transfers were dust from two wallets, together worth 0.0489 USDC.
# Counting those as payments inflates the transfer count by a fifth and the payments-per-wallet
# figure with it, which is exactly the kind of number a reader checks first.
TOPUP_MIN_USDC = 5.0


def load(paths: list[str]) -> list[dict]:
    rows: dict[str, dict] = {}
    for path in paths:
        with open(path) as handle:
            has_header = handle.readline().startswith("block,")
            handle.seek(0)
            reader = csv.DictReader(handle) if has_header else csv.DictReader(handle, FIELDS)
            for row in reader:
                if not row.get("tx_hash"):
                    continue
                # A transfer can appear in two files when a delta overlaps the base, so rows are
                # keyed rather than appended. One tx hash can carry two transfers, which is why the
                # sender and the amount are part of the key.
                rows[f'{row["tx_hash"]}:{row["from"]}:{row["usdc"]}'] = row
    return sorted(rows.values(), key=lambda r: (int(r["block"]), r["tx_hash"]))


def metrics(rows: list[dict]) -> dict:
    if not rows:
        raise SystemExit("no transfers in the given files")
    newest = max(r["timestamp_utc"] for r in rows)
    end = datetime.datetime.strptime(newest, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)
    cutoff = (end - datetime.timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")

    window = [r for r in rows if r["timestamp_utc"] >= cutoff]
    earlier = {r["from"].lower() for r in rows if r["timestamp_utc"] < cutoff}
    wallets = {r["from"].lower() for r in window}
    per_wallet = collections.Counter(r["from"].lower() for r in window)

    topups = [r for r in window if float(r["usdc"]) >= TOPUP_MIN_USDC]
    topup_wallets = {r["from"].lower() for r in topups}
    earlier_topup_wallets = {
        r["from"].lower() for r in rows
        if r["timestamp_utc"] < cutoff and float(r["usdc"]) >= TOPUP_MIN_USDC
    }

    return {
        "measured_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "data_through": newest,
        "window_from": cutoff,
        "transfers_30d": len(window),
        "usdc_30d": round(sum(float(r["usdc"]) for r in window), 6),
        "wallets_30d": len(wallets),
        "first_time_wallets_30d": len(wallets - earlier),
        "payments_per_wallet_30d": round(len(window) / len(wallets), 2) if wallets else 0,
        "topups_30d": len(topups),
        "topup_usdc_30d": round(sum(float(r["usdc"]) for r in topups), 6),
        "topup_wallets_30d": len(topup_wallets),
        "first_time_topup_wallets_30d": len(topup_wallets - earlier_topup_wallets),
        "topups_per_wallet_30d": round(len(topups) / len(topup_wallets), 2) if topup_wallets else 0,
        "dust_transfers_30d": len(window) - len(topups),
        # Which tiers were bought, because the answer turned out to be the interesting part. Over
        # the whole history the mix is 5,836 purchases at 5 USD, 699 at 25, 63 at 100 and a handful
        # larger. Since 21 August 2026 every single purchase is the 5 USD minimum, which is what
        # the runtime buys by itself at startup when its balance call fails.
        "topup_tiers_30d": dict(sorted(
            collections.Counter(f'{float(r["usdc"]):.0f}' for r in topups).items(),
            key=lambda kv: int(kv[0]),
        )),
        "largest_wallet_share_30d": round(max(per_wallet.values()) / len(window) * 100, 1) if window else 0,
        "topup_tiers_total": dict(sorted(
            collections.Counter(
                f'{float(r["usdc"]):.0f}' for r in rows if float(r["usdc"]) >= TOPUP_MIN_USDC
            ).items(),
            key=lambda kv: int(kv[0]),
        )),
        "transfers_total": len(rows),
        "usdc_total": round(sum(float(r["usdc"]) for r in rows), 6),
        "wallets_total": len({r["from"].lower() for r in rows}),
        "last_block": max(int(r["block"]) for r in rows),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("files", nargs="+")
    parser.add_argument("--json", action="store_true", help="one line, for the time series")
    parser.add_argument("--recent", type=int, metavar="N",
                        help="print the newest N transfers as CSV instead of the metrics")
    args = parser.parse_args()

    rows = load(args.files)
    if args.recent:
        # The receipts behind the claim, newest first. A reader who does not believe that money
        # still arrives can take any of these hashes to a block explorer. Dust is left out here for
        # the same reason it is counted separately above: it is not somebody buying credits.
        topups = [r for r in rows if float(r["usdc"]) >= TOPUP_MIN_USDC]
        print(",".join(FIELDS))
        for row in reversed(topups[-args.recent:]):
            print(",".join(row[field] for field in FIELDS))
        return 0

    values = metrics(rows)
    if args.json:
        print(json.dumps(values, separators=(",", ":")))
        return 0
    for key, value in values.items():
        print(f"{key:28} {value}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
