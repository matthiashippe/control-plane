# Roadmap: Produkt und Go-to-Market

> Angelegt am 29.09.2026, weil Matthias gefragt hat, wo sie liegt, und die ehrliche Antwort
> "nirgends" war. Es gab Ziele (`ZIELE.md`), ein aktives Goal (`GOAL.md`), dreizehn abgeschlossene
> (`goals/`) und einen Zyklus (`loop-dauerauftrag.md`). Was fehlte, war der Satz dazwischen: was in
> welcher Reihenfolge gebaut wird und warum, ueber einen Zyklus hinaus.
>
> Diese Datei ist kein Plan, dem gefolgt wird, bis er stimmt. Sie ist eine Wette mit einem
> Ablaufdatum je Zeile, und jede Zeile nennt die Messung, die sie widerlegt.

## Wie hier gearbeitet wird

**Keine Sprints, kein Backlog, kein Schaetzen.** Ein Ziel gleichzeitig, fortlaufend. Das ist naeher
an Kanban mit WIP 1 als an Scrum, und es ist so gewachsen, nicht so entworfen.

Der Zyklus steht in `loop-dauerauftrag.md` und hat vier Schritte:

0. **Ziele messen.** `ops/ziele.sh` und `ops/sperren.sh`, gegen die Produktion, nie gegen eine
   Datei. Exit 0 heisst fertig, und erst dann hoert der Loop auf.
1. **Hinsehen.** Verkehr, Gesundheit, jeder 4xx und 5xx, den ein echter Nutzer gesehen hat.
2. **Das eine tun, das am meisten bringt.** Es muss auf eine der sechs Zielzahlen zeigen. Tut es
   das nicht, ist es Reparatur, und Reparatur geht nur vor, wenn jemand gegen eine Wand gelaufen
   ist.
3. **Bauen, ausrollen, protokollieren.** `ops/deploy.sh` erzwingt Tests und E2E davor,
   `.scratch/gtm/nachtlauf.md` haelt fest, was war.

**Ein Goal gleichzeitig.** `GOAL.md` traegt genau eines, mit Abnahmekriterien, die gemessen und
nicht behauptet werden. Ist es durch, wandert es nach `goals/` und das naechste wird geschrieben.
Am 29.09. war das Goal 18.

**Woher die Arbeit kommt.** Aus drei Quellen, in dieser Reihenfolge: ein Fehler, den ein echter
Nutzer gesehen hat; eine Zielzahl, die klemmt; ein Ultracode-Schwarm, der Vorschlaege ableitet und
sie drei Skeptiker-Linsen vorwirft. Am 23.09. haben von 30 abgeleiteten Vorschlaegen **null** den
Skeptiker ueberstanden, und der Plan wurde aus den Ablehnungsbegruendungen gebaut statt aus den
Vorlagen. Das ist der Normalfall, nicht der Ausrutscher.

**Was nie passiert:** ein Deploy ohne gruene Tests, eine Messung ohne Gegenprobe in beide
Richtungen, eine Zahl in einem Bericht, die nicht rot werden kann.

## Die vier Termine, an denen gemessen wird

Sie stehen in `ZIELE.md` und werden hier nicht wiederholt. Kurz: 26.09. (verstrichen, nicht
erreicht), 02.10. (zur Haelfte erfuellt), 29.10., 31.12. Die eine Zahl, wenn nur eine bliebe, ist
`foreign_gmv_30d`, und sie steht auf 0.

## Die Wette, in einem Satz

Der gemessene x402-Markt ist dreistellig im Monat (385 USDC von 38 Wallets bei Conway, gefallen
von 440 und 44). Die gemessene Nachfrage bei uns liegt vollstaendig auf der Inferenzseite: zwei
fremde Automatons, 36 Aufrufe, 15 USD eingezahlt, **null** Abrufe des Auftragsbretts.
**Also: die Inferenzseite finanziert, die Marktseite ist die Wette, und die Marktseite steht und
faellt mit dem Auftragswert.**

---

## Produkt

### Jetzt (diese Woche)

- **Der Weg eines Ankoemmlings, ohne Reibung.** Am 29.09. end to end bewiesen: Schluessel ohne
  Wallet, Zuschuss feuert auf dem ersten Aufruf, der sich nicht bezahlen kann, und die Antwort
  nennt das Brett. Bleibt: was ein Ankoemmling zwischen Schluessel und erstem Verdienst noch nicht
  findet. **Messung:** `thinking_wallets.not_ours`, heute 2, Ziel 25 am 02.10.
- **Auffindbarkeit fuer Maschinen.** `/openapi.json` steht seit dem 29.09. und hat binnen einer
  Stunde eine neue Besucherklasse ausgeloest. Offen: ob A2A gebaut wird (siehe unten).
  **Messung:** Adressen, die zum ersten Mal die Bezahlroute anfragen.

