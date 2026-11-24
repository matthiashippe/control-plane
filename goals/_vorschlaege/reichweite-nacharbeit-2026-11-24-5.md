Schwere: 1
Goal: reichweite 03
Befund: `ops/video-record.sh` kommt mit reichweite 03 neu mit 646 Zeilen, und keine Commit-Message des Goal-Branches begründet die Größe über 500 Zeilen.
Beleg: `git show b2f58e7:ops/video-record.sh | wc -l` -> `646`; `git log --format=%B b2f58e7^1..b2f58e7^2 | grep -c 500` -> `0` | ops/video-record.sh:646
Empfehlung: Mit der Auslagerung der Kopie aus `ops/automaton-live.sh` (reichweite-nacharbeit-2026-11-24-2) fällt die Datei unter 500 Zeilen; sonst die Größe in einer Commit-Message begründen.

Linse Q, Frage 6. Hinweis: karte-nacharbeit-2026-11-23-3 wurde mit „Größe ohne Fehlerbild“ verworfen; Linse Q meldet jeden Befund, die Triage entscheidet.
Verworfen: Größe einer Datei ohne Fehlerbild, fällt mit der Auslagerung aus reichweite-nacharbeit-2026-11-24-2 weg (24.11.2026)
