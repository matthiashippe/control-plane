Schwere: 2
Goal: konto 04
Befund: Der QR-Code in `qr` zeichnet dunkle Module als Block und ist damit für ein helles Terminal gebaut; in einem dunklen Terminal (Standard von Claude Code) erscheint er invertiert, und der Test liest ihn mit jsQR, das per Vorgabe beide Polaritäten versucht, also beweist er nicht, dass eine Handykamera ihn im dunklen Terminal liest.
Beleg: src/handoff/qr.ts:31 (`top && bottom ? "█"` für dunkle Module) | test/handoff-api.test.ts:31 (`jsQR(data, w, h)` ohne `inversionAttempts`)
Empfehlung: konto 04 entscheidet, wie das Terminal den Code zeigt (ANSI-Farben mit festem hellem Hintergrund oder Blöcke für helle Module samt Ruhezone für dunkle Terminals) und prüft den Rücklesetest mit `inversionAttempts: "dontInvert"` in genau der Darstellung, die das Terminal bekommt; `qr` in `POST /v1/handoff` wird dann daran angepasst.
