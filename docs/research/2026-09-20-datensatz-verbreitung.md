# Wo der Conway-Datensatz hingehört

Stand 20.09.2026. Frage: Der Datensatz `docs/research/data/2026-09-19-conway-payto-transfers.csv`
belegt eine Aussage, die außerhalb dieses Repos niemand kennt. Welcher Verbreitungsweg bringt ihn
zu den Leuten, die ihn brauchen, und was kostet das an Zeit und Geld.

## 1. Was tatsächlich drinsteht, selbst nachgerechnet

Gelesen: `docs/research/data/README.md`, `artikel-zahlen.py`, `f2-betroffene.sh`,
`x402-sellers-scan.py`. Nachgerechnet mit einem eigenen Skript gegen die CSV, nicht mit dem
mitgelieferten:

| Monat 2026 | USDC | zahlende Wallets | Transfers | davon Februar-Kohorte |
|---|---:|---:|---:|---:|
| Februar | 37.958,65 | 1.582 | 6.119 | 1.582 |
| März | 19.112,44 | 581 | 1.961 | 42 |
| April | 2.845,00 | 198 | 461 | 5 |
| Mai | 1.215,00 | 90 | 198 | 5 |
| Juni | 420,00 | 34 | 68 | 1 |
| Juli | 360,00 | 24 | 60 | 0 |
| August | 415,00 | 40 | 83 | 2 |
| September (bis 20.) | 295,05 | 31 | 77 | 1 |

9.027 Zeilen, keine doppelten `tx_hash`, Zeitraum 01.02.2026 13:33:45 UTC bis 20.09.2026 03:55:15
UTC, 2.492 verschiedene Wallets, 62.621,14 USDC gesamt. Das deckt sich mit dem README und mit
`artikel-zahlen.py`.

**Die Kernaussage hält, aber sie meint etwas anderes, als der Satz nahelegt.** "Im Juni waren noch
drei übrig" ist die Kohortenzahl: Von den 1.582 Wallets, die im Februar gezahlt haben, haben genau
drei im Juni oder später noch einmal gezahlt. Im Juni selbst waren 34 Wallets aktiv, davon genau
eine aus der Februar-Kohorte, die anderen 33 waren neu. Der Artikeltext formuliert das bereits
korrekt ("three were still paying in June or later"), die Tabelle daneben nennt für Juni 34.
Wer nur die Überschrift liest und dann die Tabelle sieht, hält das für einen Widerspruch. Das ist
der erste Angriffspunkt, den ein Kommentar auf Hacker News suchen wird, und er ist mit einem
Nebensatz zu entschärfen. Bei jeder Veröffentlichung des Datensatzes muss die Beschreibung die
Kohortendefinition mitliefern, sonst wandert die Zahl falsch weiter.

Zwei weitere Grenzen, die in eine Datensatzbeschreibung gehören: Die Datei zeigt Zuflüsse an eine
einzige Adresse, nicht die Nutzung des Produkts. Und die hohe Transferzahl je Wallet in den späten
Monaten passt zum Retry-Verhalten aus Issue #393, ist also kein Beleg für wiederholte
Kaufentscheidungen.

## 2. Wer die Zielgruppe ist, in Zahlen

Alles darunter gemessen, nicht geschätzt.

**Leute, die einen Automaton betreiben.** Das Repo `Conway-Research/automaton` hat 6.479 Stars,
1.442 Forks, 108 Watcher und 233 offene Issues, letzter Push am 26.08.2026. Die Zahl der Personen,
die sich mit dem Provisionierungsproblem tatsächlich gemeldet haben, liegt bei 20 über die zwölf
Kern-Issues, 26 mit den drei Grenzfällen (`f2-betroffene.sh`, Lauf vom 20.09.2026). In den letzten
30 Tagen waren davon 11 aktiv, in den letzten 14 Tagen 3. Wer heute noch zahlt, sind 45 Wallets in
30 Tagen. Die aktive Zielgruppe hat also die Größenordnung von zwei bis drei Dutzend Personen, und
sie sind namentlich und an einem einzigen Ort auffindbar.

