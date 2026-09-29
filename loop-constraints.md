# Loop Constraints

> Bindend für jeden Loop- und Goal-Lauf in diesem Repo. Der `loop-constraints`-Skill und der
> `/goal`-Skill lesen diese Datei zu Beginn jedes Laufs.

## Deploy (Stand 19.09.2026, 21:30, ersetzt die Nacht-Sperre)

Matthias hat ausdrücklich alle Rechte zum Ausrollen gegeben. Die Sperre ist damit aufgehoben,
die Sorgfalt nicht. Seit dem 19.09. um 18:40 UTC hängt ein **zahlender fremder Kunde** am Dienst
(Wallet `0x0629a685…488e`, 5 USDC on-chain). Jeder Deploy trifft ihn, und heute hat er wegen
unserer Deploys bereits zwölf 502er gesehen.

**Vor jedem Deploy, ohne Ausnahme:**
- Nicht `deploy/rollout.sh` direkt aufrufen, sondern **`ops/deploy.sh`**. Es fährt `pnpm test`,
  dann `pnpm e2e`, und rollt nur aus, wenn beides grün ist. Am 22.09.2026 hat ein Zyklus
  "1 failed | 465 passed" gelesen, für die Ausgabe einer gerade gelaufenen Gegenprobe gehalten und
  trotzdem ausgerollt. Der rote Test hielt `docs/bounties.md` gegen das Schema des MCP-Servers.
  Der Deploy war harmlos, aber aus Glück und nicht aus Prüfung. `deploy/rollout.sh` kann das nicht
  selbst tun, weil `deploy/**` nicht ohne Menschen angefasst wird.
- `pnpm test` grün, und bei jeder Änderung am Laufzeitpfad auch `pnpm e2e` grün.
- Der Grund steht in einem Satz: Was wird besser, und für wen? Ein Deploy ohne Antwort darauf
  wartet bis zum Morgen.
- Bei einer Änderung an `deploy/**`: vorher `caddy validate`, und daran denken, dass ein
  Caddyfile-Bind-Mount ein `--force-recreate` braucht (siehe `deploy/README.md`).

**Nach jedem Deploy, ohne Ausnahme:**
- Von außen prüfen: `/health`, `/v1/status`, und dass der Container `healthy` ist.
- `ops/deploy-window.sh` laufen lassen, nicht das Fenster von Hand in eine Abfrage tippen. Es
  nimmt den Startzeitpunkt des Containers als Deploy-Zeitpunkt und sagt getrennt, ob niemand
  betroffen war oder ob es niemanden gab. Am 21.09.2026 hat ein Zyklus 20:25 getippt für einen
  Deploy um 18:25 UTC (die VM läuft auf UTC, der Rechner auf MESZ), fand nichts und schrieb
  "niemand hat etwas gemerkt" ins Protokoll. Das Ergebnis stimmte zufällig, die Prüfung nicht.
- Das Ergebnis in `.scratch/gtm/nachtlauf.md` protokollieren, auch wenn alles gut ging.

## Freigaben von Matthias, 29.09.2026

Er hat an diesem Tag sechs der sieben Sperren selbst aufgehoben, woertlich:

- **"issues darfst du immer selbst"** -- Issue-Antworten gehen ohne Rueckfrage raus. Das Gatter
  (`ops/before-the-answers.py`) und die Tageskappe von drei bleiben, weil sie die Qualitaet und
  nicht die Erlaubnis sichern. Der Satz "keine Aussenwirkung ohne Matthias" weiter unten gilt
  damit nicht mehr fuer Issue-Antworten; fuer einen Artikel oder einen HN-Post bleibt er.
- **"wieso sollte ich was im caddy file schreiben das ist dein job"** -- `deploy/Caddyfile` darf
  der Loop selbst aendern. `caddy validate` davor und `--force-recreate` danach bleiben Pflicht,
  weil es ein Bind-Mount ist. Der Rest von `deploy/**` (systemd, Compose) bleibt gesperrt.
- **"geld immer im dienst arbeiten lassen, klar darf der loop das, immer bitte machen"** -- Geld
  darf im Dienst arbeiten statt herumzuliegen: Topf, Credits, Aufträge, Preise. Bei etwas, das
  nicht zurueckholbar ist, sagt der Loop vorher in einem Satz, was er tut, und tut es dann.
- **"search console bitte in chrome machen"** -- die Anmeldung bei Search Console und Bing macht
  der Loop im Browser mit seinem Profil.
- **"anzeigen sind ja ein klarer business case, da muss ich keine entscheidung treffen, du musst
  das einfach analysieren"** -- keine Zahl von ihm. Der Loop rechnet den Fall und entscheidet
  danach selbst.
