# Loop Constraints

> Bindend für jeden Loop- und Goal-Lauf in diesem Repo. Der `loop-constraints`-Skill und der
> `/goal`-Skill lesen diese Datei zu Beginn jedes Laufs.

## Push und Merge
- Kein Push auf `main` ohne Ankündigung im Chat. Fertige, geprüfte Goals werden committet
  (Matthias' Commit-Freigabe gilt), Loop-Fixes gehen als Draft-PR.
- Nie Auto-Merge. Nie ein Issue oder einen PR schließen.

## Pfade
- Nie anfassen ohne Menschen: `.env*`, `secrets/**`, `deploy/**` (systemd, Caddy, Compose für die
  VM), `src/payments/**` und `src/auth/**` (nur innerhalb eines Goals, dessen GOAL.md sie nennt).
- Keine Änderungen an `harness/runtime/` (Upstream-Pin), außer die Pin-Revision selbst mit Begründung.

## Code
- Tests vor jedem Fix-Vorschlag laufen lassen (`pnpm test`, für E2E `pnpm e2e:smoke` / `pnpm e2e`).
- Nie Tests abschalten, skippen oder Assertions abschwächen, um grün zu werden.
- Ein Fix pro Lauf, kein Refactor nebenbei.
- Max 3 Versuche pro Item, dann eskalieren mit Kontext in STATE.md bzw. GOAL.md Blockers.
- Kein Facilitator-Code, der selbst settlet, außerhalb von `harness/` (Regulatorik: kein eigener
  x402-Facilitator im Betrieb).
- Credits sind nie auszahlbar, nie an Dritte übertragbar außer per `/v1/credits/transfer`
  innerhalb des Control Plane. Jede Auszahlbarkeit ist ein REJECT-Grund.

## Kommunikation
- Deutsch, Anti-Slop-Regeln aus `~/.claude/CLAUDE.md` (kein Gedankenstrich, echte Umlaute).
- Nur melden, wenn eine Entscheidung oder Aktion von Matthias gebraucht wird.

## Budget
- 80 % des Tagesbudgets erreicht: report-only.
- `loop-pause-all` in STATE.md: sofort beenden.
