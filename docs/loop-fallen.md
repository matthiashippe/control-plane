# Fallen im Loop: Prüfen, Messen, Testen

Erprobte Wege der Loop-Rollen (Maker, Linsen K und B, Audit, Kritik) auf dem code-host. Jeder Punkt nennt die Stelle im Repo,
an der er sich nachprüfen lässt. Bindend bleiben `loop-constraints.md` und `ops/prompts/verifier.md`; diese Seite erklärt nur,
woran man sich dabei stößt.

## check und vitest

- `node scripts/check.mjs` prüft die Regeln zu Secrets, Anthropic und OpenRouter nur über `git ls-files` (`trackedFiles()`).
  Eine neue, noch ungetrackte Datei fällt lokal durch und macht den Job `check` am PR rot. Neue Dateien deshalb vor dem lokalen
  `check` stagen.
- Das Muster `TERMS` in `scripts/check.mjs` hat keine Wortgrenze. Auch ein Wort, das nur auf „tos“ endet (etwa der Plural von
  Konto), schlägt an, wenn danach „bei“, „von“ oder „der“ und der Name des Anbieters folgen. Solche Wendungen in Doku umstellen.
- `check` dauert ohne Last rund 2 Minuten (Messung im Kopf von `scripts/check.mjs`: Build 18 s, Tests 102 s), unter Last deutlich
  länger (Audit 2026-11-14: 448 s); die harte Grenze ist `LIMIT_S = 600`. Bash-Timeout deshalb 600000.
- Die `node_modules` der Worktrees sind für Node 22 gebaut, wie in CI. Auf dem code-host steht vorn im PATH Node 24, und
  `better-sqlite3` scheitert dann mit „Module did not self-register“. Vorher `export PATH=/usr/bin:$PATH`.
