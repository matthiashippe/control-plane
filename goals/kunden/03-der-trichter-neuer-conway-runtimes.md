# Kunden Goal 03: Der Trichter neuer Conway-Runtimes

## Status
ACTIVE

## Active Objective
Vom 12. bis 19.11.2026 legten 10 neue Runtimes einen Schlüssel `conway-automaton` bei uns an, 3 bekamen eine Startgutschrift, und
eine fremde Zahlung kam an (`docs/richtung/2026-11-19.md`, Tabelle „Befund je Kanal und Hebel“). Diese Zahlen hat der Richtungs-Check
von Hand aus `api_keys`, Ledger und `payments` gezählt, keine Stufe ist einer Runtime zugeordnet, und niemand sieht in einem Takt, an
welcher Stufe eine Runtime, die zu uns umsteigt, aussteigt. Nach diesem Goal führt der Bericht aus `ops/db-report.cjs`, den
`ops/status.sh` unter `db` ausgibt, einen Block `runtime_funnel`: je Woche der letzten vier die neuen fremden Runtimes mit Schlüssel
`conway-automaton`, davon mit Startgutschrift, mit Inferenz und mit Zahlung, dazu die Summe und die Stufe mit dem größten Verlust.
`docs/kunden/trichter.md` nennt die erste Messung, und die Stufe mit dem größten Verlust ist ein Vorschlag an dieses Topic.
Leitzahl: Anteil neuer Runtimes mit erster Zahlung.
Widerlegt, wenn Startgutschrift, Inferenz und Zahlung in den vier Wochen je unter 2 bleiben; dann zählt das Werkzeug weiter, es gibt
keinen Vorschlag, und das steht so da.
MVP: Funktion, weil der Loop ab dann sieht, an welcher Stufe Umsteiger aussteigen.

## Voraussetzungen
- kunden Goal 02 DONE

## Kontext für den Maker
- Ziel: Wer im Loop über das nächste Glied am Topic `kunden` entscheidet, sieht in jedem Takt aus `ops/status.sh`, wie viele neue
  fremde Runtimes je Woche bei uns ankommen und an welcher Stufe zwischen Schlüssel und Zahlung sie hängen bleiben, damit das nächste
  Glied genau diese Stufe repariert, statt zu raten.
- Quelle der Kette: `ROADMAP.md` Zeile 14 (Topic `kunden`, Glied 03), Richtungs-Check 19.11.2026 (PRO-25477,
  `docs/richtung/2026-11-19.md`). `docs/kette.md` hat zu `kunden` keinen Abschnitt; diese Datei ist die ausführliche Fassung. Die
  Vorschläge `goals/_vorschlaege/kunden-kritik-2026-11-19-1.md` bis `-3.md` und `kunden-weg-2026-11-19-1.md` tragen kein
  `Übernommen:` und gehören nicht in dieses Goal.
- Grundregel 8 (`loop-constraints.md` Zeile 39) wie in kunden 01 und 02 (`goals/kunden/ANNAHMEN.md`): Im Repo stehen nur Zählungen
  je Woche und Summen. Nie eine Adresse, ein Hash einer Adresse, ein Schlüssel oder Präfix, ein Betrag oder Zeitpunkt einer einzelnen
  Runtime oder Zahlung.
