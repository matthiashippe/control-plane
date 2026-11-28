# Bringen der Befehl zum Update und die Stufe 1 USD eine Zahlung? (November 2026)

Ziel: Wer die Kette steuert, sieht mit einem Befehl, ob gepflegte Runtimes das Update einspielen und ob eine davon ab 1 USD bei uns
zahlt. Goal: `goals/kunden/19-bringen-der-befehl-zum-update-und-die-stufe-1-usd-eine-zahlung.md`.

Das Fenster beginnt am Rollout von kunden 17 (Lauf von `deploy.yml` an `7173b70`, Job `deploy` fertig 2026-11-27T22:09:54Z), seit
dem die 402 an ältere gepflegte Runtimes den Befehl zum Update trägt. Seit 2026-11-28T03:11:38Z (Lauf an `7e3e821`, kunden 18) ist
`v0.2.2-maintained.5` mit der Aufladung ab 1 USD im Dienst. Das Fenster endet am Zeitpunkt der Messung; der Richtungs-Check misst
mit denselben Befehlen weiter.

Gemessen: 2026-11-28T13:05:16Z

## Antworten 402 je Kennung und Kartenbesuche seit dem Rollout

$ bash ops/card-visits.sh --since 2026-11-27T22:09:54Z --until 2026-11-28T13:05:16Z

```
CARD VISITS since 2026-11-27T22:09:54Z until 2026-11-28T13:05:16Z: 0 by people, 0 by bots, 0 from own addresses
MAINTAINED 402 since 2026-11-27T22:09:54Z until 2026-11-28T13:05:16Z: 1000 answers 402 on /v1/chat/completions to automaton-maintained runtimes
MAINTAINED 402 VERSION automaton-maintained/0.2.2-maintained.1: 1000
```

Vollständige Ausgabe auf stdout, Exit 0, mit den Variablen aus `~/.config/control-plane/loop.env` vom code-host. Auf stderr stand nur,
wie viele Zeilen des Zugriffslogs im Fenster lagen (7802 von 344268 gelesenen, keine unlesbar).

Die runde Zahl 1000 ist nachgezählt: Dasselbe Zugriffslog aus `ops/access-log.sh`, je Stunde nach POST auf `/v1/chat/completions`
mit Status 402 und User-Agent `automaton-maintained/` gezählt, gibt ebenfalls 1000, gleichmäßig 65 bis 70 je voller Stunde von 22
bis 12 Uhr UTC, alle mit der Kennung `0.2.2-maintained.1`.

## Aufladungen der Stufe 1 seit dem Rollout

$ bash ops/usdc-bands.sh --since 2026-11-27T22:09:54Z --until 2026-11-28T13:05:16Z

```
USDC BANDS since 2026-11-27T22:09:54Z until 2026-11-28T13:05:16Z: 0 foreign addresses with grant or topup, 0 under 1 USDC, 0 from 1 to under 5 USDC, 0 5 USDC or more, 0 unreadable
TOPUPS 1 USD since 2026-11-27T22:09:54Z until 2026-11-28T13:05:16Z: 0 by foreign addresses
PAY 1 since 2026-11-27T22:09:54Z until 2026-11-28T13:05:16Z: 0 answers 402, 0 answers 200, 0 other
TIER 1 SOLD: yes
```

Vollständige Ausgabe auf stdout, Exit 0. Auf stderr stand nur die Zahl der gelesenen Zeilen des Zugriffslogs (344275, keine
unlesbar).

## Korrektur seit dem 06.11.

Bis kunden 19 zählte `TOPUPS 1 USD` nur Zeilen `topup` mit genau 100000 mc. Ein Kauf über `/pay/1/` bucht aber 1 USD plus den
Bonus von einem Cent, also 101000 mc mit `meta.usd` 1, und wäre nie gezählt worden. Die Null in `docs/kunden/stufe-1-2026-11.md` ist
deshalb mit der reparierten Zählung (Stufe 1 heißt `meta.usd` 1, ohne `meta.usd` genau 100000 mc) nachgemessen:

$ bash ops/usdc-bands.sh --since 2026-11-06T00:00:00Z --until 2026-11-28T13:05:16Z

```
USDC BANDS since 2026-11-06T00:00:00Z until 2026-11-28T13:05:16Z: 9 foreign addresses with grant or topup, 8 under 1 USDC, 1 from 1 to under 5 USDC, 0 5 USDC or more, 0 unreadable
TOPUPS 1 USD since 2026-11-06T00:00:00Z until 2026-11-28T13:05:16Z: 0 by foreign addresses
PAY 1 since 2026-11-06T00:00:00Z until 2026-11-28T13:05:16Z: 4 answers 402, 0 answers 200, 6 other
TIER 1 SOLD: yes
```

Vollständige Ausgabe auf stdout, Exit 0. Auf stderr stand nur die Zahl der gelesenen Zeilen des Zugriffslogs (344298, keine
unlesbar).

Die Null bleibt: Auch mit der reparierten Zählung hat seit dem 06.11. keine fremde Adresse die Stufe 1 gekauft. Sie ist jetzt keine
blinde Null mehr, weil Test und Selbsttest von `ops/usdc-bands.sh` einen Kauf über `/pay/1/` mit 101000 mc pflanzen und gezählt
sehen. Die 402 auf `/pay/1/` in diesem Fenster sind dieselben vier wie am 28.11. um 00:24 Uhr, alle vor dem Rollout.

## Was die Zahlen sagen

- Seit dem Rollout von kunden 17 bekamen gepflegte Runtimes 1000 Antworten 402 auf `/v1/chat/completions`, alle an die Kennung
  `0.2.2-maintained.1`. Keine Runtime kam mit einer Kennung ab `0.2.2-maintained.2`, also hat in rund 15 Stunden keine das Update
  eingespielt, obwohl jede 402 den Befehl dazu trägt.
- Niemand hat eine Kartenseite geöffnet, und keine Anfrage ging auf `/pay/1/`. Die Runtime, die an der 402 steht, versucht also
  weder den Weg per Karte noch die Stufe 1.
- Keine fremde Adresse hat seit dem Rollout Startgutschrift oder Aufladung bekommen.

Neue Kennung: nein, weil `ops/card-visits.sh` seit dem Rollout nur die Kennung `automaton-maintained/0.2.2-maintained.1` mit 402 zählt und keine ab `0.2.2-maintained.2`.

Stufe 1 gekauft: nein, weil `TOPUPS 1 USD` seit dem Rollout 0 fremde Aufladungen der Stufe 1 zählt, mit der Zählung, die einen Kauf über `/pay/1/` sieht.

Nächster Schritt: im Harness am Pin zeigen, was der Agent mit dem Befehl zum Update in der 402 tut, weil keine neue Kennung kam (Entscheidung 4 des Tech Lead); das Glied dazu schreibt der Tech Lead.
