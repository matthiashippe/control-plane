Schwere: 1
Goal: seite 03
Befund: seite 03 schreibt die Prüfung auf unbekannte Argumente viermal gleich in `ops/soll.mjs`, `ops/soll-handoff.mjs`, `ops/soll-konto.mjs` und `ops/soll-limit.mjs`, obwohl alle vier schon das gemeinsame Modul `ops/soll-assess.mjs` importieren.
Beleg: `git grep -n 'if (args\[i\] === "--source" || args\[i\] === "--pictures") { i++; continue; }' origin/dev -- ops` -> `ops/soll-handoff.mjs:28`, `ops/soll-konto.mjs:30`, `ops/soll-limit.mjs:30`, `ops/soll.mjs:27` | ops/soll.mjs:27
Empfehlung: Eine Funktion für Argumente (bekannte Flags, Werte nach `--source` und `--pictures`, Abbruch mit `unknown argument: <arg>`) nach `ops/soll-assess.mjs` legen und aus den vier Werkzeugen rufen; `test/soll-flags.test.ts` bleibt unverändert und belegt, dass das Verhalten gleich bleibt.
MVP: Schönheit

Linse Q, Frage 2 (Logik-Duplikate), Merge 802b9d3. Verwandt, aber eigener Befund: der kopierte Browser-Treiber (konto-nacharbeit-2026-11-17-3).
Verworfen: MVP: Schönheit ohne belegten Fehler, und der Kurs-Check vom 17.11. (PRO-23529) sieht den Detail-Anteil über der Schwelle; `test/soll-flags.test.ts` hält das Verhalten fest (2026-11-17)
