Schwere: 2
Goal: wache 04
Befund: `cardRedirect` nimmt die Sunset-Angabe mit Vorgabe `{ intakeClosed: false }` und `DigistoreDeps.intakeClosed` ist optional, also öffnet ein neuer Aufrufer, der sie vergisst, die Kasse per Karte bei Sunset still, genau die Lücke, die wache 04 mit einer Regel schließen wollte.
Beleg: `grep -n 'intakeClosed: false }' src/payments/card-way.ts` -> 144:  opts: { intakeClosed: boolean } = { intakeClosed: false }, | src/payments/digistore.ts:80 `intakeClosed?: () => boolean;`
Empfehlung: In einem Glied, das `src/payments/**` und die Tests der IPN (`test/digistore*.test.ts`) nennt, beide Angaben zur Pflicht machen; `cardRedirect` hat heute nur den Aufrufer `src/app.ts:1882`, die IPN nur `digistoreDeps` in `createApp`. Ein Test, der `cardRedirect` ohne die Angabe aufruft, soll dann am Typ scheitern (`tsc` in `check`).
