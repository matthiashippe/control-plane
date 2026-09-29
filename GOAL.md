# GOAL.md

## Status
VORSCHLAG (HAN-30, 29.09.2026). Wird vor dem Bau vom Skeptiker widerlegt. Gebaut wird erst, was
danach uebrig ist.

## Active Objective

**Goal 22: Jede in Stripe bezahlte Session steht in `checkouts` als bezahlt, auch wenn der Kaeufer
nicht auf `/katalog/danke` zurueckkommt. Danach nimmt der Code einen Live-Schluessel an.**

Nennt ausdruecklich **`src/payments/stripe.ts`**, weil dort `expires_at` in den Body der Session
kommt. Sonst nichts unter `src/payments/**`, und `src/auth/**` bleibt zu.

Auftrag: HAN-30 (CEO, Entscheidung aus HAN-22). Glied: **Bezahlen**. Frist: ausgerollt bis
05.10.2026, 18:00 UTC. Den Live-Schluessel setzt Matthias in `deploy/.env` (gesperrter Pfad), der
Schreiber sagt ihm Bescheid (HAN-31).

### Was gemessen ist, 29.09.2026

- Gebucht wird nur in `GET /katalog/danke` ueber `settleCheckout` (`src/app.ts`, Route
  `/katalog/danke`). Wer nach der Zahlung den Tab schliesst, bleibt `pending`, fuer immer.
- `checkoutEnabled()` nimmt nur `sk_test_`/`rk_test_` oder `CP_CHECKOUT=1`
  (`src/checkout/index.ts:67`). `test/stripe-checkout.test.ts:164` haelt fest, dass ein
  Live-Schluessel allein den Weg **nicht** oeffnet.
- `beginOfferCheckout` fragt zuerst Stripe und schreibt erst danach die Zeile. Scheitert die
  Transaktion dazwischen, gibt es eine Session in Stripe ohne Zeile bei uns, und der Kaeufer kann
  sie bezahlen. Heute sieht das niemand.
- Die Session laeuft mit Stripes Voreinstellung nach 24 Stunden ab. Solange weiss niemand, ob eine
  offene Zeile abgebrochen ist.

### Warum Abgleich und kein Webhook

Ein Webhook braucht ein Signatur-Geheimnis in `deploy/.env` (Matthias), einen Endpunkt, den jemand
in Stripe eintraegt, und eine neue oeffentliche Route, die Stripe-Signaturen prueft. Der Abgleich
braucht nichts davon: er fragt dieselbe Session mit demselben `read`, das `/katalog/danke` heute
schon benutzt, also mit derselben Pruefung (Betrag aus der Zeile, Modus aus Stripe, bedingtes
`UPDATE`). Er ist langsamer, hoechstens fuenf Minuten, und das reicht, weil heute niemand auf die
Buchung wartet. Ein Webhook kann spaeter dazukommen; der Abgleich bleibt dann das Netz darunter.

### Die Arbeit, in dieser Reihenfolge

1. **`reconcileCheckouts(db, provider, now)`** in `src/checkout/index.ts`. Liest alle Zeilen mit
   `status = 'pending'`, `provider = provider.name` und `created_at` aelter als zwei Minuten und
   juenger als 48 Stunden, hoechstens 100 je Lauf, aelteste zuerst. Fuer jede ruft es
   `settleCheckout(db, provider, { session_id: reference })` und faengt jeden `CheckoutError` einzeln
   ab, damit eine kaputte Zeile die anderen nicht aufhaelt. Rueckgabe: je eine Zahl fuer `paid`,
   `abandoned`, `open`, `error`. Eine Logzeile je Lauf mit genau diesen vier Zahlen, keine Referenz,
   keine E-Mail. Laeuft nicht, wenn `checkoutEnabled()` falsch ist oder kein Provider da ist.
2. **`src/index.ts`**: einmal beim Start, danach alle fuenf Minuten, neben `cleanup`, mit
   `.unref()`. Ein Fehler im Lauf landet im Log und beendet den Prozess nicht.
