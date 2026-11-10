# LOOP.md: Betriebsordnung des Loops control-plane

Der Loop läuft seit dem 10.11.2026 ganz in der Paperclip-Org auf dem code-host (Projekt „Control Plane“, Maker Engineer CP). Er löst
den lokalen Loop mit `/goal`, `GOAL.md` und „Matthias merged main“ ab (`loop-dauerauftrag.md`, `ORG.md`, `GOAL.md` und die
frühere Fassung dieser Datei sind Geschichte); was davon als Regel weiter gilt, steht in `loop-constraints.md`. Die Mechanik (Kette,
Breaker, Gate, Kill Switch, Human Gates, Stufen) setzt der generische Loop Master des code-host durch; Vertrag und Begriffe stehen in
code-host `docs/paperclip/loops.md`, die Regeln für jede Rolle im Skill `loop-regeln`, die Werte dieses Loops in `loop.yaml` und
`gate.yaml`. Wo diese Datei und der Blueprint sich widersprechen, gilt der Blueprint. Jeder Agent, der hier arbeitet, liest zuerst
diese Datei, dann `loop-constraints.md` (bindend), `ROADMAP.md`, `docs/kette.md`, `STATE.md` und die Goal-Datei seines Issues.

## Produkt in einem Satz

PostYourPrice (`postyourprice.com`) ist ein Conway-kompatibles Control Plane für die Automaton-Runtime
(`Conway-Research/automaton`): Eine unveränderte Runtime stellt nur `conwayApiUrl` um und bekommt Anmeldung per SIWE, Guthaben in
USDC über x402 auf Base und OpenAI-kompatible Inferenz über OpenRouter, abgerechnet auf dem Server (100000 mc = 1 USD, Verkauf zum
Einkaufspreis mal 1,3). Es wirkt, wenn ein Automaton, dessen Anschluss bei Conway mit 500 antwortet, bei uns ohne Änderung
weiterläuft, jede Antwort genau einmal und nur dann bezahlt, wenn sie ankommt, und als Nächstes seinen eigenen Dienst in einer
Sandbox bei uns startet.

## Stand am 10.11.2026

Conway antwortet seit Wochen mit 500, deshalb wechseln Automatons zu uns. Gemessen am 10.11.2026: 6 registrierte Automatons, davon
4 fremde, 8 Zahlungen über zusammen 36 USDC. Ein fremder Automaton hatte 3 Anfragen in seinem Timeout von 60 Sekunden, berechnet
wurden sie trotzdem (zusammen 0,37 USD); derselbe Automaton bekam beim Start eines eigenen Dienstes 501 für Sandboxes und 404 für
Domains. Daraus die erste Kette in `ROADMAP.md`. Matthias hat dazu am 10.11.2026 zwei Dinge entschieden: Sandboxes werden das
nächste Produkt, als PoC auf einem eigenen kleinen Server (etwa 5 Euro im Monat), getrennt vom Zahlungsdienst; und Antworten, die
beim Kunden nicht ankommen, berechnen wir nicht mehr.

## Traction zuerst

Die Kette folgt der Wirkung beim zahlenden Kunden: zuerst die Abrechnung, die ihn heute trifft, dann Sandboxes als nächstes Produkt,
die Domains, die sein Dienst braucht, dann der Kanal, über den weitere Automatons kommen. Jedes Goal nennt in „Kontext für den
Maker“, was danach schneller zu mehr zahlenden fremden Automatons führt.

Wer ein Goal schreibt, einen Done-Punkt ergänzt oder Nacharbeit anlegt, schreibt dazu genau eine Zeile
`MVP: Funktion, weil <was danach funktioniert oder verkauft>` oder `MVP: Schönheit`. Schönheit, Prozessdoku und Prüfwerkzeuge ohne
Messauftrag werden kein Done-Punkt, sondern ein Vorschlag. Abrechnung, Isolation und Kompatibilität sind keine Schönheit.

