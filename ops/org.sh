#!/usr/bin/env bash
# Was die Org bewegt hat, gemessen statt behauptet.
#
# ORG.md beschreibt sieben Rollen und eine Zahl. Eine Org, die sich selbst beschreibt, beschreibt
# sich mit der Zeit besser, als sie ist: genau das ist am 29.09.2026 mit "Was auf Matthias wartet"
# in ZIELE.md passiert, wo drei Eintraege gleichzeitig veraltet waren und niemand nachgemessen hat.
#
# Deshalb prueft dieses Skript das Protokoll der Org (org-log.tsv) gegen zwei Dinge, die nicht im
# Protokoll stehen: die Commits im Repo und die eine Zahl aus der Produktion. Eine Zeile, die einen
# Commit behauptet, den es nicht gibt, ist ein Befund. Eine Rolle, die vierzehn Tage nichts
# geschrieben hat, faellt auf und wird gestrichen oder umgeschrieben.
#
#   ops/org.sh              das Protokoll gegen die Wirklichkeit
#   ops/org.sh --selftest   die Gegenprobe, ohne Netz
#
# Exit 0, wenn das Protokoll haelt, 1 bei einem Befund, 2, wenn es nicht messen konnte.
set -uo pipefail
cd "$(dirname "$0")/.."

# Die Gegenprobe. Ein Pruefer, der nur einen Zustand gesehen hat, ist eine Konstante mit
# Zusatzschritten, also bekommt er hier vier gepflanzte Zustaende und muss viermal richtig liegen.
if [[ "${1:-}" == "--selftest" ]]; then
  fail=0
  report='{"db":{"market":{"fiverr_orders_30d":2,"foreign_buyers":1,"foreign_submissions_30d":3,"foreign_fee_30d_mc":500}}}'
  echt=$'aaa1111\nbbb2222'

  gut=$'2026-09-29\tNachfrage\torg-produkt\tIterationsrunden gebaut\taaa1111\t2'
  out=$(printf '%s\n---\n%s\n' "$report" "$gut" | CP_ORG_COMMITS="$echt" CP_ORG_HEUTE=2026-09-29 python3 ./ops/org.py); code=$?
  if (( code == 0 )) && grep -q "ORG OK" <<< "$out"; then
    echo "  ok      ein Protokoll mit echtem Commit und passender Zahl haelt"
  else
    echo "  FAILED  ein gueltiges Protokoll gab Exit $code"; fail=1
  fi

  erfunden=$'2026-09-29\tNachfrage\torg-produkt\tangeblich gebaut\tzzz9999\t2'
  out=$(printf '%s\n---\n%s\n' "$report" "$erfunden" | CP_ORG_COMMITS="$echt" CP_ORG_HEUTE=2026-09-29 python3 ./ops/org.py); code=$?
  if (( code == 1 )) && grep -q "FEHLT" <<< "$out"; then
    echo "  ok      ein erfundener Commit ist ein Befund"
  else
    echo "  FAILED  erfundener Commit gab Exit $code"; fail=1
  fi

  falsche_zahl=$'2026-09-29\tNachfrage\torg-produkt\tgebaut\taaa1111\t9'
  out=$(printf '%s\n---\n%s\n' "$report" "$falsche_zahl" | CP_ORG_COMMITS="$echt" CP_ORG_HEUTE=2026-09-29 python3 ./ops/org.py); code=$?
  if (( code == 1 )) && grep -q "ABWEICHUNG" <<< "$out"; then
    echo "  ok      eine protokollierte Zahl, die nicht der gemessenen entspricht, faellt auf"
  else
    echo "  FAILED  falsche Zahl gab Exit $code"; fail=1
  fi

  alt=$'2026-09-01\tNachfrage\torg-produkt\tlange her\taaa1111\t2'
  out=$(printf '%s\n---\n%s\n' "$report" "$alt" | CP_ORG_COMMITS="$echt" CP_ORG_HEUTE=2026-09-29 python3 ./ops/org.py)
  if grep -q "STILL   org-produkt" <<< "$out"; then
    echo "  ok      eine Rolle, die vierzehn Tage nichts bewegt hat, wird still genannt"
  else
    echo "  FAILED  eine stille Rolle wurde nicht genannt"; fail=1
  fi

  out=$(printf 'kein json\n---\n' | python3 ./ops/org.py 2>/dev/null); code=$?
  if (( code == 2 )); then
    echo "  ok      unlesbare Eingabe ist unentschieden, nicht in Ordnung"
  else
    echo "  FAILED  unlesbare Eingabe gab Exit $code, erwartet 2"; fail=1
  fi

  (( fail == 0 )) && echo "ORG SELFTEST OK" || echo "ORG SELFTEST FAILED"
  exit $fail
fi

report=$(./ops/status.sh 2>/dev/null)
if [[ -z "$report" ]]; then
  echo "could not read the service"
  exit 2
fi
[[ -f org-log.tsv ]] || : > org-log.tsv
# Alle Commits der letzten sechzig Tage, kurz und lang, damit ein Protokolleintrag in beiden
# Schreibweisen gefunden wird.
commits=$( (git log --since='60 days ago' --format='%h'; git log --since='60 days ago' --format='%H') 2>/dev/null )

printf '%s\n---\n%s\n' "$report" "$(cat org-log.tsv)" \
  | CP_ORG_COMMITS="$commits" CP_ORG_HEUTE="$(date -u +%F)" python3 ./ops/org.py
