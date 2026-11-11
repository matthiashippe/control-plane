# Kanal: neue Conway-Issues mit Anmelde- oder Zahlungsfehlern

Stand 2026-11-10, 21:30 UTC, nur lesend erhoben. Der letzte Eintrag in `ops/posted-answers.log` ist 2026-11-10T14:06:24Z (#443).
Seitdem ist kein Issue neu eröffnet worden und keins mit Anmelde- oder Zahlungsfehler hat einen neuen Kommentar bekommen (das neueste,
#446, ist von 05:40 UTC und beschreibt keinen Fehler). Die Liste nennt deshalb jedes offene Issue mit Anmelde- oder Zahlungsfehler, in
dem unser Konto noch nicht geantwortet hat: Das sind die Issues, die für den Kanal neu sind. Issues mit unserer Antwort bekommen keinen
zweiten Kommentar und stehen nicht in der Tabelle (#293, #294, #333, #335, #339, #353, #355, #356, #359, #372, #373, #376, #377, #379,
#385, #390, #392, #393, #419, #432, #435, #440, #442, #443).

Befehle, aus denen die Liste stammt:

```
gh issue list -R Conway-Research/automaton --state open --limit 60 --json number,title,createdAt,updatedAt,comments \
  --jq '.[] | "\(.number)\t\(.createdAt)\t\(.updatedAt)\t\(.comments|length)\t\(.title)"'
for n in <Nummern>; do gh api "repos/Conway-Research/automaton/issues/$n/comments" \
  --jq '[.[] | "\(.user.login)@\(.created_at)"] | join(" ")'; done
gh api "repos/Conway-Research/automaton/issues/<n>" --jq '.title, .body'
bash ops/conway-zustand.sh    # 2026-11-10T21:31:36Z: verify: 500 {"error":"Database error"} mit frischer Wegwerf-Wallet
```

| Issue | Titel | Art des Fehlers | eröffnet | Antwort |
|---|---|---|---|---|
| #434 | SIWE verification failed: 401 | SIWE: verify antwortet 500, der Retry mit demselben Nonce zeigt 401 | 2026-10-21 | ja, `antworten/434.md` |
| #430 | Auto-provision failed | Provisionierung: verify 500 `Database error` im Setup | 2026-10-19 | ja, `antworten/430.md` |
| #427 | x402 auto-topup paid 10 USDC on-chain but credits never granted | x402-Topup bezahlt, Gutschrift 500, Topup-Schleife ohne Konto | 2026-10-13 | ja, `antworten/427.md` |
| #406 | --provision fails immediately with "Invalid or expired nonce" even with a fresh nonce | SIWE: 401 Nonce nach 22 ms | 2026-09-24 | später: höchstens drei am Tag, gleiche Ursache wie #434 |
| #408 | API outage: /v1/auth/verify returns 500 Database error ... + x402 top-up paid on-chain but never credited | 500 der Conway-API, Topup ohne Gutschrift | 2026-09-27 | später: höchstens drei am Tag, gleicher Fall wie #427 |
| #426 | singin issue | SIWE: „Failed to get nonce“ | 2026-10-12 | später: zu wenig Angaben, der Nonce-Schritt geht in unserer Messung durch |
| #322 | funds lost | Guthaben: Wallet nach Neustart ersetzt, kein Fehler der Conway-API | 2026-05-03 | nein: die Antwort hängt an seiner Maschine, nicht an der API; das Issue nennt eine Wallet-Adresse |

Warum diese drei: #434 hat die Ursache selbst gemessen und bekommt die Bestätigung aus dem Code am Pin `d8f8168`
(`src/conway/http-client.ts`, `src/types.ts`); #430 ist der kürzeste Bericht und der häufigste Fall; #427 verliert ohne Antwort weiter
Geld, weil die Runtime ohne Konto bei jedem Start, im Heartbeat und in der Schleife nachkauft (`src/index.ts`,
`src/heartbeat/tasks.ts`, `src/agent/loop.ts`).
