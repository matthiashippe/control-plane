# Abrechnung Goal 04: Einkauf abgebrochener Anfragen gegen die Abrechnung des Anbieters

## Status
PLANNED

## Active Objective
Der Einkauf eines Abbruchs ohne Antwort ist gemessen statt 0: `ops/abort-purchase.sh` stellt je abgeschlossenem UTC-Tag und Modell
die Aktivität bei OpenRouter (nur lesend) gegen den Einkauf, den Ledger und `inference_aborts` kennen, und verteilt die Lücke auf die
Zeilen mit `answered = 0` desselben Tages und Modells. Die Zahl steht mit ihrem Befehl in `docs/abrechnung/einkauf-abbrueche.md`, und
`docs/abrechnung/timeouts.md` rechnet Timeout-Quote und Anbieterwahl mit dieser Kostenzahl (`ROADMAP.md`, abrechnung 04; übernimmt
`goals/_vorschlaege/abrechnung-kritik-2026-11-10-1.md`).
Widerlegt, wenn die Aktivität des Anbieters je Tag und Modell schon gleich dem Einkauf in Ledger und `inference_aborts` ist; dann steht
genau das in `einkauf-abbrueche.md`, und der Einkauf eines Abbruchs ohne Antwort ist 0.
MVP: Funktion, weil Timeout-Quote und Anbieterwahl sonst mit einem Einkauf rechnen, der jeden Abbruch ohne Antwort als kostenlos zählt,
und damit sowohl den Verlust je Timeout als auch den Nutzen schnellerer Anbieter zu klein ausweisen.

## Voraussetzungen
- abrechnung Goal 03 DONE

## Kontext für den Maker
- Bricht der Client ab, bevor der Anbieter antwortet, schreibt `src/inference/proxy.ts` (`abandon(null)`) eine Zeile in
  `inference_aborts` mit `purchase_mc = 0`, `answered = 0` und ohne `ref`. Wir fragen ohne Stream an (`stream: false` in
  `src/inference/openrouter.ts`), also kennen wir weder Generation-ID noch Preis; der Anbieter kann die Anfrage trotzdem berechnen. Ein
  Preis je Generation (`/api/v1/generation?id=`) scheidet aus, weil die ID fehlt. Bleibt die Aktivität je Tag und Modell.
- Unser Einkauf je UTC-Tag und Modell: `json_extract(meta, '$.purchase_mc')` der Ledger-Zeilen `kind = 'inference'` plus `purchase_mc`
  aus `inference_aborts` (die Zeilen mit `answered = 1` tragen dort ihren echten Einkauf), je nur Anbieter `openrouter`, Tag aus
  `created_at`. Datenbank nur mit `readonly: true` im Container `deploy-cp-1` (wie `ROWS_JS` in `ops/timeout-quote.sh`). Ausgegeben wird
  nie eine Adresse, eine Wallet oder ein Guthaben, nur Summen je Tag und Modell.
- Die Aktivität liefert `GET https://openrouter.ai/api/v1/activity` für die letzten 30 abgeschlossenen UTC-Tage, je Tag, Modell und
  Endpunkt eine Zeile mit dem Betrag in USD (laut Doku Felder wie `date`, `model`, `usage`, `requests`; die echte Antwort gilt, eine
  Abweichung steht in `ANNAHMEN.md`). Mehrere Endpunkte eines Modells am selben Tag werden summiert, USD mal 100000 gerundet ergibt mc.
  Der laufende UTC-Tag fehlt in der Aktivität; seine Zeilen zählt das Werkzeug nicht (`AP_NOW` setzt "jetzt" für Selftest und
  Vitest). Ein abgeschlossener Tag mit Einkauf bei uns und ohne Zeile beim Anbieter zählt mit Anbieter 0.
- Gemessen am 11.11.2026 vom code-host: Der Schlüssel `OPENROUTER_API_KEY` aus `~/.config/control-plane/loop.env` bekommt auf
  `/api/v1/activity` 403 („Only management keys can fetch activity for an account“), auf `/api/v1/key` 200. Das Werkzeug liest deshalb
  `OPENROUTER_MANAGEMENT_KEY` aus derselben Datei und ruft damit ausschließlich `GET /api/v1/activity` auf: kein anderer Pfad, keine
  Schreibmethode, kein Schlüssel anlegen oder löschen, der Wert nie in Ausgabe, Log, Commit oder Kommentar.
- Fehlt die Zeile `OPENROUTER_MANAGEMENT_KEY=` in `~/.config/control-plane/loop.env` (prüfen mit `grep -c`, nie den Wert ausgeben),
  baut der Maker zuerst die Punkte, die ohne den Schlüssel gehen (1, 2 und 5), committet und pusht, und setzt das Goal dann auf
  `BLOCKED matthias` mit diesen Zeilen unter `## Blockers`: `Art: matthias`, `Gate: security_settings`,
  `Aufgabe: Bei OpenRouter einen Management-Key anlegen und auf dem code-host in ~/.config/control-plane/loop.env als
  OPENROUTER_MANAGEMENT_KEY eintragen`, `Worum: Nur dieser Schlüssel darf die Aktivität des Kontos lesen, aus der abrechnung 04 den
  Einkauf abgebrochener Anfragen misst`, `Empfehlung:` mit den fertigen Schritten (Seite der Management-Keys bei OpenRouter, Name
  `control-plane activity read`, Zeile per `printf` an die Datei anhängen, Rechte der Datei bleiben `600`). Ein Mensch legt den Schlüssel
  an, weil nur er im Konto angemeldet ist; der Tech Lead schreibt daraus die Schritte für Matthias.
