#!/usr/bin/env bash
# Stimmt noch, was wir auf unserer Startseite ueber Conway behaupten?
#
# Die Startseite sagt, Conways Anmeldung sei seit Juli 2026 kaputt, und belegt es mit einem
# Provisionierungsversuch. Das ist eine Aussage ueber einen fremden Dienst, die jederzeit falsch
# werden kann: Repariert Conway den Pfad, steht auf unserer Seite eine Unwahrheit, und wir
# erfuehren es als Letzte. Also wird sie nachgeprueft, nicht geglaubt.
#
# Kostet nichts: eine Wegwerf-Wallet, kein Geld, genau der Weg, den die zwoelf Melder in den
# Issues gegangen sind.
#
#   ops/conway-zustand.sh
#
# Rueckgabe 0: Anmeldung weiterhin kaputt, unsere Aussage haelt.
# Rueckgabe 1: Anmeldung funktioniert wieder. Dann muss die Startseite geaendert werden.
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="${CONWAY_URL:-https://api.conway.tech}"

echo "── Selbstauskunft von $BASE"
wurzel=$(curl -s -m 15 "$BASE/" || echo '{}')
echo "   $wurzel"

echo "── Provisionierungsversuch mit frischer Wallet"
aus=$(CP_URL="$BASE" timeout 120 pnpm -s tsx harness/e2e/provisionierung.ts 2>&1)
echo "$aus" | sed 's/^/   /'

if printf '%s' "$aus" | grep -q "PROVISIONIERUNG FAIL"; then
  grund=$(printf '%s' "$aus" | grep -o 'PROVISIONIERUNG FAIL:.*' | head -1)
  echo
  echo "KAPUTT: $grund"
  echo "Unsere Aussage auf der Startseite haelt. Stand: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  exit 0
fi

echo
echo "ACHTUNG: Die Provisionierung bei Conway lief durch."
echo "Damit ist die Aussage auf src/public/index.html und im README falsch geworden."
echo "Beides aendern, bevor jemand es nachprueft. Stand: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
exit 1
