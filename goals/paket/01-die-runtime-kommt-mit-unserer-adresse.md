# Paket Goal 01: Die Runtime kommt mit unserer Adresse

## Status
DONE

## Active Objective
Seit dem 11.11.2026 kam im Repo `Conway-Research/automaton` kein neues Issue (letztes #447 am 10.11.), unsere Antworten dort
erreichen niemanden mehr. Die Runtime wird aber weiter geholt (1812 Forks am 22.11., rund 200 Downloads im Monat bei npm, Stand
19.11. aus `docs/richtung/2026-11-19.md`), und jede neue Runtime startet mit `api.conway.tech`, das seit Wochen mit Fehlern antwortet.
Unser Fork `matthiashippe/automaton` ist seit dem 30.10.2026 öffentlich, bietet uns aber nur als Option 1 im Setup an, nennt noch die
alte Domain `postyourprice.com`, hat keine Kennung in seinen Anfragen und kein Release, das sich mit einem Befehl installieren lässt.
Nach diesem Goal ist der Fork das gepflegte Paket der Runtime: `https://automatonhost.com` ist die Voreinstellung, wer beim Setup
nur Enter drückt, landet bei uns, jede Anfrage trägt `User-Agent: automaton-maintained/<version>`, und ein Release mit Tag lässt sich
ohne npm-Konto mit einem Befehl installieren. So zählt paket 02, wie viele neue Wallets über das Paket kommen und zahlen.
Leitzahl: neue fremde Wallets je Woche mit der Kennung des Pakets, und ihre Zahlungen.
Widerlegt, wenn in den 14 Tagen nach dem Release keine Anmeldung mit der Kennung des Pakets ankommt; das misst paket 02.
Übernimmt goals/_vorschlaege/paket-kritik-2026-11-21-1.md.
MVP: Kauf, weil ohne neuen Kanal kein weiterer zahlender Automaton ankommt und das Paket jeden erreicht, der es installiert.

## Voraussetzungen
- umzug Goal 01 DONE

## Kontext für den Maker
- Ziel in einem Satz: Wer die Runtime aus unserem Fork installiert und startet, meldet sich bei uns an und denkt mit unserem
  Guthaben, ohne eine Einstellung zu ändern.
- Quelle: `ROADMAP.md`, Topic `paket`, Glied 01; Richtungs-Check 19.11.2026, Idee 3 und Entscheidung 2 (`docs/richtung/2026-11-19.md`);
  Matthias 22.11.2026 auf PRO-27264 zur Empfehlung „Ja, als Fork unter deinem GitHub-Konto“: „auf jeden fall“.
- Entscheidung Tech Lead 22.11.2026 (PRO-27264): Veröffentlicht wird im bestehenden öffentlichen Repo `matthiashippe/automaton`,
  nicht in einem neuen GitHub-Fork und nicht bei npm, weil es seit dem 30.10. öffentlich ist, die Antworten in den Conway-Issues
  dorthin verlinken und ein neues Repo diese Links verlöre. Kein npm, weil Matthias GitHub gewählt hat und dafür ein npm-Konto nötig
  wäre. Der Maker schreibt selbst in dieses Repo (`gh` auf dem code-host ist als `matthiashippe` angemeldet); es ist kein Loop-Repo und
  kein fremdes Repo im Sinn von `loop-constraints.md`, deshalb braucht es weder ein „ok“ mit `sha12` noch eine Karte an Matthias.
- Arbeitsort für den Fork: ein eigener Klon außerhalb des Goal-Worktrees (etwa `~/work/pc-wt/control-plane/automaton-fork`), Branch
  vom aktuellen `main` des Forks, Merge über einen PR im Fork mit `gh pr merge --merge`; nie `--force` auf `main`, nie die
  Sichtbarkeit ändern, nie Issues oder PRs in `Conway-Research/automaton` anfassen. Jede Änderung ist ein eigener Commit mit Test,
  wie die sechs bisherigen über `d8f8168`.
- Voreinstellung: `DEFAULT_CONFIG.conwayApiUrl` in `src/config.ts` ist `https://automatonhost.com`; im Setup steht diese Wahl oben
  und ist mit Enter gewählt; `CONWAY_API_URL` und eine bestehende `~/.automaton`-Konfiguration gelten weiter vor der Voreinstellung,
  eine gespeicherte Wahl wird nie still umgeschrieben. Steht eine bestehende Konfiguration auf `api.conway.tech` und scheitert die
  Anmeldung, nennt die Meldung, die der Fork schon zeigt, `node dist/index.js --setup` und `https://automatonhost.com`.
- Wortwahl (TEAM.md „Klare Wörter“): Die Option im Setup heißt `automatonhost.com` mit einer Zeile, was der Nutzer davon hat
  (Anmeldung funktioniert, Guthaben in USDC, bezahlt je Nutzung); Conway bleibt als Wahl mit dem ehrlichen Satz, dass die
  Anmeldung dort für neue Wallets scheitert. Code, Commits, README und Release-Text Englisch, kein Gedankenstrich.
- Kennung: Jede Anfrage des Conway-Clients der Runtime an den Control Plane trägt `User-Agent: automaton-maintained/<version>` mit
  der Version aus `package.json`; die Upstream-Runtime setzt heute keinen eigenen (Node-Standard). Das Caddy-Zugriffslog führt den
  User-Agent schon (`ops/conway_arrivals.py`, Zeilenformat), paket 02 zählt darüber.
- Paket: `package.json` des Forks heißt `automaton-maintained`, Version `0.2.2-maintained.1` (oder höher), `bin` behält `automaton`,
  damit bestehende Anleitungen gelten; ein `prepare`-Skript baut beim Installieren aus GitHub. Release mit Tag gleich der Version und
  kurzen Notizen, was sich gegenüber Upstream ändert. README oben: ein Satz, was das Paket tut, und der eine Befehl zum Installieren;
  die alte Domain `postyourprice.com` kommt im Fork nirgends mehr vor.
- In diesem Repo: `docs/paket/anleitung.md` (Deutsch) mit einer Zeile `Release: <tag>`, dem Installationsbefehl, der Liste der
  Commits über `d8f8168` je mit einem Satz, und wie ein neuer Upstream-Commit übernommen wird (Rebase der Commits, Tests, neues
  Release). `README.md` nennt das Paket mit dem Installationsbefehl. Die Startseite bleibt unverändert, weil eine sichtbare Änderung
  dort zuerst ein SOLL-Bild braucht; ein Vorschlag dafür geht nach `goals/_vorschlaege/`.
- `goals/paket/ANNAHMEN.md`: Zeilen `- <Datum>, paket 01: …`, mindestens zum Ort der Veröffentlichung und zur Kennung.
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), pnpm aus dem Fork (`packageManager`). Kein Aufruf von
  Endpunkten der Produktion; ob eine Runtime aus dem Paket sich anmeldet, prüft der Harness-Weg nicht, das misst paket 02 im Log.

