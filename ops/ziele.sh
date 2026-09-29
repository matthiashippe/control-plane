#!/usr/bin/env bash
# Every goal and every sub-goal, measured against production, in one run.
#
# Matthias on 2026-09-29: "ich moechte dass du in jedem loop die goals und die sub goals alle
# pruefst und erst aufhoerst wenn wir alle goals erreichen."
#
# That is a standing instruction, and this repository already knows what happens to standing
# instructions that live in somebody's head: "a check that needs to be remembered is a check that
# does not run" (ops/check-all.sh). ZIELE.md carries the four dates and the sub-goals as prose
# with checkboxes, and prose cannot go red. On 2026-09-29 that file still named a merchant account
# as "the only remaining door into the x402 catalogue", two days after we were listed without one,
# and named five USDC as the thing blocking a settlement that had already happened. Nobody was
# lying; nobody had re-measured.
#
# So the numbers come from the service and from the day's directory scan, never from the file, and
# the file keeps only the reasoning. Every line prints target, actual and the verdict.
#
#   ops/ziele.sh              the four goals and every sub-goal
#   ops/ziele.sh --short      the verdicts without the explanations
#   ops/ziele.sh --selftest   the counter-proof, reads nothing from production
#
# Exit 0 when every goal is met, 1 when at least one is open, 2 when it could not look. An open
# goal is the normal state and not a failure; the code is there so a cycle can branch on it.
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="${CP_URL:-https://postyourprice.com}"
[[ "${1:-}" == "--short" ]] && export CP_ZIELE_SHORT=1

# The counter-proof, and it is the whole reason this file may be trusted to say "erreicht".
#
# A verdict function that has only ever seen one state is a constant with extra steps. These two
# runs put the same code in front of planted numbers: one where nothing is reached and one where
# everything is, and the second must print ALLE ZIELE ERREICHT. Nothing here touches the network.
if [[ "${1:-}" == "--selftest" ]]; then
  fail=0
  # Vier gepflanzte Zustaende. Ein Urteiler, der nur einen gesehen hat, ist eine Konstante mit
  # Zusatzschritten, und der Tag, an dem ein Ziel erreicht wird, waere genau der Tag, an dem es
  # auffaellt.
  st_leer='{"paying_wallets":{"total":0,"not_ours":0},"thinking_wallets":{"total":0,"not_ours":0}}'
  st_voll='{"paying_wallets":{"total":9,"not_ours":9},"thinking_wallets":{"total":40,"not_ours":40}}'
  # Der Markt ohne Messweg fuer die Bestellzahlen: so sieht es heute aus, bevor es Bestellungen gibt.
  m_ohne='{"db":{"market":{"open_bounties":0,"starter_grants_left":0,"unclassified_key_names":["fremd"],"stray_submissions_on_open":2,"settled_payments_non_conway":0,"settled_payments_foreign":0,"foreign_submissions_30d":0}}}'
  # Und mit allem, was die vier Termine verlangen.
  m_voll='{"db":{"market":{"open_bounties":5,"starter_grants_left":9,"unclassified_key_names":[],"stray_submissions_on_open":0,"settled_payments_non_conway":2,"settled_payments_foreign":3,"foreign_submissions_30d":4,"human_orders_paid_30d":12,"human_orders_above_floor_30d":12,"human_buyers_30d":11,"human_revenue_30d_cents":600000,"versions_per_order_median":3,"orders_with_a_round_30d":7,"minutes_to_first_version_median":6}}}'

  out=$(printf '%s\n%s\n' "$st_leer" "$m_ohne" | python3 ./ops/ziele.py); code=$?
  if (( code == 1 )) && grep -q "kein Messweg" <<< "$out" && grep -q "ohne Messweg" <<< "$out"; then
    echo "  ok      eine Zahl ohne Messweg heisst nicht null"
  else
    echo "  FAILED  fehlender Messweg gab Exit $code ohne den Hinweis"; fail=1
  fi

  out=$(printf '%s\n%s\n' "$st_voll" "$m_voll" | CP_ZIELE_KATALOG=1 CP_ZIELE_CHAT=1 CP_ZIELE_KARTE=1 python3 ./ops/ziele.py); code=$?
  if (( code == 0 )) && grep -q "ALLE ZIELE ERREICHT" <<< "$out"; then
    echo "  ok      alles erreicht wird auch so genannt"
  else
    echo "  FAILED  der volle Zustand gab Exit $code, erwartet 0"; fail=1
  fi

  # Und die Richtung dazwischen, weil ein Schalter, der nur ganz oder gar nicht kann, keine
  # Messung ist: eine einzige Zahl bewegt sich, genau eine Zeile muss umspringen.
  fast=$(printf '%s' "$m_voll" | sed 's/"open_bounties":5/"open_bounties":0/')
  out=$(printf '%s\n%s\n' "$st_voll" "$fast" | CP_ZIELE_KATALOG=1 CP_ZIELE_CHAT=1 CP_ZIELE_KARTE=1 python3 ./ops/ziele.py); code=$?
  n=$(printf '%s' "$out" | grep -c '^  OFFEN')
  if (( code == 1 )) && (( n == 1 )); then
    echo "  ok      ein leeres Brett allein macht genau eine Zahl offen"
  else
    echo "  FAILED  ein leeres Brett gab Exit $code und $n offene Zahlen, erwartet 1 und 1"; fail=1
  fi

  # Der Katalog ist eine HTTP-Messung und keine Datenbankzahl: faellt er weg, faellt genau sein Ziel.
  out=$(printf '%s\n%s\n' "$st_voll" "$m_voll" | CP_ZIELE_KATALOG=0 CP_ZIELE_CHAT=1 CP_ZIELE_KARTE=1 python3 ./ops/ziele.py); code=$?
  n=$(printf '%s' "$out" | grep -c '^  OFFEN')
  if (( code == 1 )) && (( n == 1 )); then
    echo "  ok      ein fehlender Katalog macht genau eine Zahl offen"
  else
    echo "  FAILED  fehlender Katalog gab Exit $code und $n offene Zahlen, erwartet 1 und 1"; fail=1
  fi

  out=$(printf 'kein json\n' | python3 ./ops/ziele.py); code=$?
  if (( code == 2 )); then
    echo "  ok      unlesbare Eingabe ist unentschieden, nicht erreicht"
  else
    echo "  FAILED  unlesbare Eingabe gab Exit $code, erwartet 2"; fail=1
  fi

  (( fail == 0 )) && echo "ZIELE SELFTEST OK" || echo "ZIELE SELFTEST FAILED"
  exit $fail
