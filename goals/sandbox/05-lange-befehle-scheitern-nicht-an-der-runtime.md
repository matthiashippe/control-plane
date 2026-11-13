# Sandbox Goal 05: Lange Befehle scheitern nicht an der Runtime

## Status
PLANNED

## Active Objective
Ein `exec` von 60 s und von 180 s über die unveränderte Runtime am Pin `d8f8168` endet ohne Fehler der Runtime und ohne Zählung in
ihrem Circuit Breaker. Zuerst im Harness gemessen, wie die Runtime beide heute erlebt (Antwort, Versuche, Abbrüche, Stand des Circuit
Breakers), dann entschieden und in `src/sandbox/` gebaut, was sie ohne Fehler liest: ein langes `exec` als Hintergrundlauf mit
sofortiger Antwort oder 400 mit Klartext für `timeout` über 120000 ms. Die Entscheidung steht mit den Zahlen in
`goals/sandbox/ANNAHMEN.md`, der Gang mit beiden Befehlen läuft danach in `pnpm e2e` (`ROADMAP.md`, sandbox 05; übernimmt
`goals/_vorschlaege/sandbox-kritik-2026-11-12-4.md`).
MVP: Funktion, weil ein fremder Automaton beim Einrichten seines Dienstes Befehle wie `apt-get install` oder `npm install` über
zwei Minuten fährt: Heute bricht seine Runtime nach vier Versuchen ab, gibt dem Modell einen Fehler und steht danach einen Fehlschlag
vor ihrem Circuit Breaker, während der Befehl bei uns weiterläuft und bezahlt wird. Ohne dieses Goal betreibt kein fremder Automaton
seinen Dienst bei uns (Abschlusskriterium in `ROADMAP.md`).

## Voraussetzungen
- sandbox Goal 04 DONE

## Kontext für den Maker
- Maßgeblich sind `docs/sandbox/vertrag.md` (Zeile zu `exec`, Abschnitt zum HTTP-Client der Runtime), `goals/sandbox/ANNAHMEN.md`
  Goal 03 („`exec` hält die Anfrage, bis das Ergebnis da ist“) und Goal 04, und `harness/e2e/sandbox-walk.mjs`. Was dieses Goal
  entscheidet oder misst, steht mit Grund unter `## Goal 05` in `goals/sandbox/ANNAHMEN.md`, nie nur im Code.
- Was die Runtime am Pin tut, gelesen im Klon `~/.cache/control-plane/automaton-d8f8168`: Das Werkzeug `exec` (`src/agent/tools.ts:115`)
  ruft `conway.exec(command, timeout || 30000)`, der Client (`src/conway/client.ts:142`) schickt `POST /v1/sandboxes/{id}/exec` mit
  einem `Idempotency-Key` je Aufruf, der HTTP-Client (`src/conway/http-client.ts:60` bis `:125`) bricht jeden Versuch nach 30 s ab,
  egal wie groß `timeout` ist, versucht es bis zu viermal (`maxRetries` 3, Backoff 1 s mal 2 hoch Versuch mal 0,5 bis 1,5) und
  wirft nach dem vierten Abbruch. Jeder Abbruch und jeder Status aus `[429, 500, 502, 503, 504]` zählt `consecutiveFailures` hoch,
  jede andere Antwort setzt ihn auf 0; ab 5 ist der Circuit Breaker 60 s offen und jeder Aufruf der Runtime scheitert
  (`src/types.ts:613`). Erwartet ist darum heute: 60 s mit ein bis zwei Abbrüchen, dann das Ergebnis über die Wiederholung mit
  demselben Schlüssel; 180 s mit vier Abbrüchen nach rund 125 s, Fehler an das Modell, Zähler 4, und der Befehl läuft bei uns bis zum
  Ende weiter. Das ist eine Erwartung, keine Messung; gemessen wird im Harness.