**Leute, die über Agenten-Ökonomie schreiben.** Diese Gruppe ist deutlich größer und sitzt
nachweislich auf Dune: Die kuratierte Tabelle `payments.agentic_payments` deckt x402 auf Base,
Polygon und Solana ab, und es laufen mehrere öffentliche x402-Dashboards, eines davon mit 164,5 Mio.
Transaktionen und 41,4 Mio. USD kumuliertem Volumen als Kennzahlen. Wer über den Markt schreibt,
sucht dort nach Zahlen.

**Was dieses Repo heute erreicht: nichts.** GitHub-Traffic der letzten 14 Tage für
`matthiashippe/control-plane`: 1 Seitenaufruf von 1 eindeutigen Besucher, dazu 356 Clones von 143
Quellen, was CI und eigene Worktrees sind. Der Datensatz liegt an einer Stelle, an die niemand
kommt. Das ist der eigentliche Befund dieser Recherche, und er entscheidet die Bewertung jeder
Option unten: Der Engpass ist nicht das Hosting, sondern der eingehende Verweis.

## 3. Dune Analytics

**Kosten.** Ein öffentliches Dashboard kostet nichts. Der Free-Tarif enthält 2.500 Query-Credits
pro Monat, unbegrenzt viele Queries und Dashboards, einen Platz und API-Zugang. Preise der
bezahlten Stufen konnte ich nicht primär belegen, weil dune.com/pricing die Tarife per JavaScript
nachlädt; Drittquellen nennen für September 2026 Analyst bei 65 bis 75 USD und Plus bei 349 bis 399
USD pro Monat. Für diesen Fall ist das ohne Belang, weil nichts davon gebraucht wird.

**CSV hochladen geht, hilft hier aber nicht.** Dune erlaubt CSV-Upload über UI und API, maximal
200 MB pro Datei. Der Speicherplatz ist nach Tarif begrenzt: 1 MB auf Free, 15 GB auf Plus, 50 GB
auf Premium. Unsere Datei hat 1,29 MB und liegt damit knapp über dem Free-Limit. Alles Hochgeladene
ist öffentlich ("All data uploaded is public and can be accessed by anyone"), private Uploads
verlangen Enterprise.

**Die Abfrage muss aber gar nicht hochgeladen werden, sie läuft on-chain.** Dune indiziert Base
vollständig, inklusive Blocks, Transactions, Logs und dekodierter Daten. Die komplette
Conway-Messung ist damit als SQL reproduzierbar, etwa über `erc20_base.evt_Transfer` oder die
chainübergreifende `tokens.transfers`, gefiltert auf den USDC-Contract
`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` und `to = 0x21DD37E3E4eA6CCC0a5C98A4944702eDE6E7Be10`.
Die exakte Tabellenbenennung habe ich nicht gegen eine laufende Dune-Instanz verifiziert, das ist
beim Bauen in zehn Minuten geklärt. Der Vorteil gegenüber dem Upload ist erheblich: Das Dashboard
bleibt aktuell, ohne dass jemand den 30-Minuten-Scan wiederholt, und der Leser kann die Query
öffnen und nachvollziehen, statt einer fremden CSV zu glauben.

**Wie Dashboards gefunden werden.** Über die Discover-Seite mit den Sortierungen Trending,
Favorites und New, dazu die Suche. Trending betrachtet standardmäßig die letzten vier Stunden, was
für ein Nischendashboard ohne Anfangsschub praktisch unerreichbar ist. Die reale Auffindbarkeit
entsteht über externe Verweise: Dune hat laut SEMrush rund 3,5 Mio. Backlinks von über 14.000
Domains, und einzelne Dashboards werden gefunden, weil jemand sie verlinkt, nicht weil die
Plattform sie hervorhebt.

**Aufwand.** Query schreiben, Zahlen gegen die CSV abgleichen, vier bis fünf Panels und
Erläuterungstexte: drei bis fünf Stunden, davon der größere Teil im Abgleich. Laufende Kosten null.

