# Kunden Goal 16: Warum der erste Sandbox-Kunde nach 10 USD aufhört

## Status
PLANNED

## Active Objective
Am 21.11.2026 hat eine fremde Runtime (Schlüssel `conway-automaton`) das Abschlusskriterium erfüllt: Startgutschrift, Sandbox Stufe
medium ab 02:27 UTC, 50 Schritte aus Credits bis zum Halt `credit` um 07:21, zwei Aufladungen über x402 (03:00 und 14:50),
Inferenz bis zur letzten Ledger-Zeile um 16:25, seitdem keine zweite Sandbox und keine Inferenz mehr (Richtungs-Check 26.11.2026,
`docs/richtung/2026-11-26.md`, Idee 5). Niemand weiß, warum sie aufhörte: Ihr Betreiber hat sie abgestellt, ihr fehlt das Geld,
oder eine Antwort des Servers hat sie gestoppt. Nach diesem Goal gibt es ein Werkzeug `ops/sandbox-customer.sh`, das je fremdem
Kunden mit Sandbox nur lesend zeigt, wie seine Sandboxes liefen und endeten, welche Ledger-Arten er wann hatte und was seine
Adressen nach dem Halt der Sandbox und nach der letzten Inferenz aufriefen, je Pfad und HTTP-Status, jede Adresse nur als Nummer und
ohne Betrag je Kunde. Mit seiner Ausgabe steht in `docs/kunden/sandbox-kunde-2026-11.md` die Ursache; ist es ein Fehler bei uns,
wird er ein Vorschlag `goals/_vorschlaege/fehler-<JJJJ-MM-TT>-<n>.md` mit Schwere 5 an das Topic `fehler`.
Leitzahl: fremde Zahlungen je Woche.
Widerlegt, wenn nach dem Halt keine Anfrage der Runtime mehr kam; dann hat ihr Betreiber sie abgestellt, und das Folge-Glied fragt
nach dem Preis der Sandbox.
MVP: Funktion, weil der einzige Kunde, der Sandbox und Inferenz zugleich bezahlt hat, nach einem Tag weg ist und niemand weiß, warum.

## Voraussetzungen
- kunden Goal 15 DONE

## Kontext für den Maker
- Ziel in einem Satz: Wir wissen gemessen, warum der einzige Kunde, der Sandbox und Inferenz bezahlt hat, nach einem Tag aufhörte,
  und beheben eine Ursache bei uns als Nächstes, statt weiter für Kunden zu bauen, die noch nicht da sind.
- Quelle: `ROADMAP.md`, Topic `kunden`, Glied 16; Richtungs-Check 26.11.2026, Idee 5 und Entscheidung. Vorgänger
  `goals/kunden/15-der-mensch-hinter-einer-runtime-ohne-guthaben-sieht-den-weg-per-karte.md` (DONE). Vorbild für Aufbau, Zuordnung
  und Prüfungen ist `goals/kunden/01-warum-der-zahlende-automaton-aufhoert.md` mit `ops/customer-decline.sh`; `docs/kette.md` hat zu
  `kunden` keinen Abschnitt, diese Datei ist die ausführliche Fassung.
- Erst messen, nichts am Dienst ändern (Topic `kunden`: jedes Glied misst zuerst nur lesend). `src/**` bleibt unverändert; ein Fehler
  bei uns wird ein Vorschlag, kein Fix in diesem Goal.
- Was der Code dazu schon sagt, als Spur für die Ursache, nicht als Befund: Eine Sandbox, die für Credits hält, steht danach auf
  `status = 'stopped'`, `stop_reason = 'credit'`. Der nächste Aufruf auf `/v1/sandboxes/<id>/…` startet sie über `ensureRunning`
  (`src/sandbox/service.ts`) nur, wenn das verfügbare Guthaben mindestens `HOLD_MC` (1000 mc) deckt, sonst 402; die Sandbox kann
  außerdem von sandboxd verschwinden (`stop_reason = 'sandboxd'`). Ob die Runtime am Pin `d8f8168` eine gehaltene Sandbox überhaupt
  wieder aufruft oder eine neue anlegt, liest der Maker im Code der Runtime nach (`harness/runtime/`, nur lesen) und nennt die
  Fundstelle im Dokument.
