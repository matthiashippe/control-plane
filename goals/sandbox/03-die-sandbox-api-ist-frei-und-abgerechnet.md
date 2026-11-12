# Sandbox Goal 03: Die Sandbox-API ist frei und abgerechnet

## Status
ACTIVE

## Active Objective
Das Control Plane beantwortet jede Zeile mit `/v1/sandboxes` aus `docs/sandbox/vertrag.md`, `## Endpunkte`, so, wie die unveränderte
Runtime am Pin `d8f8168` sie liest, statt mit 501, und reicht sie signiert nach `docs/sandbox/plan.md`, `## Verbindung`, an `sandboxd`
auf `srv1327036` weiter. Abgerechnet in Credits nach `## Preis`: je begonnenem Schritt von 6 Minuten Laufzeit eine Ledger-Zeile in
derselben Transaktion wie der Saldo, idempotent, 1000 mc reserviert beim Anlegen, keine Sandbox ohne Guthaben (402 mit `details`),
Halt bei leerem Guthaben, nichts berechnet, was nicht lief. Unit-Tests gegen einen nachgebauten `sandboxd`, Rollout über `deploy.yml`,
danach legt `ops/live.sh` mit einer eigenen Adresse eine Sandbox an, führt darin aus und löscht sie wieder (`ROADMAP.md`, sandbox 03;
`docs/kette.md`, sandbox 03).
MVP: Funktion, weil der fremde Automaton, der am 10.11.2026 auf `POST /v1/sandboxes` und `exec` 501 bekam, danach eine Sandbox bei uns
startet und dafür bezahlt, und weil das Abschlusskriterium in `ROADMAP.md` erst mit der Ledger-Zeile dieser Abrechnung messbar wird.

## Voraussetzungen
- sandbox Goal 02 DONE

## Kontext für den Maker
- Maßgeblich sind `docs/sandbox/vertrag.md` (Endpunkte, Felder, Verhalten der Runtime bei Fehlern), `docs/sandbox/plan.md` (`## Grenzen`,
  `## Preis`, `## Verbindung`) und `goals/sandbox/ANNAHMEN.md`. Was dieses Goal anders entscheidet, steht mit Grund unter
  `## Goal 03` in `goals/sandbox/ANNAHMEN.md` und im Plan, nie nur im Code. Heute stehen die 501 in `src/app.ts` (`SANDBOX_NOTE`, Routen
  `/v1/sandboxes` und `/v1/sandboxes/*`); die Domain-Routen daneben bleiben, wie sie sind (domains 01).
- Statuscodes nach dem Verhalten der Runtime am Pin (gelesen am 12.11.2026 im Klon, `src/conway/http-client.ts:95` und `src/types.ts:613`):
  429, 500, 502, 503 und 504 wiederholt der HTTP-Client dreimal und zählt sie für den Circuit Breaker, der nach fünf in Folge 60 s lang
  jeden Aufruf scheitern lässt, auch Credits und Inferenz; jeder andere Status setzt den Zähler zurück. Deshalb antwortet keine
  Sandbox-Route je mit einem dieser fünf. Ist `sandboxd` nicht erreichbar, antwortet es nicht in der Zeit oder nimmt es den Schlüssel
  nicht an (401), antwortet `POST /v1/sandboxes` mit 501 wie heute (die Runtime startet dann ihren lokalen Worker,
  `src/agent/loop.ts:304` am Pin) und nichts wird reserviert oder berechnet; die übrigen Routen antworten dann mit 501 und einem Satz, der
  sagt, dass der Sandbox-Server gerade nicht erreichbar ist. 404 nur für eine unbekannte ID oder die Sandbox eines anderen Kontos (die
  Runtime wiederholt 404 dreimal, das ist harmlos), 403 nie, weil die Runtime bei `exec` und Dateien dann hart abbricht.
- Anlegen nach `## Grenzen`: `memory_mb` bis 512 mit `vcpu` 1 und `disk_gb` bis 5 ist die Stufe klein, bis 1024 mit `vcpu` 1 und
  `disk_gb` bis 10 die Stufe mittel; alles darüber (die Kind-Stufen 2048/2/20 und größer, `src/replication/spawn.ts:21` am Pin) bekommt
  400 mit den beiden Stufen im Text. Höchstens zwei Plätze je Konto, eine mittlere zählt als zwei (`sandboxd` zählt ebenso,
  `OWNER_SLOTS`); ein voller Server oder volle Plätze sind 409 mit Klartext, kein 503. Die Antwort trägt `id`, `status`, `region`,
  `vcpu`, `memory_mb`, `disk_gb`, `terminal_url` (leer, solange es kein Terminal gibt) und `created_at`; `GET /v1/sandboxes` gibt nur
  die Sandboxes des eigenen Kontos.
