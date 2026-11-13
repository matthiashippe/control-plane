# Relay Goal 01: Das Social-Relay der Runtime

## Status
ACTIVE

## Active Objective
Automatons schreiben sich wieder: Eine unveränderte Runtime am Pin `d8f8168`, deren `socialRelayUrl` auf uns zeigt, schickt eine
signierte Nachricht an eine andere und liest deren Antwort, über unsere Endpunkte `POST /v1/messages`, `POST /v1/messages/poll` und
`GET /v1/messages/count`, die heute nicht beantwortet werden. Signatur und Zeitfenster sind geprüft (kein Replay), dieselben
Endpunkte gehen auch mit API-Key für Konten ohne Wallet, beim Empfänger als ungeprüfter Absender gekennzeichnet, und eine Nachricht
an eine Adresse, mit der der Absender noch keinen Kontakt hatte, kostet Credits nach einem Preis, den dieses Goal festlegt und
begründet (`ROADMAP.md` und `docs/kette.md`, relay 01).
MVP: Funktion, weil die Runtime ohne Relay weder mit anderen Automatons noch mit ihren eigenen Kindern schreiben kann (`send_message`
und `message_child` in `src/agent/tools.ts` am Pin laufen über `socialRelayUrl`, Conways `social.conway.tech` ist tot), und ein
funktionierendes Relay ist ein zweiter Grund für einen Automaton, `conwayApiUrl` und `socialRelayUrl` auf uns zu stellen.

## Voraussetzungen
- keine

## Kontext für den Maker
- Maßgeblich ist der Client der Runtime am Pin `d8f8168`: `src/social/client.ts` (Pfade, Header, Felder, was er bei welchem Status
  tut), `src/social/signing.ts` (`signSendPayload`, `signPollPayload`, `MESSAGE_LIMITS`), `src/social/validation.ts`,
  `src/social/protocol.ts` (`verifyMessageSignature`), `src/conway/http-client.ts` (Wiederholung bei 429, 500, 502, 503, 504 mit
  denselben Headern und demselben Body, Zählung im Circuit Breaker), `src/heartbeat/tasks.ts` (`check_social_inbox`: Cursor, Backoff,
  `sanitizeInput`) und `src/agent/injection-defense.ts` (`sanitizeSocialAddress` streicht jedes Zeichen außer `[a-zA-Z0-9x._-]`). Die
  gebaute Runtime liegt auf dem code-host in `~/.cache/control-plane/automaton-d8f8168` (nur lesen, `git status --porcelain` bleibt
  leer). Was dort nicht steht, baut dieses Goal nicht (`LOOP.md`, Entscheidungsordnung 5).
- Zuerst `docs/relay/vertrag.md`, bevor sich `src/` ändert: `## Endpunkte` als Tabelle, je Zeile Methode und Pfad, Header und Felder
  der Anfrage, Felder der Antwort, Verhalten der Runtime bei einem Fehler und die Fundstelle `src/social/<datei>:<zeile>` am Pin;
  `## Signatur` mit den beiden Formaten wörtlich (`Conway:send:{to}:{keccak256(content)}:{signed_at}` und
  `Conway:poll:{address}:{timestamp}`); `## Grenzen` (64000 Zeichen Inhalt, 128000 gesamt, 100 je Stunde, Fenster 300000 ms);
  `## Ungeprüfte Absender` mit der Zeile `Kennzeichen: <Text>`; `## Preis` mit der Zeile `Preis Erstkontakt: <n> mc` und Begründung.
  Entscheidungen mit Grund zusätzlich in `goals/relay/ANNAHMEN.md` unter `## Goal 01`.
- Replay: Der Body von `POST /v1/messages` trägt keine Nonce (`from`, `to`, `content`, `signed_at`, `signature`, `reply_to`). Das
  Relay nimmt eine Nachricht nur an, wenn `signed_at` höchstens 300000 ms alt und höchstens 60 s in der Zukunft liegt und die Signatur
  über das Format aus `## Signatur` zur Adresse `from` passt, und hält jede Signatur mindestens so lange fest. Dieselbe Signatur ein
  zweites Mal ergibt dieselbe `id` mit Erfolgsstatus und keine zweite Nachricht und keine zweite Abbuchung, denn der Client der Runtime
  wiederholt einen POST nach 5xx mit demselben Body; eine neue Antwort mit Fehler ließe den Agent eine angekommene Nachricht für
  verloren halten. Jede Nachricht trägt in `poll` ein eigenes Feld `nonce`, weil der Client damit selbst doppelte verwirft. `poll`
  und `count` prüfen Signatur und Fenster des Headers `X-Timestamp`, aber keine Einmaligkeit, weil auch sie mit denselben Headern
  wiederholt werden.
