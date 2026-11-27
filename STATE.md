# STATE.md: Lage des Loops

Diese Datei schreibt nur die Routine „Loop-Triage“ (Delivery Manager, täglich 06:00) über einen Pflege-PR auf
`loop/triage/<JJJJ-MM-TT>`. Goal-Runs schreiben nicht hierher, sondern in ihre Goal-Datei und `goals/<topic>/ANNAHMEN.md`. Die Lage
des alten Loops bis zum 10.11.2026 steht unverändert in `docs/state-bis-2026-11-10.md`.

## Steuerung

<!-- Kill Switch: steht die nächste Zeile ohne Kommentarzeichen hier, startet nichts Neues (Stufe L1). Setzen und entfernen nur Menschen. -->
<!-- loop-pause-all -->

## Lage

Stand 27.11.2026, 06:15 Berliner Zeit (Loop-Triage, PRO-31345, `origin/dev` 06726e0). Stufe L3, Kill Switch aus, Budget core (2
von 11 Konten mit mindestens 20 % Weekly-Rest), 7 von 20 Plätzen frei, Drill grün (21.11., Gate-Hash e291578e5235). Ein Goal
gleichzeitig; seit 22.11. wechseln sich karte und Traction ab (kunden, kanal, seite, reichweite, werbung), Matthias: „ein goal bitte
nur, dafür bitte abwechseln, immer eins traction dazwischen“. Kurs-Check vom 26.11., 22:10 (PRO-30931): auf Kurs (Detail-Anteil 0 %,
7 Stunden seit dem letzten gemergten Goal mit Prio 1 oder 2, Schwelle 12). Der Richtungs-Check vom 26.11. (PRO-30661, PR #456,
`docs/richtung/2026-11-26.md`) urteilte abgedriftet, weil das Abschlusskriterium in `ROADMAP.md` seit dem 21.11. erfüllt ist und die
Kette weiter maß, statt die Runtimes an der 402 abzuholen; er brachte kunden 15 und 16 in die Kette und legte kanal 09 still. Die Wache meldete
am 26.11. zweimal Überlast (08:20 bis 10:00, 10:50 bis 18:10; PRO-30419 bis PRO-30736 an den Tech Lead), seit 18:10 ist sie vorbei.

