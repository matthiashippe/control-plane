# GOAL.md

## Status
FREIGEGEBEN vom Skeptiker mit drei Aenderungen (HAN-24, eingearbeitet unten). Gebaut wird erst,
wenn Recht den Wortlaut zur E-Mail geliefert hat (HAN-26).

## Active Objective

**Goal 21: Wer kaufen will, sagt zuerst, was er braucht, und gibt eine E-Mail an. Erst dann geht
es zu Stripe.**

Nennt ausdruecklich **`src/payments/stripe.ts`**, weil `customer_email` dort in den Body der
Checkout Session kommt und `loop-constraints.md` den Pfad nur so oeffnet. Sonst nichts unter
`src/payments/**`, und `src/auth/**` bleibt zu.

Auftrag: HAN-23 (CEO, Entscheidung aus HAN-22). Glied: **Sagen**. Frist: live bis 01.10.2026,
18:00 UTC.

### Was gemessen ist, 29.09.2026

- `checkouts` in Produktion: 10 Zeilen, alle `stripe_test`, alle von uns, 0 davon mit Angaben
  oder Kontakt, weil es keine Spalte dafuer gibt (HAN-21).
- Der Knopf unter jedem Angebot schickt nur `angebot` und leitet sofort zu Stripe
  (`src/public/catalog.ts`, `buyForm`).
- **Den Entwurf der fuenf Bildschirme gibt es nicht.** HAN-10 hat Repo, Git und Paperclip
  durchsucht, der Workflow `der-mensch` ist nie gelaufen. Deshalb wird die kleinste Fassung
  gebaut, die der Auftrag zulaesst: eine gezielte Rueckfrage je Angebot als Textfeld plus E-Mail.
  Kein Chat, keine Nachfragen des Systems. Das fehlt und steht unten.
- Unsere eigenen Kaeufer lassen sich heute nicht erkennen: `ops/ours.*` gibt es nicht, und
  `checkouts` kennt keinen Kaeufer.

### Die Arbeit, in dieser Reihenfolge

1. **Tabelle `order_briefs`**, verknuepft ueber die Referenz, in `src/db.ts`:
   ```sql
   CREATE TABLE IF NOT EXISTS order_briefs (
     reference  TEXT PRIMARY KEY REFERENCES checkouts(reference),
     brief      TEXT NOT NULL CHECK (json_valid(brief)),
     email      TEXT NOT NULL CHECK (email LIKE '%_@_%._%'),
     created_at TEXT NOT NULL
   );
   ```
   Eine eigene Tabelle statt zwei Spalten an `checkouts`, weil SQLite an eine bestehende Tabelle
   keine `NOT NULL`-Spalte ohne Default haengt und die zehn alten Zeilen sonst die Regel brechen.
   Die `CHECK`s halten Zahl 1 auch dann, wenn ein spaeterer Code-Pfad die Pruefung vergisst.
   **Die E-Mail steht nur hier, nie in `checkouts.address`** (Skeptiker, HAN-24): `address` ist ein
   Fremdschluessel auf `wallets`, und `finishSettle` bucht fuer jede Zeile mit `address != null`
   einen Topup. Bei Angeboten bleibt `address` `null`, und `beginOfferCheckout` schreibt es
   ausdruecklich als `null`. `brief` ist JSON mit den Feldern des Angebots (siehe 4).
2. **`beginOfferCheckout(db, provider, { offerId, brief, email })`** in `src/checkout/index.ts`.
   Reihenfolge: eingeschaltet, Angebot bekannt, jedes Pflichtfeld des Angebots (siehe 4) erfuellt
   seine Mindestregel, `email`
   nach `trim` und Kleinschreibung hoechstens 254 Zeichen und `^[^\s@]+@[^\s@]+\.[^\s@]+$`. Jeder
   Fehler davon wirft 400 **bevor** Stripe gefragt und bevor eine Zeile geschrieben wird. Danach
   `provider.begin` mit der E-Mail, dann `checkouts` und `order_briefs` in **einer** Transaktion.
   Die alte Signatur mit nur der Angebots-ID verschwindet, damit der alte Weg nicht mehr erreichbar
   ist, auch nicht aus Code.
