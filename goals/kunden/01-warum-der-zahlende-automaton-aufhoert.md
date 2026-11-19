# Kunden Goal 01: Warum der zahlende Automaton aufhört

## Status
ACTIVE

## Active Objective
Die fremde Inferenz-Ausgabe fiel von 8,19 USD am 12.11.2026 auf 0,13 USD am 18.11.2026, und seit dem 14.11. gibt nur noch eine
fremde Adresse überhaupt etwas aus (`docs/richtung/2026-11-19.md`). Niemand weiß, warum: leerer Saldo, ein Fehler bei uns (4xx oder
5xx auf dem Inferenz-Pfad, ein Modell, das er ruft und wir nicht mehr führen, Abbrüche), oder sein Betreiber hat ihn abgeschaltet.
Nach diesem Goal gibt es ein Werkzeug `ops/customer-decline.sh`, das je fremder Adresse mit Inferenz ab `--since` je Tag Anfragen,
Ausgabe, Modelle und die HTTP-Status ihrer Anfragen auf dem Inferenz-Pfad zeigt, dazu Saldo, letzte Aufladung und die Abbrüche je Tag,
jede Adresse nur als Nummer. Mit seiner Ausgabe steht in `docs/kunden/rueckgang-2026-11.md` je Kunde die Ursache des Rückgangs; liegt
sie bei uns, wird sie ein Vorschlag `goals/_vorschlaege/fehler-<JJJJ-MM-TT>-<n>.md` mit Schwere 5, den der Writer an das Topic `fehler`
hängt.
Leitzahl: fremde Inferenz-Ausgabe je Woche.
Widerlegt, wenn der Saldo des Automatons leer ist und kein Fehler bei uns lag; dann steht das so da.
MVP: Funktion, weil ein zahlender Kunde, den wir verlieren, mehr kostet als jeder, den wir noch nicht haben.

## Voraussetzungen
- keine

## Kontext für den Maker
- Ziel: Wir wissen gemessen, warum der eine zahlende fremde Automaton fast aufgehört hat, und beheben eine Ursache bei uns als
  Nächstes (Topic `fehler`, Prio 1), statt weiter für Kunden zu bauen, die noch nicht da sind.
- Quelle der Kette: `ROADMAP.md` Zeile 14 (Topic `kunden`, Glied 01), Richtungs-Check 19.11.2026 (PRO-25477,
  `docs/richtung/2026-11-19.md`, Idee 2 „Kunden halten vor Kunden gewinnen“). `docs/kette.md` hat zu `kunden` noch keinen Abschnitt;
  diese Datei ist die ausführliche Fassung.
- Datenbankteil, in `ops/db-report.cjs`, weil dort `OURS`, `OUR_KEY_NAMES` und `oursClause` stehen und das Skript in der Produktion
  über `node -` im Container `cp` läuft (kein `require` daneben möglich): Mit `CP_REPORT=decline` gibt es statt des Berichts genau ein
  JSON aus, gelesen mit `readonly: true` wie bisher; `CP_SINCE` und `CP_UNTIL` (ISO UTC, `CP_UNTIL` ohne Wert heißt jetzt) begrenzen
  das Fenster. Inhalt: `customers`, je fremder Adresse mit mindestens einer Ledger-Zeile `kind = 'inference'` im Fenster (nicht
  `oursClause`), sortiert nach ihrer ersten solchen Zeile und ab 1 nummeriert (`n`), mit `balance_mc` aus `wallets`, `last_topup`
  (ISO der letzten Zeile `kind = 'topup'`, auch vor dem Fenster, `null` ohne) und `rows`, je Inferenz-Zeile im Fenster
  `{at, model, charged_mc}` (`model` aus `meta.model`, `charged_mc` gleich `-delta_mc`); dazu `aborts`, je Zeile von
  `inference_aborts` im Fenster `{at, model, answered, purchase_mc}`. Nie eine Adresse, ein Schlüssel oder `ref` im JSON. Ohne
  `CP_REPORT` bleibt die Ausgabe Byte für Byte wie heute, weil `ops/status.sh` sie liest.
