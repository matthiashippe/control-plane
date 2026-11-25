#!/usr/bin/env bash
# Our comments follow the card breaker (goals/reichweite/05). Since goals/reichweite/04 our comments in Conway-Research/automaton
# open with LEAD from ops/relink_rules.py, which promises the card. When the card breaker goes on, /llms.txt drops the card line,
# and the comments have to be switched to LEAD_NO_CARD (`ops/relink-comments.py --name --no-card`); when it goes off, back to LEAD
# (`ops/relink-comments.py --name`). This tool turns every change of the breaker into exactly one issue for the Tech Lead in the
# Paperclip project "Control Plane", with the dry run of the new direction, so the Tech Lead only has to approve it with `ok name`.
# Without a change it still compares our comments with the breaker: when no issue of the current direction is open and the dry
# run of that direction has something to change (an issue was closed without a full send), it creates the issue again.
#
#   ops/breaker-comments.sh              reads the breaker, compares it with the stored state and the comments, creates the issue
#   ops/breaker-comments.sh --dry-run    reads the breaker, Paperclip and the dry run; creates nothing, stores nothing
#
# Runs on the code-host in a checkout of dev, with CP_DEPLOY_HOST and CP_DEPLOY_KEY from ~/.config/control-plane/loop.env for
# ops/card-breaker.sh (read-only over ssh) and PAPERCLIP_API_URL, PAPERCLIP_API_KEY and PAPERCLIP_COMPANY_ID from the Paperclip
# run. No id of a project, an agent or the company is written here: the project is found by its name, the assignee by the urlKey
# tech-lead. A list of open issues with exactly OPEN_CAP entries may be cut by Paperclip and counts as unreadable.
#
# State: ${CP_STATE_DIR:-$HOME/.local/state/control-plane}/card-breaker-comments, exactly `on` or `off`. A missing file counts as
# `off` (the comments were sent while the breaker was off) and shows as `last none`. The new state is written only after a POST
# answered 2xx, after an open issue with the same title was found, or when the dry run has nothing to change; never otherwise,
# so a failed run comes again in the next one.
#
# The last line of the output is exactly one of
#   breaker <on|off>, last <on|off|none>, no change                    (same state, the comments match it)
#   breaker <on|off>, last <on|off|none>, comments already match       (a change, the comments match it already)
#   breaker <on|off>, last <on|off|none>, issue <PRO-n>
#   breaker <on|off>, last <on|off|none>, issue <PRO-n> already open
#   breaker <on|off>, last <on|off|none>, would create issue          (only with --dry-run)
# with exit 0, or a line ending in `unreadable` with exit 2 when the breaker, GitHub or Paperclip cannot be read or the POST
# fails. An unknown argument stops it with exit 1 before anything is asked.
#
# The API key is never printed and never on a command line: curl reads the header from stdin (`--config -`). GitHub is only read,
# through the dry run of ops/relink-comments.py without --send.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_NAME="Control Plane"
ASSIGNEE_KEY="tech-lead"
TITLE_ON="control-plane: card breaker on, comments without card"
TITLE_OFF="control-plane: card breaker off, comments with card"
OPEN_STATUSES="todo,in_progress,in_review,blocked"
OPEN_CAP=500
BREAKER_RE='^card_refunds_60d [0-9]+ shortfall_usd [0-9]+\.[0-9]{2} breaker (on|off)$'
ID_RE='^[A-Za-z0-9_-]{1,80}$'

usage() {
  echo "usage: ops/breaker-comments.sh [--dry-run]"
  exit 1
}

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) [[ $DRY_RUN == 0 ]] || usage; DRY_RUN=1 ;;
    *) usage ;;
  esac
done

STATE_DIR="${CP_STATE_DIR:-$HOME/.local/state/control-plane}"
STATE_FILE="$STATE_DIR/card-breaker-comments"

with_timeout() {
  local seconds=$1
  shift
  if command -v timeout >/dev/null 2>&1; then timeout -k 5 "$seconds" "$@"; else "$@"; fi
}

# 1. The breaker, read-only over ssh. Exactly one line in exactly its format, else nothing else happens.
breaker_line=$(with_timeout 60 bash "$HERE/card-breaker.sh" 2>/dev/null)
breaker_rc=$?
if [[ $breaker_rc -ne 0 || ! "$breaker_line" =~ $BREAKER_RE ]]; then
  echo "breaker unreadable"
  exit 2