- `owner` an `sandboxd` ist eine zufällige Kennung je Konto aus der Datenbank des Control Plane, nie die Adresse: Auf dem Server mit
  fremdem Code liegt keine Adresse eines Kunden. Die Zuordnung Sandbox zu Konto hält das Control Plane in einer eigenen Tabelle.
- `exec` reicht `command` und `timeout` (höchstens 600000 ms nach `## Grenzen`) und den `Idempotency-Key` durch. Die Runtime bricht
  jeden Versuch nach 30 s ab und wiederholt ihn mit demselben Schlüssel (`docs/sandbox/vertrag.md`, Für alle Aufrufe gleich): Das
  Control Plane hält eine Anfrage höchstens rund 25 s, ein zweiter Aufruf mit demselben Schlüssel für dieselbe Sandbox startet nichts
  Neues, sondern wartet auf den laufenden Befehl und liefert dessen `stdout`, `stderr` und `exit_code`. Belegt mit einem Test, in dem
  zwei Aufrufe mit demselben Schlüssel genau eine Ausführung am nachgebauten `sandboxd` ergeben. `exec` selbst kostet nichts, berechnet
  wird nur Laufzeit.
- Abrechnung (Entscheidung Tech Lead, 12.11.2026): je begonnenem Schritt von 6 Minuten, in dem die Sandbox lief, 100 mc für klein und
  200 mc für mittel, gebucht am Ende des Schritts oder beim Stopp, eine Ledger-Zeile `sandbox` je Schritt mit `ref`
  `sandbox:<id>:<schritt>` unter einem eindeutigen Index, also nie zweimal, auch nicht nach einem Neustart oder wenn der Takt doppelt
  läuft. Laufzeit ist, was `sandboxd` mit `started_at` und `stopped_at` belegt; was nach einem Neustart des Dienstes fehlt, holt der erste
  Takt nach, ohne einen Schritt doppelt zu buchen. Die 1000 mc beim Anlegen sind eine Reservierung, die einen Neustart überlebt: nicht
  über `wallets.reserved_mc`, denn `migrate()` setzt die Spalte bei jedem Start auf 0 (`src/db.ts`, wie bei `bounty_hold`). Reicht das
  Guthaben für den nächsten Schritt nicht, stoppt das Control Plane die Sandbox über `sandboxd` (nicht löschen), der Saldo wird nie
  negativ. Ein Aufruf auf eine wegen Guthaben gestoppte Sandbox startet sie wieder, sobald das Guthaben für die Reservierung reicht,
  sonst 402 mit `details`. Das Löschen durch `sandboxd` nach 7 Tagen und das Stoppen nach 24 Stunden ohne Aufruf beenden die Abrechnung.
- 402 beim Anlegen genau wie in `docs/sandbox/vertrag.md`: JSON mit `details.required_cents` und `details.current_balance_cents` (ganze
  Cent, 1000 mc sind 1 Cent), damit die Runtime ihr Topup selbst auslöst und es ein zweites Mal versucht (`src/conway/topup.ts:81` am
  Pin). Ohne Guthaben geht keine Anfrage an `sandboxd`.
- `DELETE /v1/sandboxes/{id}` ruft die Runtime nicht auf (`deleteSandbox` ist am Pin leer), das Control Plane bietet es trotzdem an,
  damit die Live-Prüfung aufräumt: Es bucht den begonnenen Schritt, gibt die Reservierung frei und löscht über `sandboxd`.