- Datenbankteil, in `ops/db-report.cjs` wie die Zweige `decline` und `customer-work`, gelesen mit `readonly: true`: Mit
  `CP_REPORT=sandbox-customer` gibt es statt des Berichts genau ein JSON aus; `CP_SINCE` und `CP_UNTIL` (ISO UTC, `CP_UNTIL` ohne Wert
  heißt jetzt) begrenzen das Fenster. Inhalt: `since`, `until`, `hold_mc` (aus `HOLD_MC`, heute 1000; steht der Wert im Skript als
  Zahl, nennt ein Test die Gleichheit mit `HOLD_MC` aus `src/sandbox/service.ts`), `foreign_topups_week` (Zahl der Ledger-Zeilen
  `kind = 'topup'` fremder Adressen, nicht `oursClause`, in den 7 Tagen vor `until`) und `customers`: je fremder Adresse mit
  mindestens einer Zeile in `sandboxes`, deren `created_at` im Fenster liegt, sortiert nach ihrer ersten solchen Sandbox und ab 1
  nummeriert (`n`), mit `balance_mc` und `reserved_mc` aus `wallets`, `sandboxes` (je Sandbox der Adresse mit `created_at` im Fenster,
  nach `created_at`: `{tier, status, stop_reason, steps_billed, created_at, last_step_at}`, `last_step_at` ist `created_at` der
  letzten Ledger-Zeile `kind = 'sandbox'` dieser Sandbox, `null` ohne) und `ledger` (je Ledger-Zeile der Adresse im Fenster `{at, kind}`,
  ohne Betrag). Nie eine Adresse, ein Schlüssel, eine Sandbox-ID, `ref` oder ein Betrag einer Ledger-Zeile im JSON. Ohne `CP_REPORT`
  bleibt die Ausgabe Byte für Byte wie heute.
- Werkzeug `ops/sandbox-customer.sh` (Bash mit eingebettetem Python wie `ops/customer-decline.sh`), nur lesend:
  - `ops/sandbox-customer.sh --since <ISO UTC> [--until <ISO UTC>]` in der Produktion: das JSON und das Zugriffslog auf demselben Weg
    wie `ops/customer-decline.sh` (Container `cp` über `node -` mit `-e CP_REPORT=sandbox-customer`, `ops/access-log.sh` samt
    gedrehter Dateien). Gerechnet wird auf dem code-host.
  - `--db-json <datei>` und `--log <datei>` ersetzen beide Quellen, `--selftest` prüft ohne Netz in beide Richtungen. Eigene Adressen
    wie in `ops/customer-decline.sh` (`CP_OWN_IPS=<datei>` ersetzt die Liste). Keine eigene Adresse, kein lesbares Log oder kein
    lesbares JSON ist Exit 2; eine Zeit, die keine ISO-Zeit in UTC ist, oder `--until` nicht nach `--since` ist Exit 1.
  - Zuordnung der Adressen eines Kunden mit `ops/customer_match.py` (`inference_lines`, `ok_lines`, `match_rows`), keine Kopie: die
    Zeiten der Ledger-Zeilen `inference` des Kunden gegen die Zeilen auf dem Inferenz-Pfad mit Status 200, höchstens 5 s. Eine eigene
    Adresse wird nie zugeordnet und nie gezählt.
  - Zwei Zeitpunkte je Kunde: `halt` ist `last_step_at` seiner letzten Sandbox mit `stop_reason = 'credit'` (ohne eine solche `none`),
    `last-inference` die letzte Ledger-Zeile `inference` (ohne eine solche `none`). Nach einem Zeitpunkt zählt jede Logzeile einer
    Adresse des Kunden mit `ts > Zeitpunkt + 5 s` und `ts < until`, gleich welcher Pfad. Ein Pfad wird ohne Query gezählt, das
    Segment nach `/v1/sandboxes/` wird `{id}`, ein Segment der Form `0x` und 40 Hex-Zeichen wird `{address}`.
  - Ausgabe, Englisch, je Zeile, in dieser Reihenfolge, Zeiten ISO in UTC ohne Millisekunden:
    `SANDBOX CUSTOMERS since <t> until <u>: <k> foreign customers with a sandbox`;
    je Kunde `CUSTOMER <n>: first sandbox <ISO>, sandboxes <s>, ips <m>, balance <zero|below hold|covers hold>` (verfügbar ist
    `balance_mc - reserved_mc`; `zero` bei höchstens 0, `below hold` unter `hold_mc`, sonst `covers hold`);
    je Sandbox `SANDBOX <n>.<i>: tier <tier>, created <ISO>, status <status>, stop <stop_reason|->, steps <steps_billed>, last step <ISO|->`;
    `LEDGER <n>: <kind> <zahl>[, <kind> <zahl>…], last inference <ISO|none>` mit den Arten alphabetisch;
    je Zeitpunkt `AFTER <n> halt <ISO|none>: <r> requests` und `AFTER <n> last-inference <ISO|none>: <r> requests`, darunter je
    Methode, Pfad und Status, sortiert nach dem ersten Auftreten, `PATH <n> <halt|last-inference> <METHOD> <pfad> <status> x<zahl>`;
    `LAST <n>: <ISO> <METHOD> <pfad> <status>` für die letzte Logzeile einer Adresse des Kunden im Fenster, ohne eine solche
    `LAST <n>: none`;
    `QUIET <n>: <h> hours without a request before <u>` (volle Stunden zwischen dieser Zeile und `until`, abgerundet; ohne Logzeile ab
    `first sandbox`);
    zuletzt `WEEK: <w> foreign payments in the 7 days before <u>` aus `foreign_topups_week`.
    Keine Adresse, keine Wallet, kein Schlüssel, keine Sandbox-ID und kein Betrag in der Ausgabe.
