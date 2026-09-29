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

  # Die Katalogpruefung selbst, in beide Richtungen. Sie hat bis zum 29.09.2026 einen Preis von
  # 11,50 EUR als "kein Katalog" gezaehlt, obwohl er ueber dem Break-even von 11,13 liegt.
  preis_test() {
    printf '%s' "$1" | python3 -c '
import re, sys
text = sys.stdin.read()
treffer = re.findall(r"(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?\s*(?:EUR|€)", text)
for ganz, rest in treffer:
    betrag = float(ganz.replace(".", "")) + (float(rest or 0) / (100 if len(rest or "") == 2 else 10))
    if betrag > 11.13:
        print(1); break
else:
    print(0)
'
  }
  for fall in "11,50 EUR:1" "149 EUR:1" "1.299,00 EUR:1" "9,99 EUR:0" "11,00 EUR:0" "nichts:0"; do
    text="${fall%%:*}"; soll="${fall##*:}"
    ist=$(preis_test "Eine Seite im Internet, $text")
    if [[ "$ist" == "$soll" ]]; then
      echo "  ok      Katalogpreis '$text' zaehlt als $soll"
    else
      echo "  FAILED  Katalogpreis '$text' gab $ist, erwartet $soll"; fail=1
    fi
  done

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
# Die Untergrenze ist 11,13 EUR und nicht 12. Die alte Regex verlangte zwei Stellen ab 12 und
# haette einen Katalog mit 11,50 EUR als "kein Katalog" gezaehlt, obwohl er ueber dem Break-even
# liegt. Gefunden vom Stabschef der Org am 29.09.2026 beim Lesen des eigenen Messwerkzeugs.
# Deshalb wird der Betrag jetzt gelesen und verglichen statt gemustert.
katalog_html=$(curl -s -m 20 "$BASE/katalog")
katalog=0
if [[ -n "$katalog_html" ]]; then
  katalog=$(printf '%s' "$katalog_html" | python3 -c '
import re, sys
text = sys.stdin.read()
# Preise wie "149 EUR", "11,50 €", "1.299,00 EUR". Punkt ist Tausender, Komma ist Dezimal.
treffer = re.findall(r"(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?\s*(?:EUR|€)", text)
for ganz, rest in treffer:
    betrag = float(ganz.replace(".", "")) + (float(rest or 0) / (100 if len(rest or "") == 2 else 10))
    if betrag > 11.13:
        print(1); break
else:
    print(0)
')
fi
# Ein Gespraech und ein Bezahlweg, und beide muessen mehr koennen als antworten.
#
# Bis zum 29.09.2026 galt das Ziel als erfuellt, sobald der Endpunkt auf ein leeres Objekt mit 400,
# 401 oder 422 antwortete. Ein leerer Stub haette den 02.10. gruen gemacht, ohne dass ein Mensch
# irgendetwas kaufen kann. Der Stabschef der Org hat das beim Lesen gefunden: der Probe misst
# "Route existiert", nicht "Bezahlweg ohne Wallet".
#
# Jetzt wird die Sache selbst geprueft. Das Gespraech muss auf ein echtes Anliegen antworten und
# etwas zurueckgeben, das eine Bestellung werden kann. Der Bezahlweg muss auf eine echte Bestellung
# eine Zahladresse liefern, und er darf dafuer keine Wallet-Adresse verlangen: genau das ist die
# Mauer, die ein Mensch heute nicht ueberwindet.
chat=$(curl -s -m 25 -X POST "$BASE/v1/orders/chat" -H 'content-type: application/json' \
  -d '{"message":"Ich gebe Klavierunterricht in Hamburg und moechte eine einfache Seite im Internet."}' \
  | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print(0); raise SystemExit
# Eine Antwort, die weiterfuehrt: sie sagt etwas und fragt nach oder nennt einen Preis.
text = json.dumps(d).lower()
weiter = any(k in d for k in ("reply", "question", "order", "draft", "brief", "price_cents"))
print(1 if weiter and len(text) > 80 else 0)
' 2>/dev/null)
chat=${chat:-0}

karte=$(curl -s -m 25 -X POST "$BASE/v1/orders/checkout" -H 'content-type: application/json' \
  -d '{"item":"website-eine-seite","email":"pruefung@postyourprice.com"}' \
  | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print(0); raise SystemExit
text = json.dumps(d).lower()
# Ein Weg zur Kasse, und ausdruecklich keiner, der eine Wallet verlangt.
hat_weg = any(k in d for k in ("redirect", "checkout_url", "url", "client_secret", "reference"))
braucht_wallet = any(w in text for w in ("wallet", "usdc", "address_required", "x402"))
print(1 if hat_weg and not braucht_wallet else 0)
' 2>/dev/null)
karte=${karte:-0}

printf '%s\n%s\n' "$status" "$report" \
  | CP_ZIELE_KATALOG="$katalog" CP_ZIELE_CHAT="$chat" CP_ZIELE_KARTE="$karte" python3 ./ops/ziele.py
