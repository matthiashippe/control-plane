# Kunden Goal 02: Wer bei Conway noch zahlt, und wie er uns findet

## Status
PLANNED

## Active Objective
An Conways Zahlungsadresse gingen in den 30 Tagen bis 18.11.2026 noch 215 USDC von 21 Wallets, 16 davon haben aufgeladen
(`conway-money/metrics.ndjson`, `docs/richtung/2026-11-19.md`), während bei uns in derselben Woche eine fremde Zahlung über 5,01 USD
ankam. Niemand weiß, wie viele dieser Wallets uns schon kennen, wie viele bei beiden zahlen und über welchen öffentlichen Weg ihre
Betreiber überhaupt zu erreichen sind. Nach diesem Goal gibt es ein Werkzeug `ops/conway-payers.sh`, das die Conway-Zahler der
letzten 30 Tage gegen unsere Wallets und Zahlungen abgleicht und nur Zählungen ausgibt, und `docs/kunden/conway-zahler.md` nennt mit
seiner Ausgabe, wie viele Conway-Zahler uns kennen und bei uns zahlen, dazu je öffentlichem Weg, den die Runtime am Pin `d8f8168`
schreibt, die Fundstelle im Code und die Zahl erreichbarer Betreiber.
Leitzahl: Conway-Zahler, die bei uns zahlen (heute ungemessen).
Widerlegt, wenn kein Weg einen Betreiber erreicht; dann bleibt der Kanal bei Issues und dem Paket aus der Vorlage an Matthias, und das
steht so da.
MVP: Funktion, weil 16 Wallets an einen Dienst zahlen, der mit 500 antwortet.

## Voraussetzungen
- kunden Goal 01 DONE

## Kontext für den Maker
- Ziel: Wir wissen gemessen, wie viele der Automatons, die heute noch an Conway zahlen, uns schon kennen oder bei uns zahlen, und über
  welchen Weg wir die übrigen Betreiber erreichen, damit das nächste Glied genau diese zahlende Nachfrage zu uns holt, statt für
  Kunden zu bauen, die noch nicht da sind.
- Quelle der Kette: `ROADMAP.md` Zeile 14 (Topic `kunden`, Glied 02), Richtungs-Check 19.11.2026 (PRO-25477,
  `docs/richtung/2026-11-19.md`, Idee 1 „Zielgruppe: die Conway-Zahler statt neuer Produkte“ und Entscheidung 2 an Matthias: das
  Paket der Runtime erst nach `kunden` 02). `docs/kette.md` hat zu `kunden` keinen Abschnitt; diese Datei ist die ausführliche Fassung.
- Grundregel 8 wie in kunden 01 (`goals/kunden/ANNAHMEN.md`, Zeilen 6 bis 8): Im Repo stehen nur Zählungen und Summen über alle
  Wallets. Nie eine Adresse, ein Hash einer Adresse, ein Betrag, ein Zeitpunkt oder ein Tag einer einzelnen Conway-Überweisung oder
  Zahlung, nie eine Kundennummer aus `docs/kunden/rueckgang-2026-11.md`, weil jede dieser Angaben zusammen mit den öffentlichen
  USDC-Überweisungen auf Base eine Wallet kenntlich macht.
- Datenbankteil, in `ops/db-report.cjs` neben dem Zweig `CP_REPORT=decline` und genauso gebaut (synchron, gelesen mit
  `readonly: true`, danach `process.exit`): Mit `CP_REPORT=wallets` gibt es genau ein JSON aus:
  `ours`, die SHA-256 (hex, über die Adresse in Kleinbuchstaben) jeder Adresse, die `oursClause` als eigene führt; `wallets`, je
  fremder Adresse aus `wallets.address` oder aus `payments.from_address` mit `status = 'settled'` genau ein Eintrag
  `{h, wallet, inference_rows, paid, last_paid_at}` (`h` die SHA-256 wie oben, `wallet` ob sie in `wallets` steht, `inference_rows` die
  Zahl ihrer Ledger-Zeilen `kind = 'inference'`, `paid` die Zahl ihrer Zahlungen mit `status = 'settled'` als `from_address`,
  `last_paid_at` das ISO von `settled_at` der letzten, `null` ohne). Nie eine Adresse, ein Schlüssel, `ref` oder `tx_hash` im JSON.
  Ohne `CP_REPORT` bleibt die Ausgabe Byte für Byte wie heute, mit `CP_REPORT=decline` ebenso.