- Bericht, in `ops/db-report.cjs` als neuer Schlüssel `report.runtime_funnel` des Standardberichts, unmittelbar vor dem letzten
  `console.log(JSON.stringify(report))`, synchron und nur lesend wie der Rest der Datei. Die Zweige `CP_REPORT=decline` und
  `CP_REPORT=wallets` und jeder bestehende Schlüssel des Standardberichts bleiben Zeile für Zeile; der Diff dieser Datei hat nur
  hinzugefügte Zeilen.
  - Ende des Fensters `until`: `CP_UNTIL` als ISO, wenn gesetzt (unlesbar: Abbruch mit Exit ungleich 0 wie im Zweig `decline`),
    sonst jetzt. Vier Wochen, jede 7 Tage, die neueste endet bei `until`, `from` eingeschlossen, `to` ausgeschlossen.
  - Neue Runtime: eine fremde Adresse mit mindestens einem Schlüssel, dessen `name` genau `conway-automaton` lautet. Sie zählt in
    der Woche, in die `created_at` ihres ältesten solchen Schlüssels fällt, genau einmal; liegt der älteste vor der vierten Woche oder
    ab `until`, zählt sie nirgends. Fremd heißt: nicht eigen nach derselben Regel wie `notOursOn` (Liste `OURS` und jede Adresse mit
    einem Schlüssel aus `OUR_KEY_NAMES`). Achtung: `notOursOn` nennt intern `api_keys k`; ruft die neue Abfrage es mit einer Spalte
    eines äußeren Alias `k` auf, verweist `k.address = k.address` auf den inneren und filtert falsch, deshalb ein anderer Alias.
  - Je Runtime, gezählt mit Ereignissen vor `until`: `starter_credit`, wenn das Ledger für ihre Adresse eine Zeile `kind = 'grant'`
    hat; `inference`, wenn es eine Zeile `kind = 'inference'` hat; `paid`, wenn `payments` eine Zeile mit `status = 'settled'` hat,
    deren `from_address` oder `to_address` in Kleinbuchstaben ihre Adresse ist. Die Stufen sind unabhängig gezählt (eine Runtime kann
    ohne Gutschrift zahlen).
  - Form, genau diese Felder:
    `{"until": <ISO>, "weeks": [{"from", "to", "keys", "starter_credit", "inference", "paid"}, …vier, neueste zuerst],
    "total": {"keys", "starter_credit", "inference", "paid"}, "largest_drop": {"stage", "lost"}}`. `total` ist die Summe der
    Wochen. Verlust je Stufe: `starter_credit` = `keys` minus `starter_credit`, `inference` = `starter_credit` minus `inference`, `paid` =
    `inference` minus `paid`, je über `total`; `largest_drop` nennt die Stufe mit dem größten positiven Verlust (bei Gleichstand die
    frühere) und `lost`, ist keiner positiv, `{"stage": null, "lost": 0}`. Keine Adresse, kein Hash, kein Schlüssel im Block.
- `ops/status.sh` bleibt unverändert, weil es das JSON von `ops/db-report.cjs` schon ganz unter `db` ausgibt; ein Test beweist, dass
  `runtime_funnel` dort ankommt.
- Tests: `test/runtime-funnel.test.ts` baut wie `test/conway-payers.test.ts` eine Datenbank mit `openDb` und fährt
  `ops/db-report.cjs` mit `CP_DB_PATH` und `CP_UNTIL=2026-11-19T12:00:00Z`. Planspiel (`c1` steht für
  `0x00000000000000000000000000000000000000c1`, nur solche erfundenen Adressen):
  `c1` Schlüssel `conway-automaton` am 2026-11-18, Gutschrift, Inferenz, Zahlung `settled` von `c1`;
  `c2` Schlüssel am 2026-11-17, Gutschrift, sonst nichts;
  `c3` Schlüssel am 2026-11-16, sonst nichts;
  `c4` Schlüssel am 2026-11-15, Gutschrift, Inferenz, Zahlung nur `failed`;
  `c5` Schlüssel am 2026-11-08, Inferenz und Zahlung `settled` an `to_address` `c5` ohne Gutschrift;
  `c8` Schlüssel am 2026-11-10 und ein zweiter `conway-automaton` am 2026-11-18, sonst nichts;
  `c6` Schlüssel am 2026-10-01 mit Gutschrift, Inferenz und Zahlung (vor dem Fenster);
  `c7` Schlüssel nur mit Namen `browser` am 2026-11-18 mit Gutschrift;
  `c9` Schlüssel `conway-automaton` am 2026-11-19T13:00:00Z (nach `until`);
  `a1` Schlüssel `conway-automaton` und `ops-selftest` am 2026-11-18 mit Gutschrift, Inferenz und Zahlung (eigen).
  Erwartet: Woche 1 (`2026-11-12T12:00:00.000Z` bis `2026-11-19T12:00:00.000Z`) `keys 4, starter_credit 3, inference 2, paid 1`;
  Woche 2 `keys 2, starter_credit 0, inference 1, paid 1`; Wochen 3 und 4 je 0; `total` `6, 3, 3, 2`;
  `largest_drop` `{"stage": "starter_credit", "lost": 3}`. Fälle, je mit dem Wort im Testnamen: das Planspiel (`plan`), `a1` zählt
  nie (`never counts our own`), `c7` zählt nie (`only conway-automaton`), `c8` zählt einmal in Woche 2 (`first key`), `c4` zählt
  nicht in `paid` (`only settled`), `c6` und `c9` zählen nie (`window`), der Block trägt keine Adresse (`no address`), ohne Ereignis
  mit positivem Verlust ist `largest_drop` `{"stage": null, "lost": 0}` (`no drop`), und `ops/status.sh` gibt den Block unter
  `db.runtime_funnel` aus, mit `ssh`, `curl` und `openssl` als Fakes auf `PATH` wie in `test/status-alarm-received.test.ts`, wobei
  das Fake-`ssh` für den Aufruf mit `node -` den gelesenen Bericht lokal mit `CP_DB_PATH` auf die Testdatenbank ausführt
  (`status shows`). Jeder neue Test lief einmal gegen `ops/db-report.cjs` von `origin/dev` und war rot; die Zeile im Progress Log
  nennt, womit.
