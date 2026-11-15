# Betrieb Goal 05: Die Aufladung beim Inferenz-Anbieter ist belegt und bleibt passend

## Status
PLANNED

## Active Objective
Belegt ist, ob die automatische Aufladung aus betrieb 01 das Guthaben beim Inferenz-Anbieter in den 14 Tagen nach dem Einschalten
(12.11.2026 20:35 UTC bis 26.11.2026 20:35 UTC) über der Warnschwelle hielt, und sie bleibt passend, wenn der Verbrauch wächst: Unter
`## Nachmessung nach 14 Tagen` in `docs/betrieb/guthaben.md` stehen aus dem Log des Watchdogs die Warnungen, die Aufladungen (Sprung
des Rests um rund 25 USD zwischen zwei Läufen) und der niedrigste Rest in diesem Fenster, dazu die Messung aus dem Container und eine
Zeile `Ergebnis:`. Dazu vergleicht `ops/watchdog.sh` einmal am Tag die Schwelle, die `ops/credit-runway.sh --topup` rechnet, mit der
beim Anbieter eingestellten aus `CP_CREDIT_TOPUP_USD` und meldet über den Alarmweg, wenn die gerechnete sie um mehr als 1 USD
übersteigt. Heute belegt nur die Antwort „schon erledigt“ am Gate die Aufladung, und dass `--topup` am 12.11.2026 schon 17 statt der
eingestellten 16 USD rechnete, meldet niemand (`ROADMAP.md`, betrieb 05; übernimmt `goals/_vorschlaege/betrieb-kritik-2026-11-12-1.md`
und `goals/_vorschlaege/betrieb-kritik-2026-11-12-2.md`).
Widerlegt, wenn im Fenster eine Warnung `[WARN] credit CREDIT RUNWAY LOW` oder `[WARN] credit empty` im Log steht oder kein Sprung
im Log steht, obwohl der Rest unter 16 USD lag; dann ist betrieb 01 widerlegt.
MVP: Funktion, weil ein leeres Guthaben jede Inferenz-Anfrage jedes zahlenden Kunden mit 503 beantwortet und eine Aufladung, deren
Schwelle hinter dem Verbrauch zurückbleibt, genau das wieder möglich macht, ohne dass es jemand merkt.

## Voraussetzungen
- betrieb Goal 04 DONE
- frühestens 2026-11-27

## Kontext für den Maker
- Ziel: Ein zahlender Automaton bekommt nie 503, weil das Guthaben beim Anbieter leer ist; dieses Goal zeigt, ob die Aufladung das
  zwei Wochen lang geschafft hat, und sorgt dafür, dass eine zu niedrig eingestellte Schwelle gemeldet wird, bevor sie zu spät auslöst.
- Warum frühestens 27.11.: Das Fenster sind genau die 14 Tage aus der Widerlegung von betrieb 01, es endet am 26.11.2026 um 20:35 UTC,
  und der Loop Master startet ein Goal mit `frühestens` um 00:00 UTC. Das feste Fenster macht die Zahlen wiederholbar.
- Bestand: `ops/credit-runway.sh` (Modi Reichweite und `--topup`, Quelle `--container` über genau ein `docker exec` je Abfrage),
  `ops/watchdog.sh` mit `check_credit` (Zeitgrenze `CP_CREDIT_TIMEOUT`, Zustand erst nach erfolgreichem POST, seit fehler 03), Tests
  `test/watchdog-credit.test.ts`, `test/watchdog-credit-kritik.test.ts`, `test/watchdog-webhook-fail.test.ts` und
  `test/watchdog-webhook-fail-daily.test.ts` mit Fakes für `curl`, `docker` und `openssl`. `ops/credit-runway.sh` bleibt unverändert.
- Stand vom Tech Lead am 13.11.2026 um 19:14 UTC, nur lesend über `ssh` mit `loop.env`: `/var/log/cp-watchdog.log` wird nicht
  gedreht und reicht bis 19.09.2026 zurück; seit 12.11.2026 20:35 UTC 0 Zeilen `[WARN] credit`, letzter Rest 32,63 USD bei 3,45 USD
  je Tag. Der Cron-Eintrag des Watchdogs setzt nur `CP_ALERT_WEBHOOK`; Crontab und `/opt/control-plane/.env` ändert der Loop nicht.