- Werkzeug `ops/conway-payers.sh` (Bash mit eingebettetem Python oder Node, wie `ops/customer-decline.sh`), nur lesend:
  - `ops/conway-payers.sh` ohne Quelle-Flag in der Produktion: die Überweisungen aus der Basisdatei
    `docs/research/data/2026-09-19-conway-payto-transfers.csv` im Repo und aus `/opt/control-plane/conway-money/delta.csv` auf dem
    Server (gelesen per `ssh … cat`, nichts dort geschrieben), das JSON über
    `ssh … 'cd /opt/control-plane/repo/deploy && docker compose -f docker-compose.prod.yml exec -T -e CP_REPORT=wallets cp node -' < ops/db-report.cjs`
    (Schlüssel und Host wie in `ops/customer-decline.sh`). Gerechnet wird auf dem code-host.
  - `--transfers <csv>` (mehrfach erlaubt, Spalten wie die Basisdatei, Kopfzeile wahlweise) und `--db-json <datei>` ersetzen die
    beiden Quellen, `--selftest` prüft ohne Netz in beide Richtungen. Eine unlesbare Datei oder ein unlesbares JSON ist Exit 2, ein
    unbekanntes Argument Exit 1.
  - Fenster und Schwelle genau wie `docs/research/data/conway-money-metrics.py`, damit die Zahlen zur Reihe passen: 30 Tage vor der
    neuesten Überweisung in den Daten, eine Aufladung ist eine Überweisung ab 5 USDC (`TOPUP_MIN_USDC`), doppelte Zeilen über
    `tx_hash`, `from` und `usdc` einmal gezählt, Adressen in Kleinbuchstaben. Eine Wallet, deren SHA-256 in `ours` steht, zählt
    nirgends mit und erscheint nur in `ours left out`.
  - Ausgabe, Englisch, genau diese drei Zeilen, USDC mit zwei Nachkommastellen:
    `PAYERS window <ISO von> to <ISO bis>: <w> wallets, <t> topped up, <usdc> USDC, <o> ours left out`;
    `OVERLAP topped up: <t> wallets, <a> known here, <b> with inference here, <c> paid here, <d> paid Conway after their last payment here`;
    `OVERLAP all: <w> wallets, <a> known here, <b> with inference here, <c> paid here, <d> paid Conway after their last payment here`.
    `known here` heißt: ihr Hash steht in `wallets`; `paid Conway after their last payment here` heißt: ihre neueste Überweisung an
    Conway liegt nach `last_paid_at`. Keine Adresse, kein Hash, kein Betrag und kein Zeitpunkt einer einzelnen Wallet in der Ausgabe.
- Fixtures, nur erfundene Adressen der Form `0x` mit 36 Nullen und vier Hex-Zeichen:
  `ops/fixtures/conway-payers-transfers.csv` und `ops/fixtures/conway-payers-db.json`. Planspiel (`a1` steht für
  `0x00000000000000000000000000000000000000a1`): `a1` überweist 5 USDC am 2026-11-10T10:00:00Z und 5 USDC am 2026-11-18T12:00:00Z,
  `a2` 5 USDC am 2026-11-01T09:00:00Z, `a3` 25 USDC am 2026-10-25T08:00:00Z, `a4` 0,01 USDC am 2026-11-05T07:00:00Z, `a5` 5 USDC am
  2026-09-01T00:00:00Z (vor dem Fenster), `a6` 5 USDC am 2026-11-12T00:00:00Z. Im JSON ist `a6` eigen (Hash in `ours`); `a1` hat
  `wallet: true`, 120 Inferenz-Zeilen, `paid: 2`, `last_paid_at: 2026-11-11T00:00:00Z`; `a2` `wallet: true` ohne Inferenz und Zahlung;
  `a4` `wallet: true` mit 3 Inferenz-Zeilen ohne Zahlung; `b1` (kein Conway-Zahler) `wallet: true`, 50 Inferenz-Zeilen, `paid: 1`.
  Erwartet ohne weitere Flags als die beiden Dateien:
  `PAYERS window 2026-10-19T12:00:00Z to 2026-11-18T12:00:00Z: 4 wallets, 3 topped up, 40.01 USDC, 1 ours left out`,
  `OVERLAP topped up: 3 wallets, 2 known here, 1 with inference here, 1 paid here, 1 paid Conway after their last payment here`,
  `OVERLAP all: 4 wallets, 3 known here, 2 with inference here, 1 paid here, 1 paid Conway after their last payment here`.
  Gegenprobe mit leerem `ours`: `5 wallets, 4 topped up, 45.01 USDC, 0 ours left out`, also dieselben Zahlen, die
  `conway-money-metrics.py` über die Fixture als `wallets_30d` und `topup_wallets_30d` meldet.
