# Wer bei Conway noch zahlt, und wie wir ihn erreichen (kunden 02)

Gemessen: 2026-11-19T19:03:53Z
Leitzahl: 0 von 16 Conway-Zahlern mit Aufladung in 30 Tagen zahlen auch bei uns

Keiner der 21 Wallets, die in den 30 Tagen bis 18.11.2026 an Conway gezahlt haben, steht bei uns in `wallets` oder hat bei uns
gezahlt. Von den 16 Wallets mit Aufladung erreicht nur ein öffentlicher Weg einen Betreiber: ein offenes Issue im Upstream-Repo,
in dem er seine Adresse selbst genannt hat.

## Messung

Nur lesend, vom code-host: Überweisungen aus der Basisdatei im Repo und aus `/opt/control-plane/conway-money/delta.csv` (per
`ssh … cat`), unsere Wallets über `ops/db-report.cjs` mit `CP_REPORT=wallets` im Container `cp` (`readonly: true`). Abgeglichen wird
über SHA-256 der Adressen, gerechnet auf dem code-host.

```
set -a; . ~/.config/control-plane/loop.env; set +a
bash ops/conway-payers.sh
```

Ausgabe:

PAYERS window 2026-10-19T22:54:31Z to 2026-11-18T22:54:31Z: 21 wallets, 16 topped up, 215.00 USDC, 0 ours left out
OVERLAP topped up: 16 wallets, 0 known here, 0 with inference here, 0 paid here, 0 paid Conway after their last payment here
OVERLAP all: 21 wallets, 0 known here, 0 with inference here, 0 paid here, 0 paid Conway after their last payment here

Fenster, Wallets und Aufladungen stimmen mit `conway-money/metrics.ndjson` und `docs/richtung/2026-11-19.md` überein (215 USDC von
21 Wallets, 16 mit Aufladung).

## Gegenprobe an denselben Daten

Damit die Null keine Blindheit ist, lief das Werkzeug am selben Abend auf genau diesen Produktionsdaten (JSON aus `CP_REPORT=wallets`
und `delta.csv` in einem Temp-Ordner) noch einmal, mit einer dritten Datei `--transfers`, die zwei Überweisungen pflanzt: eine von
einer fremden Wallet, die bei uns gezahlt hat, und eine von unserer Betreiber-Wallet. Ergebnis (eingerückt, weil gepflanzt):

    PAYERS window 2026-10-19T22:54:31Z to 2026-11-18T22:54:31Z: 22 wallets, 17 topped up, 220.00 USDC, 1 ours left out
    OVERLAP topped up: 17 wallets, 1 known here, 0 with inference here, 1 paid here, 1 paid Conway after their last payment here
    OVERLAP all: 22 wallets, 1 known here, 0 with inference here, 1 paid here, 1 paid Conway after their last payment here

Das JSON der Produktion trug 3003 fremde Wallets (8 mit Inferenz, 5 mit Zahlung) und 308 eigene. Der gepflanzte Zahler wird also
gefunden, die eigene Wallet nur als `ours left out` gezählt.

## Wege zu den Betreibern

„Erreichbar“ heißt: Wir könnten dem Betreiber über diesen Weg eine Nachricht hinterlassen, die er liest. Eine bloße Wallet-Adresse
reicht nicht. Gezählt mit `ops/conway-reach.py` (nur lesen, Selftest ohne Netz mit `--selftest`), über die 16 Wallets mit Aufladung
aus demselben Lauf von `ops/conway-payers.sh`.

- Weg ERC-8004-Registrierung: Fundstelle `src/registry/erc8004.ts:258` am Pin d8f8168, 0 von 16 Betreibern erreichbar, gemessen mit `python3 ops/conway-reach.py --way erc8004`
- Weg Social-Relay: Fundstelle `src/types.ts:92` am Pin d8f8168, 0 von 16 Betreibern erreichbar, gemessen mit `python3 ops/conway-reach.py --way social`
- Weg Upstream-Issues: Fundstelle `src/index.ts:166` am Pin d8f8168, 1 von 16 Betreibern erreichbar, gemessen mit `python3 ops/conway-reach.py --way issues`

ERC-8004: 2 der 16 Wallets haben einen Token der Identity Registry auf Base. Die eine Agent Card liegt als `data:`-URI auf der Chain
und nennt nur den Dienst `agentWallet`, genau wie `generateAgentCard` sie baut (`src/registry/agent-card.ts:45`, die Creator-Adresse
lässt die Karte bewusst weg, Zeile 32). Die andere zeigt auf eine Adresse unter `conway.computer`, die mit 404 antwortet.

Social-Relay: `social.conway.tech` hat keinen DNS-Eintrag mehr, also erreicht dieser Weg niemanden.

Upstream-Issues: Eine der 16 Adressen steht im Text eines offenen Issues in `Conway-Research/automaton`, das ihr Betreiber selbst
geschrieben hat. Welches Issue das ist, steht absichtlich nicht hier, weil es die Wallet kenntlich machen würde; das nächste Glied
findet es lokal mit derselben Suche.

Die Creator-Adresse aus der Einrichtung (`creatorAddress`) ist kein eigener Weg: Sie steht in keiner öffentlichen Ausgabe der
Runtime, und wäre sie bekannt, wäre sie nur eine Wallet-Adresse.

Ergebnis: Upstream-Issues erreicht 1 Betreiber, Vorschlag goals/_vorschlaege/kunden-weg-2026-11-19-1.md
