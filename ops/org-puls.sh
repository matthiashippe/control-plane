#!/usr/bin/env bash
# Atmet die Firma? Holt den Zustand aus Paperclip und laesst ops/org-puls.py urteilen.
#
# ops/org.sh misst, ob das Protokoll der Org zur Wirklichkeit passt. Das hier misst, ob die Firma
# ueberhaupt arbeitet: stehen Agenten im Fehler, haengen Tickets, ist seit Stunden kein Lauf
# gestartet, scheitert gerade jeder Lauf. Heartbeats sind aus, also weckt nur der Loop die Agenten,
# und genau deshalb faellt Stillstand sonst niemandem auf: nichts wird rot, es passiert nur nichts.
#
#   ops/org-puls.sh              der Zustand
#   ops/org-puls.sh --selftest   die Gegenprobe, ohne Netz
#
# Exit 0 wenn alles atmet, 1 bei einem Befund, 2 wenn Paperclip nicht antwortet.
set -uo pipefail
cd "$(dirname "$0")/.."

API="${PAPERCLIP_API:-http://127.0.0.1:3140}"
FIRMA="${PAPERCLIP_COMPANY:-40312e4b-7d3e-48e6-84b5-d152947de567}"

if [[ "${1:-}" == "--selftest" ]]; then
  fail=0
  jetzt='2026-09-29T20:00:00Z'
  frisch='2026-09-29T19:50:00Z'
  alt='2026-09-29T15:00:00Z'

  gesund=$(cat <<JSON
{"erreichbar":true,"jetzt":"$jetzt",
 "agenten":[{"name":"CEO","status":"idle","model":"claude-opus-5-5"}],
 "tickets":[{"identifier":"HAN-1","status":"in_progress","updatedAt":"$frisch","assigneeAgentId":"a1"}],
 "laeufe":[{"agentId":"a1","status":"running","startedAt":"$frisch"},
           {"agentId":"a1","status":"succeeded","startedAt":"$frisch"}]}
JSON
)
  out=$(printf '%s' "$gesund" | python3 ./ops/org-puls.py); code=$?
  if (( code == 0 )) && grep -q "PULS OK" <<< "$out"; then
    echo "  ok      eine arbeitende Firma bekommt keinen Befund"
  else
    echo "  FAILED  gesunde Firma gab Exit $code"; fail=1
  fi

  # Jede Stoerung einzeln, damit ein Pruefer nicht nur auf einen Fall reagiert.
  for fall in fehler still haengt rot modelle; do
    case $fall in
      fehler)  j=$(printf '%s' "$gesund" | sed 's/"status":"idle"/"status":"error"/'); muster="FEHLER" ;;
      still)   j=$(printf '%s' "$gesund" | sed "s/\"startedAt\":\"$frisch\"/\"startedAt\":\"$alt\"/g"); muster="STILL" ;;
      haengt)  j=$(printf '%s' "$gesund" | sed "s/\"updatedAt\":\"$frisch\"/\"updatedAt\":\"$alt\"/" | sed 's/"status":"running"/"status":"succeeded"/'); muster="HAENGT" ;;
      rot)     j=$(printf '%s' "$gesund" | sed 's/"status":"running"/"status":"failed"/; s/"status":"succeeded"/"status":"failed"/g' | sed 's/{"agentId":"a1","status":"failed","startedAt":"'"$frisch"'"}\]/{"agentId":"a1","status":"failed","startedAt":"'"$frisch"'"},{"agentId":"a1","status":"failed","startedAt":"'"$frisch"'"}]/'); muster="ROT" ;;
      modelle) j=$(printf '%s' "$gesund" | sed 's/{"name":"CEO","status":"idle","model":"claude-opus-5-5"}/{"name":"CEO","status":"idle","model":"claude-opus-5-5"},{"name":"CTO","status":"idle","model":"claude-opus-5"}/'); muster="verschiedenen Modellen" ;;
    esac
    out=$(printf '%s' "$j" | python3 ./ops/org-puls.py); code=$?
    if (( code == 1 )) && grep -q "$muster" <<< "$out"; then
      echo "  ok      $fall wird erkannt"
    else
      echo "  FAILED  $fall gab Exit $code ohne '$muster'"; fail=1
    fi
  done

  out=$(printf '{"erreichbar":false,"jetzt":"%s"}' "$jetzt" | python3 ./ops/org-puls.py); code=$?
  if (( code == 2 )); then
    echo "  ok      ein toter Server ist unentschieden, nicht in Ordnung"
  else
    echo "  FAILED  toter Server gab Exit $code, erwartet 2"; fail=1
  fi

  (( fail == 0 )) && echo "PULS SELFTEST OK" || echo "PULS SELFTEST FAILED"
  exit $fail
fi

health=$(curl -s -m 10 "$API/api/health" 2>/dev/null)
if [[ -z "$health" ]]; then
  printf '{"erreichbar":false,"jetzt":"%s"}\n' "$(date -u +%FT%TZ)" | python3 ./ops/org-puls.py
  exit $?
fi

python3 - "$API" "$FIRMA" <<'PY' | python3 ./ops/org-puls.py
import json, subprocess, sys, urllib.request
from datetime import datetime, timezone

api, firma = sys.argv[1], sys.argv[2]

def hol(pfad):
    try:
        with urllib.request.urlopen(f"{api}{pfad}", timeout=15) as r:
            d = json.loads(r.read())
        return d if isinstance(d, list) else d.get("items", d.get("agents", []))
    except Exception:
        return []

agenten = [
    {"name": a.get("name"), "status": a.get("status"),
     "model": (a.get("adapterConfig") or {}).get("model")}
    for a in hol(f"/api/companies/{firma}/agents")
]
tickets = [
    {"identifier": t.get("identifier"), "status": t.get("status"),
     "updatedAt": t.get("updatedAt"), "assigneeAgentId": t.get("assigneeAgentId")}
    for t in hol(f"/api/companies/{firma}/issues")
]
laeufe = [
    {"agentId": l.get("agentId"), "status": l.get("status"),
     "startedAt": l.get("startedAt") or l.get("createdAt")}
    for l in hol(f"/api/companies/{firma}/heartbeat-runs?limit=50")
]
print(json.dumps({
    "erreichbar": True,
    "jetzt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "agenten": agenten, "tickets": tickets, "laeufe": laeufe,
}))
PY
