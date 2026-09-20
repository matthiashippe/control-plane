#!/usr/bin/env python3
"""Is the work any good?

The vision of the bounty market rests on a single unchecked assumption: when several agents compete
for the same paid bounty, at least one of them has to deliver something a human pays for
voluntarily. Conway died on the other side of this market (18,000 sellers, no buyer); if the goods
are no good either, our market is one-sided again, just the other way round.

This script posts a bounty, puts several agents with different genesis prompts on it and lays the
results side by side. It also works out the number that decides the economics of the whole market:
what one attempt costs the player, at our sale price. If N agents compete for a bounty and one
wins, the expected revenue per attempt is price/N. If an attempt costs more than that, the
population loses money, and then it dies, no matter how good the texts are.

The numbers are computed against the provider directly, not against cp.hippe.eu: for the service we
would need a plaintext key that we do not have locally, and obtaining one would mean topping up, so
an on-chain operation that loop-constraints.md forbids. The markup is therefore calculated rather
than measured; the margin itself is covered by tests in src/inference/.

The JSON keys of ergebnisse.json stay German: ops/auftragstest-export.py reads them and writes the
published data set docs/research/data/2026-09-20-auftragstest.json from them, which is linked from
the landing page under CC0.

  OPENROUTER_API_KEY=... ops/auftragstest.py --auftrag <file.md> --agenten <file.json>
"""
import argparse, json, os, pathlib, sys, time, urllib.error, urllib.request

API = "https://openrouter.ai/api/v1/chat/completions"
# The markup from src/inference/: purchase price times MARKUP is what the player pays.
MARKUP = 1.3


def ask(model: str, system: str, brief: str, key: str, timeout: int = 180) -> dict:
    body = json.dumps({
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": brief}],
        "usage": {"include": True},
    }).encode()
    req = urllib.request.Request(API, data=body, headers={
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--auftrag", required=True, help="file holding the bounty brief")
    p.add_argument("--agenten", required=True, help="JSON list of {name, genesis}")
    p.add_argument("--modell", default="openai/gpt-5.2")
    p.add_argument("--out", default=".scratch/gtm/auftragstest")
    a = p.parse_args()

    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        print("OPENROUTER_API_KEY is missing", file=sys.stderr)
        return 2

    brief = pathlib.Path(a.auftrag).read_text(encoding="utf-8").strip()
    agents = json.loads(pathlib.Path(a.agenten).read_text(encoding="utf-8"))
    out = pathlib.Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    print(f"Brief ({len(brief.split())} words), model {a.modell}, {len(agents)} agents\n")
    print("=" * 78)
    print(brief)
    print("=" * 78 + "\n")

    results = []
    for ag in agents:
        t0 = time.time()
        try:
            answer = ask(a.modell, ag["genesis"], brief, key)
        except urllib.error.HTTPError as e:
            print(f"-- {ag['name']}: ERROR {e.code} {e.read()[:200]!r}\n")
            continue
        seconds = time.time() - t0
        text = (answer["choices"][0]["message"]["content"] or "").strip()
        u = answer.get("usage", {}) or {}
        # OpenRouter reports the purchase price of the call in `usage.cost` (USD).
        purchase = float(u.get("cost") or 0.0)
        sale = purchase * MARKUP
        results.append({
            "name": ag["name"], "genesis": ag["genesis"], "text": text,
            "sekunden": round(seconds, 1),
            "tokens": u.get("total_tokens"),
            "einkauf_usd": purchase, "verkauf_usd": sale,
            "woerter": len(text.split()),
        })
        (out / f"{ag['name']}.md").write_text(
            f"# {ag['name']}\n\n> {ag['genesis']}\n\n---\n\n{text}\n", encoding="utf-8")
        print(f"-- {ag['name']}  ({seconds:.1f}s, {u.get('total_tokens')} tokens, "
              f"purchase ${purchase:.4f}, sale ${sale:.4f}, {len(text.split())} words)")
        print(f"   Genesis: {ag['genesis'][:90]}")
        print()
        print(text)
        print()

    if not results:
        print("No result.", file=sys.stderr)
        return 1

    n = len(results)
    average = sum(e["verkauf_usd"] for e in results) / n
    most_expensive = max(e["verkauf_usd"] for e in results)
    print("=" * 78)
    print(f"{n} attempts, sale price on average ${average:.4f}, most expensive ${most_expensive:.4f}.")
    print(f"What we earn on one bounty with {n} entrants: "
          f"${sum(e['verkauf_usd'] for e in results):.4f} revenue, of which "
          f"${sum(e['verkauf_usd'] - e['einkauf_usd'] for e in results):.4f} margin.")
    # The number that decides the market.
    break_even = average * n
    print(f"Break-even of the bounty price at {n} entrants: ${break_even:.4f}. "
          f"Below that the population loses money on average.")
    (out / "ergebnisse.json").write_text(
        json.dumps({"auftrag": brief, "modell": a.modell, "ergebnisse": results},
                   ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWritten to {out}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
