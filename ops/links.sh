#!/usr/bin/env bash
# Fuehren alle Links der Startseite noch irgendwohin?
#
# Nicht im Rauchtest, sondern hier: Der Rauchtest laeuft bei jedem Deploy und darf nicht von
# GitHub oder Basescan abhaengen. Diese Pruefung gehoert vor Momente, in denen Fremde die Seite
# lesen, also vor einen Artikel oder einen Beitrag, der die Adresse verbreitet.
#
#   ops/links.sh                gegen die Produktion
#   ops/links.sh http://localhost:8402
set -euo pipefail

BASIS="${1:-https://cp.hippe.eu}"
fehler=0

echo "Links auf $BASIS/"
seite=$(curl -fsS --max-time 20 "$BASIS/")

# Externe Ziele, jeweils einmal, Weiterleitungen folgend.
while read -r url; do
  [[ -z "$url" ]] && continue
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 25 -L "$url" || echo "000")
  if [[ "$code" == "200" ]]; then
    printf '  OK   %s\n' "$url"
  else
    printf '  FEHL %s  -> %s\n' "$url" "$code"
    fehler=$((fehler + 1))
  fi
done < <(printf '%s' "$seite" | grep -oE 'href="https?://[^"]+"' | sed 's/href="//; s/"$//' | sort -u)

# Anker innerhalb der Seite: ein href="#impressum" ohne id="impressum" faellt sonst niemandem auf.
while read -r anker; do
  [[ -z "$anker" ]] && continue
  if printf '%s' "$seite" | grep -q "id=\"$anker\""; then
    printf '  OK   #%s\n' "$anker"
  else
    printf '  FEHL #%s  -> kein Element mit dieser id\n' "$anker"
    fehler=$((fehler + 1))
  fi
done < <(printf '%s' "$seite" | grep -oE 'href="#[^"]+"' | sed 's/href="#//; s/"$//' | sort -u)

if [[ "$fehler" -gt 0 ]]; then
  echo "$fehler Link(s) kaputt."
  exit 1
fi
echo "Alle Links in Ordnung."
