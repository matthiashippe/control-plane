# Kanal Goal 05: Urteil je Antwort, welche davon Automatons gebracht hat

## Status
PLANNED

## Active Objective
`ops/github-yield.sh` zählt heute jede Ankunft mit Referrer `github.com/Conway-Research` in eine Summe über einen Zeitraum. Seit dem
12.11.2026 stehen die Antworten zweier Runden im selben Fenster (Runde 1 am 11.11.: #434, #430, #427; Runde 2 am 12.11.: #447, #406,
#408), und eine Anmeldung über #408 würde die Regel aus `goals/kanal/ertrag.md` für die erste Runde retten, ohne dass jemand sieht,
welche Antwort gewirkt hat. Die zweite Zeile zählt jede neue Wallet, unsere eigenen Prüfläufe eingeschlossen, und sagt deshalb nicht,
ob die eine zahlende Wallet ein Kunde ist. Nach diesem Goal schreibt das Werkzeug je Issue-Nummer aus dem Pfad des Referrers eine
Zeile `ISSUE <n>: <a> arrived, <b> signed in, <c> paid`, die Summenzeile lautet `ALL NEW since <t>: <w> new wallets (<o> ours),
<p> paying (<q> ours)`, und in `goals/kanal/ertrag.md` steht das Urteil über beide Runden je Issue: welche Antwort Anmeldungen und
Zahlungen brachte und ob die nächste Runde ein Antwortpaket oder ein anderer Kanal wird.
Widerlegt, wenn die Zählung je Issue dieselben Summen ergibt wie heute und keine Anmeldung einer Runde zuordnet.
MVP: Funktion, weil die Entscheidung über den einzigen Kanal zu fremden Automatons sonst auf einer Summe fällt, die zwei Runden und
unsere eigenen Wallets vermischt.

## Voraussetzungen
- kanal Goal 04 DONE
- frühestens 2026-11-26

## Kontext für den Maker
- Ziel: Matthias entscheidet am Tag des Urteils mit gemessenen Zahlen je Antwort, ob die nächste Runde wieder Antworten in Conways
  Tracker bringt oder ob neue zahlende Kunden über einen anderen Kanal kommen müssen.
- Übernimmt `goals/_vorschlaege/kanal-kritik-2026-11-12-3.md` (Ertrag je Issue-Nummer) und
  `goals/_vorschlaege/kanal-kritik-2026-11-12-4.md` (eigene Wallets getrennt zählen).
- Start: Die ROADMAP nennt den 25.11.2026. Die 14 Tage der ersten Runde enden aber erst am 25.11. um 07:08 UTC, und der Loop Master
  startet ab 00:00 UTC; deshalb `frühestens 2026-11-26` (Tech Lead, 14.11.2026). Die zweite Runde hat bei der Messung rund 13 Tage
  hinter sich; das Urteil nennt die Tage je Runde.
- Je Issue: Die Nummer kommt aus dem Pfad des Referrers der ersten Anfrage einer fremden Adresse im Fenster, nur für
  `https://github.com/Conway-Research/automaton/issues/<n>` und `…/automaton/pull/<n>` (Anhang `#…` oder `?…` egal). Eine Ankunft von
  einem anderen Repo der Organisation zählt wie heute in der Summenzeile, aber in keiner Zeile `ISSUE`. Gezählt wird mit derselben
  Funktion wie die Summenzeile (angemeldet: später `POST /v1/auth/verify` mit 200 von derselben Adresse; gezahlt: später `/pay/` mit
  200), nur fremde Adressen. Je Nummer eine Zeile, aufsteigend sortiert, nach der Zeile `WINDOW`, damit die Zeilen 1 bis 4 an ihrer
  Stelle bleiben (die Prüfungen von kanal 03 lesen `head -1`). Eine Zeile steht für jede Nummer, die einen Referrer trägt, und für
  jede Nummer, die `ops/posted-answers.log` mit einem Zeitstempel ab `--since` nennt, auch mit `0 arrived, 0 signed in, 0 paid`, damit
  eine Null je Antwort sichtbar gemessen ist. Die Datei der Posts lässt sich über `CP_POSTED_ANSWERS` umlenken, wie `CP_OWN_IPS` die
  eigene Liste; fehlt sie oder ist sie nicht lesbar, Exit 2 wie beim Log.
- Eigene Wallets: Die Datenbank kennt keine Adresse der Anfrage, aber `ensureWallet` in `src/auth/siwe.ts` legt die Wallet beim
  ersten erfolgreichen `POST /v1/auth/verify` an, mit `created_at` dieses Moments. Das Werkzeug ordnet jeder Wallet mit `siwe: 1` die
  Zeile `POST /v1/auth/verify` mit 200 zu, deren `ts` `created_at` am nächsten liegt, höchstens 5 s entfernt; steht deren Adresse in
  der eigenen Liste, zählt die Wallet als `ours`, und zahlt sie, auch die Zahlung. `WALLETS_JS` liefert dazu je Wallet
  `"siwe": 1` für eine Adresse, die mit `0x` beginnt, sonst `0`, nie die Adresse selbst. Eine Zeile ohne das Feld gilt als `siwe: 1`.
  Eine Wallet ohne passende Zeile (Schlüssel ohne Wallet über `/v1/auth/keyless`, Checkout, Lücke im Log) zählt als fremd, damit die
  obere Zahl eine obere Grenze bleibt; das steht als Zeile in `goals/kanal/ANNAHMEN.md`.
- Neue Fixtures, die alten bleiben unverändert (der Audit fährt die Prüfungen von kanal 03 jede Nacht gegen sie):
  `ops/fixtures/github-yield-rounds.log` mit Zeitstempeln nach 2026-11-11T07:04:50Z, nur Adressen aus RFC 5737
  (192.0.2.x, 198.51.100.x, 203.0.113.x): eine fremde Adresse kommt über #434, meldet sich an und zahlt nicht; eine andere fremde
  Adresse kommt über #447, meldet sich an und zahlt mit `/pay/` 200; die eigene Adresse aus `ops/fixtures/github-yield-own-ips.txt`
  kommt über #434, meldet sich an und zahlt. Dazu `ops/fixtures/github-yield-rounds-wallets.jsonl` mit genau den drei Wallets dieser
  Anmeldungen (`created_at` unter einer Sekunde nach dem `ts` der Anmeldung, bezahlt die der zweiten fremden und die eigene) und
  `ops/fixtures/github-yield-posted.log` mit den sechs Zeilen der beiden Runden aus `ops/posted-answers.log`. Erwartet bei
  `--since 2026-11-11T07:04:50Z`: `ISSUE 434: 1 arrived, 1 signed in, 0 paid`, `ISSUE 447: 1 arrived, 1 signed in, 1 paid`, für
  430, 427, 406 und 408 je `0 arrived, 0 signed in, 0 paid`, und `ALL NEW since 2026-11-11T07:04:50Z: 3 new wallets (1 ours),
  2 paying (1 ours)`. Gegenprobe ohne die eigene Adresse in der Liste: `ISSUE 434: 2 arrived, 2 signed in, 1 paid` und
  `3 new wallets (0 ours), 2 paying (0 ours)`.
- Tests in `test/github-yield.test.ts`, mindestens drei neue: jede Antwort zählt nur in ihrer Zeile (Testname enthält
  `own issue line`), eine Anmeldung von der eigenen Adresse zählt nur als `ours` (Testname enthält `only as ours`), und die Gegenprobe
  ohne eigene Liste. Die bestehenden Fälle bleiben mit ihren Erwartungen stehen; geändert wird nur die erwartete Zeile `ALL NEW` im
  Fall „counts the planted arrival, sign-in and payment and nothing else“, auf genau
  `ALL NEW since 2026-11-06T22:20:00Z: 3 new wallets (1 ours), 1 paying (0 ours)` (die Wallet von 23:28:21 gehört zur Anmeldung der
  eigenen Adresse 203.0.113.99), dasselbe im Selftest des Skripts. Der Selftest bekommt die neuen Fälle in beide Richtungen dazu, ihre
  Zeilen nennen `issue` und `ours`. Jeder neue Test lief einmal gegen `ops/github-yield.sh` von `origin/dev` und war rot; die Zeile im
  Progress Log nennt, womit.
- Die Messung, nur lesend gegen die Produktion (`loop-constraints.md`, Produktion: nur lesen): `set -a; .
  ~/.config/control-plane/loop.env; set +a`, dann `bash ops/github-yield.sh --since 2026-11-11T07:04:50Z`. Die vollständige Ausgabe
  steht als Codeblock in `goals/kanal/ertrag.md`, darüber der Befehl.
- `goals/kanal/ertrag.md` wächst nur: Alles, was dort steht, bleibt Byte für Byte (die Prüfungen von kanal 03 lesen die Zeilen
  `Ertrag Runde 1:`, `Alle neuen:`, den Befehl und `2026-11-25`). Darunter ein neuer Abschnitt mit genau diesen Zeilen, je eine:
  `Gemessen: <ISO UTC der Messung>`; je Nummer der beiden Runden `- #<n> (Runde <1|2>): <a> kamen, <b> angemeldet, <c> gezahlt`;
  `Alle neuen (eigene getrennt): <w> Wallets (<o> eigene), <p> zahlend (<q> eigene)`; `Regel je Runde: …` mit den Nummern beider
  Runden (Bringen die Antworten einer Runde in den 14 Tagen nach ihrem letzten Post keine Anmeldung über ihre Nummern, ist diese Runde
  widerlegt; die alte Regel über den Zeitraum ist damit abgelöst); `Nächste Runde: Antwortpaket, weil …` nur, wenn mindestens eine
  der sechs Zeilen eine Anmeldung zählt, sonst `Nächste Runde: anderer Kanal, weil …`. Keine Adresse, keine Wallet.
- `goals/kanal/ANNAHMEN.md`: Zeilen `- <Datum>, kanal 05: …` zur Zuordnung der Wallets (5 s, nächste Zeile, ohne Treffer fremd) und
  zur Startverschiebung auf den 26.11.
- Kein `--send`, kein Kommentar in `Conway-Research/automaton`, kein Human Gate. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`),
  `check` und vitest im Vordergrund mit eigenem Timeout.

## Done Condition
- [ ] `ops/github-yield.sh` schreibt je Issue-Nummer aus dem Referrer eine Zeile `ISSUE <n>: …`, jede Ankunft zählt nur in der Zeile
      ihrer Antwort, und die Summenzeile trennt eigene Wallets ab; in beide Richtungen bewiesen.
      Prüfung: `pnpm -s vitest run test/github-yield.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/github-yield.test.ts` muss mindestens 15 ausgeben.
      Prüfung: `pnpm -s vitest run test/github-yield.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed").map(a=>a.title);console.log(t.filter(x=>/own issue line/.test(x)).length>0&&t.filter(x=>/only as ours/.test(x)).length>0?"beide":"fehlt")})'` muss `beide` ausgeben.
      Prüfung: `bash ops/github-yield.sh --selftest | tail -1` muss mit `SELFTEST OK` beginnen.
      Prüfung: `bash ops/github-yield.sh --selftest | grep -ciE "^ok .*issue"` muss mindestens 1 ausgeben.
      Prüfung: `bash ops/github-yield.sh --selftest | grep -cE "^ok .*ours"` muss mindestens 1 ausgeben.
      Prüfung: `CP_OWN_IPS=ops/fixtures/github-yield-own-ips.txt CP_POSTED_ANSWERS=ops/fixtures/github-yield-posted.log bash ops/github-yield.sh --log ops/fixtures/github-yield-rounds.log --wallets ops/fixtures/github-yield-rounds-wallets.jsonl --since 2026-11-11T07:04:50Z | grep -cxE "ISSUE 434: 1 arrived, 1 signed in, 0 paid|ISSUE 447: 1 arrived, 1 signed in, 1 paid|ISSUE (430|427|406|408): 0 arrived, 0 signed in, 0 paid"` muss 6 ausgeben.
      Prüfung: `CP_OWN_IPS=ops/fixtures/github-yield-own-ips.txt CP_POSTED_ANSWERS=ops/fixtures/github-yield-posted.log bash ops/github-yield.sh --log ops/fixtures/github-yield-rounds.log --wallets ops/fixtures/github-yield-rounds-wallets.jsonl --since 2026-11-11T07:04:50Z | grep -cx "ALL NEW since 2026-11-11T07:04:50Z: 3 new wallets (1 ours), 2 paying (1 ours)"` muss 1 ausgeben.
      Prüfung: `o=$(mktemp); echo "192.0.2.254 2026-11-14  not in the fixture" >"$o"; CP_OWN_IPS="$o" CP_POSTED_ANSWERS=ops/fixtures/github-yield-posted.log bash ops/github-yield.sh --log ops/fixtures/github-yield-rounds.log --wallets ops/fixtures/github-yield-rounds-wallets.jsonl --since 2026-11-11T07:04:50Z | grep -cxE "ISSUE 434: 2 arrived, 2 signed in, 1 paid|ALL NEW since 2026-11-11T07:04:50Z: 3 new wallets \(0 ours\), 2 paying \(0 ours\)"` muss 2 ausgeben.
      Prüfung: `CP_POSTED_ANSWERS=ops/fixtures/github-yield-posted.log CP_OWN_IPS=ops/fixtures/github-yield-own-ips.txt bash ops/github-yield.sh --log ops/fixtures/github-yield-rounds.log --wallets ops/fixtures/github-yield-rounds-wallets.jsonl --since 2026-11-11T07:04:50Z | grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}"` muss 0 ausgeben.
      Prüfung: `grep -ohE '"(remote_ip|client_ip)": ?"[^"]*"' ops/fixtures/github-yield-rounds.log | grep -cvE '"(192\.0\.2|198\.51\.100|203\.0\.113)\.[0-9]+"'` muss 0 ausgeben.
      Prüfung: `CP_POSTED_ANSWERS=ops/fixtures/no-such-posted.log bash ops/github-yield.sh --log ops/fixtures/github-yield-rounds.log --since 2026-11-11T07:04:50Z >/dev/null 2>&1; echo $?` muss `2` ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- ops/fixtures/github-yield.log ops/fixtures/github-yield-wallets.jsonl ops/fixtures/github-yield-own-ips.txt | wc -l` muss 0 ausgeben.
- [ ] Das Urteil über beide Runden steht je Issue gemessen in `goals/kanal/ertrag.md`, mit Befehl, Ausgabe und Entscheidung über die
      nächste Runde, ohne Adresse.
      Prüfung: `grep -cE "^- #(434|430|427) \(Runde 1\): [0-9]+ kamen, [0-9]+ angemeldet, [0-9]+ gezahlt$|^- #(447|406|408) \(Runde 2\): [0-9]+ kamen, [0-9]+ angemeldet, [0-9]+ gezahlt$" goals/kanal/ertrag.md` muss 6 ausgeben.
      Prüfung: `awk '/^Gemessen: /{print ($2 >= "2026-11-26T00:00:00Z") ? "spaet genug" : "zu frueh"}' goals/kanal/ertrag.md` muss genau `spaet genug` ausgeben.
      Prüfung: `grep -cE "^ISSUE (434|430|427|447|406|408): [0-9]+ arrived, [0-9]+ signed in, [0-9]+ paid$" goals/kanal/ertrag.md` muss 6 ausgeben.
      Prüfung: `grep -cE "^Alle neuen \(eigene getrennt\): [0-9]+ Wallets \([0-9]+ eigene\), [0-9]+ zahlend \([0-9]+ eigene\)$" goals/kanal/ertrag.md` muss 1 ausgeben.
      Prüfung: `grep -E "^Regel je Runde: " goals/kanal/ertrag.md | grep -c "447"` muss 1 ausgeben.
      Prüfung: `s=$(grep -E "^- #[0-9]+ \(Runde [12]\): " goals/kanal/ertrag.md | sed -E 's/.* kamen, ([0-9]+) angemeldet.*/\1/' | awk '{t+=$1} END{print t+0}'); grep -cE "^Nächste Runde: $([ "$s" -gt 0 ] && echo Antwortpaket || echo 'anderer Kanal'), weil " goals/kanal/ertrag.md` muss 1 ausgeben.
      Prüfung: `grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}" goals/kanal/ertrag.md` muss 0 ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- goals/kanal/ertrag.md | grep -cE "^-[^-]"` muss 0 ausgeben.
      Prüfung: `grep -cE "^- [0-9-]+, kanal 05: " goals/kanal/ANNAHMEN.md` muss mindestens 1 ausgeben.
      Prüfung (Netz): `bash ops/github-yield.sh --since 2026-11-11T07:04:50Z | grep -cE "^ISSUE (434|430|427|447|406|408): [0-9]+ arrived, [0-9]+ signed in, [0-9]+ paid$"` muss 6 ausgeben.
      Prüfung (Netz): `bash ops/github-yield.sh --since 2026-11-11T07:04:50Z | grep -cE "^ALL NEW since 2026-11-11T07:04:50Z: [0-9]+ new wallets \([0-9]+ ours\), [0-9]+ paying \([0-9]+ ours\)$"` muss 1 ausgeben.