- Die Aktivität gilt für das ganze Konto, nicht nur für den Schlüssel der Produktion. Deshalb ist jeder Tag ohne Zeile mit
  `answered = 0` eine Gegenprobe aus echten Daten: Dort muss die Lücke innerhalb der Toleranz liegen. Liegt sie darüber, kauft an diesem
  Tag noch etwas anderes dasselbe Modell ein (oder unsere Buchung fehlt), und das Werkzeug meldet `noise` statt einer Schätzung für
  dieses Modell. Die Toleranz (`AP_TOLERANCE_MC`, Rundung der USD-Beträge und Buchungen über Mitternacht) wählst du, Wert und Grund in
  `ANNAHMEN.md`.
- Seit dem Rollout von abrechnung 01 (10.11.2026) gibt es `inference_aborts`; der Zeitraum beginnt dort. Gibt es bis zur Messung keine
  Zeile mit `answered = 0`, steht die Zahl 0 mit genau diesem Grund in der Doku, und das Werkzeug ist durch Selftest und Vitest belegt.
- „Anbieterwahl“ meint das Routing `{ sort: "throughput", allow_fallbacks: true }` aus abrechnung 02 (`goals/abrechnung/ANNAHMEN.md`,
  Goal 02). Dieses Goal ändert das Routing nicht: Spricht die Kostenzahl für ein anderes, wird das ein Vorschlag mit der Zahl.
- Traction: Erst mit dem echten Verlust je Timeout lässt sich sagen, ob schnellere Anbieter oder ein Stream zum Anbieter (Abbruch stoppt
  den Einkauf, die ID ist früh da) sich rechnen; beides hält fremde Automatons, deren Antworten heute im Timeout verloren gehen.
- Der Laufzeitpfad ändert sich nicht: kein `src/**`, also kein Rollout. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und
  vitest im Vordergrund mit eigenem Timeout. Kein Gedankenstrich und nichts zu den Bedingungen des Anbieters in Doku oder Code
  (`check` prüft es).

## Done Condition
- [ ] `ops/abort-purchase.sh --files ACTIVITY ROWS` (ACTIVITY: Antwort von `/api/v1/activity` als JSON, ROWS: unsere Zeilen als JSON
      Lines) und `ops/abort-purchase.sh` (Produktion, nur lesend) geben je Tag und Modell eine Zeile
      `| <Tag> | <Modell> | <Anbieter mc> | <Einkauf mc> | <Lücke mc> | <ohne Antwort> | <je Abbruch mc> |` aus, je Modell eine Zeile
      `purchase without sale <Modell>: <mc>` (Einkauf der Abbrüche mit Antwort plus geschätzter Einkauf der ohne Antwort) und je Tag und
      Modell ohne Zeile mit `answered = 0`, dessen Lücke die Toleranz übersteigt, eine Zeile `noise <Tag> <Modell>: <Lücke mc>`. Der
      Selftest zeigt es in beide Richtungen, ohne Netz: Ein Tag, an dem beide gleich sind, ergibt Lücke 0 und keine `noise`-Zeile; ein Tag
      mit zwei Zeilen `answered = 0` und 300 mc mehr beim Anbieter ergibt `150` je Abbruch; ein Tag ohne Abbruch mit 5000 mc mehr beim
      Anbieter ergibt eine `noise`-Zeile; zwei Endpunkte desselben Modells am selben Tag werden summiert; Zeilen eines Tages, den die
      Aktivität noch nicht abgeschlossen hat (ab dem laufenden UTC-Tag, `AP_NOW`), zählen nicht. Jede dieser Selftest-Zeilen
      beginnt mit `ok   purchase` oder `FAIL purchase`.
      Prüfung: `bash ops/abort-purchase.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `ABORT PURCHASE SELFTEST OK` ausgeben.
      Prüfung: `bash ops/abort-purchase.sh --selftest | grep -c "^ok   purchase"` muss mindestens 5 ausgeben.
      Prüfung: `pnpm -s vitest run test/abort-purchase.test.ts` muss Exit-Code 0 haben; der Test fährt `--files` gegen gepflanzte Dateien
      und verlangt `150` je Abbruch und die `noise`-Zeile.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/abort-purchase.test.ts` muss mindestens 3 ausgeben.
