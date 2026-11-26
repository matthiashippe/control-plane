# Kanal Goal 09: Bringen unsere Kommentare in den Conway-Threads Anmeldungen, je Thread?

## Status
PLANNED

## Active Objective
Das Konto hat in `Conway-Research/automaton` Kommentare in 29 Threads: neun Antworten der Runden 0 bis 2 vom 10. bis 12.11.2026
(`ops/posted-answers.log`) und die Kommentare, die reichweite 02 am 22.11.2026 zwischen 22:06 und 22:24 UTC auf die passende Seite von
automatonhost.com umgestellt hat (`ops/relinked-comments.log`), seit reichweite 04 mit dem Namen im ersten Satz. `ops/github-yield.sh`
zählt heute jede Ankunft mit Referrer `github.com/Conway-Research` in eine Summe über einen Zeitraum, dazu die eigenen Prüfläufe in der
Zahl neuer Wallets, und sagt deshalb nicht, ob irgendein Kommentar einen Kunden gebracht hat. Nach diesem Goal schreibt das Werkzeug
je Thread mit einem Kommentar des Kontos eine Zeile `ISSUE <n>: <a> arrived, <b> signed in, <c> paid`, je Zielseite aus
`ops/relinked-comments.log` eine Zeile `PAGE <slug|home> (issues <n> …): <a> arrived, <b> signed in, <c> paid` für Ankünfte mit einem
Referrer von github.com auf genau dieser Seite (GitHub kürzt den Referrer oft auf `https://github.com/`, dann sieht nur die Seite den
Thread), und die Summenzeile trennt eigene Wallets ab (`ALL NEW since <t>: <w> new wallets (<o> ours), <p> paying (<q> ours)`). In
`goals/kanal/ertrag.md` steht danach das Urteil je Thread und je Seite, vor und nach dem Umstellen, und genau eine Zeile
`Nächste Runde:`, die zwischen weiteren Kommentaren und einem neuen Kanal wählt.
Leitzahl: Anmeldungen über Kommentare je Woche (Zeilen `ISSUE` und `PAGE` nach dem Umstellen).
Widerlegt, wenn die Zählung je Thread und je Seite dieselben Summen ergibt wie die Summenzeile und keine Ankunft einem Thread oder einer
Seite zuordnet.
MVP: Funktion, weil reichweite 02 bis 05 die Kommentare pflegen und erst diese Zählung zeigt, ob sie Kunden bringen.

## Voraussetzungen
- kanal Goal 04 DONE
- frühestens 2026-12-01

## Kontext für den Maker
- Ziel: Der Tech Lead entscheidet mit gemessenen Zahlen je Thread und je Seite, ob weitere Kommentare in fremden Threads neue
  zahlende Kunden bringen oder ob der nächste Kunde über einen neuen Kanal kommen muss.
- Ersetzt kanal 06 (Tech Lead 26.11.2026, PRO-30347 aus der Loop-Triage PRO-30316): Das Glied 06 steht in `ROADMAP.md` auf `entfällt`,
  weil die übernommene Schärfung aus `goals/_vorschlaege/kanal-kritik-2026-11-23-1.md` und `goals/_vorschlaege/kanal-kritik-2026-11-25-1.md`
  Zählung und Urteil umbaut und die Goal-Datei auf PLANNED nur über die Human Inbox zu ändern wäre. Dieses Goal trägt alles aus
  kanal 06 (das schon kanal 05 trug) mit drei Änderungen: alle Threads mit einem Kommentar des Kontos statt nur der neun Antworten,
  die Zeilen `PAGE` je Zielseite, und eine Zeile `Nächste Runde:` ohne Idee 3, weil paket 01 sie am 22.11.2026 gebaut hat und paket 02
  sie misst. `goals/kanal/05-…` und `goals/kanal/06-…` bleiben unverändert liegen.
- Übernimmt `goals/_vorschlaege/kanal-kritik-2026-11-12-3.md` (Ertrag je Issue-Nummer) und
  `goals/_vorschlaege/kanal-kritik-2026-11-12-4.md` (eigene Wallets getrennt zählen), seit 16.11.2026 dazu
  `goals/_vorschlaege/kanal-kritik-2026-11-15-1.md` (obere Grenze im Urteil) und `goals/_vorschlaege/kanal-kritik-2026-11-15-2.md`
  (Runde 0 vom 10.11.), Tech Lead 16.11.2026.
- Start: frühestens am 01.12.2026, sieben Tage nach reichweite 04 (Kommentare nennen automatonhost.com beim Namen, gemergt am
  24.11.2026 um 17:03 UTC) und gut acht Tage nach dem Umstellen; der Loop Master startet ab 00:00 UTC. Das Urteil nennt die Tage je
  Zeitraum.
- Threads: jede Nummer, die `ops/posted-answers.log` oder `ops/relinked-comments.log` nennt (heute 29 Nummern, alle in
  `Conway-Research/automaton`). Die Datei der Umstellungen lässt sich über `CP_RELINKED_COMMENTS` umlenken wie die Datei der Posts über
  `CP_POSTED_ANSWERS`; fehlt sie oder ist sie nicht lesbar, Exit 2. Format je Zeile wie in `ops/relinked-comments.log`:
  `<iso8601-utc> comment <id> issue <n> page <slug|home> old <sha12> new <sha12>`, Zeilen mit `#` am Anfang sind Kommentar.