## Done Condition
- [x] Die Runtime aus dem Release meldet sich ohne Einstellung bei `https://automatonhost.com` an: Voreinstellung in `src/config.ts`,
      Enter im Setup wählt uns, `CONWAY_API_URL` und eine gespeicherte Wahl gehen vor; Tests im Fork, rot vor der Änderung.
      MVP: Kauf, weil nur die Voreinstellung jeden neuen Betreiber beim ersten Start erreicht.
      Prüfung (Netz): `t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); gh api "repos/matthiashippe/automaton/contents/src/config.ts?ref=${t:?}" --jq .content | base64 -d | grep -c 'conwayApiUrl.*"https://automatonhost.com"'` muss mindestens 1 ausgeben.
      Prüfung (Netz): `t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); d=$(mktemp -d); git clone -q --depth 1 --branch "${t:?}" https://github.com/matthiashippe/automaton "$d" && cd "$d" && PATH=/usr/bin:$PATH pnpm install --frozen-lockfile >/dev/null 2>&1 && PATH=/usr/bin:$PATH pnpm -s build >/dev/null 2>&1 && PATH=/usr/bin:$PATH pnpm -s test >/dev/null 2>&1 && echo gruen` muss `gruen` ausgeben.
- [x] Jede Anfrage des Conway-Clients trägt `User-Agent: automaton-maintained/<version>`; Test im Fork.
      MVP: Funktion, weil paket 02 sonst nicht unterscheiden kann, wer über das Paket kommt.
      Prüfung (Netz): `t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); d=$(mktemp -d); git clone -q --depth 1 --branch "${t:?}" https://github.com/matthiashippe/automaton "$d" && git -C "$d" grep -c "automaton-maintained/" -- src | wc -l` muss mindestens 1 ausgeben.
