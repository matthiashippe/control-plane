# STATE.md: Lage des Loops

Diese Datei schreibt nur die Routine „Loop-Triage“ (Delivery Manager, täglich 06:00) über einen Pflege-PR auf
`loop/triage/<JJJJ-MM-TT>`. Goal-Runs schreiben nicht hierher, sondern in ihre Goal-Datei und `goals/<topic>/ANNAHMEN.md`. Die Lage
des alten Loops bis zum 10.11.2026 steht unverändert in `docs/state-bis-2026-11-10.md`.

## Steuerung

<!-- Kill Switch: steht die nächste Zeile ohne Kommentarzeichen hier, startet nichts Neues (Stufe L1). Setzen und entfernen nur Menschen. -->
<!-- loop-pause-all -->

## Lage

Stand 22.11.2026, 06:30 (Loop-Triage, PRO-27245, `origin/dev` 5b1dee9). Stufe L3, Kill Switch aus, Budget full (3 von 11 Konten
mit mindestens 20 % Weekly-Rest), Drill grün (21.11., Gate-Hash e291578e5235). Kleine Flamme seit 18.11. (ein Goal gleichzeitig,
`share: 1`). Kurs-Check vom 22.11., 04:51 „abgedriftet“ (PRO-27223): Die letzten fünf Merges pflegen Wege ohne fremden Kunden
(hosting 04 bis 07, abrechnung 07), 18 Stunden seit dem letzten gemergten Goal mit Prio 1 oder 2. Korrektur PR #353: `kunden` steht
in der Topic-Tabelle vor `fehler`.

