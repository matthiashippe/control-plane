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
- **Kein Sweep beim Bau der Dienste (Zyklus 4, Gap der Linse K zu Punkt 3).** `test/sweep-not-on-start.test.ts` baut
  Sandbox-Dienst, Automaton-Dienst und App so wie `src/index.ts`, neben einer Zeile `failed` mit laufender Sandbox und einem
  abgeschnittenen Start von vor einer Stunde, und lässt eine falsche Uhr zehn Minuten ohne den Takt laufen: `sandboxd` bekommt
  weder Abfrage noch DELETE, Zeilen und Sandboxes bleiben, wie sie waren. Danach räumt derselbe Dienst auf Anruf beide ab, damit der
  Test in beide Richtungen zeigt. Dazu ein Pin auf `src/`: `sweepAutomatons(` nur im `sweep` des Dienstes, der Sweep des Dienstes
  nur in `src/index.ts` und im Takt, `startBillingRound(` nur in `src/index.ts`, das Modul des Sweeps nur von
  `src/automaton/service.ts` importiert. Grund: Der Kanarienvogel des Rollouts baut die Dienste ebenfalls und darf nichts löschen.
  Am Verhalten ändert sich nichts.

## Goal 02 (17.11.2026, Engineer CP)

- **Exit-Datei atomar.** Die Hülle aus `backgroundCommand` schreibt `echo $c` nach `<base>.exit.tmp` und schiebt sie mit
  `mv -f <base>.exit.tmp <base>.exit` an ihren Platz, mit einem Leerzeichen vor jedem Pfad wie bisher (`mapRoot`). Grund: Bei
  `echo $c > <base>.exit` legt die Umleitung die Datei an, bevor die Zahl drinsteht; ein Wartebefehl, der genau dann liest, sah eine
  leere Datei. `mv` liegt in coreutils, das das Image wegen `timeout` schon hat. Der Test legt ein `mv` vor das echte in den `PATH`,
  das notiert, ob `<base>.exit` vor seinem Aufruf schon bestand.
- **Nur eine Exit-Datei mit Inhalt ist ein Ende.** `waitCommand` wartet mit `[ ! -s ]`, das zweite Lesen nach einer Sekunde ist
  weg, und eine leere Datei am Ende der Wartezeit gibt „still running“ mit Exit 0. Die Bedingung des Endes ist
  `[ -f <base>.exit ] && [ -s <base>.exit ]`: Das `-f` ist für die Bash überflüssig, bleibt aber, weil `BG_ANSWER_JS` in
  `ops/live.sh` den Wartebefehl daran erkennt, dass er `[ -f <exit_code_file> ]` nennt, und weil `test/sandbox-wait.test.ts` (sandbox
  09) das prüft. So bleibt die Live-Prüfung auch zwischen Merge und Rollout grün, wenn sie noch gegen den alten Stand läuft.
- **Höchstens 64 KB je Strom.** `export const WAIT_TAIL_BYTES = 64 * 1024;`. Eine Funktion `printOutputs` baut das Stück Shell für
  beide Ströme, und Wrapper wie Wartebefehl nutzen sie, weil die Antwort des Wrappers (Befehl endet vor `EXEC_EARLY_MS` oder
  Wiederholung mit demselben Schlüssel nach dem Ende) sonst denselben Weg mit Megabytes in den Kontext bringt. Größe mit
  `wc -c 2>/dev/null < <datei>` (die Umleitung der Fehler zuerst, damit eine fehlende Datei keine zusätzliche Meldung bringt; dann
  druckt `cat` wie bisher seinen Fehler), über 65536 Bytes eine Zeile und `tail -c 65536` auf demselben Strom, sonst `cat` wie
  bisher. Damit kommt eine kleine Ausgabe Byte für Byte wie vorher. Den Wortlaut der Zeile legt Punkt 7 fest (unten); der
  erste Wortlaut aus Zyklus 1 schickte das Modell mit `read_file` zum Rest. Der Text von `stillRunning` nennt die Grenze von 64 KB.
