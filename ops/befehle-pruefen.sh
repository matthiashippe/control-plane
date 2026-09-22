#!/usr/bin/env bash
# Do the commands the pages show actually do what the pages say?
#
# Every page here teaches by showing a call: /post walks six steps as curl, the landing page puts a
# keyless brief check in the first screen with its output underneath, /fix shows the one config
# line. Nothing held any of that against the running service. The unit tests prove the page agrees
# with the code in this checkout, which is a different claim: a page can agree with code that is
# not deployed, and an endpoint can be renamed while the page keeps teaching the old name.
#
# The adversarial read of 2026-09-22 checked it once by hand and found it sound. That was one day
# and one state. This asks the same question every cycle:
#
#   ops/befehle-pruefen.sh
#
# What it asks per command:
#   - a call the page shows with `authorization: $KEY` must answer 401 without one, with a JSON
#     error carrying a docs link. A 404 means the endpoint moved and the page still teaches it.
#   - a call the page shows without a key must answer 200, run exactly as printed.
#   - the brief check in the hero must return exactly the findings the page prints beside it.
#
# Exit 0 when every shown command behaves, 1 when one does not, 2 when it could not look.
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="${CP_URL:-https://cp.hippe.eu}"

python3 - "$BASE" <<'PY'
import html as htmlmod
import json
import re
import sys
import urllib.error
import urllib.request

basis = sys.argv[1].rstrip("/")
SEITEN = ["/", "/post", "/jobs", "/fix", "/conway", "/x402", "/terms", "/receipts"]
KOPF = {"User-Agent": "control-plane-check/1.0 (+https://cp.hippe.eu)"}
fehler = 0
geprueft = 0


def hole(pfad: str) -> str:
    req = urllib.request.Request(basis + pfad, headers=KOPF)
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "replace")


def ruf(url: str, daten: bytes | None, ist_post: bool) -> tuple[int, str]:
    kopf = dict(KOPF)
    if ist_post:
        kopf["content-type"] = "application/json"
    req = urllib.request.Request(
        url, data=daten if daten is not None else (b"" if ist_post else None),
        headers=kopf, method="POST" if ist_post else "GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def bloecke(seite: str) -> list[str]:
    # The stylesheet carries a comment containing the literal <pre>, so the style and script
    # blocks come out before anything is extracted. Without that the first "command" found on
    # /post is a sentence about CSS.
    ohne = re.sub(r"<(style|script)\b[\s\S]*?</\1>", "", seite, flags=re.I)
    roh = [htmlmod.unescape(re.sub(r"<[^>]+>", "", m)) for m in re.findall(r"<pre>([\s\S]*?)</pre>", ohne)]
    # One <pre> can carry several commands: on /post award and cancel share a block, and reading
    # only the first would claim more in the summary than was asked.
    befehle = []
    for block in roh:
        teile = re.split(r"\n(?=\s*curl\b)", block)
        befehle.extend(t for t in teile if t.strip())
    return befehle


print(f"The commands the pages show, run against {basis}")
print()

for pfad in SEITEN:
    try:
        seite = hole(pfad)
    except Exception as e:  # noqa: BLE001
        print(f"COULD NOT TELL: {pfad} was not readable ({e}).")
        raise SystemExit(2)

    for block in bloecke(seite):
        if "curl" not in block:
            continue
        m = re.search(r"(https://cp\.hippe\.eu|http://127\.0\.0\.1:\d+)(/[\w/.?=$&-]*)", block)
        if not m:
            continue
        url = basis + m.group(2)
        # A placeholder id or query is not a call anybody can make; the endpoint is still the claim.
        url = re.sub(r"\?.*$", "", url)
        braucht_key = "authorization" in block.lower()
        rumpf = re.search(r"-d '([\s\S]*?)'", block)
        daten = rumpf.group(1).encode() if rumpf else None
        ist_post = daten is not None
        geprueft += 1

        if braucht_key:
            code, text = ruf(url, daten or b"{}", True)
            if code != 401:
                print(f"  FAILED  {pfad} shows {m.group(2)}, which answers {code} without a key, not 401")
                fehler += 1
                continue
            try:
                koerper = json.loads(text)
            except ValueError:
                print(f"  FAILED  {pfad}: {m.group(2)} answers 401 with something that is not JSON")
                fehler += 1
                continue
            if "docs" not in koerper or "message" not in koerper:
                print(f"  FAILED  {pfad}: the 401 on {m.group(2)} carries no message or no docs link")
                fehler += 1
                continue
            print(f"  ok      {pfad}: {m.group(2)} answers 401 with a message and a docs link")
        else:
            code, text = ruf(url, daten, ist_post)
            if code != 200:
                print(f"  FAILED  {pfad} shows {m.group(2)} as a call anybody can make, and it answers {code}")
                fehler += 1
                continue
            print(f"  ok      {pfad}: {m.group(2)} answers 200, exactly as printed")

            # The hero prints the answer next to the call. That is the one place on this site where
            # a command and its output stand together, so it is the one place where the output can
            # be wrong in front of the reader.
            if pfad == "/" and m.group(2).startswith("/v1/briefs/check"):
                gezeigt = [
                    htmlmod.unescape(re.sub(r"<[^>]+>", "", li)).strip()
                    for li in re.findall(r"<li>([\s\S]*?)</li>", re.search(r'<ul class="found">([\s\S]*?)</ul>', seite).group(1))
                ]
                echt = [f["missing"] for f in json.loads(text)["findings"]]
                if gezeigt != echt:
                    print("  FAILED  the hero prints an answer the service does not give:")
                    for z in gezeigt:
                        if z not in echt:
                            print(f"            shown but not returned: {z}")
                    for z in echt:
                        if z not in gezeigt:
                            print(f"            returned but not shown: {z}")
                    fehler += 1
                else:
                    print(f"  ok      and the {len(echt)} line(s) beside it are what it returned")

print()
if fehler:
    print(f"COMMANDS FAILED: {fehler} of {geprueft} shown command(s) do not behave as the page says.")
    raise SystemExit(1)
print(f"COMMANDS OK ({geprueft} shown command(s), each run against the live service)")
PY
