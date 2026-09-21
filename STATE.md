# Loop State: control-plane

Last run: 2026-09-20 18:50 UTC (Auftragsmarkt vollstaendig live, Richtungswechsel am Nachmittag)

## Lage (Stand 20.09.2026)

**Die Richtung hat sich heute gedreht, und die alte Lage unten stimmt weiter, taugt aber nicht
mehr als Plan.** Der Conway-Markt ist gemessen winzig (290 bis 430 USDC im Monat von 44 Wallets),
und die Nachfragemessung vom 19.09. bleibt gueltig. Neu ist die Erklaerung dafuer, und sie
stammt aus drei Recherchen vom 20.09.: Die 1.582 Wallets im Februar waren kein Produktsog, sondern
ein Token-Launch. Sigil Wen veroeffentlichte am 18.02.2026 ein Manifest, der Tweet kam auf 3,8 Mio.
Views, binnen Tagen standen 18.000 registrierte Agenten, und der CONWAY-Token ueberschritt
kurzzeitig 11 Mio. USD Marktkapitalisierung; heute steht er 90,7 Prozent unter dem Hoch. Von den
18.000 Registrierungen wurden 2.492 Zahler, davon 41,6 Prozent einmalig. Wir haben also nie
Nachfrage nach dem Produkt gemessen, sondern nach einer Spekulationsgelegenheit, die es nicht mehr
gibt.

**Woran Conway wirklich gestorben ist, ist ein Konstruktionsfehler, kein Interessenverlust.** Es
hat 18.000 Verkaeufer erzeugt und keinen einzigen Kaeufer. Jeder Agent bekam dieselbe Anweisung,
"the only path to survival is honest work that others voluntarily pay for", und es gab niemanden,
der zahlte. Belege aus dem eigenen Tracker: `mayanli200011-glitch` nach 14 Tagen mit 276
erledigten Zielen, 0 bezahlten, 39,26 USD Kosten und 0,00 USD Umsatz; `EarnSuperman` nach einer
Woche: "Built 7 paid services, complete silence from customers. Nobody is using x402 payments.
It's a ghost town."

**Das ist die Gelegenheit.** Wir drehen den Markt um und liefern die Nachfrageseite selbst: Ein
Mensch schreibt Arbeit mit Preis und Frist aus, mehrere Agenten konkurrieren, der Kaeufer waehlt,
der Gewinner wird bezahlt. Damit wird jeder Satz wahr, den Conway behauptet und nie eingeloest
hat. Der Control Plane ist dabei nicht das Produkt, sondern die Zahlungsschiene darunter und der
Weg, auf dem Agenten hereinkommen.

**Belegt am 20.09.:** Drei Agenten, die sich nur im Genesis-Prompt unterscheiden, arbeiten
dieselben Briefings in drei Maerkten. Alle halten Wortlimit und Sperrlisten, der Prompt entscheidet
sichtbar ueber die Qualitaet, und alle drei rechnen im Dubai-Expose unaufgefordert die
Jahres-Service-Charge aus, nach der das Briefing verlangt. Einer erfindet dabei eine Zusage, fuer
die der Verkaeufer haftet, und die Pruefung faengt genau diesen Satz. Rohdaten unter CC0 in
`docs/research/data/2026-09-20-auftragstest.json`.

| Auftrag | Preis | Produktion, 3 Bewerber | Verhaeltnis |
|---|---:|---:|---:|
| Tischlerei Hamburg | 2,00 EUR | 0,0655 USD | 33-fach |
| Hundesalon Austin | 5,00 USD | 0,0449 USD | 111-fach |
| Wohnung Dubai Marina | 8,00 USD | 0,0444 USD | 180-fach |

**Maerkte: USA und Dubai, nicht Deutschland** (Entscheidung Matthias, 20.09.). Sie zahlen das Zwei-
bis Vierfache bei niedrigeren Produktionskosten.

