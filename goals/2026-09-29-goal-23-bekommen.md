# Goal 23: Eine bezahlte Bestellung wird zu drei Fassungen per E-Mail

## Status
VORSCHLAG (HAN-39, 29.09.2026). Wird vor dem Bau vom Skeptiker widerlegt. Gebaut wird erst, was
danach übrig ist, und erst nachdem Goal 22 ausgerollt ist (WIP = 1). `GOAL.md` trägt bis dahin
Goal 22; dieses Goal zieht dort ein, wenn Goal 22 steht.

Nennt **kein** `src/payments/**` und kein `src/auth/**`. Beides bleibt zu.

Auftrag: HAN-39 (CEO, aus HAN-22 nach HAN-36). Glied: **Bekommen**. Frist: Vorführung geliefert bis
05.10.2026, 18:00 UTC.

## Reihenfolge der beiden Goals

Goal 22 wird zuerst gebaut, Goal 23 danach. Der Grund: die Lieferung liest `status = 'paid'`, und
ohne den Abgleich aus Goal 22 wird eine Zahlung nur gebucht, wenn der Käufer auf `/katalog/danke`
zurückkommt. Goal 23 vor Goal 22 hieße, dass ein Käufer, der den Tab schließt, bezahlt und nie
etwas bekommt, und genau das würde der Report hier nicht einmal sehen.

Der lange Teil von Goal 23 ist nicht Code, sondern der Mailweg, und der hängt an Matthias (Konto,
DNS). Der beginnt deshalb sofort nach dem Urteil des Skeptikers, parallel zum Bau von Goal 22.

## Was gemessen ist, 29.09.2026

- **`checkouts` in Produktion, ganzer Bestand** (`/data/cp.db`, read-only, 29.09. gegen 22 Uhr UTC):
  2 Zeilen `paid`, beide `stripe_test`. Eine von 19:54 UTC ohne `order_briefs`-Zeile (vor Goal 21,
  also ohne E-Mail, nicht lieferbar), eine von 21:07 UTC mit Angaben und einer Adresse aus
  `ops/ours.txt`. Dazu 17 `pending`. Keine Zeile mit `provider = 'stripe'`.
- **Kein Code liest eine bezahlte Zeile und liefert.** Leser von `checkouts`: `src/db.ts`,
  `src/checkout/index.ts`, `ops/db-report.cjs`.
- **`postyourprice.com` empfängt keine Mail.** `dig MX postyourprice.com` ist leer, ebenso SPF und
  DMARC (29.09.). Die Vorführungsadresse `vorfuehrung@postyourprice.com` aus Goal 22 hat also kein
  Postfach. Der DNS liegt bei Cloudflare (`dolly`/`kobe.ns.cloudflare.com`). `handsel.dev` hat
  einen MX auf `inbound-smtp.ap-northeast-1.amazonaws.com`; wohin diese Mails gehen, weiß ich nicht.
- **Kein Mailversand im Repo.** Kein SMTP, kein Anbieter, keine Abhängigkeit dafür.
- **Eine Fassung über das Abo:** `claude -p --model claude-sonnet-5-5`, Rede zum 70. Geburtstag,
  3 Minuten: 25 s Wandzeit, 386 Wörter, `is_error: false`, ohne `ANTHROPIC_API_KEY` in der Umgebung.
  Stichprobe n = 1 auf dem Rechner von Matthias, 29.09. Das ist eine Größenordnung, kein Median.
- **`/datenschutz` nennt nur Stripe.** Dass die Angaben an einen Modellanbieter gehen und die Mail
  über einen Versanddienst, steht dort nicht.

## Der Weg

```
Stripe bezahlt ─> checkouts.status = 'paid' (Goal 22)
                    │
Rechner von Matthias, alle 10 Minuten (launchd):
  ops/deliver.ts
    1. holt per SSH die offenen Bestellungen      ops/delivery-queue.cjs  (liest)
    2. schreibt drei Fassungen                    claude -p, Abo, ohne Werkzeuge
    3. schickt eine Mail                          Versanddienst über HTTPS
    4. trägt die Lieferung ein                    ops/delivery-mark.cjs   (schreibt nur `deliveries`)
```

