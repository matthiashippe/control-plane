# Loop Budget: control-plane

## Tageslimits

| Loop / Goal | Max Läufe/Tag | Max Tokens/Tag | Max Subagents/Lauf |
|---|---|---|---|
| Goal-Zyklen (Build) | 8 Zyklen je Goal | 2M | 1 Verifier (Sonnet) je Zyklus, Maker Opus bei Fable |
| Daily Triage | 2 | 100k | 0 (L1) |
| Ops-Triage | 2 (später 12) | 100k | 0 (L1) |
| PR Babysitter | 30 | 500k | 2 (L2) |

## Bei Überschreitung

1. Scheduler pausieren.
2. Zeile in `loop-run-log.md`.
3. Zeile in STATE.md High Priority mit `⚠️ budget`.

## Kill Switch

`loop-pause-all` als eigene Zeile in STATE.md, Abschnitt High Priority. Wieder aufnehmen erst
nach manuellem Entfernen der Zeile.
