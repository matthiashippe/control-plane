# Loop State: control-plane

Last run: 2026-09-19 18:00 (Goal 7 DONE, GTM auf die gemessene Marktgröße korrigiert)

## Lage (Stand 19.09.2026, belegt in `docs/research/2026-09-19-nachfrage.md`)

Der Markt, auf den dieser Dienst zielt, ist on-chain gemessen und klein: im ganzen Conway-Umfeld
fließen 290 bis 430 USDC im Monat von 44 Wallets, der Einbruch um 93 Prozent kam im April und
damit drei Monate vor der Störung. Neue Betroffene kommen kaum nach, seit dem 29.08.2026 wurde
kein neues Issue zum Provisionierungsproblem mehr eröffnet. Das ursprüngliche Ziel von 1 bis 3k
USD Marge im Monat ist an diesem Markt nicht erreichbar, und zwar um den Faktor zehn bis
fünfundzwanzig. Matthias hat am 19.09. entschieden, den Dienst trotzdem die 30 Tage laufen zu
lassen, weil er rund 10 EUR im Monat kostet und fertig gebaut ist.

**Positionierung:** Nicht "wir ersetzen Conway", sondern: die Runtime denkt ohne erreichbaren
Kontostand überhaupt nicht (`getFinancialState` liefert `-1`, `getSurvivalTier(-1)` ergibt `dead`,
die Routing-Matrix hat für `dead` keinen Kandidaten, es geht kein einziger Inferenz-Request
hinaus), und wir liefern genau diese Abrechnungsschicht. Dazu gehört, den kostenlosen Weg über
Ollama selbst zu dokumentieren, weil wer ihn kennt ohnehin kein Kunde war.

**Messgröße für den 30-Tage-Test (bis 19.10.2026): fünf fremde Automatons.** Fremd heißt: ein
`creator_address`, der nicht uns gehört. Aktueller Stand 1 (unser eigener). Unter drei am
19.10. wird abgeschaltet, mit zwei Wochen Vorlauf auf der Startseite. Ablesbar über
`curl -s https://cp.hippe.eu/v1/status | python3 -c 'import sys,json;print(json.load(sys.stdin)["automatons"])'`
minus eins, genauer über `ops/status.sh` (`db.wallets`, `db.automatons`).

## High Priority (Build-Queue, ein Goal je Zeile, Reihenfolge bindend)

1. **Goal 1, Harness-Gerüst**: Docker-Compose mit Anvil (chainId 8453, USDC-Mock an der
   Mainnet-Adresse), Control Plane hinter TLS (eigene CA), Upstream-Runtime `d8f8168` unverändert.
   Done: `pnpm e2e:smoke` grün: `/health` über TLS aus dem Runtime-Container, `automaton --provision`
   liefert einen `cnwy_k_`-Key. Status: DONE 18.09.2026, `goals/2026-09-18-goal-1-harness-geruest.md`
2. **Goal 2, Topup** (DONE 18.09.2026, `goals/2026-09-18-goal-2-topup.md`): `/pay/5/<addr>` als x402-v1-Seller mit lokalem Settler gegen Anvil;
   Bootstrap-Topup der Runtime verbucht 500 Cents; dieselbe Signatur zweimal = eine Gutschrift.
3. **Goal 3, Inferenz** (DONE 18.09.2026, `goals/2026-09-18-goal-3-inferenz.md`; Fund: Runtime fragt `gpt-5.2`/`gpt-5-mini` aus der Routing-Matrix, Katalog-Aliase nötig): `/v1/chat/completions` Proxy mit Mock-Provider und serverseitiger
   Abbuchung (Listenpreis x 1,3); fünf Turns der Runtime, Ledger-Summe = Abbuchung, 402-Format bei
   leerem Konto.