- Vor und nach dem Umstellen: vorher heißt `--since 2026-11-10T14:03:20Z --until 2026-11-22T22:06:23Z` (erste Antwort bis erste
  Umstellung), nachher `--since 2026-11-22T22:24:14Z` (letzte Umstellung) bis zur Messung. Beide Zeitpunkte stehen fest in
  `ops/relinked-comments.log`; die Zeit dazwischen zählt in keinem der beiden Läufe.
- Je Seite (`PAGE`): Die Seite einer Zeile in der Datei der Umstellungen ist `/errors/<slug>`, bei `home` die Startseite `/`. Eine
  fremde Adresse zählt für eine Seite, wenn ihre erste Anfrage im Fenster genau diesen Pfad trägt (ohne Anhang `?…` oder `#…`, gleich
  welcher Host) und ihr Referrer mit `https://github.com/` beginnt, auch der nackte Origin. Angemeldet und gezahlt zählen wie in der
  Summenzeile. Je Seite eine Zeile, aufsteigend nach slug, `home` zuletzt, mit den Nummern aller Threads dieser Seite aufsteigend in der
  Klammer, nach den Zeilen `ISSUE`. Zeilen `PAGE` gibt es nur, wenn das Fenster nach der ersten Umstellung endet oder kein `--until`
  hat. Eine Ankunft kann in einer Zeile `ISSUE` und in einer Zeile `PAGE` stehen; das ist gewollt, die Zeilen sind zwei Sichten und
  keine Summe, und steht als Zeile in `goals/kanal/ANNAHMEN.md`.
- Runden: Runde 0 sind #440, #442 und #443 (10.11.2026, 14:03:20 bis 14:06:24 UTC), Runde 1 #434, #430 und #427 (11.11.), Runde 2
  #447, #406 und #408 (12.11.), je aus `ops/posted-answers.log`. Gemessen wird überall ab `--since 2026-11-10T14:03:20Z`, damit eine
  Ankunft über #440 nicht vor dem Fenster liegt; die Zeilen `Ertrag Runde 1:` und `Alle neuen:` in `goals/kanal/ertrag.md` bleiben
  unverändert stehen.
- `--until <ISO UTC>` (neu in `ops/github-yield.sh`, geprüft wie `--since`, Exit 1 bei einer Zeit, die keine ISO-Zeit in UTC ist
  oder nicht nach `--since` liegt): Jede Zählung nimmt dann nur Zeilen des Logs, Wallets (`created_at`) und Posts aus
  `ops/posted-answers.log` mit einem Zeitpunkt vor `--until`. Ohne `--until` bleibt jede Ausgabe Byte für Byte wie ohne die Option,
  auch die Zeilen 1 bis 4 und ihr Wortlaut.
- Obere Grenze je Runde: `t` ist der erste Post der Runde, `d` die Tage bis zur Messung, höchstens 14. Fremde neue Wallets sind
  `<w>` minus `<o>` aus der Zeile `ALL NEW`, danach aus `--since t --until t+d`, davor aus `--since t-d --until t`. Die Fenster der
  drei Runden überschneiden sich; das ist so gewollt, weil die obere Grenze nur zeigen soll, ob nach den Antworten mehr fremde
  Wallets kamen als vorher, nicht welche Antwort sie brachte. Das steht als Zeile in `goals/kanal/ANNAHMEN.md`.
- Je Issue: Die Nummer kommt aus dem Pfad des Referrers der ersten Anfrage einer fremden Adresse im Fenster, nur für
  `https://github.com/Conway-Research/automaton/issues/<n>` und `…/automaton/pull/<n>` (Anhang `#…` oder `?…` egal). Eine Ankunft von
  einem anderen Repo der Organisation zählt wie heute in der Summenzeile, aber in keiner Zeile `ISSUE`. Gezählt wird mit derselben
  Funktion wie die Summenzeile (angemeldet: später `POST /v1/auth/verify` mit 200 von derselben Adresse; gezahlt: später `/pay/` mit
  200), nur fremde Adressen. Je Nummer eine Zeile, aufsteigend sortiert, nach der Zeile `WINDOW`, damit die Zeilen 1 bis 4 an ihrer
  Stelle bleiben (die Prüfungen von kanal 03 lesen `head -1`). Eine Zeile steht für jede Nummer, die einen Referrer trägt, für
  jede Nummer, die `ops/posted-answers.log` mit einem Zeitstempel ab `--since` nennt, und für jede Nummer, die die Datei der
  Umstellungen mit einem Zeitstempel vor `--until` nennt (ohne `--until` jede), auch mit `0 arrived, 0 signed in, 0 paid`, damit eine
  Null je Thread sichtbar gemessen ist. Die Kommentare der umgestellten Threads sind älter als ihre Umstellung, deshalb gilt dort keine
  untere Grenze. Die Datei der Posts lässt sich über `CP_POSTED_ANSWERS` umlenken, wie `CP_OWN_IPS` die
  eigene Liste; fehlt sie oder ist sie nicht lesbar, Exit 2 wie beim Log.
