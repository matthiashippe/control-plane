#!/usr/bin/env python3
"""
Compares two directory scans and shows what has moved.

    python3 x402-comparison.py old.csv new.csv

A snapshot says what the market looks like. Only the comparison says whether it is growing, and on
the way it answers a question that a single scan could not settle: a fresh `last_updated` only
means that an old entry did business, not that it is new. Anyone who wants to know whether a
facilitator still takes on new sellers at all needs two points.
"""
import csv, collections, sys


def read_scan(path: str) -> dict:
    # The key is directory plus URL: 983 services are listed in both directories, and with the URL
    # alone one entry overwrites the other. The first draft counted 20.543 instead of 21.545 rows
    # that way, without it being noticed.
    with open(path) as f:
        return {(r["verzeichnis"], r["resource"]): r for r in csv.DictReader(f) if r.get("resource")}


def as_int(s) -> int:
    try:
        return int(s)
    except (TypeError, ValueError):
        return 0


def main(a_path: str, b_path: str) -> None:
    a, b = read_scan(a_path), read_scan(b_path)
    added = [r for k, r in b.items() if k not in a]
    gone = [r for k, r in a.items() if k not in b]
    print(f"before {len(a)} services, after {len(b)}  ({len(b) - len(a):+d})")
    print(f"  newly added:  {len(added)}")
    print(f"  disappeared:  {len(gone)}")

    if added:
        print("\n  The new ones by directory and protocol version:")
        for (v, ver), n in sorted(collections.Counter((r["verzeichnis"], r["x402_version"]) for r in added).items()):
            print(f"    {v:6} x402Version {ver}: {n}")
        print("\n  Examples:")
        for r in added[:5]:
            print(f"    {r['resource'][:78]}")

    ours = [r for r in b.values() if "hippe" in (r.get("host") or "")]
    print(f"\n  Entries with our host: {len(ours)}")
    for r in ours:
        print(f"    {r['resource']}  (x402Version {r['x402_version']}, last_updated {r['last_updated']})")

    # Demand: only Coinbase reports it, and only for services that appear in both scans.
    both = [(a[k], b[k]) for k in a.keys() & b.keys() if a[k]["verzeichnis"] == "cdp"]
    risen = [(x, y) for x, y in both if as_int(y["calls_30d"]) > as_int(x["calls_30d"])]
    total_a = sum(as_int(x["calls_30d"]) for x, _ in both)
    total_b = sum(as_int(y["calls_30d"]) for _, y in both)
    print(f"\n  Demand across the {len(both)} services present in both scans:")
    print(f"    calls in 30 days: {total_a:,} -> {total_b:,}  ({total_b - total_a:+,})")
    print(f"    of those with more calls than before: {len(risen)}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__.strip().splitlines()[2].strip(), file=sys.stderr)
        raise SystemExit(2)
    main(sys.argv[1], sys.argv[2])
