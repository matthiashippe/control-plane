# Relay Goal 04: Antworten an Konten ohne Wallet nur bei Bedarf

## Status
PLANNED

## Active Objective
Die Runtime am Pin kann einer Kennung `key:…` nicht antworten, weil `validateMessage` für `to` eine EVM- oder Solana-Adresse verlangt
(`docs/relay/vertrag.md`, Abschnitt `## Ungeprüfte Absender`). Ob dafür eine Antwortadresse gebaut wird, entscheidet eine Zählung,
keine Vermutung: Ein neues Werkzeug `ops/relay-keyless.sh` zählt aus der Datenbank der Produktion (nur lesen, `readonly: true`) die
Ledger-Zeilen `relay` eines Versands mit API-Key, die fremden Konten dahinter und wie viele davon keine Wallet haben, nur Summen, mit
Selbsttest ohne Netz in beide Richtungen. Die Zahl steht samt Befehl in `docs/relay/vertrag.md`, die Entscheidung in
`goals/relay/ANNAHMEN.md`. Ab einem fremden Konto ohne Wallet schreibt der Maker den Vorschlag für das Glied „Antwortadresse“, aus
dem der Writer ein Kettenglied macht; bei 0 bleibt der Vertrag, wie er ist (`ROADMAP.md`, relay 04; übernimmt
`goals/_vorschlaege/relay-nacharbeit-2026-11-13-1.md`).
Widerlegt, wenn die Zählung 0 fremde Konten ohne Wallet ergibt; dann entfällt die Antwortadresse, und das Goal ist trotzdem erreicht.
MVP: Funktion, weil ein Mensch ohne Wallet Automatons anschreiben, aber keine Antwort bekommen kann, und weil eine Antwortadresse ohne
einen einzigen Nutzer Bauzeit kostet, die beim zahlenden Kunden fehlt.

## Voraussetzungen
- relay Goal 03 DONE
- frühestens 2026-11-21

## Kontext für den Maker
- Ziel: Matthias und der Writer wissen nach einer Woche echtem Betrieb mit einer gemessenen Zahl, ob ein fremdes Konto ohne Wallet das
  Relay nutzt, und nur dann baut der Loop ihm einen Weg, Antworten zu bekommen.
- Start: relay 02 ging am 14.11.2026 um 01:04 UTC nach `dev` und rollte aus; eine Woche danach ist der 21.11. Der Loop Master startet
  ab 00:00 UTC, also fehlt dem ersten Fenster höchstens eine Stunde; die Zählung reicht ohnehin bis zum Moment der Messung und nennt
  ihn.
- Was zählt (Schema in `src/db.ts`, Buchung in `src/relay/store.ts`): Eine Ledger-Zeile `kind = 'relay'` entsteht nur beim Erstkontakt,
  `ref` ist `relay:<id>` der Nachricht in `relay_messages`. Sie ist ein Versand mit API-Key, wenn ihre Nachricht `verified = 0` trägt
  oder ihre `address` mit `key:` beginnt (ein Konto ohne Wallet kann nur mit API-Key senden). Fehlt die Nachricht (gelöscht nach
  30 Tagen, `RELAY_LIMITS.retentionDays`) und ist die Adresse eine `0x`-Adresse, ist die Zeile nicht zuzuordnen und wird als solche
  gezählt, nie still verworfen. Weil eine Antwort im Kontakt nichts kostet, zählt eine zweite Zeile die Nachrichten mit `verified = 0`
  aus `relay_messages` selbst. Entscheidend ist die dritte Zeile: die Zahl verschiedener fremder Absender `key:…` über beide Quellen.
- Eigene Konten zählen nie als fremd: dieselbe Definition wie `oursClause` in `ops/db-report.cjs` (Adresse in `OURS` oder ein Schlüssel
  in `api_keys`, dessen `name` auf ein Muster aus `OUR_KEY_NAMES` passt). Das Skript läuft wie `ops/db-report.cjs` als eigenständiger
  Code im Container und kann den Dienst nicht importieren; ob du die Listen aus `ops/db-report.cjs` liest oder kopierst und unter
  Test hältst wie `test/ours.test.ts`, entscheidest du und schreibst es in `goals/relay/ANNAHMEN.md`.