- Fixtures, nur Adressen aus RFC 5737, ohne echte Wallet: `ops/fixtures/sandbox-customer-db.json`, `ops/fixtures/sandbox-customer.log`
  (Caddy-JSON wie `ops/fixtures/customer-decline.log`) und `ops/fixtures/sandbox-customer-own-ips.txt` mit `203.0.113.99`. Planspiel
  im Fenster `--since 2026-11-21T00:00:00Z --until 2026-11-22T00:00:00Z`, `hold_mc` 1000, `foreign_topups_week` 1: Kunde 1 hat
  `balance_mc` 500, `reserved_mc` 0, eine Sandbox (`medium`, `stopped`, `credit`, `steps_billed` 3, `created_at` 02:27:00,
  `last_step_at` 02:45:00) und die Ledger-Zeilen `grant` 02:13:00, `inference` 02:20:00, `sandbox` 02:33:00, 02:39:00 und 02:45:00,
  `inference` 02:50:00, `topup` 03:00:00 und `inference` 03:10:00, alle am 2026-11-21. Im Log ruft `198.51.100.7` am 2026-11-21
  `POST /v1/chat/completions` mit 200 um 02:20:01, 02:50:02 und 03:10:01, `POST /v1/sandboxes/sbx-a1/exec` mit 402 um 02:50:30 und
  03:20:00, `POST /v1/chat/completions` mit 402 um 03:30:00 und `GET /v1/credits/balance` mit 200 um 03:31:00. Die eigene Adresse
  `203.0.113.99` ruft `POST /v1/chat/completions` mit 200 um 02:20:00.5 (näher an der ersten Zeile als `198.51.100.7`) und
  `POST /v1/sandboxes/sbx-own/exec` mit 402 um 03:00:00. Die fremde Adresse `198.51.100.50` ohne Sandbox bekommt um 04:00:00 eine 401
  auf `GET /v1/sandboxes` und zählt nirgends. Erwartet:
  `SANDBOX CUSTOMERS since 2026-11-21T00:00:00Z until 2026-11-22T00:00:00Z: 1 foreign customers with a sandbox`,
  `CUSTOMER 1: first sandbox 2026-11-21T02:27:00Z, sandboxes 1, ips 1, balance below hold`,
  `SANDBOX 1.1: tier medium, created 2026-11-21T02:27:00Z, status stopped, stop credit, steps 3, last step 2026-11-21T02:45:00Z`,
  `LEDGER 1: grant 1, inference 3, sandbox 3, topup 1, last inference 2026-11-21T03:10:00Z`,
  `AFTER 1 halt 2026-11-21T02:45:00Z: 6 requests`,
  `PATH 1 halt POST /v1/chat/completions 200 x2`, `PATH 1 halt POST /v1/sandboxes/{id}/exec 402 x2`,
  `PATH 1 halt POST /v1/chat/completions 402 x1`, `PATH 1 halt GET /v1/credits/balance 200 x1`,
  `AFTER 1 last-inference 2026-11-21T03:10:00Z: 3 requests`,
  `PATH 1 last-inference POST /v1/sandboxes/{id}/exec 402 x1`, `PATH 1 last-inference POST /v1/chat/completions 402 x1`,
  `PATH 1 last-inference GET /v1/credits/balance 200 x1`,
  `LAST 1: 2026-11-21T03:31:00Z GET /v1/credits/balance 200`,
  `QUIET 1: 20 hours without a request before 2026-11-22T00:00:00Z` und
  `WEEK: 1 foreign payments in the 7 days before 2026-11-22T00:00:00Z`.
  Gegenprobe mit einer eigenen Liste ohne `203.0.113.99`: die eigene Adresse wird der ersten Zeile zugeordnet, also `ips 2` und
  `AFTER 1 halt 2026-11-21T02:45:00Z: 7 requests`. Gegenprobe mit `balance_mc` 1000: `balance covers hold`.
- Tests: `test/sandbox-customer.test.ts` baut wie `test/customer-decline.test.ts` eine Datenbank mit `openDb` und fährt
  `ops/db-report.cjs` mit `CP_REPORT=sandbox-customer`: eine eigene Adresse aus `OURS` (etwa `live-sandbox`) mit Sandbox steht nie in
  `customers` (Testname enthält `never lists our own`), jede Sandbox eines Fremden im Fenster steht in `sandboxes` und keine außerhalb
  (`keeps every sandbox`), `last_step_at` ist die letzte Zeile `sandbox` dieser Sandbox und nicht die einer anderen (`last step`), das
  JSON trägt keine Adresse, keine Sandbox-ID und kein `delta_mc` (`no address`), ohne `CP_REPORT` gibt es kein Feld `customers`
  (`default report unchanged`). Dazu Fälle für `ops/sandbox-customer.sh` gegen die Fixtures (Planspiel, beide Gegenproben, Testnamen
  enthalten `halt`, `ours` und `covers hold`). Der Selbsttest des Skripts hat dieselben Fälle, seine Zeilen `ok …` nennen `halt`,
  `ours` und `hold`; letzte Zeile `SELFTEST OK …` oder `SELFTEST FAILED …`. Jeder neue Test lief einmal gegen `origin/dev` und war
  rot; die Zeile im Progress Log nennt, womit.