- Vergleich im Watchdog (Punkt 1): Die eingestellte Schwelle kommt aus `CP_CREDIT_TOPUP_USD` mit dem Standard 16 im Skript
  (`${CP_CREDIT_TOPUP_USD:-16}`), weil das die Zahl ist, die Matthias am 12.11.2026 beim Anbieter eingestellt hat
  (`docs/betrieb/guthaben.md`), und weil der Cron-Eintrag keine weitere Variable setzt. Einmal am Tag (Tagesstempel in
  `<CP_WATCHDOG_STATE>.topup`, wie `.cert` und `.credit-fail`) ruft der Watchdog `credit-runway.sh --topup --container` mit derselben
  Zeitgrenze wie `check_credit`. Liegt `threshold <X> USD` um mehr als 1 USD über der eingestellten Schwelle, geht über `report`
  genau eine Meldung `WARN` mit dem Text ab `credit top-up threshold <X> USD computed, <S> USD set at the provider`, dazu der Weg
  `https://openrouter.ai/settings/credits`. Den Tagesstempel speichert er erst, wenn die Abfrage lesbar war und eine nötige Meldung
  durchging; eine unlesbare Antwort schreibt nur eine Zeile `[INFO] credit top-up unreadable` ins Log, ohne Meldung. Der Text beginnt
  mit `credit top-up`, damit die Zählung unter Punkt 2 ihn nicht als Warnung zum Guthaben liest.
- Test `test/watchdog-topup.test.ts` ohne Netz, mit den Fakes aus `test/watchdog-credit.test.ts`; Rechenwerte aus der Regel von
  betrieb 01: `usage_weekly` 35 ergibt Schwelle 25 USD, 21,84 ergibt 16, 22,82 ergibt 17, 24,5 ergibt 18. Fälle: 25 gegen
  `CP_CREDIT_TOPUP_USD=16` meldet genau einmal, ein zweiter Lauf am selben Tag meldet nichts und ruft `docker exec` nur noch einmal
  (nur die Reichweite); 16 und 17 gegen 16 melden nichts (17 liegt genau 1 USD darüber, nicht mehr); 18 ohne die Variable meldet
  (Standard 16); scheitert der erste POST der Meldung, meldet der nächste Lauf am selben Tag genau einmal; eine leere Antwort des
  Containers meldet nichts zur Schwelle. Rot vor dem Fix, weil der Watchdog von heute `--topup` nicht aufruft. Die vier bestehenden
  Tests bleiben unverändert grün: Sie nutzen `usage_weekly` 0 und 7, also eine Schwelle von 7 USD.
- Auf dem Server wirkt der Vergleich erst mit dem nächsten Rollout des Laufzeitpfads, weil `ops/` nicht allein ausrollt
  (`docs/betrieb/guthaben.md`, Abschnitt Watchdog); der Abschnitt `## Watchdog` der Doku sagt das in einem Satz und beschreibt den
  Vergleich in zwei bis drei Sätzen.
- Nachmessung (Punkt 2), nur lesend: `set -a; . ~/.config/control-plane/loop.env; set +a`, dann der Befehl aus der Prüfung (Netz) von
  Punkt 2 ohne den `diff`, also `ssh … 'cat /var/log/cp-watchdog.log'` durch die beiden `awk`. Er druckt je Sprung eine Zeile
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
  Zeile `Gerechnete Schwelle der Aufladung: <X> USD` aus der zweiten Ausgabe und `Eingestellte Schwelle der Aufladung: <S> USD` mit dem
  Standard aus `ops/watchdog.sh`, und zuletzt genau eine Zeile ab Spalte 0 `Ergebnis: betrieb 01 hält, …` oder
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
- [ ] `ops/watchdog.sh` vergleicht einmal am Tag die von `--topup` gerechnete Schwelle mit der eingestellten aus
      `CP_CREDIT_TOPUP_USD` (Standard 16) und meldet über den Alarmweg, wenn die gerechnete sie um mehr als 1 USD übersteigt; der Test
      war rot vor dem Fix, die bestehenden Tests des Watchdogs bleiben grün.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/watchdog-topup.test.ts test/watchdog-credit.test.ts test/watchdog-credit-kritik.test.ts test/watchdog-webhook-fail.test.ts test/watchdog-webhook-fail-daily.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -c 'CP_CREDIT_TOPUP_USD:-16}' ops/watchdog.sh` muss mindestens 1 ausgeben.
      Prüfung: `grep -c -- '--topup --container' ops/watchdog.sh` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE "22\.82|24\.5" test/watchdog-topup.test.ts` muss mindestens 2 ausgeben.
