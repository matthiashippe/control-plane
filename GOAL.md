# GOAL.md

## Status
VORSCHLAG, beim Skeptiker. Gebaut wird erst nach seinem Urteil (HAN-23).

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
     brief      TEXT NOT NULL CHECK (length(trim(brief)) > 0),
     email      TEXT NOT NULL CHECK (email LIKE '%_@_%._%'),
     created_at TEXT NOT NULL
   );
   ```
   Eine eigene Tabelle statt zwei Spalten an `checkouts`, weil SQLite an eine bestehende Tabelle
   keine `NOT NULL`-Spalte ohne Default haengt und die zehn alten Zeilen sonst die Regel brechen.
   Die `CHECK`s halten Zahl 1 auch dann, wenn ein spaeterer Code-Pfad die Pruefung vergisst.
2. **`beginOfferCheckout(db, provider, { offerId, brief, email })`** in `src/checkout/index.ts`.
   Reihenfolge: eingeschaltet, Angebot bekannt, `brief` nach `trim` 1 bis 4000 Zeichen, `email`
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
   Oben Name und Preis des Angebots, dann die Rueckfrage des Angebots als Beschriftung eines
   Textfelds `angaben`, dann ein Feld `email` (`type=email`, `required`, `autocomplete=email`),
   ein Satz zur Verwendung der Adresse (Wortlaut von Recht, siehe Blockers), der Knopf
   "Weiter zur Bezahlung". Das Formular geht per POST an `/katalog/kaufen`, die ID als verstecktes
   Feld. Ohne gueltige ID oder mit ausgeschaltetem Kartenweg: 303 nach `/katalog`, damit die
   Adresse keine eigene Seite fuer die Sitemap ist (wie `/katalog/danke`).
   Die drei Rueckfragen stehen als Feld `ask` an jedem Angebot in `OFFERS`, eine Zeile je Angebot,
   Entwurf:
   - Rede zum Fest: "Für wen ist die Rede, zu welchem Anlass, und was soll darin vorkommen? Namen, eine gemeinsame Geschichte, wie lang sie sein darf."
   - Anschreiben zur Bewerbung: "Um welche Stelle bei welcher Firma geht es, und was bringen Sie mit? Fügen Sie die Stellenanzeige gern hier ein."
   - Text über Ihr Angebot: "Was bieten Sie an, für wen, und wo soll der Text stehen: Aushang, Faltblatt oder Internetseite?"
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
   Gegenprobe im Test in beide Richtungen: eine gepflanzte fremde bezahlte `stripe`-Zeile zaehlt
   in beiden Feldern; dieselbe mit `@postyourprice.com` zaehlt in keinem; dieselbe fremde als
   `stripe_test` zaehlt in `order_chats_30d`, nicht in `human_orders_paid_30d`.
9. **`ops/traffic.sh`** zaehlt fremde Adressen mit `GET /katalog/bestellen` (Status 200) als
   `order_page_opened`, mit je einer Fixture im `--selftest` fuer "fremd zaehlt" und "eigene IP
   zaehlt nicht". Ohne diese Zahl ist die zweite widerlegende Messung (Gespraech geoeffnet, keiner
   an der Kasse) nicht lesbar.

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
   c.created_at > <Deploy> AND b.reference IS NULL` ist **0**. Das ist Zahl 1 des Auftrags und
   zugleich die Messung, die ihn widerlegt, sobald sie nicht 0 ist.
5. `ops/db-report.cjs` in Produktion: `order_chats_30d = 0`, `human_orders_paid_30d = 0`, obwohl
   die Vorfuehrung aus 3 in der Tabelle steht. Das ist die Gegenprobe gegen die eigene Zeile.

### Was dieses Goal nicht weiss und nicht tut

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
- **Skeptiker:** Urteil ueber diesen Vorschlag, vor dem Bau.

(Historie: Goal 20, der Kartenweg im Stripe-Testmodus, in
`goals/2026-09-29-goal-20-kartenweg.md`.)