- Werkzeug `ops/customer-decline.sh` (Bash mit eingebettetem Node oder Python, wie `ops/github-yield.sh`), nur lesend:
  - `ops/customer-decline.sh --since <ISO UTC> [--until <ISO UTC>]` in der Produktion: das JSON über
    `ssh … 'cd /opt/control-plane/repo/deploy && docker compose -f docker-compose.prod.yml exec -T -e CP_REPORT=decline -e CP_SINCE=<t> -e CP_UNTIL=<u> cp node -' < ops/db-report.cjs`
    (Schlüssel und Host wie in `ops/status.sh` aus `CP_DEPLOY_KEY` und `CP_DEPLOY_HOST`), das Zugriffslog über `ops/access-log.sh`
    (gedrehte Dateien eingeschlossen). Gerechnet wird auf dem code-host, nicht auf dem Server.
  - `--db-json <datei>` und `--log <datei>` ersetzen beide Quellen, `--selftest` prüft ohne Netz in beide Richtungen. Eigene Adressen
    über `ops/own-ips.sh` (`CP_OWN_IPS=<datei>` ersetzt die Liste); keine eigene Adresse, kein lesbares Log oder kein lesbares JSON
    ist Exit 2, eine Zeit, die keine ISO-Zeit in UTC ist, oder `--until` nicht nach `--since` ist Exit 1.
  - Inferenz-Pfad heißt `POST /v1/chat/completions` und `POST /v1/check` (die Routen in `src/app.ts`, die `handleChat` rufen), Pfad
    ohne Query. Zuordnung einer Adresse im Log zu einem Kunden: Je Zeile aus `rows` die Logzeile auf dem Inferenz-Pfad mit Status 200
    von einer fremden Adresse, deren `ts` `at` am nächsten liegt, höchstens 5 s entfernt; jede so getroffene Adresse gehört zum Kunden.
    Eine eigene Adresse wird nie zugeordnet und nie gezählt.
  - Ausgabe, Englisch, je Zeile, in dieser Reihenfolge, Beträge in USD mit zwei Nachkommastellen (100000 mc = 1 USD), Tage in UTC:
    `DECLINE since <t> until <u>: <k> foreign customers with inference`;
    je Kunde `CUSTOMER <n>: first <ISO>, last <ISO>, balance <usd> USD, last topup <ISO|never>, ips <m>` und darunter je Tag des
    Fensters, auch ohne Anfrage, `DAY <n> <JJJJ-MM-TT>: <c> calls, <usd> USD, models <modell>:<zahl>[,…]|-, http 2xx <a> 402 <b> 4xx <c> 5xx <d>`
    (`4xx` ohne 402; gezählt werden alle Logzeilen der Adressen des Kunden auf dem Inferenz-Pfad an diesem Tag);
    je Tag `OTHER <JJJJ-MM-TT>: http 2xx <a> 402 <b> 4xx <c> 5xx <d>` für fremde Adressen auf dem Inferenz-Pfad, die keinem Kunden
    gehören; je Tag mit Abbruch `ABORTS <JJJJ-MM-TT>: <a> aborted, <b> answered after, <usd> USD bought`;
    `UNMATCHED: <x> inference rows without a log line within 5 s`;
    `WEEK: <usd> USD foreign inference in the 7 days before <u>`. Keine Adresse, keine Wallet, kein Schlüssel in der Ausgabe.
