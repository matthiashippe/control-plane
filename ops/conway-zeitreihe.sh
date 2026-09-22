#!/usr/bin/env bash
# Daily watch on the repository this whole project is an answer to.
#
# The article and the twelve issue answers rest on claims about the present tense of
# Conway-Research/automaton: onboarding has been broken since July, the last commit only touched
# the README, no maintainer has answered an issue since March, PR #370 is still open. Every one of
# those stops being true the moment somebody with write access comes back, and nobody would notice.
# On 2026-09-21 all of them were checked by hand for the first time since they were written down.
# By hand is not a process.
#
# It is also the one thing that would change the plan rather than a number in it. A maintainer
# comment, a merge of #370, a release: any of those means the wall the article describes is being
# taken down, and the honest move then is to say so before posting, not after.
#
# Writes to /opt/control-plane/conway, next to the x402 series and deliberately outside the repo
# directory, which `rollout.sh` mirrors with --delete.
#
#   repo.ndjson   one line per run, that is the series
set -euo pipefail

TARGET="${CP_CONWAY_DIR:-/opt/control-plane/conway}"
REPO="${CP_CONWAY_REPO:-Conway-Research/automaton}"
TODAY="$(date -u +%F)"
mkdir -p "$TARGET"

api() {
  # Unauthenticated, 60 requests an hour per address. This uses five a day.
  curl -fsS -m 30 -H "Accept: application/vnd.github+json" "https://api.github.com/$1"
}

# No apostrophe anywhere below, not even inside a Python comment: this heredoc sits inside a
# $( ) substitution, bash lexes the substitution before the heredoc quoting applies, and a single
# ' makes it hunt for a closing quote to the end of the file. The error it then prints names the
# last line of the script, a hundred lines away from the cause. Cost twenty minutes on 2026-09-22.
line="$(
  python3 - "$REPO" <<'PY'
import json, os, sys, urllib.request, datetime

repo = sys.argv[1]

def api(path):
    req = urllib.request.Request(f"https://api.github.com/{path}", headers={"Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

# What the service says about itself, read-only, no account and no write.
#
# Added on 2026-09-22. Everything else in this line is about the repository; this is the only
# number about the running service that can be had without knocking on the sign-up, which is a
# write on infrastructure that is not ours and stays a decision for a person. api.conway.tech
# answers "healthy" while reporting 2 of 8 healthy workers, and that ratio is the one public
# figure that would move if the thing behind the 500 were repaired.
def dienst():
    # The URL is a variable so the failure path can be shown rather than argued: point
    # CONWAY_SERVICE_URL at something dead and the four fields have to come out null, not zero.
    url = os.environ.get("CONWAY_SERVICE_URL") or "https://api.conway.tech/"
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=20) as r:
            d = json.load(r)
        return d.get("status"), d.get("workers"), d.get("healthyWorkers"), d.get("version")
    except Exception:
        # None, not zero: a request that did not arrive is not a service with no workers, and a
        # zero here would read as the loudest possible news on the day the network hiccups.
        return None, None, None, None

status, workers, healthy, version = dienst()

meta = api(f"repos/{repo}")
search = api(f'search/issues?q=repo:{repo}+%22auth/verify%22+OR+%22Invalid+or+expired+nonce%22&sort=created&order=desc&per_page=1')
newest = (search.get("items") or [{}])[0]
pr370 = api(f"repos/{repo}/issues/370")
fork = api("repos/Kiwi172/automaton-local")

# The last comment from anybody who can actually fix something. Two pages cover back to February,
# which is further than the claim in the article reaches.
last_write = None
comments_since = 0
for page in (1, 2):
    for c in api(f"repos/{repo}/issues/comments?sort=created&direction=desc&per_page=100&page={page}"):
        if c["author_association"] in ("OWNER", "MEMBER", "COLLABORATOR"):
            last_write = last_write or c["created_at"]
        elif last_write is None:
            comments_since += 1

print(json.dumps({
    "stichtag": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "last_push": meta["pushed_at"],
    "forks": meta["forks_count"],
    "stars": meta["stargazers_count"],
    "open_issues": meta["open_issues_count"],
    "archived": meta["archived"],
    "has_discussions": meta.get("has_discussions", False),
    "onboarding_issues": search.get("total_count", 0),
    "newest_onboarding_issue": newest.get("number"),
    "newest_onboarding_issue_at": newest.get("created_at"),
    "last_write_access_comment": last_write,
    "comments_since_then": comments_since,
    "pr370_state": pr370.get("state"),
    "fork_local_last_push": fork.get("pushed_at"),
    "fork_local_stars": fork.get("stargazers_count"),
    "service_status": status,
    "service_version": version,
    "service_workers": workers,
    "service_healthy_workers": healthy,
}, separators=(",", ":")))
PY
)"

printf '%s' "$line" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["forks"] > 100, d' || {
  echo "[conway] the answer does not look like that repository, nothing appended" >&2
  [[ -n "${CP_ALERT_WEBHOOK:-}" ]] && curl -fsS -m 10 -d "conway watch: implausible answer" "$CP_ALERT_WEBHOOK" >/dev/null || true
  exit 1
}

# One line per day, like the x402 series, so a run by hand does not double-count.
series="$TARGET/repo.ndjson"
touch "$series"
python3 - "$series" "$TODAY" "$line" <<'PY'
import json, sys
path, today, line = sys.argv[1], sys.argv[2], sys.argv[3]
kept = []
with open(path) as f:
    for raw in f:
        raw = raw.strip()
        if not raw:
            continue
        try:
            if json.loads(raw).get("stichtag", "").startswith(today):
                continue
        except json.JSONDecodeError:
            pass
        kept.append(raw)
kept.append(line.strip())
with open(path, "w") as f:
    f.write("\n".join(kept) + "\n")
PY

# What changed since the previous point, because a series nobody reads is a file. Anything here is
# news for the article, and a maintainer coming back is news that changes it.
python3 - "$series" <<'PY'
import json, sys
points = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
if len(points) < 2:
    print(f"[conway] {points[-1]['stichtag']}: first point, nothing to compare")
    sys.exit()
old, new = points[-2], points[-1]
watch = ["last_push", "open_issues", "onboarding_issues", "newest_onboarding_issue",
         "last_write_access_comment", "pr370_state", "archived", "fork_local_last_push"]
moved = [(k, old.get(k), new.get(k)) for k in watch if old.get(k) != new.get(k)]
if not moved:
    print(f"[conway] {new['stichtag']}: nothing moved. Still {new['forks']} forks, "
          f"{new['onboarding_issues']} onboarding issues, last maintainer comment {new['last_write_access_comment']}.")
else:
    for k, a, b in moved:
        print(f"[conway] CHANGED {k}: {a} -> {b}")
PY