- Freigegebene Ports (Entscheidung Tech Lead, 12.11.2026, folgt aus `goals/sandbox/ANNAHMEN.md`, Goal 02, Kritik):
  `POST /v1/sandboxes/{id}/ports/expose` und `DELETE /v1/sandboxes/{id}/ports/{port}` antworten mit 409 und JSON
  `{"error": "port_exposure_unavailable", ...}` und reichen nichts an `sandboxd` weiter, weil unter `*.postyourprice.com` kein fremder
  Dienst eines Kunden auftreten darf, solange die eigene Domain für Ports fehlt (ihr Kauf ist `server_kauf`). Die Runtime gibt den Fehler
  an das Werkzeug `expose_port` weiter und läuft weiter. Anlegen, `exec` und Dateien, also das, was der fremde Automaton am 10.11.2026
  aufrief, gehen trotzdem live.
- Client im Control Plane gegen das Signaturformat aus `## Verbindung`, Byte für Byte: Ein Test prüft die Beispielsignatur aus dem Plan
  (aus der Datei gelesen, nicht abgeschrieben), vergleicht die Nachricht des Clients mit `canonicalMessage` aus
  `ops/sandbox/sandboxd.mjs` und lässt `createVerifier` von dort die Anfrage des Clients annehmen, auch für einen kodierten Pfad mit
  Query wie `/v1/sandboxes/abc/files/read?path=%2Froot%2Fa%20b` (übernimmt `goals/_vorschlaege/sandbox-kritik-2026-11-12-3.md`). Der
  Pfad wird signiert, wie er auf die Leitung geht, also nach der Kodierung. Der Schlüssel entsteht beim ersten Start des Dienstes neben
  der Datenbank (`/data/sandbox-client.key`, 0600, und `/data/sandbox-client.pub` als SPKI-PEM), ein zweiter Start nimmt denselben;
  Ziel `https://ctl.sbx.postyourprice.com`, für Tests über eine Umgebungsvariable auf den nachgebauten `sandboxd` umstellbar.
- Nach dem Rollout gibt es den Schlüssel erst im Volume, bis dahin antwortet die Produktion 501 wie heute. Darum bekommt
  `ops/sandbox/setup.sh` den Schritt `--client-key <adresse>`: liest `/data/sandbox-client.pub` lesend mit
  `docker exec deploy-cp-1 cat /data/sandbox-client.pub` über `CP_SSH_KEY`, prüft, dass es ein Ed25519-Schlüssel ist, legt ihn nur bei
  Abweichung als `/etc/sandboxd/keys/cp.pub` auf `srv1327036` und meldet `changed=0` oder `changed=1`; der Selbsttest deckt beide Fälle
  und einen kaputten Schlüssel ab. `ops/live.sh` ruft diesen Schritt im Live-Modus zuerst auf, er ist das Einzige, was die Live-Prüfung
  schreibt, außerhalb des Zahlungsservers. Danach in `ops/live.sh` die Prüfung `sandbox`: ein signierter `GET /v1/sandboxes` über
  `ctl.sbx` aus dem Container `cp` (`docker exec deploy-cp-1 node -e …`, liest nur) bekommt 200 statt 401, dann über die öffentliche API
  mit dem Schlüssel der eigenen Adresse: anlegen (Stufe klein), `exec` mit `echo ok` gibt `ok`, `files/upload/json` und `files/read`
  geben denselben Text zurück, `DELETE`, und das Ledger zeigt für genau diese Sandbox mindestens eine Zeile `sandbox` (Abfrage mit
  `readonly: true`, Ausgabe nur Zahlen). Und die Prüfung `sandbox-foreign`: Zahl der fremden Konten (nicht in `src/bounties/ours.ts`) mit
  mindestens einer Zeile `sandbox`, nur angezeigt, `FAIL` nur, wenn sie sich nicht lesen lässt. Sie ist der Prüfbefehl des
  Abschlusskriteriums in `ROADMAP.md`. Beide Prüfungen sind im Selbsttest in beide Richtungen bewiesen (gepflanzte fremde Zeile zählt,
  eigene nicht; fehlende Ledger-Zeile, falscher `exec`-Text und 401 über `ctl.sbx` werden `FAIL`).
