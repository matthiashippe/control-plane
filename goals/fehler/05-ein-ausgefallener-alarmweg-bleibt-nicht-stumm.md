# Fehler Goal 05: Ein ausgefallener Alarmweg bleibt nicht stumm

## Status
ACTIVE

## Active Objective
Fällt der Alarmweg aus (Thema gesperrt, URL falsch, Webhook-Dienst weg), sieht es die Ops-Triage: `ops/status.sh` zählt die Zeilen
`[WARN] webhook unreachable` der letzten 24 Stunden in `/var/log/cp-watchdog.log` auf dem Zahlungsserver und meldet ab 3 im neuen
Feld `alarm_path` den Status `red`, den die Schwellentabelle in `ops/README.md` als Handlungsbedarf führt. Heute schreibt
`ops/watchdog.sh` diese Zeile bei jedem gescheiterten POST, aber keine Stelle liest sie, und die Guthaben-Warnung aus fehler 01 und 03
hängt an genau diesem Weg. Dazu misst `test/watchdog-webhook-fail.test.ts` endlich eine Antwort 4xx oder 5xx des Webhooks: Sein Fake
für `curl` scheitert heute auch ohne `--fail`, deshalb bliebe der Test grün, wenn jemand `--fail` aus `report` entfernt.
Widerlegt, wenn `ops/status.sh` bei drei solchen Zeilen schon heute rot meldet. Übernimmt
`goals/_vorschlaege/fehler-kritik-2026-11-12-4.md`.
MVP: Funktion, weil am 11.11.2026 ein leeres Guthaben 1001 Anfragen eines zahlenden fremden Automatons scheitern ließ und die Warnung
davor nur hilft, wenn ihr Ausfall auffällt.

## Voraussetzungen
- fehler Goal 04 DONE

## Kontext für den Maker
- Bestand am 13.11.2026 auf `de06752` (Kopf von `dev`): `report` in `ops/watchdog.sh` postet mit `curl -s --fail` und schreibt bei
  einem Fehler `<TS> [WARN] webhook unreachable`, `<TS>` im Format `date -u +%Y-%m-%dT%H:%M:%SZ` am Zeilenanfang. Der Watchdog postet
  nur einen Wechsel; scheitert der POST, versucht es jeder Lauf alle fünf Minuten neu, also steht bei einem toten Alarmweg je
  ausstehender Meldung eine Zeile je Lauf. Drei Zeilen sind 15 Minuten ohne Zustellung. Gelesen am 13.11.2026 per `ssh`, nur lesend:
  `/var/log/cp-watchdog.log` hat 15930 Zeilen (1,3 MB) seit 19.09.2026, keine Rotation, 0 Zeilen `webhook unreachable`.
- Entscheidung Tech Lead (13.11.2026): Das Zählen ist ein eigenes Skript `ops/webhook-unreachable.sh [LOG]` (Standard
  `/var/log/cp-watchdog.log`), damit es ohne Server testbar ist. Es gibt die Zahl der Zeilen aus, die genau
  `<TS> [WARN] webhook unreachable` lauten und deren `<TS>` höchstens 24 Stunden vor jetzt liegt; jetzt ist `CP_NOW` (Unix-Sekunden)
  oder die Uhr. Fehlt die Datei oder ist sie nicht lesbar, gibt es nichts aus und endet mit Exit 2. Zeitvergleich als
  Zeichenkette gegen die Grenze im selben Format genügt, weil das Format fest ist.
- `ops/status.sh` schickt das Skript wie `ops/db-report.cjs` über `ssh` auf den Server (`"${SSH[@]}" 'bash -s' < "$DIR/webhook-unreachable.sh"`)
  und schreibt oben in das JSON `"alarm_path": {"unreachable_24h": <Zahl oder null>, "status": "ok" | "red" | "unknown"}`: `red` ab 3,
  `ok` darunter, `unknown` mit `null`, wenn der Server nicht antwortet oder das Skript nicht mit 0 endet. Die Variable
  `CP_WATCHDOG_LOG` setzt den Pfad für Tests; über `ssh` kommt sie nicht mit, auf dem Server gilt der Standard.
- Neuer Test `test/status-alarm-path.test.ts`: `ops/status.sh` aus `STATUS_UNDER_TEST` (Standard die Datei im Repo), Fakes für
  `ssh`, `curl` und `openssl` vorn im `PATH` wie in `test/deploy-window.test.ts`. Der Fake für `ssh` führt einen Aufruf mit `bash -s`
  lokal aus (Standardeingabe weiterreichen, `CP_WATCHDOG_LOG` auf ein gepflanztes Log, `CP_NOW` fest) und endet sonst mit 255. Fälle,
  je ein `it`: 3 Zeilen in den letzten 24 Stunden ergeben `red`, 2 ergeben `ok`, 3 Zeilen älter als 24 Stunden ergeben `ok` mit 0,
  ein fehlendes Log ergibt `unknown` mit `null`, andere Zeilen (`[WARN] credit`, `OUTAGE`) zählen nicht. Kein Netz, kein Server.