fi

status=$(curl -s -m 20 "$BASE/v1/status")
report=$(./ops/status.sh 2>/dev/null)
if [[ -z "$status" || -z "$report" ]]; then
  echo "could not read the service ($BASE)"
  exit 2
fi

# Die drei Wege des Menschen, gemessen an der laufenden Seite und nicht an einer Datei.
#
# Der Katalog zaehlt erst, wenn er auch einen Preis ueber elf Euro nennt: eine Seite mit Ueberschrift
# und ohne Preis ist kein Katalog, und die Untergrenze ist gemessen (ops/anzeigen-rechnung.py,
# Break-even 11,13 EUR unter Selbstlieferung).
katalog_html=$(curl -s -m 20 "$BASE/katalog")
katalog=0
if [[ -n "$katalog_html" ]] && grep -qE '(^|[^0-9])(1[2-9]|[2-9][0-9]|[0-9]{3,})[ ,.]?[0-9]{0,2} ?(EUR|€)' <<< "$katalog_html"; then
  katalog=1
fi
# Ein Gespraech, das eine Bestellung erzeugt: der Endpunkt muss existieren und ohne Anliegen
# widersprechen, statt 404 zu sagen.
chat_code=$(curl -s -m 20 -o /dev/null -w '%{http_code}' -X POST "$BASE/v1/orders/chat" \
  -H 'content-type: application/json' -d '{}')
chat=0; [[ "$chat_code" =~ ^(400|401|422)$ ]] && chat=1
# Bezahlen ohne Wallet.
karte_code=$(curl -s -m 20 -o /dev/null -w '%{http_code}' -X POST "$BASE/v1/orders/checkout" \
  -H 'content-type: application/json' -d '{}')
karte=0; [[ "$karte_code" =~ ^(400|401|422)$ ]] && karte=1

printf '%s\n%s\n' "$status" "$report" \
  | CP_ZIELE_KATALOG="$katalog" CP_ZIELE_CHAT="$chat" CP_ZIELE_KARTE="$karte" python3 ./ops/ziele.py