**Realistische Sichtbarkeit.** Ohne Promotion zweistellige Aufrufzahlen. Mit einem Verweis aus dem
Artikel und aus x402-Kanälen einige hundert bis wenige tausend, und zwar von genau den Leuten, die
über den Markt schreiben. Das ist die einzige der vier Plattformen, bei der die Zielgruppe
nachweislich anwesend ist.

## 4. Kaggle Datasets

**Bedingungen.** Upload ist kostenlos, die Größenordnung dieser Datei ist irrelevant (Kaggle nimmt
Datensätze im zweistelligen Gigabyte-Bereich). Bei der Veröffentlichung wird eine Lizenz aus einer
festen Liste verlangt: CC0-1.0, CC-BY-SA-3.0, CC-BY-SA-4.0, CC-BY-NC-SA-4.0, GPL-2.0, ODbL-1.0,
DbCL-1.0, "copyright-authors", "other", "unknown". Für Fakten aus einer öffentlichen Kette ist
CC0-1.0 die einzige Option, die keine Fragen aufwirft, siehe Abschnitt 9.

**Lizenzfrage.** Kaggle verlangt, dass der Hochladende die Rechte an den Daten hat und keine Rechte
Dritter verletzt. Bei Wallet-Adressen ist das keine Urheberrechts-, sondern eine
Datenschutzfrage, und die bleibt bei uns, nicht bei Kaggle.

**Wer dort sucht.** Die Krypto-Ecke auf Kaggle besteht fast vollständig aus Preiszeitreihen für
Machine-Learning-Übungen: "Bitcoin Historical Data" in einem halben Dutzend Varianten, Minuten- und
Sekundenkerzen, Binance-Exporte. Das Publikum sind Leute, die ein Notebook für eine
Preisvorhersage bauen. Ein On-Chain-Auszug zu einem eingeschlafenen Agenten-Projekt bedient dieses
Interesse nicht. Niemand, der einen Conway-Automaton betreibt, sucht auf Kaggle nach seiner
Laufzeitumgebung, und niemand, der über Agenten-Ökonomie schreibt, recherchiert dort.

**Aufwand.** Eine Stunde Upload, ein bis zwei Stunden für eine Beschreibung, die den Datensatz ohne
den Artikel verständlich macht. Laufende Kosten null.

**Realistische Sichtbarkeit.** Ein bis zwei Dutzend echte Menschen im ersten Jahr, plus
Crawler-Downloads. Keiner davon aus der Zielgruppe.

## 5. Hugging Face Datasets

**Bedingungen.** Öffentliche Repos sind kostenlos, Speicher für öffentliche Daten ist
"best-effort" auf dem Free-Tarif. Die Grenzen (unter 100.000 Dateien pro Repo, unter 200 GB pro
Datei) sind hier bedeutungslos. Hugging Face formuliert für Datensätze eine klare Erwartung: eine
Dataset-Card, Parquet oder WebDataset als Format für den Viewer, keine Ladeskripte, und
ausdrücklich "You are sharing the dataset to enable community reuse. If you plan to upload a
dataset you anticipate won't have any further reuse, other platforms are likely more suitable."
Genau dieser Satz beschreibt unseren Fall: Der Datensatz belegt eine Aussage, er ist kein
Trainingsmaterial.

**Lizenzfrage.** Lizenz wird als Tag in der Dataset-Card gesetzt, CC0-1.0 ist verfügbar. Keine
Hürde.

**Wer dort sucht.** Ich habe die öffentliche Hub-API abgefragt. Zu "x402" gibt es 13 Datensätze
mit 3 bis 1.454 Downloads; der höchste Like-Stand ist eins, und nur drei der 13 haben überhaupt
einen Like. Zu "ethereum transfers" vier Datensätze mit 4 bis 310 Downloads und ebenfalls maximal
einem Like. Suchen nach "onchain payments", "agent payments" und
"wallet transactions" liefern null Treffer. Übersetzt: Das Thema existiert dort, aber ohne
Publikum, und die Downloadzahlen sind zum großen Teil automatisierte Zugriffe. Ein Like ist auf HF
der einzige Indikator für einen echten Menschen, und der Spitzenwert in dieser Nische ist eins.

