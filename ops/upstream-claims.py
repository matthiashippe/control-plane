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
that repository moves often. `ops/conway-series.sh` already watches the repository daily and
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
findings = []


def ok(what: str, evidence: str = "") -> None:
    print(f"  ok      {what}" + (f"\n          {evidence}" if evidence else ""))


def wrong(what: str, hint: str) -> None:
    findings.append(what)
    print(f"  WRONG   {what}\n          {hint}")


def pin() -> str:
    m = re.search(r"ARG AUTOMATON_REV=(\S+)", DOCKERFILE.read_text())
    if not m:
        print(f"No AUTOMATON_REV in {DOCKERFILE}. Nothing to check against.")
        sys.exit(2)
    return m.group(1)


def file_at(path: str, rev: str) -> str:
    raw = subprocess.run(
        ["gh", "api", f"repos/{REPO}/contents/{path}?ref={rev}", "--jq", ".content"],
        capture_output=True, text=True, timeout=30,
    )
    if raw.returncode != 0 or not raw.stdout.strip():
        print(f"  could not fetch {path} at {rev}: {raw.stderr.strip()[:120]}")
        sys.exit(2)
    return base64.b64decode(raw.stdout).decode("utf-8", "replace")


FILES = [
    "src/index.ts",
    "src/heartbeat/tick-context.ts",
    "src/heartbeat/tasks.ts",
    "src/agent/loop.ts",
    "src/conway/credits.ts",
]