- Fixtures, nur Adressen aus RFC 5737: `ops/fixtures/customer-decline-db.json`, `ops/fixtures/customer-decline.log` (Caddy-JSON wie
  `ops/fixtures/github-yield.log`) und `ops/fixtures/customer-decline-own-ips.txt` mit `203.0.113.99`. Planspiel: Kunde 1 hat
  Inferenz-Zeilen am 2026-11-12 um 10:00:00, 10:05:00 und 10:10:00 UTC (Modell `m-a`, je 100000 mc) und am 2026-11-13 um 09:00:00
  (`m-a`, 50000 mc), Saldo 0, letzte Aufladung 2026-11-10T08:00:00Z. Im Log ruft `198.51.100.7` den Inferenz-Pfad mit 200 um 10:00:02,
  10:05:01 und 10:10:03 am 12.11. und um 09:00:01 am 13.11., dann mit 402 am 2026-11-14 um 08:00:00 und 08:30:00. Die eigene Adresse
  `203.0.113.99` ruft ihn mit 200 am 2026-11-12 um 10:00:00.5, näher an der ersten Zeile als `198.51.100.7`. Eine andere fremde
  Adresse `198.51.100.50` bekommt am 2026-11-14 um 09:00:00 eine 500 auf `/v1/chat/completions`. `aborts` hat eine Zeile am
  2026-11-13 um 09:30:00 (`m-a`, `answered: 1`, 20000 mc). Erwartet mit `--since 2026-11-12T00:00:00Z --until 2026-11-15T00:00:00Z`:
  `DECLINE since 2026-11-12T00:00:00Z until 2026-11-15T00:00:00Z: 1 foreign customers with inference`,
  `CUSTOMER 1: first 2026-11-12T10:00:00Z, last 2026-11-13T09:00:00Z, balance 0.00 USD, last topup 2026-11-10T08:00:00Z, ips 1`,
  `DAY 1 2026-11-12: 3 calls, 3.00 USD, models m-a:3, http 2xx 3 402 0 4xx 0 5xx 0`,
  `DAY 1 2026-11-13: 1 calls, 0.50 USD, models m-a:1, http 2xx 1 402 0 4xx 0 5xx 0`,
  `DAY 1 2026-11-14: 0 calls, 0.00 USD, models -, http 2xx 0 402 2 4xx 0 5xx 0`,
  `OTHER 2026-11-14: http 2xx 0 402 0 4xx 0 5xx 1`, `ABORTS 2026-11-13: 1 aborted, 1 answered after, 0.20 USD bought`,
  `UNMATCHED: 0 inference rows without a log line within 5 s` und
  `WEEK: 3.50 USD foreign inference in the 7 days before 2026-11-15T00:00:00Z`. Gegenprobe mit einer eigenen Liste ohne `203.0.113.99`:
  die eigene Adresse wird der ersten Zeile zugeordnet, also `ips 2` und `DAY 1 2026-11-12: 3 calls, 3.00 USD, models m-a:3, http 2xx 4 402 0 4xx 0 5xx 0`.
- Tests: `test/customer-decline.test.ts` baut wie `test/db-report.test.ts` eine Datenbank mit `openDb` und fährt
  `ops/db-report.cjs` mit `CP_REPORT=decline`: eine eigene Adresse aus `OURS` mit Inferenz steht nie in `customers` (Testname enthält
  `never lists our own`), jede Inferenz-Zeile eines Fremden im Fenster steht in `rows` und keine außerhalb (`keeps every row`), das
  JSON trägt keine Adresse (`no address`), ohne `CP_REPORT` gibt es kein Feld `customers` (`default report unchanged`). Dazu Fälle für
  `ops/customer-decline.sh` gegen die Fixtures (Planspiel und Gegenprobe, Testname enthält `402` und `ours`). Der Selftest des Skripts
  hat dieselben Fälle, seine Zeilen nennen `ours`, `402` und `unmatched`. Jeder neue Test lief einmal gegen `origin/dev` und war rot;
  die Zeile im Progress Log nennt, womit.
- Messung, nur lesend gegen die Produktion (`loop-constraints.md`, Produktion: nur lesen): `set -a; . ~/.config/control-plane/loop.env;
  set +a`, dann `bash ops/customer-decline.sh --since 2026-11-05T00:00:00Z`. Die vollständige Ausgabe steht als Codeblock in
  `docs/kunden/rueckgang-2026-11.md`, darüber der Befehl.