- **Dauer der Wartebefehle in der Live-Prüfung.** `bg_live` gibt nach dem Token die längste Dauer eines Aufrufs von `wait_command`
  aus (0, wenn keiner lief), `sandbox_live` schreibt sie als `bg_max_ms=<ms>` direkt nach `bg=<token>` in die Ergebniszeile, und die
  Zeile `OK sandbox:` endet mit `bg_max_ms=<ms>`, ab `BG_WARN_MS=27000` gefolgt von `warning: …`. `bg=ok` bleibt, wie es ist. Grund
  für 27000: 3 s Rand bis zum Abbruch der Runtime nach 30000 ms; ein `FAIL` löste einen Revert aus, obwohl der Aufruf rechtzeitig
  endete, darum nur eine Warnung. Der Selbsttest prüft 25000 und 26999 ohne und 27000 und 29999 mit Warnung; die Gegenprobe mit
  einer Messung ohne Maximum und mit `BG_WARN_MS=27001` macht ihn rot (`LIVE SELFTEST FAIL`).
- **Teile lesen statt `read_file` (Punkt 7, Kritik Tech Lead 17.11.2026).** `read` in `src/sandbox/service.ts` gibt die Datei
  ungekürzt zurück, also brächte ein Modell, das dem Hinweis „read the rest with read_file“ folgt, die 5 MB eines `npm install` im
  nächsten Aufruf doch in den bezahlten Kontext. Wortlaut der Zeile jetzt: `This output has <n> bytes, only its last 65536 bytes
  follow. The whole output is in <pfad>. Do not read it with read_file, that puts all <n> bytes into your context. Read parts with
  exec: grep -n '<text>' <pfad> finds lines, sed -n '<from>,<to>p' <pfad> prints them.` Platzhalter in spitzen Klammern, weil das
  Modell sie aus Hilfetexten kennt; beide Befehle mit vollem Pfad, damit es sie nur ausfüllen muss. Der Text von `stillRunning` sagt
  dasselbe kurz (`grep -n` oder `sed -n` in exec, nicht `read_file`). Rot vor dem Fix: 3 der 8 Fälle in
  `test/sandbox-background-output.test.ts` und die neue Assertion in `test/sandbox-long-exec.test.ts` mit `service.ts` von `15466cd`.
- **Wartebefehl unter 2000 Zeichen (Punkt 7).** Der Job `e2e` am Kopf `e824ecf` war rot (`LONG_EXEC_VERDICT fail long-180`), obwohl
  die Wartebefehle liefen und der letzte mit `long-180` und Exit 0 endete: `judgeLongExec` in `harness/e2e/long-exec.mjs` liest den
  Text der Antwort auf 2000 Zeichen gekürzt, und mit der Zeile zweimal im Wartebefehl (für `.out` und `.err`) war die Antwort 2433
  Zeichen lang, die letzte Zeile fehlte. `harness/e2e/` liegt außerhalb des Umfangs dieses Goals (Punkt 5), also wird der Wartebefehl
  kürzer: Die Zeile und `tail -c` stehen einmal in der Shell-Funktion `cut_out` (Größe, Pfad), die beide Zweige für große Dateien
  rufen; `cat <base>.out` und `cat <base>.err >&2` bleiben wörtlich, weil `test/sandbox-wait.test.ts` (sandbox 09) sie prüft. Die
  Antwort ist jetzt 1925 Zeichen lang; `test/sandbox-long-exec.test.ts` prüft den Werkzeugtext der Runtime bis zum Beginn von
  stderr gegen 2000 Zeichen (rot mit `service.ts` von `d06f2e4` und `15466cd`). Der Einstieg `--judge sandbox-bg` von `ops/live.sh`
  liest weiter 4000 Bytes und reicht damit.
- **Widerlegt?** Nein: Am Kopf von `dev` (`11a4475`) sind 6 der 8 neuen Fälle aus `test/sandbox-background-output.test.ts` rot
  (leere Exit-Datei ohne Schreiber, leere mit spätem Code 3, `mv` der Hülle, 5 MB im Wartebefehl, 5 MB im Wrapper, 65537 Bytes);
  die beiden Fälle für unverändertes Verhalten (genau 65536 Bytes, kleine Ausgabe) sind dort grün, wie sie sollen.

## Goal 04 (21.11.2026, Engineer CP)

- **Widerlegt?** Nein: Am Kopf von `dev` (`757ecc6`) unterschieden sich `grantLiveSandbox` und `grantLiveAutomaton` nur in Ref,
  Betrag und dem Text für `meta.reason`; Typ, Transaktion, Abfrage der Ref, Abfrage des Kontos und Buchung waren gleich.
