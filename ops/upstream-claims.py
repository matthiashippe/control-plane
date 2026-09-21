#!/usr/bin/env python3
"""Everything this project asserts about the upstream runtime, against the pinned commit.

`/fix`, the article and `docs/without-control-plane.md` all rest on one asymmetry: a Conway
automaton that cannot sign up keeps paying anyway, because one failed balance call is handled three
different ways and two of them spend. That is not our measurement, it is our reading of somebody
else's code, and it is the part a reader can check line by line.

Until 2026-09-21 nobody had checked it against the code. The claims were written while reading it
and then repeated across three surfaces for two days.

    ops/upstream-claims.py

Reads the pin out of `harness/runtime/Dockerfile` and fetches the files at that revision through
`gh`, so the revision is never typed. It then does the same against `main`, because the first
objection to any of this is "that was an old version", and on 2026-09-21 the answer was that every
claim holds on today's default branch too.

Exit 0 means every claim holds at both. A claim that fails only on `main` is not an error in
anything published: it means the wall is being taken down, which is the single most important thing
that could happen to the article, and it has to be said before the piece goes out rather than after.

It is not in `ops/check-all.sh` on purpose: six API calls per revision, and neither the pin nor
that repository moves often. `ops/conway-zeitreihe.sh` already watches the repository daily and
reports its last push. A new push there is the signal to run this.

The patterns are strict about whitespace in two places. A formatting-only change upstream would
raise a false alarm, which costs somebody five minutes of reading the code. The reverse mistake
costs the credibility of everything built on top, so the strictness is deliberate.
"""
import base64
import json
import re
import subprocess
import sys
from pathlib import Path

DOCKERFILE = Path("harness/runtime/Dockerfile")
REPO = "Conway-Research/automaton"
befunde = []


def ok(was: str, beleg: str = "") -> None:
    print(f"  ok      {was}" + (f"\n          {beleg}" if beleg else ""))


def falsch(was: str, hinweis: str) -> None:
    befunde.append(was)
    print(f"  WRONG   {was}\n          {hinweis}")


def pin() -> str:
    m = re.search(r"ARG AUTOMATON_REV=(\S+)", DOCKERFILE.read_text())
    if not m:
        print(f"No AUTOMATON_REV in {DOCKERFILE}. Nothing to check against.")
        sys.exit(2)
    return m.group(1)


def datei(pfad: str, rev: str) -> str:
    roh = subprocess.run(
        ["gh", "api", f"repos/{REPO}/contents/{pfad}?ref={rev}", "--jq", ".content"],
        capture_output=True, text=True, timeout=30,
    )
    if roh.returncode != 0 or not roh.stdout.strip():
        print(f"  could not fetch {pfad} at {rev}: {roh.stderr.strip()[:120]}")
        sys.exit(2)
    return base64.b64decode(roh.stdout).decode("utf-8", "replace")


DATEIEN = [
    "src/index.ts",
    "src/heartbeat/tick-context.ts",
    "src/heartbeat/tasks.ts",
    "src/agent/loop.ts",
    "src/conway/credits.ts",
]


