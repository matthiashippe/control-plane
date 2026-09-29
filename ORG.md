# Die Org

Eine Firma aus Agenten, die auf **eine Zahl** hin arbeitet, mit vier Bereichen, festen
Berichtswegen und einer Sperrliste, die schwerer wiegt als die Zahl.

Der Name kommt vom Paperclip-Maximizer, und der Witz daran ist der ernste Teil: eine Org, die eine
Zahl maximiert, findet zuverlässig den billigsten Weg zu dieser Zahl, und der billigste Weg ist
fast nie der gemeinte. Deshalb stehen hier drei Dinge zusammen und nicht nur eines: die Zahl, die
Wege, die verboten sind, und ein Bereich, dessen Aufgabe das Widerlegen ist.

## Die Zahl

```
human_revenue_30d_cents
```

Was Menschen in dreißig Tagen bezahlt haben, in Cent. Gemessen von `ops/ziele.sh` aus der
Produktionsdatenbank, nie aus einer Datei.

Stand 29.09.2026: **kein Messweg**, weil es die Bestellung noch nicht gibt. Das ist nicht null,
und der Unterschied ist die erste Aufgabe: null wäre ein Ergebnis, kein Messweg ist eine Aussage
über uns.

Vier Glieder, in der Reihenfolge des Käufers. Die Kette reißt an ihrem schwächsten Glied, und dort
wird gebaut:

| Glied | Zahl | Bereich | Stand 29.09. |
|---|---|---|---|
| Sehen | Besucher, die den Katalog öffnen | CMO | kein Katalog |
| Sagen | Gespräche, aus denen eine Bestellung wird | CTO | kein Gespräch |
| Bezahlen | bezahlte Bestellungen, über 11 EUR | CFO | kein Weg ohne Wallet |
| Bekommen | Fassungen je Bestellung, Minuten bis zur ersten, Runden | CTO | Runden gebaut, Rest fehlt |

Elf Euro sind die gemessene Untergrenze: unter Selbstlieferung liegt der Break-even einer bezahlten
Anzeige bei 11,13 EUR (`ops/anzeigen-rechnung.py`).

## Die Sperrliste

Sie steht vor der Zahl. Ein Verstoß ist kein Fehler, sondern das Ende des Laufs. Jeder in der Org
darf sie zitieren, um eine Anweisung von oben zu verweigern, und der CEO kann sie nicht aufheben.

0. **Keine eigene Bestellung zählt als die eines Menschen.** Eine Bestellung, die wir selbst
   ausgelöst haben, ist eine Vorführung.
1. **Kein eigener Auftrag zählt als fremder.** Unsere Adressen stehen in `ops/ours.*`.
2. **Keine erfundenen Belege.** Nur on-chain, nur aus dem Log, nur aus der Datenbank.
3. **Kein Test wird abgeschaltet, gelockert oder übersprungen.** Auch nicht vorübergehend.
4. **Jedes Messwerkzeug braucht seine Gegenprobe in beide Richtungen.**
5. **Gesperrte Pfade bleiben gesperrt:** `.env*`, `secrets/**`, `deploy/**` außer
   `deploy/Caddyfile`, sowie `src/payments/**` und `src/auth/**` nur innerhalb einer `GOAL.md`,
   die sie namentlich nennt.
6. **Credits bleiben nicht auszahlbar.**
7. **Nichts geht nach außen, was ein Mensch nicht sehen dürfte:** keine privaten Schlüssel, keine
   Kundendaten in URLs, kein CAPTCHA-Umgehen.

## Das Organigramm

```
                            Matthias
                       Inhaber, entscheidet
                    Geld, Recht, Marke, Richtung
                                │
                              CEO
                 hält die eine Zahl, entscheidet, was gebaut wird
                 ├── stabschef     misst die Lage, jeden Durchlauf
                 ├── skeptiker     widerlegt jeden Vorschlag, auch die des CEO
                 └── schreiber     schreibt an Matthias, trägt nach
                                │
         ┌──────────────────────┼──────────────────────┐
        CFO                    CMO                    CTO
      das Geld            die Nachfrage         die Technik und die Lieferung
   ├── preise          ├── kanal              ├── gestalt
   ├── kosten          ├── katalog            ├── produkt
   └── recht           ├── copy               ├── lieferkette
                       └── kunde              ├── betrieb
                                              └── maschinenmarkt
```