3. **`src/payments/stripe.ts`:** `begin` nimmt `email` und setzt `customer_email` im
   Form-Body des `POST /v1/checkout/sessions`. Nie in `success_url` oder `cancel_url`. Test gegen
   gestelltes `fetch`: `customer_email` steht im Body, und keine der beiden URLs enthaelt `@` oder
   die Adresse.
4. **Die Bestellseite `GET /katalog/bestellen?angebot=<id>`**, deutsch, im Rahmen von `/katalog`.
   Oben Name und Preis des Angebots, dann die Pflichtfelder des Angebots, dann ein Feld `email` (`type=email`, `required`, `autocomplete=email`),
   ein Satz zur Verwendung der Adresse (Wortlaut von Recht, siehe Blockers), der Knopf
   "Weiter zur Bezahlung". Das Formular geht per POST an `/katalog/kaufen`, die ID als verstecktes
   Feld. Ohne gueltige ID oder mit ausgeschaltetem Kartenweg: 303 nach `/katalog`, damit die
   Adresse keine eigene Seite fuer die Sitemap ist (wie `/katalog/danke`).
   **Pflichtfelder mit Mindestinhalt statt einer freien Frage** (Skeptiker, HAN-24: ein "x" darf
   nicht reichen). Sie stehen als `fields` an jedem Angebot in `OFFERS`; Zahlen nach `trim`:
   - Rede zum Fest: `anlass` (3 bis 200), `person` "Für wen ist die Rede?" (2 bis 200),
     `laenge` Auswahl 3, 5 oder 10 Minuten, `inhalt` "Was soll vorkommen: Namen, eine gemeinsame
     Geschichte?" (40 bis 4000).
   - Anschreiben zur Bewerbung: `stellenanzeige` "Fügen Sie die Stellenanzeige ein" (200 bis 8000),
     `erfahrung` "Was bringen Sie mit?" (40 bis 4000).
   - Text über Ihr Angebot: `was` (10 bis 2000), `fuer_wen` (5 bis 500), `wo` Auswahl Aushang,
     Faltblatt oder Internetseite.
   Zusaetzlich gilt fuer jedes Freitextfeld: mindestens zwei Woerter aus Buchstaben, damit
   "xxxxxxxxxx" nicht als Anlass durchgeht. Ein fehlendes oder zu kurzes Feld antwortet 400 mit dem
   deutschen Namen des Felds, die schon getippten Angaben bleiben im Formular stehen.
   **Gegenprobe in beide Richtungen, je Angebot ein Test:** alle Felder "x" gibt 400 und keine
   Zeile; die Beispielangabe unten gibt 303 nach Stripe und genau eine Zeile. Den Dialog von Gestalt
   gibt es nicht, deshalb stehen die Beispiele hier woertlich und sind die positive Probe:
   - Rede: Anlass "70. Geburtstag", Person "meine Mutter Ingrid", 5 Minuten, Inhalt "Sie war 35
     Jahre Grundschullehrerin in Kassel, singt im Kirchenchor und hat uns jeden Sommer an die
     Ostsee gefahren."
   - Anschreiben: eine Stellenanzeige von 400 Zeichen (Fixture `test/fixtures/stellenanzeige.txt`),
     Erfahrung "Sechs Jahre Buchhaltung in einem Handwerksbetrieb, DATEV, Jahresabschluss
     vorbereitet."
   - Angebot: Was "Fahrradreparatur mit Abholung", Für wen "Familien und Pendler im Viertel",
     Wo "Aushang"
5. **Der Knopf auf `/katalog`** wird ein Link auf die Bestellseite ("Bestellen"), kein Formular
   mehr. `POST /katalog/kaufen` ohne `angaben` oder ohne `email` antwortet 400 mit einem deutschen
   Satz und legt keine Zeile an.