- **Ort und Form.** `grantInternal` steht in `src/credits/internal-grant.ts` neben `src/credits/aborted.ts`, weil beide
  Live-Prüfungen sie nutzen und weder `src/sandbox/` von `src/automaton/` abhängen soll noch umgekehrt. Signatur
  `grantInternal(db, { ref, mc, reason }, address)`, Rückgabe `GrantOutcome` aus derselben Datei; kein Re-Export aus den alten Dateien.
  Die Art `internal_grant` steht fest in der Funktion, nie als Argument, weil eine Gutschrift der Art `grant` aus dem Startertopf ginge.
  Die Adresse hat dort keinen Standardwert, den behalten die beiden Aufrufer. Die nächste interne Gutschrift ruft `grantInternal`.
- **Prüfung auf die Ref.** Die Funktion fragt wie vorher in derselben Transaktion zuerst nach einer Zeile `internal_grant` mit dieser
  Ref, dann nach dem Konto. Der eindeutige Index in `src/db.ts` bleibt die zweite Sicherung; ohne die Abfrage endete ein zweiter
  Start mit einem Fehler statt mit `already_granted`.
- **Ref und Betrag wechseln nie.** `LIVE_SANDBOX_GRANT`, `LIVE_AUTOMATON_GRANT`, `liveAutomatonGrantMc` und die beiden Texte für
  `meta.reason` sind Byte für Byte wie auf `dev`, Name, Signatur und Rückgabe der beiden Aufrufer auch. In der Produktion entscheidet
  allein die Ref, ob der Start bucht: eine neue Ref oder ein neuer Betrag buchte beim Rollout eine zweite Gutschrift. Darum ändern sich
  `src/index.ts` und die beiden bestehenden Tests nicht, und nach dem Rollout bucht der Start keine neue Zeile.
- **Der neue Test** `test/internal-grant.test.ts` nutzt eigene Test-Refs und eine Testadresse, nie die Refs der Live-Prüfungen: ohne
  Konto `no_account` und keine Zeile; mit Konto erst gebucht, dann mit derselben Ref `already_granted` und genau eine Zeile mit Betrag
  und Grund in `meta`; eine zweite Ref bucht ihre eigene Zeile.
- **Gegenprobe.** In einer Kopie von `67cc418` trifft die Abfrage der Ref nie (Bedingung auf `WHERE 0` gesetzt): 1 von 3 Fällen rot,
  der zweite Aufruf mit derselben Ref läuft in den eindeutigen Index (`UNIQUE constraint failed: ledger.ref`) statt
  `already_granted` zu liefern. Mit dem unveränderten Stand sind alle 3 grün.
- **`creditAbortedCharges` bleibt außen vor.** Sie bucht Art `refund` mit eigenen Prüfungen (Summe, Adresse aus den Abbuchungen) und
  ist keine Gutschrift einer Live-Prüfung.

## Goal 05 (21.11.2026, Engineer CP)

- **Widerlegt?** Nein: Am Kopf von `dev` (`b81b347`) fragte `ops/watchdog.sh` den Sandbox-Server nicht; das Wort `sandbox` kam darin
  nicht vor.
- **`/healthz` bleibt Byte für Byte.** 200 `ok` wie vorher, weil `test/sandboxd.test.ts` und die Healthchecks des Harness sie lesen;
  der neue Test prüft es und dass dabei kein Docker-Aufruf läuft. Neu ist `GET /healthz/image`, ebenfalls ohne Signatur: Die Antwort
  verrät nur den Zustand des Basis-Images, und durch Caddy kommt nur der Zahlungsserver. Jeder andere Pfad, auch
  `/healthz/image/x`, braucht weiter die Signatur.
- **Die Regel des Pins steht einmal.** `imageHealth({ imageId, pin })` in `ops/sandbox/sandboxd.mjs` ist eine reine Funktion nach
  `pin_fact` aus `ops/sandbox/setup.sh`: ohne Image `missing`, `ok` nur bei einem nie gestarteten Pin (`created`) genau dieser
  Image-ID ohne Label `sandboxd=1`, sonst `unpinned`. Die Route fragt Docker mit denselben zwei Abfragen wie `pin_fact`
  (`docker image inspect`, `docker container inspect`), je mit 10 s Zeitlimit; scheitert eine, gilt der Teil als fehlend. Der Name
  des Pins kommt aus `SANDBOXD_PIN` mit Vorgabe `sandboxd-base-pin`, der Test vergleicht sie mit `PIN=` in `setup.sh`.
  `sandboxd.service` ändert sich nicht.
