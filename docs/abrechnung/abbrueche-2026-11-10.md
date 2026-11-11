# Berechnete Abbrüche vom 10.11.2026

Am 10.11.2026 brach ein fremder Automaton fünf Anfragen an `/v1/chat/completions` vor der fertigen Antwort ab (Caddy loggt Status 0),
und jede wurde trotzdem berechnet. Drei davon liefen in seinen Timeout von 60 Sekunden, zwei brach er früher ab. Gemessen am 10.11.2026
um 23:30 UTC, nur lesend, vom code-host aus. Die interne Gutschrift aus abrechnung 01 (`src/credits/aborted.ts`) gibt genau diese
Summe zurück, und `ops/live.sh` erwartet sie als `REFUND_MC`.

| Ende (UTC) | Dauer im Caddy-Log | Betrag | Generation-ID |
|---|---:|---:|---|
| 2026-11-10 05:16:27 | 22,8 s | 8883 mc | `gen-1794287765-SupdXvMT0JLDL224yBtY` |
| 2026-11-10 05:18:17 | 18,5 s | 8702 mc | `gen-1794287878-doiF42ITx3lfTwxRWfqU` |
| 2026-11-10 05:25:58 | 59,9 s | 19040 mc | `gen-1794288298-yWUHf9MpFBbR93vpJ7ET` |
| 2026-11-10 05:36:46 | 59,9 s | 21605 mc | `gen-1794288946-oKnNy3iW6PaglDoYV2tH` |
| 2026-11-10 05:37:53 | 59,9 s | 20999 mc | `gen-1794289014-dNsPPbkW0sMRJPZnCbiA` |

**Summe:** 79229 mc, also 0,79229 USD (100000 mc = 1 USD), gerundet 0,79 USD. Die 0,37 USD aus dem ersten Beleg nahmen nur drei Fälle an
und lassen sich gegen die Produktion nicht bestätigen.

## Befehle

Beide lesen nur und geben weder Adresse noch Wallet noch Guthaben aus. Zuerst die Variablen:

```
set -a; . ~/.config/control-plane/loop.env; set +a
```

Die Abbrüche im Caddy-Zugriffslog, alle Dateien samt der gedrehten:

```
bash ops/access-log.sh \
  | jq -c 'select(.status == 0 and .request.method == "POST" and (.request.uri | test("^/v1/chat/completions")))
           | {end: (.ts | strftime("%Y-%m-%dT%H:%M:%SZ")), duration: (.duration * 10 | round / 10)}' \
  | grep '"2026-11-10'
```

Die Beträge aus dem Ledger, Datenbank mit `readonly: true` im Container. Die Liste der `ref` steht in der Gutschrift selbst, der Betrag
ist die Abbuchung mit umgekehrtem Vorzeichen:

```
cat > q.js <<'JS'
const db = require("better-sqlite3")("/data/cp.db", { readonly: true });
const refs = (db.prepare("SELECT json_extract(meta, '$.refs') AS r FROM ledger WHERE kind = 'refund' AND ref = ?").get(process.argv[2]) || {}).r;
const list = refs ? JSON.parse(refs) : process.argv.slice(3);
for (const r of db.prepare(`SELECT created_at, ref, -delta_mc AS charged_mc FROM ledger WHERE kind = 'inference' AND ref IN (${list.map(() => "?").join(", ")}) ORDER BY created_at`).all(...list)) console.log(JSON.stringify(r));
JS
ssh -i "$CP_SSH_KEY" -o BatchMode=yes "$CP_HOST" "docker exec -i deploy-cp-1 node - refund:client-aborted-2026-11-10" < q.js
```

Steht die Gutschrift noch nicht im Ledger, nimmt das Skript die `ref` aus der Befehlszeile (`node - refund:none <ref> …`, die fünf aus der
Tabelle). Jede Buchung landete höchstens 8 Sekunden nach dem Ende im Caddy-Log; die Generation-ID beginnt mit der Startsekunde der Anfrage.

## Gegenprobe

Eine an eine Kopie des Logs angehängte Zeile mit Status 0 am 10.11.2026 hebt den Treffer von 5 auf 6, dieselbe Zeile mit Status 200 lässt
ihn bei 5. Mit einem unbekannten Schlüssel der Gutschrift und einer erfundenen `ref` gibt die Abfrage keine Zeile aus.
