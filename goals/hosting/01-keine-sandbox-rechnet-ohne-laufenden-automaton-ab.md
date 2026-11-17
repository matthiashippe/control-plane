# Hosting Goal 01: Keine Sandbox rechnet ohne laufenden Automaton ab

## Status
ACTIVE

## Active Objective
Ein Sweep im Control Plane räumt jede Sandbox eines gehosteten Automatons ab, der nicht läuft: Er löscht die Sandbox jeder Zeile
`failed` in `hosted_automatons`, deren Sandbox noch besteht, und setzt eine Zeile `active`, die nach `START_TIMEOUT_MS` plus fünf
Minuten weder einen abgeschlossenen Start noch einen Turn hat, auf `failed` mit `reason` `start_interrupted`, widerruft ihren
Schlüssel und löscht ihre Sandbox. Er läuft im Takt der Sandbox-Abrechnung in `src/index.ts`. Der Fehlerpfad von `create` prüft das
Ergebnis von `sandboxes.remove` und sagt dem Kunden nichts Falsches. Dazu nennt `TRANSFER_501` in `src/app.ts` und der Abschnitt
`## credit_transfers` in `docs/errors.md` für einen gehosteten Automaton das Guthaben seines Kontos statt seiner Wallet
(`ROADMAP.md`, hosting 01; übernimmt `goals/_vorschlaege/sandbox-kritik-2026-11-16-1.md`).
MVP: Funktion, weil heute eine Sandbox mit `keep_running` ohne Halt weiter Credits abbucht, wenn `sandboxd` beim Aufräumen eines
gescheiterten Starts nicht erreichbar war oder ein Rollout zwischen Anlage und Start kam, und weil ein Text Kunden auffordert, USDC an
eine Wallet zu schicken, deren Schlüssel auf unserem Sandbox-Server liegt.

## Voraussetzungen
- sandbox Goal 08 DONE

## Kontext für den Maker
- Ziel in einem Satz: Ein Kunde, der bei uns einen Automaton startet, zahlt nur, solange dieser Automaton läuft, und kein Text bringt
  ihn dazu, Geld an eine Wallet zu schicken, die wir halten. Was dem nicht dient, gehört nicht in dieses Goal.
- Maßgeblich sind `docs/sandbox/automaton.md`, `goals/sandbox/ANNAHMEN.md` unter `## Goal 08` und der Vorschlag
  `goals/_vorschlaege/sandbox-kritik-2026-11-16-1.md`. Was dieses Goal entscheidet oder misst, steht mit Grund unter `## Goal 01` in
  einer neuen Datei `goals/hosting/ANNAHMEN.md`, nie nur im Code.
- Stand heute (`dev` am 17.11.2026, `94b0680`): `createAs` in `src/automaton/service.ts` legt die Sandbox mit `keepRunning` an,
  schreibt die Zeile `active`, lädt die Setup-Datei hoch (bis 120 s) und startet `automaton-start` (bis `START_TIMEOUT_MS` 90 s plus
  30 s am Client). Scheitert der Start, ruft es `await sandboxes.remove(addr, sandboxId)` ohne das Ergebnis zu prüfen, setzt die Zeile
  auf `failed` und antwortet 501 mit „so the sandbox was deleted again“, auch wenn `remove` mit `sandbox_server_unreachable`
  zurückkam. `remove` in `src/sandbox/service.ts` schließt die Abrechnung (`closeRun`) nur, wenn `sandboxd` 200 oder 404 antwortet;
  sonst rechnet `tick` die Sandbox weiter ab, und `sandboxd` hält sie mit `keep_running` nie an. Kommt ein Neustart des Dienstes nach
  der Zeile `active` und vor dem Ende von `createAs`, bleibt eine Zeile `active` ohne gestarteten Automaton, die `view` für immer als
  `starting` zeigt. `TRANSFER_501.message` und `docs/errors.md` (`## credit_transfers`) sagen jedem: „send USDC to that automaton's
  own wallet“; ein gehosteter Automaton hat aber laut `src/automaton/setup.ts` eine Wallet, die nie Geld hält, und deren Schlüssel
  liegt in seiner Sandbox auf dem Sandbox-Server.