**Aufwand.** Eine Stunde für CSV plus Dataset-Card, zwei bis drei Stunden, wenn man es richtig
macht und nach Parquet konvertiert, damit der Viewer funktioniert. Laufende Kosten null.

**Realistische Sichtbarkeit.** Ein bis zwei interessierte Menschen. Die Plattform ist für
ML-Trainingsdaten gebaut und belohnt genau das.

## 6. Eigener Beitrag im Repo oder auf GitHub Pages

**Bedingungen.** Kostenlos für öffentliche Repos. Grenzen: Quell-Repo empfohlen unter 1 GB,
veröffentlichte Seite maximal 1 GB, weiche Bandbreitengrenze 100 GB pro Monat, weiche Grenze von 10
Builds pro Stunde, Deploy-Timeout 10 Minuten. Ein Vorbehalt steht in denselben Regeln: GitHub Pages
ist nicht für kommerzielle Zwecke gedacht, ausdrücklich nicht für den Betrieb eines
Online-Geschäfts. Eine Datenseite ist davon nicht betroffen, eine Seite, die den bezahlten Dienst
bewirbt, wäre es. Da cp.hippe.eu ohnehin separat läuft, ist das sauber trennbar.

**Was dafür spricht.** Die Datei liegt bereits hier, versioniert, mit Skripten und einem README,
das die Erhebung beschreibt. Ein Permalink auf einen Commit ist das einzige Artefakt, das in fünf
Jahren noch genau dasselbe liefert. Alle anderen Optionen sind Kopien, die veralten. Der Artikel
verweist bereits auf das Repo.

**Was dagegen spricht.** Es gibt keinen Verbreitungsmechanismus. Die Traffic-Zahlen oben (1
Besucher in 14 Tagen) sind der Beweis. Eine GitHub-Pages-Seite ändert daran genau nichts, sie macht
den vorhandenen Inhalt nur hübscher. Der Mehrwert gegenüber der bestehenden Markdown-Datei liegt in
zwei Punkten: eine zitierfähige URL, die nicht wie ein Quellcode-Verzeichnis aussieht, und
schema.org-Dataset-Markup, mit dem Google Dataset Search die Datei überhaupt erfassen kann. Beides
ist echt, beides ist klein.

**Aufwand.** Zwei bis vier Stunden für eine Seite mit den Diagrammen aus der Tabelle, dem
Methodenteil und dem JSON-LD-Markup. Laufende Kosten null.

**Realistische Sichtbarkeit.** Vollständig abhängig vom eingehenden Verweis. Mit HN-Post auf der
Frontpage sind das 10.000 bis 30.000 Besucher an einem Tag, ohne ihn bleibt es bei der
gegenwärtigen Größenordnung von einem Besucher pro Woche.

## 7. Was es sonst gibt

**Ein Kommentar in den zwölf Provisionierungs-Issues.** Dort stehen die 20 bis 26 Personen, die das
Problem gemeldet haben, 11 davon in den letzten 30 Tagen aktiv. Das ist der einzige Kanal, der die
Gruppe "betreibt einen Automaton" direkt und vollständig erreicht, und er kostet eine halbe Stunde.
Zwei Vorbehalte: Das Repo hat Discussions deaktiviert, es gibt also nur die Issues selbst. Und ein
Hinweis auf eigene Zahlen plus eigenen bezahlten Ersatzdienst wird als Werbung gelesen, wenn der
Ton nicht rein sachlich bleibt. Der Weg, der funktioniert, ist der Hinweis auf die beiden kostenlosen
Auswege aus `docs/ohne-control-plane.md` mit dem Datensatz als Beleg, warum das Problem nicht an
einem selbst liegt.

**Zenodo.** Kostenlos, betrieben vom CERN, vergibt einen DOI, 50 GB und 100 Dateien pro Record,
Lizenzfeld ist Pflicht, Voreinstellung CC-BY-4.0. Ein DOI bringt genau eine Sache, die keine andere
Option bietet: Zitierfähigkeit. Wer in einem Paper, einem Newsletter oder einem längeren Artikel auf
Zahlen verweist, zitiert lieber einen DOI als einen GitHub-Pfad, und Zenodo-Records landen in Google
Dataset Search. Aufwand 30 bis 45 Minuten. Sichtbarkeit aus eigener Kraft nahe null, der Wert liegt
ausschließlich in der Zitierbarkeit für die zweite Zielgruppe.

