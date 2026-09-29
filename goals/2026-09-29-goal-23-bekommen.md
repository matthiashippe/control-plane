# Goal 23: Eine bezahlte Bestellung wird zu drei Fassungen per E-Mail

## Status
VORSCHLAG, Fassung 6 (HAN-39, 29.09.2026). Fassung 6 trägt die Auflagen 18 bis 20 aus dem Urteil zu
Fassung 5 (HAN-54). Fassung 5 trug die Auflagen 15 bis 17 (HAN-51) und die Bedingungen A und B von
`recht` aus HAN-45, Fassung 4 die Auflagen 10 bis 14 (HAN-46). OpenRouters Bedingungen (Stand
31.08.2026, 5.1) und OpenAIs (4.1 und 2.2) tragen den Verkauf. **Mit `zdr: true` schreibt aber
Azure, und Microsofts Bedingungen für Azure sind nicht gelesen**, weder die Output-Klausel noch die
Gesellschaft; das steht auf der Liste vor dem Live-Schlüssel und blockiert die Vorführung nicht. Fassung 1 hat der Skeptiker an HAN-42 widerlegt, mit neun
Auflagen; Fassung 3 trägt die Auflagen 5 bis 9, die Auflagen 1 bis 4 galten dem Weg über das Abo und
den Rechner, den es seit Fassung 2 nicht mehr gibt. Fassung 3 geht noch einmal an den Skeptiker.
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
Ausgaben decken, habe ich nicht gelesen; das prüft `recht` in HAN-45, und ohne dessen Ergebnis wird
nicht gebaut (HAN-46, Auflage 10). Seit 5ce852d (19.09.) läuft die Inferenz über OpenRouter, im
Container stehen `CP_PROVIDER=openrouter` und `CP_OPENROUTER_MODELS=openai/gpt-5.2,openai/gpt-5-mini`
(gelesen vom Skeptiker, 29.09., 21:27 UTC). Kosten und Dauer je drei Fassungen sind **nicht
belegt**: für die in Umlauf befindlichen Zahlen 0,075 und 19,2 s gibt es im Repo keine Quelle
(`git log -S`, 29.09.), und sie stehen deshalb nicht in diesem Goal (Auflage 13). Die Standing Rule regelt, wie die Agenten der Org abgerechnet werden; die
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

- **`checkouts` in Produktion, ganzer Bestand** (`/data/cp.db`, read-only, 29.09. gegen 21:10 UTC):
  2 Zeilen `paid`, beide `stripe_test`. Eine von 19:54 UTC ohne `order_briefs`-Zeile (vor Goal 21,
  also ohne E-Mail, nicht lieferbar), eine von 21:07 UTC mit Angaben und der Adresse
  `vorfuehrung@postyourprice.com` (geprüft 29.09., ohne die Adresse auszugeben). Dazu 17 `pending`. Keine Zeile mit `provider = 'stripe'`.
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
   `status` (`claimed` | `written` | `sent` | `failed`), `attempts`, `claimed_at`, `written_at`
   (einmal gesetzt, wenn die dritte Fassung gespeichert ist, nie überschrieben), `sent_at`, `message_id` (vom
   Versanddienst), `versions` (Anzahl), `body` (die drei Fassungen, für spätere Runden), `cost_mc`
   (Inferenzkosten in Millicent), `error` (nur ein Code, nie Text aus der Bestellung).
   `cleanupOrderBriefs` löscht `body` mit derselben Frist wie die Angaben (`PAID_BRIEF_DAYS` nach der
   Zahlung); die Zeile selbst bleibt, weil sie keinen Menschen nennt und der Report sie braucht.