- Ursache je Kunde, ein Wort aus vier: `Saldo leer` (Saldo unter dem Preis seiner letzten Anfrage und danach 402 oder keine Anfrage
  mehr), `Fehler bei uns` (4xx außer 402, 5xx oder Abbrüche an Tagen, an denen seine Ausgabe fiel, ein Modell, das er rief und das
  `GET /v1/models` nicht mehr führt, oder die Sunset-Antwort aus `src/app.ts`, HAN-62, falls sie wieder greift), `beim Betreiber`
  (Saldo reicht, keine Fehler, die Anfragen hören einfach auf), sonst `offen` mit dem, was fehlt. Belegt wird jedes Wort mit Zeilen
  der Ausgabe.
- `docs/kunden/rueckgang-2026-11.md`, Deutsch, je eine Zeile:
  `Gemessen: <ISO UTC der Messung>`;
  `Rückgang: <a> USD am 12.11., <b> USD am 18.11.` für den Kunden mit der größten Ausgabe am 12.11.;
  `Leitzahl: <usd> USD fremde Inferenz-Ausgabe in den 7 Tagen bis <JJJJ-MM-TT>` aus der Zeile `WEEK`;
  je Zeile `CUSTOMER` der Ausgabe genau eine Zeile
  `- Kunde <n>: <a> Anfragen, <b> USD seit 05.11., Saldo <c> USD, letzte Inferenz <JJJJ-MM-TT>, Ursache: <Wort>, weil <Beleg>`;
  genau eine Zeile `Ergebnis: Fehler bei uns, Vorschlag goals/_vorschlaege/fehler-<JJJJ-MM-TT>-<n>.md`, wenn ein Kunde `Fehler bei uns`
  hat, sonst `Ergebnis: kein Fehler bei uns, weil …`. Keine Adresse, keine Wallet, kein Name (Grundregel 8).
- Bei `Fehler bei uns`: der Vorschlag im Format aus dem Skill (`Schwere: 5`, `Goal: kunden 01`, `Befund:`, `Beleg:` mit Befehl und
  Ausgabe, `Empfehlung:`), mit Zeitpunkt in UTC, Pfad, Status und wie oft, ohne Adresse (`LOOP.md`, Fehler echter Nutzer). Behoben wird
  er nicht in diesem Goal.
- `goals/kunden/ANNAHMEN.md` (neu): Zeilen `- <Datum>, kunden 01: …` mindestens zur Zuordnung über 5 s und zu Zeilen ohne Treffer.
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein Build, kein Test auf dem
  Server.

## Done Condition
- [x] `ops/db-report.cjs` gibt mit `CP_REPORT=decline` je fremder Adresse mit Inferenz ihre Zeilen im Fenster ohne Adresse aus, ohne
      `CP_REPORT` unverändert; in beide Richtungen bewiesen.
      Prüfung: `pnpm -s vitest run test/customer-decline.test.ts` muss Exit-Code 0 haben.
      Prüfung: `pnpm -s vitest run test/customer-decline.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed").map(a=>a.title);console.log([/never lists our own/,/keeps every row/,/no address/,/default report unchanged/,/402/,/ours/].every(r=>t.some(x=>r.test(x)))?"alle":"fehlt")})'` muss `alle` ausgeben.
      Prüfung: `pnpm -s vitest run test/db-report.test.ts test/db-report-no-duplicate-keys.test.ts` muss Exit-Code 0 haben.
