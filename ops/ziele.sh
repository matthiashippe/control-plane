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

# Ein Weg zur Kasse heisst: 303 auf https://checkout.stripe.com/. Eingabe ist die Ausgabe von
# curl -w '%{http_code} %{redirect_url}'. Eine Funktion, damit der Selbsttest dasselbe Urteil prueft
# wie der Lauf gegen die Produktion.
karte_urteil() {
  [[ "$1" =~ ^303\ https://checkout\.stripe\.com/ ]] && echo 1 || echo 0
}

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

  # Die Katalogpruefung selbst, in beide Richtungen, gegen dieselbe Datei, die die laufende Seite
  # prueft. Sie hat bis zum 29.09.2026 einen Preis von 11,50 EUR als "kein Katalog" gezaehlt und
  # bis zum 30.09.2026 einen einzigen Preis ueber 11,13 EUR als Katalog (HAN-14).
  satz="Alle Texte liefern wir selbst. Sie werden mit KI geschrieben, kein anderer Händler und kein Freiberufler ist beteiligt."
  katalog_fall() { # Seite, Soll, Name
    local ist
    ist=$(printf '%s' "$1" | python3 ./ops/katalog_pruefung.py)
    if [[ "$ist" == "$2" ]]; then
      echo "  ok      Katalog: $3 zaehlt als $2"
    else
      echo "  FAILED  Katalog: $3 gab $ist, erwartet $2"; fail=1
    fi
  }
  katalog_fall "<p>$satz</p><p>19 €</p><p>24 €</p><p>17 €</p>" 1 "drei Angebote ab 11,13 mit Liefersatz"
  katalog_fall "<p>$satz</p><p>11,13 €</p><p>24 EUR</p><p>1.299,00 EUR</p>" 1 "drei Angebote, eines genau 11,13"
  katalog_fall "<p>$satz</p><p>19 €</p><p>24 €</p>" 0 "zwei Angebote"
  katalog_fall "<p>$satz</p><p>19 €</p><p>24 €</p><p>11,12 €</p>" 0 "ein Preis 11,12 EUR"
  katalog_fall "<p>19 €</p><p>24 €</p><p>17 €</p>" 0 "drei Angebote ohne Liefersatz"
  katalog_fall "<head><title>19 € 24 € 17 € $satz</title></head><body>nichts</body>" 0 "Preise nur im head"
  katalog_fall "nichts" 0 "eine leere Seite"

  # Der Bezahlweg, gemessen an der Antwort von POST /katalog/kaufen (Goal 20): 303, und das Ziel
  # ist Stripes Kasse. Die Pruefung in beide Richtungen, weil ein Urteil, das nur "ja" gesehen hat,
  # auch eine Weiterleitung auf eine fremde Seite oder eine Fehlerseite als Kasse zaehlen koennte.
  karte_fall() { # curl-Ausgabe "code url", Soll, Name
    local ist
    ist=$(karte_urteil "$1")
    if [[ "$ist" == "$2" ]]; then
      echo "  ok      Karte: $3 zaehlt als $2"
    else
      echo "  FAILED  Karte: $3 gab $ist, erwartet $2"; fail=1
    fi
  }
  karte_fall "303 https://checkout.stripe.com/c/pay/cs_test_a1" 1 "303 auf Stripes Kasse"
  karte_fall "302 https://checkout.stripe.com/c/pay/cs_test_a1" 0 "302 statt 303"
  karte_fall "303 https://example.com/checkout.stripe.com/" 0 "303 auf eine fremde Seite"
  karte_fall "303 http://checkout.stripe.com/c/pay/cs_test_a1" 0 "303 ohne https"
  karte_fall "404 " 0 "Kaufen ausgeschaltet"
  karte_fall "400 " 0 "unbekanntes Angebot"
  karte_fall "" 0 "keine Antwort"

  # human_revenue_30d_cents aus ops/db-report.cjs, gegen eine Datenbank mit dem echten Schema
  # (src/db.ts), in beide Richtungen: eine bezahlte Zeile `stripe` zaehlt, dieselbe mit
  # `stripe_test` zaehlt nicht. Ohne die zweite Haelfte waere eine Vorfuehrung mit Stripes
  # Testkarte von einem zahlenden Menschen nicht zu unterscheiden (Sperrliste 0 und 2).
  umsatz_fall() { # Provider, Soll
    local dir ist
    dir=$(mktemp -d)
    if ! npx --no-install tsx -e '
      import { openDb } from "./src/db.ts";
      const d = openDb(process.argv[1]);
      const now = new Date().toISOString();
      d.prepare("INSERT INTO checkouts (reference, offer, cents, provider, status, created_at, settled_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run("cs_selftest", "rede-zum-fest", 1900, process.argv[2], "paid", now, now);
      d.close();' "$dir/cp.db" "$1" 2>/dev/null; then
      echo "  FAILED  Umsatz: keine Testdatenbank anlegbar (laedt node $(node -v) better-sqlite3?)"; fail=1
      rm -rf "$dir"; return
    fi
    ist=$(CP_DB_PATH="$dir/cp.db" node ops/db-report.cjs 2>/dev/null \
      | python3 -c 'import json,sys; print(json.load(sys.stdin)["market"].get("human_revenue_30d_cents"))' 2>/dev/null)
    rm -rf "$dir"
    if [[ "$ist" == "$2" ]]; then
      echo "  ok      Umsatz: eine bezahlte Zeile $1 ergibt $2 Cent"
    else
      echo "  FAILED  Umsatz: eine bezahlte Zeile $1 ergab '$ist', erwartet $2"; fail=1
    fi
  }
  umsatz_fall stripe 1900
  umsatz_fall stripe_test 0

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
# Der Katalog zaehlt erst mit drei Angeboten zu je mindestens 11,13 EUR und dem Liefersatz
# (ops/katalog_pruefung.py): eine Seite mit Ueberschrift und einem Preis ist kein Katalog, und die
# Untergrenze ist gemessen (ops/anzeigen-rechnung.py, Break-even 11,13 EUR unter Selbstlieferung).
# Die Untergrenze ist 11,13 EUR und nicht 12. Die alte Regex verlangte zwei Stellen ab 12 und
# haette einen Katalog mit 11,50 EUR als "kein Katalog" gezaehlt, obwohl er ueber dem Break-even
# liegt. Gefunden vom Stabschef der Org am 29.09.2026 beim Lesen des eigenen Messwerkzeugs.
# Deshalb wird der Betrag jetzt gelesen und verglichen statt gemustert.
katalog_html=$(curl -s -m 20 "$BASE/katalog")
katalog=0
if [[ -n "$katalog_html" ]]; then
  katalog=$(printf '%s' "$katalog_html" | python3 ./ops/katalog_pruefung.py)
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


# Der Bezahlweg ist seit Goal 20 das Formular unter jedem Angebot: POST /katalog/kaufen mit der
# Angebots-ID, Antwort 303 auf Stripes Kasse. Bis zum 29.09.2026 fragte diese Probe
# POST /v1/orders/checkout mit JSON, eine Route, die nie gebaut wurde; der Kartenweg waere am 02.10.
# trotz fertigem Bau als tot gemeldet worden (HAN-17, Befund 4).
#
# Die ID kommt aus der laufenden Seite, damit die Probe auch prueft, dass der Knopf dort steht.
# Der Weiterleitung wird nicht gefolgt. Jeder Lauf legt eine Stripe-Session und eine Zeile
# `pending` an; die zaehlt nirgends, weil jede Zahl in ops/db-report.cjs `status = 'paid'` verlangt.
#
# Seit Goal 21 (29.09.2026) ist der Knopf ein Link auf /katalog/bestellen, und POST /katalog/kaufen
# ohne die Felder des Angebots antwortet 400. Die Probe nimmt deshalb immer die Rede und schickt das
# Beispiel aus GOAL.md mit (Punkt 4), dazu eine Adresse unter @postyourprice.com, damit ihre Zeile
# in `order_briefs` als unsere zaehlt (ops/ours.txt) und nicht in `order_briefs_30d` landet.
# Bis zum Deploy steht noch das alte Formular live; beide Formen werden gelesen, und der alte Weg
# ignoriert die zusaetzlichen Felder.
angebot=$(printf '%s' "$katalog_html" | grep -oE '(name="angebot" value="|href="/katalog/bestellen\?angebot=)rede-zum-fest' \
  | head -1 | sed -E 's/.*(value="|angebot=)//')
# Das Gespraech, und warum hier zwei Zahlen stehen statt einer.
#
# Bis zum 29.09.2026 fragte diese Probe POST /v1/orders/chat mit JSON, eine Route, die nie gebaut
# wurde. Derselbe Fehler wie beim Kartenweg (HAN-17, Befund 4): die Probe zeigt auf einen Namen aus
# einem Entwurf statt auf das, was steht. Gebaut wurde ein Formular unter
# /katalog/bestellen?angebot=..., mit Feldern fuer die Angaben und einer E-Mail-Adresse.
#
# Ein Formular nimmt Angaben auf, und das ist die Haelfte. Die andere Haelfte ist das, was Matthias
# am 29.09. ausdruecklich verlangt hat: "einen chat bei dem man chatten kann und anforderungen
# spezifizieren kann etc nachfragen stellen kann". Ein Formular stellt keine Rueckfrage, es nimmt
# entgegen, was jemand zu sagen weiss, und merkt nicht, wenn etwas fehlt.
#
# Deshalb zwei Zahlen: das Formular als Nebenzahl ohne Urteil, das nachfragende Gespraech als Ziel.
# Die Latte wird damit nicht verschoben, sie wird sichtbar gemacht.
angaben=0
if [[ -n "$angebot" ]]; then
  angaben=$(curl -s -m 20 "$BASE/katalog/bestellen?angebot=$angebot" 2>/dev/null | python3 -c '
import re, sys
t = sys.stdin.read()
felder = set(re.findall(r"<(?:input|textarea|select)[^>]*name=\"([a-z_]+)\"", t))
hat_anliegen = len(felder - {"angebot", "email"}) >= 1
hat_kontakt = "email" in felder or "e_mail" in felder
print(1 if hat_anliegen and hat_kontakt else 0)
' 2>/dev/null)
fi
angaben=${angaben:-0}

# In beide Richtungen, seit HAN-77 (30.09.2026): die alte Probe zaehlte jede Antwort mit einem
# Fragezeichen, also haette eine feste Zeile "Worum geht es?" gereicht, auch fuer ein Anliegen, das
# schon vollstaendig ist. Jetzt: das unvollstaendige Anliegen bekommt eine Frage, das vollstaendige
# bekommt den Auftrag und keine Frage. Nur beides zusammen ist ein Gespraech, das nachfragt.
# Kostet zwei Modellaufrufe je Lauf, gedeckelt durch die Tageskappe des Dienstes.
chat_frage=$(curl -s -m 25 -X POST "$BASE/katalog/gespraech" -H 'content-type: application/json' \
  -d '{"angebot":"rede-zum-fest","nachricht":"Ich brauche eine Rede."}' 2>/dev/null \
  | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print(0); raise SystemExit
print(1 if isinstance(d.get("frage"), str) and "?" in d["frage"] and d.get("fertig") is False else 0)
' 2>/dev/null)
chat_auftrag=$(curl -s -m 25 -X POST "$BASE/katalog/gespraech" -H 'content-type: application/json' \
  -d '{"angebot":"rede-zum-fest","nachricht":"Probe von ops/ziele.sh, keine Bestellung. Eine Rede zum 70. Geburtstag meiner Mutter Ingrid, 5 Minuten lang. Sie war 35 Jahre Grundschullehrerin in Kassel, singt im Kirchenchor und fuhr uns jeden Sommer an die Ostsee."}' 2>/dev/null \
  | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print(0); raise SystemExit
print(1 if d.get("fertig") is True and d.get("frage") is None and isinstance(d.get("auftrag"), dict) else 0)
' 2>/dev/null)
chat=0
if [[ "$chat_frage" == 1 && "$chat_auftrag" == 1 ]]; then chat=1; fi
chat=${chat:-0}

karte=0
if [[ -n "$angebot" ]]; then
  karte=$(karte_urteil "$(curl -s -m 25 -o /dev/null -w '%{http_code} %{redirect_url}' \
    -d "angebot=$angebot" --data-urlencode "anlass=70. Geburtstag" \
    --data-urlencode "person=meine Mutter Ingrid" --data-urlencode "laenge=5 Minuten" \
    --data-urlencode "inhalt=Probe von ops/ziele.sh, keine Bestellung. Sie war 35 Jahre Grundschullehrerin in Kassel." \
    -d "email=ziele-probe@postyourprice.com" "$BASE/katalog/kaufen")")
fi

printf '%s\n%s\n' "$status" "$report" \
  | CP_ZIELE_KATALOG="$katalog" CP_ZIELE_CHAT="$chat" CP_ZIELE_KARTE="$karte" CP_ZIELE_ANGABEN="$angaben" python3 ./ops/ziele.py
