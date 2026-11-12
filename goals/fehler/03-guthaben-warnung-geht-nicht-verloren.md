# Fehler Goal 03: Die Guthaben-Warnung geht nicht verloren, wenn der Alarmweg scheitert

## Status
ACTIVE

## Active Objective
Scheitert der POST von `ops/watchdog.sh` an den Webhook, kommt die Meldung im nächsten Lauf noch einmal, statt verloren zu gehen:
`report` gibt bei gescheitertem POST einen Exit-Code ungleich 0 zurück, und der Watchdog speichert den neuen Zustand (`low`, `empty`,
`ok` beim Guthaben, `down` und `up` bei der Gesundheit, der Tagesstempel bei `credit unreadable` und beim Zertifikat) erst nach einem
erfolgreichen POST. Heute schluckt `report` den Fehler von `curl` (`ops/watchdog.sh:28`, `|| echo "… webhook unreachable"`), und
`check_credit` schreibt danach trotzdem `low` (`ops/watchdog.sh:78`): Fällt der Webhook genau im Lauf aus, in dem das Guthaben unter
die Schwelle geht, kommt die Warnung nie, bis das Guthaben wieder reicht. Das ist der Ausfall vom 11.11.2026 mit anderem Auslöser.
Widerlegt, wenn der neue Test schon mit dem Watchdog von `5458fa3` (dev vor diesem Goal) grün ist. Übernimmt
`goals/_vorschlaege/fehler-kritik-2026-11-12-1.md`.
MVP: Funktion, weil die Warnung vor leerem Guthaben aus fehler 01 sonst an einem einzigen gescheiterten POST hängt und zahlende Kunden
wieder 503 bekommen, ohne dass jemand davon hört.

## Voraussetzungen
- fehler Goal 02 DONE

## Kontext für den Maker
- Entscheidung Tech Lead (12.11.2026): Ein POST gilt als gescheitert, wenn `curl` mit Exit ungleich 0 endet; dafür bekommt der Aufruf in
  `report` `--fail`, damit auch eine Antwort 4xx oder 5xx des Webhooks (ntfy überlastet, Thema gesperrt) als gescheitert zählt. Die
  Logzeile `[WARN] webhook unreachable` bleibt. Ohne `CP_ALERT_WEBHOOK` gibt `report` 0 zurück, der Zustand wird also wie heute sofort
  gespeichert.
- Muster je Meldung: `report … && echo "<neu>" > "<Zustandsdatei>"`, sonst bleibt der alte Zustand, und der nächste Lauf meldet
  denselben Wechsel erneut. Ein Lauf ohne Wechsel (etwa `credit still low`) speichert wie heute. Bei der Gesundheit gilt dasselbe für
  `OUTAGE` (Zustand `down` erst nach dem POST) und für `reachable again` (Zustand `up` erst nach dem POST); `exit 1` nach einem Ausfall
  bleibt. Beim Wechsel von `low` nach `empty` und beim stillen Wechsel von `empty` nach `low` (Annahme Kritik 2 in
  `goals/fehler/ANNAHMEN.md`) ändert sich nur, wann gespeichert wird, nicht welche Meldung kommt.
- Der neue Test `test/watchdog-webhook-fail.test.ts` baut auf dem Aufbau von `test/watchdog-credit.test.ts` auf (Fakes für `curl`,
  `docker`, `openssl` im `PATH`, kein Netz) und fügt einen Fake für `sleep` hinzu, der sofort endet, weil `check_health` nach einem
  gescheiterten Versuch 20 Sekunden wartet. Der Fake für `curl` lässt den ersten POST mit Exit 22 scheitern und schreibt jeden
  erfolgreichen POST ins Log. Der Test liest den Pfad des Watchdogs aus `WATCHDOG_UNDER_TEST` (Standard `ops/watchdog.sh`), damit der
  dritte Prüfbefehl von Punkt 1 ihn gegen den Stand von `5458fa3` fahren kann. Fälle, je ein `it`:
  LOW mit scheiterndem erstem POST, danach genau ein LOW im Log, ein dritter Lauf postet nichts mehr;
  `empty` nach LOW mit scheiterndem POST für `empty`, danach genau ein `empty`;
  OK aus `low` mit scheiterndem POST, danach genau ein OK;
  `OUTAGE` mit scheiterndem POST (Fake `/health` antwortet 500), danach genau ein `OUTAGE`;
  `reachable again` mit scheiterndem POST, danach genau ein `reachable again`.
  Mit dem Watchdog von `5458fa3` sind mindestens die Fälle LOW und `OUTAGE` rot; die Zeile im Progress Log nennt, welche.
- `ops/README.md` (Abschnitt „Watchdog on the VM“) bekommt einen Satz: Eine Meldung, deren POST scheitert, kommt im nächsten Lauf
  noch einmal.
- Unter `src/` ändert sich nichts. `ops/` rollt mit dem nächsten Rollout des Laufzeitpfads aus (`LOOP.md`, Release), also mit
  betrieb 02; dieses Goal löst keinen Rollout aus.
- Traction: Ein Kunde, dessen Anfragen mit 503 scheitern, weil das Guthaben leer ist, wechselt zurück oder hört auf; die Warnung ist
  der einzige Weg, das vorher zu verhindern.
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein Webhook-Thema und keine
  Adresse in Log, Kommentar, Commit oder Verdict.