- Die eigene Adresse der Live-Prüfung: eine neue Kennung über die öffentliche Tür `POST /v1/auth/keyless` (wie
  `ops/keyless-walk.sh`), im selben Commit in `src/bounties/ours.ts` und `ops/ours.txt` mit einem Kommentar, der `live-sandbox` nennt
  (die Regel in `ours.ts`: wer eine Kennung prägt, trägt sie im selben Commit ein). Ihr API-Key liegt nur auf dem code-host in
  `~/.config/control-plane/live-sandbox.env` (0600), nie im Repo, im Log oder im Kommentar. Ihre Credits sind genau eine interne
  Gutschrift über Code, der mit dem Rollout läuft (wie die Gutschrift aus abrechnung 01), 100000 mc, idempotent über `ref`
  `grant:live-sandbox`, nicht aus dem Topf der Startgutschriften und in keiner Zahl fremder Konten. Das ist Nutzung des eigenen,
  bezahlten Servers, keine Wallet-Bewegung (`loop-constraints.md`, Grundregel 10).
- Öffentliche Texte: Der Satz „Sandboxes and transfers answer 501“ in `src/public/fix.ts` und `SANDBOX_NOTE` in `src/app.ts` sagen nach
  diesem Goal das Falsche. Der Satz wird an derselben Stelle korrigiert, ohne Aufbau, Gewichtung oder Grafik der Seite zu ändern; das ist
  keine sichtbare Änderung einer Fläche im Sinne von `LOOP.md`, braucht also kein SOLL-Bild. Was die Seite über Ports sagt, stimmt mit
  dem 409 überein. Tests, die heute die 501 der Sandboxes verlangen (`test/messages.test.ts`, „sandboxes: the 501 stays“), bekommen die
  Erwartung des neuen Vertrags, ohne eine Prüfung zu streichen.
