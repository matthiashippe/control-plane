# Die Terminal-Tools (konto 04)

Wer in Claude Code arbeitet und keine Wallet hat, startet einen Automaton aus dem Terminal: Das Plugin bringt `mcp/server.mjs`
und den Skill `mcp/skills/automaton/SKILL.md` mit, der Mensch scannt einen QR-Code, tippt auf dem Handy eine Zahl und bestätigt mit
seinem Passkey, und danach denkt sein Automaton in einer Sandbox, bezahlt aus seinem Konto. Auf der Maschine des Nutzers liegt nur
der API-Schlüssel, nie ein Wallet-Schlüssel. Grundlage sind der Handoff aus `docs/konto/handoff.md`, das Konto aus
`docs/konto/konto.md` und die Automatons aus `docs/sandbox/automaton.md`. Entscheidungen mit Grund: `goals/konto/ANNAHMEN.md`,
Abschnitt `## Goal 04`.

## Tools

Fünf Tools neben den sechs Tools des Marktes. Beträge gibt der Mensch in Dollar als Text mit höchstens zwei Nachkommastellen an
(`"5.00"`); `5.001`, `-1`, `abc`, `0` oder eine Zahl statt Text ergeben `invalid_arguments` ohne Aufruf. Auf der Leitung stehen
atomare USDC (6 Nachkommastellen) als Text.

| Tool | Argumente | Was passiert |
|---|---|---|
| `start_automaton` | `genesis_prompt`, `name` (1 bis 32 Buchstaben, Ziffern, Leerzeichen, `_` oder `-`, vorn Buchstabe oder Ziffer), `daily_limit_usd` | Ohne Schlüssel: `POST /v1/handoff` mit `step: "konto"`, Name und Tageslimit, ohne `amount_usdc`; die Antwort kommt sofort mit `qr`, `url`, `match` und `expires_at` und nie mit `poll_token`. Den Strom `GET /v1/handoff/{code}` hält der MCP-Server im Hintergrund offen. Nach `done` liegt der Schlüssel in `CP_KEY_FILE`, dann `POST /v1/automatons`. Mit Schlüssel startet es sofort, ohne Handoff. |
| `automaton_status` | `id` (optional) | `waiting_for_phone`, `matched`, `starting`, `running`, `stopped` oder `failed` mit `reason` und Klartext; nach einer Erhöhung zusätzlich `daily_limit_change`. |
| `automaton_logs` | `id` (optional) | die letzten Zeilen aus `GET /v1/automatons/{id}/logs`, Schlüssel und 64-stellige Hex-Folgen geschwärzt |
| `set_daily_limit` | `daily_limit_usd` | liest `GET /v1/konto/limit`; `raiseNeedsPhone` entscheidet: niedriger oder gleich genau ein `POST /v1/konto/limit`, höher ein `POST /v1/handoff` mit `step: "limit"` ohne `automaton_name` und null Aufrufe an `/v1/konto/limit`; bei der Erhöhung steht auf dem Handy der Name des Kontos, nie ein Name aus dem Terminal |
| `stop_automaton` | `id` (optional) | `POST /v1/automatons/{id}/stop` |

Ohne `id` meinen die Tools den Automaton, den dieser Server gestartet hat, sonst den neuesten des Kontos. Bei `burned` oder
`expired` zeigt `automaton_status` den Grund, und der nächste `start_automaton` legt einen neuen Handoff an; den alten Code
wiederholt er nie. Antwortet der Start nach `done` mit 402, weil das Nachbuchen aus konto 03 im Hintergrund läuft, liest das Tool
den Kontostand und versucht es höchstens 90 Sekunden lang erneut, danach `failed` mit Klartext. Die erste Zahlung, die die Seite
zeigt, setzt der Server: das Minimum aus `CP_KONTO_TOPUP_USDC` und Tageslimit, ein anderer Wert für `amount_usdc` ergibt 400.

## Tageslimit

Das Tageslimit ist die `allowance` der Erlaubnis, die der Mensch auf dem Handy unterschrieben hat. Mit dem API-Schlüssel allein
geht es nur nach unten, weil eine Prompt-Injection im Terminal höchstens den Schlüssel hat:

- `GET /v1/konto/limit` mit Schlüssel: `account`, `daily_limit_usdc` (was heute gilt) und `signed_limit_usdc` (was unterschrieben
  ist).
- `POST /v1/konto/limit` mit Schlüssel und `daily_limit_usdc`: speichert eine Obergrenze je Konto (`konto_accounts.cap_usdc`).
  `topUpIfLow` bucht danach höchstens Obergrenze minus schon Abgebuchtes der laufenden Periode. Ein Wert über
  `signed_limit_usdc` ergibt 403 mit `error: "limit_raise_needs_phone"` und ändert nichts, auch keinen Aufruf an die Chain. Die
  Entscheidung trifft `isLowering` in `src/konto/limit.ts`.
- Erhöhen: `POST /v1/handoff` mit `step: "limit"`, dem Schlüssel und dem neuen `daily_limit_usdc` (größer als
  `signed_limit_usdc`, sonst 400; ohne Schlüssel 401). Die Seite zeigt erst die Zahlen mit heutigem und neuem Limit
  (`limit-approve`), nach der richtigen Zahl `limit-passkey`: Der Mensch unterschreibt mit seinem vorhandenen Passkey eine neue
  Erlaubnis mit neuem `salt` (ein Passkey-Dialog, ein Stempel per WebAuthn an Turnkey, kein neues Konto). `POST /h/{code}/limit`
  prüft sie mit `permissionMatches` und `signatureValid` gegen das Konto des Schlüssels und das neue Limit. Passt sie, wird der
  Handoff `done`, das Ereignis trägt `daily_limit_usdc` und nie `api_key`, und die Obergrenze fällt weg; passt sie nicht, 400 und
  `burned`, die alte Erlaubnis gilt weiter.
