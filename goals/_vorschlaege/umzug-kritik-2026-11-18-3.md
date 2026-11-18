Schwere: 4
Goal: umzug 04
Befund: `test/site-dns-selftest.test.ts` legt je Lauf mit `mkdtempSync` ein leeres `HOME` unter dem Temp-Verzeichnis an und räumt es nie weg; jeder `check` lokal und in CI hinterlässt ein Verzeichnis `site-dns-*`.
Beleg: `grep -n 'mkdtempSync\|rmSync' test/site-dns-selftest.test.ts` -> nur `mkdtempSync`, kein `rmSync`.
Empfehlung: Das Verzeichnis nach `close` mit `rmSync(dir, { recursive: true, force: true })` löschen; der Fall bleibt sonst gleich.
