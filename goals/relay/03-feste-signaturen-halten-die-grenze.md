# Relay Goal 03: Feste Signaturen halten die Grenze

## Status
PLANNED

## Active Objective
Die einzige Form einer Signatur aus relay 02 bleibt fest, auch wenn jemand die Grenze verschiebt: `test/relay-signature.test.ts`
prüft `canonicalSignature` (`src/relay/signature.ts`) mit einer Tabelle fester Signaturen statt zufälliger Wallets (`s` gleich
`n / 2` angenommen, `n / 2 + 1` abgelehnt, `s` gleich 0 abgelehnt, Präfix `0X` und 132 Hex-Zeichen abgelehnt, `v` als 27, 28, 0
und 1 mit derselben einen Form für 0 und 27 sowie für 1 und 28) und einen `poll` mit `X-Signature` und `v` als 0 oder 1, der
dieselbe Antwort bekommt wie der erste `poll`. Jeder Fall ist rot gegen eine Mutation der Grenze. Nur Tests, kein Rollout
(`ROADMAP.md`, relay 03; übernimmt `goals/_vorschlaege/relay-kritik-2026-11-14-1.md`).
MVP: Funktion, weil das Relay jede Nachricht genau einmal zählt und berechnet und ein vertauschtes `>` gegen `>=` sonst unbemerkt
eine zweite Schreibweise derselben Signatur als neue, neu berechnete Nachricht durchließe.

## Voraussetzungen
- relay Goal 02 DONE

## Kontext für den Maker
- Ziel: Wer `src/relay/signature.ts` ändert, sieht einen roten Test, sobald die Grenze der einzigen Form wandert, damit ein Automaton
  auf dem Relay jede Nachricht weiter genau einmal sieht und genau einmal zahlt.
- Befund (Kritik Tech Lead 14.11., `goals/_vorschlaege/relay-kritik-2026-11-14-1.md`): Die Tests aus relay 02 laufen über Wallets aus
  `generatePrivateKey`, prüfen je Lauf nur einen Wert von `v` und treffen die Grenze `s` gleich `n / 2` praktisch nie. Belegt vom
  Writer am 14.11. am Kopf `54cf8c9` von `dev`: Mit `s >= HALF_N` statt `s > HALF_N` in `src/relay/signature.ts:21` bleiben
  `test/relay-signature-form.test.ts` und `test/relay-self-message.test.ts` grün (Prüfbefehl von Punkt 1). Ist der Befehl bei dir
  rot, ist das Goal widerlegt: `## Status` auf `BLOCKED fachlich`, Beleg unter `## Ehrliche Lücken`.
- Ebenfalls am 14.11. per `node --import tsx` am selben Kopf gerechnet: Der heutige Code besteht jeden Fall der Tabelle (`s` gleich
  `HALF_N` ergibt eine Form, `HALF_N + 1`, 0, `0X` und 132 Hex-Zeichen ergeben `null`, `v` `00` wird `1b`, `01` wird `1c`, `02` und
  `1d` ergeben `null`, Großschreibung wird klein). Das Goal ändert deshalb nichts unter `src/`. Zeigt ein Fall trotzdem einen Fehler
  im Dienst, baut dieses Goal keinen Fix: `## Status` auf `BLOCKED fachlich`, unter `## Ehrliche Lücken` der Fall mit Befehl und
  Ausgabe, weil ein Fix einen Rollout braucht und dafür ein eigenes Goal.
- Tabelle: Die Fälle für `canonicalSignature` brauchen keine echte Signatur, weil die Funktion nur die Form prüft, nicht den
  Unterzeichner. Eine Signatur ist `0x`, `r` (64 Hex-Zeichen, etwa `"11".repeat(32)`), `s` (64 Hex-Zeichen, links mit 0 aufgefüllt)
  und `v` (2 Hex-Zeichen). `n` ist die Ordnung von secp256k1
  (`0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141`), `n / 2` ganzzahlig wie `HALF_N` im Dienst. Erwartet wird je
  Fall der genaue Rückgabewert (die klein geschriebene Form mit `v` `1b` oder `1c`, oder `null`), nicht nur „nicht null“. `it.each`
  oder je Fall ein `it` sind gleich gut; Punkt 2 zählt die bestandenen Tests über den JSON-Reporter von vitest.
- `poll`: mit den Helfern aus `test/relay-world.ts` (`world`, `wallet`, `credit`, `signedSend`, `send`, `poll`, `pollHeaders`). Eine
  Nachricht an `b`, dann ein `poll` von `b`, der sie liefert, dann derselbe `poll` mit `X-Signature`, deren `v` von 27 oder 28 auf 0
  oder 1 gesetzt ist: dieselben Nachrichten (gleiche `id`) und derselbe `next_cursor` wie der erste. Ein dritter `poll` mit neuer
  Signatur liefert nichts mehr, weil der erste die Nachricht als gelesen markiert hat; so zeigt der Test, dass die Wiederholung die
  gemerkte Antwort ist und kein neuer `poll`.
