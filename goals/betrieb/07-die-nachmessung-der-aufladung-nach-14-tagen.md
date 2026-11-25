# Betrieb Goal 07: Die Nachmessung der Aufladung nach 14 Tagen

## Status
PAUSED

## Active Objective
Belegt ist, ob die automatische Aufladung aus betrieb 01 das Guthaben beim Inferenz-Anbieter in den 14 Tagen nach dem Einschalten
(12.11.2026 20:35 UTC bis 26.11.2026 20:35 UTC) über der Warnschwelle hielt: Unter `## Nachmessung nach 14 Tagen` in
`docs/betrieb/guthaben.md` stehen aus dem Log des Watchdogs die Warnungen, die Aufladungen (Sprung des Rests um rund 25 USD zwischen
zwei Läufen) und der niedrigste Rest in diesem Fenster, dazu die Messung aus dem Container, die gerechnete und die eingestellte
Schwelle und eine Zeile `Ergebnis:`. Heute belegt nur die Antwort „schon erledigt“ am Gate die Aufladung.
Ersetzt betrieb 05 ohne dessen täglichen Vergleich im Watchdog (Tech Lead 22.11.2026, PRO-27251): Der Verbrauch fiel auf rund 1 USD am
Tag bei 30,8 Tagen Reichweite (`docs/kunden/aufladung-2026-11.md`), eine wachsende Schwelle ist nicht in Sicht, und der Alarm bleibt
als `goals/_vorschlaege/betrieb-kritik-2026-11-21-1.md` geparkt, bis der Verbrauch wieder steigt. Liegt die gerechnete Schwelle in
dieser Messung mehr als 1 USD über der eingestellten, nennt das Dokument die neue Zahl, und der Alarm wird wieder ein Glied.
Widerlegt, wenn im Fenster eine Warnung `[WARN] credit CREDIT RUNWAY LOW` oder `[WARN] credit empty` im Log steht oder kein Sprung
im Log steht, obwohl der Rest unter 16 USD lag; dann ist betrieb 01 widerlegt.
MVP: Funktion, weil ein leeres Guthaben jede Inferenz-Anfrage jedes zahlenden Kunden mit 503 beantwortet und nur diese Messung zeigt,
ob die Aufladung das verhindert.

## Voraussetzungen
- betrieb Goal 04 DONE
- frühestens 2026-11-27

## Kontext für den Maker
- Ziel: Ein zahlender Automaton bekommt nie 503, weil das Guthaben beim Anbieter leer ist; dieses Goal zeigt, ob die Aufladung das
  zwei Wochen lang geschafft hat.
- Warum frühestens 27.11.: Das Fenster sind genau die 14 Tage aus der Widerlegung von betrieb 01, es endet am 26.11.2026 um 20:35 UTC,
  und der Loop Master startet ein Goal mit `frühestens` um 00:00 UTC. Das feste Fenster macht die Zahlen wiederholbar.
- Bestand: `ops/credit-runway.sh` (Modi Reichweite und `--topup`, Quelle `--container` über genau ein `docker exec` je Abfrage),
  `ops/watchdog.sh` mit `check_credit` (Zeitgrenze `CP_CREDIT_TIMEOUT`, Zustand erst nach erfolgreichem POST, seit fehler 03), Ergebnis
  in `docs/betrieb/guthaben.md`. Dieses Goal ändert weder `ops/` noch Tests, es misst nur.
- Stand vom Tech Lead am 13.11.2026 um 19:14 UTC, nur lesend über `ssh` mit `loop.env`: `/var/log/cp-watchdog.log` wird nicht
  gedreht und reicht bis 19.09.2026 zurück; seit 12.11.2026 20:35 UTC 0 Zeilen `[WARN] credit`, letzter Rest 32,63 USD bei 3,45 USD
  je Tag. Der Cron-Eintrag des Watchdogs setzt nur `CP_ALERT_WEBHOOK`; Crontab und `/opt/control-plane/.env` ändert der Loop nicht.