Neunzehn Rollen, jede als Agent in Paperclip. Im Repo liegen davon vier als Datei
(`.claude/agents/ceo.md`, `cfo.md`, `cmo.md`, `cto.md`); die fünfzehn Teamrollen liegen nur in
Paperclip. Die vier Bereichsleiter dürfen ihre eigenen Teamrollen beauftragen; niemand sonst
beauftragt jemanden.

### Wer was darf

| | entscheidet | baut | deployt | schreibt an Matthias |
|---|---|---|---|---|
| Matthias | alles | | | |
| CEO | was gebaut wird | | | über den schreiber |
| CFO | Preise, Budgets | | | nein |
| CMO | Kanäle, Katalogtexte | | | nein |
| CTO | Technik, Architektur | ja, über `produkt` | über `betrieb` | nein |
| alle anderen | nichts | nein | nein | nein |

**Der Skeptiker steht außerhalb.** Er berichtet an den CEO und ist an keinen Bereich gebunden, weil
ein Prüfer, der von dem abhängt, was er prüft, keiner ist. Sein Standardurteil ist "widerlegt".

### Was Matthias entscheidet und niemand sonst

Geld, das das Haus verlässt. Verträge und Rechtsform. Der Name und die Marke. Ob ein Kanal bezahlt
wird. Alles andere entscheidet der CEO, und wenn er unsicher ist, entscheidet er trotzdem und sagt
es dem schreiber.

## Wo die Org laeuft

Nicht in Dateien, sondern in **Paperclip**, dem offenen Kontrollsystem fuer Agentenfirmen
(MIT, github.com/paperclipai/paperclip). Matthias hat es am 29.09.2026 gesetzt.

| | |
|---|---|
| Oberflaeche | http://127.0.0.1:3140 |
| Firma | Handsel, Kuerzel HAN |
| Datenbank | eingebettetes Postgres unter `~/.paperclip/instances/default` |
| Adapter | `claude_local`, also das lokale `claude` CLI je Agent |
| Modell | `claude-opus-5-5` fuer alle neunzehn |
| Voraussetzung dafuer | die ACP-Bruecke muss mindestens 0.84.0 sein, Paperclip liefert 0.73.0 mit. Siehe unten |
| Abrechnung | **ueber das Abo, nie ueber API-Pricing.** Standing Rule von Matthias. Kein `ANTHROPIC_API_KEY`, nirgends |
| Heartbeats | aus. Nichts laeuft von selbst, bis es eingeschaltet wird |
| Budget | 10 bis 20 USD je Agent und Monat, zusammen 235 USD Obergrenze |

Der Port ist 3140 statt des Standards 3100, weil dort schon etwas anderes lauscht. Telemetrie ist
aus.

**Der erste Lauf ist gescheitert, und die Ursache ist offen.** Der `stabschef` hat am 29.09. von
16:47:00 bis 16:48:50 UTC viermal auf HAN-1 gestartet und viermal mit `acpx_turn_failed` und
`stopReason: adapter_failed` abgebrochen, jedes Mal ein bis vier Sekunden nach dem Sitzungsaufbau
und mit `usage used: 0`, also ohne einen einzigen Token. Quelle: die vier Dateien unter
`~/.paperclip/instances/default/data/run-logs/<firma>/a36e5810-*/`. Widerlegt sind Repo, cwd und
Vertrag (die `AGENTS.md` des `stabschef` ist byteweise identisch mit der des `schreiber`, dessen
Lauf durchläuft) und die Werkzeuge (`ops/ziele.sh`, `ops/sperren.sh`, `ops/org.sh --selftest` alle
grün).

