# Hosting Goal 04: Eine Gutschrift für die eigene Live-Prüfung statt zwei

## Status
ACTIVE

## Active Objective
Die beiden internen Gutschriften der eigenen Live-Prüfung buchen über eine gemeinsame Funktion: `grantInternal` in
`src/credits/internal-grant.ts` nimmt Ref, Betrag und Grund als Argument, prüft vor der Buchung, ob eine Zeile `internal_grant` mit
dieser Ref schon steht, und gibt den einen Typ `GrantOutcome` zurück. `grantLiveSandbox` in `src/sandbox/grant.ts` und
`grantLiveAutomaton` in `src/automaton/grant.ts` rufen sie mit ihrer Konstante auf und enthalten keine eigene Buchung mehr;
`git grep -n 'export type GrantOutcome' -- src` findet eine Stelle. `test/automaton-grant.test.ts` und `test/sandbox-billing.test.ts`
bleiben unverändert grün, und ein neuer Test ruft die gemeinsame Funktion zweimal mit derselben Ref und verlangt genau eine Ledger-Zeile
`internal_grant`, rot gegen eine Kopie ohne die Prüfung auf eine vorhandene Ref. Rollout mit dem nächsten fälligen Deploy (`src/**`)
(`ROADMAP.md`, hosting 04; übernimmt `goals/_vorschlaege/sandbox-nacharbeit-2026-11-17-3.md`).
MVP: Funktion, weil eine Gutschrift eine Ledger-Zeile mit Geldwert ist und eine Korrektur an ihrer Idempotenz heute nur in einer der
beiden Kopien landet; die andere bucht dann im schlimmsten Fall bei einem Rollout ein zweites Mal.

## Voraussetzungen
- sandbox Goal 08 DONE

## Kontext für den Maker
- Ziel in einem Satz: Eine Korrektur an der Idempotenz einer internen Gutschrift wirkt auf beide Live-Prüfungen, und das Ledger bekommt
  nie eine doppelte interne Zeile. Was dem nicht dient, gehört nicht in dieses Goal.
- Stand heute (`dev` am 21.11.2026, `e506bf8`): `grantLiveAutomaton` (sandbox 08) ist eine Kopie von `grantLiveSandbox` (sandbox 03).
  Beide definieren `export type GrantOutcome` identisch, beide fragen in einer Transaktion
  `SELECT 1 FROM ledger WHERE kind = 'internal_grant' AND ref = ?`, dann das Konto in `wallets`, dann `postLedger` mit Art
  `internal_grant`. Sie unterscheiden sich nur in Ref, Betrag und dem Text `meta.reason` (Messung Tech Lead per `diff` der beiden
  Dateien nach Ersetzen der Namen). `test/automaton-grant.test.ts` und `test/sandbox-billing.test.ts` sind grün (17 Fälle, 6 s,
  Node 22 auf dem code-host). `src/index.ts` ruft beide beim Start auf, je in eigenem `try` mit eigener Log-Zeile. Der eindeutige Index
  `ledger_internal_grant_once` in `src/db.ts` verhindert eine zweite Zeile ohnehin, aber erst mit einem Fehler beim Start statt mit
  `already_granted`.
