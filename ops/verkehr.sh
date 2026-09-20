#!/usr/bin/env bash
# Wer war da, und woher kam er?
#
# Die Frage, die jeden Loop-Zyklus eroeffnet, und sie ist von Hand jedes Mal dieselbe Kette aus
# ssh, jq und sort. Wichtig ist der ERSTE Request einer IP: Nur dort steht der Referrer, der sagt,
# ueber welchen Kanal jemand gekommen ist. Jeder Folge-Request traegt cp.hippe.eu und ist wertlos.
#
#   ops/verkehr.sh          letzte 24 Stunden
#   ops/verkehr.sh 72       letzte 72 Stunden
set -euo pipefail

STUNDEN="${1:-24}"
KEY="${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}"
HOST="${CP_HOST:-root@76.13.144.207}"
# Der Anschluss des Betreibers und die VM selbst. Ohne diesen Filter besteht das Bild aus uns.
EIGENE="${CP_EIGENE_IPS:-82.194.125.90 76.13.144.207}"

seit=$(( $(date -u +%s) - STUNDEN * 3600 ))
# Als JSON-Liste an jq, nicht als zusammengebauter Ausdruck: Ein `paste -d' and '` setzt nur das
# erste Zeichen als Trenner, und der Filter war dadurch still kaputt.
eigene_json=$(printf '%s' "$EIGENE" | tr ' ' '\n' | jq -R . | jq -sc .)
FREMD='select(.request.remote_ip as $ip | ($eigene | index($ip)) == null)' 

log=$(mktemp); trap 'rm -f "$log"' EXIT
ssh -i "$KEY" -o ConnectTimeout=10 "$HOST" \
  'docker exec deploy-caddy-1 cat /var/log/caddy/access.log' 2>/dev/null > "$log"

echo "Zugriffe der letzten $STUNDEN Stunden auf cp.hippe.eu"
echo

echo "── Erster Request je fremder IP (hier steht der Referrer) ──"
jq -r --argjson seit "$seit" --argjson eigene "$eigene_json" \
  "select(.ts > \$seit) | $FREMD | [(.ts|floor|tostring), .request.remote_ip, .request.uri, (.status|tostring), ((.request.headers.Referer // [\"-\"])[0]), ((.request.headers[\"User-Agent\"] // [\"-\"])[0]|.[0:40])] | @tsv" "$log" \
  | sort -k2,2 -k1,1n | awk -F'\t' '!gesehen[$2]++' | sort -k1,1n \
  | while IFS=$'\t' read -r ts ip uri st ref ua; do
      printf '%s  %-16s %-28s %3s  %-28s %s\n' "$(date -u -r "$ts" +%m-%d\ %H:%M 2>/dev/null || echo "$ts")" "$ip" "${uri:0:28}" "$st" "${ref:0:28}" "$ua"
    done

echo
echo "── Fremde Referrer (alles, was nicht wir selbst sind) ──"
jq -r --argjson seit "$seit" "select(.ts > \$seit) | (.request.headers.Referer // [\"-\"])[0]" "$log" \
  | grep -v '^-$' | grep -v 'cp\.hippe\.eu' | sort | uniq -c | sort -rn || echo "  keine"

echo
echo "── Fehlerantworten an Fremde (was ein Besucher zu sehen bekam) ──"
jq -r --argjson seit "$seit" --argjson eigene "$eigene_json" \
  "select(.ts > \$seit) | $FREMD | select(.status >= 400) | select(.request.uri | test(\"wp-|php|\\\\.env|\\\\.git|admin|xmlrpc\") | not) | [(.status|tostring), .request.uri] | @tsv" "$log" \
  | sort | uniq -c | sort -rn | head -10 || echo "  keine"
