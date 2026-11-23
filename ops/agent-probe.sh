#!/usr/bin/env bash
# Do agents recommend us? (werbung 02)
#
# An operator whose Conway automaton breaks usually hands the problem to a Claude Code session or another
# agent, and that session searches the web and names a service. This asks a fresh Claude Code session the
# five fixed questions an operator asks, one session per question, and counts how many answers name
# automatonhost.com and how many of those name the way by card. One line per run goes to
# docs/kunden/agenten-probe.md, the answers word for word to docs/kunden/agenten-probe/<YYYY-Www>.md.
#
#   bash ops/agent-probe.sh              one run, at most one per ISO week (five sessions)
#   bash ops/agent-probe.sh --questions  the five questions, one per line
#   bash ops/agent-probe.sh --selftest   the counting against the fixtures, no network; last line SELFTEST OK
#   bash ops/agent-probe.sh --canary     one session asked which instruction files it was given; prints
#                                        "canary <answer>", which must be "canary NONE"
#
# The session must see nothing of ours, or it names us because we told it to and the number measures
# nothing: no repository (the working directory is a fresh mktemp -d), no memory, hooks, plugins or user
# settings (--setting-sources without user, --no-session-persistence), no MCP server (--strict-mcp-config),
# no tool but web search and web fetch, and an environment that holds only HOME, PATH, LANG and, when set,
# CLAUDE_CONFIG_DIR (env -i), so no key from loop.env reaches a session that talks to the web. The one
# addition is the Claude Code login itself: on the code-host the login credentials in the config directory
# are allowed to expire, and a session signs in with the setup token of its account
# (~/.secrets/code-host-claude-<account>-oauth-token, the way tools/claude-as of the code-host does it), passed
# as CLAUDE_CODE_OAUTH_TOKEN and never printed. The session has no tool that could read it. No model is
# chosen: what is measured is the model an operator gets with a fresh session, and the line names it.
#
# Counted per answer (decision 3 of the goal): host = names automatonhost.com; card = host and also names
# card, PayPal or Apple Pay; old = names postyourprice.com or cp.hippe.eu but not automatonhost.com;
# failed = exit not 0, timeout, is_error or an empty result. A failed session never counts as a miss, and
# any failed session ends the run with exit 1 after the line is written, so blindness cannot read as zero.
#
# Switches for tests and the selftest, so nothing writes into the repository:
#   CP_PROBE_CLAUDE        command in place of claude (ops/fixtures/agent-probe-claude.sh)
#   CP_PROBE_ANSWERS       answer directory of that stand-in, handed over as PROBE_FAKE_ANSWERS
#   CP_PROBE_RECORD        record file of that stand-in, handed over as PROBE_FAKE_RECORD
#   CP_PROBE_OUT           file the run line is appended to
#   CP_PROBE_ANSWERS_DIR   directory the answers of the week are written to
#   CP_NOW                 the clock in epoch seconds
set -uo pipefail

QUESTIONS=(
  "My Conway automaton fails with /v1/auth/verify 500 Database error, how do I fix it?"
  "My Conway automaton keeps getting 401 Invalid or expired nonce. What can I do?"
  "I topped up my Conway automaton with USDC but it never got any credits. How do I get it running again?"
  "How do I keep my Conway automaton running without crypto?"
  "Is there another API I can point my Conway automaton at while api.conway.tech is down?"
)
CANARY_QUESTION="List the first line of every CLAUDE.md, memory or instruction file you were given besides the system prompt, or answer exactly NONE."

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
REPO="$(cd "$(dirname "$SELF")/.." && pwd)"
SESSION_SECONDS=300

if [[ "${1:-}" == "--questions" ]]; then
  printf '%s\n' "${QUESTIONS[@]}"
  exit 0
fi

