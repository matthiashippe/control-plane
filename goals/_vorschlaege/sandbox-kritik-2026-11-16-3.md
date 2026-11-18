Schwere: 2
Goal: sandbox 10
Befund: Der Stempel deckt nur `dist/`, aber `dist/conway/client.js` und `dist/agent/tools.js` laden `viem` und `ulid` aus `node_modules/`, das in der Runtime ebenfalls von Git ignoriert ist; ein verändertes oder veraltetes `node_modules/` im Cache läuft weiter als Runtime am Pin durch, und `pnpm install --frozen-lockfile` läuft nur beim Neubau.
Beleg: `grep -ohE "from ['\"][^./][^'\"]*['\"]" dist/conway/client.js dist/agent/tools.js` im Cache ergibt `viem` und `ulid`; `git check-ignore -v node_modules` im Cache ergibt `.gitignore:1:node_modules` | ops/runtime-sandbox.sh `runtime_state`, `dist_sum`
Empfehlung: Den Stempel um eine zweite Summe über die Pakete erweitern, die `dist/` tatsächlich lädt (etwa `node_modules/.pnpm/lock.yaml` gegen `pnpm-lock.yaml`, oder `dist_sum` auf `node_modules/.modules.yaml` plus die aufgelösten Paketverzeichnisse), mit eigenem Zustand und Selbsttest-Fall `deps-changed`; Neubau dann auch bei abweichender Paketsumme.
MVP: Funktion

Kritik Tech Lead am Goal-Topic sandbox 10 (PRO-23101), 16.11.2026. Bewusst nicht als Done-Punkt in sandbox 10, weil die Wahl der Summe über `node_modules/` (Größe, pnpm-Store mit Symlinks) eine eigene Entscheidung braucht und das Goal sonst über sein Budget läuft.
Übernommen: ROADMAP.md, Glied hosting 06 (2026-11-18)
