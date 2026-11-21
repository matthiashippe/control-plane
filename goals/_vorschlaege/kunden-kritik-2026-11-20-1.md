Schwere: 2
Goal: kunden 05
Befund: Done-Punkt 2 verlangt einen neuen Test `test/credit-before-503.test.ts`, der eine Warnung LOW vor der Meldung empty verlangt, obwohl `test/watchdog-credit-kritik.test.ts` genau diese Folge schon prüft und die Deny List des Goals `ops/watchdog.sh` sperrt, der Test also keinen Fix tragen kann.
Beleg: `git show origin/dev:test/watchdog-credit-kritik.test.ts | grep -n "empty after LOW"` -> `112:  it("empty after LOW: two runs at 4 USD, three at 0 USD and one at 40 USD post one LOW, then one empty, then one OK", async () => {` | goals/kunden/05-warum-kunde-1-nach-unserer-402-nicht-auflaedt.md:60
Empfehlung: Den Test aus Done-Punkt 2 streichen und nur die lesende Messung in der Produktion (Abschnitt `## Vor der ersten 503`) behalten; das Progress Log nennt den bestehenden Fall in `test/watchdog-credit-kritik.test.ts:112`.

Ein Test, der schon vorhandenes Verhalten ein zweites Mal prüft, ist ein Prüfwerkzeug ohne Messauftrag (`LOOP.md:36`) und kostet einen Zyklus vor der Frage, die zählt: ob Kunde 1 wegen fehlender USDC oder wegen unserer 402 nicht auflädt.

Verworfen: kunden 05 ist DONE (PR #316), der Test ist gemergt; die offene Gegenprobe führt kunden-nacharbeit-2026-11-21-1 auf der Watch List (2026-11-21)