- Neue Issues: `--issues <datei>` (neu in `ops/github-yield.sh`) liest ein JSON-Array mit Feldern `number` und `createdAt`, wie es
  `gh issue list -R Conway-Research/automaton --state all --limit 300 --json number,createdAt` ausgibt. `<t>` ist der späteste
  Zeitstempel in der Datei der Posts (`CP_POSTED_ANSWERS`, heute `2026-11-12T20:46:36Z`). Das Werkzeug schreibt dann als letzte Zeile
  `NEW ISSUES since <t>: <n>` mit der Zahl der Issues, deren `createdAt` nach `<t>` liegt, gleich welcher Zustand und welches Thema
  (ein Antwortpaket braucht zuerst überhaupt einen Empfänger; welche davon Anmelde- oder Zahlungsfehler sind, wählt die Runde selbst).
  Ohne `--issues` gibt es diese Zeile nicht, und jede Ausgabe bleibt Byte für Byte wie ohne die Option. Eine Datei, die fehlt oder kein
  solches Array ist, ist Exit 2. Das Werkzeug ruft GitHub nie selbst auf. Neue Fixtures `ops/fixtures/github-yield-issues.json` (#446
  `2026-11-10T05:40:08Z`, #447 `2026-11-10T23:53:31Z`, #900 `2026-11-20T10:00:00Z`) und `ops/fixtures/github-yield-issues-none.json`
  (nur #446 und #447). Erwartet mit `CP_POSTED_ANSWERS=ops/fixtures/github-yield-posted.log`: `NEW ISSUES since 2026-11-12T20:46:36Z: 1`
  und `…: 0`. Test in `test/github-yield.test.ts` (Testname enthält `new issues`), Selftest-Zeile mit `issues`.
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
  `ops/fixtures/github-yield-posted.log` mit den neun Zeilen der drei Runden aus `ops/posted-answers.log`. Alle Zeilen zu #434 und
  zur eigenen Adresse liegen vor `2026-11-12T20:45:00Z`, alle zu #447 danach. Erwartet bei
  `--since 2026-11-11T07:04:50Z`: `ISSUE 434: 1 arrived, 1 signed in, 0 paid`, `ISSUE 447: 1 arrived, 1 signed in, 1 paid`, für
  430, 427, 406 und 408 je `0 arrived, 0 signed in, 0 paid`, und `ALL NEW since 2026-11-11T07:04:50Z: 3 new wallets (1 ours),
  2 paying (1 ours)`. Gegenprobe ohne die eigene Adresse in der Liste: `ISSUE 434: 2 arrived, 2 signed in, 1 paid` und
  `3 new wallets (0 ours), 2 paying (0 ours)`. Bei `--since 2026-11-10T14:03:20Z` dieselben Zeilen und dazu je
  `0 arrived, 0 signed in, 0 paid` für 440, 442 und 443. Bei `--since 2026-11-11T07:04:50Z --until 2026-11-12T20:45:00Z`:
  `ISSUE 434: 1 arrived, 1 signed in, 0 paid`, `ISSUE 447: 0 arrived, 0 signed in, 0 paid`, keine Zeile für 406 und 408 und
  `ALL NEW since 2026-11-11T07:04:50Z: 2 new wallets (1 ours), 1 paying (1 ours)`.
- Tests in `test/github-yield.test.ts`, mindestens drei neue: jede Antwort zählt nur in ihrer Zeile (Testname enthält
  `own issue line`), eine Anmeldung von der eigenen Adresse zählt nur als `ours` (Testname enthält `only as ours`), und die Gegenprobe
  ohne eigene Liste; dazu einer für `--until` (Testname enthält `until`). Die bestehenden Fälle bleiben mit ihren Erwartungen stehen; geändert wird nur die erwartete Zeile `ALL NEW` im
  Fall „counts the planted arrival, sign-in and payment and nothing else“, auf genau
  `ALL NEW since 2026-11-06T22:20:00Z: 3 new wallets (1 ours), 1 paying (0 ours)` (die Wallet von 23:28:21 gehört zur Anmeldung der
  eigenen Adresse 203.0.113.99), dasselbe im Selftest des Skripts. Der Selftest bekommt die neuen Fälle in beide Richtungen dazu, ihre
  Zeilen nennen `issue`, `ours` und `until`. Jeder neue Test lief einmal gegen `ops/github-yield.sh` von `origin/dev` und war rot; die Zeile im
  Progress Log nennt, womit.
- Neue Fixtures für Threads und Seiten, nur Adressen aus RFC 5737: `ops/fixtures/github-yield-relinked.log` mit den zwei
  Kopfzeilen aus `ops/relinked-comments.log` und drei Zeilen (`2026-11-22T22:06:23Z … issue 447 page verify-500-database-error …`,
  `2026-11-22T22:08:40Z … issue 443 page home …`, `2026-11-22T22:09:01Z … issue 293 page home …`, Kommentar-IDs 1 bis 3, beliebige
  `sha12`); `ops/fixtures/github-yield-pages.log` mit Zeitstempeln nach 2026-11-22T22:24:14Z: eine fremde Adresse kommt mit Referrer
  `https://github.com/` auf `/errors/verify-500-database-error` und meldet sich an, eine zweite fremde Adresse kommt mit Referrer
  `https://github.com/Conway-Research/automaton/issues/293` auf `/` und tut sonst nichts, die eigene Adresse 203.0.113.99 kommt mit
  Referrer `https://github.com/` auf `/errors/verify-500-database-error` und meldet sich an, eine dritte fremde Adresse kommt ohne
  Referrer auf dieselbe Seite; `ops/fixtures/github-yield-pages-wallets.jsonl` mit genau den zwei Wallets dieser Anmeldungen, keine
  bezahlt. Erwartet mit `CP_OWN_IPS=ops/fixtures/github-yield-own-ips.txt CP_POSTED_ANSWERS=ops/fixtures/github-yield-posted.log
  CP_RELINKED_COMMENTS=ops/fixtures/github-yield-relinked.log` und `--since 2026-11-22T22:24:14Z`: genau drei Zeilen `ISSUE`
  (`ISSUE 293: 1 arrived, 0 signed in, 0 paid`, `ISSUE 443: 0 arrived, 0 signed in, 0 paid`, `ISSUE 447: 0 arrived, 0 signed in, 0
  paid`), genau zwei Zeilen `PAGE` (`PAGE verify-500-database-error (issues 447): 1 arrived, 1 signed in, 0 paid`, `PAGE home (issues
  293 443): 1 arrived, 0 signed in, 0 paid`) und `ALL NEW since 2026-11-22T22:24:14Z: 2 new wallets (1 ours), 0 paying (0 ours)`. Mit
  `--until 2026-11-22T22:06:00Z` gibt es keine Zeile `PAGE` und keine Zeile für 293. Tests in `test/github-yield.test.ts` mit
  Testnamen, die `every thread` und `page line` enthalten, rot gegen `ops/github-yield.sh` von `origin/dev`; Selftest-Zeilen mit
  `thread` und `page`. Die Fälle aus kanal 06 laufen mit `CP_RELINKED_COMMENTS=/dev/null`, damit ihre Erwartungen gleich bleiben.
- Die Messung, nur lesend gegen die Produktion (`loop-constraints.md`, Produktion: nur lesen): `set -a; .
  ~/.config/control-plane/loop.env; set +a`, dann
  `f=$(mktemp); gh issue list -R Conway-Research/automaton --state all --limit 300 --json number,createdAt >"$f"; bash ops/github-yield.sh --since 2026-11-10T14:03:20Z --issues "$f"`,
  dazu vor dem Umstellen `bash ops/github-yield.sh --since 2026-11-10T14:03:20Z --until 2026-11-22T22:06:23Z` und nach dem Umstellen
  `bash ops/github-yield.sh --since 2026-11-22T22:24:14Z`. Die vollständige Ausgabe jedes der drei Läufe steht als eigener Codeblock in
  `goals/kanal/ertrag.md`, darüber der Befehl. Dazu je Runde die beiden Läufe der oberen Grenze, Befehl und
  nur die Zeile `ALL NEW` je Lauf (nicht die Zeilen `ISSUE`, damit deren Zählung bei 9 bleibt), im selben Codeblock oder einem
  eigenen.
- `goals/kanal/ertrag.md` wächst nur: Alles, was dort steht, bleibt Byte für Byte (die Prüfungen von kanal 03 lesen die Zeilen
  `Ertrag Runde 1:`, `Alle neuen:`, den Befehl und `2026-11-25`). Darunter ein neuer Abschnitt mit genau diesen Zeilen, je eine:
  `Gemessen: <ISO UTC der Messung>`; je Nummer der drei Runden `- #<n> (Runde <0|1|2>): <a> kamen, <b> angemeldet, <c> gezahlt`
  aus dem ersten Lauf; je Thread aus `ops/relinked-comments.log` `- #<n> (umgestellt): vorher <a> kamen, <b> angemeldet, nachher <c>
  kamen, <d> angemeldet` aus den Läufen vor und nach dem Umstellen; je Seite `- Seite <slug|home>: nachher <a> kamen, <b> angemeldet,
  <c> gezahlt`; `Alle neuen (eigene getrennt): <w> Wallets (<o> eigene), <p> zahlend (<q> eigene)`; je Runde
  `Obere Grenze Runde <r>: <a> fremde neue Wallets danach, <b> davor (je <d> Tage)`; `Regel je Runde: …` mit den Nummern aller drei
  Runden wie in kanal 06; dann genau eine Zeile `Nächste Runde:`: `weitere Kommentare, weil …`, wenn im Lauf nach dem Umstellen
  mindestens eine Zeile `ISSUE` oder `PAGE` eine Anmeldung zählt; sonst `neuer Kanal, weil …`, mit einem Kandidaten aus
  `docs/richtung/` oder `ROADMAP.md`, den noch kein Glied gebaut hat. Die Zeile nennt nie `Idee 3` und nie ein Antwortpaket auf neue
  Issues; die Zeile `NEW ISSUES since <t>: <n>` steht im Codeblock des ersten Laufs nur als Information. Keine Adresse, keine Wallet.
- `goals/kanal/ANNAHMEN.md`: Zeilen `- <Datum>, kanal 09: …` zur Zuordnung der Wallets (5 s, nächste Zeile, ohne Treffer fremd) und
  zur Startverschiebung auf den 26.11., dazu je eine zu Runde 0, zur oberen Grenze (Fenster, Überschneidung) und zur Zählung neuer
  Issues (jedes Issue, gleich welches Thema), dazu je eine zur Zeile `PAGE` (zwei Sichten, keine Summe) und zu den Zeitpunkten vor und
  nach dem Umstellen.
- Kein `--send`, kein Kommentar in `Conway-Research/automaton`, kein Human Gate; `gh issue list` liest nur. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`),
  `check` und vitest im Vordergrund mit eigenem Timeout.

## Done Condition
- [ ] `ops/github-yield.sh` schreibt je Issue-Nummer aus dem Referrer eine Zeile `ISSUE <n>: …`, jede Ankunft zählt nur in der Zeile
      ihrer Antwort, und die Summenzeile trennt eigene Wallets ab; in beide Richtungen bewiesen.
      Prüfung: `pnpm -s vitest run test/github-yield.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/github-yield.test.ts` muss mindestens 17 ausgeben.
      Prüfung: `pnpm -s vitest run test/github-yield.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed").map(a=>a.title);console.log([/own issue line/,/only as ours/,/until/,/new issues/,/every thread/,/page line/].every(r=>t.some(x=>r.test(x)))?"alle":"fehlt")})'` muss `alle` ausgeben.
      Prüfung: `bash ops/github-yield.sh --selftest | tail -1` muss mit `SELFTEST OK` beginnen.
      Prüfung: `bash ops/github-yield.sh --selftest | grep -ciE "^ok .*issue"` muss mindestens 1 ausgeben.
      Prüfung: `bash ops/github-yield.sh --selftest | grep -cE "^ok .*ours"` muss mindestens 1 ausgeben.
      Prüfung: `bash ops/github-yield.sh --selftest | grep -cE "^ok .*until"` muss mindestens 1 ausgeben.
      Prüfung: `CP_OWN_IPS=ops/fixtures/github-yield-own-ips.txt CP_POSTED_ANSWERS=ops/fixtures/github-yield-posted.log CP_RELINKED_COMMENTS=/dev/null bash ops/github-yield.sh --log ops/fixtures/github-yield-rounds.log --wallets ops/fixtures/github-yield-rounds-wallets.jsonl --since 2026-11-11T07:04:50Z | grep -cxE "ISSUE 434: 1 arrived, 1 signed in, 0 paid|ISSUE 447: 1 arrived, 1 signed in, 1 paid|ISSUE (430|427|406|408): 0 arrived, 0 signed in, 0 paid"` muss 6 ausgeben.
      Prüfung: `CP_OWN_IPS=ops/fixtures/github-yield-own-ips.txt CP_POSTED_ANSWERS=ops/fixtures/github-yield-posted.log CP_RELINKED_COMMENTS=/dev/null bash ops/github-yield.sh --log ops/fixtures/github-yield-rounds.log --wallets ops/fixtures/github-yield-rounds-wallets.jsonl --since 2026-11-11T07:04:50Z | grep -cx "ALL NEW since 2026-11-11T07:04:50Z: 3 new wallets (1 ours), 2 paying (1 ours)"` muss 1 ausgeben.
      Prüfung: `o=$(mktemp); echo "192.0.2.254 2026-11-14  not in the fixture" >"$o"; CP_OWN_IPS="$o" CP_POSTED_ANSWERS=ops/fixtures/github-yield-posted.log CP_RELINKED_COMMENTS=/dev/null bash ops/github-yield.sh --log ops/fixtures/github-yield-rounds.log --wallets ops/fixtures/github-yield-rounds-wallets.jsonl --since 2026-11-11T07:04:50Z | grep -cxE "ISSUE 434: 2 arrived, 2 signed in, 1 paid|ALL NEW since 2026-11-11T07:04:50Z: 3 new wallets \(0 ours\), 2 paying \(0 ours\)"` muss 2 ausgeben.
      Prüfung: `CP_POSTED_ANSWERS=ops/fixtures/github-yield-posted.log CP_OWN_IPS=ops/fixtures/github-yield-own-ips.txt bash ops/github-yield.sh --log ops/fixtures/github-yield-rounds.log --wallets ops/fixtures/github-yield-rounds-wallets.jsonl --since 2026-11-11T07:04:50Z | grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}"` muss 0 ausgeben.
      Prüfung: `grep -ohE '"(remote_ip|client_ip)": ?"[^"]*"' ops/fixtures/github-yield-rounds.log | grep -cvE '"(192\.0\.2|198\.51\.100|203\.0\.113)\.[0-9]+"'` muss 0 ausgeben.
      Prüfung: `CP_OWN_IPS=ops/fixtures/github-yield-own-ips.txt CP_POSTED_ANSWERS=ops/fixtures/github-yield-posted.log CP_RELINKED_COMMENTS=/dev/null bash ops/github-yield.sh --log ops/fixtures/github-yield-rounds.log --wallets ops/fixtures/github-yield-rounds-wallets.jsonl --since 2026-11-10T14:03:20Z | grep -cxE "ISSUE 434: 1 arrived, 1 signed in, 0 paid|ISSUE 447: 1 arrived, 1 signed in, 1 paid|ISSUE (440|442|443|430|427|406|408): 0 arrived, 0 signed in, 0 paid"` muss 9 ausgeben.
      Prüfung: `grep -cE "^2026-11-1[012]T[0-9:]{8}Z (440|442|443|434|430|427|447|406|408) " ops/fixtures/github-yield-posted.log` muss 9 ausgeben.
      Prüfung: `CP_OWN_IPS=ops/fixtures/github-yield-own-ips.txt CP_POSTED_ANSWERS=ops/fixtures/github-yield-posted.log CP_RELINKED_COMMENTS=/dev/null bash ops/github-yield.sh --log ops/fixtures/github-yield-rounds.log --wallets ops/fixtures/github-yield-rounds-wallets.jsonl --since 2026-11-11T07:04:50Z --until 2026-11-12T20:45:00Z | grep -cxE "ISSUE 434: 1 arrived, 1 signed in, 0 paid|ISSUE 447: 0 arrived, 0 signed in, 0 paid|ALL NEW since 2026-11-11T07:04:50Z: 2 new wallets \(1 ours\), 1 paying \(1 ours\)"` muss 3 ausgeben.
      Prüfung: `CP_OWN_IPS=ops/fixtures/github-yield-own-ips.txt CP_POSTED_ANSWERS=ops/fixtures/github-yield-posted.log CP_RELINKED_COMMENTS=/dev/null bash ops/github-yield.sh --log ops/fixtures/github-yield-rounds.log --wallets ops/fixtures/github-yield-rounds-wallets.jsonl --since 2026-11-11T07:04:50Z --until 2026-11-12T20:45:00Z | grep -cE "^ISSUE (406|408):"` muss 0 ausgeben.
      Prüfung: `CP_POSTED_ANSWERS=ops/fixtures/github-yield-posted.log CP_RELINKED_COMMENTS=/dev/null bash ops/github-yield.sh --log ops/fixtures/github-yield-rounds.log --since 2026-11-11T07:04:50Z --until 2026-11-11T07:04:50Z >/dev/null 2>&1; echo $?` muss `1` ausgeben.
      Prüfung: `CP_POSTED_ANSWERS=ops/fixtures/no-such-posted.log CP_RELINKED_COMMENTS=/dev/null bash ops/github-yield.sh --log ops/fixtures/github-yield-rounds.log --since 2026-11-11T07:04:50Z >/dev/null 2>&1; echo $?` muss `2` ausgeben.
      Prüfung: `CP_POSTED_ANSWERS=ops/fixtures/github-yield-posted.log CP_RELINKED_COMMENTS=/dev/null bash ops/github-yield.sh --log ops/fixtures/github-yield-rounds.log --wallets ops/fixtures/github-yield-rounds-wallets.jsonl --since 2026-11-11T07:04:50Z --issues ops/fixtures/github-yield-issues.json | tail -1` muss genau `NEW ISSUES since 2026-11-12T20:46:36Z: 1` ausgeben.
      Prüfung: `CP_POSTED_ANSWERS=ops/fixtures/github-yield-posted.log CP_RELINKED_COMMENTS=/dev/null bash ops/github-yield.sh --log ops/fixtures/github-yield-rounds.log --wallets ops/fixtures/github-yield-rounds-wallets.jsonl --since 2026-11-11T07:04:50Z --issues ops/fixtures/github-yield-issues-none.json | tail -1` muss genau `NEW ISSUES since 2026-11-12T20:46:36Z: 0` ausgeben.
      Prüfung: `CP_POSTED_ANSWERS=ops/fixtures/github-yield-posted.log CP_RELINKED_COMMENTS=/dev/null bash ops/github-yield.sh --log ops/fixtures/github-yield-rounds.log --wallets ops/fixtures/github-yield-rounds-wallets.jsonl --since 2026-11-11T07:04:50Z | grep -c "^NEW ISSUES"` muss 0 ausgeben.
      Prüfung: `CP_POSTED_ANSWERS=ops/fixtures/github-yield-posted.log CP_RELINKED_COMMENTS=/dev/null bash ops/github-yield.sh --log ops/fixtures/github-yield-rounds.log --since 2026-11-11T07:04:50Z --issues ops/fixtures/no-such-issues.json >/dev/null 2>&1; echo $?` muss `2` ausgeben.
      Prüfung: `bash ops/github-yield.sh --selftest | grep -cE "^ok .*issues"` muss mindestens 1 ausgeben.
- [ ] Jeder Thread mit einem Kommentar des Kontos bekommt seine Zeile `ISSUE`, jede Zielseite ihre Zeile `PAGE`, auch wenn GitHub den
      Referrer kürzt; in beide Richtungen bewiesen.
      Prüfung: `bash ops/github-yield.sh --selftest | grep -cE "^ok .*thread"` muss mindestens 1 ausgeben.
      Prüfung: `bash ops/github-yield.sh --selftest | grep -cE "^ok .*page"` muss mindestens 1 ausgeben.
      Prüfung: `CP_OWN_IPS=ops/fixtures/github-yield-own-ips.txt CP_POSTED_ANSWERS=ops/fixtures/github-yield-posted.log CP_RELINKED_COMMENTS=ops/fixtures/github-yield-relinked.log bash ops/github-yield.sh --log ops/fixtures/github-yield-pages.log --wallets ops/fixtures/github-yield-pages-wallets.jsonl --since 2026-11-22T22:24:14Z | grep -cxE "ISSUE 293: 1 arrived, 0 signed in, 0 paid|ISSUE (443|447): 0 arrived, 0 signed in, 0 paid|PAGE verify-500-database-error \(issues 447\): 1 arrived, 1 signed in, 0 paid|PAGE home \(issues 293 443\): 1 arrived, 0 signed in, 0 paid|ALL NEW since 2026-11-22T22:24:14Z: 2 new wallets \(1 ours\), 0 paying \(0 ours\)"` muss 6 ausgeben.
      Prüfung: `CP_OWN_IPS=ops/fixtures/github-yield-own-ips.txt CP_POSTED_ANSWERS=ops/fixtures/github-yield-posted.log CP_RELINKED_COMMENTS=ops/fixtures/github-yield-relinked.log bash ops/github-yield.sh --log ops/fixtures/github-yield-pages.log --wallets ops/fixtures/github-yield-pages-wallets.jsonl --since 2026-11-22T22:24:14Z | grep -cE "^(ISSUE|PAGE) "` muss 5 ausgeben.
      Prüfung: `CP_OWN_IPS=ops/fixtures/github-yield-own-ips.txt CP_POSTED_ANSWERS=ops/fixtures/github-yield-posted.log CP_RELINKED_COMMENTS=ops/fixtures/github-yield-relinked.log bash ops/github-yield.sh --log ops/fixtures/github-yield-pages.log --wallets ops/fixtures/github-yield-pages-wallets.jsonl --since 2026-11-10T14:03:20Z --until 2026-11-22T22:06:00Z | grep -cE "^PAGE |^ISSUE 293:"` muss 0 ausgeben.
      Prüfung: `CP_RELINKED_COMMENTS=ops/fixtures/no-such-relinked.log CP_POSTED_ANSWERS=ops/fixtures/github-yield-posted.log bash ops/github-yield.sh --log ops/fixtures/github-yield-pages.log --since 2026-11-22T22:24:14Z >/dev/null 2>&1; echo $?` muss `2` ausgeben.
      Prüfung: `grep -ohE '"(remote_ip|client_ip)": ?"[^"]*"' ops/fixtures/github-yield-pages.log | grep -cvE '"(192\.0\.2|198\.51\.100|203\.0\.113)\.[0-9]+"'` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- ops/fixtures/github-yield.log ops/fixtures/github-yield-wallets.jsonl ops/fixtures/github-yield-own-ips.txt | wc -l` muss 0 ausgeben.
- [ ] Das Urteil steht je Thread und je Seite gemessen in `goals/kanal/ertrag.md`, vor und nach dem Umstellen, mit Befehlen,
      Ausgaben und der Wahl zwischen weiteren Kommentaren und einem neuen Kanal, ohne Adresse.
      Prüfung: `grep -cE "^- #(440|442|443) \(Runde 0\): [0-9]+ kamen, [0-9]+ angemeldet, [0-9]+ gezahlt$|^- #(434|430|427) \(Runde 1\): [0-9]+ kamen, [0-9]+ angemeldet, [0-9]+ gezahlt$|^- #(447|406|408) \(Runde 2\): [0-9]+ kamen, [0-9]+ angemeldet, [0-9]+ gezahlt$" goals/kanal/ertrag.md` muss 9 ausgeben.
      Prüfung: `awk '/^Gemessen: /{g=$2} END{print (g >= "2026-12-01T00:00:00Z") ? "spaet genug" : "zu frueh"}' goals/kanal/ertrag.md` muss genau `spaet genug` ausgeben.
      Prüfung: `n=$(grep -v '^#' ops/relinked-comments.log | awk '{print $5}' | sort -u | wc -l); [ "$(grep -cE "^- #[0-9]+ \(umgestellt\): vorher [0-9]+ kamen, [0-9]+ angemeldet, nachher [0-9]+ kamen, [0-9]+ angemeldet$" goals/kanal/ertrag.md)" = "$n" ] && echo stimmig || echo unstimmig` muss genau `stimmig` ausgeben.
      Prüfung: `n=$(grep -v '^#' ops/relinked-comments.log | awk '{print $7}' | sort -u | wc -l); [ "$(grep -cE "^- Seite [a-z0-9-]+: nachher [0-9]+ kamen, [0-9]+ angemeldet, [0-9]+ gezahlt$" goals/kanal/ertrag.md)" = "$n" ] && echo stimmig || echo unstimmig` muss genau `stimmig` ausgeben.
      Prüfung: `grep -cxE '\$ bash ops/github-yield.sh --since 2026-11-10T14:03:20Z --until 2026-11-22T22:06:23Z|\$ bash ops/github-yield.sh --since 2026-11-22T22:24:14Z' goals/kanal/ertrag.md` muss 2 ausgeben.
      Prüfung: `grep -cE "^ISSUE (440|442|443|434|430|427|447|406|408): [0-9]+ arrived, [0-9]+ signed in, [0-9]+ paid$" goals/kanal/ertrag.md` muss mindestens 9 ausgeben.
      Prüfung: `grep -cE "^Obere Grenze Runde [012]: [0-9]+ fremde neue Wallets danach, [0-9]+ davor \(je ([1-9]|1[0-4]) Tage\)$" goals/kanal/ertrag.md` muss 3 ausgeben.
      Prüfung: `grep -cE "^Alle neuen \(eigene getrennt\): [0-9]+ Wallets \([0-9]+ eigene\), [0-9]+ zahlend \([0-9]+ eigene\)$" goals/kanal/ertrag.md` muss 1 ausgeben.
      Prüfung: `grep -E "^Regel je Runde: " goals/kanal/ertrag.md | grep "440" | grep "434" | grep -c "447"` muss 1 ausgeben.
      Prüfung: `grep -cE "^Nächste Runde: " goals/kanal/ertrag.md` muss 1 ausgeben.
      Prüfung: `e=$(awk '/^\$ bash ops\/github-yield.sh --since 2026-11-22T22:24:14Z$/{k=1;next} /^\$ bash /{k=0} k&&/^(ISSUE [0-9]+|PAGE [a-z0-9-]+ \(issues [0-9 ]+\)): [0-9]+ arrived, [0-9]+ signed in, /{for(i=1;i<=NF;i++) if($i=="signed"){s+=$(i-1)}} END{print (s>0)?"weitere Kommentare":"neuer Kanal"}' goals/kanal/ertrag.md); grep -cE "^Nächste Runde: $e, weil " goals/kanal/ertrag.md` muss 1 ausgeben.
      Prüfung: `grep -cE "^NEW ISSUES since 2026-11-12T20:46:36Z: [0-9]+$" goals/kanal/ertrag.md` muss 1 ausgeben.
      Prüfung: `grep -E "^Nächste Runde: " goals/kanal/ertrag.md | grep -ciE "Idee 3|Antwortpaket"` muss 0 ausgeben.
      Prüfung: `grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}" goals/kanal/ertrag.md` muss 0 ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- goals/kanal/ertrag.md | grep -cE "^-[^-]"` muss 0 ausgeben.
      Prüfung: `grep -cE "^- [0-9-]+, kanal 09: " goals/kanal/ANNAHMEN.md` muss mindestens 3 ausgeben.
      Prüfung (Netz): `bash ops/github-yield.sh --since 2026-11-10T14:03:20Z | grep -cE "^ISSUE (440|442|443|434|430|427|447|406|408): [0-9]+ arrived, [0-9]+ signed in, [0-9]+ paid$"` muss 9 ausgeben.
      Prüfung (Netz): `n=$(grep -v '^#' ops/relinked-comments.log | awk '{print $7}' | sort -u | wc -l); [ "$(bash ops/github-yield.sh --since 2026-11-22T22:24:14Z | grep -cE "^PAGE [a-z0-9-]+ \(issues [0-9 ]+\): [0-9]+ arrived, [0-9]+ signed in, [0-9]+ paid$")" = "$n" ] && echo stimmig || echo unstimmig` muss genau `stimmig` ausgeben.
      Prüfung (Netz): `f=$(mktemp); gh issue list -R Conway-Research/automaton --state all --limit 300 --json number,createdAt >"$f" && bash ops/github-yield.sh --since 2026-11-10T14:03:20Z --issues "$f" | grep -cE "^NEW ISSUES since 2026-11-12T20:46:36Z: [0-9]+$"` muss 1 ausgeben.
      Prüfung (Netz): `bash ops/github-yield.sh --since 2026-11-10T14:03:20Z | grep -cE "^ALL NEW since 2026-11-10T14:03:20Z: [0-9]+ new wallets \([0-9]+ ours\), [0-9]+ paying \([0-9]+ ours\)$"` muss 1 ausgeben.
      Prüfung (Netz): `bash ops/github-yield.sh --since 2026-10-27T14:03:20Z --until 2026-11-10T14:03:20Z | grep -cE "^ALL NEW since 2026-10-27T14:03:20Z: [0-9]+ new wallets \([0-9]+ ours\), [0-9]+ paying \([0-9]+ ours\)$"` muss 1 ausgeben.
- [ ] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Test war vor dem Werkzeug rot; die Zeile im Progress Log nennt, womit.
- [ ] Keine Zeile der Ausgabe und keine Zeile in `goals/kanal/ertrag.md` nennt eine Adresse oder eine Wallet.
- [ ] Keine Zeile `Nächste Runde:` nennt Idee 3; die Entscheidung über das Paket der Runtime trifft paket 02.
- [ ] Die Zeilen 1 bis 4 der Ausgabe stehen an ihrer Stelle, die Zeilen `GITHUB YIELD`, `BARE GITHUB REFERRER` und `WINDOW` im
      bisherigen Wortlaut.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei, `ertrag.md` und `ANNAHMEN.md` Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `src/**`, `harness/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`
- `ops/before-the-answers.py`, `ops/post-the-answers.py`, `ops/answers_args.py`, `ops/access-log.sh`: unverändert
- `ops/posted-answers.log`, `ops/own-ips.txt`, `goals/kanal/antworten/**`, `goals/kanal/antworten-03/**`, `goals/kanal/issues*.md`
  `ops/relinked-comments.log`, `ops/relink-comments.py`, `ops/relink_rules.py` und die Goal-Dateien kanal 01 bis 08: nur lesen
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