- [x] Der Fork nennt nirgends mehr `postyourprice.com`.
      Prüfung (Netz): `t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); d=$(mktemp -d); git clone -q --depth 1 --branch "${t:?}" https://github.com/matthiashippe/automaton "$d" && (git -C "$d" grep -il "postyourprice" || true) | wc -l` muss 0 ausgeben.
- [x] Ein Befehl ohne npm-Konto installiert das Release, und `automaton --version` nennt die Version des Tags.
      MVP: Kauf, weil jeder weitere Schritt bei der Installation Betreiber verliert.
      Prüfung (Netz): `t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); p=$(mktemp -d); PATH=/usr/bin:$PATH npm install -g --prefix "$p" "github:matthiashippe/automaton#${t:?}" >/dev/null 2>&1 && "$p/bin/automaton" --version | grep -c "${t#v}"` muss 1 ausgeben.
      Prüfung (Netz): `t=$(grep -oE '^Release: \S+' docs/paket/anleitung.md | cut -d' ' -f2); gh release view "${t:?}" -R matthiashippe/automaton --json tagName -q .tagName` muss den Tag ausgeben.
- [x] `docs/paket/anleitung.md` nennt Release, Installationsbefehl, die Commits über `d8f8168` und den Weg für neue Upstream-Commits,
      und `README.md` nennt das Paket.
      Prüfung: `grep -cE '^Release: v?[0-9]+\.[0-9]+\.[0-9]+-maintained\.[0-9]+$' docs/paket/anleitung.md` muss 1 ausgeben.
      Prüfung: `grep -c 'github:matthiashippe/automaton#' docs/paket/anleitung.md README.md | grep -c ':[1-9]'` muss 2 ausgeben.
      Prüfung: `grep -c 'd8f8168' docs/paket/anleitung.md` muss mindestens 1 ausgeben.
- [x] `goals/paket/ANNAHMEN.md` nennt die Entscheidungen dieses Goals, ohne Adresse.
      Prüfung: `grep -cE "^- [0-9-]+, paket 01: " goals/paket/ANNAHMEN.md` muss mindestens 2 ausgeben.
      Prüfung: `grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}" goals/paket/ANNAHMEN.md docs/paket/anleitung.md` muss 0 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [x] Wer den Fork auf GitHub findet (Suche, Liste der Forks, Link aus einer Conway-Antwort), sieht ohne das README zu öffnen,
      dass die Runtime sich bei `automatonhost.com` anmeldet: Die Beschreibung des Repos `matthiashippe/automaton` nennt
      `automatonhost.com`, Englisch und ohne Gedankenstrich, und die Website-Adresse des Repos ist `https://automatonhost.com`
      (heute nennt die Beschreibung nur Fixes, die Website-Adresse ist leer). Nur Beschreibung und Website, nie die Sichtbarkeit.
      MVP: Kauf, weil die Beschreibung das Erste ist, was ein Betreiber vom Paket sieht, und sie heute nicht sagt, wo es sich anmeldet.
      Prüfung (Netz): `gh repo view matthiashippe/automaton --json homepageUrl,description -q 'select(.homepageUrl == "https://automatonhost.com" and (.description | test("automatonhost\\.com")) and (.description | test("[\u2013\u2014]") | not)) | "ok"'` muss `ok` ausgeben.