- Messung, nur lesend gegen die Produktion: `set -a; . ~/.config/control-plane/loop.env; set +a`, dann
  `bash ops/sandbox-customer.sh --since 2026-11-21T00:00:00Z`. Die vollständige Ausgabe steht ungekürzt als Codeblock in
  `docs/kunden/sandbox-kunde-2026-11.md`, darüber die Zeile mit dem Befehl. Fehlt der Kunde vom 21.11. in der Ausgabe, stimmt das
  Werkzeug nicht; das Fenster wird nicht verschoben, bis er erscheint.
- Ursache des Kunden vom 21.11., ein Wort aus vier, belegt mit Zeilen der Ausgabe: `Fehler bei uns` (nach dem Halt oder nach der
  letzten Inferenz ein 4xx außer 402 oder ein 5xx auf einem Pfad, den die Runtime braucht, oder eine 402, obwohl die Zeile `CUSTOMER`
  zur selben Zeit `covers hold` erlaubte, und danach keine Anfrage mehr), `kein Geld` (402 auf Inferenz oder Sandbox, weil das
  Guthaben die nächste Anfrage nicht deckte, und keine Aufladung danach), `beim Betreiber` (nach dem Halt keine Anfrage mehr), sonst
  `offen` mit dem, was fehlt. Bei `kein Geld` nennt das Dokument die Stelle im Code der Runtime am Pin, an der sie über eine Aufladung
  entscheidet; ob ihre Wallet noch USDC hält, steht höchstens als „über“ oder „unter 5 USD“ aus öffentlichen Daten, nie als Betrag oder
  Adresse.
- `docs/kunden/sandbox-kunde-2026-11.md`, Deutsch, je eine Zeile ab Spalte 0 außerhalb der Codeblöcke:
  `Gemessen: <JJJJ-MM-TTTHH:MM:SSZ>`;
  `$ bash ops/sandbox-customer.sh --since 2026-11-21T00:00:00Z`, darunter der Codeblock mit der Ausgabe;
  `Leitzahl: <w> fremde Zahlungen in den 7 Tagen bis <JJJJ-MM-TT>` aus der Zeile `WEEK`;
  `Runtime: <Fundstelle am Pin d8f8168>` mit Datei und Zeile, wo die Runtime eine gehaltene Sandbox wieder aufruft oder eine neue
  anlegt (oder dass sie es nie tut);
  je Zeile `CUSTOMER` der Ausgabe genau eine Zeile `- Kunde <n>: Sandbox <tier>, <s> Schritte, Halt <Grund|keiner>, letzte Anfrage
  <JJJJ-MM-TT>, Ursache: <Wort>, weil <Beleg>`;
  genau eine Zeile `Ergebnis: Fehler bei uns, Vorschlag goals/_vorschlaege/fehler-<JJJJ-MM-TT>-<n>.md`, wenn ein Kunde `Fehler bei
  uns` hat, sonst `Ergebnis: kein Fehler bei uns, weil …`;
  genau eine Zeile `Widerlegt: ja, weil nach dem Halt keine Anfrage mehr kam`, wenn die Zeile `AFTER 1 halt` 0 requests nennt, sonst
  `Widerlegt: nein, weil <r> Anfragen nach dem Halt kamen`.
  Kein Betrag je Kunde, keine Adresse, keine Wallet, keine Sandbox-ID, kein Name (Grundregel 8); Summen sind in Ordnung.
- Bei `Fehler bei uns`: der Vorschlag im Format aus dem Skill (`Schwere: 5`, `Goal: kunden 16`, `Befund:`, `Beleg:` mit Befehl und
  Ausgabe, `Empfehlung:`), mit Zeitpunkt in UTC, Pfad, Status und wie oft, ohne Adresse (`LOOP.md`, Fehler echter Nutzer).
- `goals/kunden/ANNAHMEN.md`: Zeilen `- <Datum>, kunden 16: …`, mindestens zur Wahl von `last_step_at` als Zeitpunkt des Halts, zum
  Abstand von 5 s nach einem Zeitpunkt und zur Grenze zwischen `kein Geld` und `Fehler bei uns`.
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout; `grep` in den Prüfungen ist
  `/usr/bin/grep`, wenn die Shell eine andere Hülle davorsetzt (`docs/loop-fallen.md`). Kein Build, kein Test, kein Aufruf eines
  Endpunkts der Produktion außer dem Lesen über `ops/sandbox-customer.sh`; keine Sandbox, keine Runtime und kein Kauf zum Testen.

