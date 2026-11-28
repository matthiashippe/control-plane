Schwere: 2
Goal: kunden 16
Befund: Zeile 13 des Red-Team-Vorschlags vom 27.11. nennt die beiden Uhrzeiten der Aufladungen des einen Sandbox-Kunden unmaskiert, obwohl Goal 16 und `docs/richtung/2026-11-26.md` dieselben Zeiten maskieren und `goals/kunden/ANNAHMEN.md` Zeile 10 Zeit und Tag einer Aufladung je Kunde aus dem öffentlichen Repo hält (Grundregel 8, `loop-constraints.md` Zeile 39 bis 40).
Beleg: `git show origin/dev:goals/_vorschlaege/kunden-redteam-2026-11-27-1.md | sed -n 13p | grep -oE '[0-9]{2}:[0-9]{2}' | wc -l` -> `2` | goals/_vorschlaege/kunden-redteam-2026-11-27-1.md:13
Empfehlung: Die Triage maskiert die beiden Zeiten in Zeile 13 als `**:**` wie in Goal 16 Zeile 8 und trägt die Stelle in `goals/RISIKEN.md` Zeile 10 unter „Es bleiben“ nach; `test/no-customer-revenue.test.ts` oder die Prüfung von Linse B erkennt künftig auch Uhrzeiten neben Aufladungen eines Kunden, auch in Vorschlägen des Red Teams.

## Fundstellen

Die Uhrzeiten stehen hier bewusst nicht, weil dieser Vorschlag im selben öffentlichen Repo liegt.

- `goals/_vorschlaege/kunden-redteam-2026-11-27-1.md` Zeile 13 (Abschnitt Fundstellen, Eintrag zu `docs/richtung/2026-11-26.md`): beide Uhrzeiten mit dem Tag der Aufladungen. Der Fehler stammt aus dem Red Team selbst, das die Beträge maskierte, die Zeiten aber nicht.
- Zum Vergleich maskiert: `goals/kunden/16-warum-der-erste-sandbox-kunde-nach-einem-tag-aufhoert.md` Zeile 8 und `docs/richtung/2026-11-26.md` Zeile 20 (je zweimal `**:**`).
- `goals/RISIKEN.md` Zeile 10 führt aus dem Vorschlag vom 27.11. nur Zeile 11, nicht Zeile 13.

## Warum die Wirkung klein ist

Beide Zeiten stehen schon in Commit `5aff3f1`, den `goals/RISIKEN.md` Zeile 10 führt, und die Entscheidung dort lässt die Historie stehen. Zeile 13 nennt keinen Betrag. Offen ist nur, dass der Arbeitsstand auf `dev` gegen die eigene Maskierung verstößt.

## Gegenprüfung

Ein frischer Subagent sollte den Befund widerlegen und bestätigte ihn: Das Repo ist öffentlich (`gh repo view matthiashippe/control-plane --json visibility` -> `PUBLIC`), die Zeiten sind dieselben, die `docs/richtung/2026-11-26.md` in einer früheren Fassung trug und später maskierte, und keine Annahme, kein Vorschlag und `goals/RISIKEN.md` führen Zeile 13.
