# Kunden Goal 05: Warum Kunde 1 nach unserer 402 nicht auflädt

## Status
ACTIVE

## Active Objective
Kunde 1, der größte zahlende fremde Automaton, fragt seit dem 13.11.2026 05:05 UTC täglich 1065 bis 1625 Mal Inferenz mit leerem
Saldo an, bekommt jedes Mal 402 und lädt nicht mehr auf; eine Aufladung über `/pay/` versuchte er seitdem nicht
(`docs/kunden/rueckgang-2026-11.md`, Zeilen `DAY 1 2026-11-13` bis `DAY 1 2026-11-19` und die Zeile zu Kunde 1). Vorher bekam er vom
11.11. 02:01 bis 12.11.2026 08:22 UTC 1393 Mal 503, weil das Guthaben beim Inferenz-Anbieter leer war, 30 Stunden statt der 7,5, die
`goals/_vorschlaege/fehler-2026-11-11-1.md` maß. Nach diesem Goal steht in `docs/kunden/aufladung-2026-11.md` gemessen, warum er
nicht auflädt, als ein Wort aus `kein Geld`, `Fehler bei uns` oder `offen`, belegt mit unserer 402 und dem Code der Runtime am Pin
`d8f8168`, der sie liest; liegt die Ursache bei uns, gibt es einen Vorschlag mit Schwere 5, aus dem der Writer ein Fix-Goal mit der
Leitzahl fremde Zahlungen je Woche schreibt. Dazu steht dort, ob Warnung und Aufladung beim Anbieter heute einen leeren Saldo vor der
ersten 503 melden oder verhindern, statt das bis betrieb 05 (frühestens 27.11.) offen zu lassen.
Leitzahl: fremde Zahlungen je Woche (6 vom 05. bis 12.11., 1 vom 12. bis 19.11.).
Widerlegt, wenn die Wallet von Kunde 1 weniger USDC hält als die kleinste Stufe von 5 USD; dann steht `kein Geld` da, und das Glied
endet mit der Messung.
MVP: Funktion, weil ein Kunde, der täglich über 1000 Mal bezahlen will und es nicht tut, der kürzeste Weg zu Umsatz ist.

## Voraussetzungen
- keine

## Kontext für den Maker
- Ziel: Wir wissen gemessen, ob Kunde 1 nicht auflädt, weil ihm USDC fehlt oder weil unsere Antwort ihn nicht zur Aufladung führt,
  und ein leeres Guthaben beim Anbieter trifft keinen zahlenden Kunden mehr unbemerkt.
- Quelle der Kette: `ROADMAP.md`, Topic `kunden`, Glied 05; Loop-Triage 20.11.2026 (PRO-25822, PRO-25825). Übernimmt
  `goals/_vorschlaege/fehler-2026-11-19-1.md` und `goals/_vorschlaege/kunden-kritik-2026-11-19-1.md`. Eigenes Glied an `kunden` statt
  fehler 12, weil fehler 11 auf `PAUSED` steht und der Loop Master ein Topic erst beim ersten nicht abgeschlossenen Glied fortsetzt.
- Unsere 402: `handleChat` in `src/inference/proxy.ts` antwortet ohne reichendes Guthaben mit 402 und `error: "INSUFFICIENT_CREDITS"`,
  `details.required_cents`, `details.current_balance_cents`, `details.topup_url` und `topup_tiers_usd`; ist die Aufnahme geschlossen
  (`topupsClosed`, `intakeClosed` in `src/app.ts`, HAN-62), sagt die Nachricht statt dessen, dass es keine Aufladung gibt. Welcher
  Zweig in der Produktion greift, entscheidet die Konfiguration des laufenden Dienstes (`deploy/docker-compose.prod.yml`,
  `CP_INFERENCE_SUNSET_AT`, Katalog); das liest du aus Code und Compose am laufenden Commit, nie durch eine Anfrage, die etwas anlegt.
  Kein Aufruf mit einem eigenen Schlüssel ohne Guthaben in der Produktion: `grantOnFirstUse` gäbe ihm eine Startgutschrift aus dem Pool.
