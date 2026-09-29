#!/usr/bin/env bash
# The blockers, measured instead of listed.
#
# ZIELE.md has carried a section called "Was auf Matthias wartet" since 23.09., seven items in
# prose. On 2026-09-29 three of them were stale at once and nobody had noticed:
#
#   - the merchant account at PayAI was "the only remaining door into the x402 catalogue" two days
#     after this service was listed without one
#   - the Caddyfile patch was still "waiting" although both halves were applied and deployed
#   - the domain was still an open question although postyourprice.com had been bought
#
# Matthias found all three by reading a deck built from that list, which is the wrong way round:
# he had to tell the loop things that were already true. Prose with bullet points cannot go stale
# loudly, so the ones that can be measured are measured here, every cycle, against production.
#
#   ops/sperren.sh              what is really still blocked
#   ops/sperren.sh --selftest   the counter-proof on planted answers
#
# Exit 0 when nothing measurable is blocked, 1 when something is, 2 when it could not look.
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="${CP_URL:-https://postyourprice.com}"
offen=0
ok()   { printf '  OK     %-44s %s\n' "$1" "${2:-}"; }
bad()  { offen=$((offen+1)); printf '  OFFEN  %-44s %s\n' "$1" "${2:-}"; }
grey() { printf '  ----   %-44s %s\n' "$1" "${2:-}"; }

if [[ "${1:-}" == "--selftest" ]]; then
  fail=0
  # Jede Pruefung unten haengt an einer Zeichenkette aus der Produktion. Hier werden beide
  # Richtungen gepflanzt, damit keine davon eine Konstante ist.
  t() { # name, haystack, needle, erwartet(ja|nein)
    if printf '%s' "$2" | grep -q "$3"; then got=ja; else got=nein; fi
    if [[ "$got" == "$4" ]]; then echo "  ok      $1"; else echo "  FAILED  $1: $got, erwartet $4"; fail=1; fi
  }
  t "form-action self erkannt"        "x form-action 'self' y" "form-action 'self'" ja
  t "form-action none nicht verwechselt" "x form-action 'none' y" "form-action 'self'" nein
  t "delete brief erkannt"            "request>uri query { delete brief }" "delete brief" ja
  t "facilitator erkannt"             "facilitator"                        "facilitator"  ja
  t "ein eigener Settler faellt auf"  "local"                              "facilitator"  nein
  t "fehlendes delete brief gesehen"  "request>uri query { }"              "delete brief" nein
  (( fail == 0 )) && echo "SPERREN SELFTEST OK" || echo "SPERREN SELFTEST FAILED"
  exit $fail
fi

echo "Sperren, gemessen gegen $BASE"
echo

# 1. Die Domain. Gekauft am oder vor dem 29.09., und sie antwortet.
code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$BASE/health")
[[ "$code" == "200" ]] && ok "die Domain steht und antwortet" "$BASE" \
                       || bad "die Domain antwortet nicht" "$code"

# 2. Das Caddyfile. Beide Haelften, jede an dem geprueft, was sie bewirken soll, nicht am Patch.
csp=$(curl -s -D- -o /dev/null -m 15 "$BASE/" | grep -i '^content-security-policy' || true)
case "$csp" in
  *"form-action 'self'"*) ok "Formulare duerfen absenden" "form-action 'self'" ;;
  "")                     bad "keine CSP-Kopfzeile zu lesen" ;;
  *)                      bad "das Formular auf /check kann nicht absenden" "form-action fehlt oder 'none'" ;;
esac
marker="sperrenpruefung-$$"
curl -s -o /dev/null -m 15 "$BASE/check?brief=$marker" || true
sleep 2
if ./ops/access-log.sh 2>/dev/null | tail -200 | grep -q "$marker"; then
  bad "Entwuerfe stehen im Zugriffslog" "der Marker war lesbar"
else
  ok "Entwuerfe werden aus dem Log geloescht" "Marker nicht auffindbar"
fi

# 3. Die Issue-Antworten. Was noch ungesendet in der Mappe liegt, sagt das Gatter selbst.
rest=$(python3 ./ops/before-the-answers.py 2>/dev/null | grep -oE '^[0-9]+ still to send' | grep -oE '^[0-9]+' || echo "?")
if [[ "$rest" == "0" ]]; then
  ok "alle Antworten sind raus"
elif [[ "$rest" == "?" ]]; then
  grey "Antworten: das Gatter war nicht lesbar"
else
  bad "$rest Antwort(en) liegen noch" "ops/post-the-answers.py --send 3"
fi

# 4. Gas. Und die Antwort darauf ist seit dem 29.09. nein, aus einem messbaren Grund.
#
# Hier stand vorher "21,92 USDC liegen fest, 0 ETH, also kein Gas", und das war die falsche Frage,
# dreimal an Matthias gestellt. Nachgemessen: **dieser Dienst sendet nie selbst eine Transaktion.**
# `CP_SETTLER=facilitator` in der Produktion, und der Facilitator reicht die EIP-3009-Zahlung ein
# und zahlt ihr Gas. Genau deshalb stand die Wallet des zahlenden Kunden am 27.09. auf Nonce 0,
# waehrend sein USDC floss. Der selbst-settlende Pfad (`LocalSettler`, `writeContract` in
# src/payments/settler.ts) existiert nur im Code, und loop-constraints.md verbietet ihn im Betrieb.
#
# Also braucht der Dienst kein Gas, und die Einnahmen auf der payTo-Adresse sind Einnahmen in
# Matthias' Verwahrung und kein blockiertes Kapital. Wir halten fuer diese Adresse ohnehin keinen
# Schluessel: die VM kennt `CP_PAY_TO`, aber keinen privaten Schluessel dazu.
#
# Die Sperre waere zurueck, sobald der Betrieb selbst settlen muesste. Genau das prueft diese
# Zeile, und nichts anderes.
settler=$(ssh -o ConnectTimeout=10 -i "${CP_VM_KEY:-$HOME/.ssh/id_ed25519_automaton}" \
  "root@${CP_VM:-76.13.144.207}" 'grep -oE "^CP_SETTLER=.*" /opt/control-plane/.env | cut -d= -f2' 2>/dev/null | tr -d '\r')
case "$settler" in
  facilitator) ok "kein Gas noetig" "CP_SETTLER=facilitator, der Facilitator reicht ein" ;;
  "")          grey "Gas: die Einstellung war nicht lesbar" ;;
  *)           bad "der Betrieb settlet selbst ($settler) und braucht damit Gas" \
                   "loop-constraints.md verbietet das ausserdem" ;;
esac

# 5. Was sich von hier nicht messen laesst, und das ehrlich gesagt.
grey "Search Console und Bing" "nur im Browser zu sehen"
grey "Stripe ueber HTC" "Vertragspartnerfrage, nicht messbar"

echo
(( offen == 0 )) && echo "KEINE MESSBARE SPERRE OFFEN" || echo "OFFEN: $offen"
exit $(( offen == 0 ? 0 : 1 ))
