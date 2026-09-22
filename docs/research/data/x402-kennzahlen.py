#!/usr/bin/env python3
"""
Computes the x402 demand metrics from the directory scan.

    python3 x402-kennzahlen.py 2026-09-20-x402-verzeichnis.csv

Every number in the article comes from this script. Whoever doubts one runs it.
"""
import csv, collections, datetime, json, pathlib, statistics, sys

AS_OF = datetime.datetime(2026, 9, 20, tzinfo=datetime.timezone.utc)


def num(s: str):
    return int(s) if s not in ("", None) else None


def metrics(rows: list) -> dict:
    """The values a time series needs: small, comparable, without prose.

    The keys stay German because they are the published contract of
    /opt/control-plane/x402/kennzahlen.ndjson: src/public/x402.ts, ops/freshness.sh and
    ops/daten-pruefen.py read them by these names, and the series is append-only, so a renamed
    key would split every line written before the rename from every line written after.
    """
    cdp = [r for r in rows if r["verzeichnis"] == "cdp"]
    calls = [num(r["calls_30d"]) for r in cdp]
    with_data = [c for c in calls if c is not None]
    payers = [x for x in (num(r["unique_payers_30d"]) for r in cdp) if x is not None]
    sorted_desc = sorted(with_data, reverse=True)
    rows_with_data = [r for r in cdp if num(r["calls_30d"]) is not None]
    largest = max(rows_with_data, key=lambda r: num(r["calls_30d"])) if rows_with_data else None
    return {
        "stichtag": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "dienste_gesamt": len(rows),
        "dienste_eindeutig": len({(r["verzeichnis"], r["resource"]) for r in rows}),
        "urls_eindeutig": len({r["resource"] for r in rows}),
        "dienste_cdp": len(cdp),
        "dienste_payai": len(rows) - len(cdp),
        "anbieter": len({r["host"] for r in rows if r["host"]}),
        "aufrufe_30d": sum(with_data),
        "aufrufe_median": statistics.median(with_data) if with_data else 0,
        "anteil_top10": round(sum(sorted_desc[:10]) / sum(with_data) * 100, 2) if with_data else 0,
        "anteil_top100": round(sum(sorted_desc[:100]) / sum(with_data) * 100, 2) if with_data else 0,
        "mit_einem_zahler": sum(1 for x in payers if x == 1),
        "mit_5_zahlern": sum(1 for x in payers if x >= 5),
        "mit_20_zahlern": sum(1 for x in payers if x >= 20),
        "mit_100_zahlern": sum(1 for x in payers if x >= 100),
        # The early indicator. Coinbase fills the quality fields in late: on 20.09.2026
        # blockrun.ai/api/v1/chat/completions stood in the directory with empty fields and reported
        # 346,869 calls one day later for the same trailing period, forty per cent of the whole
        # directory. Every total here is therefore a lower bound, and this number says by how much
        # that lower bound can be off at most.
        "ohne_nachfragedaten": len(cdp) - len(with_data),
        # Without the largest service a jump in the series cannot be attributed. On 21.09.2026
        # aufrufe_30d jumped by 77 per cent, and pinning it to a single endpoint cost an hour,
        # because the series did not carry it.
        "groesster_dienst": largest["resource"] if largest else None,
        "groesster_aufrufe": num(largest["calls_30d"]) if largest else 0,
        "groesster_zahler": num(largest["unique_payers_30d"]) if largest else 0,
        "groesster_anteil": round(num(largest["calls_30d"]) / sum(with_data) * 100, 2) if largest and with_data else 0,
        "mit_bazaar_block": sum(1 for r in rows if r["hat_bazaar_block"] == "1"),
        "conway_bezug": sum(1 for r in rows if "conway" in (r["resource"] or "").lower()),
    }


def dataset(rows: list, path: str) -> dict:
    """The published metrics JSON, from the CSV next to it.

    Until 22.09.2026 this file sat in the directory built by hand, and because it was built by
    hand it did not survive the correction of the CSV: it went on carrying the seven numbers of a
    local run from 03:22 UTC (15,189 instead of 15,192, 20,783 instead of 20,789, 867,827 instead
    of 867,813 and so on), while the README two sections further down described exactly this
    deviation as the error and recommended the same file anyway. An adversarial read found it.

    Now it comes from the same CSV that lies beside it:

        python3 x402-kennzahlen.py 2026-09-21-x402-verzeichnis.csv --dataset > 2026-09-21-x402-kennzahlen.json

    Whoever doubts the file runs the command and compares.
    """
    cdp = [r for r in rows if r["verzeichnis"] == "cdp"]
    payai = [r for r in rows if r["verzeichnis"] == "payai"]
    with_data = [c for c in (num(r["calls_30d"]) for r in cdp) if c is not None]
    sorted_desc = sorted(with_data, reverse=True)
    payers = [x for x in (num(r["unique_payers_30d"]) for r in cdp) if x is not None]
    rows_with_data = [r for r in cdp if num(r["calls_30d"]) is not None]
    largest = max(rows_with_data, key=lambda r: num(r["calls_30d"])) if rows_with_data else None
    return {
        "measured_on": pathlib.Path(path).name[:10],
        "source": f"docs/research/data/{pathlib.Path(path).name}",
        "coinbase_entries": len(cdp),
        "payai_entries": len(payai),
        "in_both": len({r["resource"] for r in cdp} & {r["resource"] for r in payai}),
        "distinct_services": len({r["resource"] for r in rows}),
        "providers": len({r["host"] for r in rows if r["host"]}),
        "with_demand_data": len(with_data),
        "without_demand_data": len(cdp) - len(with_data),
        "calls_30d_total": sum(with_data),
        "top10_share_percent": round(sum(sorted_desc[:10]) / sum(with_data) * 100, 1) if with_data else 0,
        "top100_share_percent": round(sum(sorted_desc[:100]) / sum(with_data) * 100, 1) if with_data else 0,
        "largest_service": {
            "url": largest["resource"],
            "calls_30d": num(largest["calls_30d"]),
            "payers_30d": num(largest["unique_payers_30d"]),
            "share_percent": round(num(largest["calls_30d"]) / sum(with_data) * 100, 1),
        } if largest and with_data else None,
        "services_with_20_or_more_payers": sum(1 for x in payers if x >= 20),
        "note": (
            "Coinbase fills the demand fields late, so a scan covers only the services that "
            "already carry them: see with_demand_data against coinbase_entries. calls_30d_total "
            "is one day's reading of a trailing 30-day window and not a running count, so it "
            "moves in both directions."
        ),
    }