- Die Runtime am Pin `d8f8168` (Klon `git clone -q https://github.com/Conway-Research/automaton <ordner> && git -C <ordner> checkout -q
  d8f8168`, auf dem code-host liegt einer unter `~/.cache/control-plane/automaton-d8f8168`): Sie lädt nur auf, wenn ihre Wallet
  mindestens die kleinste Stufe von 5 USD in USDC hält, beim Start (`bootstrapTopup` in `src/conway/topup.ts`, aufgerufen aus
  `src/index.ts`), mitten im Lauf (`src/agent/loop.ts`, `financial.usdcBalance >= 5`) und im Heartbeat (`src/heartbeat/tasks.ts`,
  `balance >= MIN_TOPUP_USD`); den Bedarf liest `topupForSandbox` aus `details.required_cents` und `details.current_balance_cents`.
  Jede Stelle, die das Dokument nennt, steht dort als `src/<pfad>.ts:<zeile>` am Pin.
- USDC-Bestand seiner Wallet: aus öffentlichen Daten von Base (`balanceOf` des USDC-Vertrags über eine öffentliche RPC, wie
  `ops/conway-reach.py`), gerechnet auf dem code-host. Die Adresse kommt nur im Speicher aus der Produktion (wie `ops/customer-decline.sh`
  die Kunden nummeriert), sie und der Betrag stehen nie im Repo, in einer Ausgabe oder im Log; ins Dokument kommt nur
  `über der kleinsten Stufe` oder `unter der kleinsten Stufe` (Grundregel 8, `goals/kunden/ANNAHMEN.md` zu kunden 01).
- Aufrufe von `/pay/` durch Kunde 1 seit 13.11.: aus dem Zugriffslog über `ops/access-log.sh`, zugeordnet wie in
  `ops/customer-decline.sh` (Adressen des Kunden), nur die Zahl.
- `docs/kunden/aufladung-2026-11.md`, Deutsch, je eine Zeile:
  `Gemessen: <ISO UTC>`;
  `Unsere 402: src/inference/proxy.ts:<zeile>, Zweig <Aufladung offen|Aufladung geschlossen>, Felder <liste>`;
  je gelesene Stelle der Runtime `- Runtime: src/<pfad>.ts:<zeile> am Pin d8f8168, <was sie mit der 402 oder dem Saldo tut>`, mindestens
  drei;
  `USDC von Kunde 1: über der kleinsten Stufe|unter der kleinsten Stufe|offen`;
  `Aufrufe von /pay/ durch Kunde 1 seit 13.11.: <n>`;
  `Ursache: kein Geld|Fehler bei uns|offen, weil <Beleg>`; bei `Fehler bei uns` genau eine Zeile
  `Vorschlag: goals/_vorschlaege/kunden-kritik-<JJJJ-MM-TT>-<n>.md` (Schema `<topic>-<art>-<JJJJ-MM-TT>-<n>` aus dem Skill
  `loop-regeln`, nicht `fehler-<Datum>-<n>` wie in kunden 01), der Vorschlag mit `Schwere: 5`, `Goal: kunden 05` und einer Empfehlung
  für ein Fix-Goal mit der Leitzahl fremde Zahlungen je Woche. Keine Adresse, keine Wallet, kein Betrag je Kunde.