**Die x402-Ökosystemlisten.** `Merit-Systems/awesome-agentic-commerce` hat 149 Stars und 571 Forks,
`coinbase/x402` 157 Stars und 221 Forks. Ein Pull Request, der den Datensatz unter einer passenden
Rubrik einträgt, kostet 15 Minuten und ist der billigste Verweis überhaupt. `seancrecord/awesome-x402`
hat null Stars und kann man sich sparen.

**Hacker News.** Der Artikel liegt fertig in `docs/artikel-agentenoekonomie.md` und ist genau für
diesen Kanal geschrieben. Auf der Frontpage sind es 10.000 bis 30.000 Besucher an einem Tag, bei
722 Punkten waren es in einem dokumentierten Fall rund 160.000 Seitenaufrufe über eine Woche. Die
allermeisten Einreichungen erreichen die Frontpage nie, das ist die ehrliche Kehrseite. Trotzdem ist
das der einzige Kanal mit einem Erwartungswert, der die anderen um Größenordnungen schlägt, weil er
beide Zielgruppen gleichzeitig trifft.

**Reddit r/x402 und der Farcaster-x402-Kanal.** Existieren, die Größe habe ich nicht verifiziert. Als
Zweitverwertung nach dem HN-Post sinnvoll, als Primärkanal zu schwach.

**Flipside, Observable, data.world.** Alle technisch geeignet, alle ohne die Zielgruppe. Kein Grund,
dort Zeit zu investieren, solange Dune das Publikum hat.

**Wikipedia.** Der englische Artikel zu X402 existiert. Ein Beleg-Link dort hätte hohe Wirkung, aber
das Eintragen eigener Arbeit verstößt gegen die Interessenkonflikt-Regeln und fliegt raus. Wenn der
Datensatz von einer Sekundärquelle aufgegriffen wird, trägt ihn jemand anderes ein.

## 8. Übersicht

| Option | Aufwand | laufende Kosten | erreicht realistisch | trifft die Zielgruppe |
|---|---|---|---|---|
| Dune-Dashboard (on-chain, kein Upload) | 3 bis 5 h | 0 | einige hundert bis wenige tausend mit Verweis | ja, die Schreibenden |
| Kaggle | 2 bis 3 h | 0 | ein bis zwei Dutzend | nein |
| Hugging Face | 1 bis 3 h | 0 | einstellig echte Menschen | nein |
| GitHub Pages | 2 bis 4 h | 0 | abhängig vom Verweis | nur als Ziel, nicht als Kanal |
| Zenodo-DOI | 0,5 h | 0 | nahe null direkt | ja, als Zitierziel |
| Kommentar in den Issues | 0,5 h | 0 | 11 bis 26 Personen | ja, die Betreiber |
| PR in die x402-Listen | 0,25 h | 0 | zweistellig | teilweise |
| Hacker-News-Post | liegt fertig vor | 0 | null oder fünfstellig | beide |

## 9. Lizenz und Datenschutz

**Die Daten sind faktisch nicht schutzfähig.** Blocknummer, Zeitstempel, Adresse, Betrag und
Transaktions-Hash sind Fakten. Eine Sammlung von Fakten ohne schöpferische Auswahl oder Anordnung
genießt keinen Urheberrechtsschutz. Das europäische Datenbankherstellerrecht (sui generis) setzt
eine wesentliche Investition in Beschaffung, Überprüfung oder Darstellung voraus, und der EuGH hat
2004 in British Horseracing Board (C-203/02) und den Fixtures-Marketing-Fällen klargestellt, dass
Investitionen in die Erzeugung der Daten nicht zählen. Ein halbstündiger RPC-Scan gegen einen
öffentlichen Endpunkt ist keine wesentliche Investition. Eine restriktive Lizenz auf diese CSV wäre
also überwiegend unwirksam und würde nur Nutzer abschrecken, die sie ernst nehmen.

