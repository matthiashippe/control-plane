# Betrieb Goal 04: Gemessen, dass der Neustart keine 502 mehr bringt

## Status
ACTIVE

## Active Objective
Belegt ist, ob ein zahlender Kunde am Neustart von `cp` seit betrieb 02 noch 502 bekommt: Die Fenster der zwei Rollouts nach dem Merge
von betrieb 02, die `deploy-cp-1` neu starteten, sind ganz gemessen (`ops/deploy-window.sh --at <Start des Containers>`), und ihre
Zeilen stehen unter `## Nachher` in `docs/betrieb/neustart.md`, im Format von `## Vorher`, mit Summe und einer Zeile `Ergebnis:`.
Heute verweist `## Nachher` nur auf den Schritt „Deploy-Fenster“ von `deploy.yml`, und der misst rund 20 Sekunden nach dem Start und
meldet deshalb nur `PARTIAL`; die Widerlegung von betrieb 02 hat damit keinen Prüfer (Vorschlag betrieb-kritik-2026-11-12-3).
Widerlegt, wenn eines der beiden Fenster mehr als 0 Anfragen von außen mit 502 zeigt; dann ist betrieb 02 widerlegt.
MVP: Funktion, weil erst die Messung zeigt, dass zahlende Kunden am Neustart keinen Fehler mehr sehen, und weil betrieb 02 sonst als
erledigt gilt, ohne dass jemand nachgesehen hat.

## Voraussetzungen
- betrieb Goal 03 DONE

## Kontext für den Maker
- Die zwei Fenster, aus den Logs von `deploy.yml` auf `dev` (nur lesend, `gh run view <id> -R matthiashippe/control-plane --log`, Zeile
  `deploy   <Zeit> UTC, taken from the container start`; nur diese zwei Läufe seit dem 13.11.2026 00:00 UTC hatten einen grünen Job
  `deploy`, alle anderen übersprangen ihn):
  Lauf 43339659780, Merge von PR #54 (betrieb 02), Container-Start `2026-11-13 00:48:29 UTC`, im Lauf `PARTIAL` mit
  `BAD GATEWAY 0 of 25 request(s) from outside answered 502`;
  Lauf 43404327407, Merge von PR #62 (sandbox 05), der erste Rollout danach, der `cp` neu startete, Container-Start
  `2026-11-13 09:55:22 UTC`, im Lauf `PARTIAL` mit `BAD GATEWAY 0 of 91 request(s) from outside answered 502`.
  Rollt vor dem Start dieses Goals ein weiterer Rollout `cp` neu aus, ändert das nichts: gemessen werden genau diese zwei Fenster.
- Vorab gemessen am 13.11.2026 um 12:25 UTC mit `set -a; . ~/.config/control-plane/loop.env; set +a` und
  `bash ops/deploy-window.sh --at 2026-11-13T00:48:29` (`BAD GATEWAY 0 of 53 request(s) from outside answered 502`, `CLEAN`, Exit 0)
  sowie `bash ops/deploy-window.sh --at 2026-11-13T09:55:22` (`BAD GATEWAY 0 of 104 request(s) from outside answered 502`, Exit 1 wegen
  `AFFECTED`). Das Glied ist also nicht widerlegt. Die Zahlen der Doku kommen aus dem Lauf des Makers, nicht aus dieser Liste; die Zahl
  der Anfragen von außen kann sich verschieben, weil `own_ips` seit betrieb 03 live gesehene eigene Adressen außerhalb des Checkouts
  merkt, die Zahl der 502 nicht.
- Das `AFFECTED` im zweiten Fenster sind 400, 405 und 429 auf `/pay/…`, `/v1/auth/verify` und `/v1/auth/keyless`, kein 502 und kein
  Neustart. Die Doku nennt das in einem Satz wie die 503 unter `## Vorher`; eine Ursache sucht dieses Goal nicht.
