# Warum der zahlende Automaton aufhört (Rückgang November 2026)

Ziel: Wir wissen gemessen, warum die fremde Inferenz-Ausgabe von 8,19 USD am 12.11. auf 0,13 USD am 18.11. fiel, je Kunde, und
beheben eine Ursache bei uns als Nächstes (Topic `fehler`). Goal: `goals/kunden/01-warum-der-zahlende-automaton-aufhoert.md`.

Gemessen: 2026-11-19T16:01:23Z
Rückgang über alle fremden Kunden: 8,19 USD am 12.11., 0,13 USD am 18.11. (Beträge je Kunde nicht im öffentlichen Repo,
`loop-constraints.md` Grundregel 8)
Leitzahl: 4,11 USD fremde Inferenz-Ausgabe in den 7 Tagen bis 2026-11-19

Das sind dieselben Summen wie in `docs/richtung/2026-11-19.md`. Am 12.11. gaben Kunde 1, 3 und 4 aus. Umsatz und Saldo je Kunde
stehen nur in der Ausgabe des Werkzeugs auf dem code-host; unten sind sie durch `*.**` ersetzt (Grundregel 8: nie Umsatz je Kunde ins
Repo), Zählungen und HTTP-Status bleiben.

## Befehl und Ausgabe

Nur lesend, vom code-host: das Ledger über `ops/db-report.cjs` mit `CP_REPORT=decline` (`readonly: true` im Container `cp`), das
ganze Zugriffslog über `ops/access-log.sh`, gerechnet auf dem code-host.

```
set -a; . ~/.config/control-plane/loop.env; set +a
bash ops/customer-decline.sh --since 2026-11-05T00:00:00Z
```

Exit 0, 104 Zeilen, keine Adresse; Beträge je Kunde durch `*.**` ersetzt:

