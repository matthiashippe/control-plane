# Verdient Kunde 1 Inferenz über Aufträge? (November 2026)

Ziel: Wir wissen gemessen, an welchem Schritt Kunde 1 scheitert, wenn er sich Inferenz über Aufträge verdienen will (einreichen,
Auftrag finden, Preis als Guthaben nutzen), damit das nächste Glied genau diesen Schritt baut. Goal:
`goals/kunden/08-verdient-kunde-1-inferenz-ueber-auftraege.md`. Kunde 1 ist derselbe wie in `docs/kunden/rueckgang-2026-11.md` und
`docs/kunden/aufladung-2026-11.md` (erste Inferenz-Zeile im Fenster ab 05.11., eine Adresse im Zugriffslog).

Gemessen: 2026-11-21T06:34:43Z

## Messung

Vom code-host, nur lesend: das Zugriffslog über `ops/access-log.sh`, die Datenbank über `ops/db-report.cjs` mit
`CP_REPORT=customer-work` (`readonly: true`) im Container `deploy-cp-1`. Die Wallet von Kunde 1 verlässt den Container nicht.

```
$ bash ops/customer-work.sh --since 2026-11-13T00:00:00Z
WORK since 2026-11-13T00:00:00Z until 2026-11-21T06:34:43Z: customer 1
MATCH: ips 1, 3 of 1113 inference rows without a log line within 5 s
DAY 2026-11-13: 144 board reads, 0 submit calls, 0 submissions stored, 0 open bounties (0 ours)
DAY 2026-11-14: 144 board reads, 0 submit calls, 0 submissions stored, 0 open bounties (0 ours)
DAY 2026-11-15: 144 board reads, 0 submit calls, 0 submissions stored, 0 open bounties (0 ours)
DAY 2026-11-16: 144 board reads, 0 submit calls, 0 submissions stored, 0 open bounties (0 ours)
DAY 2026-11-17: 144 board reads, 0 submit calls, 0 submissions stored, 0 open bounties (0 ours)
DAY 2026-11-18: 144 board reads, 0 submit calls, 0 submissions stored, 0 open bounties (0 ours)
DAY 2026-11-19: 144 board reads, 0 submit calls, 0 submissions stored, 0 open bounties (0 ours)
DAY 2026-11-20: 144 board reads, 0 submit calls, 0 submissions stored, 0 open bounties (0 ours)
DAY 2026-11-21: 40 board reads, 0 submit calls, 0 submissions stored, 0 open bounties (0 ours)
AWARD CALLS: 0 calls to POST /v1/bounties/award
AWARDS: 0 awarded to the customer, 0 inference rows after the first award
```

Gegenprobe ohne das Werkzeug, eine eigene Leseabfrage auf derselben Datenbank (`better-sqlite3` mit `readonly: true` über
`docker exec -i deploy-cp-1 node -`, nur Zählungen und Zeiten): Die Tabelle `bounties` hat 47 Aufträge, 1 `awarded`, 38 `cancelled`,
8 `expired`; der jüngste wurde am 2026-09-29T09:34:09Z angelegt, die letzte Frist lief am 2026-10-06T09:31:32Z ab. Aufträge mit Frist
oder Ende nach dem 13.11.: 0, heute offen: 0, Einreichungen seit 13.11.: 0, Zeilen `bounty_award` seit 13.11.: 0. Das Werkzeug selbst
ist in beide Richtungen bewiesen (`bash ops/customer-work.sh --selftest`, gepflanzte Datenbank mit dem Schema aus `src/db.ts`).

## Wege im Code

- Weg: src/app.ts:2138, `GET /bounties.json` gibt die offenen Aufträge ohne Schlüssel aus; Kunde 1 las das Brett seit 13.11. 1192 Mal (mit `GET /v1/bounties`), also alle zehn Minuten, und bekam jedes Mal eine leere Liste.
- Weg: src/app.ts:3385, `GET /v1/bounties` listet dieselben offenen Aufträge mit Schlüssel.
- Weg: src/app.ts:3424, `POST /v1/submissions` nimmt eine Einreichung an und ruft `submitWork`; Kunde 1 rief es nie auf.
- Weg: src/bounties/store.ts:413, `submitWork` nimmt nur einen offenen Auftrag vor seiner Frist an, sonst 404 oder 409; ohne offenen Auftrag gibt es nichts, wohin er einreichen könnte.
- Weg: src/app.ts:3575, `POST /v1/bounties/award` spricht eine Einreichung zu, nur durch den, der den Auftrag gestellt hat.
- Weg: src/bounties/store.ts:658, `awardBounty` bucht die Zeile `bounty_award` an `submission.agent`, in derselben Transaktion wie den Zuspruch.
- Weg: src/inference/proxy.ts:197, `handleChat` reserviert vor der Anfrage beim Anbieter aus dem Saldo und antwortet ohne Deckung mit 402.
- Weg: src/inference/proxy.ts:384, die 402 nennt `open_bounties` und `bounties_url` nur, wenn `openBountyCount` größer als 0 ist; seit dem 06.10. ist er 0, also verweist unsere 402 Kunde 1 gar nicht auf das Brett. Er liest es von sich aus.

## Die drei Schritte

Schritt Einreichen: 0 Einreichungen seit 13.11., 0 Aufrufe zum Einreichen
Schritt Aufträge: 0 Tage mit offenem fremdem Auftrag von 9 Tagen
Schritt Guthaben: bucht, weil test/award-inference.test.ts heute festhält, dass eine fremde Wallet mit leerem Saldo auf `/v1/chat/completions` 402 bekommt, nach dem Zuspruch die Zeile `bounty_award` (src/bounties/store.ts:658) ihren Saldo hebt und die nächste Anfrage mit 200 beantwortet und als `inference` aus diesem Guthaben gebucht wird.

Ergebnis: leerer Schritt Einreichen, weil Kunde 1 seit 13.11. keinen einzigen Aufruf zum Einreichen machte und das Brett nur las, und weil es an keinem der 9 Tage einen offenen Auftrag gab, in den er hätte einreichen können (seit 06.10. ist das Brett leer); der Schritt danach würde buchen, also scheitert der Weg vorn, am fehlenden Auftrag.
Vorschlag: goals/_vorschlaege/kunden-kritik-2026-11-21-3.md

Damit greift der Widerlegungssatz der Goal-Datei: Kunde 1 las `/bounties.json` nur und rief keinen Weg zum Einreichen auf. Die
Annahme des Goals, unsere 402 schicke ihn mit `details.open_bounties` dorthin, stimmt seit dem 06.10. nicht mehr, weil das Feld nur bei
offenen Aufträgen in der Antwort steht.