- Doku `docs/betrieb/neustart.md` (Deutsch), nur der Abschnitt `## Nachher`; `## Vorher` und alles davor bleiben byte-gleich. Der
  bisherige Satz unter `## Nachher` bleibt sinngemäß (eine reine Änderung am Caddyfile startet `cp` nicht neu) und sagt dazu, dass der
  Schritt „Deploy-Fenster“ von `deploy.yml` kurz nach dem Start misst und deshalb nur `PARTIAL` meldet, also das ganze Fenster danach mit
  `--at` gemessen wird. Darunter je Fenster genau eine Zeile ab Spalte 0
  `- <JJJJ-MM-TT HH:MM:SS> UTC: <n> mal 502 an fremde Adressen, <m> Anfragen von außen`, `<n>` und `<m>` aus der Zeile
  `BAD GATEWAY <n> of <m> …` von `bash ops/deploy-window.sh --at <Zeit>`, dann `Summe nachher: <n> mal 502 in <k> Fenstern`, die zwei
  Befehle, die Uhrzeit der Messung in UTC, die zwei Lauf-IDs als Quelle der Zeiten und zuletzt eine Zeile ab Spalte 0
  `Ergebnis: betrieb 02 hält, …` bei Summe 0, sonst `Ergebnis: betrieb 02 widerlegt, …`. Keine Adresse, kein Name eines Kunden.
- Zeigt ein Fenster mehr als 0, schreibt der Maker trotzdem die Zahlen und `Ergebnis: betrieb 02 widerlegt`, ändert sonst nichts (kein
  Eingriff in `deploy/Caddyfile`) und nennt es im Progress Log; die Folge entscheidet der Tech Lead.
- Seit betrieb 03 schreibt `own_ips` ohne `CP_OWN_IPS_WRITE=1` nicht mehr nach `ops/own-ips.txt`; die Messungen laufen ohne
  `CP_OWN_IPS_FILE` und ohne diese Variable. Liefert das Zugriffslog die Fenster nicht mehr (`COULD NOT TELL` oder `MEASURED NOTHING`
  für ein Fenster mit belegten Anfragen), ist das ein Blocker der Umgebung, kein Grund, eine Zahl zu schätzen.
- Traction: betrieb 02 sollte jedem zahlenden Automaton die rund 16 Sekunden ohne Antwort an jedem Rollout ersparen, und `dev` rollt
  mehrmals am Tag aus. Mit diesem Goal steht der Beleg in der Doku, und betrieb 05 und die Goals für zahlende Kunden bauen auf einem
  gemessenen Stand auf statt auf einer Annahme.
- Goal-Datei und Doku Deutsch, kein Gedankenstrich. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` im Vordergrund mit eigenem
  Timeout; nach `check` mit `git status --short` prüfen, dass der Lauf nichts im Checkout hinterlassen hat. Kein `pkill -f`.

## Done Condition
- [x] Unter `## Nachher` in `docs/betrieb/neustart.md` steht je Fenster eine Zeile mit den Zahlen aus `ops/deploy-window.sh --at`, die
      Summe, die Befehle und die Lauf-IDs, und der Abschnitt sagt, warum `deploy.yml` nur `PARTIAL` meldet.
      Prüfung: `awk '/^## Nachher/{f=1;next} /^## /{f=0} f' docs/betrieb/neustart.md | grep -cE "^- 2026-11-13 (00:48:29|09:55:22) UTC: [0-9]+ mal 502 an fremde Adressen, [0-9]+ Anfragen von außen$"` muss 2 ausgeben.
      Prüfung: `awk '/^## Nachher/{f=1;next} /^## /{f=0} f && /^- 20.* mal 502 an fremde Adressen/{s+=$5; k++} /^Summe nachher: /{t=$3; w=$7} END{exit !(k==2 && s==t && w==k)}' docs/betrieb/neustart.md` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "ops/deploy-window.sh --at 2026-11-13T(00:48:29|09:55:22)" docs/betrieb/neustart.md` muss 2 ausgeben.
      Prüfung: `grep -cE "43339659780|43404327407" docs/betrieb/neustart.md` muss mindestens 2 ausgeben.
      Prüfung: `awk '/^## Nachher/{f=1;next} /^## /{f=0} f' docs/betrieb/neustart.md | grep -c "PARTIAL"` muss mindestens 1 ausgeben.
      Prüfung (Netz): `set -a; . ~/.config/control-plane/loop.env; set +a; for t in 00:48:29 09:55:22; do n=$(bash ops/deploy-window.sh --at 2026-11-13T$t 2>/dev/null | sed -n 's/^BAD GATEWAY \([0-9][0-9]*\) of .*/\1/p'); grep -c "^- 2026-11-13 $t UTC: $n mal 502 an fremde Adressen, " docs/betrieb/neustart.md; done | awk '{s+=$1} END{print s}'` muss 2 ausgeben.
- [x] Die Zeile `Ergebnis:` passt zur Summe: `hält` bei 0 mal 502, sonst `widerlegt`.
      Prüfung: `grep -cE "^Ergebnis: betrieb 02 (hält|widerlegt), " docs/betrieb/neustart.md` muss 1 ausgeben.
      Prüfung: `awk '/^Summe nachher: /{t=$3} /^Ergebnis: betrieb 02 /{r=$4} END{exit !((t==0 && r=="hält,") || (t>0 && r=="widerlegt,"))}' docs/betrieb/neustart.md` muss Exit-Code 0 haben.
- [x] `## Vorher` bleibt unverändert, die Doku nennt keine Adresse, und das Goal ändert nur die Doku und Dateien unter `goals/betrieb/`.
      Prüfung: `diff <(git show origin/dev:docs/betrieb/neustart.md | awk '/^## Nachher/{exit} {print}') <(awk '/^## Nachher/{exit} {print}' docs/betrieb/neustart.md) | wc -l` muss 0 ausgeben.
      Prüfung: `grep -E "(^|[^0-9.])([0-9]{1,3}\.){3}[0-9]{1,3}([^0-9.]|$)" docs/betrieb/neustart.md | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE "^(docs/betrieb/neustart\.md|goals/betrieb/)" | wc -l` muss 0 ausgeben.
