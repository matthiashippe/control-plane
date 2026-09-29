# GOAL.md

## Status
ACTIVE, Bau beginnt erst, wenn HAN-14 (Katalog) abgeschlossen ist. WIP gleich eins.

## Active Objective

**Goal 20: Ein Mensch kann ein Angebot aus dem Katalog mit Karte bezahlen, im Stripe-Testmodus.**

Nennt ausdruecklich **`src/payments/**`**, weil dort der Stripe-Adapter liegt und
`loop-constraints.md` den Pfad nur so oeffnet. `src/auth/**` bleibt zu.

Auftrag: HAN-16. Glied: **Bezahlen**. Frist: gebaut und getestet bis 01.10. 18:00 UTC, live bis
02.10. 12:00 UTC (Ziel aus `ZIELE.md`: Kartenweg antwortet live bis 02.10.).

### Was gemessen ist, 29.09.2026

- Beide Schluessel liegen auf der VM, in `/opt/control-plane/.env` und in
  `/opt/control-plane/repo/deploy/.env`, je zwei Zeilen `CP_STRIPE_*`, Praefix `sk_test` und
  `pk_test`. Gelesen wurden nur Name und Praefix, nie der Wert.
- **Der laufende Container kennt sie nicht.** `docker inspect` zeigt keine Variable mit `STRIPE`
  im Namen (Container erstellt 29.09. 15:37:53 UTC). Erst der naechste Deploy, der den Container
  neu erstellt, bringt sie hinein. Ohne diese Pruefung haette der erste Kaufversuch live mit
  "nicht eingeschaltet" geantwortet, und die Suche waere im Code gelandet.
- `checkouts` hat in Produktion **null Zeilen**. Der Umbau der Tabelle verschiebt also nichts.
- Die CSP in `deploy/Caddyfile` traegt `form-action 'self'`. Chrome wendet `form-action` auch auf
  die Weiterleitung nach dem Absenden an, ein Formular auf `/katalog/kaufen` mit 303 zu
  `checkout.stripe.com` wird also blockiert, bis die Quelle dort steht.
- Es gibt kein Webhook-Geheimnis (`whsec_`) auf der VM, nur die zwei Schluessel.

### Die Arbeit, in dieser Reihenfolge

1. **Schema.** `checkouts.address` wird nullable, dazu die Spalte `offer TEXT` und
   `CHECK (address IS NOT NULL OR offer IS NOT NULL)`. SQLite kann `NOT NULL` nicht per
   `ALTER` entfernen: Tabelle neu anlegen, kopieren, umbenennen, in einer Transaktion, nur wenn
   `PRAGMA table_info(checkouts)` fuer `address` noch `notnull = 1` zeigt. Test: eine Datenbank mit
   dem alten Schema und einer Zeile wird migriert, die Zeile ist danach unveraendert da, und ein
   zweiter Start migriert nicht noch einmal.
2. **Settle ohne Wallet.** `settleCheckout` bucht wie bisher Credits, wenn die Zeile eine Adresse
   hat. Hat sie nur ein Angebot, setzt es `status = 'paid'` und bucht nichts ins Ledger, weil es
   kein Konto gibt, dem etwas gutgeschrieben wird. Credits bleiben nicht auszahlbar.
3. **`read` wird asynchron.** Der Stripe-Adapter kann nicht aus dem Rueckweg allein wissen, ob
   bezahlt wurde; er fragt Stripe. Der Fake folgt. Die zehn Tests in `test/checkout.test.ts`
   behalten ihre Assertions wortgleich, es kommt nur `await` dazu. Insbesondere
   "ignores an amount the callback tries to name" bleibt unveraendert.
4. **Der Adapter, `src/payments/stripe.ts`.** Kein SDK, `fetch` gegen `api.stripe.com/v1`.
   - `begin`: `POST /v1/checkout/sessions`, `mode=payment`, `currency=eur`, ein Posten mit Name
     und Preis aus `OFFERS`, `success_url` = `${CP_PUBLIC_URL}/katalog/danke?session_id={CHECKOUT_SESSION_ID}`,
     `cancel_url` = `${CP_PUBLIC_URL}/katalog`. Referenz ist die Session-ID, Ziel ist `session.url`.
   - `read`: `GET /v1/checkout/sessions/{id}` mit dem Geheimschluessel, `paid` genau dann, wenn
     `payment_status === "paid"`.
   - **Der Betrag kommt weiter aus der Zeile.** Zusaetzlich verweigert das Settle mit 409, wenn
     Stripe fuer die Session einen anderen Betrag oder eine andere Waehrung meldet als die Zeile.
     Diese Pruefung kann nur ablehnen, nie gutschreiben.
   - **Der Providername kommt aus dem Schluessel:** `stripe_test` bei `sk_test_`, `stripe` bei
     `sk_live_`. Damit traegt jede Zeile selbst, ob echtes Geld geflossen ist.
   - Tests gegen ein gestelltes `fetch`, nie gegen Stripe: Session angelegt mit dem Preis aus der
     Konstante, `unpaid` bucht nichts, ein Betrag, der von der Zeile abweicht, ergibt 409, ein
     Schluessel `sk_live_` ergibt den Namen `stripe`.