- Tests: `test/conway-payers.test.ts` baut wie `test/customer-decline.test.ts` eine Datenbank mit `openDb` und fährt
  `ops/db-report.cjs` mit `CP_REPORT=wallets`: eine Adresse aus `OURS` steht nur als Hash in `ours` und nie in `wallets` (Testname
  enthält `never lists our own`), eine Zahlung mit `status = 'failed'` zählt nicht in `paid` (`only settled`), das JSON trägt keine
  Adresse (`no address`), ohne `CP_REPORT` gibt es kein Feld `wallets` (`default report unchanged`). Dazu Fälle für
  `ops/conway-payers.sh` gegen die Fixtures (Planspiel und Gegenprobe, Testname enthält `overlap` und `ours`). Der Selftest des
  Skripts hat dieselben Fälle, seine Zeilen nennen `ours`, `overlap` und `window`. Jeder neue Test lief einmal gegen `origin/dev` und
  war rot; die Zeile im Progress Log nennt, womit.
- Messung, nur lesend gegen die Produktion (`loop-constraints.md`, Produktion: nur lesen): `set -a; . ~/.config/control-plane/loop.env;
  set +a`, dann `bash ops/conway-payers.sh`. Die vollständige Ausgabe steht als Codeblock in `docs/kunden/conway-zahler.md`, darüber
  der Befehl.
- Wege: Je öffentlichem Weg, über den die Runtime am Pin `d8f8168` etwas über sich oder ihren Betreiber hinterlässt, die Fundstelle im
  Klon `~/.cache/control-plane/automaton-d8f8168` (nur lesen, nie neu bauen) als `src/<pfad>:<zeile>`. Mindestens drei Wege; Kandidaten
  sind die Registrierung nach ERC-8004 (`src/registry/erc8004.ts`), die Agent Card (`src/registry/agent-card.ts`), das Social-Relay
  (`src/social/`), die Creator-Adresse aus der Einrichtung (`creatorAddress` in `src/types.ts`) und die Issues im Upstream-Repo. Je Weg
  gezählt, wie viele der Conway-Zahler mit Aufladung im Fenster darüber erreichbar sind, nur lesend aus öffentlichen Daten (Base über
  einen öffentlichen RPC mit `eth_call` oder `eth_getLogs`, öffentliche Webseiten), nie eine Nachricht, ein Kommentar oder eine
  Transaktion. „Erreichbar“ heißt: Wir könnten dem Betreiber über diesen Weg eine Nachricht hinterlassen, die er liest (eine
  Kontaktadresse, ein Endpunkt, ein Repo mit Issues); eine bloße Wallet-Adresse reicht nicht. Der Zählbefehl je Weg steht in der
  Zeile und gibt selbst nur eine Zahl aus; wird er ein Skript, liegt es unter `ops/` und hat einen Selftest ohne Netz.
- `docs/kunden/conway-zahler.md`, Deutsch, je eine Zeile:
  `Gemessen: <ISO UTC der Messung>`;
  `Leitzahl: <c> von <t> Conway-Zahlern mit Aufladung in 30 Tagen zahlen auch bei uns` mit `c` und `t` aus der Zeile
  `OVERLAP topped up`;
  je Weg genau eine Zeile
  ``- Weg <Name>: Fundstelle `src/<pfad>:<zeile>` am Pin d8f8168, <n> von <t> Betreibern erreichbar, gemessen mit `<Befehl>` ``;
  genau eine Zeile `Ergebnis: <Weg> erreicht <n> Betreiber, Vorschlag goals/_vorschlaege/kunden-weg-<JJJJ-MM-TT>-<n>.md`, wenn ein Weg
  mindestens einen erreicht, sonst `Ergebnis: kein Weg erreicht einen Betreiber, weil …`. Keine Adresse, kein Hash, keine Wallet,
  kein Name, keine Kundennummer.
