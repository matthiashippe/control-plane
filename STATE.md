# STATE.md: Lage des Loops

Diese Datei schreibt nur die Routine „Loop-Triage“ (Delivery Manager, täglich 06:00) über einen Pflege-PR auf
`loop/triage/<JJJJ-MM-TT>`. Goal-Runs schreiben nicht hierher, sondern in ihre Goal-Datei und `goals/<topic>/ANNAHMEN.md`. Die Lage
des alten Loops bis zum 10.11.2026 steht unverändert in `docs/state-bis-2026-11-10.md`.

## Steuerung

<!-- Kill Switch: steht die nächste Zeile ohne Kommentarzeichen hier, startet nichts Neues (Stufe L1). Setzen und entfernen nur Menschen. -->
<!-- loop-pause-all -->

## Lage

Stand 23.11.2026, 06:45 (Loop-Triage, PRO-28101, `origin/dev` b5994b4). Stufe L3, Kill Switch aus, Budget core (2 von 11 Konten
mit mindestens 20 % Weekly-Rest), Drill grün (21.11., Gate-Hash e291578e5235). Ein Goal gleichzeitig; seit 22.11. wechseln sich
karte und Traction ab (kunden, kanal, seite, reichweite, werbung), Matthias: „ein goal bitte nur, dafür bitte abwechseln, immer eins
traction dazwischen“. Kurs-Check vom 23.11., 02:53 „auf Kurs“ (PRO-28015): Detail-Anteil 12,5 %, 3 Stunden seit dem letzten gemergten
Goal mit Prio 1 oder 2.