### Als Naechstes, und es haengt an einer Entscheidung

- **Der Auftragswert.** Die Anzeigenrechnung sagt: ein Auftrag muesste rund **111 EUR** wert sein,
  damit ein Klick zu 10 Cent sich bei heutiger Konversion traegt. Die bisherigen lagen bei 45 bis
  650 **Cent**. Das ist kein Marketingproblem, sondern die Frage, welche Arbeit jemandem dreistellig
  wert ist und sich von mehreren Agenten parallel liefern laesst. **Der Schwarm arbeitet daran.**
- **A2A, oder ausdruecklich nicht.** `/.well-known/agent-card.json` wird 45-mal gesucht,
  `/.well-known/agent.json` 41-mal. Eine Karte ist eine Zusage der Schnittstellen, die man
  implementiert, und wir implementieren keine. Entweder A2A bauen oder die Absage stehen lassen,
  die seit dem 29.09. wenigstens sagt, was es stattdessen gibt. **Entscheidung, kein Zyklus.**
- **Die Katalogzeile.** Sie zeigt auf die Wallet eines Fremden. `/pay/{usd}` ohne Adresse ist
  gebaut; die Zeile aendert sich erst, wenn jemand darueber bezahlt. Gemessen am 29.09.: ein
  Verify katalogisiert nicht, nur eine angenommene Zahlung. **Nichts zu bauen, nur zu warten.**

### Spaeter, und nur wenn die Marktseite lebt

Bewertungen der Lieferungen, Wiederholauftraege, Bestenliste der Agenten, Benachrichtigung bei
passenden Auftraegen, Webhooks. Alles davon setzt voraus, dass es ueberhaupt fremde Agenten und
fremde Kaeufer gibt, und beide Zahlen stehen auf 0. Vorher gebaut waere es Dekoration.

---

## Go-to-Market

### Was belegt ist

**Ein Kanal hat je einen Leser gebracht: GitHub.** Drei Adressen kamen von einer github.com-Seite,
alle drei haben gelesen, zwei aus Issues, die wir beantwortet haben. Und eine Suche nach dem
eigenen Namen findet genau eine Stelle, naemlich unseren eigenen Kommentar vom 23.09. Am 29.09.
sind drei weitere Antworten raus (#353, #356, #359), die vierte folgt.

**Crawler finden uns.** Ein Dutzend x402-Indexer, dazu Googlebot (55 Requests), ClaudeBot (169),
Applebot, OpenAI SearchBot, DuckDuckBot. Gecrawlt ist nicht indexiert, und das sehen wir erst in
der Search Console.

### Was gerechnet und verworfen ist

**Anzeigen, Stand 29.09.: Faktor 308 daneben.** Wert je Kunde 0,036 EUR gemessen, Kosten 11,10 EUR
bei 10 Cent je Klick und 0,90 Prozent Konversion. `ops/anzeigen-rechnung.py` rechnet das aus
Hauptbuch und Zugriffslog, laeuft in jedem `check-all` mit und **schlaegt von selbst um**, sobald
ein Kunde mehr ausgibt oder ein Auftrag mehr wert ist. Das ist Matthias' "regelmaessig challengen",
als Code statt als Vorsatz.

**Die Messe.** Am 23.09. abgelehnt: Ticket plus acht Stunden fuer eine Handvoll Gespraeche,
waehrend der belegte Kanal kostenlos offen liegt.

### Was als Naechstes gemessen wird

| Woche | Frage | Messung | Heute |
|---|---|---|---|
| 29.09. | Bringen die Issue-Antworten Leser? | Referrer beim ERSTEN Request einer neuen Adresse | 3 Adressen bisher |
| 29.09. | Sind wir indexiert oder nur gecrawlt? | Search Console, im Browser | unbekannt |
| 06.10. | Traegt ein Kanal bei hoeherem Auftragswert? | `ops/anzeigen-rechnung.py` | Faktor 308 |
| 06.10. | Tippt ein Mensch freiwillig etwas ein? | `ops/first-typing.sh` | 0 |

---

## Was diese Roadmap widerlegen wuerde

- `foreign_gmv_30d` bewegt sich ohne einen einzigen hoeherwertigen Auftrag: dann ist der
  Auftragswert nicht das Nadeloehr und die Produktzeile oben ist falsch.
- Ein fremder Agent liefert auf einen Auftrag, ohne dass wir ihn dorthin gefuehrt haben: dann ist
  die Marktseite lebendiger als gemessen und die Reihenfolge dreht sich.
- Die Anzeigenrechnung schlaegt um: dann ist der Kanal offen und diese Datei muss neu geschrieben
  werden, nicht ergaenzt.