## Done Condition
- [x] Scheitert der POST an den Webhook, speichert `ops/watchdog.sh` den neuen Zustand nicht, und der nächste Lauf postet die Meldung
      genau einmal: für LOW, `empty` und OK beim Guthaben und für `OUTAGE` und `reachable again` bei der Gesundheit. `report` ruft
      `curl` mit `--fail` und gibt bei gescheitertem POST einen Exit-Code ungleich 0 zurück.
      Prüfung: `pnpm -s vitest run test/watchdog-webhook-fail.test.ts` muss Exit-Code 0 haben.
      Prüfung: `sed -n '/^report()/,/^}/p' ops/watchdog.sh | grep -c -- '--fail'` muss mindestens 1 ausgeben.
      Prüfung: `d=$(mktemp -d); git show 5458fa3:ops/watchdog.sh > "$d/watchdog.sh"; cp ops/credit-runway.sh "$d/"; WATCHDOG_UNDER_TEST="$d/watchdog.sh" pnpm -s vitest run test/watchdog-webhook-fail.test.ts >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
- [x] Das Verhalten aus fehler 01 bleibt: eine Meldung je Wechsel, `credit unreadable` höchstens einmal am Tag, keine Meldung ohne
      Wechsel, kein Schlüssel im Log.
      Prüfung: `pnpm -s vitest run test/watchdog-credit.test.ts test/watchdog-credit-kritik.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -c 'next run' ops/README.md` muss mindestens 1 ausgeben.
- [x] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] Auch die beiden Tagesmeldungen gehen nicht verloren: Scheitert der POST für `credit unreadable` oder für die Warnung zum
      Zertifikat, postet der nächste Lauf am selben Tag die Meldung genau einmal, und ein dritter Lauf am selben Tag postet sie nicht
      mehr (Kritik 2026-11-12: `ops/watchdog.sh` speichert beide Tagesstempel seit diesem Goal erst nach dem POST, aber kein Test
      fährt diese zwei Wege; die fünf Fälle von Punkt 1 decken nur Guthaben und Gesundheit). Neuer Test
      `test/watchdog-webhook-fail-daily.test.ts` mit dem Aufbau von `test/watchdog-webhook-fail.test.ts` und demselben
      `WATCHDOG_UNDER_TEST`, je Weg ein `it`; für das Zertifikat gibt der Fake für `openssl` bei `s_client` Text aus, endet bei
      `x509 -checkend` mit 1 und gibt bei `x509 -enddate` eine Zeile `notAfter=…` aus.
      MVP: Funktion, weil eine Meldung, die einmal am Tag kommen soll, sonst bei einem gescheiterten POST bis zum nächsten Tag fehlt
      und die Regel „erst nach dem POST speichern“ an diesen zwei Stellen ungeprüft bleibt.
      Prüfung: `pnpm -s vitest run test/watchdog-webhook-fail-daily.test.ts` muss Exit-Code 0 haben.
      Prüfung: `d=$(mktemp -d); git show 5458fa3:ops/watchdog.sh > "$d/watchdog.sh"; cp ops/credit-runway.sh "$d/"; WATCHDOG_UNDER_TEST="$d/watchdog.sh" pnpm -s vitest run test/watchdog-webhook-fail-daily.test.ts >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Der neue Test war vor dem Fix rot; die Zeile im Progress Log nennt, welche Fälle.
- [ ] Kein Webhook-Thema und keine Adresse in Commit, PR, Kommentar, Log oder Verdict.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`
- `src/**`
- `ops/credit-runway.sh` und die Tests aus fehler 01 (`test/watchdog-credit.test.ts`, `test/watchdog-credit-kritik.test.ts`): sie sind
  der Maßstab für Punkt 2
- die Crontab auf dem Server und jede Datei dort (Produktion: nur lesen)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-12 Zyklus 1: Punkte 1, 2, 3 gebaut: `report` ruft `curl --fail` und gibt bei gescheitertem POST 1 zurück, `ops/watchdog.sh` speichert jeden neuen Zustand (Guthaben, Gesundheit, Tagesstempel für `credit unreadable` und Zertifikat) erst nach erfolgreichem POST, neuer Test `test/watchdog-webhook-fail.test.ts` mit fünf Fällen, Satz in `ops/README.md`; vor dem Fix waren alle fünf Fälle rot (LOW, `empty`, OK, `OUTAGE`, `reachable again`, je „expected 0 to be 1“). Prüfbefehle: P1 vitest webhook-fail Exit 0, `grep -c -- '--fail'` 1, Gegenprobe gegen `5458fa3` rot (mit neuem Watchdog in derselben Form gruen); P2 vitest credit und credit-kritik Exit 0, `grep -c 'next run'` 1; P3 `node scripts/check.mjs` Exit 0 (114 Dateien, 1423 Tests).
- 2026-11-12 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3; `dev` (03d4339) war schon im Branch, alle Prüfbefehle am Kopf a6cf379 neu gefahren. Prüfbefehle: P1 vitest webhook-fail Exit 0 (5 Tests), `grep -c -- '--fail'` 1, Gegenprobe gegen `5458fa3` rot (derselbe Befehl mit dem Watchdog des Branches gruen); P2 vitest credit und credit-kritik Exit 0 (8 Tests), `grep -c 'next run'` 1; P3 `node scripts/check.mjs` Exit 0 (1423 Tests); Jobs `check` und `e2e` am PR für a6cf379 pass.

## Blockers