## Done Condition
- [x] `ops/db-report.cjs` gibt mit `CP_REPORT=sandbox-customer` je fremdem Kunden mit Sandbox im Fenster seine Sandboxes, die Zeit
      ihres letzten Schritts und seine Ledger-Arten ohne Adresse, Sandbox-ID und Betrag aus, ohne `CP_REPORT` unverändert; in beide
      Richtungen bewiesen.
      MVP: Funktion, weil ohne den Verlauf der Sandbox niemand sagen kann, wann und warum sie hielt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandbox-customer.test.ts` muss Exit-Code 0 haben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandbox-customer.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed").map(a=>a.title);console.log([/never lists our own/,/keeps every sandbox/,/last step/,/no address/,/default report unchanged/,/halt/,/ours/,/covers hold/].every(r=>t.some(x=>r.test(x)))?"alle":"fehlt")})'` muss `alle` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/db-report.test.ts test/db-report-no-duplicate-keys.test.ts test/customer-decline.test.ts` muss Exit-Code 0 haben.
- [x] `ops/sandbox-customer.sh` ordnet die Anfragen im Zugriffslog dem Kunden zu und zeigt je Pfad und Status, was er nach dem Halt
      und nach der letzten Inferenz aufrief, nie eine eigene Adresse und ohne Adresse in der Ausgabe; in beide Richtungen bewiesen.
      MVP: Funktion, weil erst die Anfragen nach dem Halt zeigen, ob eine Antwort des Servers die Runtime stoppte.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/sandbox-customer.sh --selftest | tail -1` muss mit `SELFTEST OK` beginnen.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/sandbox-customer.sh --selftest | grep -cE "^ok .*halt"` muss mindestens 1 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/sandbox-customer.sh --selftest | grep -cE "^ok .*ours"` muss mindestens 1 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/sandbox-customer.sh --selftest | grep -cE "^ok .*hold"` muss mindestens 1 ausgeben.
      Prüfung: `CP_OWN_IPS=ops/fixtures/sandbox-customer-own-ips.txt PATH=/usr/bin:$PATH bash ops/sandbox-customer.sh --db-json ops/fixtures/sandbox-customer-db.json --log ops/fixtures/sandbox-customer.log --since 2026-11-21T00:00:00Z --until 2026-11-22T00:00:00Z | grep -cxF -e "SANDBOX CUSTOMERS since 2026-11-21T00:00:00Z until 2026-11-22T00:00:00Z: 1 foreign customers with a sandbox" -e "CUSTOMER 1: first sandbox 2026-11-21T02:27:00Z, sandboxes 1, ips 1, balance below hold" -e "SANDBOX 1.1: tier medium, created 2026-11-21T02:27:00Z, status stopped, stop credit, steps 3, last step 2026-11-21T02:45:00Z" -e "LEDGER 1: grant 1, inference 3, sandbox 3, topup 1, last inference 2026-11-21T03:10:00Z" -e "AFTER 1 halt 2026-11-21T02:45:00Z: 6 requests" -e "PATH 1 halt POST /v1/chat/completions 200 x2" -e "PATH 1 halt POST /v1/sandboxes/{id}/exec 402 x2" -e "PATH 1 halt POST /v1/chat/completions 402 x1" -e "PATH 1 halt GET /v1/credits/balance 200 x1" -e "AFTER 1 last-inference 2026-11-21T03:10:00Z: 3 requests" -e "PATH 1 last-inference POST /v1/sandboxes/{id}/exec 402 x1" -e "PATH 1 last-inference POST /v1/chat/completions 402 x1" -e "PATH 1 last-inference GET /v1/credits/balance 200 x1" -e "LAST 1: 2026-11-21T03:31:00Z GET /v1/credits/balance 200" -e "QUIET 1: 20 hours without a request before 2026-11-22T00:00:00Z" -e "WEEK: 1 foreign payments in the 7 days before 2026-11-22T00:00:00Z"` muss 16 ausgeben.
      Prüfung: `CP_OWN_IPS=ops/fixtures/sandbox-customer-own-ips.txt PATH=/usr/bin:$PATH bash ops/sandbox-customer.sh --db-json ops/fixtures/sandbox-customer-db.json --log ops/fixtures/sandbox-customer.log --since 2026-11-21T00:00:00Z --until 2026-11-22T00:00:00Z | grep -cE "^PATH 1 halt "` muss 4 ausgeben.
      Prüfung: `o=$(mktemp); echo "192.0.2.254" >"$o"; CP_OWN_IPS="$o" PATH=/usr/bin:$PATH bash ops/sandbox-customer.sh --db-json ops/fixtures/sandbox-customer-db.json --log ops/fixtures/sandbox-customer.log --since 2026-11-21T00:00:00Z --until 2026-11-22T00:00:00Z | grep -cE "^CUSTOMER 1: .*, ips 2, |^AFTER 1 halt 2026-11-21T02:45:00Z: 7 requests$"` muss 2 ausgeben.
      Prüfung: `j=$(mktemp); node -e 'const f=require("fs");const d=JSON.parse(f.readFileSync(process.argv[1],"utf8"));d.customers[0].balance_mc=1000;f.writeFileSync(process.argv[2],JSON.stringify(d))' ops/fixtures/sandbox-customer-db.json "$j"; CP_OWN_IPS=ops/fixtures/sandbox-customer-own-ips.txt PATH=/usr/bin:$PATH bash ops/sandbox-customer.sh --db-json "$j" --log ops/fixtures/sandbox-customer.log --since 2026-11-21T00:00:00Z --until 2026-11-22T00:00:00Z | grep -cE "^CUSTOMER 1: .*, balance covers hold$"` muss 1 ausgeben.
      Prüfung: `CP_OWN_IPS=ops/fixtures/sandbox-customer-own-ips.txt PATH=/usr/bin:$PATH bash ops/sandbox-customer.sh --db-json ops/fixtures/sandbox-customer-db.json --log ops/fixtures/sandbox-customer.log --since 2026-11-21T00:00:00Z --until 2026-11-22T00:00:00Z | grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}|sbx-|[0-9]+\.[0-9]{2} USD"` muss 0 ausgeben.
      Prüfung: `grep -ohE '"(remote_ip|client_ip)": ?"[^"]*"' ops/fixtures/sandbox-customer.log | grep -cvE '"(192\.0\.2|198\.51\.100|203\.0\.113)\.[0-9]+"'` muss 0 ausgeben.
      Prüfung: `CP_OWN_IPS=ops/fixtures/sandbox-customer-own-ips.txt PATH=/usr/bin:$PATH bash ops/sandbox-customer.sh --db-json ops/fixtures/sandbox-customer-db.json --log ops/fixtures/sandbox-customer.log --since 2026-11-21T00:00:00Z --until 2026-11-21T00:00:00Z >/dev/null 2>&1; echo $?` muss `1` ausgeben.
      Prüfung: `CP_OWN_IPS=ops/fixtures/sandbox-customer-own-ips.txt PATH=/usr/bin:$PATH bash ops/sandbox-customer.sh --db-json ops/fixtures/sandbox-customer-db.json --log ops/fixtures/no-such.log --since 2026-11-21T00:00:00Z >/dev/null 2>&1; echo $?` muss `2` ausgeben.