- `ops/README.md`: neue Zeile der Tabelle „Thresholds that call for action“ für `alarm_path.status` mit Schwelle `red` und Handlung
  (Webhook von Hand prüfen, URL und Thema in der crontab des Servers mit der in `~/brain/connectors/secrets.env` vergleichen, nie die
  URL in eine Datei des Repos schreiben), dazu ein Satz im Abschnitt „Watchdog on the VM“, dass `ops/status.sh` diese Zeilen zählt.
  `unknown` ist kein Alarm, aber zwei Läufe hintereinander sind ein Befund wie ein fehlender `vm`-Block.
- Der Fake für `curl` in `test/watchdog-webhook-fail.test.ts` bekommt einen zweiten Fehlerfall neben `fail-next`: Eine Datei
  `http-500-next` lässt den nächsten POST wie eine Antwort 500 ausgehen, also Exit 22 nur mit `--fail` in den Argumenten, sonst Exit 0
  ohne Zeile in `posts.log`, und entfernt die Datei. Ein neues `it` fährt damit den Fall LOW: Der erste Lauf schreibt
  `[WARN] webhook unreachable` und postet nichts, der zweite postet genau einmal. Gegenprobe: ein Watchdog ohne `--fail` macht den Test
  rot. Die fünf bestehenden Fälle bleiben unverändert.
- `ops/watchdog.sh` ändert sich nicht, unter `src/` ändert sich nichts. So löst das Goal keinen Rollout aus (Grundregel 5);
  `ops/status.sh` läuft auf dem code-host und gilt ab dem Merge.
- Die URL des Webhooks steht nicht im Repo, weil es öffentlich ist; sie gehört in keinen Test, keine Fixture, kein Log, keinen Commit
  und kein Verdict. Ebenso keine öffentliche IPv4-Adresse (`test/known-ips.test.ts` aus fehler 04): Tests nutzen `.invalid`-Namen.
- Traction: Die Guthaben-Warnung ist die einzige Vorwarnung vor einem Ausfall, der jeden zahlenden Kunden trifft; ein stummer Alarmweg
  macht aus ihr eine Warnung, die niemand bekommt.
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Neue Dateien vor dem lokalen
  `check` stagen, weil die Regeln nur `git ls-files` lesen.

## Done Condition
- [x] `ops/webhook-unreachable.sh` zählt die Zeilen `[WARN] webhook unreachable` der letzten 24 Stunden eines Logs und endet bei
      fehlendem Log mit Exit 2 ohne Ausgabe.
      MVP: Funktion, weil ohne diese Zahl der Ausfall des Alarmwegs nirgends lesbar ist.
      Prüfung: `d=$(mktemp -d); printf '%s [WARN] webhook unreachable\n' 2026-11-13T11:50:00Z 2026-11-13T11:40:00Z 2026-11-12T12:01:00Z 2026-11-12T11:59:00Z > "$d/w.log"; printf '2026-11-13T11:55:00Z [WARN] credit unreadable\n2026-11-13T11:56:00Z [OUTAGE] HTTP 500, twice in a row\n' >> "$d/w.log"; CP_NOW=1794571200 bash ops/webhook-unreachable.sh "$d/w.log"` muss `3` ausgeben.
      Prüfung: `d=$(mktemp -d); printf '%s [WARN] webhook unreachable\n' 2026-11-12T11:59:59Z 2026-11-01T00:00:00Z > "$d/w.log"; CP_NOW=1794571200 bash ops/webhook-unreachable.sh "$d/w.log"` muss `0` ausgeben.
      Prüfung: `d=$(mktemp -d); CP_NOW=1794571200 bash ops/webhook-unreachable.sh "$d/fehlt.log"; echo "exit=$?"` muss genau `exit=2` ausgeben.