- Nachmessung (Punkt 3), nur lesend: `set -a; . ~/.config/control-plane/loop.env; set +a`, dann der Befehl aus der Prüfung (Netz) von
  Punkt 3 ohne den `diff`, also `ssh … 'cat /var/log/cp-watchdog.log'` durch die beiden `awk`. Er druckt je Sprung eine Zeile
  `- <JJJJ-MM-TT HH:MM:SS> UTC: <vorher> USD auf <nachher> USD` und dann vier Zeilen `Warnungen seit …`, `Nicht lesbar seit …`,
  `Aufladungen seit …` und `Niedrigster Rest seit …`. Diese Zeilen stehen genau so, ab Spalte 0 und in dieser Reihenfolge, außerhalb
  eines Codeblocks im Abschnitt `## Nachmessung nach 14 Tagen`; der Befehl selbst steht davor in einem Codeblock, dazu
  `Gemessen: <JJJJ-MM-TT HH:MM> UTC`. Ein Zähler, der nichts findet, ist erst belegt, wenn er einen gepflanzten Treffer findet
  (Grundregel 3): Der Maker lässt den `awk` einmal über vier gepflanzte Zeilen laufen (ein Sprung von 16.10 auf 41.08 USD, eine Zeile
  `[WARN] credit CREDIT RUNWAY LOW`, eine Zeile `[WARN] credit unreadable`) und nennt das Ergebnis im Progress Log; der Tech Lead hat
  das am 13.11.2026 so geprüft (1, 1, 1, niedrigster Rest 9.00 USD).
- Annahme: Ein Sprung des Rests um mindestens 20 USD zwischen zwei Läufen des Watchdogs ist eine Aufladung beim Anbieter, weil der
  normale Schlüssel Aufladung und Kauf von Hand nicht unterscheidet und seit dem Einschalten kein Kauf von Hand vereinbart ist. Die
  Doku nennt das in einem Satz.
- Dazu im Abschnitt die Ausgaben von `ssh -i "$CP_SSH_KEY" "$CP_HOST" 'bash -s -- --container' < ops/credit-runway.sh` und
  `ssh -i "$CP_SSH_KEY" "$CP_HOST" 'bash -s -- --topup --container' < ops/credit-runway.sh` als Codeblock mit Uhrzeit in UTC, die
  Zeile `Gerechnete Schwelle der Aufladung: <X> USD` aus der zweiten Ausgabe und `Eingestellte Schwelle der Aufladung: 16 USD`, weil
  Matthias am 12.11.2026 16 USD beim Anbieter eingestellt hat (`docs/betrieb/guthaben.md`, Abschnitt Automatische Aufladung), und zuletzt genau eine Zeile ab Spalte 0 `Ergebnis: betrieb 01 hält, …` oder
  `Ergebnis: betrieb 01 widerlegt, …` nach der Regel aus dem Ziel. Hält es ohne Sprung, weil der Rest nie unter 16 USD lag, sagt die
  Zeile, dass die Aufladung im Fenster nicht auslöste und ihr Beleg aussteht. Liegt die gerechnete Schwelle mehr als 1 USD über der
  eingestellten, nennt ein Satz die neue Zahl; einstellen tut sie nur Matthias, das Goal ändert beim Anbieter nichts.
- Zeigt die Messung `widerlegt`, schreibt der Maker trotzdem die Zahlen, ändert sonst nichts und nennt es im Progress Log; die Folge
  entscheidet der Tech Lead.
