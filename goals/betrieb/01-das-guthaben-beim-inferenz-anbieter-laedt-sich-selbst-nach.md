# Betrieb Goal 01: Das Guthaben beim Inferenz-Anbieter lädt sich selbst nach

## Status
ACTIVE

## Active Objective
Das Guthaben beim Inferenz-Anbieter wird nie leer, weil es sich selbst nachlädt: Die automatische Aufladung beim Anbieter ist mit
einer Schwelle und einem Betrag eingeschaltet, die `ops/credit-runway.sh --topup` aus dem gemessenen Verbrauch je Tag rechnet, und die
Schwelle liegt so weit über der Warnschwelle aus fehler 01, dass der Rest nie darunter fällt, solange die Aufladung durchgeht. Am
11.11.2026 war das Guthaben leer, und ein zahlender fremder Automaton bekam ab 02:01 UTC 1001 Mal 503; fehler 01 warnt seitdem, aber
eine Warnung braucht einen Menschen, der auflädt (Matthias 12.11.2026 im Feedback: alles, was die zahlenden Kunden hält, hat Vorrang,
und das Guthaben beim Anbieter wird nie leer). Zahlen, Befehl und Uhrzeit stehen in `docs/betrieb/guthaben.md`, Matthias schaltet die
Aufladung am Human Gate `server_kauf` mit genauen Klicks und diesen Zahlen ein.
Widerlegt, wenn der Rest in den 14 Tagen nach dem Einschalten unter die Warnschwelle fällt (eine Zeile `[WARN] credit` im Log des
Watchdogs oder eine Messung `CREDIT RUNWAY LOW` mit `ops/credit-runway.sh`).
MVP: Funktion, weil ein leeres Guthaben jede Inferenz-Anfrage jedes Kunden mit 503 beantwortet und die automatische Aufladung der
einzige Weg ist, auf dem das nicht mehr von einem Menschen abhängt, der rechtzeitig nachsieht.

## Voraussetzungen
- keine

## Kontext für den Maker
- Stand gemessen am 12.11.2026 um 16:15:10 UTC auf dem code-host, nur lesend: `bash ops/credit-runway.sh` gab
  `CREDIT RUNWAY OK: 34.79 USD, 11.0 days at 3.14 USD per day, threshold 9.42 USD`. Die Zeile in `ROADMAP.md` (4,96 USD für 1,5 Tage)
  ist älter; seitdem wurde von Hand aufgeladen. Beim Verbrauch von heute ist das Guthaben in rund 8 Tagen wieder an der Warnschwelle.
- Neue Betriebsart `ops/credit-runway.sh --topup`, nur lesend, mit derselben Rechnung wie heute (Rest, Verbrauch je Tag `d` mit
  Mindestverbrauch, Warnschwelle `T` gleich dem Größeren aus `CP_CREDIT_WARN_USD` und `CP_CREDIT_WARN_DAYS` mal `d`). Die Quelle ist
  wie ohne Argument (code-host, Schlüssel über stdin) oder mit `--files CREDITS KEY` hinter `--topup` (ohne Netz). Regel:
  - Schwelle der Aufladung `X` = `T` plus 2 mal `d`, aufgerundet auf ganze USD. Die zwei Tage decken einen Tag mit doppeltem Verbrauch
    und die Zeit, bis die Aufladung gebucht ist; scheitert die Aufladung (Karte abgelehnt), warnt der Watchdog trotzdem noch mit drei
    Tagen Reichweite.
  - Betrag `Y` = 7 mal `d`, aufgerundet auf ein Vielfaches von 5 USD, mindestens 10 USD, damit höchstens eine Aufladung je Woche
    anfällt.
  - Ausgabe genau eine Zeile `AUTO TOPUP: threshold <X> USD, amount <Y> USD, warn threshold <T> USD, <d> USD per day` mit Exit 0,
    oder `AUTO TOPUP FAIL: <Grund>` mit Exit 2, wenn eine Antwort fehlt oder kein JSON ist. Rechenbeispiele für den Selftest:
    `usage_weekly` 21,84 (3,12 USD je Tag) ergibt `T` 9,36, `X` 16, `Y` 25; `usage_weekly` 0 (Mindestverbrauch 1 USD) ergibt `T` 5,
    `X` 7, `Y` 10.
- Die Doku `docs/betrieb/guthaben.md` bekommt einen Abschnitt `## Automatische Aufladung` mit genau diesen Zeilen, je ab Spalte 0:
  `Warnschwelle: <T> USD`, `Schwelle der Aufladung: <X> USD`, `Betrag der Aufladung: <Y> USD`, dazu die Ausgabe von
  `bash ops/credit-runway.sh --topup` als Codeblock mit Uhrzeit in UTC und einem Satz, warum `X` über `T` liegt. Nach dem Human Gate
  kommt die Zeile `Eingeschaltet: <JJJJ-MM-TT HH:MM> UTC` dazu, mit Datum und Uhrzeit aus der Antwort auf der Karte. Mit dem normalen
  Schlüssel zeigt keine Abfrage, ob die Aufladung eingeschaltet ist; den Management-Key liest dieses Goal nicht. Belegt wird sie durch
  die Antwort am Gate und widerlegt durch die Messung nach 14 Tagen.