**Die Repo-Lizenz passt nicht und muss explizit ausgenommen werden.** `LICENSE.md` stellt das Repo
unter PolyForm Noncommercial 1.0.0. Das ist für die Software richtig und für die Daten falsch:
Ein Journalist bei einem kommerziellen Medium kann nach dem Wortlaut nicht sicher sein, ob er die
Zahlen verwenden darf, und genau dieser Leser ist die Zielgruppe. Kaggle, Hugging Face und Zenodo
verlangen außerdem eine Lizenzangabe, und keine der dort angebotenen Optionen entspricht PolyForm.

**Empfehlung: CC0-1.0 für `docs/research/data/`.** Eine eigene Lizenzdatei in diesem Verzeichnis,
die die Software-Lizenz für die Daten ausdrücklich ablöst, plus ein Absatz im README. CC0 verzichtet
auf Urheberrecht und Datenbankrechte weltweit, was der tatsächlichen Rechtslage am nächsten kommt.
CC-BY-4.0 wäre die Alternative, wenn Nennung wichtig ist, erzeugt aber eine Bedingung, die bei nicht
schutzfähigen Fakten rechtlich leer läuft und in der Praxis nur Reibung macht. Der bessere Weg für
die Nennung ist eine Bitte im README, nicht eine Klausel.

**Wallet-Adressen sind datenschutzrechtlich das eigentliche Thema.** Nach den EDPB-Leitlinien
02/2025 zur Verarbeitung personenbezogener Daten über Blockchain-Technologien (angenommen am
14.04.2025, Endfassung 2.0 am 07.07.2026) sind Wallet-Adressen, Public Keys, Transaktionsmetadaten
und Event-Logs regelmäßig personenbezogene Daten, sobald eine Identifizierung mit vernünftigerweise
einzusetzenden Mitteln möglich ist. Entlastend wirkt das EuGH-Urteil vom 04.09.2025 in C-413/23 P
(EDPS gegen SRB): Der Personenbezug ist relativ und kontextabhängig, pseudonyme Daten können für
einen Empfänger ohne Zuordnungsmittel keine personenbezogenen Daten sein. Wir liefern keine
Zuordnungsmittel mit, und die Adressen stehen unverändert öffentlich in der Kette, jederzeit
reproduzierbar aus `eth_getLogs`.

Daraus folgen vier praktische Punkte:

1. Die Veröffentlichung mit Adressen ist vertretbar, gestützt auf berechtigtes Interesse nach
   Art. 6 Abs. 1 lit. f DSGVO. Die Daten sind bereits öffentlich, der Zweck ist die Nachprüfbarkeit
   einer Aussage, und ohne die Adressspalte ist der Datensatz wertlos, weil die Kohortenrechnung
   genau darauf beruht.
2. Hashing der Adressen bringt nichts. Der Adressraum ist öffentlich, eine Rückrechnung über eine
   Tabelle aller Base-Adressen ist trivial. Wer pseudonymisieren will, muss aggregieren.
3. Die Grenze verläuft bei der Anreicherung. Keine ENS-Namen, keine Wallet-Labels, keine Verknüpfung
   mit Social-Profilen oder Exchange-Zuordnungen. Genau dieser Schritt macht aus einem Pseudonym eine
   Person, und er ist es, der aus einer verteidigbaren Veröffentlichung ein Problem macht. Der
   Artikel hält diese Linie bereits ("Keine Wallet-Adresse wird einzeln genannt").
4. In die Datensatzbeschreibung gehören Zweck, Rechtsgrundlage, Herkunft und eine Kontaktadresse für
   Einwände. Das kostet fünf Zeilen und nimmt einer Beschwerde die Spitze.

