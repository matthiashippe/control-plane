# GOAL.md

## Status
ZUM BAU FREIGEGEBEN mit den zehn Auflagen des Skeptikers (HAN-38, 29.09.2026), eingearbeitet
unten. Punkt 4 in der ersten Fassung ("ein Live-Schluessel allein schaltet ein") ist widerlegt und
ersetzt durch einen eigenen Schalter `CP_CHECKOUT_LIVE=1`.

## Active Objective

**Goal 22: Jede in Stripe bezahlte Session steht in `checkouts` als bezahlt, auch wenn der Kaeufer
nicht auf `/katalog/danke` zurueckkommt. Live geht der Weg nur mit Live-Schluessel und
`CP_CHECKOUT_LIVE=1`, beides in `deploy/.env`.**

Nennt ausdruecklich **`src/payments/stripe.ts`**, weil dort `expires_at` in den Body der Session
kommt und `call()` ein Timeout bekommt. Sonst nichts unter `src/payments/**`, und `src/auth/**` bleibt zu.

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

1. **`reconcileCheckouts(db, provider, now)`** in `src/checkout/index.ts`. Liest Zeilen mit
   `status = 'pending'`, `provider = provider.name` und `created_at` aelter als zwei Minuten,
   **ohne Obergrenze beim Alter** (Auflage 3), hoechstens 100 je Lauf, aelteste zuerst. Fuer jede ruft
   es `settleCheckout(db, provider, { session_id: reference })` und faengt **jeden** Fehler einzeln
   ab, nicht nur `CheckoutError` (Auflage 6). Rueckgabe und eine Logzeile je Lauf mit fuenf Zahlen:
   `paid`, `abandoned`, `open`, `error`, `skipped` (Zeilen, die wegen der Kappe nicht gefragt wurden,
   Auflage 4). Keine Referenz, keine E-Mail im Log. Laeuft nicht, wenn `checkoutEnabled()` falsch ist
   oder kein Provider da ist, und startet nicht, solange der vorige Lauf noch laeuft (Auflage 5).
2. **`src/index.ts`**: einmal beim Start, danach alle fuenf Minuten, neben `cleanup`, mit
   `.unref()`. Ein Fehler im Lauf landet im Log und beendet den Prozess nicht.
3. **`src/payments/stripe.ts`**: `begin` setzt `expires_at` auf jetzt plus 60 Minuten, damit eine
   abgebrochene Session nach spaetestens 65 Minuten `abandoned` ist. `call()` bricht nach 10 Sekunden
   mit `provider_unreachable` ab (`AbortSignal.timeout`, Auflage 5). Tests gegen gestelltes `fetch`:
   `expires_at` steht im Body, liegt zwischen 30 Minuten und 24 Stunden und in keiner URL; ein
   `fetch`, das nie antwortet, endet nach dem Timeout.
4. **Der Live-Schalter (Auflage 1 und 2).** `checkoutEnabled()` gibt fuer `sk_live_`/`rk_live_` nur
   `true`, wenn zusaetzlich `CP_CHECKOUT_LIVE=1` gesetzt ist, **auch wenn `CP_CHECKOUT=1` steht**.
   Heute oeffnet `CP_CHECKOUT=1` plus Live-Schluessel den Weg ohne Commit; das schliesst dieser Punkt.
   Testschluessel und `CP_CHECKOUT=1` ohne Live-Schluessel verhalten sich wie bisher.
   `test/stripe-checkout.test.ts:164` (`stays off with a live key alone`) bleibt **unveraendert**.
   Neue Tests: `CP_CHECKOUT=1` plus Live-Schluessel bleibt aus; mit `CP_CHECKOUT_LIVE=1` geht es an
   und die Zeile heisst `stripe`; `CP_CHECKOUT_LIVE=1` mit Testschluessel aendert nichts;
   `CP_CHECKOUT_LIVE=1` ohne Schluessel bleibt aus.