4. **Goal 4, Rest von Phase 1** (DONE 18.09.2026, `goals/2026-09-18-goal-4-phase-1-komplett.md`): `/v1/automatons/register` (EIP-712-Prüfung),
   `/v1/credits/pricing`, Sandbox-Stubs, `/v1/credits/transfer` vorerst 501 (Entscheidung unten);
   kompletter Erstlauf der Upstream-Runtime grün (`pnpm e2e`).
5a. **OpenRouter als Einkauf** (DONE 19.09.2026, `goals/2026-09-19-goal-5a-openrouter.md`):
   Live-Lauf der Upstream-Runtime auf gpt-5.2, 5 Turns, 5,55 Cent Einkauf, 7,22 Cent Abbuchung.
5b. **Betrieb** (DONE 19.09.2026, `goals/2026-09-19-goal-5b-betrieb.md`): läuft unter
   `https://cp.hippe.eu` auf `srv1336627`, Caddy mit Let's Encrypt, OpenRouter als Einkauf, PayAI
   als Facilitator. Beide Abnahmestufen bestanden (Stufe 1 Tier-1-Topup `0xab5932…0733a`,
   Stufe 2 Erstlauf der Upstream-Runtime mit Bootstrap-Topup `0x6cde28b0…54dc68`, fünf Turns,
   keine API-Fehler). Tier 1 danach aus dem Betrieb genommen.
6. **Goal 6, Veröffentlichung** (DONE 19.09.2026): Repo public unter
   github.com/matthiashippe/control-plane mit PolyForm Noncommercial, öffentliche Startseite und
   `/v1/status`, drei Antworten in den Conway-Issues #339, #377, #393, PR `xpaysh/awesome-x402#1564`
   (Stand 19.09. 18:00: offen, unkommentiert, keine Antwort auf die drei Kommentare).
7. **Goal 7, Nachfrage messen** (DONE 19.09.2026, `goals/2026-09-19-goal-7-nachfrage.md`,
   Ergebnis in `docs/research/2026-09-19-nachfrage.md`, Rohdaten in `docs/research/data/`): F1 bis F4
   beantwortet, GTM-Plan hier oben korrigiert.

**Nächstes Goal (Goal 8, aus der Konsequenz der Recherche):**
- `docs/ohne-control-plane.md`: der kostenlose Weg, belegt am Upstream-Code, inklusive der beiden
  Auswege (Ollama über `modelStrategy.inferenceModel`, `last_known_balance` in der lokalen
  KV-Tabelle) und der Grenze, an der er endet.
