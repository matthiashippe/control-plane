# Goal 23: Eine bezahlte Bestellung wird zu drei Fassungen per E-Mail

## Status
VORSCHLAG, Fassung 2 (HAN-39, 29.09.2026). Wird vor dem Bau vom Skeptiker widerlegt (HAN-42).
Gebaut wird erst, was danach übrig ist, und erst nachdem Goal 22 ausgerollt ist (WIP = 1).
`GOAL.md` trägt bis dahin Goal 22; dieses Goal zieht dort ein, wenn Goal 22 steht.

**Fassung 2 ersetzt den Weg über das Claude-Abo.** `recht` hat an HAN-43 festgestellt, dass die
Consumer Terms des Max-Abos (EWR, ab 08.10.2025, Abschnitte 3 und 11) gewerbliche Nutzung und den
Zugriff per Skript ausschließen. Fassung 1 (Commit 48ad70f) ließ die Fassungen auf dem Rechner von
Matthias über `claude -p` schreiben; das darf für einen zahlenden Käufer nicht laufen. Die Fassungen
schreibt jetzt die Kette, die der Dienst schon betreibt (OpenRouter, in der VM), und damit entfallen
auch der Rechner als Lieferpunkt und das Schreiben in die Produktionsdatenbank per SSH.

Nennt **kein** `src/payments/**` und kein `src/auth/**`. Beides bleibt zu.

Auftrag: HAN-39 (CEO, aus HAN-22 nach HAN-36). Glied: **Bekommen**. Frist: Vorführung geliefert bis
05.10.2026, 18:00 UTC.

## Warum OpenRouter und keine Ausnahme von der Standing Rule

Der Auftrag sagte "ein Agent über das Claude-Abo, nie über einen `ANTHROPIC_API_KEY`". Beides zugleich
geht für einen zahlenden Käufer nicht (HAN-43). `recht` schlägt einen API-Schlüssel von HTC bei
Anthropic vor, als Ausnahme von der Standing Rule vom 29.09., und das bräuchte ein Ja von Matthias.

Das braucht es nicht. Der Dienst verkauft schon heute Inferenz über OpenRouter
(`src/inference/openrouter.ts`, Schlüssel `OPENROUTER_API_KEY` in `deploy/.env`), also über einen
API-Schlüssel und nicht über ein Verbraucher-Abo. Ob OpenRouters Bedingungen den Weiterverkauf der
Ausgaben decken, habe ich nicht gelesen; das prüft `recht` vor dem Bau. Die gemessenen 0,075 EUR je drei Fassungen und 19,2 s Median stammen aus
genau dieser Kette. Die Standing Rule regelt, wie die Agenten der Org abgerechnet werden; die
Inferenz des Produkts lief nie über das Abo und setzt keinen `ANTHROPIC_API_KEY`. Wer die Regel
anders liest, sagt es dem CEO, und dann geht die Frage aus HAN-43 an Matthias.

Folge: die Fassungen kommen heute aus OpenAI-Modellen (`openai/gpt-5.2`, `openai/gpt-5-mini`), weil
`CP_OPENROUTER_MODELS` nur diese trägt. Der Katalog verspricht drei Fassungen, nicht drei Anbieter,
und nennt keinen Anbieter (`src/public/catalog.ts:9-11`). Kommen `anthropic/claude-haiku-4.5` und
`google/gemini-3.6-flash` in die Liste (Matthias, `deploy/.env`), nimmt die Lieferung sie ohne
Codeänderung.

## Reihenfolge der beiden Goals

Goal 22 wird zuerst gebaut, Goal 23 danach. Die Lieferung liest `status = 'paid'`, und ohne den
Abgleich aus Goal 22 wird eine Zahlung nur gebucht, wenn der Käufer auf `/katalog/danke`
zurückkommt. Goal 23 vor Goal 22 hieße, dass ein Käufer, der den Tab schließt, bezahlt und nie
etwas bekommt. Beide Läufe teilen sich den Takt in `src/index.ts`: erst abgleichen, dann liefern.

Der lange Teil von Goal 23 ist der Mailweg, und der hängt an Matthias (Konto, DNS, Schlüssel). Er
beginnt nach dem Urteil des Skeptikers, parallel zum Bau von Goal 22.

## Was gemessen ist, 29.09.2026

