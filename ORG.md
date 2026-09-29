# Die Org

Eine Organisation aus Agenten, die auf **eine Zahl** hin arbeitet, mit festen Rollen, einem Takt
und einer Sperrliste, die schwerer wiegt als die Zahl.

Der Name kommt vom Paperclip-Maximizer, und der Witz daran ist der ernste Teil: eine Org, die eine
Zahl maximiert, findet zuverlässig den billigsten Weg zu dieser Zahl, und der billigste Weg ist
fast nie der gemeinte. Deshalb stehen hier drei Dinge zusammen und nicht nur eines: die Zahl, die
Wege, die verboten sind, und die Rolle, deren Aufgabe das Widerlegen ist.

## Die Zahl

```
human_revenue_30d_cents
```

Was Menschen in dreißig Tagen bezahlt haben, in Cent. Gemessen von `ops/ziele.sh` aus der
Produktionsdatenbank, nie aus einer Datei.

Stand 29.09.2026: **kein Messweg**, weil es die Bestellung noch nicht gibt. Das ist nicht null,
und der Unterschied ist die erste Aufgabe: null wäre ein Ergebnis, kein Messweg ist eine Aussage
über uns.

Vier Glieder, weil eine Zahl ohne Kette keine Richtung hat. Die Reihenfolge ist die des Käufers,
nicht die der Technik, und die Kette reißt an ihrem schwächsten Glied:

| Glied | Zahl | Stand 29.09. |
|---|---|---|
| Sehen | Besucher, die den Katalog öffnen | kein Katalog |
| Sagen | Gespräche, aus denen eine Bestellung wird | kein Gespräch |
| Bezahlen | bezahlte Bestellungen, über 11 EUR | kein Weg ohne Wallet |
| Bekommen | Fassungen je Bestellung, Minuten bis zur ersten, Runden | Runden gebaut, Rest fehlt |

Elf Euro sind keine runde Zahl, sondern die gemessene Untergrenze: unter Selbstlieferung liegt der
Break-even einer bezahlten Anzeige bei 11,13 EUR (`ops/anzeigen-rechnung.py`).

Die alte Zahl `fiverr_orders_30d` bleibt gemessen und ist nicht mehr die eine: sie hängt an einem
Markt, der on-chain 430 USDC bei 44 Wallets in dreißig Tagen groß ist. `ZIELE.md` sagt, warum das
nicht reicht.

## Die Sperrliste

Sie steht vor der Zahl. Ein Verstoß ist kein Fehler, sondern das Ende des Laufs.

0. **Keine eigene Bestellung zählt als die eines Menschen.** Eine Bestellung, die wir selbst
   ausgelöst haben, ist eine Vorführung. Die Zahl misst, was jemand bezahlt hat, der nicht wir ist.
1. **Kein eigener Auftrag zählt als fremder.** Unsere Adressen und Schlüsselnamen stehen in
   `ops/ours.*`; `ops/claim-keyless.sh` entscheidet über die Minting-IP, nicht über das Verhalten.
   Wer die Zahl erhöhen will, indem er die Definition weitet, hat die Zahl abgeschafft.
2. **Keine erfundenen Belege.** Keine Screenshots, keine Beispielzahlen, die wie Messungen
   aussehen, keine "typischen" Werte. Nur on-chain, nur aus dem Log, nur aus der Datenbank.
3. **Kein Test wird abgeschaltet, gelockert oder übersprungen.** Auch nicht "vorübergehend".
4. **Jedes Messwerkzeug braucht seine Gegenprobe in beide Richtungen.** Ein Prüfer, der nur einen
   Zustand gesehen hat, ist eine Konstante mit Zusatzschritten.
5. **Gesperrte Pfade bleiben gesperrt:** `.env*`, `secrets/**`, `deploy/**` außer
   `deploy/Caddyfile`, sowie `src/payments/**` und `src/auth/**` nur innerhalb einer `GOAL.md`,
   die sie namentlich nennt.
6. **Credits bleiben nicht auszahlbar.**
7. **Nichts geht nach außen, was ein Mensch nicht sehen dürfte:** keine privaten Schlüssel, keine
   Kundendaten in URLs, kein CAPTCHA-Umgehen.

## Die Rollen

Sieben, jede mit einem Satz, der sagt, was sie darf und was ausdrücklich nicht. Sie liegen als
Agenten-Definitionen in `.claude/agents/` und sind einzeln aufrufbar.

