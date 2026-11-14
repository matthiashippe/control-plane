# Besucheradressen in den Logs der Actions

Bis zum 12.11.2026 schrieb `ops/deploy-window.sh` unter `AFFECTED` die Adresse jedes betroffenen Besuchers, und `deploy.yml` legte
diese Ausgabe in die Logs der Actions dieses öffentlichen Repos. GitHub hielt solche Logs 90 Tage lesbar, seit dem 14.11.2026 hält
das Repo sie höchstens 30 Tage (Abschnitt Aufbewahrung), so wie die Datenschutzerklärung der Seite die Löschung nach 30 Tagen
zusagt. Diese Datei hält nur Zahlen fest, nie eine Adresse. Gezählt wird mit `ops/actions-log-addresses.sh` (Regeln in
`ops/README.md`): fremd ist eine Adresse in einer Zeile einer Anfrage, die in keiner der
Listen `ops/own-ips.txt`, `ops/known-ips.txt` und `ops/crawler-ips.txt` steht und in keinem privaten Bereich liegt. Dass der Zähler
einen gepflanzten Treffer findet und eine eigene Adresse auslässt, zeigen die zweite Prüfung von Punkt 1 des Goals und
`test/actions-log-addresses.test.ts`.

## Zählung vor dem Löschen

```
bash ops/actions-log-addresses.sh --runs 42879222074,42895005251,43164473390,43260817090,43277458881,43322130930
```

Gemessen: 2026-11-14 02:18 UTC

42879222074 0
42895005251 1
43164473390 1
43260817090 1
43277458881 2
43322130930 1
total 2

Je Zeile die Lauf-ID und die Zahl verschiedener fremder Adressen in ihrem Log, `total` zählt verschiedene über alle sechs. Alle sechs
Läufe lieferten noch ein Log.

```
bash ops/actions-log-addresses.sh --workflow deploy.yml
```

Läufe von deploy.yml mit fremden Adressen: 5 von 112

Gemessen um 02:20 UTC am selben Tag. Es sind genau fünf der sechs Läufe oben; kein anderer der 112 Läufe trägt eine fremde Adresse,
einer davon (42839001716) liefert schon kein Log mehr. Die Zählung ist nicht 0, also bleibt das Löschen am Human Gate `delete_data`.

## Nach dem Löschen

Matthias hat am 14.11.2026 am Human Gate `delete_data` die Logs der sechs Läufe gelöscht. Geprüft mit:

```
for id in 42879222074 42895005251 43164473390 43260817090 43277458881 43322130930; do gh api repos/matthiashippe/control-plane/actions/runs/$id/logs >/dev/null 2>&1 && echo "$id log"; done | wc -l
bash ops/actions-log-addresses.sh --workflow deploy.yml
```

Keine Logs mehr: 2026-11-14 09:39 UTC

Die erste Zeile gab 0 aus: Keiner der sechs Läufe liefert noch ein Log. Die Ausgabe der zweiten, je Lauf von deploy.yml die Zahl
verschiedener fremder Adressen, 128 Läufe, davon 7 ohne Log (die sechs gelöschten und 42839001716):

42839001716 no-log
42839192055 0
42879222074 no-log
42895005251 no-log
42915728603 0
42921425680 0
42933021737 0
42937069791 0
42966580588 0
42973070855 0
42973078122 0
42981656924 0
42981765329 0
42990277845 0
42993668589 0
43011618728 0
43013823661 0
43021870541 0
43081722715 0
43164323102 0
43164473390 no-log
43166706283 0
43167899091 0
43168997114 0
43170428121 0
43185165342 0
43185852749 0
43192207915 0
43192241699 0
43202997917 0
43208006311 0
43209194605 0
43212812111 0
43230453346 0
43232273857 0
43254310918 0
43260817090 no-log
43261431976 0
43263203186 0
43277458881 no-log
43284267265 0
43291372016 0
43291498456 0
43291504369 0
43291893017 0
43301127975 0
43310536353 0
43313364130 0
43313875464 0
43317310317 0
43318047334 0
43320706961 0
43320877168 0
43322130930 no-log
43335601962 0
43336646483 0
43339659780 0
43355737611 0
43361693692 0
43370013988 0
43378613021 0
43378751961 0
43378829034 0
43382302121 0
43382325529 0
43394590695 0
43400107410 0
43400217085 0
43400429442 0
43403992609 0
43404327407 0
43404338258 0
43405512642 0
43409948398 0
43410339014 0
43411185482 0
43413009674 0
43415869289 0
43418037767 0
43421793426 0
43424260712 0
43425193818 0
43427728542 0
43429012332 0
43431457463 0
43438581481 0
43443531221 0
43443730631 0
43445307185 0
43455933477 0
43457596639 0
43461402588 0
43464554808 0
43469100917 0
43473726570 0
43480782555 0
43488618319 0
43491939466 0
43494920950 0
43501051442 0
43510006313 0
43517970983 0
43525545696 0
43530663380 0
43530671723 0
43530709473 0
43530757575 0
43531661562 0
43533178547 0
43535849912 0
43538348782 0
43542412256 0
43546996878 0
43555528436 0
43558821276 0
43562955847 0
43567592940 0
43569385812 0
43571922272 0
43572767752 0
43572788749 0
43572848505 0
43572851989 0
43575583935 0
43575586563 0
43576829249 0
43578170234 0
43580454007 0
total 0

## Aufbewahrung

Das Repo hält Logs und Artefakte der Actions höchstens 30 Tage. Die Einstellung liest man mit:

```
gh api repos/matthiashippe/control-plane/actions/permissions/artifact-and-log-retention
```

Aufbewahrung der Logs: 30 Tage, geprüft 2026-11-14 18:43 UTC

Die Einstellung gilt nur für Logs und Artefakte, die nach der Änderung entstehen; ältere behalten ihre 90 Tage, und laut Abschnitt
Nach dem Löschen trägt keiner der älteren Läufe von deploy.yml eine fremde Adresse.

Nach jedem neuen Lauf von deploy.yml zählt dieser Aufruf die fremden Adressen in allen Läufen:

```
bash ops/actions-log-addresses.sh --workflow deploy.yml
```

Er muss `total 0` ausgeben. Endet er mit Exit 2, belegt er nichts, und die Zählung muss wiederholt werden.