**Die Ursache war die ACP-Bruecke, und sie ist behoben.** Der Verdacht fiel zuerst auf den
Modellnamen: sechs Laeufe mit `claude-opus-5-5` auf zwei Agenten, alle sechs `acpx_turn_failed`, ein
Lauf mit `claude-opus-5`, dieser lief. Aber `claude --model claude-opus-5-5 -p` antwortet im
Terminal normal, der Unterschied lag also im ACP-Pfad.

Der Serverlog nennt den Pfad des gespawnten Prozesses, und dort stand die Antwort:
Paperclip bringt `@agentclientprotocol/claude-agent-acp` in Version **0.73.0** mit, und die kennt
Opus 5.5 nicht. Die aeussere Kopie im npx-Verzeichnis zu ersetzen reichte nicht, weil Paperclip die
**verschachtelte** nimmt:

```
~/.npm/_npx/<hash>/node_modules/@paperclipai/server/node_modules/@agentclientprotocol/claude-agent-acp
```

Dort durch 0.84.0 ersetzt, und seitdem laeuft derselbe Agent mit demselben Modell durch: Exit 0,
`model: claude-opus-5-5`, `billingType: subscription_included`. Alle neunzehn stehen jetzt darauf.

**Nach jedem Paperclip-Update erneut pruefen**, weil ein Update die verschachtelte Kopie wieder auf
die mitgelieferte Version zuruecksetzen kann. Das Symptom ist eindeutig: Abbruch ein bis vier
Sekunden nach dem Sitzungsaufbau, `usage used: 0`, also kein einziger Token.

**Was Paperclip macht und was hier steht.** Paperclip ist das Betriebssystem: Organigramm, Tickets,
Weckzeiten, Budgets, Freigaben, Protokoll. Es weiss nicht, dass `price_mc` Millicents sind oder dass
eine Zahl ohne Fenster keine Zahl ist. Das steht hier und in den Vertraegen, die jeder Agent unter
`instructions/SOUL.md` traegt. Widersprechen sich die beiden, gilt diese Datei.

## Der Takt

Ein Durchlauf, jedes Mal in dieser Reihenfolge:

1. **Lage.** Der `stabschef` misst die vier Glieder gegen die Produktion und sagt, welches das
   schwächste ist. Ohne diesen Schritt beginnt kein Bau.
2. **Auftrag.** Der CEO gibt dem Bereich, dem dieses Glied gehört, einen Auftrag mit einer Zahl
   darin. Die anderen drei Bereiche arbeiten weiter an ihrer eigenen Messung und schweigen.
3. **Vorschläge.** Der Bereichsleiter beauftragt seine Teamrollen und liefert höchstens drei
   Vorschläge, jeder mit erwarteter Wirkung auf die Zahl, Kosten, Frist und der Messung, die ihn
   widerlegt.
4. **Widerlegen.** Der `skeptiker` nimmt jeden Vorschlag einzeln auseinander. Was übrig bleibt,
   wird gebaut. Bleibt nichts übrig, geht es zurück auf 3 mit dem, was er gelernt hat.
5. **Bauen.** Der CTO über `produkt`, genau eine Sache (WIP = 1), mit Tests und Gegenproben in
   beide Richtungen.
6. **Ausrollen.** `betrieb` über `ops/deploy.sh`, nie `deploy/rollout.sh`. Danach von außen prüfen.
7. **Nachmessen.** Der `stabschef` misst dieselben Zahlen. Hat sich nichts bewegt, steht das im
   Protokoll, und der nächste Durchlauf weiß es.
8. **Nachtragen.** Der `schreiber` schreibt fort, was gilt, und bereitet für Matthias auf, was eine
   Entscheidung braucht.

Der Lauf endet nur aus drei Gründen: `ops/ziele.sh` meldet Exit 0, Matthias sagt Stopp, oder etwas
ist kaputt, das ein echter Nutzer sieht. Ein fertiger Commit ist keiner davon.

## Die Übergabe