6. **`/katalog/bestellen` kommt ins Rate-Limit** neben `/katalog/kaufen` und `/katalog/danke`.
7. **`ops/ours.txt`**: die Liste eigener Kaeufer, je Zeile `email <adresse>` oder
   `email-domain <domain>`, mit Datum und Grund. Erste Eintraege: `email-domain postyourprice.com`,
   `email-domain handsel.dev`. Eine Vorfuehrung benutzt immer eine Adresse unter
   `@postyourprice.com`. Keine persoenliche Adresse von Matthias in dieser Datei, weil das Repo
   oeffentlich ist. `ops/db-report.cjs` traegt dieselbe Liste als Kopie (es laeuft per stdin im
   Container und kann `ops/` nicht lesen), und ein Test haelt beide gleich, wie
   `test/ours.test.ts` es fuer die Wallets tut.
8. **`ops/db-report.cjs`, zwei Felder unter `market`:**
   - `order_chats_30d`: Zeilen in `order_briefs` der letzten dreissig Tage, deren E-Mail nicht in
     `ops/ours.txt` steht. Heisst: fremde Angaben, die bis zur Kasse gekommen sind.
   - `human_orders_paid_30d`: `checkouts` mit `status = 'paid'`, `provider = 'stripe'`,
     `settled_at` in dreissig Tagen, verknuepft mit `order_briefs`, E-Mail nicht unsere.
   - `human_orders_pending_30d`: dieselbe Grundgesamtheit mit `status = 'pending'` und aelter als
     eine Stunde. Ohne Webhook bucht nur die Rueckkehr auf `/katalog/danke` (Skeptiker, HAN-24);
     wer den Tab schliesst, bleibt `pending`. Diese Zahl macht eine Null in
     `human_orders_paid_30d` von Blindheit unterscheidbar.
   Gegenprobe im Test in beide Richtungen: eine gepflanzte fremde bezahlte `stripe`-Zeile zaehlt
   in beiden Feldern; dieselbe mit `@postyourprice.com` zaehlt in keinem; dieselbe fremde als
   `stripe_test` zaehlt in `order_chats_30d`, nicht in `human_orders_paid_30d`.
9. **`ops/traffic.sh`** zaehlt fremde Adressen mit `GET /katalog/bestellen` (Status 200) als
   `order_page_opened`, mit je einer Fixture im `--selftest` fuer "fremd zaehlt" und "eigene IP
   zaehlt nicht". Ohne diese Zahl ist die zweite widerlegende Messung (Gespraech geoeffnet, keiner
   an der Kasse) nicht lesbar.

10. **Test gegen die Gutschrift:** ein Angebot mit E-Mail, bezahlt und abgerechnet, erzeugt keine
    Zeile in `ledger` und keine in `wallets`; die Gegenprobe, ein Topup mit `address`, erzeugt
    genau eine.

### Done, gemessen und nicht behauptet

1. `pnpm test` und `pnpm e2e` gruen, bestehende Checkout-Tests ohne gelockerte Assertion. Wo ein
   Test heute `angebot` allein postet und 303 erwartet, ist genau das jetzt der Fehlerfall; der
   Test wird auf die neue Pflicht umgestellt und ein neuer haelt die 400 fest. Das ist keine
   Lockerung, sondern der Auftrag, und steht so im Commit.
2. Von aussen: `curl -d angebot=rede-zum-fest https://postyourprice.com/katalog/kaufen` antwortet
   400, und die Zahl der Zeilen in `checkouts` aendert sich dabei nicht (vorher und nachher lesen).
3. Vorfuehrung im Browser: Katalog, Bestellseite, Angaben und `vorfuehrung@postyourprice.com`,
   Testkarte `4242 4242 4242 4242`, Danke-Seite. Danach genau eine neue Zeile `paid`,
   `stripe_test`, mit Zeile in `order_briefs`, beide Felder nicht leer. Die Stripe-Kassenseite
   zeigt die E-Mail vorbelegt.