- [ ] Das Werkzeug liest nur: Es ruft bei OpenRouter ausschließlich `GET /api/v1/activity` auf, nur mit `OPENROUTER_MANAGEMENT_KEY`,
      gibt den Schlüssel nie aus und bricht ohne ihn mit Exit 2 und der Zeile `OPENROUTER_MANAGEMENT_KEY missing` ab, bevor es irgendwen
      anfragt. Die Datenbank öffnet es mit `readonly: true`.
      Prüfung: `grep -oE "openrouter\.ai/api/v1/[a-z/]+" ops/abort-purchase.sh | sort -u` muss genau `openrouter.ai/api/v1/activity` ausgeben.
      Prüfung: `grep -cE "(-X|--request) *(POST|PUT|PATCH|DELETE)" ops/abort-purchase.sh` muss 0 ausgeben.
      Prüfung: `grep -c "readonly: true" ops/abort-purchase.sh` muss mindestens 1 ausgeben.
      Prüfung: `env -u OPENROUTER_MANAGEMENT_KEY HOME=$(mktemp -d) HTTPS_PROXY=http://127.0.0.1:9 bash ops/abort-purchase.sh 2>&1 | grep -c "OPENROUTER_MANAGEMENT_KEY missing"` muss 1 ausgeben.
      Prüfung: `env -u OPENROUTER_MANAGEMENT_KEY HOME=$(mktemp -d) HTTPS_PROXY=http://127.0.0.1:9 bash ops/abort-purchase.sh >/dev/null 2>&1; echo $?` muss 2 ausgeben.
- [ ] `docs/abrechnung/einkauf-abbrueche.md` nennt den Zeitraum (abgeschlossene UTC-Tage ab dem 10.11.2026), je Tag und Modell die Zeile
      aus `ops/abort-purchase.sh`, die `noise`-Zeilen oder den Satz, dass es keine gibt, je Modell `purchase without sale` in mc und USD,
      den Befehl, aus dem die Zahlen stammen, eine Zeile `Widerlegt:` (ja, wenn jede Lücke innerhalb der Toleranz liegt, sonst nein mit der
      Summe der Lücken) und eine Zeile `Einkauf je Abbruch ohne Antwort:` je Modell mit Zahl oder Grund, warum keine. Keine Adresse.
      Prüfung (Netz): `bash ops/abort-purchase.sh` muss Exit-Code 0 haben und mindestens eine Zeile `| 2026-11-` ausgeben.
      Prüfung: `grep -c "ops/abort-purchase.sh" docs/abrechnung/einkauf-abbrueche.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE "^[|] *2026-11-[0-9]{2} *[|] *openai/" docs/abrechnung/einkauf-abbrueche.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE "^(Widerlegt|Einkauf je Abbruch ohne Antwort): " docs/abrechnung/einkauf-abbrueche.md` muss mindestens 2 ausgeben.
      Prüfung: `grep -cE "0x[0-9a-fA-F]{40}|\b([0-9]{1,3}\.){3}[0-9]{1,3}\b" docs/abrechnung/einkauf-abbrueche.md` muss 0 ausgeben.
- [ ] `docs/abrechnung/timeouts.md` hat den Abschnitt `## Einkauf ohne Verkauf`: je Modell eine Tabellenzeile
      `| <Modell> | <Timeouts> | <Abbrüche ohne Antwort> | <Einkauf ohne Verkauf mc> |` mit der Kostenzahl aus
      `einkauf-abbrueche.md` statt 0, den Verweis auf diese Datei und eine Zeile `Anbieterwahl:`, die sagt, ob das Routing aus abrechnung 02
      mit dieser Kostenzahl bleibt, mit der Zahl als Grund. `goals/abrechnung/ANNAHMEN.md` hat den Abschnitt `## Goal 04` mit Toleranz,
      Feldern der Aktivität und Quelle.
      Prüfung: `grep -c "^## Einkauf ohne Verkauf" docs/abrechnung/timeouts.md` muss 1 ausgeben.
      Prüfung: `grep -c "einkauf-abbrueche.md" docs/abrechnung/timeouts.md` muss mindestens 1 ausgeben.
      Prüfung: `sed -n '/^## Einkauf ohne Verkauf/,/^## /p' docs/abrechnung/timeouts.md | grep -cE "^[|] *openai/[^|]+[|] *[0-9]+ *[|] *[0-9]+ *[|] *[0-9]+ *[|]"` muss mindestens 1 ausgeben.
      Prüfung: `grep -c "^Anbieterwahl: " docs/abrechnung/timeouts.md` muss 1 ausgeben.
      Prüfung: `grep -c "^## Goal 04" goals/abrechnung/ANNAHMEN.md` muss 1 ausgeben.
- [ ] Der Laufzeitpfad bleibt unverändert, und `check` ist grün.
      Prüfung: `git diff --name-only origin/dev...HEAD -- src deploy | wc -l` muss 0 ausgeben.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei und jede neue Selftest-Zeile war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Der Job `e2e` am Kopf des PR ist grün (`gh pr checks`).
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `src/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `harness/runtime/**`, `.env*`
- jeder Aufruf bei OpenRouter außer `GET /api/v1/activity`; der Wert von `OPENROUTER_MANAGEMENT_KEY` in Repo, Ausgabe, Log oder Kommentar
- `~/.config/control-plane/loop.env` schreibt kein Agent
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