def check(rev: str) -> int:
    global findings
    findings = []
    print(f"What we say about {REPO} at {rev}\n")
    content = {p: file_at(p, rev) for p in FILES}

    # 1. The thinking path refuses to spend. This is the claim that makes the asymmetry a story
    #    rather than a bug report: the one fallback that costs nothing is the one that gives up.
    if "creditsCents: -1" in content["src/agent/loop.ts"]:
        ok("the thinking path substitutes -1 when the balance call fails and there is no cache",
           "src/agent/loop.ts returns creditsCents: -1")
    else:
        wrong("the thinking path no longer substitutes -1",
              "/fix and the article both describe the sentinel by name")

    # 2. And -1 resolves to a tier that buys nothing, while 0 resolves to one that buys.
    tiers = content["src/conway/credits.ts"]
    if re.search(r"if \(creditsCents >= 0\) return \"critical\";\s*\n\s*return \"dead\";", tiers):
        ok("zero is critical and anything negative is dead",
           "src/conway/credits.ts getSurvivalTier")
    else:
        wrong("getSurvivalTier no longer maps 0 to critical and negatives to dead",
              "the whole asymmetry is this mapping; without it the three paths are the same path")

    # 3. The startup path substitutes 0, which is 'critical', which buys.
    if re.search(r"getCreditsBalance\(\)\.catch\(\(\) => 0\)", content["src/index.ts"]):
        ok("the startup path substitutes 0 and goes on to buy", "src/index.ts .catch(() => 0)")
    else:
        wrong("the startup path no longer substitutes 0",
              "the claim that a fresh start buys 5 USDC rests on this line")

    # 4. The heartbeat leaves the value at 0 on failure, rather than propagating the error.
    tick = content["src/heartbeat/tick-context.ts"]
    if re.search(r"let creditBalance = 0;\s*\n\s*try \{\s*\n\s*creditBalance = await conway\.getCreditsBalance\(\);\s*\n\s*\} catch", tick):
        ok("the heartbeat leaves the balance at 0 when the call throws",
           "src/heartbeat/tick-context.ts logs and carries on")
    else:
        wrong("the heartbeat no longer falls back to 0",
              "the claim that it buys again every five minutes starts here")

    # 5. And buys again on a five minute cooldown for as long as the wallet holds 5 USDC.
    tasks = content["src/heartbeat/tasks.ts"]
    has_threshold = re.search(r"MIN_TOPUP_USD = 5\b", tasks)
    has_cooldown = re.search(r"AUTO_TOPUP_COOLDOWN_MS = 5 \* 60 \* 1000", tasks)
    # The whole condition, both halves of it.
    #
    # This pattern stopped at `=== "critical"` until 2026-09-22 and therefore could never go red
    # for the claim it was there to protect. /fix, /conway and the article all said the heartbeat
    # buys because the failed balance call resolves to `critical`, and the line it was reading is
    # `if (balance >= MIN_TOPUP_USD && (ctx.survivalTier === "critical" || ctx.survivalTier ===
    # "dead"))`. The runtime buys on either tier, so which tier the failure resolves to changes
    # nothing, and the check was cut exactly short of the half that says so. An adversarial read
    # found it (B6): a check that cannot fail for its own claim is decoration.
    has_condition = re.search(
        r"balance >= MIN_TOPUP_USD && \(ctx\.survivalTier === \"critical\"\s*\|\|\s*"
        r"ctx\.survivalTier === \"dead\"\)",
        tasks,
    )
    if has_threshold and has_cooldown and has_condition:
        ok("it buys on critical and on dead alike, every five minutes while the wallet holds 5 USDC",
           "src/heartbeat/tasks.ts: MIN_TOPUP_USD, AUTO_TOPUP_COOLDOWN_MS and both halves of the tier condition")
    else:
        missing = [n for n, t in [("the 5 USDC threshold", has_threshold),
                                  ("the five minute cooldown", has_cooldown),
                                  ("the tier condition", has_condition)] if not t]
        wrong(f"the heartbeat's topup changed: {', '.join(missing)} not found",
              "/fix and /conway both say it buys on critical and on dead alike, again every five "
              "minutes for as long as the wallet holds 5 USDC")

    # 8. Which model the defaults actually route to, and when.
    #
    # /fix and the article said "then the runtime keeps routing to gpt-5-mini". The nested default
    # is gpt-5.2; gpt-5-mini is the low-compute and critical model. The router builds its candidate
    # list as [inferenceModel, lowComputeModel, criticalModel] and swaps the critical one to the
    # front only at tier critical or dead, so the small model is what a reader sees exactly when
    # they have no balance, which is the Ollama case and not the other route this page offers.
    # Right by accident on one of two routes, and this is the one place the text shows detail
    # knowledge. An adversarial read found it (B7), and nothing here checked it: claim 7 only
    # checked that the wizard copies the value.
    types_ts = file_at("src/inference/types.ts", rev)
    router = file_at("src/inference/router.ts", rev)
    default_model = re.search(r"DEFAULT_MODEL_STRATEGY_CONFIG[^{]*\{\s*inferenceModel:\s*\"([^\"]+)\"", types_ts)
    critical_model = re.search(r"DEFAULT_MODEL_STRATEGY_CONFIG[\s\S]{0,200}?criticalModel:\s*\"([^\"]+)\"", types_ts)
    critical_first = re.search(
        r'tier === "critical" \|\| tier === "dead"\s*\?\s*\[strategy\.criticalModel',
        router,
    )
    normal_first = re.search(r":\s*\[strategy\.inferenceModel, strategy\.lowComputeModel", router)
    if default_model and critical_model and critical_first and normal_first:
        ok(f"the defaults route to {default_model.group(1)} until the tier is critical, then {critical_model.group(1)}",
           "src/inference/types.ts DEFAULT_MODEL_STRATEGY_CONFIG and the two candidate orders in router.ts")
    else:
        missing = [n for n, t in [("the default inferenceModel", default_model),
                                  ("the default criticalModel", critical_model),
                                  ("the critical-first order", critical_first),
                                  ("the normal-first order", normal_first)] if not t]
        wrong(f"the model defaults or the routing order changed: {', '.join(missing)} not found",
              "/fix and the article name both models and say which tier each belongs to")

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
    cfg = file_at("src/setup/configure.ts", rev)
    if re.search(r"config\.inferenceModel = await pickFromList\([^)]*\);\s*\n\s*s\.inferenceModel = config\.inferenceModel;", cfg):
        ok("the setup wizard copies the top-level model into modelStrategy",
           "src/setup/configure.ts assigns s.inferenceModel = config.inferenceModel")
    else:
        wrong("the wizard no longer copies the top-level model down",
              "/fix and docs/without-control-plane.md both say the trap is hand-editing the file, "
              "not the wizard; if the wizard stopped copying, the trap is the wizard again")

    # 6. Neither spending path reads the cache, which is why route 2 does not protect anybody.
    #    Checked as an absence, so it is stated narrowly: the two files that spend never mention it.
    if "last_known_balance" not in content["src/index.ts"] and "last_known_balance" not in tick:
        ok("neither spending path reads the cached balance",
           "last_known_balance appears in neither src/index.ts nor tick-context.ts")
    else:
        wrong("a spending path now reads last_known_balance",
              "docs/without-control-plane.md says route 2 does not protect you here")

    print()
    if findings:
        print(f"  {len(findings)} claim(s) do not hold at {rev}.")
        return 1
    print(f"  All claims hold at {rev}.")
    return 0


def main() -> int:
    pinned = pin()
    at_pin = check(pinned)
    print()
    on_main = check("main")

    print()
    if at_pin:
        print("NOT TRUE ANY MORE at the pinned commit. Rewrite before anything goes out: /fix, the")
        print("article and docs/without-control-plane.md all rest on these.")
        return 1
    if on_main:
        print("The pinned commit still reads the way we describe it, and the default branch does")
        print("not. Somebody is fixing this upstream. That is the single most important thing that")
        print("could happen to the article, and it belongs in it before it goes out.")
        return 1
    print("Every claim holds at the pin and on the default branch.")
    print("What this cannot check: which revision a given reader is actually running.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