- [x] `ops/customer-decline.sh` ordnet die Anfragen im Zugriffslog dem Kunden zu, zählt je Tag Anfragen, Ausgabe, Modelle und
      HTTP-Status, nie eine eigene Adresse, und nennt keine Adresse; in beide Richtungen bewiesen.
      Prüfung: `bash ops/customer-decline.sh --selftest | tail -1` muss mit `SELFTEST OK` beginnen.
      Prüfung: `bash ops/customer-decline.sh --selftest | grep -cE "^ok .*ours"` muss mindestens 1 ausgeben.
      Prüfung: `bash ops/customer-decline.sh --selftest | grep -cE "^ok .*402"` muss mindestens 1 ausgeben.
      Prüfung: `bash ops/customer-decline.sh --selftest | grep -cE "^ok .*unmatched"` muss mindestens 1 ausgeben.
      Prüfung: `CP_OWN_IPS=ops/fixtures/customer-decline-own-ips.txt bash ops/customer-decline.sh --db-json ops/fixtures/customer-decline-db.json --log ops/fixtures/customer-decline.log --since 2026-11-12T00:00:00Z --until 2026-11-15T00:00:00Z | grep -cxE "DECLINE since 2026-11-12T00:00:00Z until 2026-11-15T00:00:00Z: 1 foreign customers with inference|CUSTOMER 1: first 2026-11-12T10:00:00Z, last 2026-11-13T09:00:00Z, balance 0\.00 USD, last topup 2026-11-10T08:00:00Z, ips 1|DAY 1 2026-11-12: 3 calls, 3\.00 USD, models m-a:3, http 2xx 3 402 0 4xx 0 5xx 0|DAY 1 2026-11-13: 1 calls, 0\.50 USD, models m-a:1, http 2xx 1 402 0 4xx 0 5xx 0|DAY 1 2026-11-14: 0 calls, 0\.00 USD, models -, http 2xx 0 402 2 4xx 0 5xx 0|OTHER 2026-11-14: http 2xx 0 402 0 4xx 0 5xx 1|ABORTS 2026-11-13: 1 aborted, 1 answered after, 0\.20 USD bought|UNMATCHED: 0 inference rows without a log line within 5 s|WEEK: 3\.50 USD foreign inference in the 7 days before 2026-11-15T00:00:00Z"` muss 9 ausgeben.
      Prüfung: `o=$(mktemp); echo "192.0.2.254" >"$o"; CP_OWN_IPS="$o" bash ops/customer-decline.sh --db-json ops/fixtures/customer-decline-db.json --log ops/fixtures/customer-decline.log --since 2026-11-12T00:00:00Z --until 2026-11-15T00:00:00Z | grep -cE "^CUSTOMER 1: .*, ips 2$|^DAY 1 2026-11-12: 3 calls, 3\.00 USD, models m-a:3, http 2xx 4 402 0 4xx 0 5xx 0$"` muss 2 ausgeben.
      Prüfung: `CP_OWN_IPS=ops/fixtures/customer-decline-own-ips.txt bash ops/customer-decline.sh --db-json ops/fixtures/customer-decline-db.json --log ops/fixtures/customer-decline.log --since 2026-11-12T00:00:00Z --until 2026-11-15T00:00:00Z | grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}"` muss 0 ausgeben.
      Prüfung: `grep -ohE '"(remote_ip|client_ip)": ?"[^"]*"' ops/fixtures/customer-decline.log | grep -cvE '"(192\.0\.2|198\.51\.100|203\.0\.113)\.[0-9]+"'` muss 0 ausgeben.
      Prüfung: `CP_OWN_IPS=ops/fixtures/customer-decline-own-ips.txt bash ops/customer-decline.sh --db-json ops/fixtures/customer-decline-db.json --log ops/fixtures/customer-decline.log --since 2026-11-12T00:00:00Z --until 2026-11-12T00:00:00Z >/dev/null 2>&1; echo $?` muss `1` ausgeben.
      Prüfung: `CP_OWN_IPS=ops/fixtures/customer-decline-own-ips.txt bash ops/customer-decline.sh --db-json ops/fixtures/customer-decline-db.json --log ops/fixtures/no-such.log --since 2026-11-12T00:00:00Z >/dev/null 2>&1; echo $?` muss `2` ausgeben.