- [ ] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Test war vor dem Werkzeug rot; die Zeile im Progress Log nennt, womit.
- [ ] Keine Zeile der Ausgabe und keine Zeile in `goals/kanal/ertrag.md` nennt eine Adresse oder eine Wallet.
- [ ] Die Zeilen 1 bis 4 der Ausgabe stehen an ihrer Stelle, die Zeilen `GITHUB YIELD`, `BARE GITHUB REFERRER` und `WINDOW` im
      bisherigen Wortlaut.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei, `ertrag.md` und `ANNAHMEN.md` Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `src/**`, `harness/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`
- `ops/before-the-answers.py`, `ops/post-the-answers.py`, `ops/answers_args.py`, `ops/access-log.sh`: unverändert
- `ops/posted-answers.log`, `ops/own-ips.txt`, `goals/kanal/antworten/**`, `goals/kanal/antworten-03/**`, `goals/kanal/issues*.md`
  und die Goal-Dateien kanal 01 bis 04: nur lesen
- `ops/fixtures/github-yield.log`, `ops/fixtures/github-yield-wallets.jsonl`, `ops/fixtures/github-yield-own-ips.txt`: unverändert
- `goals/kanal/ertrag.md`: nur anhängen
- jedes Schreiben in der Produktion, jedes `--send` gegen GitHub, jeder Kommentar in `Conway-Research/automaton` (Human Gate
  `public_post`)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