- Erreicht ein Weg Betreiber: der Vorschlag im Format aus dem Skill (`Schwere: 3`, `Goal: kunden 02`, `Befund:`, `Beleg:` mit Befehl und
  Ausgabe, `Empfehlung:` als nächstes Glied am Topic `kunden`, das diese Betreiber über den Weg anspricht; jeder Kontakt läuft über das
  Human Gate `public_post` oder `third_party_mail`), ohne Adresse. Angesprochen wird in diesem Goal niemand.
- `goals/kunden/ANNAHMEN.md`: neue Zeilen `- <Datum>, kunden 02: …` mindestens zum Abgleich über Hashes statt Adressen und dazu, was
  „erreichbar“ je Weg hieß.
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein Build, kein Test auf dem
  Server.

## Done Condition
- [ ] `ops/db-report.cjs` gibt mit `CP_REPORT=wallets` je fremder Wallet und je fremdem Zahler Zählungen unter einem Hash aus, eigene
      nur als Hash in `ours`, ohne `CP_REPORT` und mit `CP_REPORT=decline` unverändert; in beide Richtungen bewiesen.
      Prüfung: `pnpm -s vitest run test/conway-payers.test.ts` muss Exit-Code 0 haben.
      Prüfung: `pnpm -s vitest run test/conway-payers.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed").map(a=>a.title);console.log([/never lists our own/,/only settled/,/no address/,/default report unchanged/,/overlap/,/ours/].every(r=>t.some(x=>r.test(x)))?"alle":"fehlt")})'` muss `alle` ausgeben.
      Prüfung: `pnpm -s vitest run test/customer-decline.test.ts test/db-report.test.ts test/db-report-no-duplicate-keys.test.ts` muss Exit-Code 0 haben.
- [ ] `ops/conway-payers.sh` gleicht die Conway-Zahler im Fenster gegen unsere Wallets und Zahlungen ab, zählt nie eine eigene Wallet
      und nennt keine Adresse und keinen Hash; in beide Richtungen bewiesen.
      Prüfung: `bash ops/conway-payers.sh --selftest | tail -1` muss mit `SELFTEST OK` beginnen.
      Prüfung: `bash ops/conway-payers.sh --selftest | grep -cE "^ok .*ours"` muss mindestens 1 ausgeben.
      Prüfung: `bash ops/conway-payers.sh --selftest | grep -cE "^ok .*overlap"` muss mindestens 1 ausgeben.
      Prüfung: `bash ops/conway-payers.sh --selftest | grep -cE "^ok .*window"` muss mindestens 1 ausgeben.
      Prüfung: `bash ops/conway-payers.sh --db-json ops/fixtures/conway-payers-db.json --transfers ops/fixtures/conway-payers-transfers.csv | grep -cxE "PAYERS window 2026-10-19T12:00:00Z to 2026-11-18T12:00:00Z: 4 wallets, 3 topped up, 40\.01 USDC, 1 ours left out|OVERLAP topped up: 3 wallets, 2 known here, 1 with inference here, 1 paid here, 1 paid Conway after their last payment here|OVERLAP all: 4 wallets, 3 known here, 2 with inference here, 1 paid here, 1 paid Conway after their last payment here"` muss 3 ausgeben.
      Prüfung: `d=$(mktemp); python3 -c 'import json,sys; j=json.load(open(sys.argv[1])); j["ours"]=[]; json.dump(j,open(sys.argv[2],"w"))' ops/fixtures/conway-payers-db.json "$d"; bash ops/conway-payers.sh --db-json "$d" --transfers ops/fixtures/conway-payers-transfers.csv | grep -cxE "PAYERS window 2026-10-19T12:00:00Z to 2026-11-18T12:00:00Z: 5 wallets, 4 topped up, 45\.01 USDC, 0 ours left out"` muss 1 ausgeben.
      Prüfung: `e=$(mktemp); echo '{"ours":[],"wallets":[]}' >"$e"; m=$(python3 docs/research/data/conway-money-metrics.py docs/research/data/2026-09-19-conway-payto-transfers.csv --json | python3 -c 'import json,sys; j=json.load(sys.stdin); print("%d wallets, %d topped up" % (j["wallets_30d"], j["topup_wallets_30d"]))'); bash ops/conway-payers.sh --db-json "$e" --transfers docs/research/data/2026-09-19-conway-payto-transfers.csv | grep -c ": $m, "` muss 1 ausgeben.
      Prüfung: `bash ops/conway-payers.sh --db-json ops/fixtures/conway-payers-db.json --transfers ops/fixtures/conway-payers-transfers.csv | grep -cE "0x[0-9a-fA-F]{40}|[0-9a-f]{64}"` muss 0 ausgeben.
      Prüfung: `tail -n +2 ops/fixtures/conway-payers-transfers.csv | cut -d, -f3 | grep -cvE '^0x0{36}[0-9a-f]{4}$'` muss 0 ausgeben.
      Prüfung: `bash ops/conway-payers.sh --db-json ops/fixtures/conway-payers-db.json --transfers ops/fixtures/no-such.csv >/dev/null 2>&1; echo $?` muss `2` ausgeben.
      Prüfung: `bash ops/conway-payers.sh --no-such-flag >/dev/null 2>&1; echo $?` muss `1` ausgeben.