5. **Tests fuer den Abgleich, gegen gestelltes `fetch`, Gegenprobe in beide Richtungen:**
   - bezahlte Session, niemand ruft `/katalog/danke`: nach einem Lauf `paid`, `settled_at` gesetzt;
   - abgelaufene Session: `abandoned`, kein `settled_at`; dasselbe fuer eine 72 Stunden alte Zeile;
   - offene Session: bleibt `pending`, und ein zweiter Lauf fragt sie wieder;
   - Zeile `stripe_test` unter Live-Provider: wird nicht gefragt;
   - Stripe antwortet 500 fuer eine Zeile: die naechste wird trotzdem gebucht;
   - eine Zeile, deren `UPDATE` wirft (kein `CheckoutError`): unter `error`, die naechste wird gebucht;
   - 101 offene Zeilen ergeben `skipped = 1`, 100 ergeben `skipped = 0`;
   - ein `fetch`, das nie antwortet: der Lauf endet, ein zweiter Aufruf waehrenddessen fragt Stripe
     nicht;
   - Abgleich und `/katalog/danke` fuer dieselbe Session: genau ein `settled_at`, fuer einen Topup
     mit `address` genau eine Zeile in `ledger`;
   - Zeile juenger als zwei Minuten: wird nicht gefragt.
6. **`ops/stripe-sessions.cjs`**, die Messung der Zahl. Laeuft wie `ops/db-report.cjs` per stdin im
   Container, liest `CP_STRIPE_SECRET_KEY` und `CP_PUBLIC_URL` aus der Umgebung und gibt den
   Schluessel nie aus. Holt ueber `GET /v1/checkout/sessions` (Seiten zu 100, `created[gte]`) alle
   Sessions eines Fensters, Voreinstellung 30 Tage. **Gezaehlt wird eine Session nur, wenn ihre
   `success_url` mit `<CP_PUBLIC_URL>/katalog/danke` beginnt und `metadata[offer]` in `OFFERS` steht**;
   alle uebrigen stehen als eigene Zahl `foreign` (Auflage 7). Verglichen werden nur Zeilen mit
   `provider = stripeProviderName(key)`; eine gebuchte Zeile, die in der Liste fehlt, wird einzeln
   per `GET /v1/checkout/sessions/<id>` geprueft, bevor sie als `booked_not_paid` zaehlt (Auflage 8).
   Ausgabe nur Zahlen: `stripe_paid`, `booked_paid`, `paid_not_booked`, `paid_no_row`,
   `booked_not_paid`, `foreign`, plus Fenster und Modus. Keine E-Mail, keine Session-ID. Exit 1, wenn
   `paid_not_booked`, `paid_no_row` oder `booked_not_paid` groesser 0 ist. `--selftest` mit Fixture
   (`CP_STRIPE_SESSIONS_FIXTURE`): bezahlte Session ohne Buchung gibt Exit 1, dieselbe gebucht Exit 0,
   eine fremde bezahlte Session steht in `foreign` und nicht in `paid_no_row`, eine bezahlte
   `stripe_test`-Zeile unter Live-Modus gibt 0, eine gebuchte Zeile knapp vor dem Fenster gibt 0.
   Laeuft in `ops/check-all.sh` mit.

### Done, gemessen und nicht behauptet

1. `pnpm test` und `pnpm e2e` gruen, kein `expect` entfernt ausser dem in 4 benannten, das durch
   einen strengeren ersetzt ist.
2. Nach dem Deploy, Testmodus, von Betrieb: **eine bezahlte Session ohne Rueckkehr.** Vorfuehrung
   im Browser mit `vorfuehrung@postyourprice.com` und Karte 4242, die Weiterleitung auf
   `/katalog/danke` wird im Browser abgefangen und nie geladen (Access-Log: kein
   `GET /katalog/danke` fuer diese Session). Nach hoechstens sieben Minuten steht die Zeile `paid`.
   **Gegenprobe (Auflage 9):** dasselbe Access-Log zeigt fuer eine der bezahlten Vorfuehrungen vom
   29.09. die Zeile `GET /katalog/danke?session_id=...`. Fehlt sie dort auch, beweist das Fehlen
   nichts, und die Vorfuehrung braucht einen anderen Beleg.