- [x] Die Ursache steht für den Kunden vom 21.11. gemessen in `docs/kunden/sandbox-kunde-2026-11.md`, mit Befehl, Ausgabe, Fundstelle
      in der Runtime, Ergebnis und der Zeile `Widerlegt:`, ohne Adresse und ohne Betrag je Kunde; liegt sie bei uns, gibt es den
      Vorschlag mit Schwere 5.
      MVP: Funktion, weil erst das Wort mit Beleg sagt, ob das nächste Glied einen Fehler bei uns behebt oder nach dem Preis fragt.
      Prüfung: `awk '/^Gemessen: /{print ($2 >= "2026-11-26T00:00:00Z") ? "spaet genug" : "zu frueh"}' docs/kunden/sandbox-kunde-2026-11.md` muss genau `spaet genug` ausgeben.
      Prüfung: `/usr/bin/grep -cxF '$ bash ops/sandbox-customer.sh --since 2026-11-21T00:00:00Z' docs/kunden/sandbox-kunde-2026-11.md` muss 1 ausgeben.
      Prüfung: `/usr/bin/grep -cE "^SANDBOX [0-9]+\.[0-9]+: tier medium, created 2026-11-21T02:2[0-9]:[0-9]{2}Z, status [a-z]+, stop credit, " docs/kunden/sandbox-kunde-2026-11.md` muss mindestens 1 ausgeben.
      Prüfung: `d=docs/kunden/sandbox-kunde-2026-11.md; c=$(/usr/bin/grep -cE "^CUSTOMER [0-9]+: first sandbox " "$d"); k=$(/usr/bin/grep -cE "^- Kunde [0-9]+: Sandbox (small|medium), [0-9]+ Schritte, Halt [a-z]+, letzte Anfrage 2026-[0-9]{2}-[0-9]{2}, Ursache: (Fehler bei uns|kein Geld|beim Betreiber|offen), weil " "$d"); [ "$c" -ge 1 ] && [ "$c" = "$k" ] && echo gleich || echo ungleich` muss `gleich` ausgeben.
      Prüfung: `/usr/bin/grep -cE "^Leitzahl: [0-9]+ fremde Zahlungen in den 7 Tagen bis 2026-[0-9]{2}-[0-9]{2}$" docs/kunden/sandbox-kunde-2026-11.md` muss 1 ausgeben.
      Prüfung: `/usr/bin/grep -cE "^Runtime: .*harness/runtime/[^ ]+:[0-9]+" docs/kunden/sandbox-kunde-2026-11.md` muss mindestens 1 ausgeben.
      Prüfung: `d=docs/kunden/sandbox-kunde-2026-11.md; r=$(sed -nE 's/^AFTER 1 halt [^ ]+: ([0-9]+) requests$/\1/p' "$d"); if [ "$r" = "0" ]; then /usr/bin/grep -qx "Widerlegt: ja, weil nach dem Halt keine Anfrage mehr kam" "$d" && echo stimmig || echo unstimmig; elif [ -n "$r" ]; then /usr/bin/grep -qx "Widerlegt: nein, weil $r Anfragen nach dem Halt kamen" "$d" && echo stimmig || echo unstimmig; else echo unstimmig; fi` muss genau `stimmig` ausgeben.
      Prüfung: `d=docs/kunden/sandbox-kunde-2026-11.md; if /usr/bin/grep -q "Ursache: Fehler bei uns" "$d"; then p=$(sed -nE 's/^Ergebnis: Fehler bei uns, Vorschlag (goals\/_vorschlaege\/fehler-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]+\.md)$/\1/p' "$d"); [ -n "$p" ] && head -1 "$p" | /usr/bin/grep -qx "Schwere: 5" && echo stimmig || echo unstimmig; else /usr/bin/grep -qE "^Ergebnis: kein Fehler bei uns, weil " "$d" && echo stimmig || echo unstimmig; fi` muss genau `stimmig` ausgeben.
      Prüfung: `cat docs/kunden/sandbox-kunde-2026-11.md goals/kunden/ANNAHMEN.md | /usr/bin/grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}|sbx-[A-Za-z0-9]"` muss 0 ausgeben.
      Prüfung: `/usr/bin/grep -cE "^- Kunde [0-9]+:.*[0-9][.,][0-9]{2} USD|^(CUSTOMER|SANDBOX|LEDGER|AFTER|PATH|LAST) .*[0-9]\.[0-9]{2} USD" docs/kunden/sandbox-kunde-2026-11.md` muss 0 ausgeben.
      Prüfung (Netz): `set -a; . ~/.config/control-plane/loop.env; set +a; bash ops/sandbox-customer.sh --since 2026-11-21T00:00:00Z --until 2026-11-22T00:00:00Z | /usr/bin/grep -cE "^SANDBOX [0-9]+\.[0-9]+: tier medium, created 2026-11-21T02:2[0-9]:[0-9]{2}Z, .*stop credit, "` muss mindestens 1 ausgeben.
      Prüfung (Netz): `set -a; . ~/.config/control-plane/loop.env; set +a; bash ops/sandbox-customer.sh --since 2026-11-21T00:00:00Z | /usr/bin/grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}"` muss 0 ausgeben.