- **"wir haben doch schon postyourprice.com gekauft"** -- die Domain steht. Die Namensfrage ist
  damit keine Domainfrage mehr, sondern hoechstens eine Abgrenzung im Text gegen `handsel.dev`.
- **Stripe ueber HTC** (*"warum stripe nicht über HTC machen"*): die Hanseatic Tech Company ist
  Vertragspartner, also keine Gewerbeanmeldung und keine Kleinunternehmerfrage. Was offen bleibt
  und dort auch hingehoert: wer dem Kaeufer die Leistung schuldet, wenn ein Agent liefert.

## Vier Dinge, die nie wieder gefragt werden (29.09.2026, nachmittags)

Matthias hat sie beantwortet und musste sie ein zweites Mal beantworten, weil ein Deck sie erneut
als offene Frage gefuehrt hat. Das ist der Fehler, nicht die Frage. Sie stehen hier, damit kein
Zyklus, kein Deck und kein Schwarm sie noch einmal aufmacht.

1. **Marktplatz oder Verkaeufer ist IMMER die Wahl des Loops.** Woertlich: *"marktplatz oder
   verkäufer ist immer deine wahl!"* Gewaehlt am 29.09.: **Marktplatz.** Der Kaeufer schliesst den
   Vertrag mit dem Agenten, wir stellen Ort, Treuhandgeld und Pruefung und rechnen unsere Provision
   ab, nicht den Auftrag. Begruendung in `.scratch/gtm/stripe-entscheidung.md`. Das gilt bis der
   Loop selbst etwas anderes entscheidet und aufschreibt, warum.
2. **Die Domain ist entschieden.** `postyourprice.com`, von Matthias gekauft. Woertlich: *"domain
   ist doch klar oder nicht, ich habe dir doch extra die postyourprice.com gekauft."* Es gibt keine
   Domainfrage mehr, auch keine als Teil der Namensfrage.
3. **Stripe laeuft ueber HTC, das Konto existiert.** Matthias schickt die Zugaenge. Der Loop baut
   den Kartenweg und fragt nicht nach dem Konto.
4. **Gas wird nachgelegt, nicht besprochen.** Woertlich: *"und GAS mach!!!! Nicht noch einmal
   fragen!!!"* Der Loop beschafft und verwendet Gas auf Base, so wie er Credits verwendet, und
   berichtet es, statt es zur Entscheidung zu machen.

**Die Regel dahinter, und sie ist allgemeiner als diese vier:** eine Frage, die Matthias einmal
beantwortet hat, ist beantwortet. Taucht sie in einem Deck, einem Plan oder einem Schwarm wieder
auf, ist das ein Fehler im Loop und keine offene Entscheidung. Vor jedem Deck mit offenen Fragen
laeuft `ops/sperren.sh`, und was dort nicht offen ist, kommt nicht ins Deck.

**Was trotzdem nicht passiert:**
- Kein Deploy, dessen Nutzen kleiner ist als eine Minute Ausfall für den Kunden. Reine
  Aufräumarbeiten, Kommentare und Dokumentation warten auf das nächste ohnehin fällige Ausrollen.
- Keine zwei Deploys hintereinander ohne dazwischen liegende Prüfung.
- Keine Außenwirkung **außer Issue-Antworten**: kein HN-Post, kein Artikel, keine Nachricht an
  Dritte ohne Matthias. Issue-Antworten sind seit dem 29.09. freigegeben (siehe oben), drei am Tag,
  und nur durch das Gatter.
- Zahlungen und On-Chain-Transaktionen: seit dem 29.09. erlaubt, soweit das Geld im Dienst
  arbeitet (siehe die Freigaben oben). Vorher in einem Satz sagen, was passiert.
  (Alter Stand, zur Herkunft:) Keine Zahlungen und keine On-Chain-Transaktionen. **Geändert am 20.09.2026:** Eine
  SIWE-Signatur mit der Betreiber-Wallet ist erlaubt, ebenso das Bewegen vorhandener Credits
  innerhalb des Dienstes. Grund: Matthias hat die Entscheidungsgewalt an den Loop abgegeben
  ("du entscheidest weiterhin alles"), und der Markt lässt sich ohne einen echten Umlauf nicht
  beweisen. Die Schranke bleibt dort, wo sie etwas schützt: Eine Signatur kostet nichts, läuft
  nicht über die Chain und erzeugt einen Schlüssel, der jederzeit widerrufbar ist. Eine Zahlung
  oder ein Topup über x402 ist weiterhin tabu, weil sie echtes Geld bewegt und nicht rückholbar
  ist. Der private Schlüssel wird nie ausgegeben, nie geloggt und nie committet.