- **`checkouts` in Produktion, ganzer Bestand** (`/data/cp.db`, read-only, 29.09. gegen 21 Uhr UTC):
  2 Zeilen `paid`, beide `stripe_test`. Eine von 19:54 UTC ohne `order_briefs`-Zeile (vor Goal 21,
  also ohne E-Mail, nicht lieferbar), eine von 21:07 UTC mit Angaben und einer Adresse aus
  `ops/ours.txt`. Dazu 17 `pending`. Keine Zeile mit `provider = 'stripe'`.
- **Kein Code liest eine bezahlte Zeile und liefert.** Leser von `checkouts`: `src/db.ts`,
  `src/checkout/index.ts`, `ops/db-report.cjs`.
- **`postyourprice.com` empfängt und sendet keine Mail.** `dig MX postyourprice.com` ist leer,
  ebenso SPF und DMARC (29.09.). Die Vorführungsadresse `vorfuehrung@postyourprice.com` aus Goal 22
  hat kein Postfach. Der DNS liegt bei Cloudflare (`dolly`/`kobe.ns.cloudflare.com`).
- **Kein Mailversand im Repo.** Kein SMTP, kein Anbieter, keine Abhängigkeit dafür.
- **`/datenschutz` nennt nur Stripe.** Dass die Angaben an einen Modellanbieter gehen und die Mail
  über einen Versanddienst, steht dort nicht.

## Der Weg

```
Stripe bezahlt ─> checkouts.status = 'paid'      (Goal 22, Abgleich alle 5 Minuten)
                    │
VM, derselbe Takt in src/index.ts, danach:
  deliverPaidOrders(db, inference, mailer, now)   src/checkout/deliver.ts
    1. liest die offenen Bestellungen             deliverable(db, now)
    2. schreibt drei Fassungen                    Inferenz-Provider des Dienstes (OpenRouter)
    3. schickt eine Mail                          Versanddienst über HTTPS
    4. trägt die Lieferung ein                    Tabelle deliveries, im selben Prozess
```

## Die Arbeit, in dieser Reihenfolge

1. **Tabelle `deliveries`** in `src/db.ts`: `reference` (Primärschlüssel, verweist auf `checkouts`),
   `status` (`claimed` | `sent` | `failed`), `attempts`, `claimed_at`, `sent_at`, `message_id` (vom
   Versanddienst), `versions` (Anzahl), `body` (die drei Fassungen, für spätere Runden), `cost_mc`
   (Inferenzkosten in Millicent), `error` (nur ein Code, nie Text aus der Bestellung).
   `cleanupOrderBriefs` löscht `body` mit derselben Frist wie die Angaben (`PAID_BRIEF_DAYS` nach der
   Zahlung); die Zeile selbst bleibt, weil sie keinen Menschen nennt und der Report sie braucht.

2. **Wer beliefert wird**, `deliverable(db, now)` in `src/checkout/deliver.ts`:
   - `checkouts.status = 'paid'`, `offer` gesetzt, eine Zeile in `order_briefs`;
   - keine `deliveries`-Zeile mit `sent`, und keine mit `claimed` jünger als 30 Minuten;
   - höchstens 5 Versuche, höchstens 10 Zeilen je Lauf, älteste Zahlung zuerst;
   - **`stripe_test` nur an eine Adresse aus `ops/ours.txt`.** Der Testmodus ist öffentlich, jeder
     kann mit 4242 "bezahlen". Ohne diese Regel schreiben wir Fremden umsonst Texte auf unsere
     Inferenzkosten und schicken Mail an jede Adresse, die jemand eintippt, auch an eine fremde.
     `stripe` (live) geht an jede Adresse. Die Liste steht als Konstante im Code, ein Test hält sie
     gleich mit `ops/ours.txt` und der Kopie in `ops/db-report.cjs`.