def main(path: str) -> None:
    # The German wording of the lines below is load-bearing, not leftover: ops/vor-dem-artikel.py
    # parses this output with fixed patterns ("Eindeutige Dienst-URLs: ", "Verschiedene Anbieter
    # (Host): ", "Nachfragedaten: N von", "Aufrufe in 30 Tagen, Summe:", "genau EINER zahlenden
    # Wallet: ", "mindestens  20 Zahlern:", including the column padding). Rewording one of them
    # without changing that file turns the check before publishing green without it comparing
    # anything. They go over together with the patterns, not here.
    rows = [r for r in csv.DictReader(open(path))]
    if "--dataset" in sys.argv:
        print(json.dumps(dataset(rows, path), indent=4))
        return
    if "--json" in sys.argv:
        print(json.dumps(metrics(rows), separators=(",", ":")))
        return
    cdp = [r for r in rows if r["verzeichnis"] == "cdp"]
    payai = [r for r in rows if r["verzeichnis"] == "payai"]
    cdp_urls = {r["resource"] for r in cdp}
    payai_urls = {r["resource"] for r in payai}
    print(f"Entries in total: {len(rows)}  (Coinbase {len(cdp)}, PayAI {len(payai)})")
    print(f"Eindeutige Dienst-URLs: {len(cdp_urls | payai_urls)}"
          f"  (in both directories: {len(cdp_urls & payai_urls)})")
    print(f"Verschiedene Anbieter (Host): {len({r['host'] for r in rows if r['host']})}")
    print()

    calls = [num(r["calls_30d"]) for r in cdp]
    payers_raw = [num(r["unique_payers_30d"]) for r in cdp]
    with_data = [c for c in calls if c is not None]
    print(f"Nur Coinbase liefert Nachfragedaten: {len(with_data)} von {len(cdp)} Diensten")
    print(f"  Aufrufe in 30 Tagen, Summe:  {sum(with_data):,}")
    print(f"  Median per service:          {statistics.median(with_data):g}")
    sorted_desc = sorted(with_data, reverse=True)
    for n in (10, 100):
        print(f"  Share of the largest {n:>3}:     {sum(sorted_desc[:n])/sum(with_data)*100:.1f} %")
    print()

    buckets = collections.Counter()
    for c in with_data:
        buckets["0" if c == 0 else "1-9" if c < 10 else "10-99" if c < 100 else "100-999" if c < 1000 else "1000+"] += 1
    print("  Calls per service in 30 days:")
    for k in ("0", "1-9", "10-99", "100-999", "1000+"):
        print(f"    {k:>8}: {buckets[k]:6}  {buckets[k]/len(with_data)*100:5.1f} %")
    print()

    payers = [x for x in payers_raw if x is not None]
    single = [(num(r["calls_30d"]) or 0) for r in cdp if num(r["unique_payers_30d"]) == 1]
    print(f"  Dienste mit genau EINER zahlenden Wallet: {len(single)}  ({len(single)/len(payers)*100:.1f} %)")
    print(f"    of those with at most 3 calls:         {sum(1 for c in single if c <= 3)}"
          f"  ({sum(1 for c in single if c <= 3)/len(single)*100:.1f} % of that group)")
    for threshold in (5, 20, 100):
        n = sum(1 for x in payers if x >= threshold)
        print(f"  Dienste mit mindestens {threshold:>3} Zahlern:      {n:6}  ({n/len(payers)*100:.2f} %)")
    print()

    age = collections.Counter()
    for r in cdp:
        t = r["last_called_at"]
        if not t:
            age["never"] += 1
            continue
        d = (AS_OF - datetime.datetime.fromisoformat(t.replace("Z", "+00:00"))).days
        age["today" if d < 1 else "7 days" if d < 7 else "30 days" if d < 30 else "older"] += 1
    print("  Last called:")
    for k in ("today", "7 days", "30 days", "older", "never"):
        if age[k]:
            print(f"    {k:>8}: {age[k]:6}  {age[k]/len(cdp)*100:5.1f} %")
    print()
    with_bazaar = sum(1 for r in rows if r["hat_bazaar_block"] == "1")
    print(f"  With a bazaar declaration of their own: {with_bazaar}  ({with_bazaar/len(rows)*100:.1f} %)")
    conway = [r for r in rows if "conway" in (r["resource"] or "").lower()]
    print(f"  Referring to the Conway runtime:        {len(conway)}")


if __name__ == "__main__":
    main(next((a for a in sys.argv[1:] if not a.startswith("--")), "2026-09-20-x402-verzeichnis.csv"))