Eine Fläche der Website, die neu entsteht oder sich sichtbar ändert, baut nach einem SOLL-Bild unter `docs/soll/` (390 und 1440
Pixel); fehlt es, entsteht es im selben Goal als erster Done-Punkt. Endpunkte für Automatons brauchen kein Bild, sie brauchen den
Vertrag der Upstream-Runtime.

## Technik

- Node 22, TypeScript ESM, Hono mit `@hono/node-server`, better-sqlite3, viem, SIWE. Dienst unter `src/`, Unit-Tests mit vitest unter
  `test/**/*.test.ts` (`check` findet jeden von selbst), Messwerkzeuge unter `ops/`, Doku unter `docs/`.
- Geld als ganze Zahl: Millicents (mc) im Ledger, bigint atomare USDC (6 Dezimalen), nie float. Jede Gutschrift und Abbuchung ist eine
  Ledger-Zeile in derselben SQLite-Transaktion wie der Saldo; Idempotenz über den Schlüssel, den der Client liefert oder der Vorgang
  trägt (x402-Nonce, Generation-ID).
- E2E-Harness unter `harness/` (Docker Compose): Anvil mit chainId 8453 und USDC-Mock an der Mainnet-Adresse, das Control Plane
  hinter TLS mit eigener CA, die unveränderte Upstream-Runtime am Pin `d8f8168`, Inferenz über den Mock-Provider. `pnpm e2e` ist der
  komplette Erstlauf (fünf Turns, Ledger stimmt). Der code-host hat kein Docker: `pnpm e2e` läuft auf GitHub-Rechnern, im Job `e2e`
  jedes PR (`check.yml`) und vor jedem Rollout (`deploy.yml`).
- Produktion: Hostinger-VPS `srv1336627` (`76.13.144.207`, ein Kern, 4 GB), Compose unter
  `/opt/control-plane/repo/deploy/docker-compose.prod.yml` mit den Diensten `cp`, `caddy` und `autoheal`, SQLite über
  `CP_DB_PATH=/data/cp.db` im Container `cp`, Secrets in `/opt/control-plane/.env`, Caddy-Zugriffslog im Container `deploy-caddy-1`
  unter `/var/log/caddy/access.log`. Auf dem Server laufen Cron-Läufe aus `ops/` (`crontab -l`), die kein Goal ändert.
- Sandbox-Server: ein eigener kleiner Server für fremden Code (sandbox 01 legt Isolation, Preis und Plan fest, Matthias bestellt ihn,
  sandbox 02 richtet ihn ein). Nie der Zahlungsserver.
- Zugang auf dem code-host: `set -a; . ~/.config/control-plane/loop.env; set +a` setzt `CP_URL`, `CP_HOST`, `CP_DEPLOY_HOST`,
  `CP_VM`, die Schlüsselpfade `CP_DEPLOY_KEY`, `CP_SSH_KEY` und `CP_VM_KEY` (Schlüssel `~/.ssh/id_ed25519_cp_deploy`, der Server lässt
  ihn nur vom code-host zu) und `OPENROUTER_API_KEY` für `ops/status.sh`. Werte nie ausgeben. Mit dem Schlüssel wird gelesen, nie
  geändert (`loop-constraints.md`, Produktion: nur lesen).
- Befehle: `install` und `check` aus `loop.yaml`, `pnpm build`, `pnpm test`, `pnpm dev` (nur mit freiem Port und Mock-Provider),
  `ops/status.sh`, `ops/ziele.sh`, `ops/smoke.sh https://postyourprice.com`, `ops/deploy-window.sh`.

## Arbeitsmodus

- Ein Goal ist eine Datei `goals/<topic>/NN-<slug>.md` im Format des `/goal`-Skills. Der Loop Master startet es mit
  `pc-issue goal-start`: ein Topic „control-plane: <topic> NN“ beim Maker auf `goal/<topic>-<NN>`, bei `verify: goal` genau ein
  Child „<topic> NN: alle Done-Punkte“, danach die Stufen Kritik, Abschluss (K und B) und Release. Ein Goal läuft zur Zeit
  (`parallel_goals: 1`). Die Dateien `goals/20*-goal-*.md` sind abgeschlossene Goals des alten Loops und zählen nicht.