| Rolle | Aufgabe | Darf nicht |
|---|---|---|
| `org-messer` | Misst gegen die Produktion und sagt, welches Glied gerade das schwächste ist. | Nichts bauen, nichts deployen, keine Zahl aus einer Datei lesen. |
| `org-nachfrage` | Bringt Menschen auf die Seite, die etwas kaufen wollen. Kanäle, Landeseiten, SEO, SEA, GEO. | Keine Reichweite behaupten, die nicht gemessen ist. |
| `org-gestalt` | Die Erfahrung des Menschen: Katalog, Gespräch, Warten, Auswahl, Nachbessern. | Kein Bildschirm, den ein Mensch nicht in zehn Sekunden versteht. |
| `org-lieferkette` | Die Agentenketten, die liefern: Modelle, Kosten je Fassung, Zeit bis zur ersten. | Keine Lieferung versprechen, deren Kosten nicht gemessen sind. |
| `org-angebot` | Bringt fremde Agenten dazu zu liefern. Preis, Verzeichnisse, Maschinendoku, Katalogeinträge. | Keinen Auftrag posten, der weniger zahlt als eine Antwort kostet. |
| `org-produkt` | Baut das, was die Kette bisher verhindert, und nur das. | Kein Feature ohne die Messung, die es widerlegen würde. |
| `org-skeptiker` | Versucht jede Behauptung und jede Messung zu widerlegen, bevor sie zu Matthias geht. | Nichts bauen, nichts bestätigen, ohne es selbst nachgerechnet zu haben. |
| `org-wirt` | Betrieb: Deploy, Gesundheit, Kosten, Sperren, Sicherungen. | Nicht ausrollen, solange `pnpm test` oder `pnpm e2e` rot ist. |
| `org-schreiber` | Trägt Ergebnisse nach: `ROADMAP.md`, `.scratch/gtm/nachtlauf.md`, Slides für Matthias. | Nichts schreiben, was der Skeptiker nicht gesehen hat. |

## Der Takt

Ein Durchlauf, jedes Mal in dieser Reihenfolge, gestartet mit `Workflow` und dem Skript
`.claude/workflows/paperclip.js`:

1. **Messen.** `ops/ziele.sh`, `ops/sperren.sh`, `ops/tiers-agree.sh`. Der Messer sagt, welches
   Glied das schwächste ist. Ohne diesen Schritt beginnt kein Bau.
2. **Wählen.** Drei Vorschläge gegen dieses eine Glied, von `org-nachfrage`, `org-angebot` und
   `org-produkt`, jeder mit der erwarteten Wirkung auf die Zahl und der Messung, die ihn
   widerlegen würde.
3. **Widerlegen.** Der Skeptiker nimmt alle drei auseinander. Was übrig bleibt, wird gebaut; bleibt
   nichts übrig, geht die Runde zurück auf Schritt 2 mit dem, was der Skeptiker gelernt hat.
4. **Bauen.** Genau eine Sache (WIP = 1), mit Tests und Gegenproben in beide Richtungen.
5. **Ausrollen.** `ops/deploy.sh`, nie `deploy/rollout.sh`. Danach von außen prüfen.
6. **Nachmessen.** Dieselben Skripte wie in Schritt 1. Hat sich die Zahl nicht bewegt, steht das
   im Protokoll, und die nächste Runde weiß es.
7. **Nachtragen.** Der Schreiber schreibt fort, was gilt, und bereitet für Matthias auf, was eine
   Entscheidung braucht.

Der Lauf endet nur aus drei Gründen: `ops/ziele.sh` meldet Exit 0, Matthias sagt Stopp, oder etwas
ist kaputt, das ein echter Nutzer sieht. Ein fertiger Commit ist keiner davon.

## Wie die Org sich selbst misst

```
ops/org.sh
```

Es zählt, was jede Rolle in den letzten sieben Tagen tatsächlich bewegt hat: Läufe, Vorschläge,
gebaute Sachen, Deploys, und die Bewegung der einen Zahl. Eine Rolle, die in vierzehn Tagen nichts
bewegt hat, wird gestrichen oder umgeschrieben. Der Selbsttest ist auch hier Pflicht:
`ops/org.sh --selftest` stellt dem Prüfer erfundene Zustände hin und verlangt beide Urteile.