- Ausgabe, genau drei Zeilen, `<t>` ist der späteste `created_at` der gelesenen Zeilen (ISO UTC, `none` ohne Zeile):
  `RELAY API KEY up to <t>: <r> relay rows from <a> foreign accounts (<k> without wallet), <o> rows ours, <u> rows not attributable`,
  `RELAY API KEY MESSAGES up to <t>: <m> messages from <a> foreign accounts (<k> without wallet), <o> messages ours`,
  `KEYLESS SENDERS up to <t>: <n> foreign`. Keine Adresse, keine Kennung, kein Inhalt verlässt den Container: Die Summen rechnet SQL
  in `node -e` hinter `docker exec deploy-cp-1` wie `WALLETS_JS` in `ops/github-yield.sh`, mit `{ readonly: true }`. Aufrufe:
  ohne Argument die Produktion über `ssh` (`CP_SSH_KEY`, `CP_HOST` wie in `ops/github-yield.sh`), `--db <datei>` dieselbe Zählung
  auf einer lokalen SQLite-Datei, `--selftest` ohne Netz (`ssh` als Funktion, die scheitert, wie dort). Exit 2, wenn die Datenbank
  nicht lesbar ist oder `relay_messages` fehlt, Exit 1 bei falschem Argument.
- Fixture `ops/fixtures/relay-keyless.sql`: SQL, das eine leere Datei zu einer Datenbank mit den Tabellen macht, die das Werkzeug liest
  (Spalten wie in `src/db.ts`), mit genau diesen Fällen, alle Adressen und Kennungen erfunden außer der eigenen Kennung:
  fremdes Konto ohne Wallet K1: zwei Erstkontakte mit API-Key (an E2 und an K3), je Ledger-Zeile und Nachricht mit `verified = 0`;
  fremdes Konto E1 mit `0x`-Adresse: ein Erstkontakt mit API-Key an E2; fremdes Konto E2: ein signierter Erstkontakt an E4
  (`verified = 1`); fremdes Konto ohne Wallet K3: eine freie Antwort an K1 mit API-Key, Nachricht ohne Ledger-Zeile; eigenes Konto O1
  mit der Kennung `key:99e4d0eec698925fed5ac8099adf2f2263f1fe51` aus `OURS`: ein Erstkontakt mit API-Key; eigenes Konto O2 mit
  `0x`-Adresse und einem Schlüssel namens `harness-relay`: ein Erstkontakt mit API-Key; fremdes Konto ohne Wallet K2: eine Ledger-Zeile,
  deren Nachricht fehlt; fremdes Konto E3 mit `0x`-Adresse: eine Ledger-Zeile, deren Nachricht fehlt. Daraus folgen die Zahlen in
  Punkt 2. Der Selbsttest prüft dieselbe Fixture und die Gegenrichtung (alle fremden `key:`-Zeilen entfernt, dann `0 foreign`).
- Messung der Produktion: einmal `bash ops/relay-keyless.sh` vom code-host, ohne HTTP-Aufruf an den Dienst, nur die Datenbank lesend.
  Unter `## Ungeprüfte Absender` in `docs/relay/vertrag.md` genau eine neue Zeile
  `Konten ohne Wallet auf dem Relay: <n> fremde (<JJJJ-MM-TT HH:MM> UTC, Befehl ops/relay-keyless.sh)`, dazu die drei Ausgabezeilen
  als Block darunter. Sonst ändert sich am Vertrag nichts. In `goals/relay/ANNAHMEN.md` ein Abschnitt `## Goal 04 (<Datum>, Engineer CP)`
  mit einer Zeile `- **Antwortadresse:** ja, weil …` bei `n` ab 1 oder `- **Antwortadresse:** nein, weil …` bei 0.