- Mutationen, gegen die die neue Datei rot sein muss (Punkt 3): `s >= HALF_N` statt `s > HALF_N`, kein Abweis von `s` gleich 0, `/i`
  am Muster `SHAPE` (dann käme `0X` durch) in `src/relay/signature.ts`, und in `src/relay/routes.ts` der rohe Header statt der einzigen
  Form als Schlüssel des gemerkten `poll` (`signature: sig` statt `signature: one`). Die Mutationen laufen in einer Kopie aus
  `git archive HEAD`, nie im Worktree; die Zeile im Progress Log nennt je Mutation, wie viele Tests der neuen Datei rot waren.
- Die Testdateien aus relay 01 und 02 bleiben unverändert und grün.
- Was danach schneller zu mehr zahlenden Automatons führt: Sobald sandbox 07 `socialRelayUrl` der Automatons auf uns stellt, zählt und
  berechnet das Relay echte Nachrichten; ein fester Test hält die Abrechnung jeder Nachricht dann ohne Rollout fest.
- Kein Rollout: Das Goal ändert nur `test/relay-signature.test.ts` und Dateien unter `goals/relay/`. Prüfbefehle ohne Netz binden
  keinen festen Port, Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, die neue
  Datei vor dem lokalen `check` stagen. Der Harness ändert sich nicht.

## Done Condition
- [ ] Der Befund hält: Mit `s >= HALF_N` bleiben die Tests aus relay 02 grün.
      Prüfung: `T=$(mktemp -d); git archive "$(git merge-base origin/dev HEAD)" | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i 's/s > HALF_N/s >= HALF_N/' $T/src/relay/signature.ts; grep -q 's >= HALF_N' $T/src/relay/signature.ts || echo sed-miss; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/relay-signature-form.test.ts test/relay-self-message.test.ts >/dev/null 2>&1) && echo gruen || echo rot` muss genau `gruen` ausgeben.
- [ ] Die Tabelle fester Signaturen und der `poll` mit `v` als 0 oder 1 sind grün: `s` gleich `n / 2` angenommen, `n / 2 + 1`, `s`
      gleich 0, Präfix `0X` und 132 Hex-Zeichen abgelehnt, `v` 27, 28, 0 und 1 mit derselben Form für 0 und 27 sowie 1 und 28, und
      die Wiederholung des `poll` bekommt dieselbe Antwort wie der erste.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/relay-signature.test.ts` muss Exit-Code 0 haben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/relay-signature.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.numFailedTests===0&&j.numPassedTests>=10?"ok":"zu wenig "+j.numPassedTests)})'` muss genau `ok` ausgeben.
      Prüfung: `grep -c "canonicalSignature" test/relay-signature.test.ts` muss mindestens 1 ausgeben.
- [ ] Jeder Fall hält gegen eine Mutation der Grenze: Die neue Datei ist rot gegen `s >= HALF_N`, gegen den fehlenden Abweis von `s`
      gleich 0, gegen `/i` am Muster und gegen den rohen Header als Schlüssel des gemerkten `poll`.
      Prüfung: `for m in 's/s > HALF_N/s >= HALF_N/' 's/s === 0n || //' 's|{130}\$/;|{130}$/i;|'; do T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; cp $T/src/relay/signature.ts $T/orig.ts; sed -i "$m" $T/src/relay/signature.ts; cmp -s $T/orig.ts $T/src/relay/signature.ts && echo "sed-miss $m"; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/relay-signature.test.ts >/dev/null 2>&1) && echo "gruen bei $m"; done; T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; grep -q 'return { address, signature: one };' $T/src/relay/routes.ts || echo "sed-miss routes"; sed -i 's/return { address, signature: one };/return { address, signature: sig };/' $T/src/relay/routes.ts; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/relay-signature.test.ts >/dev/null 2>&1) && echo "gruen bei routes"` darf nichts ausgeben.
- [ ] Nur Tests: Der Branch ändert außer `test/relay-signature.test.ts` nur Dateien unter `goals/relay/`, also nichts unter `src/`,
      keine Testdatei aus relay 01 oder 02 und nichts, was ausrollt.
      Prüfung: `git diff --name-only "$(git merge-base origin/dev HEAD)" HEAD | grep -v -e '^test/relay-signature\.test\.ts$' -e '^goals/relay/' | wc -l` muss 0 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/relay.test.ts test/relay-security.test.ts test/relay-apikey.test.ts test/relay-billing.test.ts test/relay-poll-retry.test.ts test/relay-storage.test.ts test/relay-signature-form.test.ts test/relay-self-message.test.ts` muss Exit-Code 0 haben.
- [ ] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder Fall der neuen Datei war gegen mindestens eine Mutation rot; die Zeile im Progress Log nennt je Mutation die Zahl.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.
- [ ] Keine Adresse eines Kunden in Tests oder Fixtures (`loop-constraints.md`, Grundregel 8); Wallets im `poll`-Test entstehen per
      `generatePrivateKey`, die festen Signaturen der Tabelle sind erfundene Werte.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `ops/**`, `harness/**`, `.env*`, `src/**`
- die Testdateien aus relay 01 und 02: `test/relay.test.ts`, `test/relay-security.test.ts`, `test/relay-apikey.test.ts`,
  `test/relay-billing.test.ts`, `test/relay-poll-retry.test.ts`, `test/relay-storage.test.ts`, `test/relay-walk.test.ts`,
  `test/relay-world.ts`, `test/relay-signature-form.test.ts`, `test/relay-self-message.test.ts`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 2
- max Versuche pro Gap: 3

## Progress Log

## Blockers