def pruefe(rev: str) -> int:
    global befunde
    befunde = []
    print(f"What we say about {REPO} at {rev}\n")
    q = {p: datei(p, rev) for p in DATEIEN}

    # 1. The thinking path refuses to spend. This is the claim that makes the asymmetry a story
    #    rather than a bug report: the one fallback that costs nothing is the one that gives up.
    if "creditsCents: -1" in q["src/agent/loop.ts"]:
        ok("the thinking path substitutes -1 when the balance call fails and there is no cache",
           "src/agent/loop.ts returns creditsCents: -1")
    else:
        falsch("the thinking path no longer substitutes -1",
               "/fix and the article both describe the sentinel by name")

    # 2. And -1 resolves to a tier that buys nothing, while 0 resolves to one that buys.
    tiers = q["src/conway/credits.ts"]
    if re.search(r"if \(creditsCents >= 0\) return \"critical\";\s*\n\s*return \"dead\";", tiers):
        ok("zero is critical and anything negative is dead",
           "src/conway/credits.ts getSurvivalTier")
    else:
        falsch("getSurvivalTier no longer maps 0 to critical and negatives to dead",
               "the whole asymmetry is this mapping; without it the three paths are the same path")

    # 3. The startup path substitutes 0, which is 'critical', which buys.
    if re.search(r"getCreditsBalance\(\)\.catch\(\(\) => 0\)", q["src/index.ts"]):
        ok("the startup path substitutes 0 and goes on to buy", "src/index.ts .catch(() => 0)")
    else:
        falsch("the startup path no longer substitutes 0",
               "the claim that a fresh start buys 5 USDC rests on this line")

    # 4. The heartbeat leaves the value at 0 on failure, rather than propagating the error.
    tick = q["src/heartbeat/tick-context.ts"]
    if re.search(r"let creditBalance = 0;\s*\n\s*try \{\s*\n\s*creditBalance = await conway\.getCreditsBalance\(\);\s*\n\s*\} catch", tick):
        ok("the heartbeat leaves the balance at 0 when the call throws",
           "src/heartbeat/tick-context.ts logs and carries on")
    else:
        falsch("the heartbeat no longer falls back to 0",
               "the claim that it buys again every five minutes starts here")

    # 5. And buys again on a five minute cooldown for as long as the wallet holds 5 USDC.
    tasks = q["src/heartbeat/tasks.ts"]
    hat_schwelle = re.search(r"MIN_TOPUP_USD = 5\b", tasks)
    hat_cooldown = re.search(r"AUTO_TOPUP_COOLDOWN_MS = 5 \* 60 \* 1000", tasks)
    hat_bedingung = re.search(r"balance >= MIN_TOPUP_USD && \(ctx\.survivalTier === \"critical\"", tasks)
    if hat_schwelle and hat_cooldown and hat_bedingung:
        ok("it retries every five minutes while the wallet holds 5 USDC",
           "src/heartbeat/tasks.ts: MIN_TOPUP_USD, AUTO_TOPUP_COOLDOWN_MS and the tier condition")
    else:
        fehlt = [n for n, t in [("the 5 USDC threshold", hat_schwelle),
                                ("the five minute cooldown", hat_cooldown),
                                ("the tier condition", hat_bedingung)] if not t]
        falsch(f"the heartbeat's topup changed: {', '.join(fehlt)} not found",
               "both /fix and the article say 'again every five minutes for as long as the wallet "
               "holds 5 USDC'")

    # 7. The wizard copies the top-level model down, so the trap is hand-editing and not the wizard.
    #
    # Added on 2026-09-22 after an adversarial read found this one wrong on two of the three
    # surfaces it appears on. The article and /fix both said the router reads the nested field
    # "not the top-level one the setup wizard writes", which reads as the wizard writing a field
    # the router ignores. It does not: `configure.ts` assigns the chosen model to both. The trap is
    # a hand-edited automaton.json, where the nested block keeps its defaults.
    #
    # docs/without-control-plane.md had it right since 2026-09-21 and nothing held the short
    # versions against the long one. That is the seventh claim, and it is the one nobody checked.
    cfg = datei("src/setup/configure.ts", rev)
    if re.search(r"config\.inferenceModel = await pickFromList\([^)]*\);\s*\n\s*s\.inferenceModel = config\.inferenceModel;", cfg):
        ok("the setup wizard copies the top-level model into modelStrategy",
           "src/setup/configure.ts assigns s.inferenceModel = config.inferenceModel")
    else:
        falsch("the wizard no longer copies the top-level model down",
               "/fix and docs/without-control-plane.md both say the trap is hand-editing the file, "
               "not the wizard; if the wizard stopped copying, the trap is the wizard again")

    # 6. Neither spending path reads the cache, which is why route 2 does not protect anybody.
    #    Checked as an absence, so it is stated narrowly: the two files that spend never mention it.
    if "last_known_balance" not in q["src/index.ts"] and "last_known_balance" not in tick:
        ok("neither spending path reads the cached balance",
           "last_known_balance appears in neither src/index.ts nor tick-context.ts")
    else:
        falsch("a spending path now reads last_known_balance",
               "docs/without-control-plane.md says route 2 does not protect you here")

    print()
    if befunde:
        print(f"  {len(befunde)} claim(s) do not hold at {rev}.")
        return 1
    print(f"  All 7 claims hold at {rev}.")
    return 0


def main() -> int:
    angepinnt = pin()
    schlecht = pruefe(angepinnt)
    print()
    auf_main = pruefe("main")

    print()
    if schlecht:
        print("NOT TRUE ANY MORE at the pinned commit. Rewrite before anything goes out: /fix, the")
        print("article and docs/without-control-plane.md all rest on these.")
        return 1
    if auf_main:
        print("The pinned commit still reads the way we describe it, and the default branch does")
        print("not. Somebody is fixing this upstream. That is the single most important thing that")
        print("could happen to the article, and it belongs in it before it goes out.")
        return 1
    print("Every claim holds at the pin and on the default branch.")
    print("What this cannot check: which revision a given reader is actually running.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