- [x] `ops/status.sh` meldet `alarm_path` mit `red` ab 3 Zeilen der letzten 24 Stunden, `ok` darunter und `unknown` mit `null` ohne
      lesbares Log; der neue Test `test/status-alarm-path.test.ts` belegt es ohne Netz und war vor dem Fix rot. `ops/README.md` führt
      `alarm_path.status` in der Schwellentabelle.
      MVP: Funktion, weil die Ops-Triage nur meldet, was `ops/status.sh` ausgibt und `ops/README.md` als Schwelle nennt.
      Prüfung: `pnpm -s vitest run test/status-alarm-path.test.ts` muss Exit-Code 0 haben.
      Prüfung: `d=$(mktemp -d); git show de06752:ops/status.sh > "$d/status.sh"; cp ops/db-report.cjs "$d/"; STATUS_UNDER_TEST="$d/status.sh" pnpm -s vitest run test/status-alarm-path.test.ts >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
      Prüfung: `grep -c '^| .alarm_path\.status. |' ops/README.md` muss 1 ausgeben.
      Prüfung: `grep -cE '\.skip|skipIf|\.only|\.todo' test/status-alarm-path.test.ts` muss 0 ausgeben.
- [x] `test/watchdog-webhook-fail.test.ts` misst eine Antwort 4xx oder 5xx des Webhooks: Ein Watchdog, dessen `report` ohne `--fail`
      postet, macht den Test rot; der Watchdog im Repo hält ihn grün, auch den Test der Tagesmeldungen aus fehler 03.
      MVP: Funktion, weil sonst ein entferntes `--fail` jede Meldung bei einem Webhook mit 5xx als zugestellt speichert und der Test es
      nicht merkt.
      Prüfung: `pnpm -s vitest run test/watchdog-webhook-fail.test.ts test/watchdog-webhook-fail-daily.test.ts` muss Exit-Code 0 haben.
      Prüfung: `d=$(mktemp -d); sed 's/curl -s --fail /curl -s /' ops/watchdog.sh > "$d/watchdog.sh"; cmp -s "$d/watchdog.sh" ops/watchdog.sh && echo gleich || echo anders` muss `anders` ausgeben.
      Prüfung: `d=$(mktemp -d); sed 's/curl -s --fail /curl -s /' ops/watchdog.sh > "$d/watchdog.sh"; cp ops/credit-runway.sh "$d/"; WATCHDOG_UNDER_TEST="$d/watchdog.sh" pnpm -s vitest run test/watchdog-webhook-fail.test.ts >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
- [x] `ops/watchdog.sh` und `src/` bleiben unverändert, und `check` ist grün.
      Prüfung: `git diff --name-only origin/dev...HEAD -- src ops/watchdog.sh | wc -l` muss 0 ausgeben.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [x] `ops/status.sh` gegen die Produktion liefert `alarm_path.unreachable_24h` als Zahl, also findet und liest das Skript das Log auf
      dem Server, nur lesend über den Schlüssel aus `~/.config/control-plane/loop.env`.
      MVP: Funktion, weil ein Feld, das auf dem Server nur `unknown` meldet, den Ausfall genauso verschweigt wie heute.
      Prüfung (Netz): `set -a; . ~/.config/control-plane/loop.env; set +a; bash ops/status.sh | python3 -c 'import json,sys; print(type(json.load(sys.stdin)["alarm_path"]["unreachable_24h"]).__name__)'` muss `int` ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Der neue Test war vor dem Fix rot, und der Test des Watchdogs war mit dem Watchdog ohne `--fail` vor dem Fix grün; die Zeile im
      Progress Log nennt beides.
- [ ] Keine URL des Webhooks, kein Schlüssel und keine öffentliche IPv4-Adresse in Datei, Commit, PR, Kommentar, Log oder Verdict.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, `ops/README.md` Englisch wie die ganze Datei, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `.claude/**`, `.env*`, `*.key`, `*.pem`
- `src/**`, `ops/watchdog.sh`, `ops/credit-runway.sh`, `ops/db-report.cjs`, `test/watchdog-webhook-fail-daily.test.ts`
- jede Goal-Datei außer dieser, jedes Verdict, jeder Vorschlag unter `goals/_vorschlaege/`, jedes `ANNAHMEN.md` eines anderen Topics,
  `docs/audit/**`, `loop-dauerauftrag.md`
- auf dem Server: alles außer lesen (keine crontab, kein Log kürzen oder rotieren, kein POST an den Webhook)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-13 Zyklus 1: Punkte 1, 2, 3, 4, 5 gebaut (neues `ops/webhook-unreachable.sh`, Feld `alarm_path` in `ops/status.sh`, Schwelle in `ops/README.md`, neuer Test `test/status-alarm-path.test.ts`, Fall `http-500-next` in `test/watchdog-webhook-fail.test.ts`); vor dem Fix war `test/status-alarm-path.test.ts` rot (5 von 5) und `test/watchdog-webhook-fail.test.ts` mit dem Watchdog ohne `--fail` grün (5 von 5), danach mit ihm rot (neuer Fall). Prüfbefehle: P1 `3`, `0`, `exit=2`; P2 Exit 0, `rot`, `1`, `0`; P3 Exit 0, `anders`, `rot`; P4 `0`, `check` grün in 291 s (129 Dateien, 1576 Tests); P5 `int` (Wert 0, Status ok), Gegenprobe lesend: Server-Log kopiert 0, mit gepflanzter Zeile 1, auf dem Server ohne Log Exit 2.
- 2026-11-13 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5 (dev `44e7787` schon enthalten, Merge ohne Änderung). Prüfbefehle: P1 `3`, `0`, `exit=2`; P2 Exit 0, `rot`, `1`, `0`; P3 Exit 0, `anders`, `rot`; P4 `0`, `check` grün in 248 s (129 Dateien); P5 `int` (Wert 0, Status ok); Job `e2e` am Kopf `af2b340` grün.

## Blockers