**Das Risiko ist unveraendert und es ist nicht die Technik: uns fehlt der Verstaerker.** Conways
Verstaerker war ein Tweet mit Reichweite plus ein Token. Die Belege fuer Einzelentwickler ohne
Publikum sind ernuechternd: Show-HN-Median 2 Punkte bei rund 826 Einreichungen pro Woche, die
beiden x402-Projekte von Einzelentwicklern bekamen 14 und 10 Punkte; itch.io-Median 113 Downloads;
AI Village, die bestausgefuehrte Nicht-Krypto-Fassung dieser Idee, sammelte in neun Monaten 2.000
USD und 98 Substack-Abos. **Deshalb sind Name, Positionierung, Website, Integrationen und GTM
keine Kosmetik, sondern der eigentliche Engpass.**

**Was gegen den Tod durch Sterblichkeit spricht** (Genre-Recherche 20.09.): In keinem belegten Fall
hat Permadeath allein Retention erzeugt; er erzeugt eine Geschichte, und die ist nach einer Sitzung
erzaehlt, was die 2,4 Stunden Median-Verweildauer bei Conway erklaert. Wo Bindung belegt ist,
stehen immer dieselben drei Dinge: Fortschritt, der ohne den Nutzer verfaellt, ein Zeitpunkt, zu
dem er wiederkommen muss, und ein Verlust, den er gegen Einsatz abwenden kann. Der Auftragsmarkt
liefert alle drei ohne Zutun.

**Messgroesse, neu und gestaffelt:**
1. **Der erste fremde Auftraggeber bis 19.10.2026.** Ablesbar als `bounty_hold`-Zeile im Ledger von
   einer Adresse, die nicht uns gehoert.
2. **Zehn vergebene Auftraege von fremden Kaeufern bis 19.11.2026.** Ablesbar als `bounty_award`-
   Zeilen, deren Auftrag einen fremden `creator` hat.
   Die alte Messgroesse (fuenf fremde Automatons bis 19.10.) bleibt als Nebenzaehler bestehen,
   Stand 1, weil sie dieselbe Frage von der Angebotsseite stellt.

**Positionierung, neu:** Nicht "wir ersetzen Conway", auch nicht mehr nur "wir liefern die
Abrechnungsschicht", sondern: **hier wird Arbeit ausgeschrieben, um die Agenten konkurrieren, und
der Gewinner wird bezahlt.** Wer die Runtime schon hat, kommt ueber die Conway-Kompatibilitaet
herein; das ist der Eingang, nicht die Ueberschrift. Der genaue Wortlaut ist Goal 8.

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

8. **Goal 8, Der kostenlose Weg und die Auffindbarkeit** (DONE 20.09.2026):
   `docs/without-control-plane.md`, `/.well-known/x402`, `/llms.txt`, drei Issue-Antworten,
   HN-Artikel postfertig in `.scratch/gtm/hn-post.txt`.
9. **Goal 9, Der Auftragsmarkt** (DONE 20.09.2026, Zyklen 53 bis 59 in `.scratch/gtm/nachtlauf.md`):
   `POST /v1/check` mit beiden Auftragsarten, Auftraege mit Hinterlegung im Ledger
   (`/v1/bounties`, `cancel`, `award`), Einreichungen (`/v1/submissions`), Verfall bei abgelaufener
   Frist, oeffentliche Liste unter `/bounties.json`, zehn Prozent Vermittlungsgebuehr,
   `docs/bounties.md`. 248 Tests, `pnpm e2e` gruen, `harness/e2e/markt.ts` sagt `MARKT OK` gegen
   die Produktion.

**Ab hier ist der Engpass nicht mehr der Bau.** Der Markt ist fertig, beschrieben und oeffentlich
einsehbar, und niemand weiss davon. Die naechsten vier Goals sind deshalb Name, Positionierung,
Website, Verteilung und GTM. Sie sind keine Kosmetik: Die Recherche vom 20.09. sagt, dass genau
hier Conway seinen Vorsprung hatte (ein Tweet mit 3,8 Mio. Views) und dass Einzelentwickler ohne
Publikum daran scheitern. Matthias am 20.09.: "nicht halbgar sondern komplett insane verfolgen".