- Folge-Goals schreibt der Tech Lead aus der Spalte Kette in `ROADMAP.md`, wenn der Loop Master ihn beauftragt, als Pflege-PR auf
  `loop/goal/<topic>-<NN>`; die ausführliche Fassung jedes Glieds steht in `docs/kette.md`.
- Ein Run des Makers baut alle offenen Done-Punkte seines Childs, führt jeden Prüfbefehl selbst aus, hakt die erreichten Punkte ab,
  schreibt eine Progress-Log-Zeile `- <Datum> Zyklus <k>: Punkte <Liste> gebaut. Prüfbefehle: <Ergebnis je Befehl>.`, committet,
  pusht und öffnet den PR gegen `dev` als Draft.
- Was ein Goal neu baut, belegt es lokal (vitest, `pnpm dev` auf freiem Port), am Laufzeitpfad zusätzlich mit dem grünen Job `e2e`
  des PR. Eine Zeile mit `(Netz)` gegen die Produktion liest nur und belegt nur, was schon ausgerollt ist; die Live-Prüfung des Neuen
  macht der Release Manager nach dem Deploy.
- Die Linsen arbeiten nach `ops/prompts/verifier.md` und schreiben je Zyklus ein Verdict `goals/<topic>/verdicts/<NN>-z<k>-<Linse>.md`
  auf den Goal-Branch. PASS heißt: K und B schreiben PASS.
- Nachtläufe (Audit, Nacharbeit, Red Team, Triage, Kritik, Drill) sind die generischen Loop-Routinen der Org. Einen Loop-Digest in
  Asana gibt es für diesen Loop nicht.
- Kill Switch: die Zeile `loop-pause-all` ohne Kommentarzeichen in `STATE.md` auf `dev`.

## Fehler echter Nutzer

Ein 4xx oder 5xx im Caddy-Zugriffslog zu einer Adresse, die nicht in `ops/own-ips.txt` steht, und jede Abbuchung, deren Antwort nicht
ankam, schlägt jede andere Arbeit (`loop-constraints.md`, Grundregel 4). Wer ihn findet (Maker beim Hinsehen, Release Manager in der
Live-Prüfung, die nächtliche Triage), legt `goals/_vorschlaege/fehler-<JJJJ-MM-TT>-<n>.md` mit Schwere 5 an: Zeitpunkt in UTC, Pfad,
Status, wie oft, der Befehl, der ihn zeigt, ohne Adresse oder Namen des Kunden. Der Writer hängt ihn beim nächsten Auftrag als Glied an
das Topic `fehler`, das mit Prio 1 vor allen anderen startet.

## Release

Jeder Push auf `dev` fährt `.github/workflows/deploy.yml`:

