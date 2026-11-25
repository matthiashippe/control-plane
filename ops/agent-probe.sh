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
#   bash ops/agent-probe.sh --week       the weekly run (werbung 03): the same five sessions, at most once per ISO
#                                        week, counted by the stricter rules below, a line with seen; every further
#                                        call in the same week prints the stored line and asks nothing
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
# With --week (werbung 03, decisions 2 to 6 of that goal) the counting is stricter and has one number more:
#   card = a sentence names automatonhost.com and, in the same sentence, card, cards, credit card, debit card,
#          Visa, Mastercard, PayPal or Apple Pay as a whole word (no letter or digit before or after);
#   seen = no host, and a sentence names conwayApiUrl or CONWAY_API_URL together with control plane, one of
#          third-party, third party, alternative, compatible, mirror, unofficial, self-hosted, or a URL whose
#          host is not conway.tech or below it, or the placeholder <old host>: our hint found without our name;
#   sentences end at . ! or ? before white space or the end of the text, and at every line break.
# Its line starts with the week, so the old checks that recount every line "- <date>T..." leave it alone:
#   - <YYYY-Www> <UTC time> model <m> host h/5 card c/5 seen s/5 old o/5 failed f/5 answers <file> via sessions
# The raw JSON of every session and the line stay outside the repository in the state directory
# ~/.local/state/control-plane/agent-probe/<YYYY-Www>/ (q<n>.json, line, answers.md; mode 700), because a raw
# answer can carry an old host or an address; only the scrubbed answers go into the repository. A week that
# already has a line in the old format and its answers file is counted again from that file, without a session
# and without touching the file ("via recount"). One week, one run, with or without the switch, and no switch
# lifts that. Every --week first carries each week of the state directory up to the current one that the file
# lacks, in ascending order, with its scrubbed answers (answers.md) where the answers file is missing, so a run
# made in another worktree still reaches the repository.
# Every line of --week goes on its own line after the last one, also when the file lacks a final line break, and
# no existing line or answers file changes, because the gate of a Richtungs-Check accepts nothing else (werbung 04).
# An answers file of the current week without any line of that week is counted again from that file, without a
# session and without touching it ("via recount"); one without exactly the sections q1 to q5 stops the run with
# exit 1 and no line.
#
# Switches for tests and the selftest, so nothing writes into the repository:
#   CP_PROBE_CLAUDE        command in place of claude (ops/fixtures/agent-probe-claude.sh)
#   CP_PROBE_ANSWERS       answer directory of that stand-in, handed over as PROBE_FAKE_ANSWERS
#   CP_PROBE_RECORD        record file of that stand-in, handed over as PROBE_FAKE_RECORD
#   CP_PROBE_OUT           file the run line is appended to
#   CP_PROBE_ANSWERS_DIR   directory the answers of the week are written to
#   CP_PROBE_STATE_DIR     state directory of --week in place of ~/.local/state/control-plane/agent-probe
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