- Ablauf: Punkte 1, 2 und 4 bauen, dann `## Status` auf `BLOCKED matthias` und unter `## Blockers` die Zeilen `Art: matthias`,
  `Gate: server_kauf`, `Aufgabe:`, `Worum:`, `Empfehlung:`. Die Empfehlung nennt den Weg auf `https://openrouter.ai/settings/credits`
  zur automatischen Aufladung, die beiden Zahlen `X` und `Y` aus der Doku, das Hinterlegen einer Karte, falls noch keine da ist, und
  was am Ende dastehen muss (die Aufladung als eingeschaltet mit genau diesen Zahlen, Antwort auf der Karte mit der Uhrzeit). Wenige
  Minuten für Matthias. Keine Zahlung, kein Konto und keine Einstellung beim Anbieter durch den Loop. Danach Punkt 3.
- Tests unter `test/credit-topup.test.ts`, ohne Netz, mit gepflanzten Dateien über `--topup --files` wie in
  `test/credit-runway.test.ts`; rot vor dem Fix, weil das Werkzeug von heute `--topup` mit `unknown argument` und Exit 2 ablehnt.
- Traction: Ein Kunde, dessen Anfragen ankommen, bleibt. Mit der Aufladung hängt das Guthaben nicht mehr an einer Warnung um drei Uhr
  nachts, und betrieb 02 bringt danach mit dem nächsten Rollout auch die Warnung aus fehler 01 auf den Server.
- Kein Wort zu den Bedingungen des Anbieters in Code oder Doku (`check` prüft es), nur Guthaben, Verbrauch, Schwelle und Betrag.
  Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout.

## Done Condition
- [x] `ops/credit-runway.sh --topup` rechnet Schwelle und Betrag der automatischen Aufladung aus Warnschwelle und Verbrauch je Tag,
      und der Selftest zeigt die Regel: 21,84 USD Verbrauch in der Woche ergibt `threshold 16 USD, amount 25 USD`, kein Verbrauch ergibt
      `threshold 7 USD, amount 10 USD`, eine leere Antwort ist `AUTO TOPUP FAIL` mit Exit 2; die bisherigen Fälle bleiben grün.
      Prüfung: `bash ops/credit-runway.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `CREDIT RUNWAY SELFTEST OK` ausgeben.
      Prüfung: `bash ops/credit-runway.sh --selftest | grep -cE "^ok   topup "` muss mindestens 3 ausgeben.
      Prüfung: `pnpm -s vitest run test/credit-topup.test.ts test/credit-runway.test.ts` muss Exit-Code 0 haben.
- [x] Schwelle und Betrag von heute sind gemessen und stehen mit Befehl und Uhrzeit in `docs/betrieb/guthaben.md`, die Schwelle der
      Aufladung liegt über der Warnschwelle, und die Zahlen der Doku sind die der gemessenen Zeile.
      Prüfung (Netz): `bash ops/credit-runway.sh --topup` muss eine Zeile ausgeben, die mit `AUTO TOPUP: threshold ` beginnt.
      Prüfung: `awk '/^## Automatische Aufladung/{f=1;next} /^## /{f=0} f' docs/betrieb/guthaben.md | grep -cE "^(Warnschwelle|Schwelle der Aufladung|Betrag der Aufladung): [0-9]+(\.[0-9]+)? USD$"` muss 3 ausgeben.
      Prüfung: `awk '/^Schwelle der Aufladung: /{x=$4+0} /^Warnschwelle: /{t=$2+0} END{exit !(t>0 && x>t)}' docs/betrieb/guthaben.md` muss Exit-Code 0 haben.
      Prüfung: `awk '/^AUTO TOPUP: threshold /{a=$4; b=$7} /^Schwelle der Aufladung: /{x=$4} /^Betrag der Aufladung: /{y=$4} END{exit !(a!="" && a==x && b==y)}' docs/betrieb/guthaben.md` muss Exit-Code 0 haben.
      Prüfung: `grep -c "bash ops/credit-runway.sh --topup" docs/betrieb/guthaben.md` muss mindestens 1 ausgeben.
- [x] Matthias hat die automatische Aufladung am Human Gate `server_kauf` mit diesen Zahlen eingeschaltet, die Doku nennt den
      Zeitpunkt, und danach meldet die Messung aus dem Container der Produktion OK.
      Prüfung: `awk '/^## Automatische Aufladung/{f=1;next} /^## /{f=0} f' docs/betrieb/guthaben.md | grep -cE "^Eingeschaltet: 20[0-9]{2}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} UTC$"` muss 1 ausgeben.
      Prüfung (Netz): `set -a; . ~/.config/control-plane/loop.env; set +a; ssh -i "$CP_SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 "$CP_HOST" 'bash -s -- --container' < ops/credit-runway.sh` muss eine Zeile ausgeben, die mit `CREDIT RUNWAY OK: ` beginnt.