3. **`src/payments/stripe.ts`**: `begin` setzt `expires_at` auf jetzt plus 60 Minuten. Damit ist
   eine abgebrochene Session nach spaetestens 65 Minuten `abandoned` statt nach 24 Stunden. Test
   gegen gestelltes `fetch`: `expires_at` steht im Body, liegt zwischen 30 Minuten und 24 Stunden
   (Stripes Grenzen) und in keiner URL.
4. **Der Live-Schalter.** `checkoutEnabled()` nimmt zusaetzlich `isStripeLiveKey`. Damit ist ein
   Live-Schluessel allein genug, und das ist Absicht: den Schluessel setzt Matthias, und genau das
   ist der Schalter. Die Zeile heisst dann `stripe`, nicht `stripe_test` (`stripeProviderName`, gibt
   es schon), und die Testmodus-Zeile auf Katalog, Bestellseite und Danke-Seite verschwindet.
   **Der Test `stays off with a live key alone` wird ersetzt, nicht gelockert:** HAN-17 hat ihn
   geschrieben mit dem Satz "Live needs a switch of its own, set by a later goal". Dies ist dieses
   Goal. Der neue Test haelt beide Richtungen: `sk_live_`/`rk_live_` schaltet ein und benennt die
   Zeile `stripe`; kein Schluessel, `pk_live_`, `sk_liv_x` und ein leerer String schalten nicht
   ein. Das steht so im Commit.
5. **Tests fuer den Abgleich, gegen gestelltes `fetch`, Gegenprobe in beide Richtungen:**
   - bezahlte Session, niemand ruft `/katalog/danke`: nach einem Lauf `paid`, `settled_at` gesetzt;
   - abgelaufene Session: `abandoned`, kein `settled_at`;
   - offene Session: bleibt `pending`, und ein zweiter Lauf fragt sie wieder;
   - eine Zeile mit `provider = 'stripe_test'`, gelesen mit einem Live-Provider: wird nicht gefragt
     (sonst geht der Test-Bestand nach dem Schluesseltausch mit dem Live-Schluessel an Stripe);
   - Stripe antwortet 500 fuer eine Zeile: die naechste Zeile wird trotzdem gebucht;
   - Abgleich und `/katalog/danke` fuer dieselbe Session: genau ein `settled_at`, und fuer einen
     Topup mit `address` genau eine Zeile in `ledger` (die Gegenprobe gegen doppelte Gutschrift);
   - Zeile juenger als zwei Minuten oder aelter als 48 Stunden: wird nicht gefragt.
6. **`ops/stripe-sessions.cjs`**, die Messung der Zahl. Laeuft wie `ops/db-report.cjs` per stdin im
   Container, liest `CP_STRIPE_SECRET_KEY` aus der Umgebung und gibt ihn nie aus. Holt ueber
   `GET /v1/checkout/sessions` (Seiten zu 100, `created[gte]`) alle Sessions eines Fensters,
   Voreinstellung 30 Tage, behaelt nur die mit `metadata[offer]` aus `OFFERS` **oder** einer
   `success_url` auf `/katalog/danke` von `postyourprice.com`, und vergleicht mit `checkouts`.
   Ausgabe nur Zahlen: `stripe_paid`, `booked_paid`, `paid_not_booked`, `paid_no_row`,
   `booked_not_paid`, plus Fenster und Modus (`test`/`live`). Keine E-Mail, keine Session-ID.
   Exit 1, wenn `paid_not_booked`, `paid_no_row` oder `booked_not_paid` groesser 0 ist.
   `--selftest` mit einer Fixture statt Stripe (`CP_STRIPE_SESSIONS_FIXTURE`), in beide Richtungen:
   eine gepflanzte bezahlte Session ohne Buchung macht Exit 1, dieselbe gebucht macht Exit 0, eine
   fremde Session (anderes `metadata`, andere `success_url`) zaehlt nicht mit. Laeuft in
   `ops/check-all.sh` mit.

### Done, gemessen und nicht behauptet