- Messung, nur lesend gegen die Produktion (`loop-constraints.md`, Produktion: nur lesen): `set -a; . ~/.config/control-plane/loop.env;
  set +a`, dann genau
  `bash ops/status.sh | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)["db"]["runtime_funnel"]))'`, weil
  der Rest der Ausgabe von `ops/status.sh` Adressen trägt (`wallets_foreign_list`) und nie ins Repo darf.
- `docs/kunden/trichter.md`, Deutsch, je eine Zeile:
  `Gemessen: <ISO UTC der Messung>`;
  der Befehl oben allein auf einer Zeile ohne Präfix, darunter in einem Codeblock seine Ausgabe als eine Zeile JSON,
  die mit `{"until"` beginnt;
  je Woche genau eine Zeile
  `- Woche <from> bis <to>: <keys> neue Runtimes, <starter_credit> mit Startgutschrift, <inference> mit Inferenz, <paid> mit Zahlung`
  mit den Werten aus dem JSON;
  `Leitzahl: <paid> von <keys> neuen Runtimes der letzten vier Wochen haben gezahlt` aus `total`;
  genau eine Zeile `Ergebnis: `: Bleiben `starter_credit`, `inference` und `paid` in `total` je unter 2, dann
  `Ergebnis: widerlegt, weil …` und kein Vorschlag; sonst
  `Ergebnis: größter Verlust bei <stage> (<lost> verloren), Vorschlag goals/_vorschlaege/kunden-trichter-<JJJJ-MM-TT>-<n>.md` mit
  `stage` und `lost` aus `largest_drop`.
- Der Vorschlag im Format aus dem Skill (erste Zeile `Schwere: 3`, `Goal: kunden 03`, `Befund:`, `Beleg:` mit dem Messbefehl und der
  Zahl der Stufe, `Empfehlung:` als nächstes Glied am Topic `kunden`, das diese Stufe repariert, mit Leitzahl), ohne Adresse. Ob die
  Ursache bei uns liegt, darf die Empfehlung nur aus Code und Zählungen herleiten, nie aus einer einzelnen Runtime im Repo.
- `goals/kunden/ANNAHMEN.md`: neue Zeilen `- <Datum>, kunden 03: …` mindestens dazu, warum der Name `conway-automaton` eine neue
  Runtime anzeigt (auch der Weg über SIWE ohne Namen vergibt ihn, `src/auth/siwe.ts`, `src/app.ts`) und warum die Stufen als Kohorte
  nach der Woche des ersten Schlüssels zählen statt als Ereignisse je Woche.
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein Build, kein Test auf dem
  Server.