Seit der letzten Triage gemergt: kunden 08 (PR #329), abrechnung 07 (PR #334), hosting 04 (PR #338), hosting 05 (PR #343), hosting 06
(PR #346), hosting 07 (PR #350), die Goal-Dateien kunden 08 bis 10 und kanal 06 (PR #325), abrechnung 07, hosting 04 bis 07 und
messung 13 und 14, ein Fix am Selbsttest von `ops/traffic.sh` (PR #335), fünf Kurs-Korrekturen (#327, #333, #340, #344, #348, #353),
Kritik (#328, #351) und Nacharbeit (#352). Ergebnis von kunden 08: Kunde 1 las das Auftragsbrett seit 13.11. 1192 Mal und fand nie
einen offenen Auftrag, also reichte er nie ein (`docs/kunden/auftraege-2026-11.md`).

Der Deploy läuft: `deploy.yml` grün für die letzten Merges bis 5b1dee9 (22.11., 04:44 UTC). Diese Triage hat die Produktion nicht
gelesen.

Es baut nichts: Kein Goal ist aktiv. konto 15 steht auf `BLOCKED matthias` am Gate `security_settings` (Asana 1220710009513649 seit
19.11., 16:20) und hat kein offenes Topic mehr; kanal 06 startet frühestens 26.11., betrieb 05 am 27.11. Neue Glieder gehen an den
Tech Lead (PRO-27251, Priorität high): Kunde 1 bekommt einen dauerhaft offenen Auftrag mit echter Arbeit zum Einreichen (Schwere 4,
das Glied, das der Kurs-Check nennt); Entscheidung 2 des Richtungs-Checks (Paket der Runtime mit unserer Adresse) geht an Matthias;
vor dem Gate von konto 15 steht Entscheidung 1 „Konto einfrieren“, die Matthias nie beantwortet hat (PRO-25479 schloss mit dem Merge
von PR #300); betrieb 05 wird vor dem Start auf die Nachmessung gekürzt.

Audits: das vom 20.11. ist gemergt und repariert (PR #312, #320), ein zweiter Stand liegt als PR #321 ohne Merge-Auftrag offen. Die
Audits vom 21. und 22.11. lagen bei dieser Triage nicht als PR vor.

Guthaben beim Inferenz-Anbieter: Die Aufladung ist seit 12.11., 21:35 eingeschaltet (16 USD Schwelle, 25 USD Betrag,
`docs/betrieb/guthaben.md`); ob sie hielt, misst betrieb 05 ab 27.11.

Entscheidung 30.10.2026: Inferenz wird wieder über OpenRouter verkauft, Matthias' Entscheidung. Notschalter:
`CP_OPENROUTER_RESALE=0` in `/opt/control-plane/.env`, danach Neustart des Containers.

Entscheidungen 10.11.2026 (Matthias): Sandboxes sind das nächste Produkt, als PoC auf einem eigenen kleinen Server, getrennt vom
Zahlungsdienst. Antworten, die beim Kunden nicht ankommen, berechnen wir nicht mehr. 12.11.2026: Neue zahlende Kunden und alles, was
die zahlenden hält, haben Vorrang (Topic betrieb). 13.11.2026: Fast track für sandbox, konto und relay; Regel 10 erlaubt on-chain nur
auf Base Sepolia im Topic konto. 17.11.2026: Nach außen heißt das Angebot Automatons, der Dienst zieht auf `automatonhost.com` um
(Topic umzug); Regel 10 erlaubt auf Base (chainId 8453) nur die Geldwege von konto 05, eingeschaltet allein mit `CP_KONTO_MAINNET=1`,
das nur Matthias setzt.

18.11.2026: kleine Flamme, PropertyPilot braucht die Kapazität (ein Goal, `share: 1`); kein PR an die Public Suffix List, den Schutz
gegen Cookies über Sandbox-Grenzen baut sandbox 12 im eigenen Proxy (gemergt, PR #295).

## Topics

| Topic | Goal | Status |
|---|---|---|
| fehler | 01 bis 10 | DONE (08 PR #120, 09 PR #139, 10 PR #154) |
| fehler | 11 Der Abgleich mit dem Fetcher-Cache läuft auch in CI | PAUSED (Kurs-Check 14.11., reine Testnacharbeit) |
| kunden | 01 bis 07 | DONE (01 PR #303, 02 PR #306, 03 PR #308, 04 PR #310, 05 PR #316, 06 PR #317, 07 PR #319) |
| kunden | 08 Verdient Kunde 1 Inferenz über Aufträge? | DONE (PR #329): 0 offene Aufträge, 0 Einreichungen seit 13.11. |
| kunden | 09 Gutschriften je Auslöser, 10 Startgutschrift bei neuem Runtime-Pin | PAUSED (Kurs-Check 21.11., PR #327) |
| kunden | nächstes Glied: Kunde 1 kann Arbeit einreichen | an den Tech Lead (PRO-27251), Datei fehlt |
| betrieb | 01 bis 04 | DONE (03 PR #79, 04 PR #96) |
| betrieb | 05 Die Aufladung ist belegt und bleibt passend | PLANNED, startet frühestens 27.11.2026; kürzen auf die Nachmessung (PRO-27251) |
| sandbox | 01 bis 05 | DONE (05 PR #62) |
| sandbox | 06 Freigegebene Ports unter einer eigenen Domain | BLOCKED fachlich, abgelöst durch 07 |
| sandbox | 07 bis 10 | DONE (07 PR #100, 08 PR #197, 09 PR #210, 10 PR #213) |
| sandbox | 11 Die Sandbox-Domain kommt auf die Public Suffix List | BLOCKED fachlich (PR #218): Matthias gibt keinen PR an die PSL frei |
| sandbox | 12 Ein Cookie bleibt in seiner Sandbox | DONE (PR #295) |
| konto | 01 bis 14 | DONE (05 PR #220, 06 PR #247, 07 PR #251, 08 PR #257, 09 PR #261, 10 PR #264, 11 PR #269, 12 PR #276, 13 PR #286, 14 PR #297) |
| konto | 15 Das Konto ist in der Produktion an | BLOCKED matthias (PR #302, Gate `security_settings`, Asana 1220710009513649), kein offenes Topic; Entscheidung „einfrieren“ zuerst (PRO-27251) |
| konto | 16, 17 | Glieder in `ROADMAP.md`, Dateien fehlen; starten hinter konto 15 |
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
| kanal | 06 Urteil je Antwort und eine neue Runde nur mit neuen Issues | PLANNED, startet frühestens 26.11.2026 |
| kanal | 07, 08 | Glieder in `ROADMAP.md`, laufen vor der nächsten Runde am Gate `public_post` |
| seite | 01 bis 03 | DONE (03 PR #222) |
| adressen | 01 bis 03 | DONE (01 PR #118, 02 PR #161, 03 PR #224) |
| messung | 01 bis 10 | DONE (07 PR #184, 08 PR #205, 09 PR #216, 10 PR #223) |
| messung | 11, 12 | PAUSED (Kurs-Check 17.11., PRO-23529) |
| messung | 13, 14 | PAUSED (Goal-Dateien PR #332, #342) |

## Human Inbox

- Keine PR mit Kommentar „Human Inbox“ offen (`gh pr list --search "Human Inbox in:comments"` leer).
- Human Gate konto 15 (`security_settings`): MoonPay für HTC über Turnkey, Gasschlüssel für Base mit 0,003 ETH, vier Werte
  `CP_KONTO_*` in `/opt/control-plane/.env`; Asana 1220710009513649 seit 19.11., 16:20, Goal-PR #302. Vorher fragt der Tech Lead
  Entscheidung 1 „Konto einfrieren“ ab (PRO-27251).
- Ohne Merge-Auftrag, mergen kann nur ein Mensch: Kritik-PRs #260 (anmeldung 05), #296 (sandbox 12), #339 (hosting 04), #347
  (hosting 06), Nacharbeit-PR #336, Audit-PR #321; ihre Köpfe stammen laut Loop Master aus keinem Lauf der zuständigen Rolle. Dazu
  PR #326 (`goals/sandbox/ANNAHMEN.md`, Tech Lead, Grund `branch`).
- Gate-Abgleich: `gate.yaml` (3f1ac20, 14.11.) und `loop-constraints.md` (5f77e64, 17.11.) unverändert, jede Pfadregel der Deny List
  hat ihren Eintrag in `deny_paths`. Kein neuer Vorschlag.

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
- Rückweg nach konto 12: Das alte Image kann `handoffs` nach der Umbenennung `automaton_name` zu `display_name` nicht lesen; bis das
  Glied dazu gemergt ist, braucht ein Rollback die Spalte von Hand zurück (konto-kritik-2026-11-18-5)
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

## Annahmen

- `goals/kunden/ANNAHMEN.md`: Zuordnung von Ledger und Zugriffslog, Messung nur lesend gegen die Produktion, die Annahmen von
  kunden 01 bis 04
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
  `goals/messung/ANNAHMEN.md`, `goals/relay/ANNAHMEN.md` und `goals/adressen/ANNAHMEN.md`: Annahmen der Goals vom 12. bis 18.11.