Wenn die Diskussion ganz vermieden werden soll, gibt es einen sauberen Ausweg: die aggregierte
Fassung (Monat, Volumen, Wallets, Transfers, Kohortenanteil) auf die Plattformen, die Rohdatei mit
Adressen nur im Repo. Die aggregierte Fassung enthält keine personenbezogenen Daten mehr und trägt
trotzdem die Kernaussage. Der Preis ist, dass niemand die Kohortenzahl selbst nachrechnen kann,
und das ist bei einer Aussage, die auf genau dieser Zahl steht, ein hoher Preis. Ich würde die
Rohdaten veröffentlichen.

## 10. Empfehlung

**Kaggle und Hugging Face fallen weg.** Nicht weil sie schlecht sind, sondern weil dort messbar
niemand ist, der diesen Datensatz sucht: 13 x402-Datensätze auf HF mit höchstens einem Like,
Kaggles Krypto-Ecke besteht aus Preiszeitreihen für ML-Übungen. Der Aufwand von je zwei bis drei
Stunden erkauft ein bis zwei Dutzend Zugriffe, von denen die meisten Crawler sind. Der einzige
Grund, es trotzdem zu tun, wäre der Wunsch nach Vollständigkeit der eigenen Präsenz, und das ist
kein Grund.

**Die Verbreitung hängt nicht an der Plattform, sondern am Artikel.** Der HN-Post ist geschrieben
und fertig, er trifft beide Zielgruppen gleichzeitig, und er ist der einzige Schritt mit einem
Erwartungswert in der Größenordnung von zehntausend Lesern. Alles andere in dieser Liste ist
Infrastruktur, die erst zählt, wenn jemand sie besuchen will.

**Drei Dinge sollten vor dem Post stehen, weil sie den Post besser machen:**

Erstens die Lizenzklarstellung. Ohne sie steht über dem Datensatz "noncommercial", und der erste
Journalist, der zitieren will, muss nachfragen. Kosten: 20 Minuten.

Zweitens das Dune-Dashboard. Es ist die einzige Option, bei der die Zielgruppe nachweislich ist, es
kostet nichts, es läuft on-chain statt aus einer hochgeladenen Datei, und es beantwortet die
Standardfrage unter jedem solchen Artikel ("kann ich das selbst nachrechnen?") mit einem Link, unter
dem die Query offen liegt. Ein Dashboard-Link im HN-Post ist stärker als ein CSV-Link, weil er nicht
nach Zahlen aussieht, die jemand ausgesucht hat. Kosten: drei bis fünf Stunden, einmalig.

Drittens der Kohortensatz. Ein Nebensatz im Artikel und in jeder Datensatzbeschreibung, der klärt,
dass "drei" die Februar-Kohorte meint und 34 die Juni-Aktiven. Kosten: zehn Minuten, verhindert den
ersten kritischen Kommentar.

**Danach, in dieser Reihenfolge:** Kommentar in den zwölf Issues (halbe Stunde, erreicht die
Betreiber direkt), Zenodo-DOI (halbe Stunde, macht den Datensatz zitierfähig für die zweite
Gruppe), PR in `Merit-Systems/awesome-agentic-commerce` (15 Minuten). GitHub Pages lohnt erst, wenn
der Artikel läuft und es eine Seite gibt, auf die verwiesen werden soll; als Vorarbeit ist es
verlorene Zeit.

## 11. Erster Schritt

Die Lizenz der Daten von der Lizenz der Software trennen. Konkret: eine Datei
`docs/research/data/LICENSE.md` mit folgendem Inhalt anlegen und in
`docs/research/data/README.md` einen Absatz ergänzen, der darauf verweist.

```
# Lizenz der Datendateien in diesem Verzeichnis

Die Dateien in diesem Verzeichnis stehen unter CC0 1.0 Universal (Public Domain Dedication),
https://creativecommons.org/publicdomain/zero/1.0/. Die PolyForm-Noncommercial-Lizenz des
übrigen Repositories gilt für sie ausdrücklich nicht.

Die Daten stammen aus öffentlichen Logs der Base-Blockchain (USDC-Transfer-Events), erhoben über
eth_getLogs gegen mainnet.base.org. Sie enthalten Wallet-Adressen, also Pseudonyme, die aus den
Rohdaten der Kette jederzeit reproduzierbar sind. Zweck der Veröffentlichung ist die
Nachprüfbarkeit der Auswertung in ../2026-09-19-nachfrage.md. Es findet keine Anreicherung mit
Namen, ENS-Einträgen, Labels oder Off-Chain-Identitäten statt. Einwände an
matthias@hanseatictech.de.

Eine Nennung als Quelle ist erwünscht, aber keine Bedingung:
Matthias Hippe, control-plane, https://github.com/matthiashippe/control-plane
```