- [ ] Wie viele Conway-Zahler uns kennen und bei uns zahlen und welcher Weg wie viele Betreiber erreicht, steht gemessen in
      `docs/kunden/conway-zahler.md`, mit Befehl, Ausgabe, Fundstellen und Ergebnis, ohne Adresse; erreicht ein Weg Betreiber, gibt es
      den Vorschlag.
      Prüfung: `awk '/^Gemessen: /{print ($2 >= "2026-11-19T00:00:00Z") ? "spaet genug" : "zu frueh"}' docs/kunden/conway-zahler.md` muss genau `spaet genug` ausgeben.
      Prüfung: `grep -cxE '(\$ )?bash ops/conway-payers\.sh' docs/kunden/conway-zahler.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE "^(PAYERS window [0-9TZ:-]+ to [0-9TZ:-]+: [0-9]+ wallets, [0-9]+ topped up, [0-9]+\.[0-9]{2} USDC, [0-9]+ ours left out|OVERLAP (topped up|all): [0-9]+ wallets, [0-9]+ known here, [0-9]+ with inference here, [0-9]+ paid here, [0-9]+ paid Conway after their last payment here)$" docs/kunden/conway-zahler.md` muss 3 ausgeben.
      Prüfung: `d=docs/kunden/conway-zahler.md; o=$(sed -nE 's/^OVERLAP topped up: ([0-9]+) wallets, [0-9]+ known here, [0-9]+ with inference here, ([0-9]+) paid here, .*/\2 von \1/p' $d); [ -n "$o" ] && grep -qxE "Leitzahl: $o Conway-Zahlern mit Aufladung in 30 Tagen zahlen auch bei uns" $d && echo stimmig || echo unstimmig` muss `stimmig` ausgeben.
      Prüfung: `d=docs/kunden/conway-zahler.md; t=$(sed -nE 's/^OVERLAP topped up: ([0-9]+) wallets, .*/\1/p' $d); w=$(grep -cE '^- Weg [^:]+: Fundstelle .src/[^ ]+:[0-9]+. am Pin d8f8168, [0-9]+ von [0-9]+ Betreibern erreichbar, gemessen mit .[^ ].*.$' $d); v=$(grep -cE "^- Weg .* [0-9]+ von $t Betreibern erreichbar, gemessen mit " $d); [ -n "$t" ] && [ "$w" -ge 3 ] && [ "$w" = "$v" ] && echo stimmig || echo unstimmig` muss `stimmig` ausgeben.
      Prüfung: `git -C ~/.cache/control-plane/automaton-d8f8168 rev-parse --short=7 HEAD` muss `d8f8168` ausgeben.
      Prüfung: `n=0; bad=0; for f in $(grep -oE '^- Weg [^:]+: Fundstelle .src/[^ ]+:[0-9]+. am Pin' docs/kunden/conway-zahler.md | grep -oE 'src/[^ ]+:[0-9]+'); do n=$((n+1)); [ -n "$(sed -n "${f##*:}p" ~/.cache/control-plane/automaton-d8f8168/${f%:*} 2>/dev/null)" ] || bad=$((bad+1)); done; [ "$n" -ge 3 ] && [ "$bad" = 0 ] && echo belegt || echo unbelegt` muss `belegt` ausgeben.
      Prüfung: `grep -cE "^Ergebnis: " docs/kunden/conway-zahler.md` muss 1 ausgeben.
      Prüfung: `d=docs/kunden/conway-zahler.md; if grep -qE "^- Weg .*, [1-9][0-9]* von [0-9]+ Betreibern erreichbar" $d; then p=$(sed -nE 's/^Ergebnis: .* Vorschlag (goals\/_vorschlaege\/kunden-weg-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]+\.md)$/\1/p' $d); [ -n "$p" ] && head -1 "$p" | grep -qE "^Schwere: [1-5]$" && grep -qx "Goal: kunden 02" "$p" && echo stimmig || echo unstimmig; else grep -qE "^Ergebnis: kein Weg erreicht einen Betreiber, weil " $d && echo stimmig || echo unstimmig; fi` muss `stimmig` ausgeben.
      Prüfung: `cat docs/kunden/conway-zahler.md goals/_vorschlaege/kunden-weg-*.md 2>/dev/null | grep -cE "0x[0-9a-fA-F]{40}|[0-9a-f]{64}|Kunde [0-9]"` muss 0 ausgeben.
      Prüfung: `grep -cE "0x[0-9a-fA-F]{40}|[0-9a-f]{64}" goals/kunden/ANNAHMEN.md` muss 0 ausgeben.
      Prüfung: `grep -cE "^- [0-9-]+, kunden 02: " goals/kunden/ANNAHMEN.md` muss mindestens 2 ausgeben.
      Prüfung (Netz): `bash ops/conway-payers.sh | grep -cE "^OVERLAP topped up: [0-9]+ wallets, "` muss 1 ausgeben.
      Prüfung (Netz): `bash ops/conway-payers.sh | grep -cE "0x[0-9a-fA-F]{40}|[0-9a-f]{64}"` muss 0 ausgeben.