- Exit 1 mit allen Tests grün und `[vitest-worker]: Timeout calling "onTaskUpdate"`: vitest 3.2.7 hat einen festen 60-s-Timer je
  Worker-RPC. Blockieren synchrone Tests einer Datei (`spawnSync`, `execFileSync`) den Worker zusammen über 60 s, feuert er.
  `test/yield-between-tests.ts` (`setupFiles` in `vitest.config.ts`) gibt dem Event-Loop nach jedem Test eine Runde, seitdem
  blockiert nur noch ein einzelner Test über 60 s; dort hilft `spawn` statt `spawnSync` (PR #67). Unter Last zuerst den roten
  Test einzeln fahren, bevor der Diff verdächtigt wird.
- `vitest.config.ts` setzt `testTimeout: 60_000`. Ein SSE-Test, der auf ein nie kommendes Ereignis wartet, hängt 60 s und hält
  den Worker. Im Leser `reader.read()` gegen 10 s laufen lassen, jeden Reader in `afterEach` canceln und den Strom im Server nach
  Wanduhr begrenzen.
- `test/messages.test.ts` fragt jeden Pfad aus `V1_KEYLESS` mit GET ab, bei 405 mit POST ohne Body, und verlangt 200, 201 oder
  429. Ein neuer schlüsselloser POST-Endpunkt, der einen leeren Body mit 400 ablehnt, macht den Test rot. Deshalb von Anfang an
  eine GET-Antwort mit 200 einplanen und den Test nie aufweichen.
- `ops/fetchers.py` schreibt jede abgefragte Adresse in den Cache unter `CP_FETCHER_CACHE`, ohne die Variable nach
  `~/.cache/control-plane/fetcher-cache.tsv`. `test/visitor-addresses.test.ts` hält jede Adresse daraus, die kein Rechenzentrum
  ist, für einen Besucher und wird rot, sobald sie in einer getrackten Datei steht. Auf dem code-host trifft das jeden `check`,
  in CI fehlt der Cache und der Test wird übersprungen. Für Belegabfragen deshalb `CP_FETCHER_CACHE=$(mktemp)` setzen. PTR geht
  mit `getent hosts <ip>`, den Betreiber liefert RDAP per curl; `whois` fehlt auf dem code-host.

## Proxy-Sperre und Selbsttests

- Wird ein Vitest-Prüfbefehl nur mit Proxy-Sperre rot, zuerst belegen, ob die Sperre überhaupt greift: `fetch` in Node 22 liest
  `HTTP_PROXY` nicht. Dann den Befehl je 6 bis 10 Mal mit und ohne Sperre fahren und `uptime` notieren. Fällt er nur unter hoher
  Last aus (etwa Load über 90), ist das ein Hinweis für die Nacharbeit und kein Gap.
- Mit den vier Proxy-Variablen aus `ops/prompts/verifier.md` schickt `curl` auch 127.0.0.1 an den toten Proxy, und
  `test/smoke-phases.test.ts` wird rot. Mit `NO_PROXY=127.0.0.1,localhost,::1` und `no_proxy` ist er grün; `scripts/check.mjs`
  nimmt Loopback selbst aus (`LOOPBACK`). Bringt ein Goal ein solches Skript mit und trägt die Prüfzeile kein `(Netz)`, ist das
  ein Gap, weil das Audit ohne diese Ausnahme fährt.
- `ops/traffic.sh --selftest` endet mit Proxy-Sperre mit Exit 1 ohne Ausgabe, sein Prüfbefehl braucht also `(Netz)`.
  `ops/fetchers.py --selftest` und `ops/crawlers.sh --selftest` sind auch ohne Netz grün. `CP_DEPTH_LOG=<log> ops/depth.sh`
  schreibt zuerst `(log from <log>, not from the VM)` auf stderr; Vorher-Nachher-Vergleiche filtern die Zeile heraus. Jeden
  Selbsttest einmal mit Proxy-Sperre fahren, bevor er Prüfbefehl wird.
- Seit PR #79 schreibt `own_ips` aus `ops/own-ips.sh` nur noch mit `CP_OWN_IPS_WRITE=1` nach `ops/own-ips.txt` und merkt sich
  live gesehene Adressen in `CP_OWN_IPS_SEEN`. Die Datei steht auf der Deny List vieler Goals, deshalb nach jeder Messung mit Netz
  `git status --short ops/own-ips.txt` lesen.

## Produktion lesen

- Werte aus dem Container misst man mit `ssh … 'bash -s -- --container' < ops/credit-runway.sh`, das legt keine Datei auf dem Server an.
- Eine Zeile `Prüfung (Netz)`, die in der Produktion schreibt (etwa `bash ops/runtime-sandbox.sh`), führt Linse K nicht aus;
  nach `ops/prompts/verifier.md` ist sie ein Gap „Regel“. Das Ergebnis des Maker-Laufs belegt K trotzdem lesend
  (`docker exec deploy-cp-1 node -e …` mit `readonly: true`, nur Zahlen).
- Bei einem Mess-Goal mit Ergebnis 0 prüft die Kritik, ob im kritischen Intervall überhaupt Verkehr lag; ohne Verkehr heißt
  „hält“ nur „nicht widerlegt“. Dafür lesend mit `ops/access-log.sh` und `own_ips` je Fenster die Anfragen nach `ts` und
  `duration` relativ zum Start auflisten, ohne Adressen auszugeben.

## Skripte nachbauen, Harness und Runtime

- `sandbox_live` in `ops/live.sh` startet `bash "$CLIENT_KEY_SETUP"` (`ops/sandbox/setup.sh`) als Kindprozess. Der erbt keine
  gefälschten Shell-Funktionen und lädt bei leerem `CP_HOST` selbst `~/.config/control-plane/loop.env`, läuft also echt gegen
  den Server. Vor jedem Nachbau eines Skripts mit Kindprozess `ROOT` auf ein Scratch-Verzeichnis mit Attrappen legen,
  `CP_HOST=fake.invalid` setzen und `curl` sowie `ssh` als Funktionen fälschen, die mit Exit 99 abbrechen.
- `mapRoot` in `harness/sandboxd/harness-run.mjs` ersetzt `/root` nur nach Anfang, Leerzeichen, Anführungszeichen, `=`, `:`, `;`,
  `&`, `|` oder `(`. Ein Befehl mit `>/root/...` läuft im Harness gegen das echte `/root` und scheitert, in Produktion nicht;
  Unit-Tests mit dem Docker-Double sehen das nicht. Shell-Text für `sandboxd` deshalb mit Leerzeichen nach jeder Umleitung bauen
  und einmal durch `mapRoot` plus echte bash testen.
- `harness/runtime/` enthält nur Dockerfile und Setup; die Quelle der Runtime klont das Dockerfile am Pin (`AUTOMATON_REV`) erst
  im Job `e2e`. Behauptungen über ihr Verhalten prüft Linse K am Pin: Klon von `Conway-Research/automaton` in den Run-Scratch,
  `checkout d8f8168`, wichtige Stellen sind `src/conway/client.ts`, `src/types.ts` (`retryableStatuses`) und
  `src/agent/tools.ts`. Eine gebaute Fassung liegt auf dem code-host in `~/.cache/control-plane/automaton-d8f8168`; darin nichts
  ändern, `git status --porcelain` muss leer bleiben.
- `ops/soll.mjs` rendert über `--remote-debugging-pipe` ohne Port. chrome-headless-shell braucht auf dem code-host `--no-sandbox`,
  sonst stirbt es mit „No usable sandbox“. `Page.loadEventFired` kann noch von `about:blank` kommen; stabil wurde es erst mit
  Pollen auf `location.href` und `readyState === "complete"`, dazu zwei rAF und Viewport auf voller Höhe. Weil `html` und `.hero`
  `overflow-x: clip` tragen, misst man Überlauf über die Kanten aller Elemente, nicht über `scrollWidth`.

## Audit und Linsen

- Eine rote Audit-Zeile zuerst in einem frischen Worktree von `origin/dev` nachfahren. Läuft sie dort grün, kann die Ursache in
  der Audit-Umgebung liegen: Der Lauf beendet nach jedem Befehl die Prozesse im Worktree, er hat einen Speicherdeckel (10 GiB je
  Lauf), und der geteilte code-host steht oft unter hoher Last (Audit 2026-11-14: Load 50 bis 170). Die mtime einer Ausgabedatei
  und die gemessene Dauer belegen keine Überlappung zweier Befehle, die Reihenfolge steht im Runlog des Audits.
- Linse B zieht bei Doku-Goals die Befehlsblöcke eines Abschnitts per awk heraus und hält sie gegen jede Zahl im Fließtext
  (`loop-constraints.md`, Grundregel 3). Fehlt der Befehl zu einer Zahl, ist das ein Gap „Regel“ mit Datei und Zeile. In
  `Commit:` schreibt B den Kopf vor dem eigenen Verdict-Commit, also samt dem Verdict-Commit von K.