2. **Wer beliefert wird**, `deliverable(db, now)` in `src/checkout/deliver.ts`:
   - `checkouts.status = 'paid'`, `offer` gesetzt, eine Zeile in `order_briefs`;
   - keine `deliveries`-Zeile mit `sent` oder `failed`, und keine mit `claimed` jünger als 30
     Minuten. **`failed` ist endgültig** (HAN-51, Auflage 16) und hat genau drei Codes:
     `stale_written`, `cost_cap`, `attempts_exhausted`. Ein vorübergehender Fehler setzt nie
     `failed`, sondern nur `error` und gibt die Zeile frei: zurück auf `written`, wenn `written_at`
     gesetzt ist, sonst auf `claimed` mit abgelaufenem `claimed_at`;
   - `settled_at` nach `DELIVERY_START`, einer Konstante mit dem Zeitpunkt des Commits, der die
     Lieferung baut, nie einem späteren (HAN-46, Auflage 14). Ältere Zeilen (heute die von 21:07 UTC)
     werden nicht nachgeliefert und stehen im Report als `paid_before_delivery`, getrennt nach
     `ours` und `human`. Für `ours` ist das eine Ausnahme, damit Done 4 nicht ab dem 30.09. 21:07
     UTC rot ist (HAN-42, Auflage 9); für `human` ist jede solche Zeile ein Verstoß und rot;
   - höchstens 5 Versuche, höchstens 10 Zeilen je Lauf, älteste Zahlung zuerst. Was als Versuch
     zählt, entscheidet eine Tabelle, im Goal und als eine Funktion `countsAsAttempt(err)` im Code
     (HAN-54, Auflage 18). Sie hängt am Fehlertyp aus `src/inference/provider.ts` und am Status, den
     `openrouter.ts` mitgibt:

     | Fall | Quelle in `openrouter.ts` | zählt |
     |---|---|---|
     | Fassung besteht die Prüfung nicht | Lieferung | ja |
     | `ProviderBadRequestError` (HTTP 400) | `:218` | ja |
     | `ProviderUnavailableError`, 4xx außer 429 (401, 402, 403, 422) | `:223` | ja |
     | `ProviderUnavailableError`, 429 | `:223` | nein |
     | `ProviderUnavailableError`, 5xx | `:223` | nein |
     | Timeout, Netzfehler (Status `null`) | `fetch` | nein |
     | Fehler im Body einer 200, mit Code | `:240` | wie sein Code nach den Zeilen oben |
     | Fehler im Body einer 200, ohne Code (Status 200) | `:240` | ja |
     | Antwort ohne `choices` | `:243` | ja |

     Ein Fall, der in keiner Zeile steht, zählt, damit nichts endlos läuft. Status 200 zählt, weil
     OpenRouter damit eine Antwort meldet, die trotzdem keine Fassung ist, und eine Wiederholung
     daran nichts ändert;
   - **Kostengrenze je Zeile**, `DELIVERY_COST_CAP_MC = 50_000`, also 50 US-Cent in Millicent, weil
     OpenRouter in USD abrechnet. Gezählt wird die Summe über alle Läufe in `cost_mc`. Ist sie
     erreicht, wird die Zeile `failed` mit `cost_cap`, gleich welcher Fehler. Kosten entstehen nur
     aus Antworten, die OpenRouter berechnet (`usage.cost`); ein 5xx trägt keine, weil
     `openrouter.ts:221-223` vorher wirft. Die Grenze fängt also bezahlte Fassungen, die immer wieder
     durchfallen, und nicht einen dauerhaft ausgefallenen Anbieter (siehe "nicht weiß"). Eine Fassung, die die
     Prüfung besteht, wird sofort in `body` gespeichert und nie neu geschrieben, auch wenn die
     anderen beiden noch fehlen (HAN-46, Auflage 12). Die Grenze ist eine Setzung, keine Messung:
     sie liegt bei 2,6 Prozent des kleinsten Katalogpreises (17 EUR, umgerechnet mit 1,1355 USD je EUR
     aus `ops/anzeigen-rechnung.py:101`), und wird
     nach der Vorführung an `delivery_cost_mc_median` gemessen;
   - **`stripe_test` nur an eine eigene, explizite Zustellliste**, `TEST_DELIVERY_TO`, heute genau
     `vorfuehrung@postyourprice.com`. Nicht `ops/ours.txt`: dort stehen die RFC-2606-Domains für
     Agenten, die den Kaufweg prüfen, und jede Adresse unter `postyourprice.com`; an die gäbe es nur
     Bounces, und Resend pausiert ab 4 Prozent (HAN-42, Auflage 5). Eine RFC-2606-Domain bekommt nie
     eine Mail, auch nicht live. `stripe` (live) geht an jede andere Adresse.

