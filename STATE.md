# STATE.md: Lage des Loops

Diese Datei schreibt nur die Routine „Loop-Triage“ (Delivery Manager, täglich 06:00) über einen Pflege-PR auf
`loop/triage/<JJJJ-MM-TT>`. Goal-Runs schreiben nicht hierher, sondern in ihre Goal-Datei und `goals/<topic>/ANNAHMEN.md`. Die Lage
des alten Loops bis zum 10.11.2026 steht unverändert in `docs/state-bis-2026-11-10.md`.

## Steuerung

<!-- Kill Switch: steht die nächste Zeile ohne Kommentarzeichen hier, startet nichts Neues (Stufe L1). Setzen und entfernen nur Menschen. -->
<!-- loop-pause-all -->

## Lage

Stand 28.11.2026, 06:15 Berliner Zeit (Loop-Triage, PRO-32461, `origin/dev` edd89ea). Stufe L3, Kill Switch aus, Budget core
(2 von 11 Konten mit mindestens 20 % Weekly-Rest), 8 von 20 Plätzen frei, Drill grün (21.11., Gate-Hash e291578e5235). Ein Goal
gleichzeitig; karte und Traction wechseln sich ab (Matthias: „ein goal bitte nur, dafür bitte abwechseln, immer eins traction
dazwischen“), zuletzt gestartet kunden 18, als Nächstes karte. Kurs-Check vom 28.11., 04:11 (PRO-32372): auf Kurs (Detail-Anteil
36,4 %, 4 von 11 Maker-Runs, Schwelle 40 %; 1 Stunde seit dem letzten gemergten Goal mit Prio 1 oder 2, Schwelle 12). Der
Richtungs-Check vom 27.11. (PRO-32155, PR #486, `docs/richtung/2026-11-27.md`) urteilte abgedriftet: Die Runtime kauft erst ab
5 USD, der Dienst verkauft ab 1 USD; er brachte kunden 18 in die Kette, gemessen wird beim nächsten Richtungs-Check (spätestens
04.12.). Neues Abschlusskriterium (Matthias 27.11., PR #480): In einer Woche zahlen drei fremde Automatons. Die Wache meldete am
27.11. zweimal Überlast (07:40 bis 08:10, 16:20 bis 16:39; PRO-31448, PRO-31465, PRO-31877 an den Tech Lead), seitdem keine.
Letzte 24 Stunden: 155 Runs, 6,93 % Weekly.

Seit der letzten Triage gemergt (`git log --merges --first-parent --since="2026-11-27 06:00"`): fehler 14 (PR #466, Kein Umsatz
je Kunde im öffentlichen Repo, Test `test/no-customer-revenue.test.ts` in `check`), fehler 15 (PR #478, ein 404 `model_not_found`
nennt im Log das Modell), abrechnung 08 (PR #482, kürzere Antwort statt 402), kunden 17 (PR #484, die 402 nennt älteren gepflegten
Runtimes den Befehl zum Update) und kunden 18 (PR #488, Goal-Datei #487, die gepflegte Runtime lädt ab 1 USD auf, Release
`v0.2.2-maintained.5`). Dazu die Masken aus fehler 14 in `ROADMAP.md` (#467, #472) und `STATE.md` (#475), das neue
Abschlusskriterium (#480), die Kurs-Checks vom 27.11. (#477 wache 04 pausiert, #481 abrechnung 08 vor kunden 17), der
Richtungs-Check (#486), die Loop-Kritik vom 27.11. (#465, fehler 14 und regeln 04 pausiert), die Kritiken zu fehler 14, fehler 15,
abrechnung 08, kunden 17 und kunden 18 (#471, #479, #483, #485, #489), Nacharbeit (#490) und Red Team (#491) vom 28.11., die Audits
vom 26.11. (#470) und 27.11. (#492) und die Reparaturen #469 (`test/house-report-parity.test.ts` mit fester Uhr) und #473 (Audit
26.11., 81 rote Zeilen). Triage (#463) und Triage-Glieder (#464) vom 27.11. kamen kurz vor diesem Fenster.

Damit ist PRO-31352 (Triage 27.11.) erledigt: Glied 1 wurde fehler 14, Glied 2 fehler 15, Glied 4 abrechnung 08 und Glied 5
kunden 17, alle gemergt. Zu Glied 3 entschied der Tech Lead: kein weiteres Glied am Hausauftrag für Kunde 1 (`ROADMAP.md`, Topic
kunden, Glied 17). Glied 6 (regeln 04) und Glied 7 (wache 04) stehen als Goal-Dateien auf PAUSED, Glied 8 (Schwere 1) bleibt in
der Watch List.

Es baut kein Goal. Laut Wechsel ist karte dran, karte 04 startet frühestens 30.11., paket 02 am 07.12.; das Topic `fehler`
behält seinen Platz außerhalb des Wechsels. Die neuen Glieder gehen an den Tech Lead (PRO-32469), darunter eins mit Schwere 5:
weitere Stellen mit Beträgen je Kunde, die der Test aus fehler 14 nicht fängt (Grundregel 8).

Audits: 25.11. (80 rote Zeilen, Reparatur PR #446), 26.11. (81, Reparatur PR #473) und 27.11. (208, PR #492) sind gemergt. Das
vom 27.11. lief am Kopf 4837c53 vom 26.11., also vor der Reparatur #469; 56 seiner roten Zeilen sind Folge des roten `check`
(`test/house-report-parity.test.ts`), 152 weitere, davon 29 an sandbox 11. Für den 27.11. gibt es noch keine Reparatur.

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
Gate mehr); Guthaben per Karte über Digistore24 im Konto von HTC. 27.11.2026: neues Abschlusskriterium, drei zahlende fremde
Automatons in einer Woche, ob sie wiederkommen, zählt nicht („retention ist uns egal“, PR #480, PRO-30668).

## Topics

| Topic | Goal | Status |
|---|---|---|
| fehler | 01 bis 10 | DONE (08 PR #120, 09 PR #139, 10 PR #154) |
| fehler | 11 Der Abgleich mit dem Fetcher-Cache läuft auch in CI | PAUSED (Kurs-Check 14.11., reine Testnacharbeit) |
| fehler | 12 /docs und /pricing antworten | DONE (PR #414) |
| fehler | 13 /pricing sagt bei Sunset dasselbe wie /llms.txt | DONE (PR #441) |
| fehler | 14 Kein Umsatz je Kunde im öffentlichen Repo | DONE (PR #466) |
| fehler | 15 Ein 404 `model_not_found` nennt im Log das Modell | DONE (PR #478); Live-Prüfung des Log-Punkts offen |
| fehler | nächstes Glied | beim Tech Lead: PRO-32469 Glied 1 (Schwere 5, Beträge je Kunde) und Glied 2 (Schwere 4, `gpt-4.1`) |
| wache | 01 bis 03 | DONE (01 PR #395, 02 PR #407, 03 PR #426) |
| wache | 04 Eine Regel sagt, wann die Kasse per Karte zu ist | PAUSED (Kurs-Check 27.11., PRO-31814); Bedingung erfüllt, vorher Glied 5 |
| karte | 01 Guthaben per Karte, 02 Der Weg zur Kasse | DONE (01 PR #369, 02 PR #378) |
| karte | 03 Kauft jemand per Karte, und denkt sein Automaton danach? | entfällt laut `ROADMAP.md`, die Datei steht noch auf PLANNED |
| karte | 04 Kauft jemand per Karte, vor und nach werbung 01 getrennt | PLANNED, startet frühestens 30.11.2026 (PR #453) |
| werbung | 01 bis 03 | DONE (01 PR #397, 02 PR #408, 03 PR #429); den Wochenlauf fährt der Richtungs-Check |
| werbung | 04 Die Zeile der Woche kommt durch das Gate | DONE (PR #443) |
| regeln | 01 Grundregel 10 hält im Code | DONE (PR #430) |
| regeln | 02 Auf 8453 prüft das Anlegen der Weiterleitung auch die Argumente | DONE (PR #444) |
| regeln | 03 Auf 8453 gehen `payout` und `retire` nur an eine eigene Weiterleitung | DONE (PR #455) |
| regeln | 04 Die Migration von `konto_payouts` ist getestet | PAUSED (Loop-Kritik 27.11.: hängt an konto 15) |
| kunden | 01 bis 08 | DONE (01 PR #303, 02 PR #306, 03 PR #308, 04 PR #310, 05 PR #316, 06 PR #317, 07 PR #319, 08 PR #329) |
| kunden | 09 Gutschriften je Auslöser, 10 Startgutschrift bei neuem Runtime-Pin | PAUSED (Kurs-Check 21.11., PR #327) |
| kunden | 11 Kunde 1 kann Arbeit einreichen | DONE (PR #357): Hausauftrag des Dienstes |
| kunden | 12 Reicht Kunde 1 ein, und zahlt er danach wieder? | PAUSED (Tech Lead 23.11., PRO-28123), abgelöst durch 14 |
| kunden | 13 Kunde 1 hat Guthaben für die Schritte bis zum ersten Bericht | DONE (PR #401) |
| kunden | 14 Denkt Kunde 1 mit dem Schrittguthaben, reicht er ein, und zahlt er danach wieder? | DONE (PR #451), kein weiteres Glied dort |
| kunden | 15 Der Mensch hinter einer Runtime ohne Guthaben sieht den Weg per Karte | DONE (PR #458) |
| kunden | 16 Warum der erste Sandbox-Kunde nach einem Tag aufhört | DONE (PR #460), Ergebnis `kein Geld` |
| kunden | 17 Eine alte gepflegte Runtime bekommt mit der 402 den Befehl zum Update | DONE (PR #484) |
| kunden | 18 Die gepflegte Runtime lädt ab 1 USD auf | DONE (PR #488) |
| kunden | nächstes Glied | beim Tech Lead: PRO-32469 Glied 3 (Messung nach den Releases von kunden 17 und 18) |
| reichweite | 01 Eine Seite je Fehlermeldung, 02 Unsere Kommentare zeigen auf die passende Seite | DONE (01 PR #375, 02 PR #393) |
| reichweite | 03 Ein Video zeigt den Umzug | DONE (PR #409) |
| reichweite | 04 Unsere Kommentare nennen automatonhost.com beim Namen | DONE (PR #424) |
| reichweite | 05 Unsere Kommentare folgen dem Notschalter der Karte | DONE (PR #442) |
| paket | 01 Die Runtime kommt mit unserer Adresse | DONE (PR #381) |
| paket | 02 Was das Paket gebracht hat | PLANNED, startet frühestens 07.12.2026 |
| betrieb | 01 bis 04 | DONE (03 PR #79, 04 PR #96) |
| betrieb | 05 Die Aufladung beim Inferenz-Anbieter ist belegt und bleibt passend | PAUSED, ersetzt durch 07 |
| betrieb | 06 Ein Rückweg auf das alte Image verträgt die Migration | DONE (PR #361) |
| betrieb | 07 Die Nachmessung der Aufladung nach 14 Tagen | PAUSED (Loop-Kritik 25.11.: das feste Fenster belegt nichts) |
| sandbox | 01 bis 05 | DONE (05 PR #62) |
| sandbox | 06 Freigegebene Ports unter einer eigenen Domain | DONE als Altlast, überholt durch 07 (PR #427) |
| sandbox | 07 bis 10 | DONE (07 PR #100, 08 PR #197, 09 PR #210, 10 PR #213) |
| sandbox | 11 Die Sandbox-Domain kommt auf die Public Suffix List | DONE als Altlast, überholt durch 12 (PR #428) |
| sandbox | 12 Ein Cookie bleibt in seiner Sandbox | DONE (PR #295) |
| konto | 01 bis 14 | DONE (05 PR #220 bis 14 PR #297) |
| konto | 15 Das Konto ist in der Produktion an | PAUSED (Matthias 22.11.: kein Zugang bei MoonPay, PR #363); Goal-PR #302 offen |
| konto | 16 Ausgezahlt wird erst nach der Freigabe für SEPA | PAUSED (Tech Lead 23.11., PRO-28123): hängt an konto 15 |
| konto | 17 | Glied in `ROADMAP.md`, Datei fehlt; hängt an konto 15 |
| konto | 18 Die Bereitschaftsprüfung unterscheidet Dienst unten von Schlüssel fehlt | PAUSED (Loop-Kritik 20.11.) |
| hosting | 01, 02 | DONE (01 PR #230, 02 PR #240) |
| hosting | 03 Die Selbsttests im Sandbox-Weg laufen in `check` | PAUSED (Kurs-Check 17.11., PR #248) |
| hosting | 04 bis 07 | DONE (04 PR #338, 05 PR #343, 06 PR #346, 07 PR #350) |
| umzug | 01 bis 04 | DONE (01 PR #244, 02 PR #252, 03 PR #268, 04 PR #280) |
| umzug | 05 Der Selbsttest der Website-DNS räumt auf | PAUSED (Kurs-Check 19.11.) |
| relay | 01 bis 03 | DONE (02 PR #113, 03 PR #131) |
| relay | 04 Antworten an Konten ohne Wallet nur bei Bedarf | PAUSED (Kurs-Check 19.11.: 0 Nachrichten über das Relay) |
| anmeldung | 01 bis 05 | DONE (03 PR #194, 04 PR #203, 05 PR #259) |
| abrechnung | 01 bis 05 | DONE (05 PR #266) |
| abrechnung | 06 Der Zeitraum der Quote stimmt | PAUSED (Loop-Kritik 19.11., abrechnung-kritik-2026-11-19-1) |
| abrechnung | 07 Antwortquote neben der Timeout-Quote | DONE (PR #334) |
| abrechnung | 08 Wer noch Credits hat, bekommt eine kürzere Antwort statt 402 | DONE (PR #482) |
| abrechnung | nächstes Glied | beim Tech Lead: PRO-32469 Glied 4 (leere gekürzte Antworten) |
| domains | 01 bis 06 | DONE (04 PR #116, 05 PR #132, 06 PR #155) |
| domains | 07 Ein Neustart des Sandbox-Servers sperrt keinen Kunden aus | PAUSED (Kurs-Check 15.11., PR #186) |
| kanal | 01 bis 04 | DONE (04 PR #106); Urteil über den Ertrag am 25.11. (`goals/kanal/ertrag.md`) |
| kanal | 05 Urteil je Antwort | PAUSED, in `ROADMAP.md` entfällt, ersetzt durch 06 |
| kanal | 06 Urteil je Antwort und eine neue Runde nur mit neuen Issues | PAUSED, entfällt, ersetzt durch 09 (PR #453) |
| kanal | 07 Der Tech Lead liest den Text des Werts, 08 Gepostet wird der freigegebene Text | PAUSED (Kurs-Check 25.11. und 26.11.) |
| kanal | 09 Bringen unsere Kommentare in den Conway-Threads Anmeldungen, je Thread? | PAUSED (Richtungs-Check 26.11., PR #456) |
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
  (hosting 06), #383 (karte 02), Nacharbeit-PR #336 und Audit-PR #321; ihre Köpfe stammen laut Loop Master aus keinem Lauf der
  zuständigen Rolle. Dazu PR #326 (`goals/sandbox/ANNAHMEN.md`, Tech Lead).
- Neu ohne Merge-Auftrag: PR #476 (Vorschlag `fehler-kunden-september-2026-11-27-1`, Schwere 4, Grundregel 8, Entscheidung des
  Tech Lead in PRO-31770); solange er nicht auf `dev` liegt, entscheidet ihn keine Triage. PR #474 (`STATE.md` Zeile 194 maskiert)
  ist durch den gemergten PR #475 überholt und kann geschlossen werden.
- Der Richtungs-Check vom 27.11. legt Matthias drei Entscheidungen vor (`docs/richtung/2026-11-27.md`, Abschnitt „Entscheidungen für
  Matthias“): was „bezahlt“ im Abschlusskriterium heißt (Frist vor dem nächsten Richtungs-Check am 04.12., als Issue angelegt),
  ein Bonus auf die erste Aufladung statt geschenkter Startgutschrift (erst nach kunden 18) und Inferenz per x402 für jeden Agenten
  (noch nicht). Vom 26.11. ist das Abschlusskriterium entschieden (PR #480); zur höheren Startgutschrift der gepflegten Runtime und
  zu Sandboxes als nächstem Produkt steht keine Antwort im Repo. Die Human Inbox dieses Loops ist der Tech Lead.
- Gate-Abgleich: `gate.yaml` (3f1ac20, 14.11.) und `loop-constraints.md` (7eb842e, 24.11.) seit der letzten Triage unverändert. Jede
  Pfadregel der Deny List hat ihren Eintrag in `deny_paths`, `src/payments/**` und `src/auth/**` prüft wie bisher Linse B gegen die
  Goal-Datei. Keine neue Lücke.

## Watch List

- Triage 28.11.: 13 Vorschläge entschieden, 9 davon als 5 Glieder an den Tech Lead (PRO-32469), 4 schon erledigt (abrechnung 08,
  fehler 14 zweimal, regeln 04), keiner verworfen; höchste Schwere 5 (Glied 1).
- Schwere 5, Grundregel 8 (fehler-kritik-2026-11-27-3, PRO-32469 Glied 1): kunden 02 Zeile 8 (eingefroren) nennt den Betrag der
  einen fremden Zahlung einer Woche, und der Test aus fehler 14 fängt die Form „eine fremde Zahlung über“ nicht. Dazu lässt er jeden
  Betrag hinter „Summe aller …: “ durch, wenn keine Zählung folgt (fehler-kritik-2026-11-27-4), und die Uhrzeiten zweier Aufladungen
  stehen unmaskiert in `goals/_vorschlaege/kunden-redteam-2026-11-27-1.md` Zeile 13 (kunden-redteam-2026-11-28-1). Dieser Text nennt
  deshalb keinen Betrag und keine Zeit.
- fehler 15: Der Punkt „nach dem Rollout steht das Modell im Log“ ist offen; erst die Log-Zeile entscheidet, ob `gpt-4.1`,
  `gpt-4.1-mini` und `gpt-4.1-nano` in den Katalog kommen (PRO-32469 Glied 2, Wert für `CP_OPENROUTER_MODELS` setzt nur Matthias)
- `CP_REPORT=topup-bands` in `ops/db-report.cjs:775` zählt eine Aufladung der Stufe 1 nur bei genau 100000 mc, über `/pay/1/`
  bucht der Dienst mit Schwellenbonus mehr (`src/payments/pay.ts:548`); die Zeile `TOPUPS 1 USD` sieht so keinen Kauf über `/pay/`.
  Der Richtungs-Check am 04.12. misst genau diese Zahl, das Glied muss vorher kommen (PRO-32469 Glied 3)
- wache 04: Die Bedingung der Pause (abrechnung 08 und kunden 17 gemergt) ist erfüllt; vor dem Zurück auf PLANNED den Prüfbefehl
  „genau 2“ in `goals/wache/04-eine-regel-sagt-wann-die-kasse-per-karte-zu-ist.md:78` richten, er zählt die beiden Definitionen
  mit (PRO-32469 Glied 5)
- `goals/karte/03-kauft-jemand-per-karte.md` steht auf PLANNED mit frühestens 30.11., obwohl `ROADMAP.md` Zeile 16 sie als
  entfallen führt und sagt, die Loop-Kritik setze sie auf PAUSED; der Loop Master führt nur karte 04 als wartend. Bis 30.11. klären
- Audit 27.11. (PR #492): 208 rote Zeilen am alten Kopf 4837c53, drei rote Audits in Folge, noch keine Reparatur
- `loop-constraints.md:129` bindet Opus für Maker, Linsen und Kritik, Linse B (`qa-scope`) läuft weiter auf Sonnet
  (`paperclip/company/.paperclip.yaml:290` im code-host). Angleichen oder zurückstellen kann nur Matthias
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
- Der automatische Rückweg in `deploy/rollout-remote.sh:265` benennt keine Spalte zurück; für `display_name` ist das erledigt, aber
  die nächste Migration, die das alte Image nicht lesen kann, fällt erst nach dem Umschalten auf. Die Probe des Rollback-Images
  ändert eine Datei aus `deny_paths`, also nur ein Mensch (betrieb-kritik-2026-11-22-1)
- `test/rollback-schema.test.ts` prüft nur die Anweisung aus Schritt 8 von `deploy/README.md`, nicht das ganze Skript und seinen Pfad
  gegen `CP_DB_PATH`, und erkennt kein `RENAME` oder `DROP COLUMN ${column}` (betrieb-kritik-2026-11-22-2 und -3)
- Die Ausnahme Hauptnetz läuft nur mit `CP_KONTO_MAINNET=1`, das nur Matthias setzt; ob ein Widerruf auf der Kette wirklich
  durchgeht, belegt bisher nur ein nachgebauter Knoten (konto 17)
- Bridge dokumentiert kein Abschalten einer Auszahladresse; ob das Löschen des alten Bankkontos sie stilllegt, ist offen
  (konto-nacharbeit-2026-11-18-12), das Geld schützt schon der Widerruf aus konto 11
- Exit 3 von `ops/deploy-window.sh` macht den Job in `deploy.yml:165` nicht rot (nur `::warning::`); nur ein Mensch ändert
  `.github/**`, der Watchdog holt den Alarm nach (messung 06)
- Der Zähler der Actions-Logs (`ops/actions-log-addresses.sh --workflow deploy.yml`) läuft nur von Hand
- `LOOP.md:24` nennt noch einen ungemessenen Betrag je Kunde (*.** USD, Grundregel 8); den Satz ändert nur ein Mensch
- Der Pin `sandboxd-base-pin` hält das Basis-Image gegen den Prune-Cron des Mitbewohners; fällt `fact image_pin` in
  `ops/sandbox/setup.sh --check` auf `no`, scheitert nach 24 Stunden jede Anlage einer Sandbox mit 501
- `goals/_vorschlaege/fehler-2026-11-19-1.md` folgt nicht dem Schema `<topic>-<art>-<JJJJ-MM-TT>-<n>`, weil kunden 01 den Namen
  `fehler-<Datum>-<n>` vorgab (Glied 1 der Triage vom 20.11., daraus wurde kunden 05)
- `test/credit-before-503.test.ts` hat den Parameter `extraEnv`, aber keinen Fall mit `CP_CREDIT_WARN_USD=0`; die Gegenprobe, die
  `docs/kunden/aufladung-2026-11.md` dem Test zuschreibt, fehlt (kunden-nacharbeit-2026-11-21-1)
- Das Audit vom 20.11. fuhr `bash ops/sandbox/probe.sh <IP>` live gegen den Sandbox-Host (`docs/audit/2026-11-20.md:1769`); sein
  Glied 5 liegt als PR #326 (`goals/sandbox/ANNAHMEN.md`) offen und braucht einen Menschen zum Merge (sandbox-redteam-2026-11-21-1)
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
  gemessen hat (paket-kritik-2026-11-22-1). Den Tag im Installationsbefehl von `README.md:29` hält kein Test gleich der Zeile
  `Release:`, die Anleitung prüft seit kunden 17 `test/inference-maintained-update.test.ts:188` (paket-kritik-2026-11-22-2)
- `/errors/<slug>/` und `/errors` antworten 404; unsere Kommentare verlinken ohne Schrägstrich (reichweite-kritik-2026-11-22-1). Die
  Fehlerseiten tragen keinen JSON-LD-Knoten für Fehler und Lösung (reichweite-kritik-2026-11-22-2); beides beim nächsten Goal an den
  Fehlerseiten
- Ob der Widerruf über `handleOps` an den EntryPoint unter die Ausnahme Hauptnetz von Regel 10 fällt, entscheidet nur Matthias, und
  erst bevor er `CP_KONTO_MAINNET=1` setzt; konto 15 ruht, die Code-Sperre ohne `handleOps` auf 8453 kam mit regeln 01 (PR #430)
  (konto-redteam-2026-11-24-1)
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
- Die Regel „Kasse per Karte zu“ (Notschalter, Erstattung, Sunset) steht verstreut in `cardRedirect`, `handleDigistoreIpn` und
  `cardOpenNow`; die Funktion `cardClosedFor` samt totem Rückfall in `src/payments/digistore.ts` baut wache 04, das pausiert
  (wache-nacharbeit-2026-11-25-1 und -2, fehler-nacharbeit-2026-11-26-1)
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
- `check` lief bei dieser Triage nicht (Triage liest nur); maßgeblich ist der Required Check des PR. Unter Node 24 scheitert
  `better-sqlite3` am ABI, `check` läuft hier nur mit Node 22 (`/usr/bin/node`)

## Annahmen

- `goals/kunden/ANNAHMEN.md`: Zuordnung von Ledger und Zugriffslog, Messung nur lesend gegen die Produktion, die Annahmen von
  kunden 01 bis 04, 07, 08, 11 und 13 bis 16, die Entscheidungen des Tech Lead zu kunden 17 (eine Quelle `MAINTAINED_RELEASE`,
  Befehl nur an ältere Kennungen) und kunden 18 (erst gemessen, Stufe 1 nur gegen `automatonhost.com`) und die Ablösungen der
  Prüfungen von kunden 01 (fehler 14) und kunden 08 (abrechnung 08)
- `goals/fehler/ANNAHMEN.md`: Annahmen von fehler 12 und 13, die Entscheidungen zu fehler 14 (maskieren statt löschen, Prüfung in
  `check`, Grenzen des Tests, Suche nach Wert, Rahmen geschlossen) und zu fehler 15 (Log-Zeile ohne Adresse, IDs am Pin, Alias nur
  bei genau `openai/<id>`)
- `goals/RISIKEN.md`: Vorfall vom 19.11.2026 und Zeile vom 27.11.2026 (Grundregel 8, Fundstellen der Beträge je Kunde, die bleiben)
- `goals/abrechnung/ANNAHMEN.md`: die Quote nach außen seit abrechnung 05 (`docs/abrechnung/timeouts.md`, Abschnitt „Nach sieben
  Tagen“), die Entscheidungen zu abrechnung 08 (Grenze `MIN_SHORTENED_TOKENS`, kein eigener `finish_reason`, `shortened_to`) und
  die Ablösungen der Prüfungen von abrechnung 01 und 03
- `goals/karte/ANNAHMEN.md`: Kurs der EZB am Bestelltag, Testbestellungen buchen nie, Schreibsperre für fremde Produkte im geteilten
  Konto, gemessenes Guthaben je Paket und 60 Tage Rückgabe (karte 01 und 02)
- `goals/wache/ANNAHMEN.md`: Rechnung des Notschalters nur in `src/payments/card-way.ts`, Erstattungen der letzten 60 Tage, die
  Weiterleitung `/card/<paket>` (wache 01), die Annahmen von wache 02 und 03
- `goals/werbung/ANNAHMEN.md`: erster Bildschirm mit Karte zuerst (werbung 01), Agenten-Probe mit fünf festen Fragen, Block
  `-- Agent fetches --` in `ops/traffic.sh` und der Wochentakt als Vorschlag (werbung 02), die Annahmen von werbung 03 und 04
- `goals/paket/ANNAHMEN.md`: GitHub-Release im Fork `matthiashippe/automaton`, Kennung `automaton-maintained/<version>`, eine
  gespeicherte Wahl bleibt (paket 01)
- `goals/reichweite/ANNAHMEN.md`: Slugs, Rahmen und Leitzahl der Fehlerseiten (reichweite 01), Regeln zum Umlinken (reichweite 02),
  Aufnahme und Einbau des Videos (reichweite 03), der Name (reichweite 04) und der Notschalter (reichweite 05) in den Kommentaren
- `goals/sandbox/ANNAHMEN.md`: Domain, Registrar, Token, Notschalter und Public Suffix List für freigegebene Ports (sandbox 07), die
  Annahmen von sandbox 08 bis 12, die Ablösungen von sandbox 06 durch sandbox 07 (Tech Lead, 25.11., PRO-30060)
- `goals/konto/ANNAHMEN.md`: Turnkey für das Konto, Tagesgrenze über eine Coinbase Smart Wallet mit Spend Permission, Euro über
  Bridge, die Annahmen von konto 07 bis 14 und die Ablösungen durch konto 06, umzug 02 und umzug 03
- `goals/umzug/ANNAHMEN.md`: Umzug auf `automatonhost.com` (umzug 01 bis 04) samt ihren Ablösungen
- `goals/hosting/ANNAHMEN.md`: Sweep und lange Befehle (hosting 01 und 02)
- `goals/seite/ANNAHMEN.md`: Code auf Englisch, Reihenfolge konto 04 vor seite 03, Ablösungen von seite 02 und 03 (Tech Lead, 18.11.,
  ergänzt 25.11. in PRO-30060)
- `goals/anmeldung/ANNAHMEN.md`: `keys_left_today` nennt seit anmeldung 03 die freien Plätze der Grenze des Aufrufers, Ablösung von
  anmeldung 04 (Tech Lead, 18.11.)
- `goals/betrieb/ANNAHMEN.md`, `goals/domains/ANNAHMEN.md`, `goals/kanal/ANNAHMEN.md`, `goals/messung/ANNAHMEN.md`,
  `goals/relay/ANNAHMEN.md` und `goals/adressen/ANNAHMEN.md`: Annahmen der Goals vom 12. bis 25.11. (kanal am 24.11.)
- `goals/regeln/ANNAHMEN.md`: saubere ABI-Adressen in den fünf Argumenten der Weiterleitung (regeln 02), `retire_destination` für
  Zeilen aus der Zeit vor regeln 03 und der Vergleich `spender === to` in `requireRule10` (regeln 03)
