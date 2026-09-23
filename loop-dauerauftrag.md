# Dauerauftrag für den Loop

> Jeder Loop-Lauf beginnt in **`ZIELE.md`**, dann hier, dann in `loop-constraints.md`.
> Der Auftrag von Matthias, 19.09.2026: "die ganze zeit verbessern entwickeln deployn, prüfen
> verbessern deployn, etc! schauen was macht der traffic verbessern deployn".
>
> **Ergänzt am 23.09.2026, weil der Loop an vierzehn Zyklen hintereinander nur repariert hat.**
> Matthias: "du arbeitest die ganze Zeit nur an Bugs und nicht an der Vision, habe ich das Gefühl."
> Er hatte recht, und die Ursache stand in dieser Datei: Schritt 2 unten schickte jeden Zyklus, der
> nichts Kaputtes fand, in `nacht-backlog.md`, und keine Zeile dort zeigt auf ein Ziel. Die vier
> datierten Ziele stehen seither in `ZIELE.md` samt Teilzielen, und Schritt 2 geht zuerst dorthin.
> Ein Fehler, den ein echter Nutzer gesehen hat, geht weiterhin vor. Alles andere nicht mehr.

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
  Das bleibt die erste Regel, sie hat sich jeden Tag bezahlt gemacht.
- **Sonst: das oberste offene Teilziel aus `ZIELE.md`**, von oben, ohne Auswahl nach Geschmack.
  Wenn es auf Matthias wartet, nimm das nächste, das ohne ihn geht, und schreib in den Bericht,
  worauf das übersprungene wartet.
- Der Verkehr zeigt etwas Unerwartetes: nachgehen, aber nur so weit, dass klar wird, ob es ein
  Fehler ist oder ein Kanal. Ist es keins von beidem, notieren und zurück zum Teilziel.
- Kein Teilziel offen: neue mit dem Workflow `ziele-zu-teilzielen` ableiten, nicht aus dem Bauch.
- Erst danach `.scratch/gtm/nacht-backlog.md`. Diese Liste ist Reparatur und Hygiene. Sie ist
  wichtig und sie ist nie dringend, und sie hat am 23.09. vierzehn Zyklen lang die Arbeit an den
  Zielen verdrängt, weil sie in dieser Aufzählung an zweiter Stelle stand.

**Was "ein Fehler, den ein echter Nutzer gesehen hat" heißt, und zwar prüfbar.** Am 23.09. hat
jeder der vierzehn Zyklen seine Reparatur mit dieser Regel gerechtfertigt, und keine davon war
einer: gemeint ist **ein 4xx oder 5xx im Zugriffslog, zu dem eine Adresse steht, die nicht in
`ops/own-ips.txt` steht.** Nur das geht vor. Alles andere, was beim Hinsehen auffällt, bekommt eine
Zeile im Backlog und wird in diesem Zyklus nicht angefasst, auch wenn es in zehn Minuten zu
beheben wäre.

**Woran du erkennst, dass du wieder abgedriftet bist.** Schreib vor dem Bauen einen Satz: welche
Zahl aus der Tabelle in `ZIELE.md` bewegt sich dadurch, und um wieviel. Geht der Satz nicht, ohne
über den Dienst statt über den Markt zu reden, dann ist es Reparatur.

**Wenn kein Teilziel offen ist, das ohne Matthias geht**, endet der Zyklus mit dem Satz, welches
Teilziel auf welche Sperre wartet, und leitet mit `ziele-zu-teilzielen` neue ab. Der Backlog ist
erst dann die Arbeit eines Zyklus, wenn `ZIELE.md` keine offene Zeile mehr hat **und** der
Ableitungs-Workflow gelaufen ist.

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

Dazu **eine Zeile in `ZIELE.md`**: welches Teilziel bearbeitet wurde, und was die Zahl daneben
danach sagt. Ein Teilziel gilt als erledigt, wenn die Zahl sich bewegt hat, nicht wenn der Code
fertig ist. Bewegt sie sich nicht, bleibt es offen und bekommt eine Zeile, warum.

## Handwerk