Das ist bewusst nicht in diesem Lauf angelegt worden: Ein Lizenzwechsel für einen Datenbestand ist
eine Entscheidung, die Matthias trifft, nicht eine, die eine Recherche nebenbei ausführt. Der Text
oben ist so weit fertig, dass er nur noch eingefügt werden muss.

## Quellen

Dune: [Upload Data](https://docs.dune.com/web-app/upload-data),
[Upload CSV API](https://docs.dune.com/api-reference/tables/endpoint/upload),
[Base-Datenkatalog](https://docs.dune.com/data-catalog/evm/base/overview),
[payments.agentic_payments](https://docs.dune.com/data-catalog/curated/payments/agentic-payments),
[Search and Discover](https://docs.dune.com/web-app/search),
[Pricing-FAQ](https://docs.dune.com/learning/how-tos/pricing-faqs),
[Rate Limits](https://docs.dune.com/api-reference/overview/rate-limits),
[x402 Payment Analytics Dashboard](https://dune.com/thechriscen/x402-payment-analytics).
Tarifpreise der bezahlten Stufen aus Drittquellen, nicht primär belegt:
[costbench](https://costbench.com/software/onchain-analytics/dune-analytics/),
[comparedge](https://comparedge.com/tools/dune-analytics/pricing).

Kaggle: [Lizenzliste in der Dataset-Metadata-Dokumentation](https://github.com/Kaggle/kaggle-cli/wiki/Dataset-Metadata),
[Kaggle Datasets](https://www.kaggle.com/docs/datasets).

Hugging Face: [Datasets Overview](https://huggingface.co/docs/hub/datasets-overview),
[Storage limits und Repo-Empfehlungen](https://huggingface.co/docs/hub/repositories-recommendations).
Download- und Like-Zahlen am 20.09.2026 über die öffentliche Hub-API abgefragt
(`https://huggingface.co/api/datasets?search=...`).

GitHub: [Pages-Limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits),
[Dataset Structured Data](https://developers.google.com/search/docs/appearance/structured-data/dataset).
Repo-Kennzahlen und Traffic am 20.09.2026 über die GitHub-API abgefragt.

Zenodo: [Create new upload](https://help.zenodo.org/docs/deposit/create-new-upload/),
[Licenses and rights](https://help.zenodo.org/docs/deposit/describe-records/licenses/),
[Manage storage quota](https://help.zenodo.org/docs/deposit/manage-quota/).

Recht: [EDPB Guidelines 02/2025](https://www.edpb.europa.eu/our-work-tools/documents/public-consultations/2025/guidelines-022025-processing-personal-data_en),
[EDPB-Pressemitteilung zur Annahme](https://www.edpb.europa.eu/news/news/2025/edpb-adopts-guidelines-processing-personal-data-through-blockchains-and-ready_en),
[EuGH C-413/23 P, Analyse](https://www.taylorwessing.com/en/insights-and-events/insights/2025/09/analysis-of-the-cjeu-judgment),
[EuGH C-203/02 British Horseracing Board](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex%3A62002CJ0203),
[Creative Commons zu CC0 für Daten](https://wiki.creativecommons.org/wiki/CC0_use_for_data),
[Creative Commons zu sui generis Datenbankrechten](https://wiki.creativecommons.org/wiki/4.0/Sui_generis_database_rights).

Hacker News: [Traffic-Bericht 722 Punkte](https://luke.hsiao.dev/blog/2023-hn-traffic/),
[RoyalSloth zur Frontpage](https://blog.royalsloth.eu/posts/how-much-traffic-comes-from-the-front-page-of-hackernews/).