3. **`deliverPaidOrders`**, der Lauf, in `src/index.ts` alle 5 Minuten nach dem Abgleich aus Goal 22,
   mit `.unref()`, ein Fehler landet im Log und beendet den Prozess nicht. Läuft nur, wenn
   `checkoutEnabled()` wahr ist und ein Versandschlüssel gesetzt ist.
   - trägt für jede Zeile `claimed` ein, bevor ein Modell gefragt wird (bedingtes `INSERT OR
     IGNORE` bzw. `UPDATE ... WHERE`, damit zwei Läufe dieselbe Zeile nicht beide nehmen);
   - drei Anfragen an den Inferenz-Provider, verteilt über `CP_OPENROUTER_MODELS`, mit eigenem
     Systemprompt je Angebot und je einer anderen Vorgabe für Ton oder Aufbau, damit drei
     verschiedene Texte entstehen. Die Angaben gehen als Daten in den Prompt, nie als Anweisung,
     keine Werkzeuge. **Jede Lieferanfrage trägt `provider: { zdr: true }`** (`recht`, HAN-45,
     Bedingung A): damit gehen die Angaben nur an Endpunkte ohne Speicherung, heute für beide Modelle
     nur Azure (`/api/v1/endpoints/zdr`, öffentlich, 29.09. 21:33 UTC: `Azure | openai/gpt-5.2-20251211`
     und `Azure | openai/gpt-5-mini-2025-08-07`). `src/inference/openrouter.ts` bekommt dafür eine
     Option nur für die Lieferung; der Proxy unter `/v1/chat/completions` bleibt, wie er ist.
     `openrouter.ts` gibt außerdem das Feld `provider` der Antwort zurück, `deliveries` speichert es
     je Fassung, und das Log des Laufs zählt Fassungen je Anbieter (`provider Azure 3`), damit eine
     Anfrage, die trotz `zdr: true` bei OpenAI landet, sichtbar wird (Gegenprobe von `recht`,
     HAN-54, Auflage 20). Erster Schritt des Baus ist eine echte Anfrage mit `zdr: true` an jedes
     Modell; Beleg in Done 5. **Die E-Mail-Adresse steht nie im Prompt**
     (Bedingung B), nur die Felder aus `order_briefs.brief`. Die Kosten gehen nicht über das Ledger (es gibt kein Wallet), sondern nach
     `deliveries.cost_mc`;
   - prüft jede Fassung: nicht leer, nicht gleich einer anderen, bei der Rede innerhalb der
     gewählten Länge (130 Wörter je Minute, plus minus 30 Prozent). Eine Fassung, die durchfällt,
     wird einmal neu geschrieben. **Weniger als drei gehen nie raus;** dann steigt `attempts`, die
     Zeile bleibt offen, und bei 5 Versuchen wird sie `failed` mit `attempts_exhausted`;
   - **speichert die drei Fassungen vor dem Versand** in `deliveries.body`, Status `written`. Ab
     dann wird nie neu geschrieben: jeder weitere Lauf verschickt genau diesen gespeicherten Text
     (HAN-42, Auflage 6). Resend hält einen Idempotenzschlüssel 24 Stunden und antwortet auf
     denselben Schlüssel mit anderem Inhalt 409; mit neu geschriebenen Fassungen gäbe ein Absturz
     zwischen Versand und Eintrag innerhalb von 24 Stunden einen 409 und danach eine zweite Mail;
   - schickt **eine** Mail mit den drei Fassungen, Absender `bestellung@postyourprice.com`,
     `Reply-To` die Adresse aus dem Impressum, Idempotenzschlüssel = Referenz. Innerhalb von 24
     Stunden gibt Resend für denselben Schlüssel mit demselben Inhalt die alte ID zurück, ohne neu zu
     senden. **Eine Zeile, deren `written_at` mehr als 23 Stunden zurückliegt und die nicht `sent` ist, wird nicht mehr
     versendet**, sondern `failed` mit `stale_written`, und ist nach 24 Stunden rot (HAN-46, Auflage
     11). Resend kann eine Mail nicht nach Schlüssel oder Tag suchen (`GET /emails` kennt nur
     `limit`, `after`, `before`); rot ist dann ehrlich, eine zweite Mail wäre es nicht;
   - trägt `sent`, `message_id` und `cost_mc` ein;
   - loggt je Lauf nur Zahlen: gefunden, geschickt, fehlgeschlagen, Sekunden. Keine Adresse, keine
     Angaben, keine Referenz, auch nicht bei einem Fehler.