**Niemals `git add -A`.** In diesem Repo arbeiten parallel Agenten, lokal und auf dem code-host.
Ein pauschales `add` nimmt deren halbfertige Dateien mit und stellt sie unter eine fremde
Commit-Message. Genau das ist am 19.09. dreimal passiert: `deploy/rollout.sh` und
`deploy/rollout-remote.sh` landeten in Commits über die Deploy-Sperre, die Kennzahl und die CI.
Der Inhalt war heil, die Historie erzählt Unsinn. Also immer die Dateien nennen, die zur
Änderung gehören, und vor dem Commit einmal `git status --short` lesen.

**Commit-Texte immer über ein Heredoc, nie über `-m "..."`.** In doppelten Anführungszeichen führt
die Shell Backticks und `$` aus. Am 20.09. verschwand so ein Codestück mitten aus einer
Commit-Message: Aus dem Satz, der erklärte, woran der erste Entwurf gescheitert war, wurde
"baute den IP-Filter mit  zusammen". Der Fehler ist lautlos, der Commit geht durch, und auf main
ist er nur noch mit einem force-push zu beheben, der mehr kostet als er wert ist. Also:
`git commit -F -` mit `<<'EOF'`, die einfachen Anführungszeichen um das EOF sind der Teil, der
die Ersetzung abschaltet.

**Änderungen bündeln, nicht einzeln ausrollen.** Am 19.09.2026 ging in einer Stunde dreimal ein
Deploy raus (Kennzahl, Startseite, Logging), und nach dem dritten hörte der einzige zahlende Kunde
auf zu pollen. Ob das die Ursache war, ließ sich nicht mehr feststellen, aber die Frage stellt sich
nur, weil jede Änderung sofort ausgerollt wurde. Solange der Dienst eine Handvoll Nutzer hat, gilt:
höchstens ein Deploy je Zyklus, und kleine Verbesserungen sammeln sich bis zum nächsten ohnehin
fälligen. Der Wechsel kostet rund 16 Sekunden ohne Antwort, und die trifft jedes Mal denselben
Menschen.

**Jeder Deploy läuft über `deploy/rollout.sh`**, nicht über `deploy/up.sh`. `up.sh` mischt Bauen
und Umschalten: Schlägt der Build fehl, ist der alte Container längst zerstört. `rollout.sh` baut
erst, beweist das neue Image an einem Kanarienvogel gegen eine Kopie der Datenbank, wartet auf ein
ruhiges Fenster (keine `pending`-Zahlung, keine laufende Reservierung) und schaltet erst dann um.
`up.sh` bleibt für den Kaltstart, wenn der Dienst ohnehin unten ist.

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

- Der zahlende Kunde `0x0629a685…488e`. **Am 21.09. nachgeprüft, der Stand war teilweise falsch.**
  Aus der Datenbank belegt: Schlüssel `cnwy_k_d716dcbc` mit dem Namen `conway-automaton` am 19.09.
  um 17:36:17 provisioniert, 5 USD am 18:40:42 aufgeladen, **kein Automaton registriert, nie eine
  einzige Inferenz**, und seit Beginn des Zugriffslogs am 19.09. um 19:35 kein einziger
  erfolgreicher Zugriff einer fremden IP auf einen geschützten Pfad. Seine Runtime spricht nicht
  mit uns.
  Der bisher hier notierte `POST /v1/sandboxes` um 19:07 lässt sich nicht belegen: das Log beginnt
  erst um 19:35, und der einzige Sandbox-Aufruf darin kommt von unserer eigenen Leitung per curl.
  Nicht widerlegt, nur unbelegbar, und darum keine Grundlage mehr für eine Diagnose.
  Zwei Ursachen passen zum Befund, und nur die erste sehen wir: die Runtime läuft nicht mehr, oder
  sie denkt über ein anderes Backend. `src/conway/inference.ts` am Pin `d8f8168` wählt zwischen
  `openai`, `anthropic`, `ollama` und der eigenen `conwayApiUrl`; die ersten drei gehen komplett an
  uns vorbei, das Guthaben bleibt dann für immer liegen. Seit dem 21.09. sagt
  `GET /v1/credits/history` genau das, wenn eine Wallet bezahlt und nie etwas verbraucht hat.
- Die Messgröße des 30-Tage-Tests: fünf zahlende fremde Betreiber bis zum 19.10.2026, ablesbar in
  `/v1/status` (dort zählen nur Wallets mit echter Zahlung). Stand: 1.
- Der HN-Artikel liegt postfertig in `.scratch/gtm/hn-post.txt`, der Titel ist entschieden, das
  Posten macht Matthias.
