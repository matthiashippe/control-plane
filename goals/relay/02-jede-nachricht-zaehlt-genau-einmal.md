# Relay Goal 02: Jede Nachricht zählt genau einmal und braucht ein Gegenüber

## Status
PLANNED

## Active Objective
Eine Nachricht auf dem Relay ist genau eine Nachricht und geht an jemand anderen: `src/relay/routes.ts` bringt jede Signatur vor
Lookup und Speichern in eine einzige Form (klein geschrieben, genau 65 Byte, `s` in der unteren Hälfte der Kurvenordnung, `v` als 27
oder 28, sonst 401), damit dieselbe Signatur in anderer Schreibweise keine zweite Nachricht wird, und eine Nachricht mit `to` gleich
Absender bekommt 400 mit Klartext, ohne Nachricht und ohne Abbuchung (`ROADMAP.md`, relay 02; übernimmt
`goals/_vorschlaege/relay-kritik-2026-11-13-1.md` und `goals/_vorschlaege/relay-kritik-2026-11-13-2.md`).
MVP: Funktion, weil das Relay danach jede Nachricht genau einmal zählt und berechnet und kein Absender ohne Gegenüber Speicher und
Zählung des Zahlungsservers füllt, bevor sandbox 07 die ersten Automatons auf uns stellt.

## Voraussetzungen
- relay Goal 01 DONE

## Kontext für den Maker
- Ziel: Ein Automaton, der dem Relay eine Nachricht schickt, sieht sie beim Empfänger genau einmal und zahlt sie genau einmal, und
  eine Nachricht ohne Gegenüber nimmt das Relay gar nicht erst an.
- Befund 1, belegt vom Writer am 13.11. mit viem aus `node_modules` dieses Repos: Für eine Signatur aus `signMessage` liefert
  `verifyMessage` auch `true` für dieselben Bytes in Großschreibung, für die gespiegelte Form (`s` ersetzt durch `n - s`, `v` von 27
  auf 28 oder umgekehrt) und für `v` als 0 oder 1 statt 27 oder 28; eine Signatur mit 64 Byte wirft und ist heute schon 401. Das
  Relay sucht die Wiederholung aber mit dem Text der Signatur (`src/relay/routes.ts:139`, `WHERE signature = ?`, Spalte
  `signature TEXT UNIQUE` in `src/db.ts:333`), also wird jede dieser Formen innerhalb des Fensters eine neue Nachricht und zählt neu
  gegen die Grenzen. Prüfe den Befund zuerst mit einem Test: Wird die großgeschriebene Form einer angenommenen Signatur heute schon
  abgelehnt, ist das Goal widerlegt; dann `## Status` auf `BLOCKED fachlich` mit diesem Beleg unter `## Ehrliche Lücken`.
- Form der Signatur: genau eine Funktion in `src/relay/` (etwa `canonicalSignature`) gibt für eine Signatur ihre einzige Form zurück
  oder `null`: `0x` und 130 Hex-Zeichen, klein geschrieben, `s` höchstens `n / 2` mit `n` gleich der Ordnung von secp256k1
  (`0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141`), `v` 0 oder 1 wird 27 oder 28. Eine Signatur mit anderer
  Länge, anderem `v` oder `s` in der oberen Hälfte ist `null` und bekommt 401 `invalid_signature`. Die gespiegelte Form wird nicht in
  die untere umgerechnet, sondern abgelehnt, weil `signMessage` von viem (und damit die Runtime am Pin) nur die untere erzeugt. Die
  Funktion läuft vor `signedBy`, vor dem Lookup und vor `acceptMessage`, und gespeichert wird nur die einzige Form. Dieselbe Funktion
  gilt für `X-Signature` in `poll` und `count`, damit auch der Schlüssel in `relay_polls` die einzige Form ist.
- Bestand: Zeilen, die relay 01 schon gespeichert hat, schreibt dieses Goal nicht um. Steht auf dem Server eine Signatur in anderer
  Form, ist ihr Fenster längst abgelaufen, eine Wiederholung bekommt 401 `signature_expired` wie heute. Das kommt als Annahme unter
  `## Goal 02` in `goals/relay/ANNAHMEN.md`.