4. `SELECT count(*) FROM checkouts c LEFT JOIN order_briefs b USING (reference) WHERE
   c.created_at > <Deploy> AND c.offer IS NOT NULL AND b.reference IS NULL` ist **0**. Das ist
   Zahl 1 des Auftrags, aber sie ist per Bau erfuellt (Zahl 2 laesst keine Zeile ohne Angaben
   zu) und damit ein Test, keine Zahl. Sie bleibt als Wache gegen einen zweiten Code-Pfad.
   **Die Zahl, die zaehlt, ist eine Anzahl:** `order_chats_30d`, fremde Zeilen mit Angaben, die
   die Mindestregeln bestanden haben. Heute 0, und bis ein Kanal zu deutschsprachigen Kaeufern
   steht, bleibt sie 0 unter jeder Hypothese.
5. `ops/db-report.cjs` in Produktion: `order_chats_30d = 0`, `human_orders_paid_30d = 0`, obwohl
   die Vorfuehrung aus 3 in der Tabelle steht. Das ist die Gegenprobe gegen die eigene Zeile.

### Was dieses Goal nicht weiss und nicht tut

- **Kein Webhook.** Bezahlt wird nur gebucht, wenn der Kaeufer auf `/katalog/danke` zurueckkommt.
  Im Testmodus reicht das. Vor dem Live-Schalter braucht es einen Webhook oder das Nachfragen
  offener Sessions; das ist nicht dieses Goal und liegt beim CEO in HAN-22 (Besitzer und Frist).
- **Ob die Angaben fuer die Lieferung reichen**, prueft erst der naechste Auftrag (Bekommen):
  `ops/compete.ts` braucht einen `bounty`, und die Verbindung `checkouts` zu `bounties` ist hier
  ausdruecklich nicht Teil.
- **Die widerlegende Messung "fremde oeffnen, keiner kauft" widerlegt vor einem Kanal nichts**,
  weil bei rund vier fremden Besuchern aus der falschen Zielgruppe bis zum 10.10. beide Ausgaenge
  gleich wahrscheinlich sind (Skeptiker, HAN-24). Eine Null am 08.10. ist kein Beleg fuer die
  Huerde.

- **Es ist kein Gespraech.** Eine feste Rueckfrage, keine Nachfrage, die auf die Antwort
  eingeht. Ob das reicht, damit die Lieferkette drei brauchbare Fassungen schreibt, weiss niemand,
  weil es die Lieferung noch nicht gibt. Der naechste Auftrag (Bekommen) zeigt es.
- **Niemand schickt heute etwas an die E-Mail.** Sie wird gespeichert, nicht benutzt. Keine
  Bestaetigungsmail, kein Versand.
- Ob Stripe die E-Mail ohne `customer_email` ohnehin einsammelt, ist egal: bei uns kam sie bisher
  nicht an.
- Nicht Teil: `versions_per_order_median`, `orders_with_a_round_30d`, die Verbindung von
  `checkouts` zu `bounties`.
- `email-domain` als Merkmal ist eindeutig nur fuer Domains, die uns gehoeren. Ein eigener Kauf
  mit einer privaten Adresse faellt durch. Deshalb ist die Regel fuer Vorfuehrungen Pflicht, und
  jede Ausnahme kommt als `email`-Zeile in `ops/ours.txt`, bevor die Vorfuehrung laeuft.

### Blockers
- **Recht (CFO):** braucht die gespeicherte E-Mail einen Hinweis auf der Seite, und welchen
  Wortlaut? Vor dem Ausrollen, nicht danach.
- ~~Skeptiker~~: Urteil in HAN-24, freigegeben mit den Aenderungen oben.

(Historie: Goal 20, der Kartenweg im Stripe-Testmodus, in
`goals/2026-09-29-goal-20-kartenweg.md`.)
