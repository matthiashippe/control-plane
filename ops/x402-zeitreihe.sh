#!/usr/bin/env bash
# Taeglicher Scan der beiden oeffentlichen x402-Verzeichnisse.
#
# Eine Momentaufnahme sagt, wie der Markt heute aussieht. Der Wert entsteht erst aus der Reihe:
# Wer im Oktober wissen will, ob die Nachfrage waechst, braucht den September, und den kann
# niemand nachtraeglich erheben. Deshalb laeuft das taeglich, ab heute.
#
# Schreibt nach /opt/control-plane/x402, bewusst NEBEN das Repo-Verzeichnis: `rollout.sh` spiegelt
# das Repo mit --delete, und alles darin waere nach dem naechsten Deploy weg.
#
#   kennzahlen.ndjson   eine Zeile je Lauf, klein, das ist die Zeitreihe
#   roh/JJJJ-MM-TT.csv.gz  der vollstaendige Scan, 60 Tage aufbewahrt
set -euo pipefail

REPO="${CP_REPO:-/opt/control-plane/repo}"
ZIEL="${CP_X402_DIR:-/opt/control-plane/x402}"
HEUTE="$(date -u +%F)"
mkdir -p "$ZIEL/roh"

tmp="$(mktemp)"
# Die Fehlerausgabe des Scans wird erst am Ende benannt. Vorher hiess sie immer `letzter-lauf.err`,
# auch nach einem sauberen Lauf, und stand dann mit den blossen Fortschrittszeilen ("# cdp: 14960
# Eintraege") im Verzeichnis. Wer nachsieht, liest eine Fehlermeldung, die keine ist; am 20.09.2026
# hat genau das einen Loop-Zyklus gekostet. Jetzt heisst sie nur im Fehlerfall `.err`.
stderr_tmp="$(mktemp)"
trap 'rm -f "$tmp" "$stderr_tmp"' EXIT

if ! python3 "$REPO/docs/research/data/x402-verzeichnis-scan.py" > "$tmp" 2>"$stderr_tmp"; then
  cp "$stderr_tmp" "$ZIEL/letzter-lauf.err"
  echo "[x402] Scan fehlgeschlagen, siehe $ZIEL/letzter-lauf.err" >&2
  [[ -n "${CP_ALERT_WEBHOOK:-}" ]] && curl -fsS -m 10 -d "x402-Scan fehlgeschlagen auf $(hostname)" "$CP_ALERT_WEBHOOK" >/dev/null || true
  exit 1
fi

zeilen=$(wc -l < "$tmp")
if [[ "$zeilen" -lt 1000 ]]; then
  # Ein halber Scan verfaelscht die Reihe dauerhaft, und eine Luecke ist ehrlicher als ein
  # falscher Punkt. Beide Verzeichnisse lagen am 20.09.2026 zusammen bei 21.545 Zeilen.
  echo "[x402] nur $zeilen Zeilen, das ist kein vollstaendiger Scan. Nichts geschrieben." >&2
  [[ -n "${CP_ALERT_WEBHOOK:-}" ]] && curl -fsS -m 10 -d "x402-Scan unvollstaendig: $zeilen Zeilen" "$CP_ALERT_WEBHOOK" >/dev/null || true
  exit 1
fi

zeile="$(python3 "$REPO/docs/research/data/x402-kennzahlen.py" "$tmp" --json)"
# Eine kaputte Zeile in der Reihe faellt erst auf, wenn jemand sie auswertet, also hier pruefen.
if ! printf '%s' "$zeile" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["dienste_gesamt"] > 1000, d'; then
  echo "[x402] Kennzahlen unplausibel, nichts an die Reihe angehaengt" >&2
  exit 1
fi
printf '%s\n' "$zeile" >> "$ZIEL/kennzahlen.ndjson"
gzip -c "$tmp" > "$ZIEL/roh/$HEUTE.csv.gz"
find "$ZIEL/roh" -name '*.csv.gz' -mtime +60 -delete

# Ab hier ist der Lauf gelungen: Die Ausgabe heisst `.log`, und ein `.err` aus einem frueheren
# Fehlversuch verschwindet. Damit bedeutet eine vorhandene `.err` im Verzeichnis immer, dass der
# letzte Lauf schiefging, und nur dann.
cp "$stderr_tmp" "$ZIEL/letzter-lauf.log"
rm -f "$ZIEL/letzter-lauf.err"

echo "[x402] $HEUTE: $zeilen Zeilen, $(du -h "$ZIEL/roh/$HEUTE.csv.gz" | cut -f1) gepackt, Reihe jetzt $(wc -l < "$ZIEL/kennzahlen.ndjson") Punkte"