## Done Condition
- [x] `ops/db-report.cjs` gibt im Standardbericht `runtime_funnel` aus: neue fremde Runtimes mit Schlüssel `conway-automaton` je
      Woche der letzten vier, davon mit Startgutschrift, Inferenz und Zahlung, Summe und größten Verlust, eigene nie, ohne Adresse;
      `ops/status.sh` zeigt den Block; in beide Richtungen bewiesen.
      Prüfung: `pnpm -s vitest run test/runtime-funnel.test.ts` muss Exit-Code 0 haben.
      Prüfung: `pnpm -s vitest run test/runtime-funnel.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed").map(a=>a.title);console.log([/plan/,/never counts our own/,/only conway-automaton/,/first key/,/only settled/,/window/,/no address/,/no drop/,/status shows/].every(r=>t.some(x=>r.test(x)))?"alle":"fehlt")})'` muss `alle` ausgeben.
      Prüfung: `pnpm -s vitest run test/db-report.test.ts test/db-report-no-duplicate-keys.test.ts test/customer-decline.test.ts test/conway-payers.test.ts test/status-alarm-received.test.ts` muss Exit-Code 0 haben.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) -- ops/db-report.cjs | grep -c '^-[^-]'` muss 0 ausgeben.
      Prüfung: `git diff --quiet $(git merge-base origin/dev HEAD) -- ops/status.sh; echo $?` muss `0` ausgeben.
- [x] Die erste Messung des Trichters steht in `docs/kunden/trichter.md` mit Befehl, Ausgabe, Wochen, Leitzahl und Ergebnis, ohne
      Adresse; ist er nicht widerlegt, gibt es den Vorschlag zur Stufe mit dem größten Verlust.
      Prüfung: `awk '/^Gemessen: /{print ($2 >= "2026-11-19T20:00:00Z") ? "spaet genug" : "zu frueh"}' docs/kunden/trichter.md` muss genau `spaet genug` ausgeben.
      Prüfung: `grep -cxF "bash ops/status.sh | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)[\"db\"][\"runtime_funnel\"]))'" docs/kunden/trichter.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE '^- Woche [0-9TZ:.-]+ bis [0-9TZ:.-]+: [0-9]+ neue Runtimes, [0-9]+ mit Startgutschrift, [0-9]+ mit Inferenz, [0-9]+ mit Zahlung$' docs/kunden/trichter.md` muss 4 ausgeben.
      Prüfung: `python3 -c 'import json,re; t=open("docs/kunden/trichter.md").read(); j=json.loads(re.search(r"^(\{\"until\".*\})$",t,re.M).group(1)); s=j["total"]; w=j["weeks"]; ks=("keys","starter_credit","inference","paid"); ok=len(w)==4 and all(sum(x[k] for x in w)==s[k] for k in ks) and all(re.search(r"^- Woche %s bis %s: %d neue Runtimes, %d mit Startgutschrift, %d mit Inferenz, %d mit Zahlung$" % (re.escape(x["from"]),re.escape(x["to"]),x["keys"],x["starter_credit"],x["inference"],x["paid"]),t,re.M) for x in w) and re.search(r"^Leitzahl: %d von %d neuen Runtimes der letzten vier Wochen haben gezahlt$" % (s["paid"],s["keys"]),t,re.M) is not None; print("stimmig" if ok else "unstimmig")'` muss `stimmig` ausgeben.
      Prüfung: `grep -cE "^Ergebnis: " docs/kunden/trichter.md` muss 1 ausgeben.
      Prüfung: `python3 -c 'import json,re,os; t=open("docs/kunden/trichter.md").read(); j=json.loads(re.search(r"^(\{\"until\".*\})$",t,re.M).group(1)); s=j["total"]; d=j["largest_drop"]; thin=all(s[k]<2 for k in ("starter_credit","inference","paid")); m=re.search(r"^Ergebnis: größter Verlust bei (starter_credit|inference|paid) \((\d+) verloren\), Vorschlag (goals/_vorschlaege/kunden-trichter-\d{4}-\d\d-\d\d-\d+\.md)$",t,re.M); ok=(re.search(r"^Ergebnis: widerlegt, weil ",t,re.M) is not None) if thin else (m is not None and m.group(1)==d["stage"] and int(m.group(2))==d["lost"] and os.path.exists(m.group(3)) and re.match(r"Schwere: [1-5]\n",open(m.group(3)).read()) is not None and "\nGoal: kunden 03\n" in open(m.group(3)).read()); print("stimmig" if ok else "unstimmig")'` muss `stimmig` ausgeben.
      Prüfung: `cat docs/kunden/trichter.md goals/_vorschlaege/kunden-trichter-*.md goals/kunden/ANNAHMEN.md 2>/dev/null | grep -cE "0x[0-9a-fA-F]{40}|[0-9a-f]{64}|cnwy_k_"` muss 0 ausgeben.
      Prüfung: `grep -cE "^- [0-9-]+, kunden 03: " goals/kunden/ANNAHMEN.md` muss mindestens 2 ausgeben.
      Prüfung (Netz): `bash ops/status.sh | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["db"]["runtime_funnel"]["weeks"]))'` muss `4` ausgeben.
