# GOAL.md

## Status
ACTIVE

## Active Objective
Go-to-Market: `cp.hippe.eu` hat eine öffentliche Startseite mit Anleitung und Live-Status, der
Dienst ist in den drei meistbetroffenen Conway-Issues sachlich als Workaround genannt und in
awesome-x402 gelistet. Messgröße bleibt: provisionierte Automatons (heute 1).

## Done Condition
- [ ] `pnpm test` grün, `test/public.test.ts` mit mindestens 5 Tests: `GET /` liefert HTML mit
      `cp.hippe.eu`, der Setup-Zeile (`conwayApiUrl`) und den Tiers; `GET /v1/status` liefert
      `{ ok, version, models[], topup_tiers_usd[], markup, phase, automatons }` ohne Auth und ohne
      personenbezogene Daten (keine Adressen, keine Key-Prefixe, keine Salden); `/` und
      `/v1/status` brauchen keinen API-Key; unbekannte Pfade bleiben 404 JSON
      Prüfung: `pnpm test` exit 0, `grep -c "it(" test/public.test.ts` >= 5
- [ ] Seite ist live und zeigt echte Werte
      Prüfung: `curl -s https://cp.hippe.eu/ | grep -c "conwayApiUrl"` >= 1 und
      `curl -s https://cp.hippe.eu/v1/status` enthält `"models"` mit mindestens zwei Einträgen
      und `"automatons"` als Zahl
- [ ] Drei Issue-Antworten sind gepostet, je eine in #339, #377 und #393, mit Link auf die Seite
      Prüfung: `gh api repos/Conway-Research/automaton/issues/339/comments --jq '[.[]|select(.user.login=="matthiashippe")]|length'` = 1, ebenso für 377 und 393
- [ ] awesome-x402: PR offen oder gemerged
      Prüfung: `gh pr list --repo xpaysh/awesome-x402 --author matthiashippe --state all` zeigt den PR
- [ ] Offline-Läufe bleiben grün
      Prüfung: `pnpm e2e` enthält `E2E OK`
- [ ] goal-verifier PASS

## Acceptance Criteria
- [ ] Startseite: statisches HTML aus `src/public/index.html`, vom Control Plane ausgeliefert,
      ohne externe Skripte, Schriften oder Tracker; Inhalt englisch, sachlich, ohne Werbevokabular;
      Status-Werte per `fetch("/v1/status")` nachgeladen, Seite bleibt ohne JavaScript lesbar
- [ ] Inhalt der Seite: was der Dienst ist, die eine Zeile in `~/.automaton/automaton.json`,
      Topup-Tiers, Aufschlag 1,3 auf den Einkaufspreis, was Phase 1 NICHT kann (keine Sandboxes,
      kein Social-Relay, keine Credit-Transfers, keine Auszahlung), wer ihn betreibt, Kontakt,
      Hinweis auf das Upstream-Issue-Problem
- [ ] `/v1/status` ist bewusst arm: Modelle mit Verkaufspreisen, Tiers, Markup, Phase, Version,
      Anzahl registrierter Automatons. Keine Wallet-Adressen, keine Salden, keine Key-Prefixe
- [ ] Issue-Antworten: je Issue ein Kommentar, der zuerst den Befund bestätigt (eigene Probe
      18.09.2026: `/v1/auth/verify` -> 401), dann den Workaround in zwei Zeilen nennt, offenlegt
      dass ich den Dienst betreibe und er Geld kostet, und keine Kritik an den Maintainern enthält.
      In #393 zusätzlich: unser `/pay` ist idempotent über die Authorization-Nonce
- [ ] awesome-x402: Eintrag in der passenden Kategorie (Facilitators/Infrastructure), eine Zeile,
      Repo-Konventionen aus CONTRIBUTING eingehalten
- [ ] Keine Massenaktion: höchstens drei Issues, kein Kommentar in Issues ohne Bezug, keine
      Wiederholung in weiteren Threads

## Deny List
- Keine Kommentare in mehr als drei fremden Issues, kein Anschreiben einzelner Nutzer
- Keine Behauptung über Conway oder dessen Betreiber, die nicht belegt ist
- Keine Preis- oder Verfügbarkeitszusage, die der Dienst nicht hält (kein SLA, kein Support-Versprechen)
- Keine private Wohnanschrift auf der Seite ohne ausdrückliche Freigabe
- Kein Deploy von ungeprüftem Stand: erst Tests, dann `deploy/up.sh`

## Budget
- max Zyklen: 8
- max Versuche pro Gap: 3

## Progress Log

## Blockers
