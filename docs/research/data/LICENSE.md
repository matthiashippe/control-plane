# Lizenz für diesen Datenbestand: CC0 1.0 Universal

Die Dateien in diesem Verzeichnis stehen unter
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/legalcode) und **nicht** unter
der PolyForm-Noncommercial-Lizenz des übrigen Repositorys. Diese Ausnahme ist ausdrücklich so
gewollt und geht der Repo-Lizenz für die hier liegenden Daten vor.

Der Grund ist der Zweck: Die Zahlen belegen eine Aussage über den Conway-Automaton-Markt, und ein
Beleg, den nur nichtkommerzielle Leser verwenden dürfen, ist für Journalisten und Analysten
wertlos. CC0 kommt der Rechtslage ohnehin am nächsten, denn der Bestand besteht aus Fakten aus
öffentlichen Blockchain-Logs und ist als solcher nicht schutzfähig.

## Herkunft

`2026-09-19-conway-payto-transfers.csv` enthält USDC-Transfers an die payTo-Adresse der
Conway-Automaton-Runtime auf Base, gelesen über `eth_getLogs` aus der öffentlichen Kette. Das
Erhebungsverfahren steht in `README.md` daneben, die Abfrage ist jederzeit reproduzierbar.

## Wallet-Adressen

Die Adressspalte bleibt drin, weil die Kohortenrechnung genau darauf beruht: ohne sie ist nicht
nachzuvollziehen, wie viele der Wallets aus dem Februar später noch einmal gezahlt haben. Die
Adressen stehen unverändert öffentlich in der Kette.

Angereichert wird nichts. Keine ENS-Namen, keine Wallet-Labels, keine Verknüpfung mit Profilen oder
Zuordnungen zu Börsen. Diese Linie trennt ein Pseudonym von einer Person, und sie wird hier nicht
überschritten. Kein Eintrag wird einzeln herausgegriffen; die Auswertungen sind Aggregate.

Rechtsgrundlage der Veröffentlichung ist das berechtigte Interesse nach Art. 6 Abs. 1 lit. f DSGVO:
Die Daten sind bereits öffentlich, und der Zweck ist die Nachprüfbarkeit einer Aussage, die sonst
Behauptung bliebe. Wer Einwände hat, erreicht den Betreiber über die Adresse im Impressum auf
https://cp.hippe.eu.

## Nennung

CC0 verlangt keine Nennung, und eine Klausel dafür liefe bei nicht schutzfähigen Fakten ohnehin
leer. Eine Quellenangabe ist trotzdem gern gesehen: sie macht die Zahlen für den nächsten Leser
nachprüfbar, und darum geht es hier.
