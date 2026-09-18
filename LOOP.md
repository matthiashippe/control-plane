# LOOP.md: Loops rund um das Control Plane

Dieses Repo ist zugleich das Produkt (Conway-kompatibles Control Plane) und das Testfeld für
Loop-Engineering nach cobusgreyling/loop-engineering. Jede Arbeit läuft als Goal (bounded,
run-until-done, `/goal`) oder als Loop (Cadence, Triage, STATE.md). Maker und Verifier sind immer
getrennte Sessions oder Subagents.

## Goals (Build, run-until-done)

Aktives Goal: `GOAL.md` im Root. Abgeschlossene unter `goals/`. Skill: `/goal` (persönlich,
`~/.claude/skills/goal`). Verifier: Subagent Sonnet mit REJECT-Default, führt die Prüfbefehle aus
GOAL.md selbst aus. Reihenfolge der Slices steht in STATE.md.

## Loops (Cadence)

| Pattern | Cadence | Level | Befehl | Status |
|---|---|---|---|---|
| Daily Triage (Repo: CI, Issues, Upstream-Drift von Conway-Research/automaton) | 1d | L1 report-only | `/loop 1d Run $loop-triage, update STATE.md` | ab erstem Push |
| Ops-Triage (VM: /health, Ledger-Summen, Settlements, Provisionierungen) | 1d, später 2h | L1 report-only | `/loop 1d Run $loop-triage ops` | ab Deploy (Goal 5) |
| PR Babysitter | 15m bei offenen PRs | L2 assisted | `/loop 15m $pr-babysitter` | nach erster Triage-Woche |
| Dependency Sweeper (viem, siwe, hono, better-sqlite3: security-only) | 1d | L2 patch-only | Dependabot + Verifier | nach erster Triage-Woche |

## Human Gates

- Kein Auto-Merge auf `main`. Draft-PR, Matthias merged.
- Denylist in `loop-constraints.md`: `src/payments/**`, `src/auth/**`, `deploy/**`, Secrets.
- Alles mit Außenwirkung (GitHub-Kommentare in Fremd-Repos, Deploy, Wallet-Bewegungen) bleibt
  bei Matthias, auch auf L2.

## Worktrees

L2-Fixes laufen in `isolation: worktree`, ein Worktree pro Versuch, weg nach REJECT.

## Budget und Kill Switch

`loop-budget.md`. Kill Switch: Zeile `loop-pause-all` in STATE.md, Abschnitt High Priority.

## Run Log

`loop-run-log.md`, append-only, eine Zeile pro Lauf.