- Messen: ein Gang `harness/e2e/long-exec.mjs` nach dem Muster von `sandbox-walk.mjs` (Client und Werkzeuge aus `dist/` der Runtime,
  `createConwayClient` und `executeTool` mit `createBuiltinTools`, jeder Versuch über das globale `fetch` mitgeschrieben, auch ein
  abgebrochener). Eigene Sandbox der Stufe klein mit eigenem `name`, dann `exec` mit `sleep 60; echo long-60` und `timeout` 90000,
  dann `sleep 180; echo long-180` mit `timeout` 240000, je danach ein `list_sandboxes` als nächster Aufruf, zuletzt
  `DELETE /v1/sandboxes/{id}` direkt über HTTP. Je `exec` druckt der Gang in einer Zeile `LONG_EXEC_RESULT <JSON>`: Dauer, jeden
  Versuch mit Status oder `abort` (`attempts`), den Werkzeugtext, ob das Werkzeug warf, den Zähler nach dem Aufruf
  (`failures_after`: Abbrüche und wiederholte Status seit der letzten anderen Antwort, wie der HTTP-Client zählt) und den Status des
  folgenden `list_sandboxes` (`next_status`). Eine reine
  Funktion `judgeLongExec(result)` liefert `ok` oder die Gründe. Gemeinsames (Mitschreiben, Schwärzen) zieht der Maker aus
  `sandbox-walk.mjs` heraus, ohne dessen Verhalten zu ändern; `test/sandbox-walk.test.ts` bleibt grün.
- „Ohne Fehler“ heißt für `judgeLongExec`, bei 60 s wie bei 180 s: Das Werkzeug wirft nicht, kein Versuch bekommt einen Status aus der
  Liste der wiederholten, der Zähler steht nach dem Aufruf auf 0, das folgende `list_sandboxes` bekommt 200; dazu entweder das
  Ergebnis (`long-60` oder `long-180` in stdout, `exit_code` 0) oder ein Text, der dem Modell in klaren Worten sagt, was passiert ist
  und wie es an das Ergebnis kommt oder was es statt dessen tun soll. Ein `exec` darf nie zweimal laufen, auch nicht über mehrere
  Versuche.
- Vorher messen, bevor `src/` sich ändert: der Gang gegen den Stand von `dev`, lokal wie in Goal 04 (echtes `dist/index.js`, Nachbau
  `sandboxd` im Prozess, Runtime am Pin) oder im Job `e2e` eines ersten Pushs des Goal-Branches. Ergebnis in
  `docs/sandbox/lange-befehle.md` unter `## Vorher`: Ort, Commit, Befehl und je Dauer eine Zeile `vorher 60 s: …` und
  `vorher 180 s: …` mit Versuchen, Abbrüchen, Zähler, Status des folgenden Aufrufs und der ersten Zeile des Werkzeugtexts. Zeigt
  die Messung, dass 180 s heute schon ohne Fehler und ohne Zählung durchgehen, ist das Glied widerlegt: dann kein Bau, die Messung in
  die Datei, `## Status` auf `BLOCKED fachlich` mit `## Ehrliche Lücken`.
- Entscheiden mit den Zahlen der Messung zwischen den beiden Wegen aus `ROADMAP.md`. Hintergrundlauf: Das Control Plane antwortet vor
  30 s, also bevor die Runtime abbricht, der Befehl läuft in der Sandbox weiter und endet spätestens nach seinem `timeout`, und die
  Antwort nennt, wie das Modell mit `exec` oder `read_file` an Ausgabe und Exit-Code kommt. 400 mit Klartext: `timeout` über 120000 ms
  bekommt sofort 400 `invalid_request` mit einem Satz, der sagt, wie es geht (etwa mit `nohup … &` und einer Datei für die Ausgabe);
  dann muss 60 s trotzdem die Bedingung oben erfüllen, also ohne Zählung nach dem Aufruf. Ein dritter Weg nur mit Grund in
  `ANNAHMEN.md`. Abgerechnet wird wie bisher nach der Laufzeit der Sandbox (`docs/sandbox/plan.md`, `## Preis`), ein Befehl kostet nichts
  extra.
- Bauen nur in `src/sandbox/` und Tests: `ops/sandbox/sandboxd.mjs` läuft auf `srv1327036`, den dieses Goal nicht ändert, und der
  Nachbau im Harness benutzt denselben `createSandboxd`; eine Änderung dort machte den Harness grün und die Produktion nicht. Ein
  Unit-Test `test/sandbox-long-exec.test.ts` mit nachgebautem `sandboxd` und gefälschter Uhr (vitest fake timers, kein echtes Warten)
  ist vor dem Fix rot: 180000 ms gehen den entschiedenen Weg, 60000 ms bringen ihr Ergebnis, eine Wiederholung mit demselben
  `Idempotency-Key` startet den Befehl nicht neu, ein kurzes `exec` antwortet wie bisher.