- Entscheidungen des Tech Lead (der Maker schreibt sie mit Grund unter `## Goal 04` in `goals/hosting/ANNAHMEN.md`):
  1. **Ort und Form.** `src/credits/internal-grant.ts` neben `src/credits/aborted.ts`, der anderen Buchung beim Start, weil beide
     Live-Prüfungen sie nutzen und weder `src/sandbox/` von `src/automaton/` abhängen soll noch umgekehrt. Die Datei exportiert
     `type GrantOutcome = { granted: true } | { granted: false; reason: "already_granted" | "no_account" }` und
     `grantInternal(db: Db, grant: { ref: string; mc: number; reason: string }, address: string): GrantOutcome`. Die Art
     `internal_grant` steht fest in der Funktion und ist nie ein Argument, weil eine Gutschrift mit Art `grant` aus dem Startertopf
     ginge. Die Adresse hat dort keinen Standardwert; den behalten die beiden Aufrufer (`LIVE_SANDBOX_ADDRESS`).
  2. **Die Prüfung auf die Ref steht wörtlich so da.** Die Funktion fragt mit genau
     `SELECT 1 FROM ledger WHERE kind = 'internal_grant' AND ref = ?` und dem Argument `ref`, wie heute, in derselben Transaktion vor der
     Abfrage des Kontos. Die Gegenprobe in Punkt 2 bricht genau diesen Text; trifft ihr `sed` nichts, bleibt der Test grün und die
     Gegenprobe zeigt 0, also schützt sie sich selbst.
  3. **Die Aufrufer bleiben, wie die Welt sie kennt.** `grantLiveSandbox` und `grantLiveAutomaton` behalten Name, Signatur und
     Rückgabe, `LIVE_SANDBOX_GRANT`, `LIVE_AUTOMATON_GRANT`, `liveAutomatonGrantMc` und die beiden Texte für `meta.reason` bleiben
     Byte für Byte. Grund: In der Produktion entscheidet allein die Ref, ob der Start bucht; eine geänderte Ref oder ein geänderter
     Betrag würde beim Rollout eine zweite Gutschrift buchen. `src/index.ts` und die beiden bestehenden Tests ändern sich nicht. Kein
     Re-Export von `GrantOutcome` aus den beiden alten Dateien; wer den Typ braucht, importiert ihn aus `src/credits/internal-grant.ts`.
  4. **Der neue Test** `test/internal-grant.test.ts` (Datenbank `openDb(":memory:")`, Konto per `INSERT INTO wallets` wie in
     `test/automaton-grant.test.ts`) prüft mit einer eigenen Test-Ref, nie mit `grant:live-sandbox` oder `grant:live-automaton`:
     ohne Konto `no_account` und keine Zeile; mit Konto erst `{ granted: true }`, dann mit derselben Ref `already_granted` und genau
     eine Zeile `internal_grant` mit dieser Ref, Betrag und Grund in `meta`; eine zweite Ref bucht ihre eigene Zeile.
  5. **`creditAbortedCharges` bleibt außen vor.** Sie bucht Art `refund` mit eigenen Prüfungen (Summe, Adresse aus den Abbuchungen)
     und ist keine Gutschrift der Live-Prüfung.
- Prüfbefehle ohne Netz binden keinen festen Port, Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund
  mit eigenem Timeout, neue Dateien vor dem lokalen `check` stagen. Progress Log und Verdicts zitieren keine Suchausdrücke der
  Prüfbefehle wörtlich.
- Kein Lauf gegen die Produktion oder den Sandbox-Server, keine Buchung von Hand. Rollout mit dem nächsten fälligen Deploy: Weil Ref
  und Betrag gleich bleiben, bucht der Start nach dem Rollout keine neue Zeile, wo eine der beiden Gutschriften schon steht.
- Ablauf: zuerst `src/credits/internal-grant.ts` mit dem neuen Test und der Gegenprobe (Punkt 1 und 2), dann die beiden Aufrufer
  (Punkt 3), dann Umfang (Punkt 4), dann `check` lokal und die Jobs am PR (Punkt 5), zuletzt die Annahmen (Punkt 6). Nach jedem grünen
  Punkt Commit und Push.
- Widerlegt, wenn sich die beiden Funktionen am Kopf von `dev` in mehr als Ref, Betrag und Grund unterscheiden; dann endet das Goal mit
  dieser Messung in den Annahmen.
- Was danach schneller zu mehr zahlenden Automatons führt: hosting 05 meldet einen Ausfall des Sandbox-Servers, bevor der erste fremde
  Automaton ihn mit 501 trifft.

