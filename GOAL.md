# GOAL.md

## Status
ACTIVE

## Active Objective
**Goal 15 laeuft, weil Goal 10 auf Matthias' Namensentscheidung wartet.** Das Journeybuch
steht in `docs/journeys.md`, geprueft von `ops/journeys-pruefen.sh`; die Done-Bedingungen stehen in
STATE.md unter Goal 15. Danach zurueck zu Goal 10.

Goal 10: Positionierung und Name. Der Markt ist seit dem 20.09.2026 fertig, beschrieben und
öffentlich einsehbar, und niemand weiß davon. Der Engpass ist ab hier nicht mehr der Bau. Dieses
Goal legt fest, was wir sind und wie wir heißen, weil davon die Website, die Verteilung und der
GTM abhängen und nichts davon vorher sinnvoll gebaut werden kann.

Die Vorgabe von Matthias am 20.09.: "nicht halbgar sondern komplett insane verfolgen". Der Maßstab
dafür ist hier nicht Lautstärke, sondern ob ein Fremder nach einmaligem Lesen sagen kann, was er
hier tun kann.

## Done Condition

- [ ] **Ein Satz.** Höchstens fünfzehn Wörter, ohne Vorwissen verständlich, nennt den Markt und
      nicht die Technik. Kein "AI-powered", kein "platform", kein "seamless".
      Prüfung: Der Satz steht ohne umgebende Erklärung da und beantwortet, was hier passiert. Er
      wird gegen drei Gegenfragen gehalten, die ein Skeptiker stellt: Wer zahlt? Wer arbeitet? Was
      bekomme ich, wenn es schiefgeht?
- [ ] **Ein Name.** Aussprechbar auf Englisch, kein deutsches Wort, keine Kollision mit einem
      bestehenden KI- oder Marktplatzprodukt.
      Prüfung: Suche, npm, GitHub und eine Schnellsicht ins EUIPO- und USPTO-Register zeigen keinen
      Treffer im selben Feld; das Ergebnis jeder Prüfung steht mit Datum im Goal-Bericht. Eine
      Domain ist verfügbar oder es gibt eine begründete Alternative.
- [ ] **Drei Namen zur Auswahl, nicht einer.** Jeder mit der obigen Prüfung und einem Satz, warum
      er trägt und woran er scheitern könnte. Die Auswahl trifft Matthias; ohne seine Entscheidung
      wird nichts umbenannt.
- [ ] **Der Satz und der Name stehen überall, wo heute die alte Positionierung steht:** `<title>`,
      `h1`, `og:title`, `og:description`, `twitter:*`, `/llms.txt`, die Repo-Beschreibung,
      `docs/bounties.md`, `README.md`.
      Prüfung: `curl -s https://cp.hippe.eu/ | grep` findet den neuen Satz an allen genannten
      Stellen, und `gh repo view --json description` zeigt ihn ebenfalls.
- [ ] **Ein Test hält die Reihenfolge fest.** `test/public.test.ts` prüft, dass die Startseite mit
      dem Markt beginnt und die Conway-Kompatibilität erst danach kommt.
      Prüfung: Der Test schlägt fehl, wenn man die beiden Abschnitte vertauscht. Ohne diese
      Gegenprobe zählt er nicht (`loop-constraints.md`: ein Test, der ohne den zugehörigen Fix grün
      bleibt, ist kein Test).
- [ ] **Die Gegenprobe gegen die eigene Sprache.** Der Satz, die Startseite und `docs/bounties.md`
      laufen einmal gegen die Anti-Slop-Regeln aus `~/.claude/CLAUDE.md`; kein Gedankenstrich,
      keine Dreierfigur, keine Werbevokabel, die Qualität behauptet statt sie zu zeigen.
- [ ] **Kein Deploy ohne die Bedingungen aus `loop-constraints.md`:** `pnpm test` grün, bei
      Laufzeitänderungen `pnpm e2e` grün, Prüfung von außen danach, dazu
      `CP_URL=https://cp.hippe.eu pnpm tsx harness/e2e/markt.ts` mit `MARKT OK`.

## Nicht Teil dieses Goals
Website-Umbau (Goal 11), MCP und Runtime-Skill (Goal 12), der GTM-Plan (Goal 13) und die
Seed-Aufträge (Goal 14). Ein Name ohne Position ist Dekoration, eine Website ohne Name ist
Nacharbeit, deshalb diese Reihenfolge.

## Blockers
- Die Umbenennung selbst braucht Matthias' Entscheidung zwischen den drei Vorschlägen. Bis dahin
  wird vorbereitet, nicht umgestellt.
- Eine Domain zu registrieren ist eine Außenwirkung und eine Zahlung; das macht Matthias.