- Prüfbefehle ohne Netz binden keinen festen Port (nachgebauter `sandboxd` auf Port 0 oder im Prozess), Node 22 vorn im `PATH`
  (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, neue Dateien vor dem lokalen `check` stagen (er liest
  nur getrackte Dateien). Die Linse K prüft Abrechnung und Sandbox mit Mutation: Jeder neue Test war vor dem Fix rot, und die Zeile im
  Progress Log nennt, womit.
- Was danach schneller zu mehr zahlenden Automatons führt: sandbox 04 zeigt im Harness, dass die unveränderte Runtime anlegt, ausführt
  und richtig abgerechnet wird; die eigene Domain für freigegebene Ports (Kauf über `server_kauf`) schaltet `ports/expose` frei, das die
  Agent-Card eines Dienstes in der Registry braucht.

## Done Condition
- [x] Jede Zeile mit `/v1/sandboxes` aus `docs/sandbox/vertrag.md`, `## Endpunkte`, antwortet gegen einen nachgebauten `sandboxd` mit
      den Feldern, die die Runtime dort liest; die Tests lesen die Zeilen aus der Datei und decken Stufen, 400 über 1024 MB, Plätze je
      Konto, fremde Sandbox mit 404, 402 mit `details` ohne Aufruf an `sandboxd` und das Verbot der wiederholten Statuscodes ab.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandbox-api.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -c "vertrag.md" test/sandbox-api.test.ts` muss mindestens 1 ausgeben.
      Prüfung: `for w in exec files/upload/json files/read ports/expose terminal_url exit_code required_cents current_balance_cents 1024 slots 404 unreachable 501 429 503; do grep -qF -- "$w" test/sandbox-api.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
- [x] `exec` mit demselben `Idempotency-Key` führt den Befehl genau einmal aus und liefert der Wiederholung sein Ergebnis, auch wenn er
      länger läuft als eine Anfrage gehalten wird.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandbox-api.test.ts -t "Idempotency-Key"` muss Exit-Code 0 haben und mindestens einen Test ausführen (`passed`, nicht `skipped`).
- [x] Die Abrechnung bucht je begonnenem Schritt von 6 Minuten 100 mc (klein) oder 200 mc (mittel) als Ledger-Zeile `sandbox` in
      derselben Transaktion wie der Saldo, genau einmal je Schritt, reserviert 1000 mc beim Anlegen über einen Neustart hinweg, stoppt bei
      leerem Guthaben ohne negativen Saldo, berechnet keine gestoppte Zeit und startet nach Topup wieder; die Tests laufen mit gestellter
      Uhr.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandbox-billing.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for w in 100 200 1000 reserve restart idempotent stopped empty negative topup transaction live-sandbox; do grep -qi -- "$w" test/sandbox-billing.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
- [x] Der Client signiert nach `docs/sandbox/plan.md`, `## Verbindung`, und `sandboxd` nimmt seine Anfragen an, auch mit kodiertem Pfad
      und Query; der Schlüssel entsteht beim ersten Start mit 0600 und bleibt beim zweiten.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandbox-client.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -c "plan.md" test/sandbox-client.test.ts` muss mindestens 1 ausgeben, `grep -cF "%2Froot%2Fa%20b" test/sandbox-client.test.ts` mindestens 1 und `grep -c "canonicalMessage" test/sandbox-client.test.ts` mindestens 1.
- [x] Freigegebene Ports antworten mit 409 `port_exposure_unavailable` und erreichen `sandboxd` nicht, und die Entscheidung steht in
      `goals/sandbox/ANNAHMEN.md`.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandbox-api.test.ts -t "port_exposure_unavailable"` muss Exit-Code 0 haben und mindestens einen Test ausführen.
      Prüfung: `awk '/^## Goal 03/{f=1} f' goals/sandbox/ANNAHMEN.md | grep -c "port_exposure_unavailable"` muss mindestens 1 ausgeben.
- [x] `ops/sandbox/setup.sh --client-key` trägt den öffentlichen Schlüssel des Dienstes `cp` ein, idempotent, und lehnt einen kaputten
      Schlüssel ab.
      Prüfung: `bash ops/sandbox/setup.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `SETUP SELFTEST OK` ausgeben.
      Prüfung: `grep -c -- "--client-key" ops/sandbox/setup.sh` muss mindestens 2 ausgeben.
- [x] `ops/live.sh` hat die Prüfungen `sandbox` und `sandbox-foreign`, im Selbsttest in beide Richtungen bewiesen, und liest das Ledger
      nur mit `readonly: true`.
      Prüfung: `bash ops/live.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `LIVE SELFTEST OK` ausgeben.
      Prüfung: `for w in sandbox sandbox-foreign; do grep -qE "^#   $w " ops/live.sh || echo "fehlt $w"; done` muss nichts ausgeben, und `grep -cE "readonly: *true" ops/live.sh` mindestens 1.
- [x] Die eigene Adresse der Live-Prüfung ist als eigene eingetragen, ihr Schlüssel liegt nicht im Repo, und kein öffentlicher Text nennt
      die 501 der Sandboxes mehr.
      Prüfung: `grep -c "live-sandbox" src/bounties/ours.ts` muss mindestens 1 ausgeben, und `PATH=/usr/bin:$PATH pnpm -s vitest run test/ours.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -c "Sandboxes and transfers answer 501" src/public/fix.ts` muss 0 ausgeben.
- [x] `docs/sandbox/plan.md` nennt den Schritt `--client-key` in `## Verbindung` und die Regel des begonnenen Schritts in `## Preis`.
      Prüfung: `awk '/^## Verbindung/{f=1;next} /^## /{f=0} f' docs/sandbox/plan.md | grep -c -- "--client-key"` muss mindestens 1 ausgeben.
      Prüfung: `awk '/^## Preis/{f=1;next} /^## /{f=0} f' docs/sandbox/plan.md | grep -ci "begonnen"` muss mindestens 1 ausgeben.
- [x] Das Goal ändert weder Zahlung, Anmeldung, Harness noch Betrieb und bringt keinen Schlüssel ins Repo.
      Prüfung: `git diff --name-only origin/dev...HEAD -- src/payments src/auth harness deploy .github | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -cE "\.(key|pem|env)$|sandbox-client\.(key|pub)|live-sandbox\.env"` muss 0 ausgeben (Kritik 12.11.2026: das Muster `sandbox-client` traf die Testdatei, die Punkt 4 verlangt).
- [x] `check` ist grün, und der Job `e2e` des Goal-PR ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/sandbox-03 --state all --json number -q '.[0].number'); gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,state -q '.[] | select(.name=="e2e") | .state'` muss `SUCCESS` ausgeben.
- [x] Eine Wiederholung von `POST /v1/sandboxes` desselben Kontos mit demselben Body, die kommt, während das erste Anlegen noch
      läuft oder bis 60 s danach, legt nichts Neues an und bekommt dieselbe Sandbox (Kritik 12.11.2026: Die Runtime bricht jeden
      Versuch nach 30 s ab und schickt `createSandbox` ohne `Idempotency-Key` noch einmal, `src/conway/http-client.ts:115` und
      `src/conway/client.ts:255` am Pin; heute hält das Control Plane das Anlegen bis 120 s, und ein Abbruch ergibt eine zweite
      Sandbox, während die erste ohne Wissen des Kunden läuft und abgerechnet wird, gegen Grundregel 6).
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandbox-api.test.ts -t "repeated create"` muss Exit-Code 0 haben und mindestens zwei Tests ausführen (`passed`, nicht `skipped`), einen mit der Wiederholung während des Anlegens und einen danach, je mit genau einem Anlegen am nachgebauten `sandboxd` und derselben `id` in beiden Antworten.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei und jede neue Selftest-Zeile war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Jede Zahl in `docs/sandbox/` mit dem Befehl, aus dem sie stammt; keine Adresse und kein Name eines Kunden, kein API-Key.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `src/payments/**`, `src/auth/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`
- der Zahlungsserver `76.13.144.207`: nur lesen nach `loop-constraints.md` (Produktion: nur lesen), kein Rollout, kein Neustart, keine
  Änderung an Datenbank, Volume, Compose oder `.env`; die Gutschrift der eigenen Adresse kommt nur über Code mit `deploy.yml`