# The counting of --week (werbung 03, decisions 2 and 3), shared by a run with sessions and a recount. Each
# answer gives "<host> <card> <seen> <old>", each 0 or 1.
WEEK_RULES='
sub sentences { return grep { /\S/ } split /(?:(?<=[.!?])(?=\s)|\n)/, $_[0]; }
sub word { my ($s, $w) = @_; return $s =~ /(?<![[:alnum:]])(?:$w)(?![[:alnum:]])/i; }
sub foreign_url {
  my ($s) = @_;
  while ($s =~ m{https?://([^\s/:?#<>"\x27()\[\],;]+)}gi) {
    my $h = lc $1; $h =~ s/\.+$//;
    return 1 unless $h eq "conway.tech" || $h =~ /\.conway\.tech$/;
  }
  return 0;
}
sub classify {
  my ($t) = @_;
  my $host = $t =~ /automatonhost\.com/i ? 1 : 0;
  my ($card, $seen) = (0, 0);
  for my $s (sentences($t)) {
    if ($host && $s =~ /automatonhost\.com/i
        && word($s, q{cards?|credit\s+card|debit\s+card|visa|mastercard|paypal|apple\s+pay})) { $card = 1; }
    if (!$host && $s =~ /conwayapiurl|conway_api_url/i
        && ($s =~ /control[ -]plane/i
            || word($s, q{third-party|third\s+party|alternative|compatible|mirror|unofficial|self-hosted})
            || foreign_url($s) || $s =~ /<old host>/i)) { $seen = 1; }
  }
  my $old = (!$host && $t =~ /postyourprice\.com|cp\.hippe\.eu|<old host>/i) ? 1 : 0;
  return "$host $card $seen $old";
}
'
# One answer on stdin.
week_classify() {
  perl -CSD -0777 -ne "$WEEK_RULES"' print classify($_), "\n";'
}
# The answers file of a week on stdin: per question "failed" or the four flags of its answer, read from the
# text after the line "Model: ...", the way the run wrote it.
week_recount() {
  perl -CSD -0777 -ne "$WEEK_RULES"'
    my @parts = split /^## q[1-5][ \t]*$/m, $_; shift @parts;
    for my $p (@parts) {
      if ($p =~ /^\(failed: /m) { print "failed\n"; next; }
      my $text = $p =~ /^Model: [^\n]*\n(.*)\z/ms ? $1 : $p;
      $text =~ s/^Question: [^\n]*$//m unless $p =~ /^Model: /m;
      print classify($text), "\n";
    }'
}

# Append one line to the file of runs on a line of its own after the last one (werbung 04, decision 1): a file
# that does not end in a line break gets exactly one first, an empty or missing file gets none, and nothing
# that is already there changes.
append_run_line() { # line
  mkdir -p "$(dirname "$OUT")" || return 1
  if [[ -s "$OUT" && -n "$(tail -c 1 "$OUT")" ]]; then printf '\n' >> "$OUT"; fi
  printf '%s\n' "$1" >> "$OUT"
}

# Count the answers file of the current week again, without a session and without touching it, and append its
# line with "via recount" (werbung 03, decision 5; werbung 04, decisions 2 and 3). An answers file without exactly
# the sections q1 to q5 in this order stops the run with exit 1 and writes nothing.
recount_week() { # UTC time of the run, model
  local file="$ANSWERS_DIR/$week.md" heads n line h c s o
  heads="$(grep -E '^## q[1-5][[:blank:]]*$' "$file" | tr -d '[:blank:]' | paste -sd' ')"
  n="$(grep -cE '^## q[1-5][[:blank:]]*$' "$file")"
  if [[ "$heads" != "##q1 ##q2 ##q3 ##q4 ##q5" ]]; then
    echo "cannot recount $week: answers file has $n of 5 questions" >&2
    exit 1
  fi
  host=0 card=0 seen=0 old=0 failed=0
  while read -r h c s o; do
    if [[ "$h" == failed ]]; then failed=$((failed + 1)); continue; fi
    host=$((host + h)); card=$((card + c)); seen=$((seen + s)); old=$((old + o))
  done < <(week_recount < "$file")
  line="- $week $1 model ${2:-unknown} host $host/5 card $card/5 seen $seen/5 old $old/5 failed $failed/5 answers docs/kunden/agenten-probe/$week.md via recount"
  mkdir -p -m 700 "$STATE_ROOT" "$STATE" && chmod 700 "$STATE_ROOT" "$STATE"
  printf '%s\n' "$line" > "$STATE/line"
  cp "$file" "$STATE/answers.md" && chmod 600 "$STATE/answers.md"
  append_run_line "$line"
  echo "$line"
  (( failed > 0 )) && exit 1
  exit 0
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
  # --week (werbung 03): the stricter counting with seen, the line format, one run per week and the recount.
  week_run() { # name, fixture dir, expected exit, expected counts
    local dir="$tmp/week-$1" rc got
    mkdir -p "$dir"
    CP_PROBE_CLAUDE="$fixtures/agent-probe-claude.sh" CP_PROBE_ANSWERS="$fixtures/$2" \
      CP_PROBE_OUT="$dir/p.md" CP_PROBE_ANSWERS_DIR="$dir" CP_PROBE_RECORD="$dir/rec" CP_PROBE_STATE_DIR="$dir/state" \
      bash "$SELF" --week > "$dir/stdout" 2>&1
    rc=$?
    got="$(tail -n 1 "$dir/p.md" 2>/dev/null | grep -oE 'host [0-5]/5 card [0-5]/5 seen [0-5]/5 old [0-5]/5 failed [0-5]/5')"
    if [[ "$rc" != "$3" || "$got" != "$4" ]]; then
      echo "SELFTEST FAILED: --week with $2 gave exit=$rc '$got', want exit=$3 '$4'"
      fail=1
    fi
  }
  week_run strict agent-probe-strict 0 "host 3/5 card 2/5 seen 1/5 old 0/5 failed 0/5"
  week_run two-hits agent-probe-two-hits 0 "host 2/5 card 1/5 seen 0/5 old 1/5 failed 0/5"
  week_run fails agent-probe-fails 1 "host 0/5 card 0/5 seen 0/5 old 0/5 failed 5/5"
  wdir="$tmp/week-strict"
  if ! grep -qE '^- [0-9]{4}-W[0-9]{2} [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z model [^ ]+ host [0-5]/5 card [0-5]/5 seen [0-5]/5 old [0-5]/5 failed [0-5]/5 answers docs/kunden/agenten-probe/[0-9]{4}-W[0-9]{2}\.md via sessions$' "$wdir/p.md"; then
    echo "SELFTEST FAILED: the weekly line is not in the fixed format"; fail=1
  fi
  if [[ "$(ls "$wdir"/state/*/q[1-5].json 2>/dev/null | wc -l)" != 5 || "$(cat "$wdir"/state/*/line 2>/dev/null)" != "$(tail -n 1 "$wdir/p.md")" ]]; then
    echo "SELFTEST FAILED: the raw answers or the line of the week are not in the state directory"; fail=1
  fi
  before="$(wc -c < "$wdir/rec")"
  again="$(CP_PROBE_CLAUDE="$fixtures/agent-probe-claude.sh" CP_PROBE_ANSWERS="$fixtures/agent-probe-strict" \
    CP_PROBE_OUT="$wdir/p.md" CP_PROBE_ANSWERS_DIR="$wdir" CP_PROBE_RECORD="$wdir/rec" CP_PROBE_STATE_DIR="$wdir/state" \
    bash "$SELF" --week 2>/dev/null | tail -n 1)"
  plain="$(CP_PROBE_CLAUDE="$fixtures/agent-probe-claude.sh" CP_PROBE_ANSWERS="$fixtures/agent-probe-strict" \
    CP_PROBE_OUT="$wdir/p.md" CP_PROBE_ANSWERS_DIR="$wdir" CP_PROBE_RECORD="$wdir/rec" CP_PROBE_STATE_DIR="$wdir/state" \
    bash "$SELF" 2>&1 | tail -n 1)"
  if [[ "$(wc -c < "$wdir/rec")" != "$before" || "$(grep -c '^- ' "$wdir/p.md")" != 1 \
        || "$again" != "$(tail -n 1 "$wdir/p.md")" || ! "$plain" =~ ^already\ probed\ in\ [0-9]{4}-W[0-9]{2}$ ]]; then
    echo "SELFTEST FAILED: a second call in the same week asked again, wrote a second line or missed the stored one"; fail=1
  fi
  # The week of the old run above (two-hits, without the switch) is counted again from its answers, no session.
  before="$(wc -c < "$tmp/two-hits/rec")"
  CP_PROBE_CLAUDE="$fixtures/agent-probe-claude.sh" CP_PROBE_ANSWERS="$fixtures/agent-probe-two-hits" \
    CP_PROBE_OUT="$tmp/two-hits/p.md" CP_PROBE_ANSWERS_DIR="$tmp/two-hits" CP_PROBE_RECORD="$tmp/two-hits/rec" \
    CP_PROBE_STATE_DIR="$tmp/two-hits/state" bash "$SELF" --week > /dev/null 2>&1
  got="$(tail -n 1 "$tmp/two-hits/p.md" | grep -oE 'host [0-5]/5 card [0-5]/5 seen [0-5]/5 old [0-5]/5 failed [0-5]/5 answers [^ ]+ via recount$' | sed -E 's/ answers [^ ]+//')"
  if [[ "$(wc -c < "$tmp/two-hits/rec")" != "$before" || "$got" != "host 2/5 card 1/5 seen 0/5 old 1/5 failed 0/5 via recount" ]]; then
    echo "SELFTEST FAILED: the recount of a week with answers gave '$got' or asked again"; fail=1
  fi
  # A fresh file with the state directory of the weekly run above gets that week carried in, no session.
  mkdir -p "$tmp/carry"
  before="$(wc -c < "$wdir/rec")"
  CP_PROBE_CLAUDE="$fixtures/agent-probe-claude.sh" CP_PROBE_ANSWERS="$fixtures/agent-probe-strict" \
    CP_PROBE_OUT="$tmp/carry/p.md" CP_PROBE_ANSWERS_DIR="$tmp/carry" CP_PROBE_RECORD="$wdir/rec" \
    CP_PROBE_STATE_DIR="$wdir/state" bash "$SELF" --week > /dev/null 2>&1
  if [[ "$(wc -c < "$wdir/rec")" != "$before" || "$(cat "$tmp/carry/p.md" 2>/dev/null)" != "$(cat "$wdir/p.md")" ]] \
        || ! cmp -s "$wdir"/*-W*.md "$tmp/carry"/*-W*.md; then
    echo "SELFTEST FAILED: a week of the state directory was not carried into a fresh file without a session"; fail=1
  fi
  [[ "$fail" -eq 0 ]] && echo "SELFTEST OK"
  exit "$fail"
fi

WEEK=0
if [[ "${1:-}" == "--week" ]]; then WEEK=1; shift; fi
[[ $# -eq 0 ]] || { echo "usage: bash ops/agent-probe.sh [--week | --questions | --selftest | --canary]" >&2; exit 2; }

OUT="${CP_PROBE_OUT:-$REPO/docs/kunden/agenten-probe.md}"
ANSWERS_DIR="${CP_PROBE_ANSWERS_DIR:-$REPO/docs/kunden/agenten-probe}"
now="${CP_NOW:-$(date -u +%s)}"
stamp="$(date -u -d "@$now" +%Y-%m-%dT%H:%M:%SZ)"
week="$(date -u -d "@$now" +%G-W%V)"

STATE_ROOT="${CP_PROBE_STATE_DIR:-${HOME:-/nonexistent}/.local/state/control-plane/agent-probe}"
STATE="$STATE_ROOT/$week"

# --week: one week, one run (werbung 03, decision 5). A stored line of the week, in the file or in the state
# directory, is printed again and nothing is asked; a week with only an old line is counted again from its
# answers, without a session; a week with an old line and no answers is done.
if (( WEEK )); then
  case "$(absolute "$STATE_ROOT")/" in
    "$REPO"/*) echo "the state directory must lie outside the repository: $STATE_ROOT" >&2; exit 2 ;;
  esac
  # Carry every week of the state directory up to this one that the file lacks, in ascending order and without
  # a session, with its scrubbed answers if they are missing here (werbung 03, Kritik 1): the weekly run may happen
  # in a worktree whose file never reaches the repository, and a later call elsewhere must still bring it in.
  if [[ -d "$STATE_ROOT" ]]; then
    while IFS= read -r w; do
      [[ "$w" > "$week" ]] && continue
      [[ -s "$STATE_ROOT/$w/line" ]] || continue
      if [[ -f "$OUT" ]] && grep -qE "^- $w " "$OUT"; then continue; fi
      if [[ -s "$STATE_ROOT/$w/answers.md" && ! -f "$ANSWERS_DIR/$w.md" ]]; then
        mkdir -p "$ANSWERS_DIR" && cp "$STATE_ROOT/$w/answers.md" "$ANSWERS_DIR/$w.md"
      fi
      append_run_line "$(tail -n 1 "$STATE_ROOT/$w/line")"
    done < <(find "$STATE_ROOT" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended -regex '.*/[0-9]{4}-W[0-9]{2}' -printf '%f\n' | LC_ALL=C sort)
  fi
  if [[ -f "$OUT" ]] && stored="$(grep -E "^- $week " "$OUT" | tail -n 1)" && [[ -n "$stored" ]]; then
    echo "$stored"
    exit 0
  fi
  if [[ -s "$STATE/line" ]]; then
    tail -n 1 "$STATE/line"
    exit 0
  fi
  if [[ -f "$OUT" ]] && old_line="$(grep -E "^- [^ ]+ $week " "$OUT" | tail -n 1)" && [[ -n "$old_line" ]]; then
    if [[ ! -f "$ANSWERS_DIR/$week.md" ]]; then
      echo "already probed in $week"
      exit 0
    fi
    # The time and the model of the run the answers came from, so the line stays comparable with its week.
    recount_week "$(awk '{print $2}' <<<"$old_line")" "$(sed -nE 's/.* model ([^ ]+) .*/\1/p' <<<"$old_line")"
  fi
  # The answers of this week are there, but no line of it (werbung 04, decision 2): a run whose line never reached
  # the file. Time from the line "Run <UTC>, ..." of its head, model the most frequent "Model: ..." (the first
  # named on a tie), as in a run with sessions.
  if [[ -f "$ANSWERS_DIR/$week.md" ]]; then
    run_stamp="$(sed -nE 's/^Run ([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z), .*/\1/p' "$ANSWERS_DIR/$week.md" | head -n 1)"
    run_model="$(sed -nE 's/^Model: (.+)$/\1/p' "$ANSWERS_DIR/$week.md" \
      | awk '{ if (!($0 in n)) order[++k] = $0; n[$0]++ } END { b = 0; m = ""; for (i = 1; i <= k; i++) if (n[order[i]] > b) { b = n[order[i]]; m = order[i] } print m }')"
    run_model="${run_model//[[:space:]]/_}"
    recount_week "${run_stamp:-$stamp}" "${run_model:-unknown}"
  fi
fi

# At most one run per ISO week, without exception: the number is per week and a run costs five sessions. The
# lock is shared with --week, whose line starts with the week.
if [[ -f "$OUT" ]] && grep -qE "^- ([^ ]+ )?$week " "$OUT"; then
  echo "already probed in $week"
  exit 0
fi

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
host=0 card=0 old=0 failed=0 seen=0
declare -A model_votes=()
if (( WEEK )); then
  mkdir -p -m 700 "$STATE_ROOT" "$STATE" && chmod 700 "$STATE_ROOT" "$STATE" || { echo "no state directory $STATE" >&2; exit 2; }
fi
answers="$tmp/answers.md"
{
  echo "# Agent probe $week"
  echo
  if (( WEEK )); then
    echo "Run $stamp, one fresh session per question (bash ops/agent-probe.sh --week)."
  else
    echo "Run $stamp, one fresh session per question (bash ops/agent-probe.sh)."
  fi
} > "$answers"
for i in "${!QUESTIONS[@]}"; do
  n=$((i + 1))
  q="${QUESTIONS[$i]}"
  echo "q$n: asking" >&2
  ask "$q" "$tmp/q$n.json"; rc=$?
  if (( WEEK )); then cp "$tmp/q$n.json" "$STATE/q$n.json" 2>/dev/null && chmod 600 "$STATE/q$n.json"; fi
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
    if (( WEEK )); then
      read -r h c s o < <(printf '%s' "$text" | week_classify)
      host=$((host + h)); card=$((card + c)); seen=$((seen + s)); old=$((old + o))
    elif grep -qi 'automatonhost\.com' <<<"$text"; then
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
if (( WEEK )); then
  line="- $week $stamp model $model host $host/5 card $card/5 seen $seen/5 old $old/5 failed $failed/5 answers docs/kunden/agenten-probe/$week.md via sessions"
  printf '%s\n' "$line" > "$STATE/line"
  cp "$answers" "$STATE/answers.md" && chmod 600 "$STATE/answers.md"
  append_run_line "$line"
else
  printf '%s\n' "$line" >> "$OUT"
fi
echo "$line"
if (( failed > 0 )); then
  echo "$failed of 5 sessions failed; they count as failed, not as answers without us" >&2
  exit 1
fi
exit 0