```
DECLINE since 2026-11-05T00:00:00Z until 2026-11-19T16:01:23Z: 5 foreign customers with inference
CUSTOMER 1: first 2026-11-10T05:12:06Z, last 2026-11-13T05:05:18Z, balance *.** USD, last topup 2026-11-10T20:55:00Z, ips 1
DAY 1 2026-11-05: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 1 2026-11-06: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 1 2026-11-07: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 1 2026-11-08: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 1 2026-11-09: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 1 2026-11-10: 368 calls, *.** USD, models openai/gpt-5.2:305,openai/gpt-5-mini:63, http 2xx 365 402 0 4xx 3 5xx 2
DAY 1 2026-11-11: 66 calls, *.** USD, models openai/gpt-5-mini:35,openai/gpt-5.2:31, http 2xx 66 402 0 4xx 0 5xx 1001
DAY 1 2026-11-12: 502 calls, *.** USD, models openai/gpt-5-mini:502, http 2xx 502 402 0 4xx 0 5xx 392
DAY 1 2026-11-13: 177 calls, *.** USD, models openai/gpt-5-mini:177, http 2xx 177 402 1250 4xx 0 5xx 0
DAY 1 2026-11-14: 0 calls, *.** USD, models -, http 2xx 0 402 1625 4xx 0 5xx 0
DAY 1 2026-11-15: 0 calls, *.** USD, models -, http 2xx 0 402 1615 4xx 0 5xx 0
DAY 1 2026-11-16: 0 calls, *.** USD, models -, http 2xx 0 402 1595 4xx 0 5xx 0
DAY 1 2026-11-17: 0 calls, *.** USD, models -, http 2xx 0 402 1595 4xx 0 5xx 0
DAY 1 2026-11-18: 0 calls, *.** USD, models -, http 2xx 0 402 1585 4xx 0 5xx 0
DAY 1 2026-11-19: 0 calls, *.** USD, models -, http 2xx 0 402 1065 4xx 0 5xx 0
CUSTOMER 2: first 2026-11-10T08:49:13Z, last 2026-11-10T08:49:13Z, balance *.** USD, last topup never, ips 1
DAY 2 2026-11-05: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 2 2026-11-06: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 2 2026-11-07: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 2 2026-11-08: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 2 2026-11-09: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 2 2026-11-10: 1 calls, *.** USD, models openai/gpt-5-mini:1, http 2xx 1 402 0 4xx 0 5xx 0
DAY 2 2026-11-11: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 2 2026-11-12: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 2 2026-11-13: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 2 2026-11-14: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 2 2026-11-15: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 2 2026-11-16: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 2 2026-11-17: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 2 2026-11-18: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 2 2026-11-19: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
CUSTOMER 3: first 2026-11-12T14:09:24Z, last 2026-11-12T17:25:40Z, balance *.** USD, last topup 2026-11-12T14:10:44Z, ips 1
DAY 3 2026-11-05: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 3 2026-11-06: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 3 2026-11-07: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 3 2026-11-08: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 3 2026-11-09: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 3 2026-11-10: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 3 2026-11-11: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 3 2026-11-12: 219 calls, *.** USD, models openai/gpt-5.2:114,openai/gpt-5-mini:105, http 2xx 219 402 270 4xx 1 5xx 0
DAY 3 2026-11-13: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 3 2026-11-14: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 3 2026-11-15: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 3 2026-11-16: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 3 2026-11-17: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 3 2026-11-18: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 3 2026-11-19: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
CUSTOMER 4: first 2026-11-12T22:34:14Z, last 2026-11-13T07:49:57Z, balance *.** USD, last topup never, ips 1
DAY 4 2026-11-05: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 4 2026-11-06: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 4 2026-11-07: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 4 2026-11-08: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 4 2026-11-09: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 4 2026-11-10: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 4 2026-11-11: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 4 2026-11-12: 22 calls, *.** USD, models openai/gpt-5-mini:22, http 2xx 22 402 0 4xx 0 5xx 0
DAY 4 2026-11-13: 10 calls, *.** USD, models openai/gpt-5-mini:10, http 2xx 10 402 15 4xx 0 5xx 0
DAY 4 2026-11-14: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 4 2026-11-15: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 4 2026-11-16: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 4 2026-11-17: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 4 2026-11-18: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 4 2026-11-19: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
CUSTOMER 5: first 2026-11-14T14:44:22Z, last 2026-11-19T11:01:32Z, balance *.** USD, last topup 2026-11-14T20:53:10Z, ips 1
DAY 5 2026-11-05: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 5 2026-11-06: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 5 2026-11-07: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 5 2026-11-08: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 5 2026-11-09: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 5 2026-11-10: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 5 2026-11-11: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 5 2026-11-12: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 5 2026-11-13: 0 calls, *.** USD, models -, http 2xx 0 402 0 4xx 0 5xx 0
DAY 5 2026-11-14: 50 calls, *.** USD, models openai/gpt-5-mini:45,openai/gpt-5.2:5, http 2xx 50 402 0 4xx 0 5xx 0
DAY 5 2026-11-15: 37 calls, *.** USD, models openai/gpt-5-mini:37, http 2xx 37 402 0 4xx 0 5xx 0
DAY 5 2026-11-16: 22 calls, *.** USD, models openai/gpt-5-mini:22, http 2xx 22 402 0 4xx 0 5xx 0
DAY 5 2026-11-17: 13 calls, *.** USD, models openai/gpt-5-mini:13, http 2xx 13 402 0 4xx 0 5xx 0
DAY 5 2026-11-18: 27 calls, *.** USD, models openai/gpt-5-mini:27, http 2xx 27 402 0 4xx 0 5xx 0
DAY 5 2026-11-19: 11 calls, *.** USD, models openai/gpt-5-mini:11, http 2xx 11 402 0 4xx 0 5xx 0
OTHER 2026-11-05: http 2xx 0 402 0 4xx 145 5xx 0
OTHER 2026-11-06: http 2xx 0 402 0 4xx 168 5xx 0
OTHER 2026-11-07: http 2xx 0 402 0 4xx 58 5xx 0
OTHER 2026-11-08: http 2xx 0 402 0 4xx 15 5xx 0
OTHER 2026-11-09: http 2xx 0 402 0 4xx 46 5xx 0
OTHER 2026-11-10: http 2xx 0 402 0 4xx 192 5xx 0
OTHER 2026-11-11: http 2xx 0 402 0 4xx 370 5xx 0
OTHER 2026-11-12: http 2xx 0 402 0 4xx 372 5xx 0
OTHER 2026-11-13: http 2xx 0 402 0 4xx 565 5xx 0
OTHER 2026-11-14: http 2xx 0 402 0 4xx 307 5xx 0
OTHER 2026-11-15: http 2xx 0 402 0 4xx 635 5xx 0
OTHER 2026-11-16: http 2xx 20 402 0 4xx 1721 5xx 0
OTHER 2026-11-17: http 2xx 13 402 0 4xx 12 5xx 0
OTHER 2026-11-18: http 2xx 12 402 0 4xx 5 5xx 0
OTHER 2026-11-19: http 2xx 3 402 0 4xx 2 5xx 0
ABORTS 2026-11-12: 3 aborted, 0 answered after, 0.00 USD bought
ABORTS 2026-11-14: 1 aborted, 0 answered after, 0.00 USD bought
ABORTS 2026-11-16: 10 aborted, 0 answered after, 0.00 USD bought
ABORTS 2026-11-17: 9 aborted, 0 answered after, 0.00 USD bought
ABORTS 2026-11-18: 7 aborted, 0 answered after, 0.00 USD bought
ABORTS 2026-11-19: 2 aborted, 0 answered after, 0.00 USD bought
UNMATCHED: 3 inference rows without a log line within 5 s
WEEK: 4.11 USD foreign inference in the 7 days before 2026-11-19T16:01:23Z
```