4. **Die Mail**, deutsch, Nur-Text plus einfaches HTML, vom CMO (`copy`) abgenommen. Sie sagt, dass
   die Fassungen von einer KI geschrieben sind, und wie man eine Änderung bekommt: auf die Mail
   antworten. Das liest bis zu einem eigenen Goal ein Mensch (siehe unten).

5. **Das Feld im Report**, `ops/db-report.cjs`, `report.delivery`, nur Zahlen, getrennt nach
   `ours` und `human`:
   (`human` heißt `provider = 'stripe'` und eine Adresse außerhalb von `ops/ours.txt`; jede
   `stripe_test`-Zeile ist `ours` oder `test_not_delivered_by_rule`, nie `human`)
   - `paid_with_brief` als Nenner je Gruppe, dazu `paid_delivered`, `paid_not_delivered`,
     `paid_not_delivered_over_24h` (HAN-42, Auflage 9);
   - `test_not_delivered_by_rule`: `stripe_test`-Zeilen außerhalb von `TEST_DELIVERY_TO`, eigene Zahl,
     weder unter `human` noch unter `over_24h`, sonst macht jeder Fremde mit der Karte 4242 das Goal
     rot (Auflage 5);
   - `paid_before_delivery`, getrennt nach `ours` (heute 1) und `human` (heute 0); `ops/ziele.sh`
     meldet rot bei `human > 0`;
   - `paid_undeliverable`: bezahlt ohne `order_briefs`-Zeile. Heute 1 (die Zeile von 19:54 UTC). Sie
     steht getrennt, damit sie weder als Lieferung noch als Verstoß zählt; ab Goal 21 darf es keine
     neue geben;
   - `minutes_to_delivery_median` über `sent_at - settled_at`, 30 Tage;
   - `delivery_cost_mc_median`, 30 Tage, in Millicent;
   - `ops/ziele.sh` meldet rot, wenn `paid_not_delivered_over_24h` größer 0 ist, und "kein Messweg"
     statt grün, wenn der Nenner `paid_with_brief` 0 ist. Für `human` ist das heute so.

6. **`/datenschutz`**: die zwei Abschnitte "Wer Ihren Text schreibt" (OpenRouter, Microsoft,
   OpenAI) und "Wie Ihr Text zu Ihnen kommt" (Resend) aus dem Dokument `recht` an HAN-45, wörtlich,
   dazu der Satz zu den Fassungen unter "Wie lange". Der erste Abschnitt stimmt nur mit `zdr: true`
   und nur für die heutige Modellliste; ändert sich `CP_OPENROUTER_MODELS`, schreibt `recht` ihn
   vorher neu. Pflicht vor dem Live-Schlüssel (HAN-31), nicht vor der Vorführung, weil die nur
   unsere eigene Adresse beliefert.

