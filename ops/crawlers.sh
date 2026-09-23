#!/usr/bin/env bash
# Which search engines have actually been here, what they took, and what they never asked for.
#
#   ops/crawlers.sh              read the live log on the VM
#   ops/crawlers.sh --selftest   prove the verification separates a real crawler from a fake one
#   CP_CRAWLER_LOG=file ops/crawlers.sh   read a local log instead of the VM
#
# Why this exists. On 2026-09-23 the traffic report showed two lines that looked like search
# traffic: a Googlebot user agent, and a visitor with `https://bing.com/` as its referrer. One of
# them was real and the other was not, and a user agent string cannot tell you which. Anybody can
# send `Googlebot/2.1`, and referrer spam from a datacentre is the oldest trick there is.
#
# The only answer Google itself accepts is a DNS round trip: the address must reverse-resolve to a
# host under googlebot.com or google.com, and that host must forward-resolve back to the same
# address. A faker controls neither direction. Bing documents the same procedure for search.msn.com.
# That is what this script does, and it is the whole reason it is not a grep.
set -uo pipefail
HOST="${CP_DEPLOY_HOST:-root@76.13.144.207}"
KEY="${CP_DEPLOY_KEY:-$HOME/.ssh/id_ed25519_automaton}"
DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "${1:-}" = "--selftest" ]; then
  # Two addresses, both claiming to be Googlebot in the log. 66.249.70.7 really did visit on
  # 2026-09-22 and belongs to Google. 205.169.39.19 sent a bing.com referrer from a datacentre.
  # A checker that believes the user agent calls both of them a crawler. This one must not.
  fixture="$(mktemp)"
  cat > "$fixture" <<'JSON'
{"ts":1758563778,"request":{"remote_ip":"66.249.70.7","uri":"/robots.txt","headers":{"User-Agent":["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"]}},"status":200}
{"ts":1758563779,"request":{"remote_ip":"66.249.70.7","uri":"/","headers":{"User-Agent":["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"]}},"status":200}
{"ts":1758567459,"request":{"remote_ip":"205.169.39.19","uri":"/fix","headers":{"User-Agent":["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"],"Referer":["https://bing.com/"]}},"status":200}
JSON
  out="$(CP_CRAWLER_LOG="$fixture" "$0" 2>&1)"
  rm -f "$fixture"
  echo "$out"
  echo
  real=$(echo "$out" | grep -c "VERIFIED  *Googlebot" || true)
  fake=$(echo "$out" | grep -c "205.169.39.19" || true)
  claimed=$(echo "$out" | grep -c "claimed to be a crawler and is not" || true)
  echo "SELFTEST  real=$real fake_listed=$fake fake_section=$claimed"
  if [ "$real" -ge 1 ] && [ "$claimed" -ge 1 ]; then
    echo "SELFTEST OK  the DNS round trip kept the real one and rejected the impostor."
    exit 0
  fi
  echo "SELFTEST FAILED  it did not separate them. Without that this script is a user-agent grep."
  exit 1
fi

# Our own addresses, so that a test run of ours with a Googlebot user agent is reported as ours
# and not filed under impostors forever. On 2026-09-23 exactly that happened: 82.194.125.90 is
# this machine, and the section meant to expose fakers led with our own curl.
source "$DIR/own-ips.sh"
CP_OWN_ADDRESSES="$(own_ips 2>/dev/null)"
export CP_OWN_ADDRESSES

if [ -n "${CP_CRAWLER_LOG:-}" ]; then
  cat "$CP_CRAWLER_LOG"
else
  # gzip on the far side: the access log passed 30 MB on 2026-09-23 and compresses to about 1.3 MB,
  # which is the difference between one second and forty on this link. Measured, not assumed.
  "$(dirname "$0")/access-log.sh"
fi | python3 "$DIR/crawlers.py"
