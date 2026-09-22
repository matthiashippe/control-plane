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

base = sys.argv[1].rstrip("/")
PAGES = ["/", "/post", "/jobs", "/fix", "/conway", "/x402", "/terms", "/receipts"]
HEADERS = {"User-Agent": "control-plane-check/1.0 (+https://cp.hippe.eu)"}
failures = 0
checked = 0


def fetch(path: str) -> str:
    req = urllib.request.Request(base + path, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "replace")


def call(url: str, data: bytes | None, is_post: bool) -> tuple[int, str]:
    headers = dict(HEADERS)
    if is_post:
        headers["content-type"] = "application/json"
    req = urllib.request.Request(
        url, data=data if data is not None else (b"" if is_post else None),
        headers=headers, method="POST" if is_post else "GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def blocks(page: str) -> list[str]:
    # The stylesheet carries a comment containing the literal <pre>, so the style and script
    # blocks come out before anything is extracted. Without that the first "command" found on
    # /post is a sentence about CSS.
    stripped = re.sub(r"<(style|script)\b[\s\S]*?</\1>", "", page, flags=re.I)
    raw = [htmlmod.unescape(re.sub(r"<[^>]+>", "", m)) for m in re.findall(r"<pre>([\s\S]*?)</pre>", stripped)]
    # One <pre> can carry several commands: on /post award and cancel share a block, and reading
    # only the first would claim more in the summary than was asked.
    commands = []
    for block in raw:
        parts = re.split(r"\n(?=\s*curl\b)", block)
        commands.extend(t for t in parts if t.strip())
    return commands


print(f"The commands the pages show, run against {base}")
print()

for path in PAGES:
    try:
        page = fetch(path)
    except Exception as e:  # noqa: BLE001
        print(f"COULD NOT TELL: {path} was not readable ({e}).")
        raise SystemExit(2)

    for block in blocks(page):
        if "curl" not in block:
            continue
        m = re.search(r"(https://cp\.hippe\.eu|http://127\.0\.0\.1:\d+)(/[\w/.?=$&-]*)", block)
        if not m:
            continue
        url = base + m.group(2)
        # A placeholder id or query is not a call anybody can make; the endpoint is still the claim.
        url = re.sub(r"\?.*$", "", url)
        needs_key = "authorization" in block.lower()
        body_match = re.search(r"-d '([\s\S]*?)'", block)
        data = body_match.group(1).encode() if body_match else None
        is_post = data is not None
        checked += 1

        if needs_key:
            code, text = call(url, data or b"{}", True)
            if code != 401:
                print(f"  FAILED  {path} shows {m.group(2)}, which answers {code} without a key, not 401")
                failures += 1
                continue
            try:
                body = json.loads(text)
            except ValueError:
                print(f"  FAILED  {path}: {m.group(2)} answers 401 with something that is not JSON")
                failures += 1
                continue
            if "docs" not in body or "message" not in body:
                print(f"  FAILED  {path}: the 401 on {m.group(2)} carries no message or no docs link")
                failures += 1
                continue
            print(f"  ok      {path}: {m.group(2)} answers 401 with a message and a docs link")
        else:
            code, text = call(url, data, is_post)
            if code != 200:
                print(f"  FAILED  {path} shows {m.group(2)} as a call anybody can make, and it answers {code}")
                failures += 1
                continue
            print(f"  ok      {path}: {m.group(2)} answers 200, exactly as printed")

            # The hero prints the answer next to the call. That is the one place on this site where
            # a command and its output stand together, so it is the one place where the output can
            # be wrong in front of the reader.
            if path == "/" and m.group(2).startswith("/v1/briefs/check"):
                shown = [
                    htmlmod.unescape(re.sub(r"<[^>]+>", "", li)).strip()
                    for li in re.findall(r"<li>([\s\S]*?)</li>", re.search(r'<ul class="found">([\s\S]*?)</ul>', page).group(1))
                ]
                returned = [f["missing"] for f in json.loads(text)["findings"]]
                if shown != returned:
                    print("  FAILED  the hero prints an answer the service does not give:")
                    for entry in shown:
                        if entry not in returned:
                            print(f"            shown but not returned: {entry}")
                    for entry in returned:
                        if entry not in shown:
                            print(f"            returned but not shown: {entry}")
                    failures += 1
                else:
                    print(f"  ok      and the {len(returned)} line(s) beside it are what it returned")

print()
if failures:
    print(f"COMMANDS FAILED: {failures} of {checked} shown command(s) do not behave as the page says.")
    raise SystemExit(1)
print(f"COMMANDS OK ({checked} shown command(s), each run against the live service)")
PY
