# Loop-Regeln für control-plane

Bindend für jede Rolle, jeden Run und jeden Subagent in diesem Repo. Jeder Run liest diese Datei zuerst. Regel 0: Der Loop fragt
nicht, er entscheidet nach `LOOP.md` und arbeitet weiter. Dieselben Verbote stehen als Daten in `gate.yaml`, die Routine
„Loop-Triage“ gleicht beide täglich ab. Ändern darf beide Dateien nur ein Mensch. Seit dem 10.11.2026 löst der Paperclip-Loop den
lokalen Loop ab (`loop-dauerauftrag.md`, `ORG.md`, `GOAL.md`); was von dessen Regeln weiter gilt, steht hier, alles andere dort ist
Geschichte.

## Grundregeln in einem Blick (Matthias, 19.09. bis 10.11.2026)

1. **Kein Deploy ohne grüne Tests** (seit 19.09.2026). Ausgeliefert wird nur über `.github/workflows/deploy.yml` nach einem Merge auf
   `dev`: `check` (Regeln, Build, alle Unit-Tests) und `pnpm e2e` (die unveränderte Upstream-Runtime gegen diesen Stand) grün, dann
   die Drift-Prüfung, dann `deploy/rollout.sh` mit Kanarienvogel, ruhigem Fenster und Rauchtest, danach `ops/deploy-window.sh`. Kein
   Goal und keine Rolle rollt von Hand aus: kein `ops/deploy.sh`, kein `deploy/rollout.sh`, kein `deploy/up.sh`, kein
   `docker compose` auf dem Server. Am 22.09.2026 las ein Zyklus „1 failed | 465 passed“ als Ausgabe einer Gegenprobe und rollte
   trotzdem aus; deshalb steht die Regel im Ablauf und nicht im Kopf.
2. **Der Stand auf dem Server liegt im Repo.** Vor jedem Rollout prüft `deploy.yml`, dass jede Datei, die der Rollout ersetzen oder
   löschen würde, mit genau diesem Inhalt in einem Commit steht. Am 12.10.2026 lag auf dem Server ein Stripe-Stand, der im Repo
   fehlte, und ein Rollout hätte ihn überschrieben. Abweichung heißt: erst ins Repo holen, dann ausrollen (`LOOP.md`, Release).
   Ausnahmen stehen nur in `deploy/drift-ok.txt`, die nur ein Mensch ändert.
3. **Jede Zahl gegen die Produktion gemessen.** Keine Zahl in Goal-Datei, Kommentar, Report oder auf der Seite ohne den Befehl, aus
   dem sie stammt (`ops/status.sh`, `ops/ziele.sh`, Ledger, Caddy-Zugriffslog), nie aus einer Datei oder aus der Erinnerung. Ein
   Messwerkzeug gilt erst, wenn es in beide Richtungen bewiesen ist: Ein Schalter reicht einen gepflanzten Treffer nachweislich durch
   (`CP_DEPTH_LOG`, `CP_VISIBILITY_LOG`, `CP_ERROR_PATTERN`, `CONWAY_PROBE_TIMEOUT`, `CP_WINDOW_NOW`), denn ohne Gegenprobe ist die
   Null nicht von Blindheit zu unterscheiden (22.09.2026: fünf falsche Zahlen an einem Nachmittag).
4. **Ein Fehler eines echten Nutzers geht vor.** Gemeint ist ein 4xx oder 5xx im Caddy-Zugriffslog zu einer Adresse, die nicht in
   `ops/own-ips.txt` steht, und jede Abbuchung, deren Antwort den Kunden nicht erreicht hat. Er wird ein Glied des Topics `fehler`
   (Prio 1, `LOOP.md`, Fehler echter Nutzer). Alles andere, was beim Hinsehen auffällt, wird ein Vorschlag mit seiner Schwere und
   wartet, auch wenn es in zehn Minuten behoben wäre (23.09.2026: vierzehn Zyklen Reparatur ohne einen echten Nutzer).
5. **Der Kunde geht vor.** Seit dem 19.09.2026 zahlen fremde Kunden, und jeder Rollout kostet sie rund 16 Sekunden ohne Antwort.
   Deshalb rollt `deploy.yml` nur aus, wenn sich der Laufzeitpfad geändert hat, und es läuft ein Goal zur Zeit. Antwortet der Dienst
   nach einem Rollout nicht, greift autoheal nach 90 Sekunden; danach hilft nur ein Revert-PR über `deploy.yml`.
6. **Antworten, die beim Kunden nicht ankommen, berechnen wir nicht** (Matthias, 10.11.2026). Bricht der Client vor der fertigen
   Antwort ab, gibt es keine Abbuchung. Was schon so berechnet wurde, kommt als interne Gutschrift auf das Guthaben zurück, eine
   Ledger-Zeile, nie eine Überweisung.