- **Der Wächter entscheidet am Statuscode.** `check_sandboxd` fragt `<CP_SANDBOXD_URL>/healthz` und bei 200 `/healthz/image`, je
  zwei Versuche mit `CP_SANDBOXD_PAUSE` Sekunden Pause (Vorgabe 20, die Tests setzen 0). Zustand in `<state file>.sandboxd`: `ok`,
  bei 503 auf `/healthz/image` `unpinned` (Text `image unpinned`) oder `missing` (jeder andere Text), sonst `down`. Den Text liest
  er nur, um eine 503 in diese zwei Zustände zu teilen. Nur der Wechsel geht über `report` hinaus, gespeichert erst nach dem POST; die Titel bleiben `WARN` und `OK`,
  weil `ops/status.sh` die Meldungen des Wächters an ihren Titeln erkennt. Die Vorgabe von `CP_SANDBOXD_URL` ist
  `SANDBOXD_URL_DEFAULT` aus `src/sandbox/client.ts`, der Test vergleicht beide.
- **Kritik (Punkt 8): `missing` und `unpinned` sind zwei Zustände statt eines Zustands `image`.** Mit einem gemeinsamen Zustand
  schwieg der Wächter, wenn der Prune-Cron ein ungepinntes Image danach wirklich wegräumte: Er schrieb nur „still“ ins Log, obwohl ab
  da jede neue Sandbox mit 501 scheitert. Jetzt meldet jeder Wechsel zwischen beiden genau ein `[WARN]` mit dem neuen Zustand, und
  die Rückkehr nach `ok` meldet aus `down`, `missing` und `unpinned`. `sandboxd.mjs` ändert sich dafür nicht, also kein neuer
  Rollout auf den Sandbox-Server; der Zustand `image` lag nie auf dem Zahlungsserver, weil der Wächter erst mit dem nächsten
  Deploy dorthin kommt.
- **Abweichung von Entscheidung 3 des Tech Lead: `check_sandboxd` läuft nach dem Health-Urteil, nicht davor.** Der Kontext wollte
  den Aufruf vor `check_health`, damit die Prüfung auch bei einem Ausfall des Zahlungsdienstes läuft. Das bricht den bestehenden
  Test `test/watchdog-webhook-fail.test.ts` (Fall OUTAGE): Sein falsches `curl` antwortet jeder URL mit `/health` denselben Code
  500, also meldete der Wächter dort zusätzlich `sandboxd unreachable`, und der erste, absichtlich gescheiterte POST träfe diese
  Meldung statt des Ausfalls. Punkt 2 verlangt diesen Test grün und Punkt 6 verbietet, ihn zu ändern. Fachlich verliert der Aufruf
  danach nichts: Solange der Zahlungsdienst nicht antwortet, legt kein Kunde eine Sandbox an, und der Ausfall ist schon gemeldet.
  Der Zustand von `sandboxd` bleibt in der Zeit stehen, der erste Lauf nach der Rückkehr meldet einen Wechsel. Ein eigener Fall im
  neuen Test belegt das (Ausfall des Zahlungsdienstes: keine Anfrage an `sandboxd`, eine Meldung, Zustand unverändert).
- **Gegenproben.** Der neue Test des Wächters gegen `ops/watchdog.sh` der Merge-Basis: 13 von 13 Fällen rot. Der Test von
  `sandboxd` gegen eine Kopie, in der `"exited"` statt `"created"` als nie gestartet gilt: 3 rot (Regel, `image ok` und gestarteter
  Pin). Gegen `sandboxd.mjs` der Merge-Basis (ohne Route und Funktion): 9 von 11 rot, grün blieben nur `/healthz` und die
  Signaturpflicht anderer Pfade.
- **Rollout auf den Sandbox-Server** mit `ops/sandbox/setup.sh` vom code-host, vor dem Merge, wie im Goal festgelegt. Vorher am
  21.11.2026 15:52 UTC `--foreign-sandboxes`: `running=0 foreign=0`, also unterbrach der Neustart keinen Kunden. `--check` meldete
  genau eine Zeile `CHANGE` für `sandboxd.mjs` und `SETUP CHECK DRIFT changed=1`.