**Wenn der Dienst nach einem Deploy nicht zurückkommt:** autoheal greift nach 90 Sekunden. Erst
wenn er nach fünf Minuten immer noch nicht antwortet, selbst eingreifen, und dann mit dem
kleinstmöglichen Schritt (`docker compose -f docker-compose.prod.yml up -d --force-recreate cp`).
Jeder autoheal-Eingriff kommt ins Protokoll, weil er morgen früh Teil der Entscheidung über den
Artikel ist.

## Push und Merge
- Kein Push auf `main` ohne Ankündigung im Chat. Fertige, geprüfte Goals werden committet
  (Matthias' Commit-Freigabe gilt), Loop-Fixes gehen als Draft-PR.
- Nie Auto-Merge. Nie ein Issue oder einen PR schließen.

## Pfade
- Nie anfassen ohne Menschen: `.env*`, `secrets/**`, `deploy/**` (systemd, Caddy, Compose für die
  VM), `src/payments/**` und `src/auth/**` (nur innerhalb eines Goals, dessen GOAL.md sie nennt).
- Keine Änderungen an `harness/runtime/` (Upstream-Pin), außer die Pin-Revision selbst mit Begründung.

## Code

- **Alles im Code ist Englisch, ausnahmslos:** Bezeichner, Kommentare, Testbeschreibungen,
  Fehlermeldungen, Log-Zeilen, Namen in Fixtures. Deutsch bleibt nur dort, wo nicht Code steht,
  also in Commit-Texten, `.scratch/`, `STATE.md` und `GOAL.md`, weil das Gespräch mit Matthias ist
  und kein Artefakt für Mitlesende. Das Repo ist öffentlich
  (github.com/matthiashippe/control-plane), der Zielmarkt heißt USA und Dubai, und deutscher Code
  schließt jeden Mitlesenden aus. Der Bestand war teilweise deutsch; das ist kein Grund, neues
  Deutsch anzulegen, sondern der Grund für den laufenden Sprachdurchgang. Matthias am 20.09.2026:
  "code immer auf englisch immer immer immer immer".
- **Ein Messwerkzeug gilt erst, wenn es in beide Richtungen bewiesen ist.** Jedes Skript in `ops/`,
  das "niemand war da", "kein Crawler", "null Fehler" oder "alles ok" melden kann, braucht einen
  Schalter, mit dem sich ein gepflanzter Treffer nachweislich durchreichen lässt: `CP_DEPTH_LOG`,
  `CP_VISIBILITY_LOG`, `CP_ERROR_PATTERN`, `CONWAY_PROBE_TIMEOUT`, `CP_WINDOW_NOW`. Ohne diese
  Gegenprobe ist die Null nicht von Blindheit zu unterscheiden. Am 22.09.2026 kostete das an
  einem Nachmittag fünf falsche Zahlen: die Tiefenmessung meldete unseren eigenen curl als ersten Leser, die Crawler-Erkennung
  ließ `meta-externalagent` durch, `errors_24h` suchte ein Wort, das nur im Antwort-Body steht, der
  erste Request einer Adresse war der erste im Fenster, und die Eigen-IP-Liste kannte nur die
  Adresse von jetzt, während das Log Tage umfasst.
- Tests vor jedem Fix-Vorschlag laufen lassen (`pnpm test`, für E2E `pnpm e2e:smoke` / `pnpm e2e`).
- Nie Tests abschalten, skippen oder Assertions abschwächen, um grün zu werden.
- Ein Fix pro Lauf, kein Refactor nebenbei.
- Max 3 Versuche pro Item, dann eskalieren mit Kontext in STATE.md bzw. GOAL.md Blockers.
- Kein Facilitator-Code, der selbst settlet, außerhalb von `harness/` (Regulatorik: kein eigener
  x402-Facilitator im Betrieb).
- Credits sind nie auszahlbar, nie an Dritte übertragbar außer per `/v1/credits/transfer`
  innerhalb des Control Plane. Jede Auszahlbarkeit ist ein REJECT-Grund.

## Kommunikation
- Deutsch, Anti-Slop-Regeln aus `~/.claude/CLAUDE.md` (kein Gedankenstrich, echte Umlaute).
- Nur melden, wenn eine Entscheidung oder Aktion von Matthias gebraucht wird.

## Budget
- 80 % des Tagesbudgets erreicht: report-only.
- `loop-pause-all` in STATE.md: sofort beenden.
