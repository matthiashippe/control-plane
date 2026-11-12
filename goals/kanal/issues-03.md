# Kanal: zweite Runde, neue Conway-Issues mit Anmelde- oder Zahlungsfehlern

Stand 2026-11-12, 17:20 UTC, nur lesend erhoben. Der letzte Eintrag in `ops/posted-answers.log` ist 2026-11-11T07:07:57Z (#427).
Seitdem ist kein Issue neu eröffnet worden; das neueste mit Anmelde- oder Zahlungsfehler ist #447 (2026-11-10T23:53Z, ohne Kommentar).
Neu heißt wie in kanal 01 (`goals/kanal/ANNAHMEN.md`, 2026-11-10): offen, Anmelde- oder Zahlungsfehler, ohne Kommentar unseres Kontos.
Issues mit unserer Antwort bekommen keinen zweiten Kommentar und stehen nicht in der Tabelle (#293, #294, #333, #335, #339, #353, #355,
#356, #359, #372, #373, #376, #377, #379, #385, #390, #392, #393, #419, #427, #430, #432, #434, #435, #440, #442, #443).

Befehle, aus denen die Liste stammt:

```
gh issue list -R Conway-Research/automaton --state open --limit 80 --json number,title,createdAt,updatedAt,comments \
  --jq '.[] | "\(.number)\t\(.createdAt)\t\(.updatedAt)\t\(.comments|length)\t\(.title)"'
for n in 447 406 408 426; do gh api "repos/Conway-Research/automaton/issues/$n/comments" \
  --jq '[.[] | "\(.user.login)@\(.created_at)"] | join(" ")'; done
gh api "repos/Conway-Research/automaton/issues/<n>" --jq '.title, .body'
bash ops/conway-zustand.sh    # 2026-11-12T17:21:00Z: verify: 500 {"error":"Database error"} mit frischer Wegwerf-Wallet
```

| Issue | Titel | Art des Fehlers | eröffnet | Antwort |
|---|---|---|---|---|
| #447 | Provision: /v1/auth/verify returns 500 Database error | SIWE: verify 500 `Database error`, der Retry mit demselben Nonce zeigt 401 | 2026-11-10 | ja, `antworten-03/447.md` |
| #406 | --provision fails immediately with "Invalid or expired nonce" even with a fresh nonce | SIWE: 401 Nonce nach 22 ms, die Wiederholungen stecken im HTTP-Client | 2026-09-24 | ja, `antworten-03/406.md` |
| #408 | API outage: /v1/auth/verify returns 500 Database error ... + x402 top-up paid on-chain but never credited | 500 der Conway-API, Topup bezahlt ohne Gutschrift | 2026-09-27 | ja, `antworten-03/408.md` |
| #426 | singin issue | SIWE: „Failed to get nonce“ | 2026-10-12 | nein: zu wenig Angaben, der Nonce-Schritt geht in unserer Messung durch |

Warum diese drei: #447 ist der jüngste Bericht und hat die Ursache selbst beschrieben, die Antwort belegt sie im Code am Pin `d8f8168`
(`src/identity/provision.ts`, `src/conway/http-client.ts`, `src/types.ts`). #406 hat zwei weitere Betroffene in den Kommentaren und
glaubt an genau einen Versuch; die Antwort zeigt, dass `ResilientHttpClient.request()` die Wiederholungen intern macht. #408 hat drei
Betroffene, zwei davon mit bezahltem Topup ohne Gutschrift; die Antwort nennt, wie die Topup-Schleife der Runtime weiteres Geld kostet
(`src/heartbeat/tasks.ts`, `src/index.ts`, `src/agent/loop.ts`).