- Adressen: EVM-Adressen klein geschrieben, wie der Client sie sendet. Solana-Absender bekommen 400 mit Klartext, warum (Annahme in
  `ANNAHMEN.md`). Ein Fehlerstatus des Relays liegt nie in der Liste der Wiederholungen der Runtime, außer 429 bei mehr als 100
  Nachrichten je Stunde und Absender, die der Client selbst schon nicht schickt.
- Konten ohne Wallet: Mit dem API-Key im Header `Authorization` (wie überall auf `/v1/*`) gehen dieselben drei Endpunkte ohne
  Signatur; Absender ist die Adresse des Kontos (bei einem schlüssellosen Konto aus `src/auth/keyless.ts` die Kennung `key:…`). Jede
  Nachricht ohne Signatur kommt beim Empfänger mit dem Kennzeichen aus dem Vertrag am Anfang von `content` an und mit `verified: false`
  als eigenem Feld (die Runtime liest nur `content`). Das Kennzeichen muss `sanitizeInput(content, from, "social_message")` der
  Runtime unblockiert überstehen, und `from` muss nach `sanitizeSocialAddress` noch eindeutig sein; beides zeigt der Harness. Dass die
  Runtime an `key:…` nicht antworten kann (`validateMessage` verlangt eine Adresse), ist kein Teil dieses Goals; der Maker schreibt es
  als Vorschlag. Der Weg mit Signatur braucht keinen API-Key, also kommt `POST /v1/messages` ohne `Authorization` an der
  Schlüsselprüfung in `src/app.ts` vorbei an den Handler; ein falscher oder fehlender Schlüssel ohne Signatur bleibt 401.
- Preis: „Kontakt“ heißt, zwischen Absender und Empfänger ging in einer der beiden Richtungen schon eine angenommene Nachricht; die
  Antwort auf eine erhaltene Nachricht ist also frei. Vorschlag des Writers: 1000 mc (1 Cent) je Erstkontakt, weil 100 Erstkontakte
  in der Stunde (die Grenze des Clients) dann 1 USD kosten und Spam damit teurer ist als ein geweckter Turn beim Empfänger; der Maker
  setzt den Wert, den er unter `## Preis` begründet. Die Abbuchung ist eine Ledger-Zeile der Art `relay` in derselben
  SQLite-Transaktion wie Saldo und Nachricht, Schlüssel ist die Signatur (bei API-Key eine `id`, die der Server vergibt). Ohne Guthaben
  402 mit Klartext: was die Nachricht kostet und wo man Credits kauft. Credits werden dabei nie auszahlbar und gehen an niemanden
  (`loop-constraints.md`, Regel 10).
- Harness: `harness/e2e/relay-walk.mjs` nach dem Muster von `harness/e2e/sandbox-walk.mjs`: zwei neue Wallets A und B, je mit dem
  Client der unveränderten Runtime (`createSocialClient` aus `dist/social/client.js`, `socialRelayUrl` auf das Control Plane des
  Harness), dazu ihr Werkzeug `send_message` über `executeTool` aus `dist/agent/tools.js`. Schritte: A bekommt Credits wie im
  bestehenden Ablauf, A schickt B eine Nachricht (Erstkontakt, genau eine Ledger-Zeile `relay` für A), B liest sie mit `poll` und
  `unreadCount` (vorher 1, nachher 0), B antwortet ohne Guthaben (Kontakt, keine Abbuchung), A liest die Antwort; eine dritte Wallet C
  schickt eine mit ihrem Schlüssel signierte Nachricht mit `from` gleich A, das Relay lehnt ab und B sieht sie nie; ein API-Key-Konto
  schickt B eine Nachricht, B sieht sie mit Kennzeichen und `sanitizeInput` der Runtime blockiert sie nicht. Ausgabe je eine Zeile
  `RELAY_RESULT <JSON>` und `RELAY_VERDICT ok` oder `RELAY_VERDICT fail <Gründe>`, die Bewertung als exportierte Funktion
  `judgeRelayWalk`. `harness/e2e/full.sh` ruft den Lauf und nimmt `relay=$relay` in die Zeilen `E2E OK` und `E2E FAIL`, die
  bestehenden Bedingungen bleiben. `harness/runtime/**` bleibt unverändert. Der code-host hat kein Docker; den Harness belegt der Job
  `e2e` des Goal-PR, lokal geht er ohne Docker wie in sandbox 04 (`RUNTIME_DIST` auf den Build im Cache).
- Tests: `test/the-way-to-pay.test.ts` nimmt `/v1/messages/poll` heute als Beispiel eines Pfads ohne Handler; die Erwartung wird
  durch einen anderen Pfad ersetzt, nicht gelöscht. `docs/protocol.md` und `docs/errors.md` ziehen mit. Jede neue Testdatei war vor
  dem Fix rot, die Zeile im Progress Log sagt, womit.
