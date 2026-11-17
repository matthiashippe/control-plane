Schwere: 2
Goal: konto 06
Befund: `docs/konto/terminal.md` nennt beim Tool `set_daily_limit` noch das optionale Argument `name`, das es seit konto 06 nicht mehr gibt; das Schema in `mcp/server.mjs` hat `additionalProperties: false`, wer der Doku folgt, bekommt einen Schemafehler.
Beleg: `git grep -n "set_daily_limit" -- docs/konto/terminal.md` -> `docs/konto/terminal.md:21:| \`set_daily_limit\` | \`daily_limit_usd\`, \`name\` (optional) | …`
Empfehlung: Im nächsten Goal der Kette konto die Zeile auf `daily_limit_usd` kürzen und ergänzen, dass die Erhöhung auf dem Handy den Namen des Kontos zeigt; Pfad `docs/konto/terminal.md` in dessen Pfadprüfung aufnehmen.