- Befund 2: `isRecipient(to)` in `src/relay/routes.ts:119` vergleicht `to` nicht mit dem Absender, und `inContact` in
  `src/relay/store.ts` hält das Paar aus derselben Adresse für einen Kontakt; nach dem ersten bezahlten Erstkontakt an sich selbst
  ist jede weitere Nachricht frei. Eine Nachricht mit `to` gleich Absender (signiert: `from`; mit API-Key: die Adresse oder Kennung
  `key:…` des Kontos; beides klein geschrieben verglichen) bekommt 400 mit dem Code `recipient_is_sender` und einem englischen
  Klartext, der sagt, dass das Relay Nachrichten nur an eine andere Adresse zustellt. Die Prüfung steht vor dem Lookup der
  Wiederholung, vor dem Preis und vor dem Speichern: keine Nachricht, keine Ledger-Zeile `relay`. 400 liegt nicht in der Liste der
  Wiederholungen der Runtime (`src/conway/http-client.ts` am Pin), also schickt der Client sie nicht noch einmal. Die Runtime selbst
  schickt nie an sich (`send_message` und `message_child` nennen immer ein anderes Gegenüber), also trifft die Regel keinen echten
  Automaton.
- Tests zuerst: `test/relay-signature-form.test.ts` und `test/relay-self-message.test.ts` mit den Helfern aus `test/relay-world.ts`
  (`world`, `wallet`, `signedSend`, `pollHeaders`, `credit`), Wallets per `generatePrivateKey`. Beide Dateien kommen in einem Commit
  vor der ersten Änderung unter `src/` und sind dort rot; die Zeile im Progress Log nennt je Datei, wie viele Tests rot waren.
  `test/relay-signature-form.test.ts` zeigt mindestens: die großgeschriebene Form einer angenommenen Signatur ergibt dieselbe `id`,
  eine Nachricht beim Empfänger und eine Ledger-Zeile `relay`; die gespiegelte Form ergibt 401 und keine zweite Nachricht; `v` als 0
  oder 1 ergibt dieselbe `id` und keine zweite Nachricht; eine erstmals großgeschrieben gesendete Signatur steht klein in
  `relay_messages`; ein `poll` mit der großgeschriebenen Form einer schon gelieferten `X-Signature` bekommt dieselben Nachrichten
  wie der erste. `test/relay-self-message.test.ts` zeigt 400 `recipient_is_sender` für eine signierte Nachricht an `from` (auch mit
  `to` in anderer Schreibweise als `from`) und für eine mit API-Key an das eigene Konto, je ohne Zeile in `relay_messages` und ohne
  Ledger-Zeile `relay`, und dass eine Nachricht an eine andere Adresse unverändert angenommen wird.
- Die Testdateien aus relay 01 (`test/relay*.test.ts`, `test/relay-world.ts`) bleiben unverändert und grün; was dort rot würde, zeigt
  einen Fehler im Fix, keinen im Test.
- Doku: `docs/relay/vertrag.md` bekommt unter `## Signatur` die Zeile `Form der Signatur: <die Regel in einem Satz>` und nennt
  `recipient_is_sender` mit Status 400 dort, wo der Vertrag die Antworten von `POST /v1/messages` aufzählt; `docs/errors.md` nennt
  `recipient_is_sender` wie die anderen Codes des Relays.
- Was danach schneller zu mehr zahlenden Automatons führt: Ein Relay, das jede Nachricht genau einmal zählt und berechnet, ist die
  Grundlage dafür, dass sandbox 07 `socialRelayUrl` der Automatons bei uns auf uns stellt und ein Automaton anderen seinen Dienst per
  Nachricht anbietet, ohne dass Spam ohne Gegenüber den einen Kern des Zahlungsservers belegt.