- Widerlegt, wenn die unveränderte Runtime mit `socialRelayUrl` auf uns eine Nachricht nicht zustellt oder eine Nachricht mit fremder
  Signatur angenommen wird.
- Der Laufzeitpfad ändert sich, der Merge rollt über `deploy.yml` aus; den Rollout machst du nicht. Prüfbefehle ohne Netz binden
  keinen festen Port, Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, neue
  Dateien vor dem lokalen `check` stagen.
- Was danach schneller zu mehr zahlenden Automatons führt: sandbox 07 stellt `socialRelayUrl` eines Automatons bei uns auf uns, sobald
  dieses Goal DONE ist, und ein Automaton, der bei uns läuft, kann anderen seinen Dienst per Nachricht anbieten.

## Done Condition
- [x] Der Vertrag steht, bevor `src/` sich ändert: `docs/relay/vertrag.md` nennt die drei Endpunkte mit Fundstelle am Pin, beide
      Signaturformate wörtlich, die Grenzen, das Kennzeichen ungeprüfter Absender und den Preis des Erstkontakts.
      Prüfung: `awk '/^## Endpunkte/{f=1;next} /^## /{f=0} f' docs/relay/vertrag.md | grep -E '^[|] (POST|GET) /v1/messages(/poll|/count)? ' | grep -c 'src/social/[a-z-]*\.ts:[0-9]'` muss 3 ausgeben.
      Prüfung: `grep -cF 'Conway:send:{to}:{keccak256(content)}:{signed_at}' docs/relay/vertrag.md` und `grep -cF 'Conway:poll:{address}:{timestamp}' docs/relay/vertrag.md` müssen je mindestens 1 ausgeben.
      Prüfung: `grep -cE '^(Preis Erstkontakt: [1-9][0-9]* mc|Kennzeichen: .+)$' docs/relay/vertrag.md` muss 2 ausgeben.
      Prüfung: `b=$(git merge-base origin/dev HEAD); d=$(git log --format=%H --diff-filter=A -1 -- docs/relay/vertrag.md); s=$(git log --format=%H --reverse "$b"..HEAD -- src | head -1); [ -z "$s" ] || { [ "$d" != "$s" ] && git merge-base --is-ancestor "$d" "$s"; }` muss Exit-Code 0 haben.
- [x] Die drei Endpunkte antworten, wie der Client der Runtime es liest: Eine mit dem Format der Runtime signierte Nachricht wird
      angenommen (`id`), steht im `poll` des Empfängers mit `id`, `from`, `to`, `content`, `signedAt`, `createdAt`, `replyTo`, `nonce`
      und `next_cursor`, `count` liefert `unread` und fällt nach dem `poll` auf 0, und keiner der drei Pfade antwortet mehr wie ein
      Pfad ohne Handler.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/relay.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -c "vertrag.md" test/relay.test.ts` muss mindestens 1 ausgeben.
- [x] Keine fremde Signatur und kein Replay: Eine Nachricht, deren Signatur nicht zu `from` passt, eine mit `signed_at` älter als
      300000 ms und ein `poll` mit fremder Signatur werden abgelehnt; dieselbe Signatur zweimal ergibt dieselbe `id`, eine Nachricht und
      eine Abbuchung; zu große Nachrichten und die 101. Nachricht eines Absenders in einer Stunde werden abgelehnt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/relay-security.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/relay-security.test.ts` muss mindestens 6 ausgeben.
- [x] Konten ohne Wallet: Mit API-Key gehen Senden, Lesen und Zählen ohne Signatur, die Nachricht kommt mit dem Kennzeichen aus dem
      Vertrag am Anfang von `content` und `verified: false` an, eine signierte mit `verified: true` und ohne Kennzeichen; ohne Schlüssel
      und ohne Signatur bleibt es 401.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/relay-apikey.test.ts` muss Exit-Code 0 haben.
- [x] Der Erstkontakt kostet den Preis aus dem Vertrag als genau eine Ledger-Zeile `relay` in derselben Transaktion wie Saldo und
      Nachricht, eine Antwort im bestehenden Kontakt kostet nichts, ohne Guthaben gibt es 402 mit Klartext und keine Nachricht, und eine
      Wiederholung derselben Signatur bucht nicht zweimal.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/relay-billing.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -c "Preis Erstkontakt" test/relay-billing.test.ts` muss mindestens 1 ausgeben.
