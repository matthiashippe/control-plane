#!/usr/bin/env python3
"""Which claim in a result is not in the briefing?

The bounty market depends on a buyer being able to judge the work without being an expert. They
cannot judge taste, but they can judge invented facts, and in the markets we aim at those are the
real risk: in the test run of 20.09. `opti-7734` wrote "Viewings available on short notice" into a
Dubai listing, a promise the briefing does not contain and for which somebody is liable in the end.

The script takes the results from ops/bounty-test.py and has every submission checked against its
own briefing. Three kinds of finding are told apart because they weigh differently:
`rechenfehler` derives a number from the briefing and gets it wrong, `widerspruch` says something
other than the briefing, `unbelegt` says something that is neither in it nor follows from it.

What is correctly derived from the briefing is explicitly NOT a finding. The first run on 20.09.
got exactly that wrong: it reported the correct calculation AED 18 times 1,240 sqft equals AED
22,320 as an invention and would thereby have punished the best thing the agents did, namely
working out the number the briefing explicitly asks for.

**The checker is itself checked.** A model that looks for fabrications fabricates findings: it
quotes sentences that do not appear in the submission at all. So every finding has to bring a
verbatim quote, and every quote is found again in the submission programmatically before the
finding counts. What cannot be found again drops out and is counted as `verworfen`. That rate is
the quality of the checker and belongs in every report.

The JSON keys of the prompt and of the report (befunde, zitat, art, begruendung and the three
kinds rechenfehler, widerspruch, unbelegt) stay German on purpose: the same names are in the
published data set docs/research/data/2026-09-20-auftragstest.json, which is linked from the
landing page under CC0, and they can only be renamed together with it.

  OPENROUTER_API_KEY=... ops/invention-check.py --results <path/ergebnisse.json>
"""
import argparse, json, os, pathlib, re, sys, unicodedata, urllib.error, urllib.request

API = "https://openrouter.ai/api/v1/chat/completions"

INSTRUCTION_FACTUAL = """You check a submitted piece of work against the briefing it was written for.

Your job is to find claims the briefing does not support. Be precise about what that means, because
the most valuable work a writer does is to DERIVE facts the briefing only implies.

NOT a finding, never list these:
- A claim that follows from the briefing by correct arithmetic. If the briefing gives a rate and a
  quantity, their correct product is supported, not invented. Do the multiplication yourself before
  you judge.
- A claim that is a direct restatement or a necessary consequence of something in the briefing.
- Ordinary connective phrasing, tone, or self-description of care, quality or attention.

A finding, list these:
- "rechenfehler": the submission derives a number from the briefing and gets it WRONG. Compute the
  correct value yourself and put it in "begruendung". This is the most serious kind.
- "widerspruch": the submission states something the briefing contradicts.
- "unbelegt": the submission states a checkable fact that the briefing neither contains nor implies,
  and that cannot be derived from it. A service offered, a guarantee, an availability, a channel, a
  capability, a date, a credential.

Rules you must follow exactly:
- Every finding MUST include "zitat": the exact substring from the SUBMISSION, copied character for
  character, long enough to locate but no longer than one sentence. Never paraphrase it. Never
  quote from the briefing in this field.
- If the submission contains no unsupported claims, return an empty list. An empty list is a valid
  and common answer. Do not invent findings to appear thorough.

Answer with JSON only, no prose, in this shape:
{"befunde": [{"zitat": "...", "art": "rechenfehler"|"widerspruch"|"unbelegt", "begruendung": "one short sentence"}]}"""

