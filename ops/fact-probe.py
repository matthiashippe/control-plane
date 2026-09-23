#!/usr/bin/env python3
"""Does the fabrication check fire at all on what it is supposed to fire on?

In cycle 48 the finding kind `rechenfehler` was added without a single piece of evidence that it
ever fires. A checker nobody checks is the same thing as a test that stays green without its fix.

This sample runs ops/invention-check.py against submissions with known ground truth: one clean
one that must produce no finding, and one with a planted error of each kind. The clean one is the
more important half, because a checker that reports everything is worthless as a quality gate, and
that is exactly where the check on marketing copy failed.

Both are measured separately: hits (was the planted error found, with the right kind) and false
alarms (how many findings came on top that nobody planted).

  OPENROUTER_API_KEY=... ops/pruef-probe.py --probe ops/proben/dubai-fakten.json
"""
import argparse, json, os, pathlib, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from erfindungspruefung import ask, normalise  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--probe", required=True)
    p.add_argument("--modell", default="openai/gpt-5.2")
    a = p.parse_args()

    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        print("OPENROUTER_API_KEY is missing", file=sys.stderr)
        return 2

    d = json.loads(pathlib.Path(a.probe).read_text(encoding="utf-8"))
    briefing = d["briefing"]

    hits = expected_total = false_alarms = 0
    for sample in d["samples"]:
        text = sample["text"]
        text_norm = normalise(text)
        raw = ask(a.modell, briefing, text, key)
        # Only findings with a findable quote count, the same as in the tool itself.
        findings = [b for b in (raw.get("befunde") or [])
                    if (b.get("zitat") or "").strip()
                    and normalise(b["zitat"]) in text_norm]

        outstanding = list(sample["expected"])
        extra = []
        for b in findings:
            match = next((e for e in outstanding
                          if e["art"] == b.get("art")
                          and normalise(e["pattern"]) in normalise(b["zitat"])), None)
            if match:
                outstanding.remove(match)
            else:
                extra.append(b)

        expected_total += len(sample["expected"])
        hits += len(sample["expected"]) - len(outstanding)
        false_alarms += len(extra)

        marker = "OK " if not outstanding else "MISS"
        print(f"-- {marker} {sample['name']}: {len(sample['expected']) - len(outstanding)}"
              f"/{len(sample['expected'])} expected found, {len(extra)} extra")
        for e in outstanding:
            print(f"   NOT FOUND: [{e['art']}] with {e['pattern']!r}")
        for b in findings:
            print(f"   [{b.get('art','?')}] \"{b['zitat'][:90]}\"")
            if b.get("begruendung"):
                print(f"       {b['begruendung'][:120]}")
        print()

    print(f"Hits: {hits}/{expected_total} planted errors found. "
          f"False alarms: {false_alarms} unplanted findings.")
    return 0 if hits == expected_total else 1


if __name__ == "__main__":
    sys.exit(main())
