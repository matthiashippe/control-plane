#!/usr/bin/env bash
# Rauchtest nach einem Deploy: prüft von außen, ob der Dienst tut, was er soll.
#
#   ops/smoke.sh [BASIS_URL] [--ohne-proxy] [--mit-ratelimit]
#
# Ohne Argument läuft er gegen https://cp.hippe.eu. Jede Prüfung gibt eine Zeile aus, am Ende
# steht eine Zusammenfassung; sobald eine Prüfung fehlschlägt, endet das Skript mit 1.
#
# Warum es das gibt: Am 19.09.2026 wurde diese Liste nach jedem Deploy von Hand zusammengetippt
# und dabei zweimal etwas übersehen. Die Prüfungen sind keine Theorie, jede steht für einen
# Fehler, der an dem Tag real im Betrieb war: Die Sicherheits-Header fehlten komplett, das
# Body-Limit fehlte (3 MB Müll an /v1/auth/nonce wurden mit 200 beantwortet), und der CSP-Hash
# hängt am Inline-Skript der Startseite, das heißt jede Änderung an der Seite kann die Live-Zahlen
# still abschalten.
#
# Das Skript schreibt nichts, startet nichts und braucht keinen API-Key.
#
# RATE LIMIT: `/v1/auth/*` und `/pay/` sind auf 60 Anfragen je Minute und Client begrenzt
# (src/ratelimit.ts). Ein Standardlauf stellt genau EINE Anfrage auf einen begrenzten Pfad (den
# Body-Limit-Test an /v1/auth/verify) und kann das Limit damit nicht auslösen. Der Lauf zählt
# mit und nennt die Zahl in der Zusammenfassung. Die Grenze selbst wird nur mit
# `--mit-ratelimit` geprüft, weil dieser Test den ausführenden Rechner für den Rest der Minute
# aussperrt; nach einem Deploy ist das nicht erwünscht.
set -uo pipefail

BASIS="https://cp.hippe.eu"
OHNE_PROXY=0
MIT_RATELIMIT=0

while (($#)); do
  case "$1" in
    --ohne-proxy) OHNE_PROXY=1 ;;
    --mit-ratelimit) MIT_RATELIMIT=1 ;;
    -h | --help)
      sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      echo "Unbekannter Schalter: $1" >&2
      exit 2
      ;;
    *) BASIS="${1%/}" ;;
  esac
  shift
done