- [x] `check` ist grün und lässt `ops/own-ips.txt` unverändert.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `node scripts/check.mjs >/dev/null 2>&1; git status --porcelain -- ops/own-ips.txt | wc -l` muss 0 ausgeben.
- [x] Kritik: `## Nachher` sagt je Fenster, ob überhaupt eine Anfrage von außen in die Sekunden des Neustarts fiel. Alle 7 mal 502 unter
      `## Vorher` kamen 0,2 bis 5,1 s nach dem Start des Containers; in den zwei Fenstern danach hat das Zugriffslog in den 10 s nach dem
      Start keine Anfrage von außen (gemessen vom Tech Lead am 13.11.2026 gegen 17:45 UTC, Befehl unten), also hat keine fremde Anfrage
      den Retry von betrieb 02 gebraucht, und das „0 mal 502“ belegt ihn noch nicht. Je Fenster genau eine Zeile ab Spalte 0
      `- <JJJJ-MM-TT HH:MM:SS> UTC: <h> Anfragen von außen in den 10 s nach dem Start`, `<h>` aus dem Befehl der Prüfung (Netz), und die
      Uhrzeit dieser Messung in UTC. Ist die Summe der `<h>` 0, sagt die eine Zeile `Ergebnis: betrieb 02 hält, …` nach „hält, “, dass
      keine Anfrage von außen in die Sekunden des Neustarts fiel und der Beleg noch aussteht; sonst nennt sie, wie viele es waren.
      MVP: Funktion, weil betrieb 05 und die Goals für zahlende Kunden sonst auf einem Beleg aufbauen, den keine Anfrage am Neustart
      gedeckt hat.
      Prüfung: `awk '/^## Nachher/{f=1;next} /^## /{f=0} f' docs/betrieb/neustart.md | grep -cE "^- 2026-11-13 (00:48:29|09:55:22) UTC: [0-9]+ Anfragen von außen in den 10 s nach dem Start$"` muss 2 ausgeben.
      Prüfung: `awk '/^- 20.* Anfragen von außen in den 10 s nach dem Start$/{h+=$5} /^Ergebnis: /{e=$0} END{exit !(h>0 || e ~ /keine Anfrage von außen in die Sekunden des Neustarts fiel/)}' docs/betrieb/neustart.md` muss Exit-Code 0 haben.
      Prüfung (Netz): `set -a; . ~/.config/control-plane/loop.env; set +a; . ops/own-ips.sh; o=$(own_ips 2>/dev/null); bash ops/access-log.sh | python3 -c 'import sys,json,datetime as D;own=set(sys.argv[1].split());w={t:D.datetime.fromisoformat("2026-11-13T"+t+"+00:00").timestamp() for t in sys.argv[2:]};rs=[json.loads(l) for l in sys.stdin if l.startswith("{")];[print(t,sum(1 for r in rs if s<=r["ts"]<=s+10 and r.get("request",{}).get("remote_ip") not in own)) for t,s in w.items()]' "$o" 00:48:29 09:55:22 | while read t h; do grep -c "^- 2026-11-13 $t UTC: $h Anfragen von außen in den 10 s nach dem Start$" docs/betrieb/neustart.md; done | awk '{s+=$1} END{print s}'` muss 2 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede Zahl unter `## Nachher` mit dem Befehl, aus dem sie stammt, und der Uhrzeit der Messung in UTC.