- Die restlichen Issue-Threads (#353, #355, #356, #359, #371, #372, #373, #376, #379, #380, #385, #390,
  #392) bekommen je eine Antwort, die zuerst das Problem des Fragenden löst und uns erst danach
  als Option nennt. Höchstens drei pro Tag.
- `.well-known/x402` und `llms.txt` auf cp.hippe.eu, damit andere Agenten den Dienst maschinell
  finden.
- HN-Artikel als Entwurf: die Daten im Mittelpunkt (Tod einer Agenten-Ökonomie in neun Monaten),
  der Dienst als Fußnote. Titel und Freigabe bei Matthias vor dem Posten.

**Danach (Prüfauftrag, kein Goal):** Taugt das Gebaute als generisches x402-Abrechnungs-Gateway für
andere Agenten-Dienste? SIWE-Provisionierung, Prepaid-Credits, idempotentes Settlement und
Abrechnung nach echten Einkaufskosten sind nicht Conway-spezifisch. Das ist der einzige Pfad, auf
dem die Zahl 1 bis 3k je wieder auftaucht, und deshalb der nächste Rechercheauftrag, nicht mehr
Reichweite für Conway-Flüchtlinge.

**Offen, ohne Goal:** Ops-Triage als Loop scharf schalten (`/loop 1d Run $ops-triage`, L1,
report-only, Datenquelle `ops/status.sh`, Schwellen in `ops/README.md`). Phase 2 (Sandboxes,
Social-Relay) erst, wenn Nachfrage messbar ist, also frühestens nach dem 19.10.

## Entscheidungen bei Matthias

- **Impressum: erledigt am 19.09.2026.** Anschrift von Matthias: Hanseatic Tech Company,
  Matthias Hippe, San-Francisco-Straße 1, 20457 Hamburg. Steht auf der Startseite unter
  `#impressum`, `/impressum` leitet dorthin, ein Test in `test/public.test.ts` hält es fest.
  **Noch zu prüfen, wenn die Angaben existieren:** USt-IdNr (Pflichtangabe nach § 5 DDG, sobald
  vorhanden), Registergericht und Registernummer (falls HTC eingetragen ist), und ob eine
  Telefonnummer gewünscht ist. Die E-Mail allein gilt als schneller Kontaktweg, ist aber die
  knappere Auslegung. Diese drei Angaben kenne ich nicht und habe sie deshalb weggelassen, statt
  etwas zu erfinden.
- **HN-Artikel**: Titel entschieden am 19.09.2026: "1,582 wallets funded an AI agent in February.
  By June, three were left." Der Text ist fertig (`docs/artikel-agentenoekonomie.md`). Offen bleibt,
  ob und wann er rausgeht; posten muss Matthias selbst. Vor dem Posten die Zahlen nachziehen, der
  Datensatz endet am 19.09.
- **Meldeweg für Ausfälle**: `ops/watchdog.sh` läuft, schreibt aber nur ins Log auf der VM, weil
  `CP_ALERT_WEBHOOK` nicht gesetzt ist. Welcher Dienst die Meldungen bekommt (ntfy, Slack, Discord),
  ist eine Entscheidung über einen Drittanbieter und liegt bei Matthias.
- **Steuerfrage**: USt auf Nutzungsguthaben, B2B-Ausland, Reverse Charge. Vor dem ersten
  Fremdnutzer zu klären, also im 30-Tage-Fenster.
- **Credit-Transfer** (`POST /v1/credits/transfer`, Runtime-Tools `transfer_credits`, `fund_child`):
  Handoff-Leitplanke sagt "nicht übertragbar" (E-Geld-Abgrenzung, Recherche 6.2), Constraints
  erlauben Transfer innerhalb des Control Plane. Phase 1 antwortet 501; Solo-Automatons brauchen
  ihn nicht. Option für später: Transfer nur zwischen Wallets desselben `creator_address`.
- Erledigt am 19.09.2026: Domain `cp.hippe.eu`, payTo `0x9141…d614`, SSH-Key auf `srv1336627`,
  Einkauf OpenRouter, Go für Go-to-Market, Weiterbetrieb trotz gemessener Marktgröße.

## Watch List

- **30-Tage-Messung**: fremde Automatons auf cp.hippe.eu, Ziel fünf bis 19.10.2026, Abschaltung
  unter drei.
- Upstream-Drift: `Conway-Research/automaton` main gegen `d8f8168` (Protokolländerungen an
  provision.ts, topup.ts, x402.ts, conway/client.ts, conway/inference.ts). Letzter Upstream-Commit
  26.08.2026 (README), letztes Release 27.02.2026, keine Maintainer-Antwort seit 07.03.2026.
- Reaktionen auf unsere Außenwirkung: Issues #339, #377, #393 und PR `xpaysh/awesome-x402#1564`.
- Facilitator-Preise: PayAI ab 21.09.2026 0,00212 USD je Settlement; CDP 1.000 frei pro Monat.
- OpenRouter-Guthaben: 19,81 USD Rest am 19.09.2026, fließt nur bei echter Nutzung ab.

## Recent Noise (ignored this run)

- Wallet `0x7f0376c6…d7b82` schickt in hoher Frequenz Mikrobeträge an Conways payTo (7 Transfers
  über zusammen 0,034 USDC in der Stunde vor 15:53 UTC am 19.09.). Hochgerechnet unter 25 USDC im
  Monat, ändert am Bild nichts, war im Vollscan enthalten.

---
Run log: loop-run-log.md