- Entscheidungen des Tech Lead (der Maker schreibt sie mit Grund unter `## Goal 01` in `goals/hosting/ANNAHMEN.md`):
  1. **Wo der Sweep wohnt.** Eine neue Datei `src/automaton/sweep.ts` mit
     `export async function sweepAutomatons(opts: SweepOptions): Promise<{ removed: number; interrupted: number }>`; `SweepOptions`
     trägt `db`, `sandboxes`, `now`, `log` und `inFlight: ReadonlySet<string>` (die ids, deren `createAs` in diesem Prozess gerade
     läuft). `createAutomatonService` führt diese Menge (hinein vor dem INSERT der Zeile, heraus im `finally` von `createAs`) und gibt
     `sweep: () => sweepAutomatons({ … })` zurück. `export const SWEEP_GRACE_MS = 5 * 60_000;` in `src/automaton/sweep.ts`. Grund für
     die Frist: Upload (120 s) und Start (120 s) brauchen zusammen höchstens 240 s, `START_TIMEOUT_MS` plus fünf Minuten sind 390 s.
  2. **Ein Start ist abgeschlossen.** Eine neue Spalte `started_at TEXT` in `hosted_automatons` (Migration in `src/db.ts` mit
     `ALTER TABLE … ADD COLUMN` wie die anderen), gesetzt von `createAs` direkt nach `AUTOMATON_START ok`. Eine Zeile `active` ohne
     `started_at` stammt entweder von vor der Migration oder aus einem unterbrochenen Start; der Sweep fragt deshalb nur ihre laufende
     Sandbox mit einem Befehl `PROBE_COMMAND` (exportiert aus `src/automaton/sweep.ts`), ob die Marke `/root/.automaton/autostart`
     besteht und wie viele Turns das Log hat. Marke oder Turn: `started_at` wird gesetzt (Zeit der Abfrage), die Zeile bleibt `active`,
     und danach fragt der Sweep sie nie wieder. Weder Marke noch Turn und älter als `created_at` plus `START_TIMEOUT_MS` plus
     `SWEEP_GRACE_MS`: `status` `failed`, `reason` `start_interrupted`, Schlüssel widerrufen (`revokeAutomatonKey`), Sandbox löschen.
     Jünger, in `inFlight` oder mit gestoppter Sandbox: nichts tun.
  3. **Nie auf Verdacht.** Antwortet `sandboxd` nicht (Abfrage oder `remove` ohne 200), ändert der Sweep an dieser Zeile nichts und
     versucht es im nächsten Takt wieder; eine Zeile, deren Sandbox nicht antwortet, wird nie `failed`. Ein Fehler bei einer Zeile hält
     die anderen nicht auf, und `sweepAutomatons` wirft nie.
  4. **Zeilen `failed`.** Steht für eine Zeile `failed` die Sandbox in `sandboxes.row` noch mit `running` oder `stopped`, ruft der
     Sweep `sandboxes.remove`; bei 200 eine Log-Zeile `[automaton] <id>: sweep removed the sandbox of a failed automaton`. Eine
     Zeile, die der Sweep auf `failed` setzt und deren Sandbox nicht gelöscht werden kann, räumt dieser Weg im nächsten Takt ab.
  5. **Fehlerpfad von `create`.** Kommt `remove` nicht mit 200 zurück, schreibt `createAs` eine Log-Zeile, dass der Sweep die Sandbox
     löscht, und die 501-Antwort sagt dann, dass die Sandbox innerhalb weniger Minuten gelöscht wird und nur bis dahin abgerechnet ist,
     statt „was deleted again“. Bei 200 bleibt die heutige Antwort.
  6. **Takt.** `src/index.ts` ruft den Sweep im Block der Abrechnung (`const billing = …`) nach jedem `sandbox.tick()` auf, also zum
     ersten Mal drei Minuten nach dem Start und danach jede Minute. Nicht sofort beim Start, weil der Kanarienvogel des Rollouts
     dieses Image mit derselben Datenbankkopie und demselben Schlüssel für `sandboxd` ein paar Sekunden laufen lässt und nichts
     löschen darf (Kommentar über `billing`). Wie der Dienst aus `createApp` nach `src/index.ts` kommt (etwa eine Option in
     `AppOptions`, die `createApp` statt einer eigenen Instanz nimmt), entscheidet der Maker.
  7. **Der Text zu Transfers.** `TRANSFER_501.message` behält jeden Satz, den `test/messages.test.ts` heute verlangt, und nennt den
     Weg mit der Wallet nur noch für einen Automaton, der seine Runtime selbst betreibt. Dazu ein Satz: Ein Automaton, der hier über
     `POST /v1/automatons` läuft, zahlt Inferenz und Sandbox aus den Credits des Kontos, das ihn gestartet hat; um ihn zu finanzieren,
     lädt man dieses Konto auf und schickt nie USDC an seine Wallet. Derselbe Inhalt in `docs/errors.md` unter `## credit_transfers`.
     Kein neuer Status, keine neue Route.
