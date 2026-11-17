Schwere: 2
Goal: konto 08
Befund: `test/soll-fonts.test.ts` („is wired into every SOLL renderer“) sucht die Zeile `env: { ...process.env, FONTCONFIG_FILE: fonts }` im Text von vier SOLL-Werkzeugen; seit konto 08 steht die Verdrahtung in `ops/browser.mjs`, und in den Werkzeugen erfüllt nur noch ein Kommentar den Test.
Beleg: `grep -n 'FONTCONFIG_FILE: fonts' ops/soll.mjs ops/browser.mjs` -> je eine Zeile, in `ops/soll.mjs` ein Kommentar | test/soll-fonts.test.ts:24
Empfehlung: Den Fall auf `ops/browser.mjs` umstellen (die Zeile dort) und je SOLL-Werkzeug `launch(chrome, …, "picture")` verlangen, danach die Kommentarzeilen in den fünf Werkzeugen streichen; der Verhaltensbeweis steht schon in `test/browser.test.ts`.