Seit der letzten Triage gemergt: kunden 14 (PR #451, Ergebnis `kein Hausauftrag`), regeln 03 (PR #455, auf 8453 gehen `payout` und
`retire` nur an die eigene Weiterleitung), kunden 15 (PR #458, Kartenzeile im Release der gepflegten Runtime, Kartenbesuche gezählt)
und kunden 16 (PR #460, Ergebnis `kein Geld`, kein Fehler bei uns), die Goal-Dateien dazu (#457, #459), die Triage-Glieder vom 26.11.
(#453), die Kritik vom 26.11. (#454, zwei Vorschläge), der Richtungs-Check (#456), die Nacharbeit vom 26.11. (#450, 6 Vorschläge) und
vom 27.11. (#461, 4 Vorschläge), das Red Team vom 27.11. (#462, ein Vorschlag mit Schwere 5) und die Triage vom 26.11. (#452). Damit ist
PRO-30347 erledigt: karte 03 entfällt, ersetzt durch karte 04 (`ROADMAP.md` Zeile 15, Goal-Datei mit `Werbung ab:`), kanal 06 entfällt,
ersetzt durch kanal 09 (Zeile 29), regeln 03 ist gemergt.

Es baut kein Goal. Laut Wechsel ist karte dran, karte 04 startet frühestens 30.11., paket 02 am 07.12.; das Topic `fehler` behält
seinen Platz außerhalb des Wechsels. Neue Glieder gehen an den Tech Lead (PRO-31352, Priorität medium), darunter drei mit Schwere 5:
Beträge des einen Sandbox-Kunden im öffentlichen Repo (Grundregel 8), fünf 404 `model_not_found` eines fremden Kunden am 21.11. als
Glied an `fehler` (Grundregel 4), und die Frage, ob die Kette kunden nach kunden 14 am Hausauftrag weiterbaut (Schwere 5 nach Datei,
der Richtungs-Check empfiehlt Verwerfen).

Audits: Das letzte gemergte ist das vom 25.11. (80 rote Zeilen, Reparatur PR #446); der Loop Master meldet zwei rote Audits in Folge
(24.11. und 25.11.), die roten Zeilen repariert der Loop. Für den 26.11. und den 27.11. gibt es weder einen Branch `loop/audit/…` noch
einen PR. Nacharbeit und Red Team vom 27.11. sind gemergt und in dieser Triage entschieden.

Guthaben beim Inferenz-Anbieter: Die Aufladung ist seit 12.11., 21:35 eingeschaltet (16 USD Schwelle, 25 USD Betrag,
`docs/betrieb/guthaben.md`). betrieb 07 ruht seit der Kritik vom 25.11., weil der Rest (30,86 USD am 20.11. bei 1 USD am Tag) im
festen Fenster nie unter die Schwelle fällt; bis dahin deckt der Alarm `CREDIT RUNWAY LOW` den leeren Saldo.

Entscheidung 30.10.2026: Inferenz wird wieder über OpenRouter verkauft, Matthias' Entscheidung. Notschalter:
`CP_OPENROUTER_RESALE=0` in `/opt/control-plane/.env`, danach Neustart des Containers.

Entscheidungen 10.11.2026 (Matthias): Sandboxes sind das nächste Produkt, als PoC auf einem eigenen kleinen Server, getrennt vom
Zahlungsdienst. Antworten, die beim Kunden nicht ankommen, berechnen wir nicht mehr. 12.11.2026: Neue zahlende Kunden und alles, was
die zahlenden hält, haben Vorrang (Topic betrieb). 13.11.2026: Fast track für sandbox, konto und relay; Regel 10 erlaubt on-chain nur
auf Base Sepolia im Topic konto. 17.11.2026: Nach außen heißt das Angebot Automatons, der Dienst zieht auf `automatonhost.com` um
(Topic umzug); Regel 10 erlaubt auf Base (chainId 8453) nur die Geldwege von konto 05, eingeschaltet allein mit `CP_KONTO_MAINNET=1`,
das nur Matthias setzt.

18.11.2026: kleine Flamme, PropertyPilot braucht die Kapazität (ein Goal, `share: 1`); kein PR an die Public Suffix List, den Schutz
gegen Cookies über Sandbox-Grenzen baut sandbox 12 im eigenen Proxy (gemergt, PR #295). 22.11.2026: kein Zugang bei MoonPay, konto 15
ruht, bis ein anderer Weg für die Karte feststeht; Kommentare in fremden Repos gibt der Tech Lead frei (`public_post` ist kein Human
Gate mehr); Guthaben per Karte über Digistore24 im Konto von HTC.

## Topics

| Topic | Goal | Status |
|---|---|---|
| fehler | 01 bis 10 | DONE (08 PR #120, 09 PR #139, 10 PR #154) |
| fehler | 11 Der Abgleich mit dem Fetcher-Cache läuft auch in CI | PAUSED (Kurs-Check 14.11., reine Testnacharbeit) |
| fehler | 12 /docs und /pricing antworten | DONE (PR #414) |
| fehler | 13 /pricing sagt bei Sunset dasselbe wie /llms.txt | DONE (PR #441) |
| fehler | nächstes Glied | beim Tech Lead (PRO-31352 Glied 2, Schwere 5): fünf 404 `model_not_found` eines fremden Kunden am 21.11., das Modell fehlt im Log |
| wache | 01 Notschalter für die Karte, 02 Kein toter Knopf zur Kasse, 03 Der Notschalter hält auch die direkt aufgerufene Kasse | DONE (01 PR #395, 02 PR #407, 03 PR #426) |
| karte | 01 Guthaben per Karte, 02 Der Weg zur Kasse | DONE (01 PR #369, 02 PR #378) |
| karte | 03 Kauft jemand per Karte, und denkt sein Automaton danach? | in `ROADMAP.md` entfällt, ersetzt durch 04 (PRO-30347, PR #453); die Datei steht auf dev noch auf PLANNED |
| karte | 04 Kauft jemand per Karte, vor und nach werbung 01 getrennt | PLANNED, startet frühestens 30.11.2026 (PR #453) |
| werbung | 01 Karte zuerst, überall, 02 Empfehlen uns Agenten?, 03 Die Agenten-Probe läuft jede Woche und zählt sauber | DONE (01 PR #397, 02 PR #408, 03 PR #429); den Wochenlauf fährt der Richtungs-Check (PRO-29405) |
| werbung | 04 Die Zeile der Woche kommt durch das Gate | DONE (PR #443) |
| regeln | 01 Grundregel 10 hält im Code | DONE (PR #430) |
| regeln | 02 Auf 8453 prüft das Anlegen der Weiterleitung auch die Argumente | DONE (PR #444) |
| regeln | 03 Auf 8453 gehen `payout` und `retire` nur an eine eigene Weiterleitung | DONE (PR #455) |
| kunden | 01 bis 08 | DONE (01 PR #303, 02 PR #306, 03 PR #308, 04 PR #310, 05 PR #316, 06 PR #317, 07 PR #319, 08 PR #329) |
| kunden | 09 Gutschriften je Auslöser, 10 Startgutschrift bei neuem Runtime-Pin | PAUSED (Kurs-Check 21.11., PR #327) |
| kunden | 11 Kunde 1 kann Arbeit einreichen | DONE (PR #357): Hausauftrag des Dienstes, 25 Cent je gültigem Bericht |
| kunden | 12 Reicht Kunde 1 ein, und zahlt er danach wieder? | PAUSED (Tech Lead 23.11., PRO-28123), abgelöst durch 14 |
| kunden | 13 Kunde 1 hat Guthaben für die Schritte bis zum ersten Bericht | DONE (PR #401) |
| kunden | 14 Denkt Kunde 1 mit dem Schrittguthaben, reicht er ein, und zahlt er danach wieder? | DONE (PR #451), Ergebnis `kein Hausauftrag`; wie es am Hausauftrag weitergeht, entscheidet der Tech Lead (PRO-31352 Glied 3) |
| kunden | 15 Der Mensch hinter einer Runtime ohne Guthaben sieht den Weg per Karte | DONE (PR #458) |
| kunden | 16 Warum der erste Sandbox-Kunde aufhört (Titel hier ohne den Betrag, kunden-redteam-2026-11-27-1) | DONE (PR #460), Ergebnis `kein Geld` |
| reichweite | 01 Eine Seite je Fehlermeldung, 02 Unsere Kommentare zeigen auf die passende Seite | DONE (01 PR #375, 02 PR #393) |
| reichweite | 03 Ein Video zeigt den Umzug | DONE (PR #409) |
| reichweite | 04 Unsere Kommentare nennen automatonhost.com beim Namen | DONE (PR #424) |
| reichweite | 05 Unsere Kommentare folgen dem Notschalter der Karte | DONE (PR #442) |
| paket | 01 Die Runtime kommt mit unserer Adresse | DONE (PR #381) |
| paket | 02 Was das Paket gebracht hat | PLANNED, startet frühestens 07.12.2026 |
| betrieb | 01 bis 04 | DONE (03 PR #79, 04 PR #96) |
| betrieb | 05 Die Aufladung beim Inferenz-Anbieter ist belegt und bleibt passend | PAUSED, ersetzt durch 07 |
| betrieb | 06 Ein Rückweg auf das alte Image verträgt die Migration | DONE (PR #361) |
| betrieb | 07 Die Nachmessung der Aufladung nach 14 Tagen | PAUSED (Loop-Kritik 25.11.: das feste Fenster kann die Aufladung nicht belegen) |
| sandbox | 01 bis 05 | DONE (05 PR #62) |
| sandbox | 06 Freigegebene Ports unter einer eigenen Domain | DONE als Altlast, überholt durch 07 (PR #427) |
| sandbox | 07 bis 10 | DONE (07 PR #100, 08 PR #197, 09 PR #210, 10 PR #213) |
| sandbox | 11 Die Sandbox-Domain kommt auf die Public Suffix List | DONE als Altlast, überholt durch 12 (PR #428); Matthias gibt keinen PR an die PSL frei |
| sandbox | 12 Ein Cookie bleibt in seiner Sandbox | DONE (PR #295) |
| konto | 01 bis 14 | DONE (05 PR #220, 06 PR #247, 07 PR #251, 08 PR #257, 09 PR #261, 10 PR #264, 11 PR #269, 12 PR #276, 13 PR #286, 14 PR #297) |
| konto | 15 Das Konto ist in der Produktion an | PAUSED (Matthias 22.11.: kein Zugang bei MoonPay, ruht, PR #363); Goal-PR #302 offen |
| konto | 16 Ausgezahlt wird erst nach der Freigabe für SEPA | PAUSED (Tech Lead 23.11., PRO-28123): hängt an konto 15, PR #368 geschlossen, Branch bleibt |
| konto | 17 | Glied in `ROADMAP.md`, Datei fehlt; hängt an konto 15 |
| konto | 18 Die Bereitschaftsprüfung unterscheidet Dienst unten von Schlüssel fehlt | PAUSED (Loop-Kritik 20.11., konto-kritik-2026-11-20-1) |
| hosting | 01, 02 | DONE (01 PR #230, 02 PR #240) |
| hosting | 03 Die Selbsttests im Sandbox-Weg laufen in `check` | PAUSED (Kurs-Check 17.11., PR #248) |
| hosting | 04 bis 07 | DONE (04 PR #338, 05 PR #343, 06 PR #346, 07 PR #350) |
| umzug | 01 bis 04 | DONE (01 PR #244, 02 PR #252, 03 PR #268, 04 PR #280) |
| umzug | 05 Der Selbsttest der Website-DNS räumt auf | PAUSED (Kurs-Check 19.11.) |
| relay | 01 bis 03 | DONE (02 PR #113, 03 PR #131) |
| relay | 04 Antworten an Konten ohne Wallet nur bei Bedarf | PAUSED (Kurs-Check 19.11.: 0 Nachrichten über das Relay seit relay 02) |
| anmeldung | 01 bis 05 | DONE (03 PR #194, 04 PR #203, 05 PR #259) |
| abrechnung | 01 bis 05 | DONE (05 PR #266) |
| abrechnung | 06 Der Zeitraum der Quote stimmt | PAUSED (Loop-Kritik 19.11., abrechnung-kritik-2026-11-19-1) |
| abrechnung | 07 Antwortquote neben der Timeout-Quote | DONE (PR #334) |
| domains | 01 bis 06 | DONE (04 PR #116, 05 PR #132, 06 PR #155) |
| domains | 07 Ein Neustart des Sandbox-Servers sperrt keinen Kunden aus | PAUSED (Kurs-Check 15.11., PR #186) |
| kanal | 01 bis 04 | DONE (04 PR #106); Urteil über den Ertrag am 25.11. (`goals/kanal/ertrag.md`) |
| kanal | 05 Urteil je Antwort | PAUSED, in `ROADMAP.md` entfällt, ersetzt durch 06 |
| kanal | 06 Urteil je Antwort und eine neue Runde nur mit neuen Issues | PAUSED, in `ROADMAP.md` entfällt, ersetzt durch 09 (PRO-30347, PR #453) |
| kanal | 07 Der Tech Lead liest genau den Text, über den der Wert gerechnet ist, 08 Gepostet wird der freigegebene Text aus dem Speicher | PAUSED (Kurs-Check 25.11. und 26.11.: Detail-Goals am Kommentarweg in Conway-Research/automaton, dort seit 11.11. kein neues Issue); laufen nur, wenn kanal 09 `Nächste Runde: weitere Kommentare` schreibt |
| kanal | 09 Bringen unsere Kommentare in den Conway-Threads Anmeldungen, je Thread? | PAUSED (Richtungs-Check 26.11., PR #456: 0 Ankünfte von github.com/Conway-Research vom 19. bis 26.11.); zurück auf PLANNED bei einem neuen Onboarding-Issue |
| seite | 01 bis 03 | DONE (03 PR #222) |
| adressen | 01 bis 03 | DONE (01 PR #118, 02 PR #161, 03 PR #224) |
| messung | 01 bis 10 | DONE (07 PR #184, 08 PR #205, 09 PR #216, 10 PR #223) |
| messung | 11, 12 | PAUSED (Kurs-Check 17.11., PRO-23529) |
| messung | 13, 14 | PAUSED (Goal-Dateien PR #332, #342) |

## Human Inbox

- Keine PR mit Kommentar „Human Inbox“ offen (`gh pr list --search "Human Inbox in:comments"` leer), kein offenes Human Gate
  (`loop-master status`: Offene Gates keine).
- konto 15 ruht nach Matthias' Entscheidung vom 22.11. (kein Zugang bei MoonPay); die Asana-Aufgabe zum Gate `security_settings`
  (1220710009513649) wartet, bis ein anderer Weg für die Karte feststeht. Goal-PR #302 bleibt offen.
- Ohne Merge-Auftrag, mergen kann nur ein Mensch: Kritik-PRs #260 (anmeldung 05), #296 (sandbox 12), #339 (hosting 04), #347
  (hosting 06), #383 (karte 02, Freigabe verfolgen), Nacharbeit-PR #336 und Audit-PR #321; ihre Köpfe stammen laut Loop Master aus
  keinem Lauf der zuständigen Rolle. Dazu PR #326 (`goals/sandbox/ANNAHMEN.md`, Tech Lead, Grund `branch`).
- Der Richtungs-Check vom 26.11. legt Matthias drei Entscheidungen vor (`docs/richtung/2026-11-26.md`, Abschnitt „Entscheidungen für
  Matthias“): ein neues Abschlusskriterium, weil das alte seit dem 21.11. erfüllt ist (Frist vor dem nächsten Richtungs-Check am
  03.12.), eine höhere Startgutschrift für die gepflegte Runtime und Sandboxes nicht mehr als nächstes Produkt. Die Human Inbox dieses
  Loops ist der Tech Lead.
- Aus kunden-redteam-2026-11-27-1 (Schwere 5) brauchen einen Menschen: Goal-Datei und Dateiname von kunden 16 (DONE), die Prüfung der
  Linse B auf ganze Beträge (`ops/prompts/**`, Deny List) und ob die Git-Historie bereinigt wird (wie am 19.11., `goals/RISIKEN.md:9`);
  die Vorlage dazu schreibt der Tech Lead (PRO-31352 Glied 1).
- Gate-Abgleich: `gate.yaml` (3f1ac20, 14.11.) und `loop-constraints.md` (7eb842e, 24.11.) seit der letzten Triage unverändert. Jede
  Pfadregel der Deny List hat ihren Eintrag in `deny_paths`, `src/payments/**` und `src/auth/**` prüft wie bisher Linse B gegen die
  Goal-Datei. Kein neuer Vorschlag.

## Watch List

- Schwere 5, Grundregel 8 (kunden-redteam-2026-11-27-1, PRO-31352 Glied 1): Zahl und Höhe der Aufladungen des einen Sandbox-Kunden
  stehen auf dev im öffentlichen Repo (`docs/kunden/sandbox-kunde-2026-11.md:151`, weitere Fundstellen im Vorschlag ohne Betrag);
  Goal-Datei und Dateiname von kunden 16 (DONE), die Prüfung der Linse B und die Git-Historie ändert nur ein Mensch. Dieser Text
  nennt deshalb keinen Betrag.
- Schwere 5, Grundregel 4 (fehler-2026-11-26-1, PRO-31352 Glied 2): fünf 404 `model_not_found` eines fremden Kunden am 21.11.,
  welches Modell er wollte, steht nirgends mehr, weil das Log des Dienstes am 26.11. um 08:27 UTC neu beginnt
- Schwere 5 nach Datei (kunden-kritik-2026-11-26-1, PRO-31352 Glied 3): bricht laut kunden-kritik-2026-11-26-3 keine Regel, der
  Richtungs-Check empfiehlt Verwerfen (`docs/richtung/2026-11-26.md:134`); ob die Kette kunden am Hausauftrag weiterbaut, entscheidet
  der Tech Lead
- `goals/karte/03-kauft-jemand-per-karte.md` steht auf PLANNED, obwohl `ROADMAP.md` Zeile 15 sie als entfallen führt und sagt, die
  Loop-Kritik setze sie auf PAUSED; der Loop Master führt nur karte 04 als wartend
- Der Loop Master meldet `ROADMAP.md` Zeile 29 (kanal) mit 6 statt 5 Spalten, ein `|` im Text schneidet die Zeile ab; ändern kann
  das ein Pflege-PR `roadmap` des Writers
- Kein Audit vom 26.11. und 27.11.: weder ein Branch `loop/audit/2026-11-26` oder `-27` noch ein PR; das letzte gemergte ist das vom
  25.11.
- `loop-constraints.md:127` bindet Opus für Maker, Linsen und Kritik, Linse B (`qa-scope`) läuft weiter auf Sonnet
  (`paperclip/company/.paperclip.yaml:288` im code-host). Angleichen oder zurückstellen kann nur Matthias
  (loop-redteam-2026-11-17-1).
- `ops/customer-decline.sh` zählt eigene Läufe, deren Adresse nicht in `ops/own-ips.txt` steht, unter `OTHER` als fremd; `OTHER 2xx`
  ist bis zur nächsten Arbeit am Werkzeug keine fremde Nachfrage (kunden-kritik-2026-11-19-2)
- `runtime_funnel` in `ops/db-report.cjs` mischt reife und junge Kohorten, eine Runtime vom Vortag zählt bei `paid` als Verlust; Teil
  des Glieds, das die Stufe `paid` angeht (kunden-kritik-2026-11-19-4)
- Die Ankünfte in `ops/traffic.sh` sind zu 97 % ohne Referrer, also vor allem Maschinen; wer einen Kanal an Ankünften misst, zählt
  Personen (kunden-kritik-2026-11-19-5)
- Die eigenen Hosts stehen in `ops/traffic.sh` zweimal fest (`CP_OWN_HOSTS` und `HOSTS`); der nächste Host muss beide ändern
  (kunden-kritik-2026-11-19-6)
- konto 13: Die Prüfungen auf `token`, `allowance` und `period` in `src/public/konto-client/flow.mjs:430` bis 432 hat kein
  Verhaltenstest, nur der Bundle-Vergleich wird rot (konto-nacharbeit-2026-11-20-1); ebenso prüft konto 12 Punkt 3 nur der Prüfbefehl
  der Goal-Datei (konto-nacharbeit-2026-11-19-1)
- Der automatische Rückweg in `deploy/rollout-remote.sh:265` benennt keine Spalte zurück; für `display_name` ist das erledigt, weil
  jedes Rollback-Image seit den Deploys nach konto 12 die Spalte kennt, aber die nächste Migration, die das alte Image nicht lesen
  kann, fällt erst nach dem Umschalten auf. Die Probe des Rollback-Images ändert eine Datei aus `deny_paths`, also nur ein Mensch
  (betrieb-kritik-2026-11-22-1)
- `test/rollback-schema.test.ts` prüft nur die Anweisung aus Schritt 8 von `deploy/README.md`, nicht das ganze Skript und seinen Pfad
  gegen `CP_DB_PATH`, und erkennt kein `RENAME` oder `DROP COLUMN ${column}` (betrieb-kritik-2026-11-22-2 und -3)
- Die Ausnahme Hauptnetz läuft nur mit `CP_KONTO_MAINNET=1`, das nur Matthias setzt; ob ein Widerruf auf der Kette wirklich
  durchgeht, belegt bisher nur ein nachgebauter Knoten (konto 17)
- Bridge dokumentiert kein Abschalten einer Auszahladresse; ob das Löschen des alten Bankkontos sie stilllegt, ist offen
  (konto-nacharbeit-2026-11-18-12), das Geld schützt schon der Widerruf aus konto 11
- Exit 3 von `ops/deploy-window.sh` macht den Job in `deploy.yml:165` nicht rot (nur `::warning::`); nur ein Mensch ändert
  `.github/**`, der Watchdog holt den Alarm nach (messung 06)
- Der Zähler der Actions-Logs (`ops/actions-log-addresses.sh --workflow deploy.yml`) läuft nur von Hand
- `LOOP.md:24` nennt noch die ungemessenen 0,37 USD; den Satz ändert nur ein Mensch
- Der Pin `sandboxd-base-pin` hält das Basis-Image gegen den Prune-Cron des Mitbewohners; fällt `fact image_pin` in
  `ops/sandbox/setup.sh --check` auf `no`, scheitert nach 24 Stunden jede Anlage einer Sandbox mit 501
- `goals/_vorschlaege/fehler-2026-11-19-1.md` folgt nicht dem Schema `<topic>-<art>-<JJJJ-MM-TT>-<n>`, weil kunden 01 den Namen
  `fehler-<Datum>-<n>` vorgab (Glied 1 der Triage vom 20.11., daraus wurde kunden 05)
- `test/credit-before-503.test.ts` hat den Parameter `extraEnv`, aber keinen Fall mit `CP_CREDIT_WARN_USD=0`; die Gegenprobe, die
  `docs/kunden/aufladung-2026-11.md` dem Test zuschreibt, fehlt (kunden-nacharbeit-2026-11-21-1)
- Das Audit vom 20.11. fuhr `bash ops/sandbox/probe.sh <IP>` live gegen den Sandbox-Host (`docs/audit/2026-11-20.md:1769`); PRO-26356
  ist erledigt, sein Glied 5 liegt als PR #326 (`goals/sandbox/ANNAHMEN.md`) offen und braucht einen Menschen zum Merge
  (sandbox-redteam-2026-11-21-1)
- `ops/answer-quote.sh` sagt nicht, ob ein Zeitraum einen Ausfall hatte; nötig erst, wenn kanal oder die Seite eine Quote nach außen
  nennt (abrechnung-kritik-2026-11-21-1). Die Hilfe druckt eine Zeile zu viel (abrechnung-kritik-2026-11-21-2)
- `ops/answer-quote.sh` und `ops/timeout-quote.sh` lesen `TQ_UNTIL` verschieden; gehört zu abrechnung 06, das pausiert
  (abrechnung-nacharbeit-2026-11-22-1)
- Eine Sandbox, deren Löschen `sandboxd` ablehnt, bucht weiter Credits (`src/sandbox/service.ts:442`); wird ein Glied vor der ersten
  fremden Sandbox (hosting-kritik-2026-11-21-1)
- `imageHealth` in `ops/sandbox/sandboxd.mjs` und `pin_fact` in `ops/sandbox/setup.sh` haben dieselbe Regel ohne gemeinsamen Test
  (hosting-nacharbeit-2026-11-22-1); die Pause von 20 s in `ops/watchdog.sh` prüft nur ein Textvergleich (hosting-nacharbeit-2026-11-22-2)
- `CP_CUSTOMER_ADDRESSES` in `ops/db-report.cjs:470` ist ein toter Eingang (kunden-nacharbeit-2026-11-22-2)
- `ops/db-report.cjs:543` prüft Hausberichte mit einer eigenen Kopie von `checkHouseReport` (Grenzen 20 und 200 fest); ändert ein
  Goal `HOUSE_CALLS_MAX` oder `HOUSE_PATH_MAX`, zählt `ops/customer-work.sh` still falsch (kunden-nacharbeit-2026-11-23-1)
- Die Startseite nennt das Paket der Runtime nicht; Glied an seite, sobald paket 02 die erste Anmeldung mit der Kennung des Pakets
  gemessen hat (paket-kritik-2026-11-22-1). Den Tag im Installationsbefehl von `README.md` und `docs/paket/anleitung.md` hält kein
  Test gleich der Zeile `Release:`; mitnehmen im nächsten Release (paket-kritik-2026-11-22-2)
- `/errors/<slug>/` und `/errors` antworten 404; unsere Kommentare verlinken ohne Schrägstrich (reichweite-kritik-2026-11-22-1). Die
  Fehlerseiten tragen keinen JSON-LD-Knoten für Fehler und Lösung (reichweite-kritik-2026-11-22-2); beides beim nächsten Goal an den
  Fehlerseiten
- Ob der Widerruf über `handleOps` an den EntryPoint unter die Ausnahme Hauptnetz von Regel 10 fällt, entscheidet nur Matthias, und
  erst bevor er `CP_KONTO_MAINNET=1` setzt; konto 15 ruht, die Code-Sperre ohne `handleOps` auf 8453 kam mit regeln 01 (PR #430) (konto-redteam-2026-11-24-1)
- Die 409 `house_pool_empty` nennt fest 4 Zusprüche, auch wenn Schrittguthaben die Tagesgrenze füllen (kunden-kritik-2026-11-23-2),
  und `HOUSE_RUNTIME_KEY_NAME` in `src/bounties/house.ts:56` ist ein toter Alias (kunden-nacharbeit-2026-11-24-1); beides beim nächsten
  Goal an `src/bounties/house.ts`
- `ops/video-starts.mjs` kopiert `ownIpsOf` und die Regeln für Checker und Crawler aus `ops/error-pages-arrivals.mjs`; zwei Leitzahlen
  aus demselben Log können verschieden zählen (reichweite-nacharbeit-2026-11-24-3)
- Element `<video>` und die Zeile „26 seconds“ stehen in `src/public/index.html` und `src/public/error-pages.ts` doppelt; beim
  nächsten neuen Rendern des Videos (reichweite-nacharbeit-2026-11-24-4)
- `src/public/index.html` trägt den ersten Bildschirm zweimal (Marken `CARD` und `NOCARD`), Kasten und Befehl gleich; beim nächsten
  Goal am ersten Bildschirm (werbung-kritik-2026-11-23-1)
- Der Rückfall auf `CP_PROBE_ANSWERS` und `CP_PROBE_RECORD` in `ops/fixtures/agent-probe-claude.sh:12` greift nie
  (werbung-nacharbeit-2026-11-24-1)
- Die Regel „Kasse per Karte zu“ (Notschalter an oder Wallet mit Erstattung) steht in `cardRedirect` (`src/payments/card-way.ts:125`)
  und in `handleDigistoreIpn` (`src/payments/digistore.ts:326`) doppelt; eine Funktion `cardClosedFor` beim nächsten Goal an der
  Kasse (wache-nacharbeit-2026-11-25-1), dort auch den toten Rückfall `heldFor ?? "card checkout closed"` in
  `src/payments/digistore.ts:348` entfernen (wache-nacharbeit-2026-11-25-2). Den Sunset fragt nur `cardOpenNow` in
  `src/app.ts:2555` (`!intakeClosed`), Fehlerseiten (`:1195`), Startseite (`:1825`) und `/card/:package` zeigen nach
  `CP_OPENROUTER_RESALE=0` weiter die Karte; die Funktion nimmt ihn als dritten Grund (fehler-nacharbeit-2026-11-26-1, PRO-31352
  Glied 7)
- `node(chainIdHex)` steht in `test/konto-send-guard.test.ts`, `test/konto-mainnet.test.ts` und `test/konto-chain.test.ts` dreimal,
  mit verschiedenem Zweig `default`; nach `test/money-helpers.ts` beim nächsten Goal an einer der Dateien
  (regeln-nacharbeit-2026-11-25-1)
- `ops/relink-comments.py` hat drei Trockenläufe und drei Prüfungen mit derselben Schleife (reichweite-nacharbeit-2026-11-25-1);
  `test/relink-comments.test.ts` (760 Zeilen) und `test/agent-probe.test.ts` (582 Zeilen) sind über 500 Zeilen ohne Begründung,
  Fälle von `--name` und `--week` in eigene Dateien beim nächsten Goal daran (reichweite-nacharbeit-2026-11-25-2,
  werbung-nacharbeit-2026-11-25-1)
- `ops/agent-probe.sh`: `seen` zählt auch localhost und example.com als fremde URL (werbung-kritik-2026-11-24-2), und zwei
  gleichzeitige Läufe mit `--week` fragen beide fünf Sessions, weil kein Lock hält (werbung-kritik-2026-11-24-3); beides beim
  nächsten Goal an der Probe
- Beim nächsten Goal an der Datei (PRO-31352 Glied 8, Schwere 1): `ops/customer-work.sh` (516 Zeilen) und `ops/agent-probe.sh`
  (503 Zeilen) über 500 Zeilen ohne Begründung, Selbsttest je in eine eigene Datei (kunden-nacharbeit-2026-11-27-1,
  werbung-nacharbeit-2026-11-26-2); die Grenzen von `HOUSE STEP USE` in `ops/db-report.cjs:607` ohne Randfall
  (kunden-nacharbeit-2026-11-27-2); `own_list` viermal wörtlich gleich in `ops/customer-decline.sh`, `ops/customer-work.sh`,
  `ops/sandbox-customer.sh` und `ops/starter-paths.sh` (kunden-nacharbeit-2026-11-27-3); die Reihenfolge der Argumente der
  Weiterleitung dreimal und der tote Rückfall `?? "length"` in `src/konto/chain.ts:146` (regeln-nacharbeit-2026-11-26-1 und -2);
  `tripBreaker` viermal unter `test/` (reichweite-nacharbeit-2026-11-26-1); die Hilfen von `test/agent-probe-week.test.ts` als Kopie
  aus `test/agent-probe.test.ts` (werbung-nacharbeit-2026-11-26-1)
- betrieb 07 ruht, bis der Watchdog einen Rest beim Inferenz-Anbieter unter 20 USD meldet; dann zurück auf PLANNED mit neuem Fenster,
  bis dahin deckt `CREDIT RUNWAY LOW` den leeren Saldo (betrieb-kritik-2026-11-25-1)
- `check` lief bei dieser Triage nicht, weil die Last je Kern über 0,75 lag (6,67 um 06:09); maßgeblich ist der Required Check des PR. Unter Node 24
  scheitert `better-sqlite3` am ABI, `check` läuft hier nur mit Node 22 (`/usr/bin/node`)

## Annahmen

- `goals/kunden/ANNAHMEN.md`: Zuordnung von Ledger und Zugriffslog, Messung nur lesend gegen die Produktion, die Annahmen von
  kunden 01 bis 04 und die Annahmen von kunden 07, 08, 11 und 13 bis 16 (Fenster ab `completedAt` des Jobs `deploy` in kunden 14,
  Kartenzeile im Fork in kunden 15, Grenze zwischen `kein Geld` und `Fehler bei uns` in kunden 16 samt Entscheidung des Tech Leads)
- `goals/karte/ANNAHMEN.md`: Kurs der EZB am Bestelltag, Testbestellungen buchen nie, Schreibsperre für fremde Produkte im geteilten
  Konto, gemessenes Guthaben je Paket und 60 Tage Rückgabe (karte 01 und 02)
- `goals/wache/ANNAHMEN.md`: Rechnung des Notschalters nur in `src/payments/card-way.ts`, Erstattungen der letzten 60 Tage, die
  Weiterleitung `/card/<paket>` (wache 01), die Annahmen von wache 02 und 03
- `goals/werbung/ANNAHMEN.md`: erster Bildschirm mit Karte zuerst (werbung 01), Agenten-Probe mit fünf festen Fragen, Block
  `-- Agent fetches --` in `ops/traffic.sh` und der Wochentakt als Vorschlag (werbung 02), die Annahmen von werbung 03 und 04
- `goals/paket/ANNAHMEN.md`: GitHub-Release im Fork `matthiashippe/automaton`, Kennung `automaton-maintained/<version>`, eine
  gespeicherte Wahl bleibt (paket 01)
- `goals/reichweite/ANNAHMEN.md`: Slugs, Rahmen und Leitzahl der Fehlerseiten (reichweite 01), Regeln zum Umlinken (reichweite 02), Aufnahme und Einbau des Videos (reichweite 03), der Name in den Kommentaren (reichweite 04), der Notschalter in den Kommentaren (reichweite 05)
- `goals/abrechnung/ANNAHMEN.md`: die Quote nach außen seit abrechnung 05 (`docs/abrechnung/timeouts.md`, Abschnitt „Nach sieben
  Tagen“)
- `goals/sandbox/ANNAHMEN.md`: Domain, Registrar, Token, Notschalter und Public Suffix List für freigegebene Ports (sandbox 07), die
  Annahmen von sandbox 08 bis 12, die Ablösungen von sandbox 06 durch sandbox 07 (Tech Lead, 25.11., PRO-30060)
- `goals/konto/ANNAHMEN.md`: Turnkey für das Konto, Tagesgrenze über eine Coinbase Smart Wallet mit Spend Permission, Euro über
  Bridge, die Annahmen von konto 07 bis 14 und die Ablösungen durch konto 06, umzug 02 und umzug 03
- `goals/umzug/ANNAHMEN.md`: Umzug auf `automatonhost.com` (umzug 01 bis 04) samt ihren Ablösungen
- `goals/hosting/ANNAHMEN.md`: Sweep und lange Befehle (hosting 01 und 02)
- `goals/seite/ANNAHMEN.md`: Code auf Englisch, Reihenfolge konto 04 vor seite 03, Ablösungen von seite 02 und 03 (Tech Lead, 18.11., ergänzt 25.11. in PRO-30060)
- `goals/anmeldung/ANNAHMEN.md`: `keys_left_today` nennt seit anmeldung 03 die freien Plätze der Grenze des Aufrufers, Ablösung von
  anmeldung 04 (Tech Lead, 18.11.)
- `goals/betrieb/ANNAHMEN.md`, `goals/fehler/ANNAHMEN.md`, `goals/domains/ANNAHMEN.md`, `goals/kanal/ANNAHMEN.md`,
  `goals/messung/ANNAHMEN.md`, `goals/relay/ANNAHMEN.md` und `goals/adressen/ANNAHMEN.md`: Annahmen der Goals vom 12. bis 25.11. (fehler 12 und kanal am 24.11., fehler 13 am 25.11.)
- `goals/regeln/ANNAHMEN.md`: saubere ABI-Adressen in den fünf Argumenten der Weiterleitung (regeln 02), `retire_destination` für
  Zeilen aus der Zeit vor regeln 03 und der Vergleich `spender === to` in `requireRule10` (regeln 03)
