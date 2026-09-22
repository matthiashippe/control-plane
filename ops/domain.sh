#!/usr/bin/env bash
# Is a domain available? Two sources, because one lies.
#
# RDAP alone is not enough: rdap.org answers 404 both for a free domain AND for a TLD that has no
# RDAP entry at all. On 22 September 2026 that made it report sentry.io, angel.co and pkg.sh as
# free. So every FREE from RDAP is confirmed against the registry whois before it is printed.
#
# The local `whois` without -h is no help either: it does not follow the IANA referral and answers
# with the record of the TLD instead of the domain, which printed handsel.co as "created
# 1991-12-24" (that is the delegation date of .co, not a registration).
#
# Prove both directions before trusting a run: ops/domain.sh --selftest
set -uo pipefail

registry_whois_host() {
  case "${1##*.}" in
    com|net) echo whois.verisign-grs.com ;;
    io)      echo whois.nic.io ;;
    co)      echo whois.nic.co ;;
    sh)      echo whois.nic.sh ;;
    dev|app) echo whois.nic.google ;;
    ai)      echo whois.nic.ai ;;
    *)       echo "whois.nic.${1##*.}" ;;
  esac
}

whois_verdict() { # -> free | taken | unclear
  local out
  out=$(whois -h "$(registry_whois_host "$1")" "$1" 2>/dev/null)
  [ -z "$out" ] && { echo unclear; return; }
  if echo "$out" | /usr/bin/grep -qiE "^(No match|NOT FOUND|No Data Found|Domain not found|No entries found|Domain Status: *free|This domain name has not been registered)"; then
    echo free
  elif echo "$out" | /usr/bin/grep -qiE "Creation Date:|Registered on:|^created:|Domain Name:"; then
    echo taken
  else
    echo unclear
  fi
}

look() {
  local d="$1" body code created registrar verdict
  body=$(mktemp)
  code=$(curl -sS -o "$body" -w '%{http_code}' -m 15 -L "https://rdap.org/domain/$d" 2>/dev/null)
  if [ "$code" = 200 ]; then
    created=$(python3 -c "import json;x=json.load(open('$body'));print(next((e['eventDate'][:10] for e in x.get('events',[]) if e['eventAction']=='registration'),'?'))" 2>/dev/null)
    registrar=$(python3 -c "import json;x=json.load(open('$body'));print(next((e.get('vcardArray',[None,[]])[1][1][3] for e in x.get('entities',[]) if 'registrar' in e.get('roles',[])),'?'))" 2>/dev/null)
    printf 'TAKEN    %-28s since %s   %s\n' "$d" "$created" "$registrar"
  else
    verdict=$(whois_verdict "$d")
    case "$verdict" in
      free)   printf 'FREE     %-28s (rdap %s and whois agree)\n' "$d" "$code" ;;
      taken)  printf 'TAKEN    %-28s (whois; rdap %s was blind to this TLD)\n' "$d" "$code" ;;
      *)      printf 'UNCLEAR  %-28s (rdap %s, whois inconclusive)\n' "$d" "$code" ;;
    esac
  fi
  rm -f "$body"
  sleep 1
}

# A free name is only half the question. A taken one that answers with a title in our own category
# is a competitor, and that is the half the 20 September name check missed: it read the registry and
# never loaded the page. See .scratch/gtm/namenskollision.md.
serves() {
  local d="$1" code title
  # Wipe the buffer first. Leaving a stale one made a failed fetch of handsel.app print the title of
  # the previous domain, which is how a dead name briefly looked like a third competitor.
  rm -f /tmp/domain-serves.html
  code=$(curl -sS -o /tmp/domain-serves.html -w '%{http_code}' -m 12 -L "https://$d" 2>/dev/null)
  if [ "$code" = 000 ] || [ -z "$code" ]; then
    printf '  %-24s no answer\n' "$d"
    return
  fi
  title=$(python3 - <<PY 2>/dev/null
import re
h=open('/tmp/domain-serves.html',encoding='utf8',errors='replace').read()
m=re.search(r'<title[^>]*>(.*?)</title>',h,re.S|re.I)
print((m.group(1).strip().replace('\n',' ')[:100]) if m else '(no title)')
PY
)
  printf '  %-24s HTTP %s   %s\n' "$d" "$code" "$title"
  rm -f /tmp/domain-serves.html
}

case "${1:-}" in
  --selftest)
    echo "these must all say TAKEN:"
    for d in google.com sentry.io angel.co crypto.market clean.works remote.work pkg.sh cloud.tech; do look "$d"; done
    echo "these must all say FREE:"
    for d in qxzvbnmasdf12345zz.com qxzvbnmasdf12345zz.io qxzvbnmasdf12345zz.sh qxzvbnmasdf12345zz.market; do look "$d"; done
    echo "note: .co has no usable registry whois from here, expect UNCLEAR for angel.co"
    ;;
  --serves)
    shift; for d in "$@"; do serves "$d"; done ;;
  ""|-h|--help)
    echo "usage: ops/domain.sh <domain>...         availability, two sources"
    echo "       ops/domain.sh --serves <domain>...  what a taken domain actually answers"
    echo "       ops/domain.sh --selftest            prove both directions first" ;;
  *)
    for d in "$@"; do look "$d"; done ;;
esac