- Bei `ja` ein Vorschlag `goals/_vorschlaege/relay-nacharbeit-<JJJJ-MM-TT>-<n>.md` im Format aus dem Skill (`Schwere: 2`,
  `Goal: relay 04`, Beleg mit dem Befehl und der Zeile `KEYLESS SENDERS`) mit der Zeile
  `Empfehlung: Antwortadresse für Konten ohne Wallet: eine EVM-Adresse, die das Relay für das Konto führt und auf seine Kennung abbildet`.
  Daraus hängt der Writer das Glied an die Zeile relay in `ROADMAP.md`; dieses Goal baut die Antwortadresse nicht und ändert nichts
  unter `src/`.
- Rollout: `ops/**` steht unter den Pfaden, die nach dem Merge ausrollen; der Dienst ändert sich dabei nicht, das Werkzeug läuft vom
  code-host. Prüfbefehle ohne Netz binden keinen festen Port, Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im
  Vordergrund mit eigenem Timeout, neue Dateien vor dem lokalen `check` stagen.
- Was danach schneller zu mehr zahlenden Automatons führt: Zeigt die Zahl Nutzer ohne Wallet, bekommen sie Antworten und damit einen
  Grund, Credits für Erstkontakte zu kaufen; zeigt sie 0, bleibt die Bauzeit bei den Topics, die zahlende Kunden halten.

## Done Condition
- [ ] `ops/relay-keyless.sh` besteht seinen Selbsttest ohne Netz in beide Richtungen, öffnet die Datenbank nur lesend, und
      `test/relay-keyless.test.ts` führt den Selbsttest und die Fixture aus.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/relay-keyless.sh --selftest | tail -1 | grep -c '^SELFTEST OK'` muss genau 1 ausgeben.
      Prüfung: `grep -c "readonly: true" ops/relay-keyless.sh` muss mindestens 1 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/relay-keyless.test.ts` muss Exit-Code 0 haben.
- [ ] Die Zählung auf der Fixture trifft jeden Fall, in beide Richtungen, ohne eine Adresse auszugeben.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH node -e 'const D=require("better-sqlite3");new D(process.argv[1]).exec(require("fs").readFileSync(process.argv[2],"utf8"))' $T/f.db ops/fixtures/relay-keyless.sql && PATH=/usr/bin:$PATH bash ops/relay-keyless.sh --db $T/f.db | sed 's/ up to [^:]*:/:/'` muss genau diese drei Zeilen ausgeben: `RELAY API KEY: 4 relay rows from 3 foreign accounts (2 without wallet), 2 rows ours, 1 rows not attributable`, `RELAY API KEY MESSAGES: 4 messages from 3 foreign accounts (2 without wallet), 2 messages ours`, `KEYLESS SENDERS: 3 foreign`.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH node -e 'const D=require("better-sqlite3");const d=new D(process.argv[1]);d.exec(require("fs").readFileSync(process.argv[2],"utf8"));const o="key:99e4d0eec698925fed5ac8099adf2f2263f1fe51";d.prepare("DELETE FROM ledger WHERE address LIKE ? AND address <> ?").run("key:%",o);d.prepare("DELETE FROM relay_messages WHERE sender LIKE ? AND sender <> ?").run("key:%",o)' $T/f.db ops/fixtures/relay-keyless.sql && PATH=/usr/bin:$PATH bash ops/relay-keyless.sh --db $T/f.db | sed -n 3p | sed 's/ up to [^:]*:/:/'` muss genau `KEYLESS SENDERS: 0 foreign` ausgeben.
      Prüfung: `T=$(mktemp -d); PATH=/usr/bin:$PATH node -e 'const D=require("better-sqlite3");new D(process.argv[1]).exec(require("fs").readFileSync(process.argv[2],"utf8"))' $T/f.db ops/fixtures/relay-keyless.sql && PATH=/usr/bin:$PATH bash ops/relay-keyless.sh --db $T/f.db | grep -cE '0x[0-9a-fA-F]{40}|key:[0-9a-f]{40}'` muss genau 0 ausgeben.