## Ursache je Kunde

- Kunde 1: 1113 Anfragen seit 05.11., Saldo leer, letzte Inferenz 2026-11-13, Ursache: Fehler bei uns, weil seine beantworteten Anfragen am 11.11. von 368 auf 66 fielen, während er vom 11.11. 02:01 bis 12.11. 08:22 UTC 1393 Mal 503 auf `/v1/chat/completions` bekam (Zeilen `DAY 1 2026-11-11` und `DAY 1 2026-11-12`, 5xx 1001 und 392; das leere Guthaben beim Inferenz-Anbieter aus `goals/_vorschlaege/fehler-2026-11-11-1.md`); aufgehört hat er danach mit leerem Saldo: ab 13.11. 05:05 UTC nur noch 402, 1065 bis 1625 am Tag, eine Aufladung über `/pay/` versuchte er zuletzt am 10.11.
- Kunde 2: 1 Anfragen seit 05.11., Saldo reicht, letzte Inferenz 2026-11-10, Ursache: beim Betreiber, weil der Saldo für weitere Anfragen reicht, seine eine Anfrage 200 bekam und danach keine Anfrage mehr kam (alle `DAY 2` ohne Fehler).
- Kunde 3: 219 Anfragen seit 05.11., Saldo leer, letzte Inferenz 2026-11-12, Ursache: Saldo leer, weil er die Aufladung vom 12.11. 14:10 UTC in drei Stunden verbrauchte, danach 270 Mal 402 bekam und ab dem 13.11. nichts mehr anfragte (`DAY 3 2026-11-12`; die eine 404 fiel auf den Tag, an dem seine Anfragen stiegen).
- Kunde 4: 32 Anfragen seit 05.11., Saldo leer, letzte Inferenz 2026-11-13, Ursache: Saldo leer, weil er nie auflud, das Startguthaben am 13.11. aufgebraucht war, er 15 Mal 402 bekam und danach nichts mehr anfragte (`DAY 4 2026-11-13`).
- Kunde 5: 160 Anfragen seit 05.11., Saldo reicht, letzte Inferenz 2026-11-19, Ursache: beim Betreiber, weil sein Saldo reicht, jede seiner Anfragen 200 bekam (alle `DAY 5` ohne 4xx und 5xx) und er nur seltener fragt, 50 am 14.11., 11 am 19.11.; keiner der Abbrüche vom 16. bis 19.11. liegt in den 90 s vor einer seiner Logzeilen.

Ergebnis: Fehler bei uns, Vorschlag goals/_vorschlaege/fehler-2026-11-19-1.md

## Was sonst in der Ausgabe steht

- `OTHER`: 4613 Mal 401 von 2760 fremden Adressen ohne Sitzung (das erwartete Verhalten aus `goals/_vorschlaege/fehler-2026-11-11-2.md`),
  dazu 48 Mal 200 und 28 Mal Status 0 (Client weg) vom 16. bis 19.11. von Adressen, deren Inferenz-Zeilen nach `oursClause` als
  eigene gelten. Die 28 decken sich mit den 28 Abbrüchen vom 16. bis 19.11. Welches eigene Werkzeug von einer Adresse außerhalb von
  `ops/own-ips.txt` ruft, ist offen.
- `UNMATCHED: 3`: drei Inferenz-Zeilen ohne Logzeile mit 200 binnen 5 s, bei 1525 Zeilen im Fenster.
- Kunde 1 fragt weiter: täglich rund 3300 Mal `GET /v1/credits/balance` und 144 Mal `GET /bounties.json` (aus demselben Zugriffslog,
  nach Pfad gezählt, ohne Adresse). Er ist nicht abgeschaltet, ihm fehlt Guthaben.