1. `pnpm test` und `pnpm e2e` gruen, kein `expect` entfernt ausser dem in 4 benannten, das durch
   einen strengeren ersetzt ist.
2. Nach dem Deploy, Testmodus, von Betrieb: **eine bezahlte Session ohne Rueckkehr.** Vorfuehrung
   im Browser mit `vorfuehrung@postyourprice.com` und Karte 4242, die Weiterleitung auf
   `/katalog/danke` wird im Browser abgefangen und nie geladen (Access-Log: kein
   `GET /katalog/danke` fuer diese Session). Nach hoechstens sieben Minuten steht die Zeile `paid`.
3. **Eine abgebrochene Session wird nicht gebucht.** Zweite Vorfuehrung bis zur Stripe-Seite, dann
   `POST /v1/checkout/sessions/<id>/expire` im Container mit dem Testschluessel. Nach hoechstens
   sieben Minuten steht die Zeile `abandoned`, `settled_at` leer.
4. `ops/stripe-sessions.cjs` in Produktion: `paid_not_booked = 0`, `paid_no_row = 0`,
   `booked_not_paid = 0`, Exit 0, und `--selftest` gruen.
5. Die zwoelf und mehr alten `stripe_test`-Zeilen aus Goal 20 und 21, die heute `pending` sind:
   nach dem ersten Lauf stehen die unter 48 Stunden als `abandoned` oder `paid`, und die Zahlen im
   Log stimmen mit einer Abfrage auf `checkouts` vorher und nachher ueberein.

**Widerlegt, wenn:** nach dem Deploy eine bezahlte Session in Stripe steht, die in `checkouts`
fehlt oder dort nicht `paid` ist, laenger als zehn Minuten nach der Zahlung. Gemessen mit
`ops/stripe-sessions.cjs`.

### Was dieses Goal nicht weiss und nicht tut

- **Geliefert wird nach einer echten Zahlung nichts.** Es gibt keine Lieferung, keine Mail an den
  Kaeufer, keine Verbindung von `checkouts` zu `bounties` (Goal 21, "nicht Teil"). Der Code nimmt
  ab diesem Goal Geld an; ob Matthias den Schluessel setzt, bevor Bekommen steht, ist seine
  Entscheidung, und der Schreiber muss ihm genau das sagen. Mein Rat: den Schluessel erst setzen,
  wenn eine bezahlte Bestellung zu drei Fassungen fuehrt, oder wenn bis dahin von Hand geliefert
  wird und jemand die Zeilen liest.
- **Wer Verkaeufer ist, wenn Stripe live ueber HTC laeuft**, steht offen bei Matthias (Goal 21,
  Blockers). Impressum und `/datenschutz` nennen ihn privat. Das haengt am Schluessel, nicht am
  Code.
- **Ob das HTC-Konto noch andere Checkout Sessions fuehrt**, weiss ich nicht. Deshalb filtert die
  Messung nach `metadata[offer]` und `success_url`. Eine Session, die weder das eine noch das andere
  traegt, faellt aus beiden Seiten heraus; wir setzen beides immer, also sollte es keine geben.
- **`paid_no_row` kann der Code nicht heilen**, nur melden: eine Session ohne Zeile hat keine
  Angaben und keine E-Mail bei uns, und die Zeile nachzutragen wuerde Done 4 von Goal 21 brechen.
  Bei einem Treffer hilft nur ein Mensch mit dem Stripe-Dashboard. Wie oft das vorkommt: nie
  gemessen, heute gibt es kein Werkzeug dafuer.
- **Asynchrone Zahlarten** bleiben aus (`payment_method_types[0]=card`, HAN-17). Der Abgleich
  koennte sie buchen, aber das ist nicht getestet.
- Nicht Teil: ein Webhook, eine Bestaetigungsmail, Erstattungen (`refunded` bleibt bei uns `paid`).

### Blockers
Das Urteil des Skeptikers (Kind von HAN-30).

(Historie: Goal 21, Angaben und E-Mail vor der Kasse, in `goals/2026-09-29-goal-21-angaben.md`.)