- [x] Der Dienst ist unverändert, und die Annahmen stehen fest.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- src ops test harness deploy scripts | /usr/bin/grep -cvxE "ops/db-report.cjs|ops/sandbox-customer.sh|ops/fixtures/sandbox-customer-db.json|ops/fixtures/sandbox-customer.log|ops/fixtures/sandbox-customer-own-ips.txt|test/sandbox-customer.test.ts"` muss 0 ausgeben.
      Prüfung: `/usr/bin/grep -cE "^- [0-9-]+, kunden 16: " goals/kunden/ANNAHMEN.md` muss mindestens 3 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [x] Jede Zahl im Abschnitt `## Befund` von `docs/kunden/sandbox-kunde-2026-11.md`, die nicht im Codeblock der Ausgabe steht
      (verfügbares Guthaben gegen die Reservierung einer Anfrage mit 4096 Tokens, Tokens der letzten 30 Prompts, Zeiten der Salven
      und der letzten Abfrage des Guthabens, Wallet unter 5 USD), steht mit dem nur lesenden Befehl, aus dem sie stammt, als eigene
      Zeile `$ <Befehl>` und darunter seiner Ausgabe in einem Codeblock, ohne Adresse, Wallet, Sandbox-ID oder Betrag je Kunde; eine
      Adresse steht nie im Befehl, er liest sie selbst im Container (Grundregel 3).
      MVP: Funktion, weil das Wort `kein Geld` statt `Fehler bei uns` genau an diesen Zahlen hängt und sie heute niemand nachfahren kann.
      Prüfung: `/usr/bin/grep -cE '^\$ ' docs/kunden/sandbox-kunde-2026-11.md` muss mindestens 5 ausgeben.
      Prüfung: `/usr/bin/grep -cE '^\$ .*(reserve|costMc|requiredMc)' docs/kunden/sandbox-kunde-2026-11.md` muss mindestens 1 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Kein Aufruf in der Produktion, der etwas anlegt oder bucht; gelesen wird nur über `ops/sandbox-customer.sh` und die Werkzeuge,
      die es ruft.
- [ ] Jeder neue Test und jede neue Selbsttestzeile war vor der Änderung rot; die Zeile im Progress Log nennt, womit.
- [ ] Ohne `CP_REPORT` gibt `ops/db-report.cjs` dasselbe aus wie auf `origin/dev`; `ops/status.sh` und `ops/customer-decline.sh`
      sind unverändert.
- [ ] Die Ausgabe im Codeblock ist genau die des Werkzeugs, ungekürzt und unverändert.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei, Dokument, Vorschlag und `ANNAHMEN.md` Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `src/**`, `harness/**` (nur lesen), `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.db`
- `ops/**` außer `ops/db-report.cjs` (nur der neue Zweig für `CP_REPORT=sandbox-customer`, der bestehende Bericht und die anderen
  Zweige bleiben Zeile für Zeile), dem neuen `ops/sandbox-customer.sh` und seinen drei neuen Fixtures: unverändert, auch
  `ops/customer_match.py`, `ops/customer-decline.sh`, `ops/access-log.sh`, `ops/own-ips.sh` und `ops/own-ips.txt`