- Die neue Erlaubnis wartet in `konto_accounts.next_permission`. Vor der nächsten Abbuchung sendet `topUpIfLow` über
  `sendKontoTx` erst `approveWithSignature` für die neue, dann `revokeAsSpender` für die alte und bucht erst danach mit `spend()`
  aus der neuen ab. So gelten on-chain nie zwei unserer Erlaubnisse länger als diese zwei Transaktionen, und ein `spend()` aus der
  alten scheitert ab dem Widerruf.
- Eine Erhöhung setzt die Periode nicht zurück. Die neue Erlaubnis hat ein eigenes `start` und damit eine frische Periode, darum
  hält `topUpIfLow` nach dem Widerruf fest, was die alte in ihrer laufenden Periode abgebucht hat (`carry_usdc`), und bis diese
  Periode endet (`carry_until`, `periodEnd` in `src/konto/topup.ts`) zählt es gegen das neue Limit. Nach einer Erhöhung von 5 auf
  10, bei der die alte schon 4 abgebucht hat, bucht der Server am selben Tag also höchstens 6 aus der neuen ab, danach gilt die
  Periode der neuen allein.
- Scheitert beim Wechsel die Freischaltung oder der Widerruf (Quittung `reverted`, Fehler beim Senden, Abbruch beim Warten auf
  die Quittung), endet der Lauf ohne `spend()` mit `approve_failed` oder `revoke_failed`. Der nächste Lauf findet die neue
  Erlaubnis schon freigeschaltet (`isApproved`) und schickt kein zweites `approveWithSignature`, widerruft die alte erneut und
  bucht erst danach ab. Ein zweiter `revokeAsSpender` geht auch durch, wenn der erste doch angekommen war, weil der Vertrag bei
  einer schon widerrufenen Erlaubnis ohne Revert zurückkehrt.
- Im MCP-Server entscheidet `raiseNeedsPhone`, ob `set_daily_limit` den Handoff braucht. Der Server lehnt jede Erhöhung ohne
  Handoff trotzdem ab; das Tool ist Bequemlichkeit, nicht die Sperre.
- Ohne `CP_KONTO_CHAIN_ID` antworten `step: "limit"`, `POST /h/{code}/limit` und `POST /v1/konto/limit` mit 503.

## Schlüssel

- Der API-Schlüssel aus dem ersten Ereignis `done` landet in der Datei aus `CP_KEY_FILE` (Vorgabe
  `~/.config/control-plane/api-key`), angelegt mit Modus 0600, ihr Ordner mit 0700.
- Eine vorhandene Datei mit Rechten für Gruppe oder andere (etwa 0644) liest der Server nicht und meldet `key_file_mode` mit dem
  Hinweis auf `chmod 600`.
- `CP_API_KEY` geht vor der Datei. Liegt schon ein Schlüssel vor, startet `start_automaton` ohne neuen Handoff, und die sechs Tools
  des Marktes nutzen ihn ebenfalls.
- Der Schlüssel steht in keinem Tool-Ergebnis und keiner Zeile auf stderr (`redact`). `mcp/server.mjs` hat keinen
  Wallet-Schlüssel, keine Seed-Phrase und keine Unterschrift und importiert nur Module aus `node:`.

## Plugin

- Katalog `.claude-plugin/marketplace.json` an der Wurzel des Repos (Name `postyourprice`), Eintrag `automaton` mit `source`
  `./mcp`.
- `mcp/.claude-plugin/plugin.json` mit `mcpServers` inline: `node ${CLAUDE_PLUGIN_ROOT}/server.mjs`, `CP_URL` auf
  `https://postyourprice.com`, kein Schlüssel.
- Skill `mcp/skills/automaton/SKILL.md`: zeigt `qr` unverändert in einem Codeblock, dazu `url` und `match`, und fragt dann
  `automaton_status`, bis `running` oder `failed` dasteht.
- Installation in einer Zeile: `claude plugin marketplace add matthiashippe/control-plane && claude plugin install automaton@postyourprice`.

## Für konto 05

konto 05 hängt Einzahlung per Karte und Auszahlung als weitere Tools in denselben Server und schaltet das Konto im Hauptnetz an.
Fest steht für diesen Bau:

- Jedes neue Tool kommt in `AUTOMATON_TOOLS` von `mcp/server.mjs`, nimmt Beträge als Text in Dollar mit `parseUsd` und
  antwortet mit JSON in `content[0].text`; ein Fehler trägt `isError` und `error`.
- Was Geld bewegt oder ein Limit erhöht, geht über einen Handoff mit eigenem `step`, nie über den API-Schlüssel allein. Die
  Antwort kommt sofort mit `qr`, `url` und `match`, der Strom läuft im Hintergrund, das Ergebnis zeigt `automaton_status`.
- Der Schlüssel bleibt in `CP_KEY_FILE` mit 0600, kein Tool gibt ihn aus.
- Auf dem Server bleibt `sendKontoTx` der einzige Weg zu senden; im Hauptnetz braucht es eine neue Prüfung der chainId statt
  `requireSepolia`.
- Der Lauf `harness/e2e/terminal.mjs` in `harness/e2e/full.sh` ist der Maßstab: Er muss nach konto 05 mit denselben Schritten grün
  bleiben.