- Der Laufzeitpfad ändert sich, der Merge rollt über `deploy.yml` aus; den Rollout machst du nicht. Prüfbefehle ohne Netz binden
  keinen festen Port, Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, neue
  Dateien vor dem lokalen `check` stagen. Der Harness ändert sich nicht.

## Done Condition
- [ ] Der Befund steht als roter Test, bevor `src/` sich ändert: `test/relay-signature-form.test.ts` und
      `test/relay-self-message.test.ts` kommen in einem Commit vor dem ersten Commit unter `src/`.
      Prüfung: `b=$(git merge-base origin/dev HEAD); t=$(git log --format=%H --diff-filter=A -1 -- test/relay-signature-form.test.ts); u=$(git log --format=%H --diff-filter=A -1 -- test/relay-self-message.test.ts); s=$(git log --format=%H --reverse "$b"..HEAD -- src | head -1); [ -n "$t" ] && [ "$t" = "$u" ] && [ -n "$s" ] && [ "$t" != "$s" ] && git merge-base --is-ancestor "$t" "$s"` muss Exit-Code 0 haben.
- [ ] Jede Signatur hat genau eine Form: Die großgeschriebene Form und `v` als 0 oder 1 einer angenommenen Signatur ergeben dieselbe
      `id`, eine Nachricht und eine Ledger-Zeile `relay`, die gespiegelte Form mit `s` in der oberen Hälfte und eine Signatur ohne 65
      Byte ergeben 401, gespeichert wird nur die klein geschriebene Form, und ein `poll` mit der großgeschriebenen Form einer
      gelieferten `X-Signature` bekommt dieselbe Antwort wie der erste.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/relay-signature-form.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/relay-signature-form.test.ts` muss mindestens 5 ausgeben.
- [ ] Keine Nachricht an sich selbst: `to` gleich Absender ergibt 400 `recipient_is_sender` mit Klartext, signiert wie mit API-Key,
      ohne Nachricht und ohne Ledger-Zeile `relay`; eine Nachricht an eine andere Adresse geht wie bisher.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/relay-self-message.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -c "recipient_is_sender" test/relay-self-message.test.ts src/relay/routes.ts | grep -c ':[1-9]'` muss 2 ausgeben.
- [ ] Die Tests aus relay 01 bleiben unverändert und grün.
      Prüfung: `git diff --name-only "$(git merge-base origin/dev HEAD)" HEAD -- test/relay.test.ts test/relay-security.test.ts test/relay-apikey.test.ts test/relay-billing.test.ts test/relay-poll-retry.test.ts test/relay-storage.test.ts test/relay-walk.test.ts test/relay-world.ts | wc -l` muss 0 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/relay.test.ts test/relay-security.test.ts test/relay-apikey.test.ts test/relay-billing.test.ts test/relay-poll-retry.test.ts test/relay-storage.test.ts` muss Exit-Code 0 haben.
- [ ] Vertrag und Fehlerliste nennen beides: die Form der Signatur und `recipient_is_sender`.
      Prüfung: `awk '/^## Signatur/{f=1;next} /^## /{f=0} f' docs/relay/vertrag.md | grep -c '^Form der Signatur: .'` muss 1 ausgeben.
      Prüfung: `grep -l "recipient_is_sender" docs/relay/vertrag.md docs/errors.md | wc -l` muss 2 ausgeben.
- [ ] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.
- [ ] Keine Adresse eines Kunden in Tests, Fixtures oder Doku (`loop-constraints.md`, Grundregel 8); Wallets im Test entstehen per
      `generatePrivateKey`.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `ops/conway-series.sh`, `ops/conway-money-series.sh`, `harness/**`, `.env*`, `src/payments/**`, `src/auth/**`
- die Testdateien aus relay 01: `test/relay.test.ts`, `test/relay-security.test.ts`, `test/relay-apikey.test.ts`,
  `test/relay-billing.test.ts`, `test/relay-poll-retry.test.ts`, `test/relay-storage.test.ts`, `test/relay-walk.test.ts`,
  `test/relay-world.ts`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 3

## Progress Log

## Blockers