- [x] `check` ist grün, und keine Datei des Goals trägt einen Schlüssel.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `cat docs/betrieb/guthaben.md ops/credit-runway.sh test/credit-topup.test.ts | grep -cE "sk-or-[A-Za-z0-9-]{8,}"` muss 0 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei und jede neue Selftest-Zeile war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Jede Zahl in `docs/betrieb/guthaben.md` mit dem Befehl, aus dem sie stammt; keine Adresse und kein Name eines Kunden.
- [ ] Die Schritte am Human Gate dauern für Matthias wenige Minuten und nennen genau die Zahlen aus der Doku.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `src/**`, `harness/**`, `ops/watchdog.sh`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`
- Crontab, `/opt/control-plane/.env` und jede Datei auf dem Server; Produktion nur lesend
- jede Aufladung, jeder Kauf und jede Einstellung beim Anbieter (Human Gate `server_kauf`); der Management-Key
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-12 Zyklus 1: Punkte 1, 2 und 4 gebaut (`--topup` in `ops/credit-runway.sh` mit fünf Selftest-Fällen, `test/credit-topup.test.ts`, Messung und Abschnitt `## Automatische Aufladung` in `docs/betrieb/guthaben.md`), Punkt 3 wartet am Human Gate `server_kauf`; rot vor dem Fix war `test/credit-topup.test.ts` mit 13 von 13 (das alte Werkzeug lehnt `--topup` mit `unknown argument` ab, die Mutationsmarker fehlten), die Zeilen `ok   topup` gab es nicht, und die Doku-Prüfung von Punkt 2 wird mit verfälschtem Betrag (30 statt 25 USD) rot mit Exit 1. Prüfbefehle: `bash ops/credit-runway.sh --selftest` Exit 0, letzte Zeile `CREDIT RUNWAY SELFTEST OK`; `grep -cE "^ok   topup "` 5; `pnpm -s vitest run test/credit-topup.test.ts test/credit-runway.test.ts` 26 passed; `bash ops/credit-runway.sh --topup` (16:56:57 UTC) `AUTO TOPUP: threshold 16 USD, amount 25 USD, warn threshold 9.49 USD, 3.16 USD per day`; Abschnittszeilen 3; Schwelle über Warnschwelle Exit 0; Doku gleich Messung Exit 0; Befehl in der Doku 1; Zeile `Eingeschaltet:` 0 (Punkt 3 offen); Messung aus dem Container (16:57:03 UTC) `CREDIT RUNWAY OK: 34.62 USD, 10.9 days at 3.16 USD per day, threshold 9.49 USD`; `node scripts/check.mjs` Exit 0 (1380 Tests, 115 s); Schlüssel-Grep 0.
- 2026-11-12 Zyklus 2: Punkt 3 nach dem Human Gate gebaut (Zeile `Eingeschaltet: 2026-11-12 20:35 UTC` aus der Antwort auf der Karte, Messung aus dem Container in `docs/betrieb/guthaben.md`), `dev` gemergt, Abschluss gemeldet, Punkte 1, 2, 3 und 4; rot vor dem Eintrag war die Zeilenzählung von Punkt 3 mit 0. Prüfbefehle: `bash ops/credit-runway.sh --selftest` Exit 0, letzte Zeile `CREDIT RUNWAY SELFTEST OK`; `grep -cE "^ok   topup "` 5; `pnpm -s vitest run test/credit-topup.test.ts test/credit-runway.test.ts` 26 passed; `bash ops/credit-runway.sh --topup` (20:43:11 UTC) `AUTO TOPUP: threshold 17 USD, amount 25 USD, warn threshold 9.79 USD, 3.26 USD per day` (Verbrauch gestiegen, eingestellte 16 USD liegen 1,9 Tage über der Warnschwelle, steht in der Doku); Abschnittszeilen 3; Schwelle über Warnschwelle Exit 0; Doku gleich Messung Exit 0; Befehl in der Doku 1; Zeile `Eingeschaltet:` 1; Messung aus dem Container (20:43:11 UTC) `CREDIT RUNWAY OK: 33.94 USD, 10.4 days at 3.26 USD per day, threshold 9.79 USD`; `node scripts/check.mjs` Exit 0 (114 Testdateien, 60 s); Schlüssel-Grep 0.

## Blockers
- keine (Human Gate `server_kauf` am 12.11.2026 um 20:35 UTC gelöst, Antwort auf der Karte: „schon erledigt“)