- **Nachher.** `bash ops/sandbox/setup.sh 72.62.51.224` rollte `sandboxd.mjs` aus und startete `sandboxd` neu, danach meldete
  `--check` keine Zeile `CHANGE` mehr; der lesende `curl` auf `127.0.0.1:8730/healthz/image` über den Schlüssel von `setup.sh`
  antwortete `image ok`. Damit fragt der Wächter nach dem nächsten fälligen Deploy eine Route, die der Sandbox-Server kennt.

Nachher: SETUP CHECK OK changed=0, 2026-11-21 15:55 UTC
Nachher: image ok, 2026-11-21 15:55 UTC

## Goal 06 (21.11.2026, Engineer CP)

- **Die Summe deckt ganz `node_modules/`, nicht nur die Pakete, die `dist/` lädt** (Entscheidung 1 des Tech Lead). `deps_sum` nimmt
  jede reguläre Datei unter `node_modules/` mit Inhalt und Pfad wie `dist_sum`, dazu jeden symbolischen Link mit Pfad und Ziel, beide
  Listen mit `LC_ALL=C` sortiert, und `sha256sum` über beides. Welche Pakete `viem` transitiv lädt, zeigt erst ein Lauf, eine
  Obermenge verfehlt keines. `node_modules/.pnpm/lock.yaml` gegen `pnpm-lock.yaml` sähe nur eine veraltete Installation, keine
  veränderte Datei, und `node_modules/.modules.yaml` ändert sich bei einer veränderten Datei gar nicht; beide taugen darum nicht als
  Summe. Die Links zählen mit, weil pnpm die Pakete als Links in den virtuellen Store `node_modules/.pnpm/` legt und ein Link auf eine
  andere Version keine Datei ändert; der Selbsttest pflanzt dafür zwei Versionen mit gleichem Inhalt, und ohne die Links in der Summe
  wird `deps-relinked` rot (Gegenprobe beim Bau). Fehlt `node_modules/`, ist die Summe das Wort `none` und passt nie zu einem Stempel
  nach einem Bau mit Installation.
- **Messung am Cache** `~/.cache/control-plane/automaton-d8f8168`, nur lesend (kein `pnpm`, kein Stempel), mit
  `find node_modules -type f | wc -l`, `find node_modules -type l | wc -l` und der Funktion `deps_sum` aus dem Skript, dreimal
  hintereinander bei Last 36 auf 30 Kernen: 2,9 s beim ersten Lauf (Dateien nicht im Seitencache), danach 0,56 und 0,57 s. Die Zeile
  nennt den ersten, teuersten Lauf. Gegen die Dauer eines Gangs (Klon prüfen, Sandbox anlegen, nutzen, löschen) und einen Neubau mit
  `pnpm install --frozen-lockfile` fällt das nicht ins Gewicht, darum keine kleinere Summe.
Messung: deps_sum 19371 Dateien, 466 Links, 2,9 s, 2026-11-21
- **Alter Stempel.** Ein Stempel mit nur `<HEAD> <dist_sum>` ist `deps` (Fall `deps-old-stamp`) und führt einmal zum Neubau. Der Cache
  hat am 21.11.2026 gar keinen Stempel, der nächste Gang baut dort ohnehin neu.
- **Neubau bei `deps` von Grund auf** (Entscheidung 3). `build_runtime` löscht bei `deps` `node_modules/` und `dist/` und ruft dann
  `pnpm install --frozen-lockfile` und `pnpm build`. Das nachgebaute `pnpm` im Selbsttest legt die Pakete nur an, wenn
  `node_modules/` fehlt, wie das echte pnpm, das eine veränderte Datei nicht sieht; ohne das Löschen wird `rebuild-changed-deps` rot,
  weil der neue Stempel sonst die veränderte Datei deckt (Gegenprobe beim Bau). Bei `unbuilt` und `dist` bleibt `node_modules/`
  stehen, damit ein Neubau von `dist/` keine Pakete neu lädt.
- **Abweichung von `ROADMAP.md`.** Die Zeile nennt als Test `test/runtime-sandbox-selftest.test.ts` aus hosting 03. hosting 03 steht
  seit dem Kurs-Check vom 17.11.2026 auf `PAUSED`, die Datei gibt es auf `dev` nicht. Dieses Goal bringt darum seinen eigenen, schmalen
  Test `test/runtime-sandbox-deps.test.ts`; startet hosting 03 wieder, verlangt sein Test die Zeile für `deps-changed` laut
  `ROADMAP.md` ohnehin.