- Code, Kommentare, Testnamen und Log-Zeilen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich. Kein Wort zu den Bedingungen
  des Anbieters (`check` prüft es), keine Adresse und kein Name eines Kunden. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check`
  und vitest im Vordergrund mit eigenem Timeout; nach `check` mit `git status --short` prüfen, dass nichts im Checkout liegen blieb.
  Kein `pkill -f`.

## Done Condition
- [ ] Unter `## Nachmessung nach 14 Tagen` in `docs/betrieb/guthaben.md` stehen Warnungen, nicht lesbare Abfragen, Aufladungen und
      der niedrigste Rest im Fenster vom 12.11.2026 20:35 UTC bis 26.11.2026 20:35 UTC, je Aufladung eine Zeile, mit Befehl und
      Uhrzeit der Messung, und die Zahlen sind die aus dem Log.
      Prüfung: `awk '/^## Nachmessung nach 14 Tagen/{f=1;next} /^## /{f=0} f' docs/betrieb/guthaben.md | grep -cE "^(Warnungen|Nicht lesbar|Aufladungen) seit 2026-11-12 20:35 UTC: [0-9]+$"` muss 3 ausgeben.
      Prüfung: `awk '/^## Nachmessung nach 14 Tagen/{f=1;next} /^## /{f=0} f' docs/betrieb/guthaben.md | grep -cE "^Niedrigster Rest seit 2026-11-12 20:35 UTC: -?[0-9]+(\.[0-9]+)? USD$"` muss 1 ausgeben.
      Prüfung: `s=$(awk '/^## Nachmessung nach 14 Tagen/{f=1;next} /^## /{f=0} f' docs/betrieb/guthaben.md); k=$(printf '%s\n' "$s" | grep -cE "^- 2026-11-[0-9]{2} [0-9:]{8} UTC: -?[0-9.]+ USD auf [0-9.]+ USD$"); a=$(printf '%s\n' "$s" | sed -n 's/^Aufladungen seit 2026-11-12 20:35 UTC: \([0-9][0-9]*\)$/\1/p'); test -n "$a" && test "$k" = "$a"` muss Exit-Code 0 haben.
      Prüfung: `awk '/^## Nachmessung nach 14 Tagen/{f=1;next} /^## /{f=0} f' docs/betrieb/guthaben.md | grep -cE "^Gemessen: 2026-(11-(2[7-9]|30)|12-[0-9]{2}) [0-9]{2}:[0-9]{2} UTC$"` muss 1 ausgeben.
      Prüfung: `awk '/^## Nachmessung nach 14 Tagen/{f=1;next} /^## /{f=0} f' docs/betrieb/guthaben.md | grep -c "cp-watchdog.log"` muss mindestens 1 ausgeben.
      Prüfung (Netz): `set -a; . ~/.config/control-plane/loop.env; set +a; diff <(ssh -i "$CP_SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 "$CP_HOST" 'cat /var/log/cp-watchdog.log' | awk '$1>="2026-11-12T20:35" && $1<"2026-11-26T20:35"' | awk '/\[WARN\] credit (CREDIT RUNWAY LOW|empty)/{w++} /\[WARN\] credit unreadable/{u++} /\] credit CREDIT RUNWAY (OK|LOW): /{r=$7+0; if(m==""||r<m){m=r; ms=$7} if(p!="" && r-p>=20){a++; print "- " substr($1,1,10) " " substr($1,12,8) " UTC: " ps " USD auf " $7 " USD"} p=r; ps=$7} END{print "Warnungen seit 2026-11-12 20:35 UTC: " w+0; print "Nicht lesbar seit 2026-11-12 20:35 UTC: " u+0; print "Aufladungen seit 2026-11-12 20:35 UTC: " a+0; print "Niedrigster Rest seit 2026-11-12 20:35 UTC: " ms " USD"}') <(awk '/^## Nachmessung nach 14 Tagen/{f=1;next} /^## /{f=0} f' docs/betrieb/guthaben.md | grep -E "^(- 2026-11-[0-9]{2} [0-9:]{8} UTC: .* USD auf .* USD|(Warnungen|Nicht lesbar|Aufladungen|Niedrigster Rest) seit 2026-11-12 20:35 UTC: .*)$") | wc -l` muss 0 ausgeben.