10. **Goal 10, Positionierung und Name** (DONE 20.09.2026, `goals/2026-09-20-goal-10-name.md`): Ein Satz, der sagt, was das ist, und ein Name, der
    ihn traegt.
    Done: (a) Ein Satz mit hoechstens fuenfzehn Woertern, der ohne Vorwissen verstaendlich ist und
    den Markt nennt, nicht die Technik. Pruefung: Ein Fremder, der die Seite zum ersten Mal sieht,
    kann nach einmaligem Lesen sagen, was er hier tun kann und was es kostet. (b) Ein Name:
    aussprechbar auf Englisch, kein deutsches Wort, keine Kollision mit einem bestehenden
    KI- oder Marktplatzprodukt (geprueft ueber Suche, npm, GitHub und Markenregister-Schnellsicht),
    Domain verfuegbar oder glaubwuerdige Alternative. (c) Name und Satz stehen in `<title>`, `h1`,
    den Open-Graph-Angaben, `/llms.txt`, der Repo-Beschreibung und `docs/bounties.md`.
    (d) Ein Test in `test/public.test.ts` haelt fest, dass die Startseite mit dem Markt beginnt und
    nicht mit der Conway-Kompatibilitaet.
11. **Goal 11, Die Website** (DONE 21.09.2026, `goals/2026-09-21-goal-11-website.md`): Die
    Startseite fuehrt den Markt, nicht die Abrechnungsschicht.
    Done: (a) Oberhalb der ersten Bildschirmkante beantwortet die Seite drei Fragen: was ist das,
    was kostet es mich, was tue ich zuerst. (b) Der Beleg steht drauf und ist echt: ein Briefing,
    die konkurrierenden Einreichungen, der Befund der Pruefung, die Kosten. (c) Conway-Kompatibilitaet
    wird zum Abschnitt "wie ein Agent hier ankommt". (d) Unveraendert gilt: keine externen
    Ressourcen (CSP), kein Tracking, lesbar in Telefonbreite, `ops/smoke.sh` gruen. Aenderungen am
    Inline-Skript brauchen den CSP-Hash im Caddyfile und damit Matthias.
    Stand 21.09.2026: (a) bis (d) erfuellt. Die Seite wurde neu gebaut, nachdem Matthias sie
    ansah: "das ist doch keine website das ist ein text block". Alle vier Kriterien waren erfuellt
    und die Seite war trotzdem falsch, weil in keinem von ihnen stand, was er wirklich gesagt
    hatte: maximal modern. Das Nachtragsblatt haelt das fest, samt der Korrektur meiner eigenen
    Fehldiagnose, die Website sei nie als Ziel notiert worden. Sie war es, hier, seit dem 20.09.
12. **Goal 12, Verteilung dorthin, wo Agenten schon leben** (DONE 21.09.2026): Ein Agent soll mitbieten koennen, ohne
    dass sein Betreiber Code schreibt.
    Done: (a) Ein MCP-Server, ueber den ein beliebiger Agenten-Host offene Auftraege sieht,
    einreicht und den Befund der Pruefung liest. (b) Eine fertige Skill-Datei fuer die
    Conway-Runtime, die einen bestehenden Automaton mitbieten laesst, ohne Patch am Upstream.
    (c) Die Werkzeugdefinitionen im OpenAI-Format in `docs/bounties.md`. (d) Jeder Weg einmal gegen
    die Produktion gefahren und im Abnahmelauf festgehalten. **ERLEDIGT am 20.09.2026:**
    `ops/mcp-against-production.ts` sagt `MCP PRODUCTION OK` gegen cp.hippe.eu, mit eigenem
    Wegwerf-Auftrag statt auf einem echten.
    Status 20.09.2026: (a) bis (c) gebaut. `mcp/server.mjs` ist eine Datei ohne Abhaengigkeiten und
    ohne Build-Schritt, stdio, fuenf Werkzeuge (`list_open_bounties`, `submit_work`,
    `read_my_submission`, `check_submission`, `read_balance`), Schluessel aus `CP_API_KEY`,
    Basis-URL aus `CP_URL` mit Default `https://cp.hippe.eu`. `skills/cp-bounties/SKILL.md` liegt
    im Format der Upstream-Defaults (Pin d8f8168) und wird nur ins Skills-Verzeichnis kopiert. Die
    Werkzeugdefinitionen in `docs/bounties.md` werden aus denselben Schemata erzeugt, ein Test
    faellt bei Abweichung. 33 neue Pruefungen, jede mit Gegenprobe, `pnpm test` bei 281.
    Stand 21.09.2026: (a) bis (d) erledigt, und die damals offene Sichtbarkeit ebenfalls.
    `/llms.txt` und die Startseite nennen den MCP-Weg, der Server hat inzwischen sechs Werkzeuge
    (`read_my_submissions` kam am 21.09. dazu, weil ein Host sonst nie erfaehrt, was aus seiner
    Einreichung wurde), und ein Schluessel braucht keine Runtime mehr: vier Aufrufe und eine
    Ethereum-Signatur, aufgeschrieben in `docs/api-key.md`.
    **Was weiterhin fehlt, ist kein Bauteil:** ausser uns hat niemand einen dieser Wege benutzt.
    Das ist Goal 13 und liegt bei Matthias.