- [ ] Unter `## Nachmessung nach 14 Tagen` in `docs/betrieb/guthaben.md` stehen Warnungen, nicht lesbare Abfragen, Aufladungen und
      der niedrigste Rest im Fenster vom 12.11.2026 20:35 UTC bis 26.11.2026 20:35 UTC, je Aufladung eine Zeile, mit Befehl und
      Uhrzeit der Messung, und die Zahlen sind die aus dem Log.
      Prüfung: `awk '/^## Nachmessung nach 14 Tagen/{f=1;next} /^## /{f=0} f' docs/betrieb/guthaben.md | grep -cE "^(Warnungen|Nicht lesbar|Aufladungen) seit 2026-11-12 20:35 UTC: [0-9]+$"` muss 3 ausgeben.
      Prüfung: `awk '/^## Nachmessung nach 14 Tagen/{f=1;next} /^## /{f=0} f' docs/betrieb/guthaben.md | grep -cE "^Niedrigster Rest seit 2026-11-12 20:35 UTC: -?[0-9]+(\.[0-9]+)? USD$"` muss 1 ausgeben.
      Prüfung: `s=$(awk '/^## Nachmessung nach 14 Tagen/{f=1;next} /^## /{f=0} f' docs/betrieb/guthaben.md); k=$(printf '%s\n' "$s" | grep -cE "^- 2026-11-[0-9]{2} [0-9:]{8} UTC: -?[0-9.]+ USD auf [0-9.]+ USD$"); a=$(printf '%s\n' "$s" | sed -n 's/^Aufladungen seit 2026-11-12 20:35 UTC: \([0-9][0-9]*\)$/\1/p'); test -n "$a" && test "$k" = "$a"` muss Exit-Code 0 haben.
      Prüfung: `awk '/^## Nachmessung nach 14 Tagen/{f=1;next} /^## /{f=0} f' docs/betrieb/guthaben.md | grep -cE "^Gemessen: 2026-(11-(2[7-9]|30)|12-[0-9]{2}) [0-9]{2}:[0-9]{2} UTC$"` muss 1 ausgeben.
      Prüfung: `awk '/^## Nachmessung nach 14 Tagen/{f=1;next} /^## /{f=0} f' docs/betrieb/guthaben.md | grep -c "cp-watchdog.log"` muss mindestens 1 ausgeben.
      Prüfung (Netz): `set -a; . ~/.config/control-plane/loop.env; set +a; diff <(ssh -i "$CP_SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 "$CP_HOST" 'cat /var/log/cp-watchdog.log' | awk '$1>="2026-11-12T20:35" && $1<"2026-11-26T20:35"' | awk '/\[WARN\] credit (CREDIT RUNWAY LOW|empty)/{w++} /\[WARN\] credit unreadable/{u++} /\] credit CREDIT RUNWAY (OK|LOW): /{r=$7+0; if(m==""||r<m){m=r; ms=$7} if(p!="" && r-p>=20){a++; print "- " substr($1,1,10) " " substr($1,12,8) " UTC: " ps " USD auf " $7 " USD"} p=r; ps=$7} END{print "Warnungen seit 2026-11-12 20:35 UTC: " w+0; print "Nicht lesbar seit 2026-11-12 20:35 UTC: " u+0; print "Aufladungen seit 2026-11-12 20:35 UTC: " a+0; print "Niedrigster Rest seit 2026-11-12 20:35 UTC: " ms " USD"}') <(awk '/^## Nachmessung nach 14 Tagen/{f=1;next} /^## /{f=0} f' docs/betrieb/guthaben.md | grep -E "^(- 2026-11-[0-9]{2} [0-9:]{8} UTC: .* USD auf .* USD|(Warnungen|Nicht lesbar|Aufladungen|Niedrigster Rest) seit 2026-11-12 20:35 UTC: .*)$") | wc -l` muss 0 ausgeben.