**Warum auf dem Rechner und nicht in der VM.** Die Fassungen schreibt ein Agent über das Claude-Abo
(Auftrag, Standing Rule seit 29.09.). Das Abo ist der Login des lokalen `claude` CLI, in der VM gibt
es ihn nicht, und einen Schlüssel dorthin zu legen ist genau das, was die Regel verbietet. Der
Versandschlüssel liegt deshalb auch lokal (macOS-Schlüsselbund), nicht in `deploy/.env`: kein
gesperrter Pfad, kein Deploy für einen Schlüsselwechsel.

**Der Preis dafür:** wenn der Rechner schläft, liefert niemand. Die 24 Stunden aus der Zahl sind
großzügig genug für einen Rechner, der täglich läuft, und der Report zeigt jede Zeile, die darüber
liegt. Ein Umzug in die VM ist ein späteres Goal und braucht eine andere Entscheidung zum Abo.

## Die Arbeit, in dieser Reihenfolge

1. **Tabelle `deliveries`** in `src/db.ts`: `reference` (Primärschlüssel, verweist auf `checkouts`),
   `status` (`claimed` | `sent` | `failed`), `attempts`, `claimed_at`, `sent_at`, `message_id` (vom
   Versanddienst), `versions` (Anzahl), `body` (die drei Fassungen, für spätere Runden), `error`
   (nur ein Code, nie Text aus der Bestellung). `cleanupOrderBriefs` löscht `body` mit derselben
   Frist wie die Angaben (`PAID_BRIEF_DAYS` nach der Zahlung); die Zeile selbst bleibt, weil sie
   keinen Menschen nennt und der Report sie braucht.

2. **Wer beliefert wird**, als eine Funktion `deliverable(db, now)` in `src/checkout/deliver.ts`,
   die `ops/delivery-queue.cjs` als Kopie trägt (wie `OUR_EMAILS` in `ops/db-report.cjs`, ein Test
   hält beide gleich):
   - `checkouts.status = 'paid'`, `offer` gesetzt, eine Zeile in `order_briefs`;
   - keine `deliveries`-Zeile mit `sent`, und keine mit `claimed` jünger als 30 Minuten;
   - höchstens 5 Versuche;
   - **`stripe_test` nur an eine Adresse aus `ops/ours.txt`.** Der Testmodus ist öffentlich, jeder
     kann mit 4242 "bezahlen". Ohne diese Regel schreiben wir Fremden umsonst Reden und schicken Mail
     an jede Adresse, die jemand eintippt, auch an eine fremde. `stripe` (live) geht an jede Adresse.

3. **`ops/deliver.ts`**, der Lauf:
   - holt die Liste, trägt für jede Zeile `claimed` ein, bevor ein Modell gefragt wird;
   - drei Aufrufe `claude -p`, je einer mit `claude-opus-5-5`, `claude-sonnet-5-5`,
     `claude-haiku-4-5`, ohne Werkzeuge (`--tools ""`), mit eigenem Systemprompt je Angebot. Die
     Angaben gehen als Daten in den Prompt, nie als Anweisung. Vorher prüft der Lauf, dass
     `ANTHROPIC_API_KEY` leer ist, und bricht sonst ab;
   - prüft jede Fassung: nicht leer, nicht gleich einer anderen, bei der Rede innerhalb der
     gewählten Länge (130 Wörter je Minute, plus minus 30 Prozent). Eine Fassung, die durchfällt,
     wird einmal neu geschrieben. **Weniger als drei gehen nie raus;** dann `failed` mit Code, und
     der nächste Lauf versucht es wieder;
   - schickt **eine** Mail mit den drei Fassungen, Absender `bestellung@postyourprice.com`,
     `Reply-To` die Adresse aus dem Impressum, Idempotenzschlüssel = Referenz. Stürzt der Lauf
     zwischen Versand und Eintrag ab, schickt der nächste dieselbe Mail nicht ein zweites Mal;
   - trägt `sent`, `message_id` und `body` ein;
   - loggt je Lauf nur Zahlen: gefunden, geschickt, fehlgeschlagen, Sekunden. Keine Adresse, keine
     Angaben, auch nicht bei einem Fehler.

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
   - `ops/ziele.sh` meldet rot, wenn `paid_not_delivered_over_24h` größer 0 ist.