- `full.sh`: Der Gang läuft nach dem Block der Sandbox aus Goal 04 mit demselben Schlüssel und eigener Sandbox, danach noch einmal der
  Zustand des Nachbaus (keine Sandbox, kein Container, kein Netz, kein Verzeichnis). Die Schlusszeile bekommt `long_exec=<true|false>`,
  `long_exec=false` macht `E2E FAIL`; die bestehenden Bedingungen (fünf Turns, Domains, `balance_cents`, `sandbox`) bleiben unverändert,
  `test/e2e-sandbox-gate.test.ts` wird um die neue Bedingung ergänzt und bleibt grün. Der Job `e2e` hat 30 Minuten; der Gang braucht
  rund vier.
- Das Ergebnis nachher steht unter `## Nachher` in `docs/sandbox/lange-befehle.md`: je Dauer eine Zeile `nachher 60 s: …` und
  `nachher 180 s: …` wie oben, aus dem Log des Jobs `e2e` am Kopf des Goal-PR, mit Link auf den Lauf. Dort auch, was der Harness nicht
  zeigt (Caddy und der echte Server liegen nicht dazwischen; der Release Manager prüft nach dem Rollout wie immer mit `ops/live.sh`).
- Die Produktion ändert sich nur über den Merge und `deploy.yml`, dessen Job `e2e` den Gang vor dem Rollout fährt. Kein Lauf gegen
  die Produktion in diesem Goal, kein Topup, keine Wallet-Bewegung.
- Prüfbefehle ohne Netz binden keinen festen Port, Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit
  eigenem Timeout, neue Dateien vor dem lokalen `check` stagen (er liest nur getrackte Dateien). Der code-host hat kein Docker: Den
  Harness belegt der Job `e2e` des Goal-PR.
- Was danach schneller zu mehr zahlenden Automatons führt: sandbox 06 gibt Ports unter einer eigenen Domain frei; mit beiden kann ein
  fremder Automaton seinen Dienst bei uns betreiben.

## Done Condition
- [ ] Die Messung vorher steht mit Ort, Commit und Zahlen für 60 s und 180 s in `docs/sandbox/lange-befehle.md`, bevor `src/` sich
      ändert.
      Prüfung: `awk '/^## Vorher/{f=1;next} /^## /{f=0} f' docs/sandbox/lange-befehle.md | grep -cE "^- vorher (60|180) s: "` muss 2 ausgeben.
      Prüfung: `b=$(git merge-base origin/dev HEAD); d=$(git log --format=%H --diff-filter=A -1 -- docs/sandbox/lange-befehle.md); s=$(git log --format=%H --reverse "$b"..HEAD -- src | head -1); [ -z "$s" ] || { [ "$d" != "$s" ] && git merge-base --is-ancestor "$d" "$s"; }` muss Exit-Code 0 haben.
- [ ] `harness/e2e/long-exec.mjs` geht beide Befehle mit dem Client und den Werkzeugen der Runtime, schreibt jeden Versuch mit, auch
      abgebrochene, und `judgeLongExec` ist in beide Richtungen bewiesen.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/long-exec.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for w in createConwayClient executeTool list_sandboxes "sleep 60" "sleep 180" abort LONG_EXEC_RESULT judgeLongExec; do grep -qF -- "$w" harness/e2e/long-exec.mjs || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `for w in abort 503 long-60 long-180 failures_after next_status; do grep -qF -- "$w" test/long-exec.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandbox-walk.test.ts` muss Exit-Code 0 haben.
- [ ] Die Entscheidung zwischen Hintergrundlauf und 400 steht mit den Zahlen der Messung und dem Grund in `goals/sandbox/ANNAHMEN.md`.
      Prüfung: `awk '/^## Goal 05/{f=1} f' goals/sandbox/ANNAHMEN.md | grep -cE "60 s|180 s"` muss mindestens 2 ausgeben, und `awk '/^## Goal 05/{f=1} f' goals/sandbox/ANNAHMEN.md | grep -ciE "hintergrund|120000"` mindestens 1.