command -v python3 >/dev/null || { echo "python3 fehlt, wird für die JSON-Prüfungen gebraucht" >&2; exit 2; }
command -v openssl >/dev/null || { echo "openssl fehlt, wird für den CSP-Hash gebraucht" >&2; exit 2; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

GEPRUEFT=0
FEHLER=0
UEBERSPRUNGEN=0
# Anfragen auf die Pfade, die der Rate Limiter zählt. Siehe Kopf der Datei.
BEGRENZTE_ANFRAGEN=0

if [[ -t 1 ]]; then
  F_OK=$'\033[32m'; F_ROT=$'\033[31m'; F_GRAU=$'\033[90m'; F_AUS=$'\033[0m'
else
  F_OK=""; F_ROT=""; F_GRAU=""; F_AUS=""
fi

ok() {
  GEPRUEFT=$((GEPRUEFT + 1))
  printf '%sOK%s      %s\n' "$F_OK" "$F_AUS" "$1"
}

fehler() {
  GEPRUEFT=$((GEPRUEFT + 1))
  FEHLER=$((FEHLER + 1))
  printf '%sFEHLER%s  %s\n' "$F_ROT" "$F_AUS" "$1"
}

uebersprungen() {
  UEBERSPRUNGEN=$((UEBERSPRUNGEN + 1))
  printf '%sÜBERSPRUNGEN%s  %s%s%s\n' "$F_GRAU" "$F_AUS" "$F_GRAU" "$1" "$F_AUS"
}

# Ein GET; legt Body unter $TMP/<name>.body und Header unter $TMP/<name>.head ab und gibt den
# Statuscode aus. 000 heißt: keine Antwort (DNS, TLS, Verbindung).
hole() {
  local name="$1" pfad="$2"
  shift 2
  local ausgabe
  # curl schreibt bei einem Verbindungsfehler selbst "000" und beendet mit einem Fehlercode;
  # deshalb wird der Code nicht angehängt, sondern nur ein leeres Ergebnis ersetzt.
  ausgabe=$(curl -sS --max-time 20 -o "$TMP/$name.body" -D "$TMP/$name.head" -w '%{http_code}' \
    "$@" "$BASIS$pfad" 2>"$TMP/$name.err")
  echo "${ausgabe:-000}"
}

# Kopfzeile aus einer gespeicherten Antwort, Name ohne Doppelpunkt, Vergleich ohne Groß/Klein.
kopf() {
  grep -i "^$2:" "$TMP/$1.head" | tail -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//'
}

# Wert aus einer JSON-Antwort. Pfad mit Punkten, Listen über den Index: "accepts.0.scheme".
# Exit 1 = Feld fehlt, Exit 2 = die Antwort ist gar kein JSON.
jsonwert() {
  python3 - "$TMP/$1.body" "$2" <<'PY'
import json, sys
try:
    daten = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception as e:
    print(f"kein gueltiges JSON: {e}", file=sys.stderr)
    sys.exit(2)
wert = daten
for teil in sys.argv[2].split("."):
    if not teil:
        continue
    try:
        wert = wert[int(teil)] if isinstance(wert, list) else wert[teil]
    except Exception:
        sys.exit(1)
if isinstance(wert, bool):
    print("true" if wert else "false")
elif isinstance(wert, (dict, list)):
    print(json.dumps(wert, separators=(",", ":"), ensure_ascii=False))
else:
    print(wert)
PY
}

echo "Rauchtest gegen $BASIS"
echo

# ─── 1. /health ────────────────────────────────────────────────────────────────
# Die Prüfung, an der alles andere hängt: Antwortet der Container überhaupt und ist er durch
# Caddy erreichbar. Der Watchdog auf der VM fragt genau diesen Pfad ab (ops/watchdog.sh).
code=$(hole health /health)
if [[ "$code" == "000" ]]; then
  fehler "/health: keine Antwort ($(tr -d '\n' <"$TMP/health.err"))"
  echo
  echo "Abbruch: Der Dienst ist von hier aus nicht erreichbar, die übrigen Prüfungen wären nur Timeouts."
  exit 1
elif [[ "$code" != "200" ]]; then
  fehler "/health: $code statt 200"
elif [[ "$(jsonwert health ok)" != "true" ]]; then
  fehler "/health: 200, aber ok ist nicht true ($(head -c 200 "$TMP/health.body"))"
else
  ok "/health: 200, ok:true, Version $(jsonwert health version)"
fi

# ─── 2. /v1/status ─────────────────────────────────────────────────────────────
# Der öffentliche Status ohne API-Key. Die Startseite zieht ihre Zahlen von hier, und die
# Automaton-Zahl ist die Messgröße des 30-Tage-Tests. Fehlt hier ein Feld, steht die Seite mit
# leeren Kästen da, ohne dass sonst etwas auffällt.
code=$(hole status /v1/status)
if [[ "$code" != "200" ]]; then
  fehler "/v1/status: $code statt 200"
else
  modelle=$(jsonwert status models)
  anzahl_modelle=$(python3 -c 'import json,sys; print(len(json.loads(sys.argv[1])))' "$modelle" 2>/dev/null || echo 0)
  markup=$(jsonwert status markup)
  automatons=$(jsonwert status automatons)
  tiers=$(jsonwert status topup_tiers_usd)
  mangel=""
  # Ohne Modelle kann die Runtime nicht denken, und der Preis-Cache aus src/index.ts wäre leer.
  [[ "$anzahl_modelle" -gt 0 ]] || mangel="$mangel models leer;"
  # Markup unter 1 hieße: Wir verkaufen unter Einkauf. Am 19.09. war der Katalog schon einmal weg.
  python3 -c 'import sys; sys.exit(0 if float(sys.argv[1]) >= 1 else 1)' "$markup" 2>/dev/null || mangel="$mangel markup=$markup;"
  # Die Zahl muss da und eine Zahl sein; sie zählt zahlende Betreiber, nicht Registrierungen.
  [[ "$automatons" =~ ^[0-9]+$ ]] || mangel="$mangel automatons=$automatons;"
  [[ "$tiers" == *"["* ]] || mangel="$mangel topup_tiers_usd fehlt;"
  if [[ -n "$mangel" ]]; then
    fehler "/v1/status: $mangel"
  else
    ok "/v1/status: 200, $anzahl_modelle Modell(e), Markup $markup, Automatons $automatons, Tiers $tiers"
  fi
fi

# ─── 3. Version aus /health und /v1/status stimmen überein ─────────────────────
# Billige Gegenprobe, dass wirklich ein einziger Stand läuft: Beide Zahlen kommen aus derselben
# Konstante in src/app.ts. Weichen sie ab, antwortet noch ein alter Container mit.
v_health=$(jsonwert health version 2>/dev/null)
v_status=$(jsonwert status version 2>/dev/null)
if [[ -n "$v_health" && "$v_health" == "$v_status" ]]; then
  ok "Version konsistent: $v_health in /health und /v1/status"
else
  fehler "Version uneinheitlich: /health=$v_health, /v1/status=$v_status"
fi

# ─── 4. Startseite ─────────────────────────────────────────────────────────────
# Zwei Inhalte sind nicht kosmetisch: Der Link auf without-control-plane.md ist das Versprechen,
# den kostenlosen Weg zu zeigen, bevor jemand zahlt, und der Impressum-Anker ist die Pflicht
# nach § 5 DDG ("leicht erkennbar und unmittelbar erreichbar").
code=$(hole seite /)
if [[ "$code" != "200" ]]; then
  fehler "/: $code statt 200"
else
  mangel=""
  [[ "$(kopf seite content-type)" == *"text/html"* ]] || mangel="$mangel content-type=$(kopf seite content-type);"
  grep -q "docs/without-control-plane.md" "$TMP/seite.body" || mangel="$mangel Link auf without-control-plane.md fehlt;"
  grep -q 'id="impressum"' "$TMP/seite.body" || mangel="$mangel Anker id=impressum fehlt;"
  grep -q 'href="#impressum"' "$TMP/seite.body" || mangel="$mangel Verweis href=#impressum fehlt;"
  if [[ -n "$mangel" ]]; then
    fehler "/: $mangel"
  else
    ok "/: 200 HTML, Link auf without-control-plane.md, Impressum-Anker und -Verweis vorhanden"
  fi
fi

# ─── 5. /impressum ─────────────────────────────────────────────────────────────
# Der Pfad, den Menschen und Prüfer zuerst raten. Er muss auf den Anker der Startseite führen,
# nicht ins Leere; eine 404 an dieser Stelle ist ein Abmahngrund und kein Schönheitsfehler.
code=$(hole impressum /impressum)
ziel=$(kopf impressum location)
if [[ "$code" == "302" && "$ziel" == "/#impressum" ]]; then
  ok "/impressum: 302 auf /#impressum"
else
  fehler "/impressum: $code auf '$ziel', erwartet 302 auf /#impressum"
fi

# ─── 6. /.well-known/x402 ──────────────────────────────────────────────────────
# Die maschinenlesbare Beschreibung, über die fremde Agenten den Dienst finden und bezahlen.
# Ohne gültiges `accepts` weiß ein Client nicht, wohin er zahlen soll, und der Topup schlägt fehl,
# bevor jemand merkt, dass die Seite selbst noch aussieht wie immer.
code=$(hole x402 /.well-known/x402)
if [[ "$code" != "200" ]]; then
  fehler "/.well-known/x402: $code statt 200"
else
  x402version=$(jsonwert x402 x402Version)
  guelt=$?
  mangel=""
  [[ $guelt -eq 2 ]] && mangel="$mangel kein gültiges JSON;"
  [[ "$x402version" == "1" ]] || mangel="$mangel x402Version=$x402version;"
  for feld in status models topup register inference; do
    jsonwert x402 "endpoints.$feld" >/dev/null 2>&1 || mangel="$mangel endpoints.$feld fehlt;"
  done
  # Das Zahlungsangebot: Netz, Asset und Empfänger. `accepts` ist leer, wenn CP_PAY_TO auf der VM
  # nicht gesetzt ist; dann antwortet auch /pay mit 503 und niemand kann aufladen.
  schema=$(jsonwert x402 accepts.0.scheme 2>/dev/null)
  payto=$(jsonwert x402 accepts.0.payTo 2>/dev/null)
  netz=$(jsonwert x402 accepts.0.network 2>/dev/null)
  asset=$(jsonwert x402 accepts.0.asset 2>/dev/null)
  [[ "$schema" == "exact" ]] || mangel="$mangel accepts[0].scheme=$schema;"
  [[ "$payto" =~ ^0x[0-9a-fA-F]{40}$ ]] || mangel="$mangel payTo=$payto;"
  [[ -n "$netz" ]] || mangel="$mangel network fehlt;"
  [[ "$asset" =~ ^0x[0-9a-fA-F]{40}$ ]] || mangel="$mangel asset=$asset;"
  if [[ -n "$mangel" ]]; then
    fehler "/.well-known/x402: $mangel"
  else
    ok "/.well-known/x402: 200 JSON, x402Version 1, Endpunkte vollständig, Zahlung exact auf $netz an $payto"
  fi
fi

# ─── 7. /llms.txt ──────────────────────────────────────────────────────────────
# Die Kurzbeschreibung für andere Modelle und Crawler. Die Setup-Zeile ist der einzige Teil, den
# jemand wirklich abtippt; fehlt sie, ist die Datei nur noch Werbung.
code=$(hole llms /llms.txt)
if [[ "$code" != "200" ]]; then
  fehler "/llms.txt: $code statt 200"
else
  mangel=""
  [[ "$(kopf llms content-type)" == *"text/plain"* ]] || mangel="$mangel content-type=$(kopf llms content-type);"
  grep -q "conwayApiUrl" "$TMP/llms.body" || mangel="$mangel conwayApiUrl fehlt;"
  grep -q "automaton --provision" "$TMP/llms.body" || mangel="$mangel 'automaton --provision' fehlt;"
  if [[ -n "$mangel" ]]; then
    fehler "/llms.txt: $mangel"
  else
    ok "/llms.txt: 200 Text mit der Setup-Zeile (conwayApiUrl, automaton --provision)"
  fi
fi

# ─── 8. Sicherheits-Header ─────────────────────────────────────────────────────
# Die Header setzt Caddy, nicht die Anwendung (deploy/Caddyfile). Am 19.09. fehlten sie komplett,
# und beim Ausrollen einer Caddyfile-Änderung ist genau das die Falle: Der Caddyfile ist ein
# Datei-Bind-Mount, rsync tauscht die Inode aus, der laufende Container sieht die neue Fassung
# nicht, und selbst `caddy reload` liest dann noch die alte. Ein grünes `docker compose up -d`
# beweist hier gar nichts, diese Prüfung schon.
if ((OHNE_PROXY)); then
  uebersprungen "Sicherheits-Header: --ohne-proxy, die Header kommen von Caddy und fehlen bei einem direkten App-Start"
else
  mangel=""
  hsts=$(kopf seite strict-transport-security)
  [[ "$hsts" == *"max-age="* ]] || mangel="$mangel HSTS ($hsts);"
  [[ "$(kopf seite x-content-type-options)" == "nosniff" ]] || mangel="$mangel nosniff;"
  [[ "$(kopf seite x-frame-options)" == "DENY" ]] || mangel="$mangel X-Frame-Options DENY;"
  [[ "$(kopf seite referrer-policy)" == "strict-origin-when-cross-origin" ]] || mangel="$mangel Referrer-Policy;"
  csp=$(kopf seite content-security-policy)
  [[ "$csp" == *"default-src 'none'"* ]] || mangel="$mangel CSP default-src 'none';"
  if [[ -n "$mangel" ]]; then
    fehler "Sicherheits-Header:$mangel"
  else
    ok "Sicherheits-Header: HSTS, nosniff, DENY, Referrer-Policy und CSP stehen"
  fi
fi

# ─── 9. CSP-Hash passt zum ausgelieferten Inline-Skript ────────────────────────
# Die CSP erlaubt das Inline-Skript der Startseite per sha256-Hash statt per 'unsafe-inline'.
# Passt der Hash nicht zum Skript, blockiert der Browser es still: Die Seite lädt, sieht richtig
# aus und zeigt dauerhaft keine Live-Zahlen. Kein Statuscode verrät das.
# `test/public.test.ts` prüft Repo gegen Repo; hier wird geprüft, was der Server wirklich
# ausliefert, und genau das ist nach einem Deploy die offene Frage.
if ((OHNE_PROXY)); then
  uebersprungen "CSP-Hash: --ohne-proxy, ohne Caddy gibt es keinen CSP-Header (Repo-Abgleich macht pnpm test)"
elif [[ ! -s "$TMP/seite.body" ]]; then
  fehler "CSP-Hash: keine Startseite geladen, nicht prüfbar"
else
  seiten_hash=$(python3 - "$TMP/seite.body" <<'PY'
import base64, hashlib, re, sys
html = open(sys.argv[1], encoding="utf-8").read()
# Dieselbe Regex wie in test/public.test.ts, damit beide denselben Skriptinhalt hashen.
treffer = re.search(r"<script>([\s\S]*?)</script>", html)
if not treffer:
    sys.exit(1)
print("sha256-" + base64.b64encode(hashlib.sha256(treffer.group(1).encode("utf-8")).digest()).decode())
PY
  )
  csp=$(kopf seite content-security-policy)
  if [[ -z "$seiten_hash" ]]; then
    # Kein Inline-Skript mehr: Dann darf auch kein Hash mehr in der CSP stehen.
    if [[ "$csp" == *"sha256-"* ]]; then
      fehler "CSP-Hash: Die Seite hat kein Inline-Skript mehr, die CSP führt aber noch einen sha256-Hash"
    else
      ok "CSP-Hash: kein Inline-Skript auf der Seite, keiner in der CSP"
    fi
  elif [[ "$csp" == *"$seiten_hash"* ]]; then
    ok "CSP-Hash: ${seiten_hash:0:22}… deckt das ausgelieferte Inline-Skript"
  else
    fehler "CSP-Hash passt nicht: Die Seite braucht '$seiten_hash', die CSP erlaubt '$csp'. Live-Zahlen sind blockiert."
  fi
fi

# ─── 10. Body-Limit ────────────────────────────────────────────────────────────
# Vor dem 19.09. nahm der Dienst beliebig große Bodies an; 3 MB Müll an /v1/auth/nonce ergaben
# eine 200. Das Limit setzt Caddy (`request_body max_size 1MB`), nicht die Anwendung, es fällt
# also bei jedem Caddyfile-Problem als Erstes aus. Gesendet wird ein syntaktisch gültiger
# SIWE-Request mit überlangem `message`: Greift das Limit, kommt 413; fehlt es, antwortet die
# Anwendung mit 400 "Malformed SIWE message", und genau diese 400 ist der Alarm.
# Kosten für das Rate Limit: genau eine Anfrage auf einen begrenzten Pfad.
if ((OHNE_PROXY)); then
  uebersprungen "Body-Limit: --ohne-proxy, das Limit steht in deploy/Caddyfile und existiert ohne Caddy nicht"
else
  python3 - "$TMP/gross.json" <<'PY'
import json, sys
# Knapp über 1 MB, damit das Limit sicher greift und der Test trotzdem schnell ist.
json.dump({"message": "a" * 1_100_000, "signature": "0x00", "chain_type": "evm"}, open(sys.argv[1], "w"))
PY
  BEGRENZTE_ANFRAGEN=$((BEGRENZTE_ANFRAGEN + 1))
  code=$(curl -sS --max-time 30 -o "$TMP/limit.body" -D "$TMP/limit.head" -w '%{http_code}' \
    -X POST -H 'content-type: application/json' -H 'Expect: 100-continue' \
    --data-binary @"$TMP/gross.json" "$BASIS/v1/auth/verify" 2>"$TMP/limit.err")
  code="${code:-000}"
  if [[ "$code" == "413" ]]; then
    ok "Body-Limit: 1,1 MB an /v1/auth/verify ergibt 413"
  elif [[ "$code" == "000" ]]; then
    # Caddy kann die Verbindung auch schließen, statt sauber zu antworten. Das ist ein Hinweis
    # darauf, dass eine Grenze greift, aber kein Beleg, und deshalb nicht grün.
    fehler "Body-Limit: keine Antwort auf 1,1 MB ($(tr -d '\n' <"$TMP/limit.err")). Ohne 413 ist nicht belegt, dass die Grenze greift."
  else
    fehler "Body-Limit: 1,1 MB an /v1/auth/verify ergibt $code statt 413. Das Limit im Caddyfile greift nicht."
  fi
fi

# ─── 11. /v1/credits/balance ohne Key ──────────────────────────────────────────
# Die Sperre vor allen /v1/*-Pfaden hinter dem API-Key. Fällt sie aus, liest jeder den Saldo
# fremder Wallets; im Sicherheitsreview vom 19.09. war genau das der teuerste Fund.
# Nicht rate-limited: /v1/credits/balance steht nicht in OFFENE_PFADE (src/app.ts).
code=$(hole balance /v1/credits/balance)
if [[ "$code" == "401" ]]; then
  ok "/v1/credits/balance ohne Key: 401"
else
  fehler "/v1/credits/balance ohne Key: $code statt 401 ($(head -c 200 "$TMP/balance.body"))"
fi

# ─── 12. Rate Limit (nur auf Anforderung) ──────────────────────────────────────
# Ausdrücklich abseits des Standardlaufs: Der Test sperrt den ausführenden Rechner für den Rest
# des Minutenfensters aus, und wer ihn versehentlich nach einem Deploy fährt, sperrt damit den
# Betreiber von seinem eigenen Dienst aus. Läuft zuletzt, damit die Sperre keine andere Prüfung
# trifft.
if ((MIT_RATELIMIT)); then
  echo
  echo "$F_GRAU--mit-ratelimit: 65 Anfragen an /v1/auth/nonce. Diese IP bekommt danach bis zum Ende des Minutenfensters 429.$F_AUS"
  gesperrt_bei=0
  for i in $(seq 1 65); do
    BEGRENZTE_ANFRAGEN=$((BEGRENZTE_ANFRAGEN + 1))
    rl=$(curl -sS --max-time 10 -o "$TMP/rl.body" -D "$TMP/rl.head" -w '%{http_code}' \
      -X POST "$BASIS/v1/auth/nonce" 2>/dev/null)
    rl="${rl:-000}"
    if [[ "$rl" == "429" ]]; then
      gesperrt_bei=$i
      break
    fi
  done
  retry=$(kopf rl retry-after)
  # Geprüft wird, DASS die Grenze greift und einen brauchbaren Retry-After liefert, nicht die
  # exakte Zahl: Der Limiter zählt in einem laufenden Minutenfenster, und wenn davor schon jemand
  # von derselben Adresse aus gefragt hat, kommt die 429 früher als bei 60. Eine feste Untergrenze
  # wäre hier also kein Befund, sondern ein Zufallsgenerator.
  hinweis=""
  ((gesperrt_bei > 0 && gesperrt_bei < 30)) && hinweis=" (das Minutenfenster war vorher schon angebrochen)"
  if ((gesperrt_bei == 0)); then
    fehler "Rate Limit: 65 Anfragen an /v1/auth/nonce ohne eine einzige 429. Die Grenze greift nicht."
  elif [[ ! "$retry" =~ ^[0-9]+$ ]] || ((retry < 1 || retry > 60)); then
    fehler "Rate Limit: 429 bei Anfrage $gesperrt_bei, aber Retry-After ist '$retry' statt einer Sekundenzahl bis 60."
  else
    ok "Rate Limit: Anfrage $gesperrt_bei ergibt 429 mit Retry-After ${retry}s$hinweis"
  fi
else
  uebersprungen "Rate Limit: nur mit --mit-ratelimit, weil der Test den Aufrufer für eine Minute aussperrt"
fi

# ─── Zusammenfassung ───────────────────────────────────────────────────────────
echo
echo "$GEPRUEFT Prüfungen, $FEHLER Fehler, $UEBERSPRUNGEN übersprungen."
if ((MIT_RATELIMIT)); then
  echo "Anfragen auf rate-limitierte Pfade in diesem Lauf: $BEGRENZTE_ANFRAGEN. Die Grenze liegt bei 60 je Minute und Client; --mit-ratelimit überschreitet sie absichtlich."
else
  echo "Anfragen auf rate-limitierte Pfade in diesem Lauf: $BEGRENZTE_ANFRAGEN von 60 je Minute und Client."
fi
if ((UEBERSPRUNGEN > 0)) && ((OHNE_PROXY)); then
  echo "Achtung: --ohne-proxy lässt die Prüfungen aus, die an Caddy hängen (Header, CSP-Hash, Body-Limit)."
  echo "Ein Lauf ohne Proxy ersetzt den Rauchtest gegen den echten Endpunkt nicht."
fi
if ((FEHLER > 0)); then
  echo "${F_ROT}Rauchtest fehlgeschlagen.$F_AUS"
  exit 1
fi
echo "${F_OK}Rauchtest bestanden.$F_AUS"