- [ ] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Test war vor dem Werkzeug rot; die Zeile im Progress Log nennt, womit.
- [ ] Ohne `CP_REPORT` und mit `CP_REPORT=decline` gibt `ops/db-report.cjs` dasselbe aus wie auf `origin/dev`; `ops/status.sh` und
      `ops/customer-decline.sh` sind unverändert.
- [ ] Keine Zeile der Ausgabe, des Dokuments, der Fixtures außer den erfundenen Adressen, eines Vorschlags oder von `ANNAHMEN.md` nennt
      eine Adresse, einen Hash einer Adresse, einen Betrag oder Zeitpunkt einer einzelnen Wallet oder eine Kundennummer.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei, Dokument und `ANNAHMEN.md` Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `src/**`, `harness/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.db`
- `docs/research/data/**`, `ops/status.sh`, `ops/access-log.sh`, `ops/own-ips.sh`, `ops/own-ips.txt`, `ops/customer-decline.sh` und
  ihre Fixtures: unverändert
- `ops/db-report.cjs`: nur der neue Zweig für `CP_REPORT=wallets`, der bestehende Bericht und der Zweig `CP_REPORT=decline` bleiben
  Zeile für Zeile
- `docs/richtung/**`, `docs/kunden/rueckgang-2026-11.md`, `ROADMAP.md`, `docs/kette.md` und alle bestehenden Vorschläge: nur lesen
- der Klon `~/.cache/control-plane/automaton-d8f8168`: nur lesen, nie löschen, neu bauen oder auschecken
- jedes Schreiben in der Produktion und unter `/opt/control-plane/conway-money`, jeder Build, Test oder Lastversuch auf dem Server,
  jede Transaktion auf einer Chain, jeder Kontakt zum Betreiber eines Automatons (`public_post`, `third_party_mail`)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