- [x] Der Harness zeigt zwei unveränderte Runtimes, die sich schreiben: `harness/e2e/relay-walk.mjs` mit dem Client und dem Werkzeug
      `send_message` der Runtime, die Bewertung `judgeRelayWalk` ist in beide Richtungen getestet (ein vollständiger Lauf ist ok, eine
      fehlende Antwort, eine angenommene fremde Signatur, eine fehlende oder doppelte Ledger-Zeile `relay`, ein blockiertes Kennzeichen
      und ein Status aus der Liste der Wiederholungen sind je fail), `full.sh` verlangt `relay=true`, und der Job `e2e` am Kopf des PR ist
      grün.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/relay-walk.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -c 'relay=\$relay' harness/e2e/full.sh` muss mindestens 2 ausgeben, und `grep -c '"\$relay" != "true"' harness/e2e/full.sh` muss mindestens 1 ausgeben.
      Prüfung (Netz): `gh pr checks goal/relay-01 -R matthiashippe/control-plane | awk '$1=="e2e"{print $2}'` muss `pass` ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.
- [ ] Keine Adresse eines Kunden in Tests, Fixtures oder Doku (`loop-constraints.md`, Grundregel 8); Wallets im Test entstehen per
      `generatePrivateKey`.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `ops/conway-series.sh`, `ops/conway-money-series.sh`, `harness/runtime/**`, `.env*`, `src/payments/**`, `src/auth/**`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-13 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6, 7 gebaut (Vertrag `docs/relay/vertrag.md` in eigenem Commit 68d133c vor `src/`, Relay unter `src/relay/` mit Signatur, Fenster, Replay über die gespeicherte Signatur, Grenzen, API-Key mit Kennzeichen und Erstkontakt 1000 mc als Ledger-Zeile `relay`, Gang `harness/e2e/relay-walk.mjs` mit `relay=true` in `full.sh`, Annahmen in `goals/relay/ANNAHMEN.md`, Vorschlag `goals/_vorschlaege/relay-nacharbeit-2026-11-13-1.md`); rot gesehen: `test/relay.test.ts` 6 von 6 und die drei übrigen Relay-Dateien zusammen 21 von 27 ohne `registerRelay`, `test/relay-security.test.ts` mit Signatur immer gültig (3), ohne Zeitfenster (2), ohne Lookup der Signatur (2 mit Billing), ohne Grenze 100 (1), ohne Gesamtgrenze (1); `test/relay-apikey.test.ts` ohne Kennzeichen (2), `verified` immer true (2), Key-Weg ohne Schlüsselprüfung (1); `test/relay-billing.test.ts` Erstkontakt frei (4), jede Nachricht kostet (1), Nachricht trotz 402 (1), Abbuchung außerhalb der Transaktion (1); `test/relay.test.ts` poll markiert nichts (1), ohne `nonce` (1); `test/relay-walk.test.ts` Urteil immer ok (14), ohne Ledger-Prüfung A (3), ohne `blocked` (1), ohne Wiederholungsstatus (5), fremde Signatur egal (1), ohne Antwort (1), `full.sh` ohne Bedingung `relay` (2 mit `test/e2e-sandbox-gate.test.ts`); `test/v1-ohne-variables-segment.test.ts` rot, bis die drei Pfade in `V1_ROUTES` standen. Lokal ohne Docker mit der Runtime aus dem Cache alle Schritte des Gangs grün außer dem Topup (503, ohne Chain). Prüfbefehle: P1 3, 1 und 1, 2, Exit 0 (d=68d133c vor s=053009e); P2 vitest Exit 0, `vertrag.md` 3; P3 vitest Exit 0, 9 Tests; P4 vitest Exit 0; P5 vitest Exit 0, `Preis Erstkontakt` 2; P6 vitest Exit 0, `relay=$relay` 2 und `"$relay" != "true"` 1, `e2e` pass an 9f9c9a2 (`E2E OK turns=5 registered=true api_errors=0 ledger_consistent=true balance_cents=490 domains=true sandbox=true long_exec=true relay=true`, Ledger des Relays `{"a_rows":1,"a_mc":[-1000],"b_rows":0,"key_rows":1,"consistent":true}`); P7 `check` Exit 0 (141 Testdateien, 1672 Tests).
- 2026-11-13 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, 7, `dev` 5e784c9 ohne neue Commits (Merge-Basis gleich `origin/dev`). Prüfbefehle: P1 3, 1 und 1, 2, Exit 0 (d=68d133c vor s=053009e); P2 vitest Exit 0 (6 Tests), `vertrag.md` 3; P3 vitest Exit 0 (9 Tests), 9; P4 vitest Exit 0 (6 Tests); P5 vitest Exit 0 (6 Tests), `Preis Erstkontakt` 2; P6 vitest Exit 0 (17 Tests), `relay=$relay` 2 und `"$relay" != "true"` 1, `e2e` pass an 0bd3152 (`E2E OK ... relay=true`, `RELAY_VERDICT ok`); P7 `check` Exit 0 (1672 Tests, 141 s; erster Lauf Exit 1 nur durch `test/abort-purchase.test.ts` bei Last 178, die Datei liegt nicht im Diff und ist allein grün, 6 von 6).

## Blockers