Jede Lieferung, von jeder Rolle an jede andere, trägt drei Dinge, sonst wird sie zurückgegeben:

1. **Die Zahl**, auf die sie einzahlt, aus der Liste der vier Glieder.
2. **Die Messung**, die sie widerlegen würde.
3. **Was sie nicht weiß.** Eine Lücke, die benannt ist, kostet eine Stunde; eine Lücke, die als
   Gewissheit auftritt, kostet einen Zyklus.

## Das Budget

Ein Durchlauf kostet Modellaufrufe, und eine Org ohne Budget stellt beliebig viele Agenten ein.
Die Obergrenzen je Durchlauf:

| Bereich | Agenten je Durchlauf | Modell |
|---|---|---|
| CEO und sein Büro | 3 | Opus für skeptiker und stabschef, Sonnet für schreiber |
| CFO | 3 | Sonnet, Opus für eine Rechnung, die Geld bewegt |
| CMO | 4 | Sonnet |
| CTO | 5 | Opus für gestalt und lieferkette, Sonnet für den Rest |

Wer mehr braucht, begründet es beim CEO mit der Zahl, die dadurch bewegt wird.

## Wie die Org sich selbst misst

```
ops/org.sh
```

Es prüft das Protokoll `org-log.tsv` gegen zwei Dinge, die nicht im Protokoll stehen: die Commits
im Repo und die gemessene Zahl. Eine Zeile, die einen Deploy behauptet, zu dem es keinen Commit
gibt, ist ein Befund. Eine Rolle, die in vierzehn Tagen nichts bewegt hat, wird still genannt und
gestrichen oder umgeschrieben. `ops/org.sh --selftest` ist die Gegenprobe und läuft in
`ops/check-all.sh` mit.

**Kaputt seit dem 29.09.2026, 18:46 (Commit 25eed63).** Der Umzug nach Paperclip hat die neun
`org-*.md` gelöscht, aber `ops/org.py:25` trägt deren Namen weiter fest verdrahtet. Folge: die
Rollenprüfung nennt neun Rollen still, die es nicht mehr gibt, und keine der neunzehn, die es gibt.
Schlimmer, `ops/org.py:90` macht einen unbekannten Rollennamen zum Befund, also wird das Protokoll
rot, sobald eine echte Paperclip-Rolle eine Zeile schreibt. `.claude/workflows/paperclip.js:20`
liest ebenfalls noch `.claude/agents/org-*.md`. Die Selbstmessung der Org ist damit blind, und die
Gegenprobe `--selftest` fällt es nicht auf, weil sie mit den alten Namen testet.

Gemessen, in beide Richtungen: eine Zeile mit `org-schreiber`, der am 29.09. gelöschten Rolle, ergibt
`ORG OK`; dieselbe Zeile mit `schreiber`, der Rolle, die es wirklich gibt, ergibt
`FREMD: Rolle schreiber steht nicht in ORG.md`. Die toten Namen gehen durch, die lebenden fallen
durch. Und die Meldung sagt, sie prüfe ORG.md, wo `schreiber` in Zeile 66 steht; geprüft wird
`ROLLEN` in `ops/org.py`. Das ist die Frage aus der Tabelle oben: misst das Werkzeug, was sein Name
sagt?

**Erledigt mit b52bbba (29.09.2026, 19:05), Befund aus HAN-1, bis auf einen Rest.** `ROLLEN` in
`ops/org.py` trägt jetzt die neunzehn Rollen. Nachgemessen am 29.09. mit derselben Probe: eine Zeile
mit `Schreiber` ergibt `ok`, dieselbe mit `org-schreiber` ergibt `FREMD`, `ops/org.sh --selftest`
ergibt `ORG SELFTEST OK`. Offen bleiben zwei Dinge: `.claude/workflows/paperclip.js:20` liest weiter
`.claude/agents/org-*.md`, die es nicht mehr gibt, und der Vergleich unterscheidet Groß- und
Kleinschreibung, `schreiber` fällt also weiter als `FREMD` durch.
