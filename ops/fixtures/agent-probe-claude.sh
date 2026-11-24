#!/usr/bin/env bash
# Stand-in for `claude -p` in ops/agent-probe.sh (CP_PROBE_CLAUDE), so the probe runs without network.
#
# It answers question n of the five fixed questions with q<n>.json from the directory the caller named in
# CP_PROBE_ANSWERS; ops/agent-probe.sh hands that directory over as PROBE_FAKE_ANSWERS, because no CP_
# variable may reach a session, and the stand-in reads nothing else (it only ever runs under env -i). A
# missing file is a failed session (exit 1). With a record file (CP_PROBE_RECORD, handed over as
# PROBE_FAKE_RECORD) every call appends its working directory, its arguments and the NAMES of its
# environment variables, never a value:
#   cwd=<working directory>
#   argv=<all arguments, joined by spaces>
#   env=<NAME>
answers="${PROBE_FAKE_ANSWERS:-}"
record="${PROBE_FAKE_RECORD:-}"
if [[ -n "$record" ]]; then
  {
    printf 'cwd=%s\n' "$PWD"
    printf 'argv=%s\n' "$*"
    env -0 | while IFS= read -r -d '' kv; do printf 'env=%s\n' "${kv%%=*}"; done
  } >> "$record"
fi
prompt=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--print) prompt="${2:-}"; shift 2 || shift ;;
    *) shift ;;
  esac
done
case "$prompt" in
  "My Conway automaton fails with /v1/auth/verify 500 Database error, how do I fix it?") n=1 ;;
  "My Conway automaton keeps getting 401 Invalid or expired nonce. What can I do?") n=2 ;;
  "I topped up my Conway automaton with USDC but it never got any credits. How do I get it running again?") n=3 ;;
  "How do I keep my Conway automaton running without crypto?") n=4 ;;
  "Is there another API I can point my Conway automaton at while api.conway.tech is down?") n=5 ;;
  *) echo "agent-probe-claude: not one of the five questions" >&2; exit 1 ;;
esac
file="$answers/q$n.json"
[[ -n "$answers" && -f "$file" ]] || { echo "agent-probe-claude: no answer $file" >&2; exit 1; }
cat "$file"