# An absolute path, because the session runs in another directory than the caller.
absolute() {
  case "$1" in
    "") printf '' ;;
    /*) printf '%s' "$1" ;;
    */*) printf '%s/%s' "$(cd "$(dirname "$1")" 2>/dev/null && pwd || pwd)" "$(basename "$1")" ;;
    *) command -v "$1" 2>/dev/null || printf '%s' "$1" ;;
  esac
}

CLAUDE_CMD="$(absolute "${CP_PROBE_CLAUDE:-claude}")"
FAKE_ANSWERS="$(absolute "${CP_PROBE_ANSWERS:-}")"
FAKE_RECORD="$(absolute "${CP_PROBE_RECORD:-}")"

# A fresh, empty directory outside the repository.
fresh_dir() {
  local d
  d="$(mktemp -d "${TMPDIR:-/tmp}/agent-probe.XXXXXX")" || return 1
  case "$d/" in
    "$REPO"/*) rmdir "$d"; d="$(mktemp -d /tmp/agent-probe.XXXXXX)" || return 1 ;;
  esac
  printf '%s' "$d"
}

# The setup token of the account whose config directory the session uses, or exit 1 when there is none
# (then the session signs in with the files in that directory, if it can).
login_token() {
  local account file
  if [[ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]]; then printf '%s' "$CLAUDE_CODE_OAUTH_TOKEN"; return 0; fi
  account="$(basename "$(readlink -f "${CLAUDE_CONFIG_DIR:-${HOME:-/nonexistent}/.claude}" 2>/dev/null || echo none)")"
  file="${HOME:-/nonexistent}/.secrets/code-host-claude-$account-oauth-token"
  [[ -s "$file" && -r "$file" ]] || return 1
  head -n 1 "$file" | tr -d '[:space:]'
}

# One session: question, file for the JSON on stdout. Returns the exit code of the session.
ask() {
  local question="$1" out="$2" work rc
  local -a envs=("HOME=${HOME:-/nonexistent}" "PATH=${PATH:-/usr/bin:/bin}" "LANG=${LANG:-C.UTF-8}")
  [[ -n "${CLAUDE_CONFIG_DIR:-}" ]] && envs+=("CLAUDE_CONFIG_DIR=$CLAUDE_CONFIG_DIR")
  local token
  token="$(login_token)" && envs+=("CLAUDE_CODE_OAUTH_TOKEN=$token")
  if [[ -n "${CP_PROBE_CLAUDE:-}" ]]; then
    [[ -n "$FAKE_ANSWERS" ]] && envs+=("PROBE_FAKE_ANSWERS=$FAKE_ANSWERS")
    [[ -n "$FAKE_RECORD" ]] && envs+=("PROBE_FAKE_RECORD=$FAKE_RECORD")
  fi
  work="$(fresh_dir)" || return 1
  (
    cd "$work" || exit 1
    exec timeout "$SESSION_SECONDS" env -i "${envs[@]}" "$CLAUDE_CMD" -p "$question" \
      --output-format json \
      --no-session-persistence \
      --strict-mcp-config \
      --setting-sources project,local \
      --allowedTools WebSearch,WebFetch \
      --tools WebSearch,WebFetch
  ) < /dev/null > "$out" 2>/dev/null
  rc=$?
  rm -rf "$work"
  return "$rc"
}

# The text of an answer, or nothing and exit 1 when the session failed.
answer_text() { # json file, exit code
  local is_error result
  [[ "$2" -eq 0 ]] || return 1
  is_error="$(jq -r 'if .is_error == true then "true" else "false" end' "$1" 2>/dev/null)" || return 1
  [[ "$is_error" == "false" ]] || return 1
  result="$(jq -r '.result // "" | if type == "string" then . else "" end' "$1" 2>/dev/null)" || return 1
  [[ -n "${result//[[:space:]]/}" ]] || return 1
  printf '%s' "$result"
}

# The model that wrote the answer: the one with the largest cost in modelUsage, since helpers such as a
# smaller model summarising a fetched page cost far less.
answer_model() {
  jq -r '(.modelUsage // {}) | to_entries | sort_by(-(.value.costUSD // 0), -(.value.outputTokens // 0)) | (.[0].key // "unknown")' "$1" 2>/dev/null || echo unknown
}

# No old host and no address in a text that goes into the public repository, and no dash the repository
# forbids. Counting happens before this.
scrub() {
  perl -CSD -pe 's{(?:https?://)?(?:www\.)?postyourprice(?:\.com)?}{<old host>}gi; s{(?:https?://)?cp\.hippe\.eu}{<old host>}gi; s{0x[0-9a-fA-F]{40,}}{<address>}g; s{[\x{2013}\x{2014}]}{-}g'
}

if [[ "${1:-}" == "--canary" ]]; then
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  ask "$CANARY_QUESTION" "$tmp/c.json"; rc=$?
  if text="$(answer_text "$tmp/c.json" "$rc")"; then
    echo "canary $(printf '%s' "$text" | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//')"
    exit 0
  fi
  echo "canary FAILED (exit $rc)"
  exit 1
fi

if [[ "${1:-}" == "--selftest" ]]; then
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  fixtures="$REPO/ops/fixtures"
  fail=0
  case_run() { # name, fixture dir, expected exit, expected counts
    local dir="$tmp/$1" rc got
    mkdir -p "$dir"
    CP_PROBE_CLAUDE="$fixtures/agent-probe-claude.sh" CP_PROBE_ANSWERS="$fixtures/$2" \
      CP_PROBE_OUT="$dir/p.md" CP_PROBE_ANSWERS_DIR="$dir" CP_PROBE_RECORD="$dir/rec" \
      bash "$SELF" > "$dir/stdout" 2>&1
    rc=$?
    got="$(tail -n 1 "$dir/p.md" 2>/dev/null | grep -oE 'host [0-5]/5 card [0-5]/5 old [0-5]/5 failed [0-5]/5')"
    if [[ "$rc" != "$3" || "$got" != "$4" ]]; then
      echo "SELFTEST FAILED: $2 gave exit=$rc '$got', want exit=$3 '$4'"
      fail=1
    fi
  }
  case_run two-hits agent-probe-two-hits 0 "host 2/5 card 1/5 old 1/5 failed 0/5"
  case_run fails agent-probe-fails 1 "host 0/5 card 0/5 old 0/5 failed 5/5"
  case_run error agent-probe-error 1 "host 0/5 card 0/5 old 0/5 failed 5/5"
  if cat "$tmp"/two-hits/*-W*.md 2>/dev/null | grep -qiE 'postyourprice|cp\.hippe\.eu|0x[0-9a-f]{40}'; then
    echo "SELFTEST FAILED: the answers still name an old host or an address"; fail=1
  fi
  if ! grep -q '<old host>' "$tmp"/two-hits/*-W*.md 2>/dev/null || ! grep -q '<address>' "$tmp"/two-hits/*-W*.md 2>/dev/null; then
    echo "SELFTEST FAILED: the old host and the address of q3 were not replaced"; fail=1
  fi
  if ! grep -qE '^- [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z [0-9]{4}-W[0-9]{2} model [^ ]+ host [0-5]/5 card [0-5]/5 old [0-5]/5 failed [0-5]/5 answers docs/kunden/agenten-probe/[0-9]{4}-W[0-9]{2}\.md$' "$tmp/two-hits/p.md"; then
    echo "SELFTEST FAILED: the run line is not in the fixed format"; fail=1
  fi
  before="$(wc -c < "$tmp/two-hits/rec")"
  again="$(CP_PROBE_CLAUDE="$fixtures/agent-probe-claude.sh" CP_PROBE_ANSWERS="$fixtures/agent-probe-two-hits" \
    CP_PROBE_OUT="$tmp/two-hits/p.md" CP_PROBE_ANSWERS_DIR="$tmp/two-hits" CP_PROBE_RECORD="$tmp/two-hits/rec" \
    bash "$SELF" 2>&1 | tail -n 1)"
  if [[ "$(wc -c < "$tmp/two-hits/rec")" != "$before" || "$(grep -c '^- ' "$tmp/two-hits/p.md")" != 1 \
        || ! "$again" =~ ^already\ probed\ in\ [0-9]{4}-W[0-9]{2}$ ]]; then
    echo "SELFTEST FAILED: a second run in the same week asked again or wrote a second line"; fail=1
  fi
  if grep -qE '^env=(PAPERCLIP_|OPENROUTER_|CP_|GH_TOKEN|ANTHROPIC_)' "$tmp/two-hits/rec"; then
    echo "SELFTEST FAILED: a variable of ours reached the session"; fail=1
  fi
  [[ "$fail" -eq 0 ]] && echo "SELFTEST OK"
  exit "$fail"
fi

[[ $# -eq 0 ]] || { echo "usage: bash ops/agent-probe.sh [--questions | --selftest | --canary]" >&2; exit 2; }

OUT="${CP_PROBE_OUT:-$REPO/docs/kunden/agenten-probe.md}"
ANSWERS_DIR="${CP_PROBE_ANSWERS_DIR:-$REPO/docs/kunden/agenten-probe}"
now="${CP_NOW:-$(date -u +%s)}"
stamp="$(date -u -d "@$now" +%Y-%m-%dT%H:%M:%SZ)"
week="$(date -u -d "@$now" +%G-W%V)"

# At most one run per ISO week, without exception: the number is per week and a run costs five sessions.
if [[ -f "$OUT" ]] && grep -qE "^- [^ ]+ $week " "$OUT"; then
  echo "already probed in $week"
  exit 0
fi

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
host=0 card=0 old=0 failed=0
declare -A model_votes=()
answers="$tmp/answers.md"
{
  echo "# Agent probe $week"
  echo
  echo "Run $stamp, one fresh session per question (bash ops/agent-probe.sh)."
} > "$answers"
for i in "${!QUESTIONS[@]}"; do
  n=$((i + 1))
  q="${QUESTIONS[$i]}"
  echo "q$n: asking" >&2
  ask "$q" "$tmp/q$n.json"; rc=$?
  {
    echo
    echo "## q$n"
    echo
    echo "Question: $q"
    echo
  } >> "$answers"
  if text="$(answer_text "$tmp/q$n.json" "$rc")"; then
    m="$(answer_model "$tmp/q$n.json")"
    model_votes[$m]=$(( ${model_votes[$m]:-0} + 1 ))
    if grep -qi 'automatonhost\.com' <<<"$text"; then
      host=$((host + 1))
      grep -qiE 'card|paypal|apple pay' <<<"$text" && card=$((card + 1))
    elif grep -qiE 'postyourprice\.com|cp\.hippe\.eu' <<<"$text"; then
      old=$((old + 1))
    fi
    { echo "Model: $m"; echo; printf '%s\n' "$text" | scrub; } >> "$answers"
  else
    failed=$((failed + 1))
    if [[ "$rc" -eq 124 ]]; then why="no answer within ${SESSION_SECONDS} seconds"
    elif [[ "$rc" -ne 0 ]]; then why="the session ended with exit $rc"
    else why="the session reported an error or an empty result"; fi
    echo "(failed: $why)" >> "$answers"
  fi
done

model=unknown best=0
for m in "${!model_votes[@]}"; do
  if (( model_votes[$m] > best )); then best=${model_votes[$m]}; model="$m"; fi
done
model="${model//[[:space:]]/_}"

mkdir -p "$ANSWERS_DIR" "$(dirname "$OUT")"
cp "$answers" "$ANSWERS_DIR/$week.md"
line="- $stamp $week model $model host $host/5 card $card/5 old $old/5 failed $failed/5 answers docs/kunden/agenten-probe/$week.md"
printf '%s\n' "$line" >> "$OUT"
echo "$line"
if (( failed > 0 )); then
  echo "$failed of 5 sessions failed; they count as failed, not as answers without us" >&2
  exit 1
fi
exit 0