- Warnung vor der ersten 503: Am 11.11. gab es weder Warnung (`ops/credit-runway.sh`, `ops/watchdog.sh` aus fehler 01, 03, 07 und 09)
  noch Aufladung (seit 12.11.2026 21:35, `docs/betrieb/guthaben.md`). Ein Test `test/credit-before-503.test.ts` fährt
  `ops/watchdog.sh` mit nachgebautem `ops/credit-runway.sh` (feste Antworten wie in `test/watchdog-credit.test.ts`) über eine Folge von
  Läufen, in der der Rest von 9,37 USD in Schritten auf 0 fällt, und verlangt, dass die erste Meldung über den nachgebauten Webhook
  `CREDIT RUNWAY LOW` ist und in einem Lauf kommt, in dem der Rest noch über 0 liegt, vor der ersten Meldung `credit empty`
  (Testname enthält `warns before empty`); rot gegen eine Mutation, die die Schwelle auf 0 setzt (Progress Log nennt sie). Gibt es den
  Fall schon in einem bestehenden Test, nennt das Progress Log ihn, und der neue Test prüft die Folge über mindestens vier Läufe.
- Dazu, nur lesend in der Produktion: der letzte Lauf des Watchdogs mit seiner Zeile `credit` (Log des Watchdogs auf dem Server),
  `alarm_path.received` aus `bash ops/status.sh` und die gerechnete Schwelle aus `bash ops/credit-runway.sh --topup` gegen
  `CP_CREDIT_TOPUP_USD` (nur ob sie passt, kein Wert aus `.env`). Unter `## Vor der ersten 503` im selben Dokument je eine Zeile
  `Watchdog: letzter Lauf <ISO UTC>, credit <OK|LOW|empty|unreadable>`, `Alarmweg: received <ok|red|unknown>`,
  `Aufladung: Schwelle passt|Schwelle zu niedrig` und `Ergebnis vor der ersten 503: gemeldet|nicht gemeldet, weil <Beleg>`; bei
  `nicht gemeldet` ein zweiter Vorschlag `goals/_vorschlaege/kunden-kritik-<JJJJ-MM-TT>-<n>.md` mit `Schwere: 5`. betrieb 05 bleibt
  unberührt: Die Nachmessung über 14 Tage in `docs/betrieb/guthaben.md` ist dessen Arbeit.
- `goals/kunden/ANNAHMEN.md`: Zeilen `- <Datum>, kunden 05: …`, mindestens zur Wahl des Zweigs der 402 und zur Quelle des USDC-Bestands.
- Zugang: `set -a; . ~/.config/control-plane/loop.env; set +a`, Werte nie ausgeben. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`),
  `check` und vitest im Vordergrund mit eigenem Timeout. Kein Build, kein Test auf dem Server.

## Done Condition
- [x] Warum Kunde 1 nach unserer 402 nicht auflädt, steht gemessen in `docs/kunden/aufladung-2026-11.md`, belegt mit unserer 402 und
      dem Code der Runtime am Pin, ohne Adresse und ohne Betrag; liegt die Ursache bei uns, gibt es den Vorschlag mit Schwere 5.
      Prüfung: `awk '/^Gemessen: /{print ($2 >= "2026-11-20T00:00:00Z") ? "spaet genug" : "zu frueh"}' docs/kunden/aufladung-2026-11.md` muss genau `spaet genug` ausgeben.
      Prüfung: `grep -cE "^Unsere 402: src/inference/proxy\.ts:[0-9]+, Zweig (Aufladung offen|Aufladung geschlossen), Felder " docs/kunden/aufladung-2026-11.md` muss 1 ausgeben.
      Prüfung: `grep -cE "^- Runtime: src/[A-Za-z0-9_/.-]+\.ts:[0-9]+ am Pin d8f8168, " docs/kunden/aufladung-2026-11.md` muss mindestens 3 ausgeben.
      Prüfung: `grep -cE "^USDC von Kunde 1: (über der kleinsten Stufe|unter der kleinsten Stufe|offen)$" docs/kunden/aufladung-2026-11.md` muss 1 ausgeben.
      Prüfung: `grep -cE "^Aufrufe von /pay/ durch Kunde 1 seit 13\.11\.: [0-9]+$" docs/kunden/aufladung-2026-11.md` muss 1 ausgeben.
      Prüfung: `grep -cE "^Ursache: (kein Geld|Fehler bei uns|offen), weil " docs/kunden/aufladung-2026-11.md` muss 1 ausgeben.
      Prüfung: `d=docs/kunden/aufladung-2026-11.md; if grep -q "^Ursache: Fehler bei uns" "$d"; then p=$(sed -nE 's/^Vorschlag: (goals\/_vorschlaege\/kunden-kritik-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]+\.md)$/\1/p' "$d" | head -1); [ -n "$p" ] && head -1 "$p" | grep -qx "Schwere: 5" && grep -q "^Goal: kunden 05" "$p" && echo stimmig || echo unstimmig; else echo stimmig; fi` muss `stimmig` ausgeben.
      Prüfung (Netz): `d=$(mktemp -d); git clone -q https://github.com/Conway-Research/automaton "$d" && git -C "$d" checkout -q d8f8168 && grep -oE "^- Runtime: src/[A-Za-z0-9_/.-]+\.ts:[0-9]+" docs/kunden/aufladung-2026-11.md | sed 's/^- Runtime: //' | while IFS=: read -r p n; do sed -n "${n}p" "$d/$p" | grep -qiE "topup|402|INSUFFICIENT|usdc|credit|balance" || echo "falsch $p:$n"; done` muss nichts ausgeben.
