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

  OPENROUTER_API_KEY=... ops/fact-probe.py --probe ops/probes/dubai-facts.json
"""
import argparse, importlib.util, json, os, pathlib, sys

# The checker this probe exercises lives in ops/invention-check.py, and a hyphen cannot appear in
# an import statement. It used to be importable under a one-word German name; the language pass on
# 2026-09-22 renamed the file and left this import pointing at a module that no longer existed, so
# the probe raised ModuleNotFoundError on every run from then until 2026-09-23. Nothing noticed,
# because docs/journeys.md cites its result as evidence and nobody re-ran it. Loading it by path
# keeps the hyphenated filename and makes the dependency explicit enough to fail loudly.
_checker = pathlib.Path(__file__).resolve().parent / "invention-check.py"
if not _checker.is_file():
    sys.exit(f"{_checker} is not there; this probe has nothing to exercise.")
_spec = importlib.util.spec_from_file_location("invention_check", _checker)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
ask, normalise = _mod.ask, _mod.normalise


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--probe", required=True)
    p.add_argument("--model", default="openai/gpt-5.2")
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
        raw = ask(a.model, briefing, text, key)
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