- [x] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Test war vor dem Bericht rot; die Zeile im Progress Log nennt, womit.
- [ ] Der Standardbericht von `ops/db-report.cjs` ändert sich nur um den Schlüssel `runtime_funnel`; die Zweige `CP_REPORT=decline`
      und `CP_REPORT=wallets`, `ops/status.sh`, `ops/customer-decline.sh` und `ops/conway-payers.sh` sind unverändert.
- [ ] Keine Zeile des Berichtsblocks, des Dokuments, eines Vorschlags, der Tests außer den erfundenen Adressen oder von
      `ANNAHMEN.md` nennt eine Adresse, einen Hash einer Adresse, einen Schlüssel, einen Betrag oder Zeitpunkt einer einzelnen Runtime.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei, Dokument und `ANNAHMEN.md` Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `src/**`, `harness/**`, `.env*`, `*.db`
- `ops/status.sh`, `ops/customer-decline.sh`, `ops/conway-payers.sh`, `ops/conway-reach.py`, `ops/access-log.sh`, `ops/own-ips.sh`,
  `ops/own-ips.txt`, `docs/research/data/**` und die Fixtures dieser Werkzeuge: unverändert
- `ops/db-report.cjs`: nur der neue Schlüssel `runtime_funnel` vor dem letzten `console.log`; der bestehende Bericht und die Zweige
  `CP_REPORT=decline` und `CP_REPORT=wallets` bleiben Zeile für Zeile
- `docs/richtung/**`, `docs/kunden/rueckgang-2026-11.md`, `docs/kunden/conway-zahler.md`, `ROADMAP.md`, `docs/kette.md` und alle
  bestehenden Vorschläge: nur lesen
- jedes Schreiben in der Produktion, jeder Build, Test oder Lastversuch auf dem Server, jede Transaktion auf einer Chain, jeder
  Kontakt zum Betreiber eines Automatons (`public_post`, `third_party_mail`)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-19 Zyklus 1: Punkte 1, 2, 3 gebaut: Block `runtime_funnel` am Ende des Standardberichts von `ops/db-report.cjs` (nur hinzugefügte Zeilen, ohne `CP_UNTIL` endet das Fenster am Beginn der UTC-Stunde, damit der Bericht byte-gleich bleibt), `test/runtime-funnel.test.ts` mit Planspiel, Gegenprobe je Fall und `ops/status.sh` mit Fakes, Messung gegen die Produktion um 20:46 UTC (9 neue Runtimes, 6 mit Startgutschrift, 6 mit Inferenz, 3 mit Zahlung, größter Verlust `starter_credit` 3), Abgleich mit dem Richtungs-Check (er zählte Schlüssel: 9 an 4 Adressen, 3 neu), Vorschlag `goals/_vorschlaege/kunden-trichter-2026-11-19-1.md`, 4 Annahmen. Neue Tests rot vor dem Bericht: `REPORT_UNDER_TEST` mit `ops/db-report.cjs` von `origin/dev` 10 von 10 failed; Mutationen am Bericht (Filter für Eigene wirkungslos: 7 failed, darunter `never counts our own`; `failed` als bezahlt: 4 failed, darunter `only settled`). Prüfbefehle: Punkt 1 vitest Exit 0 (11 passed), `alle`, db-report-Tests Exit 0, 0, `0`; Punkt 2 `spaet genug`, 1, 4, `stimmig`, 1, `stimmig`, 0, 4, Netz 4; Punkt 3 `node scripts/check.mjs` Exit 0 (2463 Tests).

## Blockers