7. **Sandboxes sind das nächste Produkt** (Matthias, 10.11.2026), als PoC auf einem eigenen kleinen Server, getrennt vom
   Zahlungsdienst. Fremder Code der Kunden läuft nie auf dem Zahlungsserver (`76.13.144.207`), auch nicht zum Testen. Den Server
   bestellt Matthias (Human Gate `server_kauf`).
8. **Öffentliches Repo.** Das Repo ist öffentlich. Nie hinein, auch nicht in Commits, PRs, Issues oder Verdicts: Secrets und
   Schlüssel, Namen oder Wallet-Adressen einzelner Kunden, Umsatz je Kunde. Summen (Zahl der Automatons, Zahl und Summe der Zahlungen)
   sind in Ordnung. Zum Verkauf der Inferenz über OpenRouter steht im Repo genau ein Satz: Matthias' Entscheidung vom 30.10.2026,
   Notschalter `CP_OPENROUTER_RESALE=0` in `/opt/control-plane/.env`. Mehr schreibt keine Rolle dazu, und keine Rolle macht die
   Entscheidung wieder auf. `check` meldet Secrets und Texte über die Bedingungen des Anbieters.
9. **Selbst erledigen** (Matthias, 02.11.2026: „immer überlegen kannst du die tasks selbst erledigen“). Eine Karte an Matthias
   entsteht nur, wenn wirklich nur er es kann; sie dauert höchstens ein paar Minuten und nennt Zweck, genaue Klicks oder fertigen Text
   und Empfehlung. Die Gates stehen in `LOOP.md` (Human Gates): `server_kauf` für jeden Kauf und jede Aufladung, `public_post` für
   jeden Kommentar in einem fremden Repo unter Matthias' GitHub-Konto (nur nach seinem „ok“ oder seinem eigenen Haken, Kairos Haken
   zählt nie; die Freigabe „issues darfst du immer selbst“ vom 29.09.2026 gilt seit dem 10.11.2026 nicht mehr), dazu Passwort,
   Steuer-, Konto- und Ausweisdaten, Sicherheitseinstellung, SMS-Code, bezahlte Werbung und jede Mail an Dritte. Alles andere erledigt
   die Rolle selbst und meldet es höchstens danach im Progress Log.
10. **Geld bewegt sich nicht** (Matthias, 10.11.2026). Keine Wallet-Bewegung, keine Überweisung, kein Trade, kein On-Chain-Senden,
    nie, auch kein Gas und kein Topup über x402; die Freigaben vom 29.09.2026 zu Gas und zu „Geld im Dienst arbeiten lassen“ gelten
    im Paperclip-Loop nicht. Credits sind nie auszahlbar und nie an Dritte übertragbar außer per `/v1/credits/transfer` innerhalb des
    Control Plane; jede Auszahlbarkeit ist ein REJECT-Grund. Kein Facilitator-Code, der selbst settlet, außerhalb von `harness/`.
    Der private Schlüssel der Betreiber-Wallet wird nie gelesen, ausgegeben, geloggt oder committet.
11. **Kein Claude und kein Anthropic im Produkt.** In der Inferenz-Auswahl, in den Aliasen, in Vorschlägen und auf der Seite nie ein
    Claude- oder Anthropic-Modell; im Produkt nie ein `ANTHROPIC_API_KEY` und keine Anthropic-API (Standing Rule 29.09.2026). `check`
    prüft es.
12. **Code Englisch, ausnahmslos** (Matthias, 20.09.2026: „code immer auf englisch immer immer immer immer“): Bezeichner, Kommentare,
    Testnamen, Fehlermeldungen, Log-Zeilen, Namen in Fixtures. Deutsch in Goal-Dateien, Doku für Matthias, `STATE.md` und
    Commit-Texten. Kein Gedankenstrich (U+2013, U+2014) in keinem Text.
13. **Conway-kompatibel bleiben.** Der Upstream-Pin `d8f8168` von `Conway-Research/automaton` ist die Referenz, `harness/runtime/`
    ändert kein Goal. Ein Endpunkt gilt erst als gebaut, wenn die unveränderte Runtime ihn im Harness aufruft und bekommt, was sie
    erwartet.

## Produktion: nur lesen

- Zugang nur vom code-host: `set -a; . ~/.config/control-plane/loop.env; set +a`, dann `ssh -i "$CP_SSH_KEY" "$CP_HOST"`. Erlaubt ist
  Lesen: Logs (`docker logs deploy-cp-1`, das Caddy-Zugriffslog in `deploy-caddy-1`), `docker ps`, `docker inspect`, Abfragen der
  Datenbank mit `readonly: true` über `docker exec deploy-cp-1 node -e …`, `ops/status.sh`, `crontab -l`.
