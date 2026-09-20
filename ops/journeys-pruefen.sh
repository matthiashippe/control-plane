#!/usr/bin/env bash
# Stimmt das Journeybuch noch mit dem Dienst ueberein?
#
# docs/journeys.md ist die Referenz, gegen die alles andere geprueft wird, und genau deshalb ist
# es die Datei, die am leisesten veraltet: Ein Endpunkt wird umbenannt, das Dokument sagt weiter
# das Alte, und niemand merkt es, weil Dokumente keine Tests haben.
#
# Dieses Skript nimmt jeden /v1- und /bounties.json-Pfad, den das Dokument nennt, und fragt ihn
# gegen die laufende Instanz. Erwartet wird alles ausser 404: 401 heisst geschuetzt und vorhanden,
# 200 heisst oeffentlich und vorhanden, 404 heisst, das Dokument beschreibt etwas, das es nicht
# gibt. Die Antwort selbst ist egal, die Existenz ist der Punkt.
#
#   ops/journeys-pruefen.sh                 gegen https://cp.hippe.eu
#   CP_URL=http://localhost:8402 ops/journeys-pruefen.sh
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="${CP_URL:-https://cp.hippe.eu}"
DOK="docs/journeys.md"
fehler=0

# Pfade aus dem Dokument ziehen: alles, was nach einem Backtick mit / anfaengt und wie ein Pfad
# aussieht. Query-Teile und Platzhalter fliegen raus, die pruefen wir nicht.
# sed -E, nicht sed: BSD-sed kennt \| in BRE nicht, und dann bleiben GET und POST als eigene
# "Pfade" stehen und werden mit Statuscode 000 als OK gemeldet. Ein Pruefwerkzeug, das Unsinn gruen
# meldet, ist schlimmer als keines; genau das ist beim ersten Lauf am 20.09.2026 passiert.
pfade=$(grep -oE '`(GET |POST |DELETE )?/[a-zA-Z0-9/._-]+' "$DOK" \
  | sed -E 's/^`//; s/^(GET|POST|DELETE) //' \
  | grep -E '^/' \
  | grep -vE '^/v1/chat/completions$' \
  | sort -u)

[[ -n "$pfade" ]] || { echo "FEHLER: kein einziger Pfad aus $DOK gelesen"; exit 2; }

echo "Journeybuch gegen $BASE"
echo

for p in $pfade; do
  code=$(curl -s -o /dev/null -m 15 -w "%{http_code}" "$BASE$p")
  if [[ "$code" == "404" ]]; then
    printf 'FEHLER  %-34s 404: das Dokument nennt einen Pfad, den es nicht gibt\n' "$p"
    fehler=$((fehler + 1))
  else
    printf 'OK      %-34s %s\n' "$p" "$code"
  fi
done

# Die Inferenz separat, weil GET darauf 405 gibt und das nichts ueber die Existenz sagt.
code=$(curl -s -o /dev/null -m 15 -w "%{http_code}" -X POST -H 'content-type: application/json' -d '{}' "$BASE/v1/chat/completions")
if [[ "$code" == "404" ]]; then
  printf 'FEHLER  %-34s 404\n' "/v1/chat/completions"; fehler=$((fehler + 1))
else
  printf 'OK      %-34s %s\n' "/v1/chat/completions" "$code"
fi

echo
if (( fehler == 0 )); then
  echo "JOURNEYS OK: jeder genannte Pfad existiert."
  exit 0
fi
echo "JOURNEYS FAIL: $fehler Pfad(e) aus $DOK gibt es nicht. Entweder das Dokument oder der Dienst luegt."
exit 1