13. **Goal 13, GTM mit Kill-Kriterium** (AKTIV; der Plan steht, das Ausfuehren liegt bei Matthias):
    Ein Plan, der eine Zahl nennt, ab der er beendet wird.
    Done: (a) Jeder Kanal mit gemessener Ausgangslage statt Hoffnung, in der Reihenfolge, in der er
    gefahren wird, mit Datum. (b) Der Artikel, die Reddit-Beitraege und die Issue-Antworten haengen
    darin und nicht daneben. (c) Eine Abbruchbedingung je Kanal, formuliert als Zahl und Datum.
    (d) Nichts davon geht ohne Matthias nach draussen; der Plan sagt, was er tun muss und wann.
14. **Goal 14, Der Markt ist nie leer** (GEBAUT 21.09.2026, WIRKUNG OFFEN): Ein Marktplatz ohne
    Auftraege ueberzeugt niemanden.
    Done: (a) Matthias schreibt Arbeit aus, die er tatsaechlich braucht, und sie steht oeffentlich
    in `/bounties.json`. (b) Jeder vergebene Auftrag erzeugt einen oeffentlichen Beleg: Briefing,
    alle Einreichungen, die Befunde, die Kosten, der Gewinner. Das ist zugleich der Inhalt, mit dem
    sich der Markt bewerben laesst, und es ist der Beleg, den in diesem Feld sonst niemand liefert.
    (c) Der erste vollstaendige Umlauf mit echtem Geld ist gefahren und dokumentiert.
    Stand 21.09.2026: (a) zwei offene Auftraege ueber 150 und 250 Cent stehen in `/bounties.json`.
    (b) `/receipts.json` gibt es seit dem 21.09., ohne Schluessel, mit Briefing, Preis, Gebuehr,
    allen Einreichungen und dem Gewinner; was vor der Stichzeit eingereicht wurde, wird gezaehlt
    und zurueckgehalten, weil jenen Agenten niemand gesagt hatte, dass ihre Arbeit veroeffentlicht
    wird. (c) Der erste Umlauf lief am 20.09. mit echtem Geld, Beleg in
    `docs/research/data/2026-09-20-first-cycle.json`.
    **Offen bleibt der Sinn des Ziels:** der Markt ist nicht leer, aber alles darin ist von uns.
    Null fremde Kaeufer, null fremde Agenten.

**Gateway-These: geprüft und gescheitert** (19.09.2026, `docs/research/2026-09-20-x402-gateway.md`).
Der x402-Markt selbst ist echt und wächst: on-chain gemessen nehmen die zehn größten Verkäufer
3.407 USDC je Woche ein, rund 14.500 im Monat, das 34-fache des Conway-Marktes, und die
npm-Downloads von `x402` sind zwölf Monate in Folge gestiegen. Die These scheitert trotzdem, und
zwar an der Konkurrenz statt an der Nachfrage: **Jeder untersuchte Kandidat hat die
Abrechnungsschicht bereits**, mehrere davon unter MIT-Lizenz veröffentlicht. BlockRun.AI stellt mit
ClawRouter genau unsere Architektur offen bereit (6.606 Sterne, 651 Forks). Wir würden nicht gegen
einen Preis konkurrieren, sondern gegen null.

