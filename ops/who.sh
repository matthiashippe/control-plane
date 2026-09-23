#!/usr/bin/env bash
# Everything this service knows about one address.
#
#   ops/who.sh 45.87.212.182
#   ops/who.sh --selftest
#   CP_WHO_LOG=file ops/who.sh 1.2.3.4
#
# The standing order says to look at the referrer on the FIRST request of a new address, because
# that is the evidence for whether the issue answers are the channel. Doing that by hand took a
# fresh throwaway script three cycles running, each one a little different, and the third one
# asked a question the first two could not: which headers came with it.
#
# That question decided the case on 2026-09-23. One address arrived at 02:22 UTC straight on /fix,
# with no referrer and a Chrome 139 user agent, which is exactly what somebody coming from a
# Conway onboarding issue would look like. It sent Accept: */* instead of text/html, no
# Accept-Language and no Sec-Fetch-Dest. Chrome sends all three on a navigation, always. It was a
# fetcher wearing a browser name, and without the headers it would have been logged as the first
# person to arrive at that page.
#
# What the headers can and cannot say: a request WITHOUT them is not a browser, and a request WITH
# them is only a request that looks like one, because a headless browser sends real ones. They
# rule out, they do not rule in. Whether somebody read anything is a question for the depth
# pixels, and ops/traffic.sh answers it.
set -uo pipefail
HOST="${CP_DEPLOY_HOST:-root@76.13.144.207}"
KEY="${CP_DEPLOY_KEY:-$HOME/.ssh/id_ed25519_automaton}"
DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "${1:-}" = "--selftest" ]; then
  fixture="$(mktemp)"
  cat > "$fixture" <<'JSON'
{"ts":1758594174,"request":{"remote_ip":"1.1.1.1","uri":"/fix","headers":{"User-Agent":["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"],"Accept":["*/*"]}},"status":200}
{"ts":1758594175,"request":{"remote_ip":"2.2.2.2","uri":"/","headers":{"User-Agent":["Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0"],"Accept":["text/html,application/xhtml+xml"],"Accept-Language":["de-DE,de;q=0.9"],"Sec-Fetch-Dest":["document"],"Referer":["https://github.com/Conway-Research/automaton/issues/392"]}},"status":200}
{"ts":1758594200,"request":{"remote_ip":"2.2.2.2","uri":"/px/top.png","headers":{"User-Agent":["Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0"]}},"status":200}
{"ts":1758594260,"request":{"remote_ip":"2.2.2.2","uri":"/px/proof.png","headers":{"User-Agent":["Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0"]}},"status":200}
JSON
  echo "--- the fetcher wearing a browser name ---"
  a="$(CP_WHO_LOG="$fixture" "$0" 1.1.1.1 2>&1)"
  echo "$a"
  echo
  echo "--- the reader who scrolled ---"
  b="$(CP_WHO_LOG="$fixture" "$0" 2.2.2.2 2>&1)"
  echo "$b"
  rm -f "$fixture"
  echo
  bad_called=$(printf '%s' "$a" | grep -ci "not a browser" || true)
  good_called=$(printf '%s' "$b" | grep -c "sends what a browser sends" || true)
  scroll=$(printf '%s' "$b" | grep -c "scrolled" || true)
  echo "SELFTEST  fetcher_named=$bad_called browser_named=$good_called scroll_seen=$scroll"
  if [ "$bad_called" -ge 1 ] && [ "$good_called" -ge 1 ] && [ "$scroll" -ge 1 ]; then
    echo "SELFTEST OK  it separates the two and sees the scroll."
    exit 0
  fi
  echo "SELFTEST FAILED  it cannot tell them apart, which is the only thing it is for."
  exit 1
fi

ip="${1:-}"
if [ -z "$ip" ]; then
  echo "usage: ops/who.sh <address>" >&2
  exit 2
fi

if [ -n "${CP_WHO_LOG:-}" ]; then
  cat "$CP_WHO_LOG"
else
  ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 "$HOST" \
    "docker exec deploy-caddy-1 cat /var/log/caddy/access.log 2>/dev/null | grep -F '$ip' | gzip -c" | gunzip -c
fi | CP_WHO_IP="$ip" python3 "$DIR/who.py"