- [ ] Die Ursache des Rückgangs steht je Kunde gemessen in `docs/kunden/rueckgang-2026-11.md`, mit Befehl, Ausgabe und Ergebnis, ohne
      Adresse; liegt sie bei uns, gibt es den Vorschlag mit Schwere 5.
      Prüfung: `awk '/^Gemessen: /{print ($2 >= "2026-11-19T00:00:00Z") ? "spaet genug" : "zu frueh"}' docs/kunden/rueckgang-2026-11.md` muss genau `spaet genug` ausgeben.
      Prüfung: `grep -c "bash ops/customer-decline.sh --since 2026-11-05T00:00:00Z" docs/kunden/rueckgang-2026-11.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE "^DAY [0-9]+ 2026-11-1[2-8]: [0-9]+ calls, " docs/kunden/rueckgang-2026-11.md` muss mindestens 7 ausgeben.
      Prüfung: `c=$(grep -cE "^CUSTOMER [0-9]+: first " docs/kunden/rueckgang-2026-11.md); k=$(grep -cE "^- Kunde [0-9]+: [0-9]+ Anfragen, [0-9]+[.,][0-9]{2} USD seit 05\.11\., Saldo [0-9]+[.,][0-9]{2} USD, letzte Inferenz 2026-[0-9]{2}-[0-9]{2}, Ursache: (Saldo leer|Fehler bei uns|beim Betreiber|offen), weil " docs/kunden/rueckgang-2026-11.md); [ "$c" -ge 1 ] && [ "$c" = "$k" ] && echo gleich || echo ungleich` muss `gleich` ausgeben.
      Prüfung: `grep -cE "^Rückgang: [0-9]+[.,][0-9]{2} USD am 12\.11\., [0-9]+[.,][0-9]{2} USD am 18\.11\.$" docs/kunden/rueckgang-2026-11.md` muss 1 ausgeben.
      Prüfung: `grep -cE "^Leitzahl: [0-9]+[.,][0-9]{2} USD fremde Inferenz-Ausgabe in den 7 Tagen bis 2026-[0-9]{2}-[0-9]{2}$" docs/kunden/rueckgang-2026-11.md` muss 1 ausgeben.
      Prüfung: `grep -cE "^Ergebnis: " docs/kunden/rueckgang-2026-11.md` muss 1 ausgeben.
      Prüfung: `d=docs/kunden/rueckgang-2026-11.md; if grep -q "Ursache: Fehler bei uns" "$d"; then p=$(sed -nE 's/^Ergebnis: Fehler bei uns, Vorschlag (goals\/_vorschlaege\/fehler-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]+\.md)$/\1/p' "$d"); [ -n "$p" ] && head -1 "$p" | grep -qx "Schwere: 5" && echo stimmig || echo unstimmig; else grep -qE "^Ergebnis: kein Fehler bei uns, weil " "$d" && echo stimmig || echo unstimmig; fi` muss `stimmig` ausgeben.
      Prüfung: `cat docs/kunden/rueckgang-2026-11.md goals/kunden/ANNAHMEN.md | grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}"` muss 0 ausgeben.
      Prüfung: `grep -cE "^- [0-9-]+, kunden 01: " goals/kunden/ANNAHMEN.md` muss mindestens 1 ausgeben.
      Prüfung (Netz): `bash ops/customer-decline.sh --since 2026-11-05T00:00:00Z | grep -cE "^CUSTOMER [0-9]+: first "` muss mindestens 1 ausgeben.
      Prüfung (Netz): `bash ops/customer-decline.sh --since 2026-11-05T00:00:00Z | grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}"` muss 0 ausgeben.
- [x] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Test war vor dem Werkzeug rot; die Zeile im Progress Log nennt, womit.
- [ ] Ohne `CP_REPORT` gibt `ops/db-report.cjs` dasselbe aus wie auf `origin/dev`; `ops/status.sh` ist unverändert.
- [ ] Keine Zeile der Ausgabe, des Dokuments, der Fixtures außer RFC-5737-Adressen oder eines Vorschlags nennt eine Adresse, eine
      Wallet oder einen Schlüssel.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei, Dokument und `ANNAHMEN.md` Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `src/**`, `harness/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.db`