Damit ist der letzte Pfad zu den ursprünglich anvisierten 1 bis 3k USD zu. Was bleibt, ist der
30-Tage-Test mit fünf zahlenden Betreibern als Messgröße, und danach die ehrliche Entscheidung, ob
der Dienst für 10 EUR im Monat weiterläuft, weil er jemandem nützt, oder ob er abgeschaltet wird.

**Nebenbefund, der zum Nachdenken taugt:** Unser eigener Automat auf `srv1327036` kauft über seinen
x402-Shim seit Tagen bei JarvisClaw ein, also bei genau der Sorte Dienst, die diese Recherche als
Wettbewerb ausweist. Wir sind Kunde des Marktes, in den wir verkaufen wollten.

**Offen, ohne Goal:** Ops-Triage als Loop scharf schalten (`/loop 1d Run $ops-triage`, L1,
report-only, Datenquelle `ops/status.sh`, Schwellen in `ops/README.md`). Phase 2 (Sandboxes,
Social-Relay) erst, wenn Nachfrage messbar ist, also frühestens nach dem 19.10.

15. **Goal 15, Das Journeybuch** (DONE 20.09.2026, `docs/journeys.md`, seitdem bei jeder
    Aenderung nachgezogen):
    `docs/journeys.md` ist die Referenz, gegen die alles andere geprueft wird. Matthias am 20.09.:
    "das ist unsere bibel, denn erst wenn es auf beiden seiten etwas gibt dann geht es".
    Done: (a) Beide Seiten vollstaendig, je Schritt was passiert, welcher Endpunkt beruehrt wird,
    was er kostet und ein Zustand aus `works`, `breaks` oder `missing` samt dem Goal, das ihn
    schliesst. (b) Jede Behauptung `works` ist mit einem Test oder einem ops-Aufruf belegt, der
    fehlschlaegt, wenn sie aufhoert zu stimmen; die Belegtabelle steht am Ende des Dokuments.
    (c) Die Fehlerwege sind mitgezeichnet, also was passiert, wenn niemand einreicht, alles
    schlecht ist, der Kaeufer verschwindet oder einem Agenten mitten in der Arbeit das Geld
    ausgeht. (d) Ein Kaltstart-Abschnitt sagt die Reihenfolge, in der die beiden Seiten gefuellt
    werden, und nennt die eine Zahl, an der man sieht, dass es funktioniert hat.
    (e) `ops/journeys-pruefen.sh` haelt jeden im Dokument genannten Pfad gegen die laufende
    Instanz, mit Gegenprobe: ein erfundener Pfad muss den Lauf rot machen.
    Status: (a) bis (e) erledigt am 20.09.2026. Offen bleiben zwei Entscheidungen, die im Dokument
    benannt und nicht entschieden sind: ob eine Einreichung ihre Herkunft ausweisen muss (B3), und
    was passiert, wenn ein Kaeufer nach der Vergabe widerspricht.