- [x] Ein Test belegt ohne Netz, dass der Watchdog einen fallenden Rest beim Anbieter meldet, bevor er leer ist, und das Dokument sagt
      gemessen, ob Warnung und Aufladung das heute in der Produktion tun.
      Prüfung: `pnpm -s vitest run test/credit-before-503.test.ts` muss Exit-Code 0 haben.
      Prüfung: `pnpm -s vitest run test/credit-before-503.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed").map(a=>a.title);console.log(t.some(x=>/warns before empty/.test(x))?"da":"fehlt")})'` muss `da` ausgeben.
      Prüfung: `sed -n '/^## Vor der ersten 503/,/^## /p' docs/kunden/aufladung-2026-11.md | grep -cE "^(Watchdog: letzter Lauf 2026-[0-9]{2}-[0-9]{2}T[0-9:]+Z, credit (OK|LOW|empty|unreadable)|Alarmweg: received (ok|red|unknown)|Aufladung: Schwelle (passt|zu niedrig)|Ergebnis vor der ersten 503: (gemeldet|nicht gemeldet), weil .+)$"` muss 4 ausgeben.
      Prüfung: `d=docs/kunden/aufladung-2026-11.md; if grep -q "^Ergebnis vor der ersten 503: nicht gemeldet" "$d"; then n=$(grep -oE "goals/_vorschlaege/kunden-kritik-[0-9-]+\.md" "$d" | sort -u | while read -r p; do head -1 "$p" | grep -qx "Schwere: 5" && echo "$p"; done | wc -l); [ "$n" -ge 1 ] && echo stimmig || echo unstimmig; else echo stimmig; fi` muss `stimmig` ausgeben.
- [x] Nichts im Repo nennt eine Adresse, eine Wallet oder einen Betrag je Kunde, und die Annahmen stehen fest.
      Prüfung: `cat docs/kunden/aufladung-2026-11.md goals/kunden/ANNAHMEN.md | grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}"` muss 0 ausgeben.
      Prüfung: `grep -cE "Kunde [0-9]+[^.]*[0-9][.,][0-9]{2} (USD|USDC)" docs/kunden/aufladung-2026-11.md` muss 0 ausgeben.
      Prüfung: `grep -cE "^- [0-9-]+, kunden 05: " goals/kunden/ANNAHMEN.md` muss mindestens 2 ausgeben.
