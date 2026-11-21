Schwere: 2
Goal: kunden 05
Befund: Der Parameter `extraEnv` von `sandbox()` und `series()` in `test/credit-before-503.test.ts` bekommt nie einen Wert, und die Gegenprobe „rot bei Schwelle 0 (`CP_CREDIT_WARN_USD=0`)“, die `docs/kunden/aufladung-2026-11.md` dem Test zuschreibt, fehlt als Testfall.
Beleg: `git grep -n -E 'extraEnv|series\(' origin/dev -- test/credit-before-503.test.ts` -> Deklaration :26 und :74, Weitergabe :59 und :75, einziger Aufruf `series()` ohne Argument :87 | test/credit-before-503.test.ts:87
Empfehlung: Den Fall `series({ CP_CREDIT_WARN_USD: "0", CP_CREDIT_WARN_DAYS: "0" })` als zweites `it` ergänzen oder Parameter und Satz im Dokument streichen.

Linse Q, Fragen 1 und 3.

Übernommen: Watch List in `STATE.md`, fehlende Gegenprobe bei Schwelle 0 in `test/credit-before-503.test.ts` (2026-11-21)
