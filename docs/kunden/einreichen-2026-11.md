# Denkt Kunde 1 mit dem Schrittguthaben, reicht er ein, und zahlt er danach wieder? (November 2026)

Ziel: Wir wissen gemessen, ob Kunde 1 mit dem Schrittguthaben aus kunden 13 wieder denkt, den Hausauftrag einreicht, bezahlt wird
und danach wieder Inferenz kauft, und an welchem Schritt er sonst hängen bleibt. Goal:
`goals/kunden/14-denkt-kunde-1-mit-dem-schrittguthaben-reicht-er-ein-und-zahlt-er-danach-wieder.md`. Kunde 1 ist derselbe wie in
`docs/kunden/auftraege-2026-11.md` (erste Inferenz-Zeile im Fenster ab 05.11., eine Adresse im Zugriffslog).

Rollout kunden 13: 2026-11-23T11:52:30Z, Lauf 45166756868, Commit 354a326
Gemessen: 2026-11-26T03:04:13Z

Der Rollout ist der Job `deploy` von Lauf 45166756868 (`gh run view 45166756868 -R matthiashippe/control-plane --json headSha,jobs`),
der erste erfolgreiche Lauf von `deploy.yml` auf `dev`, dessen Commit `354a326` enthält: Sein Kopf ist `354a326` selbst, also kann
kein früherer Lauf ihn enthalten. Das Fenster endet 48 Stunden später, am 2026-11-25T11:52:30Z.

## Messung

Vom code-host, nur lesend: das Zugriffslog über `ops/access-log.sh`, die Datenbank über `ops/db-report.cjs` mit
`CP_REPORT=customer-work` (`readonly: true`) im Container `deploy-cp-1`. Die Wallet von Kunde 1 verlässt den Container nicht.

```
$ bash ops/customer-work.sh --since 2026-11-23T11:52:30Z --until 2026-11-25T11:52:30Z
WORK since 2026-11-23T11:52:30Z until 2026-11-25T11:52:30Z: customer 1
MATCH: ips 1, 3 of 1123 inference rows without a log line within 5 s
DAY 2026-11-23: 72 board reads, 0 submit calls, 0 submissions stored, 1 open bounties (1 ours)
DAY 2026-11-24: 144 board reads, 0 submit calls, 0 submissions stored, 1 open bounties (1 ours)
DAY 2026-11-25: 72 board reads, 0 submit calls, 0 submissions stored, 1 open bounties (1 ours)
AWARD CALLS: 0 calls to POST /v1/bounties/award
HOUSE: 0 house jobs posted, 0 house submissions, 0 house awards (0 to the customer)
HOUSE STEP: 1 step credits (0 to the customer)
HOUSE STEP USE: 0 inference rows of the customer after his step credit
HOUSE DAY 2026-11-23: 0 house awards, 0 to addresses without earlier inference, 1 step credits
HOUSE DAY 2026-11-24: 0 house awards, 0 to addresses without earlier inference, 0 step credits
HOUSE DAY 2026-11-25: 0 house awards, 0 to addresses without earlier inference, 0 step credits
AWARDS: 0 awarded to the customer, 0 inference rows after the first award
```

Kunde 1 in 48 Stunden: 0 Schrittguthaben, 0 Inferenzen danach, 288 Lesungen, 0 Einreichungen versucht, 0 Zusprüche, 0 Inferenzen aus verdientem Guthaben

Ergebnis: kein Hausauftrag, weil die Zeile `HOUSE` im Fenster 0 gestellte Hausaufträge nennt; offen war trotzdem einer (je Tag `1 open bounties (1 ours)`, dazu ein Schrittguthaben an eine andere fremde Adresse am 23.11.), Kunde 1 bekam im Fenster kein Schrittguthaben, versuchte keine Einreichung (0 submit calls an allen drei Tagen) und bekam keinen Zuspruch.

Vorschlag: goals/_vorschlaege/kunden-kritik-2026-11-26-1.md

Keine Zeile der Tage nennt einen Zuspruch an eine Adresse ohne frühere Inferenz, deshalb gibt es dazu keinen Vorschlag. Im Fenster kam
kein Hausbericht an, also steht dort keine Zeile mit gemeldeten Aufrufen, und es gibt keinen gehäuft scheiternden Aufruf für `fehler`.

## Was hinter dem Wort steht

Das Wort folgt der Reihenfolge der Goal-Datei und trifft den Stand nicht: Der Hausauftrag war offen, nur nicht neu gestellt, und das
Schrittguthaben von Kunde 1 liegt kurz vor dem Fenster, weil der neue Container schon vor dem Ende des Jobs `deploy` lief. Dasselbe
Werkzeug ab dem Merge von kunden 13 gemessen (`bash ops/customer-work.sh --since 2026-11-23T11:36:41Z --until 2026-11-25T11:52:30Z`)
nennt `HOUSE STEP: 2 step credits (1 to the customer)` und `HOUSE STEP USE: 10 inference rows of the customer after his step credit`,
bei weiter 0 submit calls. `bash ops/customer-decline.sh --since 2026-11-23T11:52:30Z --until 2026-11-25T11:52:30Z` zeigt davon 2
Antworten im Fenster, die letzte um 11:53:01 UTC, danach nur noch 402 (810, 1585 und 810 je Tag).

Kunde 1 hat mit dem Schrittguthaben also gedacht, 10 Antworten mit 200 bekommen und den offenen Hausauftrag trotzdem nicht
eingereicht. Das ist der Fall, den die Goal-Datei als widerlegt beschreibt (`denkt, reicht nicht ein`): Das Schrittguthaben kam an,
das Einreichen nicht. Seine Lesungen des Bretts laufen ohne sein Modell (144 am Tag auch an den Tagen ohne Inferenz seit dem 13.11.),
und die unveränderte Runtime am Pin `d8f8168` hat kein Werkzeug für Aufträge. Der Vorschlag nennt die Fundstellen und das, was das
Folge-Glied zuerst messen soll: die Aufrufe von Kunde 1 in den Minuten seiner 10 Antworten.