**Drei Entscheidungen vom 20.09.2026, getroffen im Loop.** Matthias hat die Entscheidungsgewalt
ausdruecklich abgegeben ("du entscheidest weiterhin alles aber deterministisch und aus den personas
raus"). Jede folgt aus dem Journeybuch, nicht aus Geschmack:

- **Der Name ist Handsel.** Abgeleitet aus dem Kaltstart: Die Nachfrage kommt ueber einen Kanal und
  nicht ueber die Suche, also ist die Verwechslungsgefahr mit Handshake heute klein und waechst
  erst spaeter. Der Beiklang von Piecework (Akkordarbeit) trifft dagegen sofort und dauerhaft genau
  den Nerv, um den es bei Maschinen, die um Geld arbeiten, ohnehin geht. Bidwork ist irrefuehrend,
  weil hier nicht mit einem Preis geboten wird. Handsel benennt als einziger die Mechanik, die
  sonst niemand hat.
- **Eine Einreichung traegt eine gemessene Tatsache ueber ihre Herkunft, keine Behauptung.** Wir
  rechnen die Inferenz ab, also wissen wir, ohne jemanden zu fragen, wie viel eine Adresse zwischen
  dem Ausschreiben und dem Einreichen fuers Denken ausgegeben hat. Diese Zahl steht an der
  Einreichung. Sie beweist nichts, und genau das steht daneben; sie macht den ehrlichen Fall
  sichtbar und den unehrlichen teuer. Die Zuschauer-Persona braucht das, der Kaeufer bekommt ein
  zweites Signal umsonst.
- **Die Vergabe ist endgueltig.** Eine Rueckabwicklung hiesse, einem Agenten Credits wieder
  wegzunehmen, und jemand muesste beurteilen, ob das richtig ist. Dieser Jemand ist eine einzelne
  Person, und sobald sie es versucht, wird jeder Streit zu einer Verhandlung mit dem Betreiber und
  der Ledger hoert auf, die Wahrheit zu sein. Der Aufwand liegt deshalb vor der Vergabe: alle
  Einreichungen sehen, pruefen lassen, bewusst vergeben, oder nichts vergeben und das Geld
  zurueckbekommen.

## Entscheidungen bei Matthias

- **Impressum: erledigt am 19.09.2026.** Matthias betreibt den Dienst als Privatperson ohne
  Gewerbe, deshalb steht dort kein Firmenname mehr, sondern: Matthias Hippe,
  San-Francisco-Straße 1, 20457 Hamburg, plus E-Mail und Verantwortlicher nach § 18 MStV. Auf der
  Startseite unter `#impressum`, `/impressum` leitet dorthin, ein Test in `test/public.test.ts`
  hält es fest. USt-IdNr und Registereintrag entfallen mangels Gewerbe; eine Telefonnummer ist
  nicht angegeben, weil die E-Mail als schneller Kontaktweg gilt.
  **Wichtig, unabhängig vom Gewerbe:** Die Impressumspflicht nach § 5 DDG bleibt bestehen, weil
  der Dienst entgeltlich ist. "Privat" heißt hier nur, dass keine Firma dahintersteht, nicht dass
  die Pflichten entfallen. Dasselbe gilt für die Steuerfrage unten: Einnahmen aus dem Verkauf von
  Credits sind steuerpflichtig, auch ohne Gewerbeanmeldung.
- **HN-Artikel**: Titel entschieden am 19.09.2026: "1,582 wallets funded an AI agent in February.
  By June, three were left." Der Text ist fertig (`docs/artikel-agentenoekonomie.md`). Offen bleibt,
  ob und wann er rausgeht; posten muss Matthias selbst. Vor dem Posten die Zahlen nachziehen, der
  Datensatz endet am 19.09.
- **Meldeweg für Ausfälle: erledigt am 19.09.2026.** `ops/watchdog.sh` meldet über ein ntfy-Topic,
  die URL liegt in `~/brain/connectors/secrets.env` (nicht hier, das Repo ist öffentlich) und im
  Crontab der VM. Ende zu Ende geprüft. Damit Matthias die Meldungen auf dem Handy bekommt, muss er
  das Topic einmal in der ntfy-App abonnieren; die URL im Browser zu öffnen reicht am Rechner.
- **Steuerfrage**: USt auf Nutzungsguthaben, B2B-Ausland, Reverse Charge. Vor dem ersten
  Fremdnutzer zu klären, also im 30-Tage-Fenster. Seit dem 19.09. mit dem Zusatz, dass kein Gewerbe
  angemeldet ist: Das ändert nichts an der Steuerpflicht der Einnahmen, kann aber die Frage
  aufwerfen, ab welchem Umfang die Tätigkeit als gewerblich gilt. Bei fünf Automatons in 30 Tagen
  ist das theoretisch, bei Erfolg nicht mehr.
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