3. **`deliverPaidOrders`**, der Lauf, in `src/index.ts` alle 5 Minuten nach dem Abgleich aus Goal 22,
   mit `.unref()`, ein Fehler landet im Log und beendet den Prozess nicht. Läuft nur, wenn
   `checkoutEnabled()` wahr ist und ein Versandschlüssel gesetzt ist.
   - trägt für jede Zeile `claimed` ein, bevor ein Modell gefragt wird (bedingtes `INSERT OR
     IGNORE` bzw. `UPDATE ... WHERE`, damit zwei Läufe dieselbe Zeile nicht beide nehmen);
   - drei Anfragen an den Inferenz-Provider, verteilt über `CP_OPENROUTER_MODELS`, mit eigenem
     Systemprompt je Angebot und je einer anderen Vorgabe für Ton oder Aufbau, damit drei
     verschiedene Texte entstehen. Die Angaben gehen als Daten in den Prompt, nie als Anweisung,
     keine Werkzeuge. Die Kosten gehen nicht über das Ledger (es gibt kein Wallet), sondern nach
     `deliveries.cost_mc`;
   - prüft jede Fassung: nicht leer, nicht gleich einer anderen, bei der Rede innerhalb der
     gewählten Länge (130 Wörter je Minute, plus minus 30 Prozent). Eine Fassung, die durchfällt,
     wird einmal neu geschrieben. **Weniger als drei gehen nie raus;** dann `failed` mit Code, und
     der nächste Lauf versucht es wieder;
   - schickt **eine** Mail mit den drei Fassungen, Absender `bestellung@postyourprice.com`,
     `Reply-To` die Adresse aus dem Impressum, Idempotenzschlüssel = Referenz. Stürzt der Prozess
     zwischen Versand und Eintrag ab, schickt der nächste Lauf dieselbe Mail nicht ein zweites Mal;
   - trägt `sent`, `message_id`, `body` und `cost_mc` ein;
   - loggt je Lauf nur Zahlen: gefunden, geschickt, fehlgeschlagen, Sekunden. Keine Adresse, keine
     Angaben, keine Referenz, auch nicht bei einem Fehler.

4. **Die Mail**, deutsch, Nur-Text plus einfaches HTML, vom CMO (`copy`) abgenommen. Sie sagt, dass
   die Fassungen von einer KI geschrieben sind, und wie man eine Änderung bekommt: auf die Mail
   antworten. Das liest bis zu einem eigenen Goal ein Mensch (siehe unten).

5. **Das Feld im Report**, `ops/db-report.cjs`, `report.delivery`, nur Zahlen, getrennt nach
   `ours` und `human`:
   - `paid_delivered`, `paid_not_delivered`, `paid_not_delivered_over_24h`;
   - `paid_undeliverable`: bezahlt ohne `order_briefs`-Zeile. Heute 1 (die Zeile von 19:54 UTC). Sie
     steht getrennt, damit sie weder als Lieferung noch als Verstoß zählt; ab Goal 21 darf es keine
     neue geben;
   - `minutes_to_delivery_median` über `sent_at - settled_at`, 30 Tage;
   - `delivery_cost_mc_median`, 30 Tage, in Millicent;
   - `ops/ziele.sh` meldet rot, wenn `paid_not_delivered_over_24h` größer 0 ist.

6. **`/datenschutz`**: nennt OpenRouter und die Modellanbieter, an die die Angaben gehen, und den
   Versanddienst. Text von `recht` (CFO), neu, weil der Text an HAN-43 für Anthropic direkt
   geschrieben ist. Pflicht vor dem Live-Schlüssel (HAN-31), nicht vor der Vorführung, weil die nur
   unsere eigene Adresse beliefert.

7. **Tests**, gegen einen gestellten Inferenz-Provider (`src/inference/mock.ts`) und einen
   gestellten Versanddienst, in beide Richtungen:
   - bezahlte Zeile mit Angaben: drei Fassungen, genau eine Mail, `sent`;
   - `pending`, `abandoned`, bezahlt ohne Angaben: keine Mail;
   - `stripe_test` an eine fremde Adresse: keine Mail; an `vorfuehrung@postyourprice.com`: Mail;
   - ein Modell antwortet leer: einmal neu, danach `failed`, keine Mail mit zwei Fassungen;
   - Absturz nach dem Versand, vor dem Eintrag: der zweite Lauf schickt mit demselben
     Idempotenzschlüssel, eine Mail;
   - zwei Läufe gleichzeitig: nur einer nimmt die Zeile (`claimed`);
   - kein Versandschlüssel: der Lauf startet nicht, und der Report zeigt die Zeile als nicht
     geliefert (die Gegenprobe gegen eine stille Null);
   - keine Logzeile enthält Adresse, Referenz oder Text aus den Angaben;
   - der Report: eine gepflanzte bezahlte Zeile ohne Lieferung, 25 Stunden alt, macht
     `paid_not_delivered_over_24h = 1`; dieselbe mit `sent` macht 0; eine `pending` zählt nicht mit.