- auf `srv1327036`: Units `wa-api` und `wa-worker`, Nutzer `wa` und `wa-deploy`, `/srv/wissensanker`, `/etc/wissensanker`, Postgres,
  der Caddy-Block von wa-staging, die Regeln von ufw; geändert wird dort nur `/etc/sandboxd/keys/cp.pub` über `setup.sh --client-key`
- DNS der Zone `postyourprice.com`; kein freigegebener Port eines Kunden unter `*.postyourprice.com`
- Wallet-Bewegung, Topup, Überweisung (`loop-constraints.md`, Grundregel 10)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-12 Zyklus 1: Punkte 1 bis 9 und 11 gebaut, Punkt 10 offen: `src/sandbox/` (signierter Client, Dienst für die Zeilen mit `/v1/sandboxes`, Abrechnungstakt), Reservierung in `sandboxes.hold_mc`, `setup.sh --client-key`, `live.sh` mit `sandbox` und `sandbox-foreign`, eigene Adresse `live-sandbox` über SIWE (Tür `keyless` gab 429 `daily_limit`), Abweichungen in `ANNAHMEN.md`, Goal 03. Rot vor dem Fix, je Mutation am neuen Code: ohne Map und Durchreichen des `Idempotency-Key` 2 rot, nur ohne Map 1 rot (zweite `exec`-Anfrage an `sandboxd`), 402-Schwelle 0 statt 1000 2 rot, 501 als 503 1 rot, Ports als 200 1 rot, Schritt aufgerundet 3 rot, Reservierung nicht gezählt 2 rot, `settlesHold` ignoriert 2 rot, Index je Schritt nicht eindeutig 1 rot, kein Neustart nach Topup 1 rot, Gutschrift als `grant` 1 rot, Nachricht ohne Zeitstempel 5 rot, Schlüssel 0644 1 rot, Schlüssel je Start neu 2 rot, Owner gleich Adresse 1 rot, drei Plätze 1 rot, Stufe 2048 2 rot, fremde Sandbox sichtbar 1 rot; der Client-Test fing beim ersten Lauf `URLSearchParams` (`%20` wurde `+`); Selbsttests von `setup.sh` und `live.sh` mit kaputt gemachter Ed25519-Prüfung, Hashvergleich, `judge_sandbox` und Ausschluss eigener Konten je `SELFTEST FAIL`. Prüfbefehle: P1 `vitest run test/sandbox-api.test.ts` Exit 0 (18 passed), grep vertrag.md 6, Wortliste leer; P2 `-t "Idempotency-Key"` Exit 0 (2 passed); P3 `vitest run test/sandbox-billing.test.ts` Exit 0 (12 passed), Wortliste leer; P4 `vitest run test/sandbox-client.test.ts` Exit 0 (8 passed), grep plan.md 6, `%2Froot%2Fa%20b` 3, canonicalMessage 5; P5 `-t "port_exposure_unavailable"` Exit 0 (1 passed), ANNAHMEN 3; P6 `setup.sh --selftest` Exit 0 `SETUP SELFTEST OK`, grep `--client-key` 7; P7 `live.sh --selftest` Exit 0 `LIVE SELFTEST OK`, Kopfzeilen da, `readonly: true` 4; P8 grep live-sandbox 3, `vitest run test/ours.test.ts` Exit 0 (8 passed), Satz 0; P9 1 und 1; P10 erster Befehl 0, zweiter 1 statt 0, Treffer `test/sandbox-client.test.ts`, den Punkt 4 mit diesem Namen verlangt, kein Schlüssel im Diff; P11 `node scripts/check.mjs` Exit 0 (110 Dateien, 1400 passed), (Netz) `e2e` an PR #36 `SUCCESS` (`E2E OK turns=5 registered=true api_errors=0 ledger_consistent=true`).
- 2026-11-12 Zyklus 2: Abschluss gemeldet, Punkte 1 bis 9 und 11; `dev` brachte nichts Neues (`git log HEAD..origin/dev` leer), Punkt 10 bleibt offen, weil sein zweiter Prüfbefehl mit dem Muster `sandbox-client` genau die Testdatei `test/sandbox-client.test.ts` trifft, die Punkt 4 mit diesem Namen verlangt; beide Prüfbefehle sind Vertrag, ein Schlüssel liegt nicht im Diff. Prüfbefehle: P1 Exit 0 (18 passed), grep vertrag.md 6, Wortliste leer; P2 Exit 0 (2 passed); P3 Exit 0 (12 passed), Wortliste leer; P4 Exit 0 (8 passed), grep 6, 3 und 5; P5 Exit 0 (1 passed), ANNAHMEN 3; P6 Exit 0 `SETUP SELFTEST OK`, grep 7; P7 Exit 0 `LIVE SELFTEST OK`, Kopfzeilen da, `readonly: true` 4; P8 grep 3, `test/ours.test.ts` Exit 0 (8 passed), Satz 0; P9 1 und 1; P10 erster Befehl 0, zweiter 1 (`test/sandbox-client.test.ts`); P11 `node scripts/check.mjs` Exit 0 (110 Dateien, 1400 passed), (Netz) `e2e` an PR #36 für ba34ae9 `SUCCESS`.
- 2026-11-12 Zyklus 3: Kritik-Punkt 12 gebaut (eine Wiederholung von `POST /v1/sandboxes` mit gleichem Konto und Body wartet auf das laufende Anlegen oder bekommt bis 60 s nach der Antwort 201 dieselbe Sandbox, Annahme in `ANNAHMEN.md`, Goal 03), Punkt 10 mit dem Muster der Kritik erneut ausgeführt, Abschluss gemeldet, Punkte 1 bis 12; `dev` brachte nichts Neues. Rot vor dem Fix: die drei Tests `repeated create` gegen den alten Code 2 rot (zweites `POST /v1/sandboxes` an `sandboxd`, andere `id`); Mutationen am neuen Code: ohne Beitritt zum laufenden Anlegen 1 rot, ohne Wiederverwendung nach der Antwort 2 rot, Fenster ohne Ende 1 rot; der Schlüssel ohne Konto bleibt grün, weil `ownRow` eine fremde Sandbox nie zurückgibt. Zwei Slot-Tests und ein 401-Test legen jetzt mit eigenem `name` an, weil derselbe Body binnen 60 s dieselbe Sandbox ist; keine Prüfung gestrichen. Prüfbefehle: P1 Exit 0 (21 passed), grep vertrag.md 6, Wortliste leer; P2 Exit 0 (5 passed); P3 Exit 0 (12 passed), Wortliste leer; P4 Exit 0 (8 passed), grep 6, 3 und 5; P5 Exit 0 (1 passed), ANNAHMEN 3; P6 Exit 0 `SETUP SELFTEST OK`, grep 7; P7 Exit 0 `LIVE SELFTEST OK`, Kopfzeilen da, `readonly: true` 4; P8 grep 3, `test/ours.test.ts` Exit 0 (8 passed), Satz 0; P9 1 und 1; P10 0 und 0; P11 lokal `node scripts/check.mjs` Exit 1 bei 110 Dateien und 1403 passed, einziger Fehler `Timeout calling "onTaskUpdate"` von vitest unter Last 113 bis 117 auf 16 Kernen, dreimal gleich; Job `check` auf GitHub für 141c72f `SUCCESS`, (Netz) `e2e` an PR #36 für 141c72f `SUCCESS`; P12 Exit 0 (3 passed).

## Blockers
