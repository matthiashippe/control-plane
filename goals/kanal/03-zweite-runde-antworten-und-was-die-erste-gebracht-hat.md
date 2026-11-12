# Kanal Goal 03: Zweite Runde Antworten und was die erste gebracht hat

## Status
PLANNED

## Active Objective
Zwei Dinge in einem Goal, weil das zweite das erste begründet: Zuerst ist gemessen, was die drei Antworten vom 11.11.2026 (#434,
#430, #427) gebracht haben, als Summe ohne Adressen: wie viele neue Adressen seit dem ersten dieser Posts (2026-11-11T07:04:50Z) mit
Referrer `github.com/Conway-Research` kamen, wie viele davon sich angemeldet (`POST /v1/auth/verify` mit 200) und wie viele gezahlt
haben (`/pay/` mit 200), daneben alle neuen und alle zahlenden Wallets im selben Zeitraum. Dann die zweite Runde: neue Issues in
`Conway-Research/automaton` mit Anmelde- oder Zahlungsfehlern seit dem letzten Eintrag in `ops/posted-answers.log`, je Issue eine
geprüfte Antwort über die Werkzeuge aus kanal 01 und 02, gebündelt am Human Gate `public_post`, gepostet genau der freigegebene Text
und danach mit `--verify-posted` gegen GitHub belegt (Matthias 12.11.2026 im Feedback: alles, was neue zahlende Kunden bringt, hat
Vorrang).
Widerlegt, wenn die Posts vom 11.11.2026 binnen 14 Tagen (bis 2026-11-25) keine Anmeldung mit diesem Referrer bringen; dann ist die
nächste Runde kein Antwortpaket, sondern ein anderer Kanal. Dieses Goal misst den Zwischenstand und schreibt die Regel neben die Zahl,
das Urteil nach 14 Tagen fällt im nächsten Glied.
MVP: Funktion, weil jede Antwort ein Betreiber ist, dessen Automaton gerade an Conway scheitert und in Minuten wechseln kann, und weil
ohne die Zahl niemand weiß, ob dieser Kanal zahlende Kunden bringt oder nur Arbeit.

## Voraussetzungen
- kanal Goal 02 DONE

## Kontext für den Maker
- Messwerkzeug `ops/github-yield.sh` (neu, nur lesend, Code Englisch): liest das ganze Caddy-Zugriffslog über `ops/access-log.sh` (auch
  die rotierten Dateien), nimmt je fremder Adresse (nicht in `ops/own-ips.txt`) die erste Anfrage ab `--since <ISO-Zeit UTC>` und zählt
  sie als angekommen, wenn ihr `Referer` mit `https://github.com/Conway-Research` beginnt; angemeldet, wenn dieselbe Adresse danach
  `POST /v1/auth/verify` mit Status 200 hatte; gezahlt, wenn sie danach eine Anfrage auf `/pay/` mit Status 200 hatte. Erste Zeile
  genau `GITHUB YIELD since <zeit>: <a> arrived from github.com/Conway-Research, <b> signed in, <c> paid`. Zweite Zeile aus der
  Datenbank (über `docker exec deploy-cp-1 node -e …` mit `readonly: true`, wie `ops/timeout-quote.sh`): `ALL NEW since <zeit>: <w>
  new wallets, <p> paying wallets` (Wallets mit `created_at` ab `--since`, davon mit mindestens einer Ledger-Zeile `topup`). Nur
  Summen, nie eine Adresse, eine Wallet oder ein Betrag je Kunde (`loop-constraints.md`, Grundregel 8). Exit 2, wenn das Log nicht
  lesbar ist oder das Fenster keine einzige Zeile hat, denn eine Null aus einem leeren Fenster ist Blindheit und keine Messung.
- Für Tests ohne Netz `--log <datei>` statt des Servers, `--wallets <datei>` statt der Datenbank (ohne sie nennt die zweite Zeile im
  Modus `--log` `not read`) und `CP_OWN_IPS=<datei>` statt `ops/own-ips.txt`, dazu `--selftest` mit der Fixture
  `ops/fixtures/github-yield.log` nach dem Muster von `ops/traffic.sh --selftest` (Fenster aus der Fixture gerechnet, damit sie nicht
  altert). Die Fixture trägt nur Dokumentationsadressen (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`) und pflanzt in beide
  Richtungen (Grundregel 3): eine Adresse mit GitHub-Referrer, Anmeldung und Zahlung (zählt dreimal), eine mit GitHub-Referrer ohne
  Anmeldung (nur angekommen), eine Anmeldung ohne Referrer (zählt nicht), eine eigene Adresse mit GitHub-Referrer und Anmeldung (zählt
  nicht), eine Ankunft vor `--since` (zählt nicht), eine Anmeldung mit Status 500 (nicht angemeldet). Jeder neue Test war vor dem
  Werkzeug rot; die Zeile im Progress Log nennt es.
- Warum die zweite Zeile: Ein Betreiber stellt `conwayApiUrl` oft um, ohne die Seite im Browser zu öffnen, und sein Automaton ruft
  `/v1/auth/nonce` von einer anderen Adresse und ohne Referrer. Der Join über die Adresse unterschätzt also. Die Zahl neuer Wallets im
  selben Zeitraum ist die obere Grenze, der Referrer-Join die untere; beide stehen in `goals/kanal/ertrag.md`, und die Widerlegung
  oben gilt für die untere. Annahme: GitHub schickt bei einem Klick aus einem Issue den vollen Pfad als `Referer`
  (`referrer-policy: no-referrer-when-downgrade` am 12.11.2026, ohne `<meta name="referrer">` auf der Issue-Seite); zählt das
  Werkzeug Ankünfte mit `Referer` genau `https://github.com/` ohne Pfad, nennt es sie in einer eigenen Zeile, damit eine geänderte
  Policy nicht still zur Null wird.
- Posten zieht in Sekunden eine Flotte von Abrufern an (Kopf von `ops/posted-answers.log`); sie melden sich nicht an, deshalb trägt
  nur die Zahl der Angemeldeten und Zahlenden ein Urteil, nicht die der Angekommenen.
- `goals/kanal/ertrag.md` (Deutsch): eine Zeile `Ertrag Runde 1: <a> kamen von github.com/Conway-Research, <b> angemeldet, <c>
  gezahlt, <zeitraum>`, eine Zeile `Alle neuen: <w> Wallets, <p> zahlend, <zeitraum>`, der Befehl, aus dem beide stammen, und die
  Widerlegungsregel mit dem Datum 2026-11-25.
- Zweite Runde: Liste in `goals/kanal/issues-03.md` nach dem Muster von `goals/kanal/issues.md` (Befehle, Tabelle mit Nummer, Titel,
  Art des Fehlers, eröffnet, Antwort). Neu heißt wie in kanal 01 (`goals/kanal/ANNAHMEN.md`, 2026-11-10): offen, Anmelde- oder
  Zahlungsfehler, ohne Kommentar unseres Kontos. Am 12.11.2026 stand dafür etwa #447 (eröffnet 2026-11-10T23:53Z) und aus Runde 1
  zurückgestellt #406, #408 und #426; der Maker liest neu. Entwürfe in `goals/kanal/antworten-03/<issue>.md`, höchstens drei, im
  Format von `goals/kanal/antworten/`, Englisch, sachlich, kurz, ohne Gedankenstrich, nichts, was nicht auch im Issue stehen dürfte.
  Eine Zahl aus `goals/kanal/ertrag.md` gehört nicht in eine Antwort.
- Human Gate `public_post` wie in kanal 01: `## Status` auf `BLOCKED matthias`, unter `## Blockers` die Zeilen `Art: matthias`,
  `Gate: public_post`, `Aufgabe:`, `Worum:`, `Empfehlung:`, darunter je Kommentar ein nummerierter Punkt mit dem Link des Issues und
  dem fertigen Text. Der Tech Lead prüft, der Loop Master legt die Karte auf Matthias' privates Board. Erst wenn am Topic „Matthias hat
  den Kommentar auf seinem privaten Board mit „ok“ freigegeben“ steht, postest du genau diese Kommentare, Wort für Wort, mit
  `python3 ops/post-the-answers.py --folder goals/kanal/antworten-03 --send <n> --only <nummern>`, höchstens drei am Tag, und
  schreibst jeden Link ins Progress Log. Ohne diesen Kommentar postest du nichts. Nach dem Commit mit `BLOCKED matthias` ändert sich
  kein Entwurf mehr, weil `--send` den Text erst beim Senden aus der Datei liest
  (`goals/_vorschlaege/kanal-kritik-2026-11-12-1.md`).
- Punkt 1 und 2 laufen vor dem Gate, damit die Zahl der ersten Runde in der Karte an Matthias stehen kann („bisher: <b> angemeldet,
  <c> gezahlt“), ohne Adresse.
- Zugang für die Zeilen mit `(Netz)`: `set -a; . ~/.config/control-plane/loop.env; set +a`, Werte nie ausgeben. Produktion nur lesen.
  Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout.
- Traction: Die untere Zahl sagt, ob die Antworten zahlende Automatons bringen; bringen sie keine, spart das nächste Glied die Arbeit
  einer dritten Runde und sucht einen anderen Kanal.

## Done Condition
- [ ] `ops/github-yield.sh` zählt Ankünfte mit Referrer `github.com/Conway-Research`, Anmeldungen und Zahlungen derselben Adresse
      seit einem Zeitpunkt, als Summe ohne Adressen, in beide Richtungen bewiesen.
      Prüfung: `bash ops/github-yield.sh --selftest | tail -1` muss `SELFTEST OK` ausgeben.
      Prüfung: `pnpm -s vitest run test/github-yield.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/github-yield.test.ts` muss mindestens 3 ausgeben.
      Prüfung: `bash ops/github-yield.sh --log ops/fixtures/github-yield.log --since 2000-01-01T00:00:00Z | grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}"` muss 0 ausgeben.
      Prüfung: `grep -oE '"(remote_ip|client_ip)":"[^"]*"' ops/fixtures/github-yield.log | grep -cvE '"(192\.0\.2|198\.51\.100|203\.0\.113)\.[0-9]+"'` muss 0 ausgeben.
- [ ] Was die erste Runde gebracht hat, steht gemessen in `goals/kanal/ertrag.md`, untere und obere Zahl mit Zeitraum und Befehl,
      ohne Adresse.
      Prüfung: `grep -cE "^Ertrag Runde 1: [0-9]+ kamen von github.com/Conway-Research, [0-9]+ angemeldet, [0-9]+ gezahlt" goals/kanal/ertrag.md` muss 1 ausgeben.
      Prüfung: `grep -cE "^Alle neuen: [0-9]+ Wallets, [0-9]+ zahlend" goals/kanal/ertrag.md` muss 1 ausgeben.
      Prüfung: `grep -c "ops/github-yield.sh --since 2026-11-11T07:04:50Z" goals/kanal/ertrag.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -c "2026-11-25" goals/kanal/ertrag.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}" goals/kanal/ertrag.md` muss 0 ausgeben.
      Prüfung (Netz): `bash ops/github-yield.sh --since 2026-11-11T07:04:50Z | head -1 | grep -c "^GITHUB YIELD since 2026-11-11T07:04:50Z: [0-9]"` muss 1 ausgeben.
- [ ] Die neuen Issues mit Anmelde- oder Zahlungsfehlern stehen in `goals/kanal/issues-03.md`, je Issue mit Antwort liegt ein Entwurf
      in `goals/kanal/antworten-03/`, höchstens drei, keiner zu einem Issue, das wir schon beantwortet haben, und das Gatter ist grün.
      Prüfung: `grep -cE "^[|] *#?[0-9]+ " goals/kanal/issues-03.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -c "gh issue" goals/kanal/issues-03.md` muss mindestens 1 ausgeben.
      Prüfung: `ls goals/kanal/antworten-03/*.md | wc -l | xargs -I{} test {} -ge 1 -a {} -le 3 && echo passt` muss `passt` ausgeben.
      Prüfung: `grep -E "^[0-9]{4}-" ops/posted-answers.log | awk '$1 <= "2026-11-11T07:07:57Z" {print $2}' | while read -r n; do test -f "goals/kanal/antworten-03/$n.md" && echo "schon beantwortet $n"; done` muss nichts ausgeben.
      Prüfung: `grep -lE "0x[0-9a-fA-F]{40}" goals/kanal/antworten-03/*.md | wc -l` muss 0 ausgeben.
      Prüfung (Netz): `python3 ops/before-the-answers.py --folder goals/kanal/antworten-03` muss Exit-Code 0 haben.
- [ ] Gepostet ist genau, was Matthias freigegeben hat, höchstens drei am Tag, und jeder Kommentar steht live so wie sein Entwurf; der
      Kommentar „Matthias hat den Kommentar auf seinem privaten Board mit „ok“ freigegeben“ steht am Topic vor dem ersten neuen Eintrag.
      Prüfung: `grep -E "^[0-9]{4}-" ops/posted-answers.log | awk '$1 > "2026-11-12T00:00:00Z" {print $2}' | while read -r n; do test -f "goals/kanal/antworten-03/$n.md" && echo "$n"; done | wc -l` muss mindestens 1 ausgeben.
      Prüfung: `grep -E "^[0-9]{4}-" ops/posted-answers.log | awk '{print $2}' | sort | uniq -d | while read -r n; do test -f "goals/kanal/antworten-03/$n.md" && echo "doppelt $n"; done` muss nichts ausgeben.
      Prüfung: `grep -E "^[0-9]{4}-" ops/posted-answers.log | cut -c1-10 | sort | uniq -c | awk '$1 > 3'` muss nichts ausgeben.
      Prüfung (Netz): `python3 ops/post-the-answers.py --verify-posted --folder goals/kanal/antworten-03 | tail -1` muss mit `VERIFY POSTED OK:` beginnen.
- [ ] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Test war vor dem Werkzeug rot; die Zeile im Progress Log nennt, womit.
- [ ] Kein Entwurf unter `goals/kanal/antworten-03/` ändert sich nach dem Commit, der `BLOCKED matthias` setzt.
- [ ] Höchstens drei Kommentare am Tag, kein zweiter Kommentar in einem Issue, kein Issue geschlossen, kein Kommentar geändert oder
      gelöscht.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei, Liste und `ertrag.md` Deutsch, die Antworten Englisch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `src/**`, `harness/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`
- `ops/before-the-answers.py`, `ops/post-the-answers.py`, `ops/answers_args.py`: unverändert, die zweite Runde läuft über die
  Werkzeuge aus kanal 01 und 02, und das Gatter wird nicht geschwächt
- `ops/posted-answers.log`: nur `ops/post-the-answers.py` hängt an, nie von Hand
- `goals/kanal/issues.md`, `goals/kanal/antworten/**` und die Goal-Dateien kanal 01 und 02: nur lesen
- jedes `--send` gegen GitHub vor der Freigabe am Topic, jeder Kommentar in `Conway-Research/automaton` außerhalb davon (Human Gate
  `public_post`)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