## Was Matthias tun muss, und nur er

Über den Schreiber (HAN-44), in einer Nachricht, erst nach dem Urteil des Skeptikers:

1. Ein kostenloses Konto bei **Resend** (3.000 Mails im Monat, 100 am Tag). Gewählt, weil Senden,
   Idempotenzschlüssel und Zustellstatus je eine HTTPS-Anfrage sind.
2. In Cloudflare für `postyourprice.com` die DNS-Einträge, die Resend nennt (DKIM, SPF und MX für
   die Absender-Subdomain), dazu `_dmarc` mit `p=none`. Oder dem Loop Zugang geben.
3. Den Resend-Schlüssel als `CP_RESEND_API_KEY` in `deploy/.env` (gesperrter Pfad), dieselbe
   Handbewegung wie beim Stripe-Schlüssel.
4. Cloudflare Email Routing für `vorfuehrung@postyourprice.com` auf ein Postfach, das er liest.
   Ohne das kommt die Vorführung nirgends an.

Keine Frage zum Abo und keine Ausnahme von der Standing Rule (siehe oben).

## Done, gemessen und nicht behauptet

1. `pnpm test` und `pnpm e2e` grün, kein Test gelockert.
2. `dig` zeigt DKIM, SPF und DMARC für die Absenderdomain; eine Testmail an ein Postfach bei einem
   großen Anbieter kommt im Posteingang an, nicht im Spam, mit `dkim=pass` und `spf=pass` im Header.
3. **Die Vorführung**: nach dem Deploy eine Bestellung im Testmodus unter
   `vorfuehrung@postyourprice.com`, Karte 4242, bis zur Mail. Belege: die `checkouts`-Zeile `paid`,
   die `deliveries`-Zeile `sent` mit `message_id`, der Status `delivered` beim Versanddienst für
   diese `message_id`, und die Mail im Postfach von Matthias mit drei Fassungen. Zählt nie als
   Umsatz (Sperrliste 0), und der Report führt sie unter `ours`.
4. `ops/db-report.cjs` in Produktion: `paid_not_delivered_over_24h = 0` für `ours` und `human`,
   und die Gegenprobe aus Punkt 7 grün.

**Widerlegt, wenn:** eine bezahlte Zeile mit Angaben älter als 24 Stunden ohne Lieferung im Report
steht, oder eine Mail an eine fremde Adresse für eine `stripe_test`-Zeile im Log des Versanddienstes.

## Was dieses Goal nicht weiß und nicht tut

- **Ob die Mail ankommt**, weiß ich erst nach Done 2. Eine neue Domain ohne Geschichte landet oft
  im Spam; der Versanddienst meldet dann trotzdem `delivered`, weil er nur den Empfang durch den
  Mailserver sieht. Deshalb braucht Done 3 das Postfach und nicht nur den Status.
- **Wie lange es dauert.** Gemessen ist die Kette (19,2 s Median für drei Fassungen), nicht eine
  Bestellung von der Zahlung bis zur Mail. Der Takt von 5 Minuten kommt dazu. Die Seite nennt keine
  Zeit, und das bleibt so, bis ein Median aus echten Lieferungen da ist.
- **Ob die Fassungen gut genug sind.** Die Prüfung in Punkt 3 fängt Leere, Dopplung und falsche
  Länge, nicht einen schwachen Text. Das zeigt erst die Vorführung und danach die Antworten.
- **Nachbessern für Katalogbestellungen ist nicht gebaut.** Der Katalog verspricht "bis zu dreimal
  sagen, was anders werden soll". Bis ein eigenes Goal das baut, liest ein Mensch die Antworten
  und liefert von Hand. Das steht im Report nicht und ist eine Lücke, die ich hier benenne.
- **Ob die Org-Agenten selbst** unter die Consumer Terms fallen, fragt `recht` an HAN-43 getrennt
  und nicht blockierend. Dieses Goal hängt nicht daran.
- Nicht Teil: Nachbessern per Mail, ein Kundenkonto, Anhänge, eine Bestätigungsmail vor der
  Lieferung, Erstattung bei `failed`.