7. **Tests**, gegen einen gestellten Inferenz-Provider (`src/inference/mock.ts`) und einen
   gestellten Versanddienst, in beide Richtungen. Wo es um den Draht geht (`zdr`, Fehlerklassen),
   läuft der Test über `OpenRouterProvider` mit gestelltem `fetch` (`opts.fetch`,
   `openrouter.ts:66`) und liest den JSON-Body bzw. gibt echte HTTP-Antworten zurück:
   - bezahlte Zeile mit Angaben: drei Fassungen, genau eine Mail, `sent`;
   - `pending`, `abandoned`, bezahlt ohne Angaben: keine Mail;
   - `stripe_test` an eine fremde Adresse: keine Mail; an `vorfuehrung@postyourprice.com`: Mail;
   - ein Modell antwortet leer: einmal neu, danach steigt `attempts`, keine Mail mit zwei Fassungen;
   - Absturz nach dem Versand, vor dem Eintrag, gegen einen gestellten Versanddienst, der Schlüssel
     24 Stunden hält und bei gleichem Schlüssel mit anderem Inhalt 409 gibt: ein Lauf 10 Minuten
     später bekommt die alte ID und schickt nichts Neues; eine Zeile, deren `written_at` 23 Stunden und eine
     Minute zurückliegt, wird `failed` mit `stale_written`, und der Versanddienst sieht keinen
     Aufruf (der gestellte Dienst kann nichts, was Resend nicht kann: kein Suchen);
   - `cost_cap` über bezahlte Antworten: der gestellte `fetch` liefert Fassungen mit `usage.cost`,
     die die Prüfung nicht bestehen, bis die Summe `DELIVERY_COST_CAP_MC` erreicht; die Zeile wird
     `failed` mit `cost_cap` (HAN-54, Auflage 19);
   - ein Modell antwortet dauerhaft mit 502, die anderen beiden liefern: die zwei Fassungen werden
     einmal bezahlt und gespeichert, `cost_mc` wächst danach nicht, `attempts` bleibt 0, die Zeile
     wird nicht `failed`, und nach 24 Stunden steht sie im Report unter
     `paid_not_delivered_over_24h` (Auflage 19);
   - je eine Zeile der Tabelle aus Punkt 2 über den gestellten `fetch`: 400, 402, 429, 502,
     Timeout, Body-Fehler mit 4xx (zählt), Body-Fehler mit 502 (zählt nicht), Body-Fehler ohne Code
     (zählt), Antwort ohne `choices` (zählt) (Auflage 18);
   - nach `stale_written`, `cost_cap` und `attempts_exhausted` ruft ein weiterer Lauf weder den
     Inferenz-Provider noch den Versanddienst auf. Der Test lässt dafür die echte Kette laufen,
     setzt `written_at` durch den Lauf selbst und stellt nur die Uhr vor, statt eine fertige Zeile
     zu pflanzen (Auflage 16);
   - der JSON-Body jeder Lieferanfrage, gelesen im gestellten `fetch`, trägt `provider.zdr = true`,
     der Body einer Anfrage über den Proxy trägt es nicht; das Feld `provider` der Antwort landet in
     `deliveries` (Auflage 20); kein Prompt enthält die E-Mail-Adresse der Bestellung, geprüft mit
     einer unverwechselbaren Adresse im Test (Auflage 15);
   - ein 429 oder Timeout von OpenRouter, sechsmal hintereinander: `attempts` bleibt 0, die Zeile
     wird beim siebten Lauf geliefert;
   - `stripe_test` an `x@example.com`, an `andere@postyourprice.com`, an eine fremde Adresse: keine
     Mail, gezählt unter `test_not_delivered_by_rule`;
   - bezahlt vor `DELIVERY_START`: keine Mail, gezählt unter `paid_before_delivery`; eine
     gepflanzte `stripe`-Zeile an eine fremde Adresse, bezahlt vor `DELIVERY_START`, macht
     `paid_before_delivery.human = 1` und `ops/ziele.sh` rot (Auflage 14);
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

5. Vor dem Live-Schlüssel, nicht vor der Vorführung, zwei Dinge. Erstens liest `recht` Microsofts
   Bedingungen für Azure über OpenRouter (Output-Rechte, Vertragsgesellschaft) und trägt die
   Gesellschaft in `/datenschutz` ein. Zweitens sieht Matthias im OpenRouter-Konto nach, dass "Private
   Input & Output Logging" und "OpenRouter Use of Inputs/Outputs" aus sind (`recht`, HAN-45,
   Bedingung C). Ist der zweite an, stimmt der Satz in `/datenschutz` nicht.

Keine Frage zum Abo und keine Ausnahme von der Standing Rule. Die Nachricht sagt ihm in einem Satz,
als Mitteilung und nicht als Frage, dass die Lieferung über den OpenRouter-Schlüssel des Dienstes
läuft (HAN-46, Auflage 10).

## Done, gemessen und nicht behauptet

1. `pnpm test` und `pnpm e2e` grün, kein Test gelockert.
2. `dig` zeigt DKIM, SPF und DMARC für die Absenderdomain; eine Testmail an ein Postfach bei einem
   großen Anbieter kommt im Posteingang an, nicht im Spam, mit `dkim=pass` und `spf=pass` im Header.
3. **Die Vorführung**: nach dem Deploy eine Bestellung im Testmodus unter
   `vorfuehrung@postyourprice.com`, Karte 4242, bis zur Mail. Belege: die `checkouts`-Zeile `paid`,
   die `deliveries`-Zeile `sent` mit `message_id`, der Status `delivered` beim Versanddienst für
   diese `message_id`, und die Mail im Postfach von Matthias mit drei Fassungen. Zählt nie als
   Umsatz (Sperrliste 0), und der Report führt sie unter `ours`. **Unbeaufsichtigt** (HAN-42,
   Auflage 8): zwischen Zahlung und `sent_at` ruft niemand etwas von Hand; Beleg ist die Logzeile
   des Laufs aus `src/index.ts` im Container-Log mit `sent 1`, `sent_at - settled_at` aus der DB und
   `versions = 3` in der DB. Das Postfach ist kein Log (Sperrliste 2); als Beleg zählt dort nur der
   gespeicherte Header mit `dkim=pass`, abgelegt unter `.scratch/`.
