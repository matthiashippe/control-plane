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

    return {
        "measured_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "data_through": newest,
        "window_from": cutoff,
        "transfers_30d": len(window),
        "usdc_30d": round(sum(float(r["usdc"]) for r in window), 6),
        "wallets_30d": len(wallets),
        "first_time_wallets_30d": len(wallets - earlier),
        "payments_per_wallet_30d": round(len(window) / len(wallets), 2) if wallets else 0,
        "largest_wallet_share_30d": round(max(per_wallet.values()) / len(window) * 100, 1) if window else 0,
        "transfers_total": len(rows),
        "usdc_total": round(sum(float(r["usdc"]) for r in rows), 6),
        "wallets_total": len({r["from"].lower() for r in rows}),
        "last_block": max(int(r["block"]) for r in rows),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("files", nargs="+")
    parser.add_argument("--json", action="store_true", help="one line, for the time series")
    args = parser.parse_args()

    values = metrics(load(args.files))
    if args.json:
        print(json.dumps(values, separators=(",", ":")))
        return 0
    for key, value in values.items():
        print(f"{key:28} {value}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