- `ops/status.sh`, `ops/access-log.sh`, `ops/own-ips.sh`, `ops/own-ips.txt`, `ops/github-yield.sh` und ihre Fixtures: unverändert
- `ops/db-report.cjs`: nur der neue Zweig für `CP_REPORT=decline`, der bestehende Bericht bleibt Zeile für Zeile
- `docs/richtung/**`, `ROADMAP.md`, `docs/kette.md` und alle bestehenden Vorschläge: nur lesen
- jedes Schreiben in der Produktion, jeder Build, Test oder Lastversuch auf dem Server, jeder Kontakt zum Betreiber eines Automatons
  (`public_post`, `third_party_mail`)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-19 Zyklus 1: Punkte 1, 2, 3, 4 gebaut: `CP_REPORT=decline` in `ops/db-report.cjs`, `ops/customer-decline.sh` mit Selftest und Fixtures aus RFC 5737, Messung gegen die Produktion (5 fremde Kunden, Kunde 1 bekam 30 Stunden 503, Vorschlag `goals/_vorschlaege/fehler-2026-11-19-1.md` mit Schwere 5). Neue Tests rot vor dem Werkzeug: `test/customer-decline.test.ts` mit den Fixtures in einem Worktree von `origin/dev` ohne Zweig und Skript, 9 von 9 failed, Selftest dort `No such file`. Prüfbefehle: Punkt 1 vitest Exit 0, `alle`, db-report-Tests 32 passed Exit 0; Punkt 2 `SELFTEST OK`, ours 4, 402 3, unmatched 3, Planspiel 9, Gegenprobe 2, Adressen 0, Fixture-Adressen 0, Exit 1, Exit 2; Punkt 3 `spaet genug`, 1, 35, `gleich`, 1, 1, 1, `stimmig`, 0, 5, Netz 5 und 0; Punkt 4 `node scripts/check.mjs` Exit 0 (2441 Tests).
- 2026-11-19 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, nach Merge von `origin/dev` (ohne neue Commits). Prüfbefehle: Punkt 1 vitest Exit 0, `alle`, db-report-Tests 32 passed Exit 0; Punkt 2 `SELFTEST OK`, ours 4, 402 3, unmatched 3, Planspiel 9, Gegenprobe 2, Adressen 0, Fixture-Adressen 0, Exit 1, Exit 2; Punkt 3 `spaet genug`, 1, 35, `gleich`, 1, 1, 1, `stimmig`, 0, 5, Netz 5 und 0; Punkt 4 `node scripts/check.mjs` Exit 0 (2441 Tests).
- 2026-11-19 Zyklus 3: Umsatz und Saldo je Kunde aus `docs/kunden/rueckgang-2026-11.md` und den Vorschlägen `fehler-2026-11-19-1.md` und `kunden-kritik-2026-11-19-1.md` entfernt (Grundregel 8, Verdict B Zyklus 2), nur Summen, Zählungen und HTTP-Status bleiben; Punkt 3 wieder offen, weil seine Zeilen `- Kunde <n>: … USD seit 05.11.` und `Rückgang:` Umsatz je Kunde verlangen, Entscheidung beim Tech Lead; Verstoß in `goals/RISIKEN.md`, Annahme in `goals/kunden/ANNAHMEN.md`. Prüfbefehle: Punkt 3 `spaet genug`, 1, 35, `ungleich` (5 von 0), Rückgang 0, Leitzahl 1, Ergebnis 1, `stimmig`, Adressen 0, Annahmen 6; Gaps B `USD seit` 0 und `DAY … USD` 0; Punkte 1, 2 unverändert; Punkt 4 `node scripts/check.mjs` Exit 0.

## Blockers