- `test/**` außer dem neuen `test/sandbox-customer.test.ts`: unverändert
- `ROADMAP.md`, `docs/kette.md`, `docs/richtung/**`, die übrigen Dateien unter `docs/kunden/` und alle bestehenden Vorschläge: nur
  lesen
- jedes Schreiben in der Produktion, jeder Build, Test oder Lastversuch auf dem Server, jede Sandbox, Runtime oder Aufladung zum
  Testen, jede Wallet-Bewegung, jeder Kontakt zum Betreiber eines Automatons (`third_party_mail`)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-26 Zyklus 1: Punkte 1, 2, 3, 4, 5 gebaut: Zweig `CP_REPORT=sandbox-customer` in `ops/db-report.cjs`, `ops/sandbox-customer.sh` mit Selbsttest und drei Fixtures, `test/sandbox-customer.test.ts` (13 Fälle), Messung gegen die Produktion (2026-11-26T19:31:37Z) mit Ergebnis `kein Geld` in `docs/kunden/sandbox-kunde-2026-11.md`, Vorschlag `goals/_vorschlaege/fehler-2026-11-26-1.md` (Schwere 5, 404 und 501 nach dem Halt, nicht die Ursache), fünf Annahmen. Rot vorher: `test/sandbox-customer.test.ts` mit seinen Fixtures in einem Worktree auf `origin/dev` 1897fa6 13 von 13 rot; der Selbsttest wurde mit gepflanzten Fehlern rot (eigene Adresse nicht ausgeschlossen: `ours` und `halt` FAIL; Abstand 0 s: `last-inference` FAIL; Grenze `<=` statt `<`: `hold` FAIL). Prüfbefehle: P1 vitest sandbox-customer Exit 0, Titel `alle`, db-report, no-duplicate-keys und customer-decline 41 von 41 Exit 0; P2 Selbsttest `SELFTEST OK`, `ok … halt` 3, `ours` 5, `hold` 3, Planspiel 16, `PATH 1 halt` 4, Gegenprobe eigene Liste 2, `covers hold` 1, Adressen 0, Fixture-Adressen 0, leeres Fenster Exit 1, fehlendes Log Exit 2; P3 `spaet genug`, Befehlszeile 1, SANDBOX-Zeile 1, `gleich`, Leitzahl 1, Runtime 2, Widerlegt `stimmig`, Ergebnis `stimmig`, Adressen 0, Beträge 0, Netz SANDBOX 1, Netz Adressen 0; P4 fremde Dateien 0, Annahmen 5; P5 `check` grün in 173 s.
- 2026-11-26 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, `dev` war schon enthalten, alle Prüfbefehle am Kopf 9d41e0b neu gefahren. Prüfbefehle: P1 vitest sandbox-customer Exit 0, Titel `alle`, db-report, no-duplicate-keys und customer-decline Exit 0; P2 `SELFTEST OK`, `halt` 3, `ours` 5, `hold` 3, Planspiel 16, `PATH 1 halt` 4, Gegenprobe eigene Liste 2, `covers hold` 1, Adressen 0, Fixture-Adressen 0, leeres Fenster Exit 1, fehlendes Log Exit 2; P3 `spaet genug`, 1, 1, `gleich`, 1, 2, `stimmig`, `stimmig`, 0, 0, Netz SANDBOX 1, Netz Adressen 0; P4 0, 5; P5 `check` grün in 163 s; Job `e2e` am Kopf pass (10m31s).
- 2026-11-26 Zyklus 3: Punkt 6 gebaut: In `docs/kunden/sandbox-kunde-2026-11.md` steht unter `### Befehle zu den Zahlen im Befund` je Zahl des Befunds ihr nur lesender Befehl mit Ausgabe (Tokens der letzten 30 Prompts, Guthaben gegen `costMc` mit 4096 und als Gegenprobe 0 Tokens, letzte Ledger-Zeile mit Gegenprobe, Salven der 402, Abfragen des Guthabens, Wallet unter 5 USD mit Gegenprobe `totalSupply`), gefahren 2026-11-26T20:04:12Z, ohne Adresse in Befehl und Ausgabe; jeder der sechs Befehle wurde danach so, wie er im Dokument steht, noch einmal gefahren und gab dieselbe Ausgabe. Rot vorher: am Kopf `eb12c4f` gaben die Prüfungen 1 und 0 aus. Prüfbefehle: P6 `$`-Zeilen 7, `costMc`-Zeile 1; P3 unverändert grün (`spaet genug`, 1, 1, `gleich`, 1, 2, `stimmig`, `stimmig`, 0, 0); P4 0; P5 `check` grün in 146 s.

## Blockers