3. **Eine abgebrochene Session wird nicht gebucht.** Zweite Vorfuehrung bis zur Stripe-Seite, dann
   `POST /v1/checkout/sessions/<id>/expire` im Container mit dem Testschluessel. Nach hoechstens
   sieben Minuten steht die Zeile `abandoned`, `settled_at` leer.
4. `ops/stripe-sessions.cjs` in Produktion: `paid_not_booked = 0`, `paid_no_row = 0`,
   `booked_not_paid = 0`, Exit 0, und `--selftest` gruen.
5. Die 17 alten `stripe_test`-Zeilen, die am 29.09. `pending` sind (Skeptiker, HAN-38): nach dem
   ersten Lauf ist jede davon `abandoned` oder `paid`, egal wann ausgerollt wird (Auflage 10),
   gezaehlt vorher und nachher auf `checkouts`.

**Widerlegt, wenn:** nach dem Deploy eine bezahlte Session in Stripe steht, die in `checkouts`
fehlt oder dort nicht `paid` ist, laenger als zehn Minuten nach der Zahlung. Gemessen mit
`ops/stripe-sessions.cjs`.

### Was dieses Goal nicht weiss und nicht tut

- **Geliefert wird nach einer echten Zahlung nichts.** Es gibt keine Lieferung, keine Mail an den
  Kaeufer, keine Verbindung von `checkouts` zu `bounties`. Goal 20 hat Live an diese Bedingung
  gebunden ("live darf der Knopf erst gehen, wenn nach der Zahlung jemand liefert"). Deshalb bleibt
  Live nach diesem Goal zu, bis Bekommen steht, und der Schreiber sagt Matthias genau das (HAN-31):
  nicht "Schluessel setzen", sondern "Live bleibt zu bis zur Lieferung; dann Schluessel und
  `CP_CHECKOUT_LIVE=1`".
- **Ob das HTC-Konto im Live-Modus fremde Sessions fuehrt**, sieht der Testschluessel nicht. Im
  Testmodus fuehrt es nur unsere: 19 Sessions ab 30.08., alle mit `metadata[offer]` und unserer
  `success_url`, 2 bezahlt gegen 2 `paid`, 17 offen gegen 17 `pending` (Skeptiker, HAN-38,
  29.09. 21:13 UTC).
- **Ob Caddy die Query `session_id` ins Access-Log schreibt**, ist nicht geprueft; davon haengt die
  Gegenprobe in Done 2 ab.
- **Wer Verkaeufer ist, wenn Stripe live ueber HTC laeuft**, steht offen bei Matthias (Goal 21,
  Blockers). Impressum und `/datenschutz` nennen ihn privat. Das haengt am Schluessel, nicht am
  Code.
- **`paid_no_row` kann der Code nicht heilen**, nur melden: eine Session ohne Zeile hat keine
  Angaben und keine E-Mail bei uns, und die Zeile nachzutragen wuerde Done 4 von Goal 21 brechen.
  Bei einem Treffer hilft nur ein Mensch mit dem Stripe-Dashboard. Wie oft das vorkommt: nie
  gemessen, heute gibt es kein Werkzeug dafuer.
- **Asynchrone Zahlarten** bleiben aus (`payment_method_types[0]=card`, HAN-17). Der Abgleich
  koennte sie buchen, aber das ist nicht getestet.
- Nicht Teil: ein Webhook, eine Bestaetigungsmail, Erstattungen (`refunded` bleibt bei uns `paid`).

### Blockers
Keine. Das Urteil des Skeptikers (HAN-38) ist oben eingearbeitet. `CP_CHECKOUT_LIVE` in
`deploy/.env` setzt nur Matthias, und erst nach der Lieferung.

(Historie: Goal 21, Angaben und E-Mail vor der Kasse, in `goals/2026-09-29-goal-21-angaben.md`.)
