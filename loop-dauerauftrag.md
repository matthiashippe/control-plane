# Dauerauftrag für den Loop

> Jeder Loop-Lauf beginnt hier und in `loop-constraints.md`. Der Auftrag von Matthias, 19.09.2026:
> "die ganze zeit verbessern entwickeln deployn, prüfen verbessern deployn, etc! schauen was macht
> der traffic verbessern deployn".

Der Dienst läuft öffentlich unter https://cp.hippe.eu und hat seit dem 19.09.2026, 18:40 UTC einen
zahlenden Kunden. Ab hier gibt es keinen Projektabschluss mehr, nur noch Zyklen.

## Der Zyklus

**1. Hinsehen, bevor du etwas baust.** Jeder Lauf beginnt mit Beobachtung, nicht mit dem Backlog:

```
curl -s -o /dev/null -w "%{http_code}\n" https://cp.hippe.eu/health
ssh -i ~/.ssh/id_ed25519_automaton root@76.13.144.207 \
  'docker logs deploy-autoheal-1 2>&1 | grep -c "found to be unhealthy"; tail -3 /var/log/cp-watchdog.log'
ops/status.sh    # braucht OPENROUTER_API_KEY aus ~/brain/connectors/secrets.env
```

Der Filter muss `found to be unhealthy` lauten, nicht nur `unhealthy`: Die Startzeile von autoheal
("Monitoring containers for unhealthy status") enthält das Wort ebenfalls und färbt die Zählung um
eins nach oben. Genau das hat beim ersten Lauf einen Eingriff vorgetäuscht, den es nie gab.
Stand 19.09.2026, 21:40: **drei** echte Eingriffe (16:58, 18:36, 18:38 UTC), alle vor dem Fix am
Startpfad, seither keiner.

Dazu der Verkehr der letzten Stunde aus den Caddy-Logs: Welche Pfade, welche Statuscodes, welche
Clients. **Jeder 4xx und 5xx, den ein echter Nutzer gesehen hat, schlägt jede Aufgabe aus dem
Backlog.** Ein Fehler, den jemand erlebt hat, ist ein gemessenes Problem; alles andere ist eine
Vermutung.

**2. Entscheiden, was am meisten bringt.** In dieser Reihenfolge:
- Etwas ist kaputt oder ein Nutzer läuft gegen eine Wand: sofort, und zwar vor allem anderen.
- Der Verkehr zeigt etwas Unerwartetes: nachgehen, verstehen, dann erst handeln.
- Nichts davon: die oberste offene Zeile aus `.scratch/gtm/nacht-backlog.md`.
- Auch die ist leer: eine neue Aufgabe aus dem ableiten, was du beim Hinsehen gelernt hast, und
  sie unten im Backlog ergänzen, damit der nächste Lauf sie findet.

**3. Bauen.** Klein genug, dass es in einen Zyklus passt. Lieber eine Sache fertig als drei halb.
Eigenständiges und Rechenintensives geht an den code-host (`job start control-plane --model opus
--workspace worktree --base main -- '<auftrag>'`), Beobachtung und schnelle Eingriffe bleiben lokal.
Jeder Auftrag an die VM beginnt mit dem Hinweis, `loop-constraints.md` und diese Datei zu lesen.

**4. Ausrollen.** Die Bedingungen stehen in `loop-constraints.md` unter "Deploy" und sind nicht
verhandelbar: Tests grün, e2e grün bei Laufzeitänderungen, ein nennbarer Grund, Prüfung von außen
danach, Blick in die Logs, ob ein Nutzer im Deploy-Fenster einen Fehler gesehen hat.

**5. Einsammeln.** `ssh code-host 'job list'`: Was auf `waiting·fertig` steht, wird gelesen
(`job report <id>`), der Branch geholt, geprüft, gemerged und der Job geschlossen. Ein Ergebnis,
das niemand abholt, war verschwendete Rechenzeit.

**6. Protokollieren.** Eine Zeile in `.scratch/gtm/nachtlauf.md`: was beobachtet, was gebaut, was
ausgerollt, was dabei auffiel. Wer nichts gefunden hat, schreibt das auch, mit den Zahlen, die er
gesehen hat. Ein stiller Zyklus ist ein Befund, kein Nichts.

## Was dauerhaft gilt

- **Der Kunde geht vor.** Bei jeder Abwägung zwischen Fortschritt und seiner Verfügbarkeit gewinnt
  seine Verfügbarkeit. Er hat bezahlt, wir schulden ihm einen laufenden Dienst.
- **Nichts wird behauptet, was nicht geprüft ist.** Jede Zahl im Protokoll hat einen Befehl, aus
  dem sie stammt. Ein Test, der ohne den zugehörigen Fix grün bleibt, ist kein Test; das ist an
  einem einzigen Abend dreimal passiert.
- **Keine Außenwirkung aus dem Loop.** Issue-Antworten, Artikel und alles, was unter Matthias'
  Namen nach draußen geht, macht eine wache Session mit ihm zusammen.
- **Der Upstream-Pin `d8f8168` bleibt.** Er ist die Referenz, gegen die der Dienst kompatibel ist.

## Offene Fäden, die der Loop weiterverfolgt

- Der zahlende Kunde `0x0629a685…488e` hat am 19.09. um 19:07 UTC `POST /v1/sandboxes` versucht und
  501 bekommen. Solange er nicht denkt, ist das die wichtigste Baustelle.
- Die Messgröße des 30-Tage-Tests: fünf zahlende fremde Betreiber bis zum 19.10.2026, ablesbar in
  `/v1/status` (dort zählen nur Wallets mit echter Zahlung). Stand: 1.
- Der HN-Artikel liegt postfertig in `.scratch/gtm/hn-post.txt`, der Titel ist entschieden, das
  Posten macht Matthias.