- [ ] Die Messung aus dem Container steht im Abschnitt, gerechnete und eingestellte Schwelle stehen dort, die eingestellte sind die
      16 USD vom 12.11.2026, und die Zeile `Ergebnis:` folgt der Regel: `hält` nur ohne Warnung und mit einem Sprung oder
      einem niedrigsten Rest von mindestens 16 USD, sonst `widerlegt`.
      Prüfung: `awk '/^## Nachmessung nach 14 Tagen/{f=1;next} /^## /{f=0} f' docs/betrieb/guthaben.md | grep -cE "^(CREDIT RUNWAY (OK|LOW): |AUTO TOPUP: threshold )"` muss mindestens 2 ausgeben.
      Prüfung: `awk '/^## Nachmessung nach 14 Tagen/{f=1;next} /^## /{f=0} f' docs/betrieb/guthaben.md | grep -cE "^(Gerechnete|Eingestellte) Schwelle der Aufladung: [0-9]+ USD$"` muss 2 ausgeben.
      Prüfung: `grep -c "^Eingestellte Schwelle der Aufladung: 16 USD$" docs/betrieb/guthaben.md` muss 1 ausgeben.
      Prüfung: `awk '/^## Nachmessung nach 14 Tagen/{f=1;next} /^## /{f=0} f' docs/betrieb/guthaben.md | awk '/^AUTO TOPUP: threshold /{a=$4} /^Gerechnete Schwelle der Aufladung: /{g=$5} END{exit !(a!="" && a==g)}'` muss Exit-Code 0 haben.
      Prüfung: `awk '/^## Nachmessung nach 14 Tagen/{f=1;next} /^## /{f=0} f' docs/betrieb/guthaben.md | grep -cE "^Ergebnis: betrieb 01 (hält|widerlegt), "` muss 1 ausgeben.
      Prüfung: `awk '/^## Nachmessung nach 14 Tagen/{f=1;next} /^## /{f=0} f' docs/betrieb/guthaben.md | awk '/^Warnungen seit /{w=$NF} /^Aufladungen seit /{a=$NF} /^Niedrigster Rest seit /{m=$(NF-1)+0} /^Ergebnis: betrieb 01 /{r=$4} END{h=(w==0 && (a>0 || m>=16)); exit !(w!="" && ((h && r=="hält,") || (!h && r=="widerlegt,")))}'` muss Exit-Code 0 haben.
- [ ] Die Doku bleibt bis vor `## Watchdog` unverändert, nennt keinen Schlüssel und keine Adresse, und das Goal ändert nur die Doku und
      Dateien unter `goals/betrieb/`.
      Prüfung: `diff <(git show origin/dev:docs/betrieb/guthaben.md | awk '/^## Watchdog/{exit} {print}') <(awk '/^## Watchdog/{exit} {print}' docs/betrieb/guthaben.md) | wc -l` muss 0 ausgeben.
      Prüfung: `grep -cE "sk-or-[A-Za-z0-9-]{8,}" docs/betrieb/guthaben.md` muss 0 ausgeben.
      Prüfung: `grep -E "(^|[^0-9.])([0-9]{1,3}\.){3}[0-9]{1,3}([^0-9.]|$)" docs/betrieb/guthaben.md | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE "^(docs/betrieb/guthaben\.md|goals/betrieb/)" | wc -l` muss 0 ausgeben.
- [ ] `check` ist grün und lässt den Checkout sauber.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs >/dev/null 2>&1; git status --porcelain | wc -l` muss 0 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede Zahl unter `## Nachmessung nach 14 Tagen` mit dem Befehl, aus dem sie stammt, und der Uhrzeit der Messung in UTC; der
      Zähler ist mit gepflanzten Zeilen in beide Richtungen belegt.
- [ ] Keine Adresse, kein Name eines Kunden und kein Schlüssel in Doku, Progress Log oder Kommentar.
- [ ] Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/prompts/**`, `.github/**`, `scripts/**`, `src/**`,
  `harness/**`, `deploy/**`, `ops/**`, `test/**`, `.env*`, `*.key`, `*.pem`
- in `docs/betrieb/guthaben.md` alles vor der Überschrift `## Watchdog`
- Crontab, `/opt/control-plane/.env` und jede Datei auf dem Server; Produktion nur lesend, kein Rollout und kein Neustart von Hand
- jede Aufladung, jeder Kauf und jede Einstellung beim Anbieter (Human Gate `server_kauf`); der Management-Key
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
Pause: Das feste Fenster bis 26.11. kann die Aufladung nicht belegen, weil der Rest (30,86 USD am 20.11. bei 1 USD am Tag) nie unter die Schwelle von 16 USD fällt; zurück auf PLANNED mit neuem Fenster, sobald der Watchdog einen Rest unter 20 USD meldet (Loop-Kritik 2026-11-25)
