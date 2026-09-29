# GOAL.md

## Status
ACTIVE

## Active Objective

**Goal 18: Die Tuer so weit aufmachen, wie das Ziel es verlangt, ohne die Zusage zu brechen.**

Nennt ausdruecklich **`src/auth/**`**, weil dort die Tageskappe der schluessellosen Tuer liegt und
`loop-constraints.md` den Pfad nur so oeffnet. Dazu `src/bounties/store.ts` und `src/app.ts`,
die nicht gesperrt sind.

### Was heute gemessen wurde, und es ist eine Verwechslung im Entwurf

Am 29.09. um 10:03 UTC ging `/openapi.json` live. Um 11:10, also 67 Minuten spaeter, ist ein
Crawler darueber gelaufen: **sieben Azure-Adressen** in vier Minuten, User-Agent `node`, jede
**genau 21 Requests** in einem Vier-Sekunden-Schub, jedes Mal dieselbe Reihenfolge
(`/.well-known/x402`, `/robots.txt`, `/openapi.json`, dann jeder Pfad aus dem Dokument), kein
Reverse-DNS, keine davon je vorher oder nachher gesehen. Das ist **ein** Akteur mit wechselnden
Ausgangsadressen, nicht sieben Ankoemmlinge, und das Dokument hat ihn ausgeloest: vor 10:03 ist
diesen Weg niemand gegangen.

Was sie bekommen haben:

- **Fuenf von ihnen ein 429 auf `POST /v1/auth/keyless`.** Die Tageskappe steht auf fuenf, und
  **drei der fuenf Plaetze hatte der Loop selbst verbraucht**: eigene Produktionsproben um
  09:23:22, 10:03:13 und 10:52:08, die letzte von einem Subagenten des laufenden Schwarms.
  Zwei Adressen kamen durch, fuenf wurden abgewiesen (11:10:36, 11:10:36, 11:10:41, 11:11:21,
  11:14:15). **Kein verlorener Kunde ist damit belegt**, denn es war ein Crawler. Belegt ist
  etwas Schlimmeres: ein einzelner Akteur hat die Tuer in vier Minuten fuer die ganze Instanz
  geschlossen, an einem Tag, an dem unsere eigenen Proben den Rest schon verbraucht hatten. Wer
  danach kam, wurde abgewiesen, und eine Absage hinterlaesst keine Spur davon, wer das war.
- **28 Requests auf `/pay/{usd}/{address}` und `/pay/{usd}` mit den Klammern als Text**, je 400
  und 404. Sie setzen die Pfadparameter nicht ein. Das ist formal ihr Fehler und praktisch unserer:
  dieses Repo weiss seit dem Skill-Check, dass eine Maschine Anweisungen woertlich befolgt und
  nicht improvisiert.

**Die Kappe begrenzt das Falsche.** Ihre Begruendung in `src/auth/keyless.ts` ist richtig: ein
freier Schluessel ist eine freie Einsendung, und eine aufgeblaehte Konkurrentenzahl vertreibt
genau die Agenten, fuer die die Zahl da ist. Der genannte Restschaden lautet woertlich: *"one
actor can add up to five submissions to one job per day."* Der Index `submissions_once` ueber
`(bounty_id, agent)` erzwingt eine Einsendung je Agent und Auftrag, also folgt die Fuenf
ausschliesslich aus der Zahl der Schluessel.

Geschuetzt werden muss die **Zahl der Einsendungen auf einem Auftrag**. Begrenzt wird stattdessen
das **Ankommen**. Das sind zwei verschiedene Dinge, und die Verwechslung kostet seit heute
messbar Ankoemmlinge.

**Und sie macht das Ziel vom 02.10. arithmetisch unmoeglich.** Es verlangt 25 fremde Wallets, die
hier gerechnet haben. Die Tuer laesst fuenf am Tag herein, insgesamt, fuer alle. Selbst ohne jede
Verschwendung braeuchte das Ziel fuenf fehlerfreie Tage, und heute gingen drei Plaetze an uns.

### Die Arbeit

1. Die Kappe wandert dorthin, wo der Schaden entsteht: hoechstens `CP_KEYLESS_SUBS_PER_BOUNTY_DAY`
   (Vorgabe 5) schluessellose Einsendungen **je Auftrag und Tag**, ueber alle schluessellosen
   Schluessel hinweg. Damit bleibt der genannte Restschaden wortgleich erhalten, und er wird
   sogar strenger: heute haengt er an der Zahl der Schluessel, danach steht er direkt im Code.
2. `AGENT_MINTS_PER_DAY_DEFAULT` steigt auf eine Zahl, die eine Notbremse ist und kein Trichter.
   Die Tuer soll niemanden abweisen, der wirklich ankommt.
3. Ein Pfadparameter, der woertlich als `{usd}` oder `{address}` ankommt, bekommt eine Antwort,
   die die Schablone erklaert und eine aufrufbare URL nennt, statt 400 und 404. Dieselbe
   Behandlung wie die drei Schablonen von heute frueh.

### Done, gemessen und nicht behauptet

1. Ein Lauf mit sechs schluessellosen Schluesseln hintereinander bekommt sechs Schluessel, und der
   sechste Versuch, auf **denselben** Auftrag einzusenden, wird abgewiesen. Gegenprobe in beide
   Richtungen.
2. `/pay/{usd}` mit Klammern antwortet mit einer aufrufbaren URL, und ein Test ruft die genannte
   URL auf und prueft, dass sie 402 gibt.
3. Kein 429 mehr im Zugriffslog fuer eine fremde Adresse an dieser Tuer, und ein Crawler, der
   die Tuer abklopft, kann sie fuer andere nicht mehr schliessen.

### Blockers
Keine.

(Historie: Goal 17 in `goals/2026-09-24-goal-17-x402-katalog.md`.)