- [ ] Das Control Plane beantwortet ein `exec` von 60 s und von 180 s auf dem entschiedenen Weg, ohne den Befehl zweimal zu starten;
      der Test war vor dem Fix rot.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandbox-long-exec.test.ts test/sandbox-api.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for w in 180000 60000 Idempotency-Key useFakeTimers; do grep -qF -- "$w" test/sandbox-long-exec.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
- [ ] `pnpm e2e` geht beide Befehle mit der Runtime im Harness und wird bei `long_exec=false` rot; die bestehenden Bedingungen bleiben.
      Prüfung: `grep -c "long-exec.mjs" harness/e2e/full.sh` muss mindestens 1 ausgeben, und `grep -cE 'long_exec=\$' harness/e2e/full.sh` mindestens 2 (Zeile `E2E FAIL` und Zeile `E2E OK`).
      Prüfung: `for w in 'turns" -lt 5' 'domains_ok" != "true"' 'balance_cents" -ge 500' 'sandbox" != "true"' 'long_exec" != "true"'; do grep -qF -- "$w" harness/e2e/full.sh || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/e2e-sandbox-gate.test.ts` muss Exit-Code 0 haben, und `grep -c "long_exec" test/e2e-sandbox-gate.test.ts` mindestens 2 ausgeben.
- [ ] Der Job `e2e` des Goal-PR ist grün und hat beide Befehle wirklich gefahren.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/sandbox-05 --state all --json number -q '.[0].number'); gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,state -q '.[] | select(.name=="e2e") | .state'` muss `SUCCESS` ausgeben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/sandbox-05 --state all --json number -q '.[0].number'); l=$(gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,link -q '.[] | select(.name=="e2e") | .link'); gh run view --job "${l##*/}" --log -R matthiashippe/control-plane | grep -cE "E2E OK .*sandbox=true.*long_exec=true"` muss mindestens 1 ausgeben.
- [ ] Die Messung nachher steht für 60 s und 180 s in `docs/sandbox/lange-befehle.md`, ohne ID einer Sandbox, Adresse oder Schlüssel.
      Prüfung: `awk '/^## Nachher/{f=1;next} /^## /{f=0} f' docs/sandbox/lange-befehle.md | grep -cE "^- nachher (60|180) s: "` muss 2 ausgeben.
      Prüfung: `grep -cE "0x[0-9a-fA-F]{40}|cnwy_k_" docs/sandbox/lange-befehle.md` muss 0 ausgeben.
- [ ] Das Goal ändert weder Runtime, Sandbox-Server, Zahlung, Anmeldung noch Betrieb und bringt keinen Schlüssel ins Repo.
      Prüfung: `git diff --name-only origin/dev...HEAD -- harness/runtime harness/sandboxd ops/sandbox src/payments src/auth deploy .github scripts/check.mjs | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -cE "\.(key|pem|env)$|live-sandbox\.env"` muss 0 ausgeben.
- [ ] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei und jede neue Bedingung von `judgeLongExec` war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Jede Zahl in `docs/sandbox/lange-befehle.md` mit dem Befehl oder dem Lauf, aus dem sie stammt; keine Adresse und kein Name eines
      Kunden, kein API-Key.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.
- [ ] Der Text, den das Modell eines Automatons bei einem langen `exec` liest, sagt in klaren Worten, was passiert ist und was es tun
      soll, ohne Wort, das es erst übersetzen muss.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/runtime/**`, `harness/sandboxd/**`, `ops/sandbox/**`, `src/payments/**`, `src/auth/**`, `ops/conway-series.sh`,
  `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`
- der Zahlungsserver `76.13.144.207`: nur lesen nach `loop-constraints.md` (Produktion: nur lesen), kein Rollout, kein Neustart, keine
  Änderung an Datenbank, Volume, Compose oder `.env`
- `srv1327036`: nichts ändern, auch nicht `sandboxd` oder `/etc/sandboxd/keys/`
- DNS der Zone `postyourprice.com`; kein freigegebener Port eines Kunden unter `*.postyourprice.com`
- Wallet-Bewegung, Topup, Überweisung (`loop-constraints.md`, Grundregel 10)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