- Keine Erstattung in diesem Goal: Was zwischen dem Scheitern und dem Sweep anfällt, ist höchstens ein angefangener Schritt von 6
  Minuten je Takt. Ob die schon gebuchten Schritte einer unterbrochenen Zeile gutgeschrieben werden, ist ein Vorschlag, kein Punkt.
- Der code-host hat kein Docker: Unit-Tests mit dem nachgebauten `sandboxd` aus `test/automaton-world.ts` und `test/sandbox-world.ts`
  (Uhr über `clock.t`, Fehler über `answer`), der Laufzeitpfad zusätzlich mit dem Job `e2e` des Goal-PR. `test/automaton-world.ts`
  beantwortet dafür `PROBE_COMMAND` je Sandbox (Marke gesetzt nach `AUTOMATON_START ok`, Turns aus dem Log).
- Ablauf: zuerst Sweep, Spalte und Fehlerpfad mit Tests (Punkte 1 und 2), dann der Takt (Punkt 3), dann der Text (Punkt 4), dann Doku,
  Annahmen, Umfang, `check` und `e2e` (Punkte 5 bis 7). Nach jedem grünen Punkt Commit und Push.
- Die Produktion ändert sich nur über den Merge und `deploy.yml`; kein Lauf gegen die Produktion oder den Sandbox-Server in diesem Goal.
  Prüfbefehle ohne Netz binden keinen festen Port, Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund
  mit eigenem Timeout, neue Dateien vor dem lokalen `check` stagen. Progress Log und Verdicts zitieren keine Suchausdrücke der
  Prüfbefehle wörtlich.
- Widerlegt, wenn die neuen Fälle aus Punkt 1 schon am Kopf von `dev` grün sind; dann rechnet keine Sandbox ohne Automaton ab, und das
  Goal endet mit dieser Messung in den Annahmen.
- Was danach schneller zu mehr zahlenden Automatons führt: hosting 02 macht lange Befehle im Hintergrund verlässlich und billiger in
  der Inferenz; ein Kunde, der einmal für eine tote Sandbox zahlte, startet keinen zweiten Automaton.