- [x] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Test war vor der Änderung rot oder gegen eine benannte Mutation rot; die Zeile im Progress Log nennt, womit.
- [ ] Kein Aufruf in der Produktion, der etwas anlegt oder bucht; gelesen wird nur über `ssh` mit `readonly: true`, `ops/access-log.sh`
      und die Werkzeuge aus `ops/`.
- [ ] Code, Kommentare und Testnamen Englisch, Dokument, Goal-Datei und `ANNAHMEN.md` Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `src/**`, `.env*`, `*.db`
- `ops/watchdog.sh`, `ops/credit-runway.sh`, `ops/status.sh`, `ops/customer-decline.sh`, `ops/access-log.sh`: unverändert (nur gelesen
  und im Test nachgebaut)
- `docs/betrieb/guthaben.md`, `docs/kunden/rueckgang-2026-11.md`, `ROADMAP.md`, `docs/kette.md`, `docs/richtung/**` und alle
  bestehenden Vorschläge: nur lesen
- jedes Schreiben in der Produktion, jede Aufladung (`server_kauf`), jeder Kontakt zum Betreiber eines Automatons (`public_post`,
  `third_party_mail`)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-20 Zyklus 1: Punkte 1, 2, 3, 4 gebaut: `docs/kunden/aufladung-2026-11.md` misst Ursache `kein Geld` (USDC von Kunde 1 unter der kleinsten Stufe, 0 Aufrufe von `/pay/` seit 13.11., unsere 402 im Zweig `Aufladung offen`, sieben Stellen der Runtime am Pin) und vor der ersten 503 `gemeldet`; neuer Test `test/credit-before-503.test.ts` (sechs Läufe von 9,37 USD auf 0), rot gegen die Mutation Schwelle 0 (`CP_CREDIT_WARN_USD=0`, `CP_CREDIT_WARN_DAYS=0`: nur eine Meldung `credit empty`, `expected 1 to be greater than or equal to 2`); den Fall mit festem Rest gab es schon in `test/watchdog-credit-kritik.test.ts` ("empty after LOW: two runs at 4 USD, three at 0 USD …"), nicht als fallende Folge; Messwerkzeuge mit Gegenprobe (gepflanzte Zeile `/pay/5` zählt 1, Schwelle 0 und früherer Block sagen `über der kleinsten Stufe`); Nebenbefund als `goals/_vorschlaege/kunden-kritik-2026-11-20-1.md` (Schwere 3), vier Annahmen. Prüfbefehle: P1 `spaet genug`, 1, 7, 1, 1, 1, `stimmig`, Netz leer; P2 vitest Exit 0, `da`, 4, `stimmig`; P3 0, 0, 4; P4 `check` Exit 0 (grün in 208 s).
- 2026-11-20 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4; `origin/dev` hatte seit dem Start keinen neuen Commit, nichts zu mergen, jeder Prüfbefehl am Kopf `e3edb80` neu gefahren. Prüfbefehle: P1 `spaet genug`, 1, 7, 1, 1, 1, `stimmig`, Netz leer; P2 vitest Exit 0, `da`, 4, `stimmig`; P3 0, 0, 4; P4 `check` Exit 0 (grün in 59 s); PR #316 `check` pass, `e2e` pass (Lauf 44686235153).
- 2026-11-20 Zyklus 3: Gaps aus Verdict `05-z2-B.md` behoben, Abschluss gemeldet, Punkte 1, 2, 3, 4: `goals/_vorschlaege/kunden-kritik-2026-11-20-1.md` entfernt und der Verweis darauf im Dokument gestrichen (der Nebenbefund bleibt als Absatz), der Halbsatz mit dem Betrag zu Kunde 1 gestrichen; `origin/dev` ohne neuen Commit. Prüfbefehle: P1 `spaet genug`, 1, 7, 1, 1, 1, `stimmig`, Netz leer; P2 vitest Exit 0, `da`, 4, `stimmig`; P3 0, 0, 4; P4 `check` Exit 0 (grün in 111 s).

## Blockers