4. `ops/db-report.cjs` in Produktion: `paid_not_delivered_over_24h = 0` für `ours` mit Nenner
   mindestens 1, für `human` "kein Messweg", solange der Nenner 0 ist, und die Gegenprobe aus
   Punkt 7 grün.

5. **Die erste echte Anfrage mit `zdr: true`**, je Modell eine, nach dem Deploy aus dem Container:
   Antwort 200 mit `provider = "Azure"`, die Antwort ohne Text abgelegt unter
   `.scratch/goal-23/zdr-<modell>.json`. Antwortet ein Modell mit 404 oder einem anderen Anbieter,
   ist Bedingung A nicht erfüllbar, und die Lieferung nimmt dieses Modell nicht (HAN-54, Auflage 20).

**Widerlegt, wenn:** im Report nach `DELIVERY_START` eine bezahlte Zeile mit Angaben älter als 24
Stunden ohne Lieferung steht, oder `paid_before_delivery.human > 0`, oder eine Zeile beim
Versanddienst zwei `message_id` hat, oder eine Mail an eine fremde Adresse für eine
`stripe_test`-Zeile im Log des Versanddienstes steht.

## Was dieses Goal nicht weiß und nicht tut

- **Ob die Mail beim Kunden ankommt**, zeigt nur Done 2, mit n = 1. `delivered` in Done 3 heißt
  nur, dass Cloudflares MX die Mail angenommen hat. Eine neue Domain ohne Geschichte landet oft
  im Spam; der Versanddienst meldet dann trotzdem `delivered`, weil er nur den Empfang durch den
  Mailserver sieht. Deshalb braucht Done 3 das Postfach und nicht nur den Status.
- **Wie lange es dauert und was es kostet.** Nicht belegt, weder für die Kette noch für eine
  Bestellung von der Zahlung bis zur Mail; die erste Zahl mit Quelle liefert die Vorführung. Der Takt von 5 Minuten kommt dazu. Die Seite nennt keine
  Zeit, und das bleibt so, bis ein Median aus echten Lieferungen da ist.
- **Ob die Fassungen gut genug sind.** Die Prüfung in Punkt 3 fängt Leere, Dopplung und falsche
  Länge, nicht einen schwachen Text. Das zeigt erst die Vorführung und danach die Antworten.
- **Live bleibt nach Goal 22 nur im Text zu.** Wird der Live-Schlüssel gesetzt, bevor Goal 23
  läuft, bekommt ein zahlender Mensch nichts. Das verhindert kein Code, aber seit Auflage 14 macht
  es `paid_before_delivery.human` rot. Der Schreiber sagt Matthias, dass HAN-31 auf Goal 23 wartet.
- **Ein dauerhaft ausgefallener Anbieter** hält eine Zeile offen, ohne Versuch und ohne Kosten, bis
  sie nach 24 Stunden rot ist. Das ist gewollt: der Report zeigt es, und ein Mensch sieht nach. Eine
  automatische Ausweichroute auf ein anderes Modell baut dieses Goal nicht.
- **Welche Codes OpenRouter im Body wirklich schickt**, habe ich nie in einer echten Antwort gesehen.
  Die Tabelle ordnet jeden Fall zu, auch den unbekannten; ob die Zuordnung im Betrieb passt, zeigt
  erst das Log.
- **Nachbessern für Katalogbestellungen ist nicht gebaut.** Der Katalog verspricht "bis zu dreimal
  sagen, was anders werden soll". Bis ein eigenes Goal das baut, liest ein Mensch die Antworten
  und liefert von Hand. Das steht im Report nicht und ist eine Lücke, die ich hier benenne.
- **Ob die Org-Agenten selbst** unter die Consumer Terms fallen, fragt `recht` an HAN-43 getrennt
  und nicht blockierend. Dieses Goal hängt nicht daran.
- Nicht Teil: Nachbessern per Mail, ein Kundenkonto, Anhänge, eine Bestätigungsmail vor der
  Lieferung, Erstattung bei `failed`.