Seit der letzten Triage gemergt: kunden 11 (PR #357), betrieb 06 (PR #361), karte 01 (PR #369), karte 02 (PR #378), reichweite 01
(PR #375), reichweite 02 (PR #393), paket 01 (PR #381), wache 01 (PR #395), die Goal-Dateien kunden 11 und 12, betrieb 07, konto 16,
karte 01 bis 03, reichweite 01 bis 03, paket 01 und 02, wache 01 und werbung 01, die neuen Topics karte, wache, werbung, reichweite
und paket (#364, #371, #373, #384 bis #387), konto 15 ruht (#363), Kommentare in fremden Repos gibt seit 22.11. der Tech Lead frei
(#366), die Reparatur des Audits vom 22.11. (#362), die Audits vom 21. und 22.11. (#390, #359), Kritik (#356, #376) und Nacharbeit
(#398). Die Kasse per Karte ist gebaut: drei Produkte bei Digistore24 (5, 20 und 50 EUR, 60 Tage Rückgabe), Testkäufe gemacht, zur
Freigabe eingereicht; ob Digistore24 freigegeben hat, hat diese Triage nicht geprüft.

Der Deploy läuft: `deploy.yml` grün für die letzten Merges bis b5994b4 (23.11., 03:54 UTC). Diese Triage hat die Produktion nicht
gelesen.

Es baut werbung 01 (PRO-28027, PR #397, Zyklus 3). Danach wartet reichweite 03 auf den Platz; kunden 12 startet frühestens 25.11.,
kanal 06 am 26.11., betrieb 07 am 27.11., karte 03 am 30.11., paket 02 am 07.12. Neue Glieder gehen an den Tech Lead (PRO-28123,
Priorität high): Kunde 1 bekommt Guthaben für die Schritte bis zum ersten Bericht, weil seine Inferenz seit 13.11. mit 402 endet und
der Hausauftrag aus kunden 11 erst wirkt, wenn sein Modell antwortet (Schwere 4, vor kunden 12); kunden 12 zählt Zusprüche an Adressen
ohne frühere Inferenz; zwei Befunde am Notschalter gehen als Kritik in werbung 01; die Selbsttests der Digistore-Werkzeuge kommen in
`check`; über den Goal-PR #368 von konto 16 entscheidet der Tech Lead, weil konto 15 ruht.

Audits: die vom 21. und 22.11. sind gemergt (47 und 60 rote Zeilen), die Reparatur vom 22.11. ist gemergt (PR #362); der Loop Master
meldet zwei rote Audits in Folge, die roten Zeilen repariert der Loop. Das Audit vom 23.11. lag bei dieser Triage nicht vor.

Guthaben beim Inferenz-Anbieter: Die Aufladung ist seit 12.11., 21:35 eingeschaltet (16 USD Schwelle, 25 USD Betrag,
`docs/betrieb/guthaben.md`); ob sie hielt, misst betrieb 07 ab 27.11. (betrieb 05 ruht).

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
| wache | 01 Notschalter für die Karte | DONE (PR #395) |
| karte | 01 Guthaben per Karte, 02 Der Weg zur Kasse | DONE (01 PR #369, 02 PR #378) |
| karte | 03 Kauft jemand per Karte, und denkt sein Automaton danach? | PLANNED, startet frühestens 30.11.2026; Selbsttests der Digistore-Werkzeuge vorher (PRO-28123) |
| werbung | 01 Karte zuerst, überall | ACTIVE (PRO-28027, PR #397, Zyklus 3); zwei Befunde am Notschalter für die Kritik (PRO-28123) |
| kunden | 01 bis 08 | DONE (01 PR #303, 02 PR #306, 03 PR #308, 04 PR #310, 05 PR #316, 06 PR #317, 07 PR #319, 08 PR #329) |
| kunden | 09 Gutschriften je Auslöser, 10 Startgutschrift bei neuem Runtime-Pin | PAUSED (Kurs-Check 21.11., PR #327) |
| kunden | 11 Kunde 1 kann Arbeit einreichen | DONE (PR #357): Hausauftrag des Dienstes, 25 Cent je gültigem Bericht |
| kunden | 12 Reicht Kunde 1 ein, und zahlt er danach wieder? | PLANNED, startet frühestens 25.11.2026; davor Guthaben bis zum Bericht und Zählung je Adresse (PRO-28123) |
| reichweite | 01 Eine Seite je Fehlermeldung, 02 Unsere Kommentare zeigen auf die passende Seite | DONE (01 PR #375, 02 PR #393) |
| reichweite | 03 Ein Video zeigt den Umzug | PLANNED, wartet auf den Platz (`parallel_goals 1`) |
| paket | 01 Die Runtime kommt mit unserer Adresse | DONE (PR #381) |
| paket | 02 Was das Paket gebracht hat | PLANNED, startet frühestens 07.12.2026 |
| betrieb | 01 bis 04 | DONE (03 PR #79, 04 PR #96) |
| betrieb | 05 Die Aufladung beim Inferenz-Anbieter ist belegt und bleibt passend | PAUSED, ersetzt durch 07 |
| betrieb | 06 Ein Rückweg auf das alte Image verträgt die Migration | DONE (PR #361) |
| betrieb | 07 Die Nachmessung der Aufladung nach 14 Tagen | PLANNED, startet frühestens 27.11.2026 |
| sandbox | 01 bis 05 | DONE (05 PR #62) |
| sandbox | 06 Freigegebene Ports unter einer eigenen Domain | BLOCKED fachlich, abgelöst durch 07 |
| sandbox | 07 bis 10 | DONE (07 PR #100, 08 PR #197, 09 PR #210, 10 PR #213) |
| sandbox | 11 Die Sandbox-Domain kommt auf die Public Suffix List | BLOCKED fachlich (PR #218): Matthias gibt keinen PR an die PSL frei |
| sandbox | 12 Ein Cookie bleibt in seiner Sandbox | DONE (PR #295) |
| konto | 01 bis 14 | DONE (05 PR #220, 06 PR #247, 07 PR #251, 08 PR #257, 09 PR #261, 10 PR #264, 11 PR #269, 12 PR #276, 13 PR #286, 14 PR #297) |
| konto | 15 Das Konto ist in der Produktion an | PAUSED (Matthias 22.11.: kein Zugang bei MoonPay, ruht, PR #363); Goal-PR #302 offen |
| konto | 16 Ausgezahlt wird erst nach der Freigabe für SEPA | PLANNED, gestartet 22.11. ohne offenes Topic, Goal-PR #368 offen; Entscheidung beim Tech Lead (PRO-28123) |
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
| kanal | 06 Urteil je Antwort und eine neue Runde nur mit neuen Issues | PLANNED, startet frühestens 26.11.2026; über die nächste Runde entscheidet der Tech Lead |
| kanal | 07, 08 | Glieder in `ROADMAP.md` |
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
  (hosting 06), #383 (karte 02, Freigabe verfolgen), #396 (wache 01, direkter Link zur Kasse), Nacharbeit-PR #336, Audit-PR #321;
  ihre Köpfe stammen laut Loop Master aus keinem Lauf der zuständigen Rolle. Dazu PR #326 (`goals/sandbox/ANNAHMEN.md`, Tech Lead,
  Grund `branch`).
- Gate-Abgleich: `gate.yaml` (3f1ac20, 14.11.) unverändert, `loop-constraints.md` (187d0a5, 22.11.) ändert nur Regel 9 und die Zeile
  zu Kommentaren in fremden Repos (`public_post` entfällt, Freigabe durch den Tech Lead) und bringt keinen neuen Pfad; jede Pfadregel
  der Deny List hat ihren Eintrag in `deny_paths`. Kein neuer Vorschlag.

## Watch List

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
- Das Audit vom 20.11. fuhr `bash ops/sandbox/probe.sh <IP>` live gegen den Sandbox-Host (`docs/audit/2026-11-20.md:1769`); bis
  Glied 5 (PRO-26356) gemergt ist, kann das nächste Audit es wieder tun (sandbox-redteam-2026-11-21-1)
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
- `check` lief bei dieser Triage unter Last 33,5 je Kern nicht in 10 Minuten durch; `test/relink-comments.test.ts` (zwei Fälle) und
  der Selbsttest von `ops/traffic.sh` rissen das Zeitlimit von 60 s

## Annahmen

- `goals/kunden/ANNAHMEN.md`: Zuordnung von Ledger und Zugriffslog, Messung nur lesend gegen die Produktion, die Annahmen von
  kunden 01 bis 04 und die Annahmen von kunden 07, 08 und 11
- `goals/karte/ANNAHMEN.md`: Kurs der EZB am Bestelltag, Testbestellungen buchen nie, Schreibsperre für fremde Produkte im geteilten
  Konto, gemessenes Guthaben je Paket und 60 Tage Rückgabe (karte 01 und 02)
- `goals/wache/ANNAHMEN.md`: Rechnung des Notschalters nur in `src/payments/card-way.ts`, Erstattungen der letzten 60 Tage, die
  Weiterleitung `/card/<paket>` (wache 01)
- `goals/paket/ANNAHMEN.md`: GitHub-Release im Fork `matthiashippe/automaton`, Kennung `automaton-maintained/<version>`, eine
  gespeicherte Wahl bleibt (paket 01)
- `goals/reichweite/ANNAHMEN.md`: Slugs, Rahmen und Leitzahl der Fehlerseiten (reichweite 01), Regeln zum Umlinken (reichweite 02)
- `goals/abrechnung/ANNAHMEN.md`: die Quote nach außen seit abrechnung 05 (`docs/abrechnung/timeouts.md`, Abschnitt „Nach sieben
  Tagen“)
- `goals/sandbox/ANNAHMEN.md`: Domain, Registrar, Token, Notschalter und Public Suffix List für freigegebene Ports (sandbox 07), die
  Annahmen von sandbox 08 bis 12
- `goals/konto/ANNAHMEN.md`: Turnkey für das Konto, Tagesgrenze über eine Coinbase Smart Wallet mit Spend Permission, Euro über
  Bridge, die Annahmen von konto 07 bis 14 und die Ablösungen durch konto 06, umzug 02 und umzug 03
- `goals/umzug/ANNAHMEN.md`: Umzug auf `automatonhost.com` (umzug 01 bis 04) samt ihren Ablösungen
- `goals/hosting/ANNAHMEN.md`: Sweep und lange Befehle (hosting 01 und 02)
- `goals/seite/ANNAHMEN.md`: Code auf Englisch, Reihenfolge konto 04 vor seite 03, Ablösungen von seite 02 und 03 (Tech Lead, 18.11.)
- `goals/anmeldung/ANNAHMEN.md`: `keys_left_today` nennt seit anmeldung 03 die freien Plätze der Grenze des Aufrufers, Ablösung von
  anmeldung 04 (Tech Lead, 18.11.)
- `goals/betrieb/ANNAHMEN.md`, `goals/fehler/ANNAHMEN.md`, `goals/domains/ANNAHMEN.md`, `goals/kanal/ANNAHMEN.md`,
  `goals/messung/ANNAHMEN.md`, `goals/relay/ANNAHMEN.md` und `goals/adressen/ANNAHMEN.md`: Annahmen der Goals vom 12. bis 22.11.