5. **Der Schalter.** `checkoutEnabled()` ist an, wenn `CP_CHECKOUT=1` oder
   `CP_STRIPE_SECRET_KEY` gesetzt ist. Der Schluessel ist Matthias' Schalter, und
   `CP_CHECKOUT` steht in `deploy/**`, das wir nicht anfassen. Die zwei Tests unter "while it is
   switched off" bleiben unveraendert und laufen mit beiden Variablen leer; neu kommt einer dazu,
   der nur mit dem Schluessel an ist.
6. **Zwei Routen, beide ausserhalb von `/v1`,** damit die `has()`-Regel der Auth-Middleware nicht
   beruehrt wird:
   - `POST /katalog/kaufen`, Formularfeld `angebot` mit der ID aus `OFFERS` (neu: je Angebot ein
     festes `id`). Der Preis kommt aus der Konstante, nie aus dem Formular. Antwort 303 zu Stripe.
     Unbekanntes Angebot: 400. Rate-Limit wie bei den anderen oeffentlichen POSTs.
   - `GET /katalog/danke?session_id=...` ruft das Settle auf und zeigt eine deutsche Seite in drei
     Zustaenden: bezahlt, nicht bezahlt (mit Link zurueck zum Katalog), unbekannt. Neu laden bucht
     nichts doppelt.
7. **Der Knopf.** Unter jedem Angebot auf `/katalog` ein Formular mit einem Knopf "Kaufen". Solange
   der Schluessel mit `sk_test_` beginnt, steht darueber: "Testbetrieb: Es wird kein Geld
   abgebucht." Ist der Kartenweg aus, gibt es den Knopf nicht.
8. **`deploy/Caddyfile`:** `form-action 'self' https://checkout.stripe.com`. Davor
   `caddy validate`, danach `--force-recreate` (Bind-Mount). Das macht Betrieb.
9. **Der Messweg fuer die Zahl.** `ops/ziele.sh` bekommt `human_revenue_30d_cents` aus
   `checkouts`: Summe `cents`, `status = 'paid'`, `provider = 'stripe'`, `offer IS NOT NULL`,
   `settled_at` in den letzten dreissig Tagen. Gegenprobe im Selbsttest in beide Richtungen: eine
   gepflanzte Zeile `stripe` zaehlt, dieselbe mit `stripe_test` zaehlt nicht. Damit ist eine
   Vorfuehrung mit Testkarte strukturell keine Bestellung eines Menschen (Sperrliste 0 und 2).

### Done, gemessen und nicht behauptet

1. `pnpm test` gruen, `ops/ziele.sh --selftest` gruen, die zehn bestehenden Checkout-Tests mit
   unveraenderten Assertions.
2. Nach dem Deploy zeigt `docker inspect` im Container zwei Variablen `CP_STRIPE_*` (nur Namen).
3. `curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -d angebot=<id> https://postyourprice.com/katalog/kaufen`
   liefert 303 auf `https://checkout.stripe.com/...`.
4. Ein Kauf im Browser mit Stripes Testkarte `4242 4242 4242 4242` endet auf `/katalog/danke` mit
   "bezahlt", und in `checkouts` steht genau eine Zeile `paid`, `provider = 'stripe_test'`,
   `address IS NULL`, `cents` gleich dem Katalogpreis. Das ist eine Vorfuehrung und zaehlt nicht.
5. `ops/ziele.sh` meldet danach `human_revenue_30d_cents` als Zahl, und zwar **0**. Das ist die
   Gegenprobe zu 4: der Messweg existiert, und der eigene Testkauf taucht darin nicht auf.

### Was dieses Goal nicht weiss und nicht tut

- **Kein Webhook.** Gebucht wird auf dem Rueckweg. Wer bezahlt und den Tab schliesst, bevor
  `/katalog/danke` laedt, steht als `pending`, obwohl Stripe `paid` fuehrt. Im Testmodus kostet das
  nichts. Vor Live braucht es einen Webhook mit `whsec_`, und der liegt in `.env*`, also bei
  Matthias.
- **Keine Bestellung dahinter.** Ein bezahltes Angebot ist heute eine Zeile, kein Auftrag, weil es
  das Gespraech (Glied Sagen) noch nicht gibt. Deshalb ist Testmodus hier keine Schwaeche, sondern
  die Grenze: live darf der Knopf erst gehen, wenn nach der Zahlung jemand liefert.
- Ob Stripe fuer diesen Kontotyp `payment_method_types` ausdruecklich braucht oder die
  Voreinstellung reicht, ist nicht geprueft.

### Blockers
HAN-14 (WIP gleich eins). Sonst keine.

(Historie: Goal 19 in `goals/2026-09-29-goal-19-ein-dollar.md`. Dessen Messung, Punkt 3, laeuft
bis 06.10. weiter und wird dort nachgetragen.)