## Done Condition
- [x] `src/credits/internal-grant.ts` exportiert `GrantOutcome` und `grantInternal` mit Ref, Betrag und Grund als Argument und der
      Prüfung auf eine vorhandene Ref; `test/internal-grant.test.ts` verlangt beim zweiten Aufruf mit derselben Ref `already_granted`
      und genau eine Zeile `internal_grant`.
      MVP: Funktion, weil die doppelte Buchung einer Gutschrift Geld auf ein Konto legt, das niemand bezahlt hat.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/internal-grant.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -c "export function grantInternal(" src/credits/internal-grant.ts` muss 1 ausgeben.
      Prüfung: `grep -cF "SELECT 1 FROM ledger WHERE kind = 'internal_grant' AND ref = ?" src/credits/internal-grant.ts` muss 1 ausgeben.
      Prüfung: `for w in grantInternal already_granted no_account internal_grant; do grep -qF -- "$w" test/internal-grant.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `grep -cE "grant:live-(sandbox|automaton)" test/internal-grant.test.ts` muss 0 ausgeben.
- [x] Der neue Test ist rot gegen eine Kopie, in der die Prüfung auf eine vorhandene Ref nie trifft.
      MVP: Funktion, weil ein Test, der ohne die Prüfung grün bleibt, die Idempotenz nicht schützt, die dieses Goal an eine Stelle legt.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i "s/WHERE kind = 'internal_grant' AND ref = ?/WHERE 0 AND ref = ?/" $T/src/credits/internal-grant.ts; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/internal-grant.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"; rm -rf $T` muss mindestens 1 ausgeben.
- [x] `grantLiveSandbox` und `grantLiveAutomaton` rufen `grantInternal` mit ihrer unveränderten Konstante auf und buchen nicht mehr
      selbst; es gibt einen Typ `GrantOutcome` und eine Abfrage auf vorhandene interne Gutschriften in `src/`, und die beiden
      bestehenden Tests sind unverändert grün.
      MVP: Funktion, weil die Produktion an Ref und Betrag erkennt, dass sie schon gebucht hat, und eine Kopie, die bleibt, die nächste
      Korrektur wieder nur halb ankommen lässt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/automaton-grant.test.ts test/sandbox-billing.test.ts` muss Exit-Code 0 haben.
      Prüfung: `git grep -n 'export type GrantOutcome' -- src | wc -l` muss 1 ausgeben.
      Prüfung: `git grep -n "FROM ledger WHERE kind = 'internal_grant'" -- src | wc -l` muss 1 ausgeben.
      Prüfung: `cat src/sandbox/grant.ts src/automaton/grant.ts | grep -c "grantInternal("` muss mindestens 2 ausgeben.
      Prüfung: `cat src/sandbox/grant.ts src/automaton/grant.ts | grep -c "postLedger"` muss 0 ausgeben.
      Prüfung: `grep -cF 'export const LIVE_SANDBOX_GRANT = { ref: "grant:live-sandbox", mc: 100_000 } as const;' src/sandbox/grant.ts` muss 1 ausgeben.
      Prüfung: `grep -cF 'export const LIVE_AUTOMATON_GRANT = { ref: "grant:live-automaton", mc: liveAutomatonGrantMc(LIVE_AUTOMATON_RUN_MC) } as const;' src/automaton/grant.ts` muss 1 ausgeben.
      Prüfung: `cat src/sandbox/grant.ts src/automaton/grant.ts | grep -cE '"live-(sandbox: credit of the own live check of the sandbox API|automaton: credit of the own live check of the automaton routes)"'` muss 2 ausgeben.
- [x] Das Goal ändert nur die neue Funktion, ihren Test, die beiden Aufrufer und `goals/hosting/`, weder `src/index.ts` noch die beiden
      bestehenden Tests, Zahlung, Anmeldung, Sandbox-Server, Runtime, Deploy oder CI, und bringt keinen Schlüssel ins Repo.
      MVP: Funktion, weil das Repo öffentlich ist (Grundregel 8) und jede weitere Datei auf dem Laufzeitpfad den Rollout ohne Nutzen
      für den Kunden größer macht (Grundregel 5).
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vcE '^(src/credits/internal-grant\.ts|src/sandbox/grant\.ts|src/automaton/grant\.ts|test/internal-grant\.test\.ts|goals/hosting/)'` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- src/index.ts test/automaton-grant.test.ts test/sandbox-billing.test.ts | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -cE "\.(key|pem|crt|env)$"` muss 0 ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- . ':(exclude)goals/' | grep -cE '^\+.*(cnwy_k_[0-9a-f]{32}|-{5}BEGIN [A-Z ]*PRIVATE KEY-{5})'` muss 0 ausgeben.
- [x] `check` ist lokal grün, und die Jobs `check` und `e2e` des Goal-PR sind auf dem GitHub-Rechner grün.
      MVP: Funktion, weil beide Gutschriften beim Start des Dienstes laufen und erst der Gang mit der unveränderten Runtime zeigt, dass
      der Dienst danach weiter startet (Grundregel 13).
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/hosting-04 --state all --json number -q '.[0].number'); gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,state -q '.[] | select(.name=="check") | .state'` muss `SUCCESS` ausgeben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/hosting-04 --state all --json number -q '.[0].number'); gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,state -q '.[] | select(.name=="e2e") | .state'` muss `SUCCESS` ausgeben.
- [x] Die Entscheidungen stehen mit Grund unter `## Goal 04` in `goals/hosting/ANNAHMEN.md`, samt der Gegenprobe und ihrem Ergebnis.
      MVP: Funktion, weil die nächste interne Gutschrift wissen muss, dass sie `grantInternal` ruft und warum Ref und Betrag der
      bestehenden nie wechseln.
      Prüfung: `awk '/^## Goal 04/{f=1} f' goals/hosting/ANNAHMEN.md | grep -ciE "grantInternal|src/credits|Gegenprobe|Ref|index\.ts|refund"` muss mindestens 4 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die Gegenprobe war rot, wie sie soll; die Zeile im Progress Log nennt, womit.