6. **`/datenschutz`**: nennt Anthropic (die Angaben gehen an Claude, USA) und den Versanddienst.
   Text von `recht` (CFO) geprüft. Pflicht vor dem Live-Schlüssel (HAN-31), nicht vor der
   Vorführung, weil die nur unsere eigene Adresse beliefert.

7. **Tests**, gegen ein gestelltes `claude` und einen gestellten Versanddienst, in beide Richtungen:
   - bezahlte Zeile mit Angaben: drei Fassungen, genau eine Mail, `sent`;
   - `pending`, `abandoned`, bezahlt ohne Angaben: keine Mail;
   - `stripe_test` an eine fremde Adresse: keine Mail; an `vorfuehrung@postyourprice.com`: Mail;
   - ein Modell antwortet leer: einmal neu, danach `failed`, keine Mail mit zwei Fassungen;
   - Absturz nach dem Versand, vor dem Eintrag: der zweite Lauf schickt mit demselben
     Idempotenzschlüssel, der Versanddienst meldet dieselbe `message_id`, eine Mail;
   - zwei Läufe gleichzeitig: nur einer nimmt die Zeile (`claimed`);
   - `ANTHROPIC_API_KEY` gesetzt: der Lauf bricht ab, bevor ein Modell gefragt wird;
   - der Report: eine gepflanzte bezahlte Zeile ohne Lieferung, 25 Stunden alt, macht
     `paid_not_delivered_over_24h = 1`; dieselbe mit `sent` macht 0; eine `pending` zählt nicht mit.

## Was Matthias tun muss, und nur er

Über den Schreiber, in einer Nachricht, erst nach dem Urteil des Skeptikers:

1. Ein Konto beim Versanddienst. Mein Vorschlag ist **Resend**: die freie Stufe trägt 3.000 Mails im
   Monat und 100 am Tag, das Senden ist eine HTTPS-Anfrage mit Idempotenzschlüssel, und der
   Zustellstatus ist per API lesbar, also ein Beleg aus einem Log und nicht aus einem Posteingang.
   Den API-Schlüssel legt er in den Schlüsselbund (`security add-generic-password -s cp-resend`),
   nie in eine Datei im Repo.
2. In Cloudflare für `postyourprice.com`: die DNS-Einträge, die Resend nennt (DKIM, SPF und MX für
   die Absender-Subdomain), dazu `_dmarc` mit `p=none`. Oder er gibt dem Loop Zugang und der Loop
   trägt sie ein.
3. Cloudflare Email Routing für `vorfuehrung@postyourprice.com` auf ein Postfach, das er liest.
   Ohne das kommt die Vorführung nirgends an.
4. Ob das Claude-Abo Texte schreiben darf, die ein Kunde bezahlt. Das prüft vorher `recht`
   (Anthropics Bedingungen für das Abo); Matthias entscheidet nur, wenn dort eine Frage bleibt.

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
- **Wie lange es dauert.** Nicht gemessen, außer einer einzelnen Fassung (25 s). Die Seite nennt
  keine Zeit, und das bleibt so, bis ein Median aus echten Lieferungen da ist.
- **Nachbessern für Katalogbestellungen ist nicht gebaut.** Der Katalog verspricht "bis zu dreimal
  sagen, was anders werden soll". Bis ein eigenes Goal das baut, liest ein Mensch die Antworten
  und liefert von Hand. Das steht im Report nicht und ist eine Lücke, die ich hier benenne.
- **Ob das Abo den Umfang trägt.** Drei Fassungen je Bestellung gegen das Nutzungslimit eines
  Abos, bei dem auch die Org läuft: bei zehn Bestellungen im Monat egal, bei hundert am Tag nicht.
- **Ob Resend der richtige Dienst ist**, ist eine Wahl, keine Messung. Gewählt, weil Senden,
  Idempotenz und Zustellstatus je eine Anfrage sind; jeder andere mit denselben drei Dingen passt.
- Nicht Teil: Nachbessern per Mail, ein Kundenkonto, Anhänge, eine Bestätigungsmail vor der
  Lieferung, Erstattung bei `failed`.