## Done Condition
- [x] Der Sweep löscht die Sandbox einer Zeile `failed`, die noch besteht, und der Fehlerpfad von `create` prüft das Ergebnis von
      `remove`; nach dem Sweep bucht die Abrechnung für diese Sandbox keine Ledger-Zeile mehr. Die Tests waren vor dem Fix rot.
      MVP: Funktion, weil eine Sandbox mit `keep_running`, deren Löschen scheiterte, sonst bis zum leeren Guthaben abbucht.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/automaton-sweep.test.ts test/automaton-api.test.ts test/automaton-billing.test.ts test/automaton-idempotency.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/automaton-sweep.test.ts` muss mindestens 9 ausgeben (je ein Fall: Start scheitert und `DELETE` bei `sandboxd` scheitert, die Zeile ist `failed`, die 501-Antwort sagt nicht „deleted again“ und die Sandbox läuft noch; der nächste Sweep mit erreichbarem `sandboxd` löscht sie, danach bucht `tick` über 30 Minuten der Uhr keine Ledger-Zeile `kind` `sandbox` mit der Sandbox im `ref`; Sweep bei unerreichbarem `sandboxd` ändert keine Zeile und wirft nicht; Neustart zwischen der Zeile `active` und dem Start (neue Instanz des Dienstes auf derselben Datenbank) nach `START_TIMEOUT_MS` plus `SWEEP_GRACE_MS` plus 1 ms: `failed`, `reason` `start_interrupted`, Schlüssel widerrufen, Sandbox gelöscht, danach keine Ledger-Zeile der Sandbox; dieselbe Zeile 1 ms vor der Frist bleibt `active`; eine Zeile `active` ohne `started_at` mit Marke oder Turn, älter als die Frist, bleibt `active`, bekommt `started_at` und ihre Sandbox läuft; ein Start, der in diesem Prozess noch läuft, bleibt nach der Frist unberührt; `GET /v1/automatons/<id>` zeigt nach dem Neustart-Fall `failed` und `start_interrupted`; ein erfolgreicher Start setzt `started_at`; zwei Sweeps hintereinander löschen nichts doppelt).
      Prüfung: `for w in sweepAutomatons SWEEP_GRACE_MS START_TIMEOUT_MS start_interrupted started_at PROBE_COMMAND inFlight ledger; do grep -qF -- "$w" test/automaton-sweep.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `grep -cxE "export const SWEEP_GRACE_MS = 5 \* 60_000;" src/automaton/sweep.ts` muss 1 ausgeben.
      Prüfung: `grep -c "deleted again" src/automaton/service.ts` muss höchstens 1 ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; f=$T/src/automaton/sweep.ts; if ! grep -q "export async function sweepAutomatons(" $f; then echo "fehlt sweepAutomatons"; else sed -i "s/export async function sweepAutomatons(/async function sweepAutomatonsOrig(/" $f; echo 'export async function sweepAutomatons(..._a: unknown[]) { return { removed: 0, interrupted: 0 }; }' >> $f; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/automaton-sweep.test.ts >/dev/null 2>&1) && echo "gruen ohne sweepAutomatons"; fi; rm -rf $T` muss nichts ausgeben.
- [x] Ein Start ist in der Datenbank sichtbar: `hosted_automatons` hat die Spalte `started_at`, `createAs` setzt sie nach
      `AUTOMATON_START ok`, und die Migration läuft auf einer Datenbank ohne die Spalte und auf einer mit ihr; der Test war vor dem Fix
      rot.
      MVP: Funktion, weil der Sweep ohne diese Marke einen laufenden Automaton eines Kunden nicht von einem unterbrochenen Start
      unterscheiden könnte, ohne jede Minute in jede Sandbox zu fragen.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/automaton-sweep.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(.*migrat" test/automaton-sweep.test.ts` muss mindestens 1 ausgeben (eine Datenbank mit `hosted_automatons` ohne die Spalte bekommt sie beim Öffnen, ein zweites Öffnen ändert nichts).
      Prüfung: `grep -c "ADD COLUMN started_at" src/db.ts` muss 1 ausgeben.
      Prüfung: `grep -c "started_at" src/automaton/service.ts` muss mindestens 1 ausgeben.
- [x] Der Dienst ruft den Sweep im Takt der Sandbox-Abrechnung auf, nach `sandbox.tick()` und nie vor dem ersten Tick drei Minuten
      nach dem Start.
      MVP: Funktion, weil ein Sweep, den nichts aufruft, keine Sandbox löscht, und einer beim Start im Kanarienvogel des Rollouts
      Sandboxes von Kunden löschen könnte.
      Prüfung: `awk '/const billing = /,/^}/' src/index.ts | grep -c "sweep"` muss mindestens 1 ausgeben.
      Prüfung: `awk '/const billing = /,/^}/' src/index.ts | grep -c "3 \* 60 \* 1000"` muss 1 ausgeben.
      Prüfung: `awk '/const billing = /,/^}/{next} /sweep/' src/index.ts | wc -l` muss 0 ausgeben.
