Schwere: 2
Goal: konto 05
Befund: `ops/konto/sepolia-payout-run.mjs` kopiert `secret`, `portFree`, `follow` und `until` ein drittes Mal, Zeichen für Zeichen gleich mit `ops/konto/sepolia-run.mjs` und `ops/konto/sepolia-limit-run.mjs`.
Beleg: `git grep -n -E '^(async )?function (secret|portFree|follow|until)\(' origin/dev -- ops/konto/sepolia-run.mjs ops/konto/sepolia-limit-run.mjs ops/konto/sepolia-payout-run.mjs | wc -l` -> `12` (je Funktion drei Kopien mit gleichem md5) | ops/konto/sepolia-payout-run.mjs:55, ops/konto/sepolia-payout-run.mjs:63, ops/konto/sepolia-payout-run.mjs:71, ops/konto/sepolia-payout-run.mjs:93
Empfehlung: Die vier Helfer in ein Modul `ops/konto/run-helpers.mjs` legen, das die drei Sepolia-Läufe importieren, so wie konto 08 den Browser-Treiber nach `ops/browser.mjs` gezogen hat.
MVP: Schönheit