- [x] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Test im Fork war vor seiner Änderung rot; die Zeile im Progress Log nennt, womit.
- [ ] Die Historie von `main` im Fork bleibt erhalten: die sechs Commits vom 30.10. stehen weiter darin, kein Force-Push.
- [ ] Eine bestehende Konfiguration eines Betreibers wird nie still auf uns umgestellt.
- [ ] Code, Commits, README und Release-Text Englisch, Goal-Datei, `anleitung.md` und `ANNAHMEN.md` Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `.env*`, `*.db`
- `src/**`: unverändert, das Goal ändert den Dienst nicht
- die bestehenden Tests unter `test/`: unverändert
- `ROADMAP.md`, `docs/kette.md`, `docs/richtung/**` und alle bestehenden Vorschläge: nur lesen
- im Fork: Force-Push, Löschen von Branches oder Tags, Ändern der Sichtbarkeit; in `Conway-Research/automaton`: jeder Kommentar, jedes
  Issue und jeder PR
- npm-Veröffentlichung, jede Wallet-Bewegung, jeder Aufruf von Endpunkten der Produktion
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-22 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6, 7 gebaut: Fork-PR matthiashippe/automaton#1 (fünf Commits über `4d2f96f`, mit `--merge` gemergt, Historie erhalten) und Release `v0.2.2-maintained.1` mit Voreinstellung `https://automatonhost.com`, Enter im Setup, Vorrang von `CONWAY_API_URL` und gespeicherter Wahl, `User-Agent: automaton-maintained/<version>`, Fix des Token-Zählers (am Pin hing `context-hardening.test.ts`, `pnpm test` endete nie) und `dist/` im Repo, weil npm 10 und 11 eine Git-Abhängigkeit mit `prepare` global nicht installieren können (`goals/paket/ANNAHMEN.md`); dazu `docs/paket/anleitung.md`, README und ein Vorschlag für die Startseite. Rot vor der Änderung: `default-control-plane.test.ts` 6 von 8 rot (die zwei Vorrang-Tests rot mit gepflanzter Mutation in `loadConfig`), `token-counter-long-runs.test.ts` hing bis zum Timeout, `maintained-user-agent.test.ts` 5 von 5 rot, `dist-in-sync.test.ts` rot ohne `dist/` und mit einer veränderten Datei darin. Prüfbefehle: P1 `gh api …config.ts` -> 1 (Gegenprobe am alten Stand `4d2f96f` -> 0), P1 Klon mit install, build, test -> gruen (73 Dateien, 1682 Tests), P2 -> 2 (Gegenprobe -> 0), P3 -> 0 (Gegenprobe -> 3), P4 `npm install -g … --version` -> 1, P4 `gh release view` -> v0.2.2-maintained.1, P5 -> 1, 2, 2, P6 -> 8 und `anleitung.md:0`, `ANNAHMEN.md:0`, P7 `node scripts/check.mjs` -> Exit 0 (254 Dateien, 2623 Tests); Fork-CI am PR grün auf Node 20 und 22.
- 2026-11-22 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, 7, nach Merge von `dev` (7605368) in den Goal-Branch. Prüfbefehle: P1 `gh api …config.ts` -> 1, P1 Klon mit install, build, test -> gruen, P2 -> 2, P3 -> 0, P4 `npm install -g … --version` -> 1, P4 `gh release view` -> v0.2.2-maintained.1, P5 -> 1, 2, 2, P6 -> 8 und `anleitung.md:0`, `ANNAHMEN.md:0`, P7 `node scripts/check.mjs` -> Exit 0 (254 Dateien, 2623 Tests); der Diff gegen `dev` berührt den Laufzeitpfad nicht (nur README, Doku, Goal-Datei, ANNAHMEN, ein Vorschlag).
- 2026-11-22 Zyklus 3: Punkt 8 gebaut, Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, 7, 8: Beschreibung von `matthiashippe/automaton` nennt jetzt `automatonhost.com` (Englisch, ohne Gedankenstrich), Website-Adresse `https://automatonhost.com`, Sichtbarkeit unverändert PUBLIC; per `gh repo edit --homepage --description`. Prüfbefehle: P8 `gh repo view … -q 'select(…) | "ok"'` vorher leer (rot), nachher `ok`, Gegenprobe mit gepflanztem U+2014 in der Beschreibung -> keine Ausgabe; P1 bis P6 unverändert gegen denselben Tag `v0.2.2-maintained.1` wie in Zyklus 2; P7 `node scripts/check.mjs` -> Exit 0. Job `e2e` am Kopf folgt am PR.
- 2026-11-22 Release: PASS K und B (Zyklus 3), DONE.

## Blockers