fi
now="${BASH_REMATCH[1]}"

last=$(cat "$STATE_FILE" 2>/dev/null)
[[ "$last" == "on" || "$last" == "off" ]] || last="none"
previous="$last"
[[ "$previous" == "none" ]] && previous="off"
PREFIX="breaker $now, last $last"

finish() {
  echo "$PREFIX, $1"
  exit 0
}

unreadable() {
  echo "$PREFIX, $1 unreadable"
  exit 2
}

store_state() {
  [[ $DRY_RUN == 1 ]] && return 0
  mkdir -p "$STATE_DIR" 2>/dev/null
  local tmp
  tmp=$(mktemp "$STATE_DIR/.card-breaker-comments.XXXXXX" 2>/dev/null) || { echo "state not writable: $STATE_FILE" >&2; return 0; }
  printf '%s\n' "$now" >"$tmp" && mv -f "$tmp" "$STATE_FILE" || { rm -f "$tmp"; echo "state not writable: $STATE_FILE" >&2; }
  return 0
}

# One call to Paperclip. Sets API_CODE (000 without an answer) and API_BODY. The key travels on stdin, never in argv.
api() {
  local method=$1 path=$2 body=${3:-} out
  local args=(-s -m 20 -X "$method" -w '\n%{http_code}' -H 'Accept: application/json')
  [[ -n "$body" ]] && args+=(-H 'Content-Type: application/json' --data-binary "@$body")
  out=$(printf 'header = "Authorization: Bearer %s"\n' "$PAPERCLIP_API_KEY" | curl "${args[@]}" --config - "$PAPERCLIP_API_URL$path" 2>/dev/null)
  API_CODE=${out##*$'\n'}
  if [[ "$out" == *$'\n'* ]]; then API_BODY=${out%$'\n'*}; else API_BODY=""; fi
  [[ "$API_CODE" =~ ^[0-9]{3}$ ]] || API_CODE=000
}

# A value out of a JSON answer of Paperclip, computed by python3 -I from stdin; empty when it is not there.
pick() {
  printf '%s' "$API_BODY" | python3 -I -c "$1" "${@:2}" 2>/dev/null
}

PROJECT_ID=""
# Reads the project by its name and the open issue with the given title in it. Sets PROJECT_ID and OPEN_ISSUE (empty when none).
read_paperclip() {
  local title=$1
  [[ -n "${PAPERCLIP_API_URL:-}" && -n "${PAPERCLIP_API_KEY:-}" && "${PAPERCLIP_COMPANY_ID:-}" =~ $ID_RE ]] || unreadable "paperclip"
  api GET "/api/companies/$PAPERCLIP_COMPANY_ID/projects"
  [[ "$API_CODE" == 200 ]] || unreadable "paperclip"
  PROJECT_ID=$(pick 'import json, sys
items = json.load(sys.stdin)
items = items.get("items", items) if isinstance(items, dict) else items
print(next((p["id"] for p in items if p.get("name") == sys.argv[1]), ""))' "$PROJECT_NAME")
  [[ "$PROJECT_ID" =~ $ID_RE ]] || unreadable "paperclip"
  api GET "/api/companies/$PAPERCLIP_COMPANY_ID/issues?projectId=$PROJECT_ID&status=$OPEN_STATUSES"
  [[ "$API_CODE" == 200 ]] || unreadable "paperclip"
  OPEN_ISSUE=$(pick 'import json, sys
items = json.load(sys.stdin)
items = items.get("items", items) if isinstance(items, dict) else items
title, project, statuses, cap = sys.argv[1], sys.argv[2], sys.argv[3].split(","), int(sys.argv[4])
if len(items) >= cap:
    sys.exit(3)
hit = [i for i in items if i.get("title") == title and i.get("status") in statuses and i.get("projectId", project) == project]
print(hit[0].get("identifier", "?") if hit else "")' "$title" "$PROJECT_ID" "$OPEN_STATUSES" "$OPEN_CAP")
  [[ $? -eq 0 ]] || unreadable "paperclip"
  [[ -z "$OPEN_ISSUE" || "$OPEN_ISSUE" =~ ^[A-Z]+-[0-9]+$ ]] || unreadable "paperclip"
}

# 2. The direction of the breaker as it is now: its title and its dry run.
if [[ "$now" == "on" ]]; then
  TITLE="$TITLE_ON"
  DRY=(--name --no-card)
  COUNT_RE='^no-card: ([0-9]+) to change, '
else
  TITLE="$TITLE_OFF"
  DRY=(--name)
  COUNT_RE='^name: ([0-9]+) to change, '
fi
DRY_CMD="python3 -I ops/relink-comments.py ${DRY[*]}"
CHANGED=1
[[ "$now" == "$previous" ]] && CHANGED=0

# 3. The same state as stored: an open issue of this direction ends the run before GitHub is asked. Otherwise the comments are
#    compared below, because an issue closed without a full send must come again. A change reads Paperclip only after the dry
#    run found something to change, the way decision 3 of the goal has it; --dry-run reads it in every case.
if [[ $CHANGED == 0 || $DRY_RUN == 1 ]]; then
  read_paperclip "$TITLE"
  [[ $CHANGED == 0 && -n "$OPEN_ISSUE" ]] && finish "issue $OPEN_ISSUE already open"
fi

# 4. The dry run of the direction decides.
dry_out=$(with_timeout 900 python3 -I "$HERE/relink-comments.py" "${DRY[@]}" 2>&1)
dry_rc=$?
k=""
while IFS= read -r line; do
  [[ "$line" =~ $COUNT_RE ]] && k="${BASH_REMATCH[1]}"
done <<<"$dry_out"
[[ $dry_rc -eq 0 && -n "$k" ]] || unreadable "dry run"

if [[ "$k" == 0 ]]; then
  [[ $CHANGED == 0 ]] && finish "no change"
  store_state
  finish "comments already match"
fi

[[ $DRY_RUN == 1 || $CHANGED == 0 ]] || read_paperclip "$TITLE"
if [[ -n "$OPEN_ISSUE" ]]; then
  store_state
  finish "issue $OPEN_ISSUE already open"
fi
[[ $DRY_RUN == 1 ]] && finish "would create issue"

# 5. The issue: assignee by urlKey, status todo, the dry run unchanged in a code block, then the steps.
api GET "/api/companies/$PAPERCLIP_COMPANY_ID/agents"
[[ "$API_CODE" == 200 ]] || unreadable "paperclip"
AGENT_ID=$(pick 'import json, sys
items = json.load(sys.stdin)
items = items.get("items", items) if isinstance(items, dict) else items
print(next((a["id"] for a in items if a.get("urlKey") == sys.argv[1]), ""))' "$ASSIGNEE_KEY")
[[ "$AGENT_ID" =~ $ID_RE ]] || unreadable "paperclip"

if [[ $CHANGED == 1 ]]; then
  REASON="The card breaker changed: \`$breaker_line\` (last stored state: $last)."
else
  REASON="Our comments do not match the card breaker: \`$breaker_line\` (unchanged since the last stored state: $last), and no issue of this direction is open."
fi
DESCRIPTION=$(cat <<EOF
$REASON

Dry run of the direction of the breaker: \`$DRY_CMD\`

\`\`\`text
$dry_out
\`\`\`

Steps:
1. Tech Lead: check every changed comment above and approve with a comment on this issue that starts with \`ok name\` and names the values \`<id>:<sha12>\` of this dry run.
2. Maker: run \`bash ops/card-breaker.sh\` again. If it no longer says \`breaker $now\`, send nothing and say so here.
3. Maker: \`$DRY_CMD --send <n> --approved <id>:<sha12>,...\` with exactly the approved values.
4. Maker: \`$DRY_CMD --verify\`, its last line as a comment here.
EOF
)
body_file=$(mktemp "${TMPDIR:-/tmp}/breaker-comments.XXXXXX") || unreadable "paperclip"
trap 'rm -f "$body_file"' EXIT
python3 -I -c 'import json, sys
title, description, project, agent = sys.argv[1:5]
json.dump({"title": title, "description": description, "status": "todo", "projectId": project, "assigneeAgentId": agent}, sys.stdout)' \
  "$TITLE" "$DESCRIPTION" "$PROJECT_ID" "$AGENT_ID" >"$body_file" || unreadable "paperclip"
api POST "/api/companies/$PAPERCLIP_COMPANY_ID/issues" "$body_file"
[[ "$API_CODE" =~ ^2[0-9]{2}$ ]] || unreadable "paperclip"
ISSUE=$(pick 'import json, sys
print(json.load(sys.stdin).get("identifier", ""))')
[[ "$ISSUE" =~ ^[A-Z]+-[0-9]+$ ]] || ISSUE="created"
store_state
finish "issue $ISSUE"