- [ ] Die Zahl der Produktion steht mit Befehl im Vertrag, und die Entscheidung passt zu ihr.
      Prüfung: `grep -cE '^Konten ohne Wallet auf dem Relay: [0-9]+ fremde \(20[0-9-]+ [0-9:]+ UTC, Befehl ops/relay-keyless\.sh\)$' docs/relay/vertrag.md` muss genau 1 ausgeben.
      Prüfung: `n=$(sed -n 's/^Konten ohne Wallet auf dem Relay: \([0-9]*\) fremde.*/\1/p' docs/relay/vertrag.md); a=$(awk '/^## Goal 04 /{f=1;next} /^## /{f=0} f' goals/relay/ANNAHMEN.md | sed -n 's/^- \*\*Antwortadresse:\*\* \(ja\|nein\), weil .*/\1/p'); v=$(grep -l '^Empfehlung: Antwortadresse für Konten ohne Wallet' goals/_vorschlaege/relay-nacharbeit-*.md 2>/dev/null | xargs -r grep -l '^Goal: relay 04' | wc -l); { [ "$n" -ge 1 ] 2>/dev/null && [ "$a" = ja ] && [ "$v" -ge 1 ]; } || { [ "$n" = 0 ] && [ "$a" = nein ] && [ "$v" = 0 ]; } && echo passt` muss genau `passt` ausgeben.
      Prüfung (Netz): `n=$(PATH=/usr/bin:$PATH bash ops/relay-keyless.sh | sed -n 's/^KEYLESS SENDERS up to .*: \([0-9]*\) foreign$/\1/p'); d=$(sed -n 's/^Konten ohne Wallet auf dem Relay: \([0-9]*\) fremde.*/\1/p' docs/relay/vertrag.md); [ -n "$n" ] && [ -n "$d" ] && [ "$n" -ge "$d" ] && echo passt` muss genau `passt` ausgeben.
      Prüfung (Netz): `PATH=/usr/bin:$PATH bash ops/relay-keyless.sh | grep -cE '0x[0-9a-fA-F]{40}|key:[0-9a-f]{40}'` muss genau 0 ausgeben.
- [ ] Nur Werkzeug, Fixture, Test, Vertrag und Goal-Dateien: nichts unter `src/`, am Vertrag nur hinzugefügte Zeilen.
      Prüfung: `git diff --name-only "$(git merge-base origin/dev HEAD)" HEAD | grep -v -e '^ops/relay-keyless\.sh$' -e '^ops/fixtures/relay-keyless' -e '^test/relay-keyless\.test\.ts$' -e '^docs/relay/vertrag\.md$' -e '^goals/relay/' -e '^goals/_vorschlaege/relay-nacharbeit-' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff "$(git merge-base origin/dev HEAD)" HEAD -- docs/relay/vertrag.md | grep -c '^-[^-]'` muss 0 ausgeben.
- [ ] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder Test in `test/relay-keyless.test.ts` war vor dem Werkzeug rot; die Zeile im Progress Log nennt, womit.
- [ ] Keine Zeile der Ausgabe, des Vertrags, von `ANNAHMEN.md` oder des Vorschlags nennt eine Adresse, eine Kennung oder einen Inhalt
      einer Nachricht der Produktion (`loop-constraints.md`, Grundregel 8).
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei, Vertrag und `ANNAHMEN.md` Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `.env*`, `src/**`
- `ops/**` außer `ops/relay-keyless.sh` und `ops/fixtures/relay-keyless*`; `ops/db-report.cjs` bleibt unverändert
- die Testdateien aus relay 01 bis 03: `test/relay.test.ts`, `test/relay-security.test.ts`, `test/relay-apikey.test.ts`,
  `test/relay-billing.test.ts`, `test/relay-poll-retry.test.ts`, `test/relay-storage.test.ts`, `test/relay-walk.test.ts`,
  `test/relay-world.ts`, `test/relay-signature-form.test.ts`, `test/relay-self-message.test.ts`, `test/relay-signature.test.ts`
- `ROADMAP.md` (das Glied hängt der Writer an)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 3

## Progress Log

## Blockers