- [ ] Ref, Betrag und Grund beider bestehenden Gutschriften bleiben Byte für Byte, wie sie am Kopf von `dev` sind.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Annahmen Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/runtime/**`, `ops/sandbox/**`, `src/payments/**`, `src/auth/**`, `src/index.ts`, `src/db.ts`, `ops/conway-series.sh`,
  `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`, `*.crt`
- der Zahlungsserver `76.13.144.207` und der Sandbox-Server `srv1327036`: kein Zugriff in diesem Goal, kein Rollout, kein Neustart
- Kauf, Aufladung, Wallet-Bewegung, Topup, Überweisung, Gutschrift von Hand oder per SQL (`loop-constraints.md`, Grundregeln 6, 9 und
  10); der Code bucht nur, was er heute schon bucht, mit derselben Ref und demselben Betrag
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-21 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6 gebaut, `grantInternal` in `src/credits/internal-grant.ts` mit neuem Test, beide Aufrufer buchen darüber, Entscheidungen in den Annahmen. Prüfbefehle: Punkt 1 vitest Exit 0 (3 Fälle), Zähler 1, 1, Schleife leer, 0; Punkt 2 Gegenprobe 1 (rot mit UNIQUE constraint failed am zweiten Aufruf, weil die Abfrage der Ref nie trifft); Punkt 3 vitest Exit 0 (17 Fälle), Zähler 1, 1, 2, 0, 1, 1, 2; Punkt 4 Zähler 0, 0, 0, 0; Punkt 5 check lokal Exit 0 (2510 Tests), PR #338 check SUCCESS, e2e SUCCESS; Punkt 6 Zähler 16.

## Blockers
Keine.