- [ ] Die Messung aus dem Container steht im Abschnitt, gerechnete und eingestellte Schwelle stehen dort, die eingestellte ist der
      Standard aus `ops/watchdog.sh`, und die Zeile `Ergebnis:` folgt der Regel: `hält` nur ohne Warnung und mit einem Sprung oder
      einem niedrigsten Rest von mindestens 16 USD, sonst `widerlegt`.
      Prüfung: `awk '/^## Nachmessung nach 14 Tagen/{f=1;next} /^## /{f=0} f' docs/betrieb/guthaben.md | grep -cE "^(CREDIT RUNWAY (OK|LOW): |AUTO TOPUP: threshold )"` muss mindestens 2 ausgeben.
      Prüfung: `awk '/^## Nachmessung nach 14 Tagen/{f=1;next} /^## /{f=0} f' docs/betrieb/guthaben.md | grep -cE "^(Gerechnete|Eingestellte) Schwelle der Aufladung: [0-9]+ USD$"` muss 2 ausgeben.
      Prüfung: `d=$(sed -n 's/.*CP_CREDIT_TOPUP_USD:-\([0-9][0-9]*\)}.*/\1/p' ops/watchdog.sh | head -n 1); awk -v d="$d" '/^Eingestellte Schwelle der Aufladung: /{s=$5} END{exit !(d!="" && s==d)}' docs/betrieb/guthaben.md` muss Exit-Code 0 haben.
      Prüfung: `awk '/^## Nachmessung nach 14 Tagen/{f=1;next} /^## /{f=0} f' docs/betrieb/guthaben.md | awk '/^AUTO TOPUP: threshold /{a=$4} /^Gerechnete Schwelle der Aufladung: /{g=$5} END{exit !(a!="" && a==g)}'` muss Exit-Code 0 haben.
      Prüfung: `awk '/^## Nachmessung nach 14 Tagen/{f=1;next} /^## /{f=0} f' docs/betrieb/guthaben.md | grep -cE "^Ergebnis: betrieb 01 (hält|widerlegt), "` muss 1 ausgeben.
      Prüfung: `awk '/^## Nachmessung nach 14 Tagen/{f=1;next} /^## /{f=0} f' docs/betrieb/guthaben.md | awk '/^Warnungen seit /{w=$NF} /^Aufladungen seit /{a=$NF} /^Niedrigster Rest seit /{m=$(NF-1)+0} /^Ergebnis: betrieb 01 /{r=$4} END{h=(w==0 && (a>0 || m>=16)); exit !(w!="" && ((h && r=="hält,") || (!h && r=="widerlegt,")))}'` muss Exit-Code 0 haben.
- [ ] Die Doku bleibt bis vor `## Watchdog` unverändert, nennt keinen Schlüssel und keine Adresse, und das Goal ändert nur
      `ops/watchdog.sh`, den neuen Test, die Doku und Dateien unter `goals/betrieb/`.
      Prüfung: `diff <(git show origin/dev:docs/betrieb/guthaben.md | awk '/^## Watchdog/{exit} {print}') <(awk '/^## Watchdog/{exit} {print}' docs/betrieb/guthaben.md) | wc -l` muss 0 ausgeben.
      Prüfung: `cat docs/betrieb/guthaben.md ops/watchdog.sh test/watchdog-topup.test.ts | grep -cE "sk-or-[A-Za-z0-9-]{8,}"` muss 0 ausgeben.
      Prüfung: `grep -E "(^|[^0-9.])([0-9]{1,3}\.){3}[0-9]{1,3}([^0-9.]|$)" docs/betrieb/guthaben.md | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE "^(ops/watchdog\.sh|test/watchdog-topup\.test\.ts|docs/betrieb/guthaben\.md|goals/betrieb/)" | wc -l` muss 0 ausgeben.
- [ ] `check` ist grün und lässt den Checkout sauber.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs >/dev/null 2>&1; git status --porcelain | wc -l` muss 0 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Der neue Test war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Jede Zahl unter `## Nachmessung nach 14 Tagen` mit dem Befehl, aus dem sie stammt, und der Uhrzeit der Messung in UTC; der
      Zähler ist mit gepflanzten Zeilen in beide Richtungen belegt.
- [ ] Keine Adresse, kein Name eines Kunden und kein Schlüssel in Doku, Test, Progress Log oder Kommentar.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/prompts/**`, `.github/**`, `scripts/**`, `src/**`,
  `harness/**`, `deploy/**`, `ops/credit-runway.sh`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, die bestehenden Tests unter
  `test/`, `.env*`, `*.key`, `*.pem`
- in `docs/betrieb/guthaben.md` alles vor der Überschrift `## Watchdog`
- Crontab, `/opt/control-plane/.env` und jede Datei auf dem Server; Produktion nur lesend, kein Rollout und kein Neustart von Hand
- jede Aufladung, jeder Kauf und jede Einstellung beim Anbieter (Human Gate `server_kauf`); der Management-Key
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
- keine