# For creative bounties. The run of 20.09. showed why the second version is needed: on marketing
# copy the strict check reported 23 findings across 9 submissions, so practically every sentence.
# Marketing copy always invents, because a briefing of a hundred words cannot cover a text of a
# hundred words. So only what binds the buyer is reported.
INSTRUCTION_CREATIVE = """You check a submitted piece of creative copy against the briefing it
was written for.

Creative copy necessarily adds. A hundred-word briefing cannot cover a hundred-word text, so the
writer fills in connective tissue, rhythm and framing. That is the work, not a defect. Do not
report it.

Report ONLY what the client could be held to if it is not true. Ask of each candidate: if a
customer arrived expecting this and it did not exist, would the client have a problem? If no, it is
not a finding.

A finding, list these:
- "rechenfehler": the copy derives a number from the briefing and gets it WRONG. Compute the
  correct value yourself and put it in "begruendung".
- "widerspruch": the copy states something the briefing contradicts.
- "unbelegt": the copy commits the client to something the briefing does not support. Equipment or
  specifications not listed, a service not offered, a contact or booking channel that may not
  exist, a credential, a certification, a guarantee, a price, a date, an availability, a capacity.

NOT a finding, never list these:
- Tone, rhythm, framing, or any self-description of care, quality, attention or experience.
- A claim that follows from the briefing by correct arithmetic or as a necessary consequence.
- Plausible detail that binds the client to nothing.

Rules you must follow exactly:
- Every finding MUST include "zitat": the exact substring from the SUBMISSION, copied character for
  character, long enough to locate but no longer than one sentence. Never paraphrase it. Never
  quote from the briefing in this field.
- If the copy commits the client to nothing unsupported, return an empty list. That is a valid and
  common answer. Do not invent findings to appear thorough.

Answer with JSON only, no prose, in this shape:
{"befunde": [{"zitat": "...", "art": "rechenfehler"|"widerspruch"|"unbelegt", "begruendung": "one short sentence"}]}"""

INSTRUCTIONS = {"faktisch": INSTRUCTION_FACTUAL, "schoepferisch": INSTRUCTION_CREATIVE}


def normalise(s: str) -> str:
    """Quote comparison without the differences no human reads as a difference.

    The models deliver typographic characters (non-breaking hyphen U+2011, apostrophe U+2019, em
    dash), and when quoting, the checker often silently normalises them to ASCII. Without this
    alignment a correct finding falls through as "not findable".
    """
    s = unicodedata.normalize("NFKC", s)
    for a, b in [("‑", "-"), ("‐", "-"), ("–", "-"), ("—", "-"),
                 ("’", "'"), ("‘", "'"), ("“", '"'), ("”", '"'),
                 (" ", " "), (" ", " ")]:
        s = s.replace(a, b)
    return re.sub(r"\s+", " ", s).strip().lower()


def ask(model: str, briefing: str, submission: str, key: str, mode: str = "faktisch") -> dict:
    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": INSTRUCTIONS[mode]},
            {"role": "user", "content": f"BRIEFING:\n{briefing}\n\n---\n\nSUBMISSION:\n{submission}"},
        ],
        "response_format": {"type": "json_object"},
    }).encode()
    req = urllib.request.Request(API, data=body, headers={
        "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        answer = json.loads(r.read())
    return json.loads(answer["choices"][0]["message"]["content"] or "{}")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--results", required=True, help="ergebnisse.json from ops/bounty-test.py")
    p.add_argument("--model", default="openai/gpt-5.2")
    p.add_argument("--kind", choices=sorted(INSTRUCTIONS), default="faktisch",
                   help="faktisch: every unsupported claim. schoepferisch: only what binds the "
                        "buyer.")
    a = p.parse_args()

    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        print("OPENROUTER_API_KEY is missing", file=sys.stderr)
        return 2

    path = pathlib.Path(a.results)
    data = json.loads(path.read_text(encoding="utf-8"))
    briefing = data["auftrag"]

    total = discarded = 0
    report = []
    for e in data["ergebnisse"]:
        text = e["text"]
        text_norm = normalise(text)
        try:
            raw = ask(a.model, briefing, text, key, a.kind)
        except urllib.error.HTTPError as ex:
            print(f"-- {e['name']}: ERROR {ex.code}", file=sys.stderr)
            continue

        kept, dropped = [], []
        for b in raw.get("befunde", []) or []:
            quote = (b.get("zitat") or "").strip()
            if quote and normalise(quote) in text_norm:
                kept.append(b)
            else:
                dropped.append(b)
        total += len(kept) + len(dropped)
        discarded += len(dropped)

        print(f"-- {e['name']}: {len(kept)} finding(s)"
              + (f", {len(dropped)} discarded (quote not findable)" if dropped else ""))
        for b in kept:
            print(f"   [{b.get('art','?')}] \"{b['zitat']}\"")
            print(f"       {b.get('begruendung','')}")
        for b in dropped:
            print(f"   DISCARDED: {b.get('zitat','')[:70]!r}")
        print()
        report.append({"name": e["name"], "befunde": kept, "verworfen": dropped})

    if total:
        print(f"Checker quality: {total - discarded} of {total} findings backed by a quote "
              f"({100*(total-discarded)//total} %), {discarded} discarded.")
    target = path.parent / f"erfindungspruefung-{a.kind}.json"
    target.write_text(json.dumps({"modell": a.model, "art": a.kind, "bericht": report},
                                 ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Written to {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