1. `plan` (GitHub-Rechner): Hat sich seit dem letzten erfolgreichen Deploy der Umgebung `production` der Laufzeitpfad geändert
   (`src/`, `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `harness/cp/`, `deploy/docker-compose.prod.yml`, `deploy/Caddyfile`,
   `deploy/rollout-remote.sh`)? Sonst endet der Lauf grün ohne Rollout; Doku, Goal-Dateien, Verdicts und `ops/` kommen mit dem
   nächsten fälligen Rollout mit, denn jeder Rollout kostet den Kunden rund 16 Sekunden ohne Antwort.
2. `test` und `e2e` (GitHub-Rechner, ohne Secret): `scripts/check.mjs` und `pnpm e2e`.
3. `deploy` (Runner `code-host-control-plane-deploy-1`, Label `control-plane-deploy`, Benutzer `gh-cp-deploy`, Umgebung `production`,
   die nur `dev` bekommt): Schlüssel aus dem Secret der Umgebung nur für die Dauer des Jobs, Drift-Prüfung (jede Datei, die der
   Rollout ersetzen oder löschen würde, steht mit diesem Inhalt in einem Commit; Ausnahmen nur in `deploy/drift-ok.txt`), Log des
   laufenden Containers sichern, `deploy/rollout.sh` (Kanarienvogel gegen eine Kopie der Datenbank, ruhiges Fenster, Rauchtest
   `ops/smoke.sh`), dann `ops/deploy-window.sh`.

Der Release Manager wartet höchstens 30 Minuten auf den grünen Lauf (`gh run list -R matthiashippe/control-plane --workflow
deploy.yml --commit <merge-sha> --json status,conclusion,jobs`) und schreibt in seinen Kommentar, ob ausgerollt wurde (Job `deploy`
gelaufen) oder nicht (Zusammenfassung von `plan`). Dann in einem frischen Worktree von `origin/dev` mit den Variablen aus
`~/.config/control-plane/loop.env` genau einmal die Live-Prüfung: `bash ops/smoke.sh https://postyourprice.com`, dazu
`bash ops/live.sh`, sobald es das gibt (das erste Goal, das eine Wirkung in der Produktion hat, legt es an: abrechnung 01). Ergebnis
als Kommentar auf dem Release-Auftrag. Ist die Live-Prüfung rot, die vorher grün war: Revert-PR des schuldigen Merges gegen `dev`; er
rollt über `deploy.yml` den alten Stand aus. Kein Rollout und kein Neustart von Hand.

Bricht `deploy.yml` ab, ist der Check am Kopf von `dev` rot, und der Loop Master legt beim Maker die Reparatur an. Bei einem Abbruch
der Drift-Prüfung heißt sie: Der Maker liest die genannten Dateien vom Server (nur lesen), bringt den Stand als PR gegen `dev` ins Repo
und macht kenntlich, welcher Teil gilt; der nächste Merge rollt aus. Steht in einer dieser Dateien etwas, das nicht ins öffentliche
Repo darf (`loop-constraints.md`, Grundregel 8), kommt es nicht ins Repo: Der Maker legt einen PR gegen `dev` an, der nur
`deploy/drift-ok.txt` um die blob id und den Pfad ergänzt, mit dem Grund ohne den Inhalt; das Gate gibt ihn in die Human Inbox
(Grund `deny`), und Matthias entscheidet.

### Warum E2E auf GitHub-Rechnern und nicht auf dem Server

`ops/deploy.sh` verlangt vor jedem Deploy `pnpm test` und bei jeder Änderung am Laufzeitpfad `pnpm e2e`, und der Harness braucht
Docker, das der code-host nicht hat. Entschieden am 10.11.2026: `pnpm e2e` läuft vor jedem Rollout auf einem GitHub-Rechner (das
Repo ist öffentlich, die Minuten kosten nichts, der Harness braucht kein Secret). Gemessen am selben Tag auf `ubuntu-latest`:
`E2E OK turns=5 registered=true api_errors=0 ledger_consistent=true` in 72 Sekunden. Nicht auf dem Server, weil er einen Kern hat und
den zahlenden Kunden trägt: drei Images bauen und fünf Turns fahren hätte ihn minutenlang ausgelastet, und ein zweites
Compose-Projekt neben der Produktion ist genau die Nähe, die eine Verwechslung erlaubt. Nicht `--no-e2e`, weil die Regel dann von einer
Begründung abhinge statt vom Lauf. Damit läuft der Harness öfter als vorher (vor jedem Rollout statt bei Laufzeitänderungen), und
`ops/deploy.sh` bleibt das Werkzeug für einen Menschen am eigenen Rechner.

## Kette nachfüllen

Ist die Kette leer, beauftragt der Loop Master den Writer (`refill` in `loop.yaml`). Quellen für diesen Loop, in dieser Reihenfolge:
offene Vorschläge unter `goals/_vorschlaege/` (Schwere 5 zuerst, Fehler echter Nutzer an das Topic `fehler`), der Verkehr der
Produktion (4xx und 5xx fremder Adressen im Caddy-Zugriffslog, Endpunkte der Conway-API, die fremde Runtimes aufrufen und die wir mit
404 oder 501 beantworten, Timeouts je Modell aus dem Ledger), `ZIELE.md` und das Abschlusskriterium in `ROADMAP.md`, neue Issues im
Upstream-Repo mit Anmelde- oder Zahlungsfehlern. Jedes Glied nennt die Messung, die es widerlegen würde.

## Entscheidungsordnung (statt Rückfrage)

1. Goal-Datei, dann `loop-constraints.md`, dann `docs/kette.md` und `ROADMAP.md`.
2. Was ein echter Nutzer gerade sieht, vor allem anderen. Danach, was mehr zahlende fremde Automatons bringt, vor dem, was schöner oder
   vollständiger ist. Eine richtige Abrechnung geht immer vor.
3. Reversibel vor irreversibel, lokal prüfbar vor Netz, Harness vor Produktion, die Antwort der unveränderten Upstream-Runtime vor
   der eigenen Annahme über sie.
4. Widersprechen sich zwei Goal-Dateien, gewinnt das Topic mit der kleineren Prio-Zahl in `ROADMAP.md`.
5. Eine Zahl, die sich nicht gegen die Produktion messen lässt, wird keine Zahl; ein Endpunkt, den die Runtime nicht so aufruft, wird
   nicht gebaut.
6. Gate nach Budget nicht erreicht: `BLOCKED fachlich`, das nächste Goal startet, Merge bei grünem `check`.
7. Vor jeder Karte an Matthias prüfen, ob die Rolle es selbst kann. Art matthias nur für die Human Gates unten, mit `Aufgabe:`,
   `Worum:` und `Empfehlung:` samt fertigem Text oder genauen Klicks.

## Human Gates (bleiben bei Matthias)

Matthias, 02.11.2026: „immer überlegen kannst du die tasks selbst erledigen“. Eine Karte an ihn entsteht nur, wenn wirklich nur er es
kann, und dauert höchstens ein paar Minuten:

- `server_kauf`: jeder Kauf und jede Aufladung (der Sandbox-Server bei Hostinger, OpenRouter-Guthaben, eine Domain). Die Karte nennt
  Anbieter, Produkt, Preis im Monat, die genauen Klicks und was am Ende dastehen muss (etwa IP und Root-Zugang für den Schlüssel des
  code-host).
- `public_post`: jeder Kommentar in einem fremden Repo unter Matthias' GitHub-Konto. Der Maker setzt das Goal auf `BLOCKED matthias`
  mit `Gate: public_post` und legt die fertigen Kommentare unter `## Blockers` ab, je Kommentar Link des Issues und Text, mehrere
  gebündelt; der Tech Lead prüft sie, der Loop Master legt sie auf Matthias' privates Board. Es geht nur raus, was er mit „ok“ oder
  seinem eigenen Haken freigibt, Wort für Wort, über `ops/post-the-answers.py`, höchstens drei am Tag. Kairos Haken zählt nie.
- Passwort, Steuer-, Konto- und Ausweisdaten, Sicherheitseinstellung, SMS-Code, bezahlte Werbung, jede Mail an Dritte
  (`third_party_mail`).

Ohne Karte bleiben gesperrt: Merge nach `main` (geht an den Tech Lead), Wallet-Bewegungen, Überweisungen und Trades (nie, auch nicht
mit Karte), Änderungen an Compose, Cron, `.env` und Datenbank der Produktion außer über `deploy.yml`, Secrets im Repo. Eine Karte hält
nur ihr Goal, die Kette läuft weiter; der Loop Master legt die geprüften Schritte auf Matthias' privates Asana-Board, sonst nirgends
hin.

## Secrets

Schlüssel liegen nur in `~/brain/connectors/secrets.env` auf dem code-host (nur lesen, nie ausgeben), in
`~/.config/control-plane/loop.env` (daraus abgeleitet, 0600) und als Secret `CP_DEPLOY_SSH_KEY` der Umgebung `production` des Repos
(nur der Branch `dev` bekommt es, nur der Job `deploy` liest es). Nie im Repo, in Issues, Kommentaren, Logs oder Verdicts. `check`
braucht keinen Schlüssel.