- [x] `TRANSFER_501` und `docs/errors.md` nennen für einen Automaton, der über `POST /v1/automatons` läuft, das Guthaben des Kontos,
      das ihn gestartet hat, und sagen, dass nie USDC an seine Wallet geht; der Test war vor dem Fix rot.
      MVP: Funktion, weil USDC an diese Wallet bei einem Schlüssel auf unserem Sandbox-Server liegt, den der Kunde nicht hat, und das
      Geld weder Credits wird noch zurückkommt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/messages.test.ts` muss Exit-Code 0 haben.
      Prüfung: `awk '/const TRANSFER_501 = /,/^  };/' src/app.ts | grep -c "POST /v1/automatons"` muss mindestens 1 ausgeben.
      Prüfung: `awk '/^## credit_transfers/{f=1;next} /^## /{f=0} f' docs/errors.md | grep -c "POST /v1/automatons"` muss mindestens 1 ausgeben.
      Prüfung: `grep -c "POST /v1/automatons" test/messages.test.ts` muss mindestens 1 ausgeben.
- [x] Die Doku sagt Kunden und Betrieb, was mit einem Automaton geschieht, dessen Start unterbrochen wurde, und die Entscheidungen
      stehen mit Grund in den Annahmen.
      MVP: Funktion, weil ein Kunde, der `failed` mit `start_interrupted` sieht, wissen muss, dass nichts mehr abgerechnet wird und
      wie er neu startet.
      Prüfung: `grep -c "start_interrupted" docs/sandbox/automaton.md` muss mindestens 1 ausgeben.
      Prüfung: `awk '/^## Goal 01/{f=1} f' goals/hosting/ANNAHMEN.md | grep -ciE "sweep|started_at|SWEEP_GRACE_MS|390 s|Kanarienvogel|TRANSFER_501|Erstattung"` muss mindestens 6 ausgeben.
- [x] Das Goal ändert weder `sandboxd`, Image und Server noch Runtime, Zahlung, Anmeldung, Deploy oder CI und bringt keinen Schlüssel
      ins Repo.
      MVP: Funktion, weil das Repo öffentlich ist (Grundregel 8), die Runtime am Pin die Referenz bleibt (Grundregel 13) und der Sweep
      nur das Control Plane braucht.
      Prüfung: `git diff --name-only origin/dev...HEAD -- ops/sandbox harness/runtime src/payments src/auth deploy .github scripts/check.mjs | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -cE "\.(key|pem|crt|env)$"` muss 0 ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- . ':(exclude)goals/' | grep -cE '^\+.*(cnwy_k_[0-9a-f]{32}|-{5}BEGIN [A-Z ]*PRIVATE KEY-{5})'` muss 0 ausgeben.
- [x] `check` ist grün, und der Job `e2e` des Goal-PR ist grün.
      MVP: Funktion, weil der Sweep auf dem Laufzeitpfad liegt und erst der Gang mit der unveränderten Runtime zeigt, dass ein
      gehosteter Automaton weiter startet und läuft (Grundregel 13).
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/hosting-01 --state all --json number -q '.[0].number'); gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,state -q '.[] | select(.name=="e2e") | .state'` muss `SUCCESS` ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei und jeder neue Fall war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Kein Weg setzt eine Zeile auf `failed` oder löscht eine Sandbox, wenn `sandboxd` nicht geantwortet hat.
- [ ] Die Texte, die ein Kunde liest (501 von `create`, `TRANSFER_501`, `docs/errors.md`), sagen in klaren Worten, was abgerechnet
      wird und was er tun soll.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei, Doku und Annahmen Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/runtime/**`, `ops/sandbox/**`, `src/payments/**`, `src/auth/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`,
  `.env*`, `*.key`, `*.pem`, `*.crt`
- `/root/.automaton/wallet.json` in jeder Sandbox: nie lesen, kopieren oder ausgeben; `PROBE_COMMAND` liest nur die Marke und das Log
- der Zahlungsserver `76.13.144.207` und der Sandbox-Server `srv1327036`: kein Zugriff in diesem Goal, kein Rollout, kein Neustart
- Kauf, Aufladung, Wallet-Bewegung, Topup, Überweisung, Gutschrift (`loop-constraints.md`, Grundregeln 6, 9 und 10)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-17 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6, 7 gebaut (Sweep in `src/automaton/sweep.ts` nach jedem Abrechnungstakt, Spalte `started_at`, Fehlerpfad von `create` prüft `remove`, Text zu Transfers, Doku und Annahmen); neue Fälle in `test/automaton-sweep.test.ts` am Stand von `dev` rot (Modul fehlt) und je Mutation rot (Migration, `started_at`, Fehlerpfad, Frist ohne Grace, ohne `inFlight`, Abfrage ohne Antwort), die zwei neuen Prüfungen in `test/messages.test.ts` vor dem Text rot. Prüfbefehle: Punkt 1 vitest der vier Dateien Exit 0, 12 Fälle, keine Wortlücke, Konstante 1, Text einmal, No-op-Gegenprobe ohne Ausgabe (5 rot); Punkt 2 vitest Exit 0, Migrationsfall 1, Migration 1, Spalte im Dienst 2; Punkt 3 im Block 1 und 1, außerhalb 0; Punkt 4 vitest Exit 0, 1, 1, 2; Punkt 5 1 und 18; Punkt 6 0, 0, 0; Punkt 7 `check` Exit 0 (2159 Tests), `e2e` an PR #230 SUCCESS am Kopf f2b721d.

## Blockers
Keine.