- [ ] Keine Adresse und kein Name eines Kunden in der Doku, im Progress Log oder in einem Kommentar.
- [ ] Der Goal-PR ändert nur `docs/betrieb/neustart.md` und Dateien unter `goals/betrieb/`.
- [ ] Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/**`, `.github/**`, `scripts/**`, `src/**`,
  `harness/**`, `deploy/**`, `test/**`, `.env*`, `*.key`, `*.pem`
- in `docs/betrieb/neustart.md` alles vor der Überschrift `## Nachher`
- Crontab, `/opt/control-plane/.env` und jede Datei auf dem Server; Produktion nur lesend, kein Rollout und kein Neustart von Hand
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 2

## Progress Log
- 2026-11-13 Zyklus 1: Punkte 1, 2, 3, 4 gebaut, beide Fenster am 13.11.2026 um 17:06 UTC mit `ops/deploy-window.sh --at` gemessen (00:48:29: 0 mal 502 von 53, `CLEAN`; 09:55:22: 0 mal 502 von 104, `AFFECTED` nur mit 4xx) und unter `## Nachher` eingetragen, Ergebnis betrieb 02 hält; Gegenprobe des Werkzeugs im Vorher-Fenster 2026-11-12T16:41:02 zählt weiter 3 mal 502, `--selftest` OK. Prüfbefehle: Punkt 1 gibt 2, Exit 0, 2, 2, 2 und (Netz) 2; Punkt 2 gibt 1 und Exit 0; Punkt 3 gibt 0, 0, 0; Punkt 4 `check` grün in 68 s (1592 Tests), `ops/own-ips.txt` 0 Zeilen geändert.
- 2026-11-13 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4; `dev` brachte nichts Neues, alle Prüfbefehle am Kopf 15bf124 erneut ausgeführt. Prüfbefehle: Punkt 1 gibt 2, Exit 0, 2, 2, 2 und (Netz, 17:10 UTC) 2; Punkt 2 gibt 1 und Exit 0; Punkt 3 gibt 0, 0, 0; Punkt 4 `check` grün in 78 s (1592 Tests), `ops/own-ips.txt` 0 Zeilen geändert; am PR `check` und `e2e` grün.
- 2026-11-13 Zyklus 3: Punkt 5 (Kritik) gebaut, je Fenster die Anfragen von außen in den 10 s nach dem Start um 17:23 UTC gemessen (00:48:29: 0, 09:55:22: 0) und unter `## Nachher` eingetragen, `Ergebnis:` sagt jetzt, dass keine Anfrage von außen in die Sekunden des Neustarts fiel und der Beleg aussteht; Gegenprobe des Zählers an 2026-11-12 16:41:02 (4, darunter 3 mal 502) und 2026-11-10 20:27:07 (3, darunter 2 mal 502), Log deckt beide Fenster ab (162 und 606 Einträge in ±5 min). Prüfbefehle: Punkt 5 am alten Stand 0 und Exit 1, jetzt 2, Exit 0 und (Netz) 2; Punkt 1 gibt 2, Exit 0, 2, 2, 2 und (Netz) 2; Punkt 2 gibt 1 und Exit 0; Punkt 3 gibt 0, 0, 0; Punkt 4 `check` grün in 51 s (1592 Tests), `ops/own-ips.txt` 0 Zeilen geändert.
- 2026-11-13 Zyklus 4: Gaps von B aus Zyklus 3 behoben, jede Zahl unter `## Nachher` hat jetzt ihren Befehl: ein zweiter Befehl (18:18 UTC) mit Ausgabe belegt je Start die Einträge in ±5 min (162 und 606 nachher), die Anfragen von außen in den 10 s und den Abstand jedes 502 zum Start (7 mal, 0,2 bis 5,1 s), mit leerer Kontrolle 2030-01-01 (0 und 0); der Satz zu den eigenen Anfragen ist gestrichen; `dev` (nur Vorschläge) gemergt. Prüfbefehle: Punkt 1 gibt 2, Exit 0, 2, 2, 2 und (Netz) 2; Punkt 2 gibt 1 und Exit 0; Punkt 3 gibt 0, 0, 0; Punkt 4 `check` grün in 151 s (1592 Tests), `ops/own-ips.txt` 0 Zeilen geändert; Punkt 5 gibt 2, Exit 0 und (Netz) 2.

## Blockers
- keine