- Nie von Hand: Rollout, Neustart, `docker compose`, Änderung an Compose, Cron, `/opt/control-plane/.env`, an Dateien unter
  `/opt/control-plane/repo` oder an der Datenbank. Jede Änderung der Produktion, auch eine Gutschrift, ist Code im Repo, der über
  `deploy.yml` ausrollt.
- Die Cron-Läufe auf dem Server ändert kein Goal; `ops/conway-series.sh` und `ops/conway-money-series.sh` (04:50 und 05:00) stehen
  auf der Deny List.
- Der Server hat einen Kern und 4 GB: kein Build, kein Test, kein Harness und kein Lastversuch auf ihm.

## Ablauf im Loop

- Die bauende Rolle sagt nie selbst fertig. Ein Goal ist erledigt, wenn die Linsen K (QA Skeptiker) und B (QA Scope) mit frischem
  Kontext PASS schreiben (`ops/prompts/verifier.md`, Vorgabe REJECT). Der Maker setzt nie PASS oder DONE.
- Ein erreichtes Goal zieht sofort das nächste: Die Kette steht in `ROADMAP.md`, die ausführliche Fassung jedes Glieds in
  `docs/kette.md`, der Loop Master startet ohne Rückfrage, fehlende Goal-Dateien schreibt der Tech Lead. Die Kette läuft nie leer
  (Nachfüllregel in `loop.yaml`).
- Ausgeliefert wird nur über den Merge: `deploy.yml` bei jedem Push auf `dev`, danach prüft der Release Manager live.
- Eine Frage, die Matthias einmal beantwortet hat, ist beantwortet (29.09.2026). Taucht sie wieder auf, ist das ein Fehler im Loop und
  keine offene Entscheidung. Beantwortet sind unter anderem: Verkäufer oder Marktplatz entscheidet der Loop; die Domain ist
  `postyourprice.com`; Inferenz wird über OpenRouter verkauft (30.10.2026); Sandboxes sind das nächste Produkt auf eigenem Server
  (10.11.2026); nicht angekommene Antworten berechnen wir nicht (10.11.2026).

## Deny List (nie anfassen, nie committen)

- `.env*`, `*.pem`, `*.key`, `*.db`, `secrets/`, `.scratch/`; Schlüssel nie ins Repo, in Logs, Issues oder Kommentare
- der Loop-Vertrag: `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, die Prüfmaschine
  `scripts/check.mjs`
- der Betrieb: `deploy/docker-compose.prod.yml`, `deploy/rollout.sh`, `deploy/rollout-remote.sh`, `deploy/up.sh`,
  `deploy/setup-vm.sh`, `deploy/drift-ok.txt`. `deploy/Caddyfile` ändert der Loop selbst (Matthias, 29.09.2026: „wieso sollte ich was
  im caddy file schreiben das ist dein job“), mit `caddy validate` als Prüfbefehl und dem Bind-Mount aus `deploy/README.md` im Blick
- `ops/conway-series.sh`, `ops/conway-money-series.sh` und der Upstream-Pin `harness/runtime/**`
- `src/payments/**` und `src/auth/**` nur in einem Goal, dessen Goal-Datei sie nennt
- Ports `3100`, `8081`, `8180`, `8190`, `3200` auf jedem Host: nie binden, nie beenden; kein Test bindet einen festen Port
- `~/work/control-plane` auf dem code-host (ein fremder Checkout) und die Repos, Runner und Schlüssel anderer Loops: nur lesen
- `~/brain` wird nie geschrieben

## Verboten

- `git push --force` auf `dev` oder `main`, ein Push direkt auf `dev`, ein Merge nach `main` außer durch den Tech Lead
- Tests abschalten, `skip`, `only`, auskommentierte Assertions, gesenkte Schwellen, Mocks an der Stelle, die ein Done-Punkt prüft
- Käufe, Aufladungen, Wallet-Bewegungen; die Sichtbarkeit des Repos ändern; ein Issue oder PR in einem fremden Repo kommentieren oder
  schließen ohne freigegebenes `public_post`
- Daten löschen außerhalb von Fixtures und temporären Ordnern
- `git add -A` (19.09.2026: fremde, halbfertige Dateien unter falscher Commit-Message); Dateien beim Namen nennen. Commit-Texte über
  ein Heredoc mit `<<'EOF'` (20.09.2026: die Shell verschluckte Code mitten in der Message)

## Budget und Qualität

- Pro Goal höchstens `cycles_per_goal` Zyklen ohne PASS, dann `BLOCKED fachlich` mit „Ehrliche Lücken“
- Modell Opus für Maker, Linsen und Kritik; Subagents Opus 5.5, nie Fable
- Jeder Done-Punkt hat einen Prüfbefehl, der ohne Netz läuft oder `(Netz)` trägt; Temp-Dateien nur per `mktemp`
- Ein Test, der ohne den zugehörigen Fix grün bleibt, ist kein Test: Jeder neue Test eines Goals war einmal rot, und die Zeile im
  Progress Log sagt, womit
