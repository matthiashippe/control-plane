# Annahmen hosting

## Goal 01 (17.11.2026, Engineer CP)

- **Wo der Sweep wohnt.** `sweepAutomatons` steht in `src/automaton/sweep.ts`, `createAutomatonService` führt die Menge `inFlight`
  (hinein vor der Anlage der Sandbox, heraus im `finally` von `createAs`) und gibt `sweep()` zurück. Ein zweiter Aufruf, während
  einer läuft, bekommt denselben Lauf, damit ein Takt über 60 s nie zwei Sweeps nebeneinander fährt. `TURN_PATTERN` und
  `START_TIMEOUT_MS` liegen dafür in `src/automaton/runtime.ts` und werden aus `src/automaton/service.ts` weiter exportiert, weil
  ein Import in beide Richtungen zwischen Dienst und Sweep beim Laden von der Reihenfolge abhinge.
- **`SWEEP_GRACE_MS` ist 5 Minuten, die Frist also 390 s.** Upload (120 s) und Start (90 s plus 30 s am Client) brauchen zusammen
  höchstens 240 s; `START_TIMEOUT_MS` plus `SWEEP_GRACE_MS` gibt 150 s Luft. Die Frist zählt ab `created_at` der Zeile, eine Zeile
  genau an der Frist bleibt unberührt.
- **Ein Start ist abgeschlossen, wenn `started_at` steht.** Die Spalte kommt mit `ALTER TABLE … ADD COLUMN` beim Öffnen der
  Datenbank, `createAs` setzt sie direkt nach `AUTOMATON_START ok`. Alle Zeilen `active` von vor der Migration haben kein
  `started_at`; der erste Sweep nach dem Rollout fragt jede von ihnen genau einmal mit `PROBE_COMMAND` (Marke
  `/root/.automaton/autostart` und Turns im Log, nie `wallet.json`), setzt bei Marke oder Turn `started_at` und fragt sie danach
  nie wieder. Eine gestoppte Sandbox fragt er nicht, weil `exec` sie dafür starten würde; sie kostet ohnehin nichts.
- **Nie auf Verdacht.** Antwortet `sandboxd` auf die Abfrage nicht mit 200 oder fehlt eine der Zeilen `mark=` und `turns=`, bleibt
  die Zeile, wie sie ist. Antwortet die Sandbox ohne Marke und Turn, wird die Zeile `failed` mit `start_interrupted` und der Schlüssel
  widerrufen, auch wenn das anschließende Löschen scheitert: Dann löscht der Weg für Zeilen `failed` im nächsten Sweep, weil
  `sandboxd` in diesem Fall schon geantwortet hat.
- **Fehlerpfad von `create`.** `createAs` prüft das Ergebnis von `sandboxes.remove`; 200 und 404 gelten als gelöscht (404 heißt,
  die Zeile in `sandboxes` läuft nicht mehr und wird nicht abgerechnet), jedes andere Ergebnis gibt die Log-Zeile, dass der Sweep die
  Sandbox löscht, und die 501-Antwort sagt, dass sie in wenigen Minuten gelöscht wird und nur bis dahin kostet.
- **Takt und Kanarienvogel.** `src/index.ts` ruft den Sweep im Block `billing` nach jedem `sandbox.tick()` auf, auch wenn der Tick
  scheiterte (der Sweep ändert dann nichts). Der erste Lauf kommt drei Minuten nach dem Start, nie sofort, weil der Kanarienvogel
  des Rollouts dasselbe Image mit derselben Datenbankkopie und demselben Schlüssel für `sandboxd` ein paar Sekunden laufen lässt
  und keine Sandbox eines Kunden löschen darf. Der Dienst der Automatons entsteht dafür in `src/index.ts` und geht über die neue
  Option `automatons` an `createApp`, damit Routen und Sweep dieselbe Menge `inFlight` sehen.
- **`TRANSFER_501`.** Die Meldung behält jeden Satz, den `test/messages.test.ts` verlangte, nennt den Weg über die Wallet nur noch
  für einen Automaton, der seine Runtime selbst betreibt, und sagt für einen über `POST /v1/automatons`: Guthaben des Kontos, das ihn
  gestartet hat, aufladen, nie USDC an seine Wallet. `docs/errors.md` sagt dasselbe unter `## credit_transfers`.
- **Keine Erstattung in diesem Goal.** Was zwischen dem Scheitern und dem Sweep anfällt, sind höchstens die angefangenen Schritte bis
  zum nächsten Takt; die schon gebuchten Schritte einer Zeile `start_interrupted` bleiben gebucht. Eine Gutschrift dafür wäre ein
  eigener Vorschlag.
- **Widerlegt?** Nein: Die neuen Fälle aus `test/automaton-sweep.test.ts` sind am Kopf von `dev` (`9e1804f`) rot, weil es dort
  weder Sweep noch `started_at` gibt; jede einzelne Mutation (Migration, `started_at` in `createAs`, alter Fehlerpfad, Frist ohne
  Grace, ohne `inFlight`, Abfrage ohne Antwort als leer gewertet) macht genau den zugehörigen Fall rot.
- **Takt prüfbar (Zyklus 3, Gap der Linse K zu Punkt 3).** Der Takt aus `src/index.ts` liegt in `startBillingRound`
  (`src/sandbox/round.ts`) mit Tick, Sweep, erster Frist und Intervall als Parametern, damit ein Test mit falscher Uhr zeigt, dass
  vor drei Minuten weder Tick noch Sweep laufen und der Sweep erst nach dem Tick beginnt, auch nach einem roten Tick.
  `test/billing-round.test.ts` liest dazu `src/index.ts`: Genau eine Zeile nennt den Sweep, und sie reicht ihn an
  `startBillingRound` mit `firstDelayMs` von drei Minuten. Grund: Ein Sweep beim Start würde im Kanarienvogel des Rollouts
  Sandboxes löschen, und vorher fing das kein Prüfbefehl. Am Verhalten ändert sich nichts.
