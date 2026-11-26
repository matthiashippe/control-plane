Schwere: 1
Goal: regeln 02
Befund: Der Rückfall `?? "length"` in `deployArgumentFault` (`src/konto/chain.ts:124`) greift nie: Nach der genauen Längenprüfung in `:113` haben `canonical` und `args` beide 320 Hex-Ziffern, und wenn sie sich unterscheiden, unterscheidet sich mindestens eines der fünf Wörter, also findet `findIndex` immer einen Index ab 0.
Beleg: `git grep -n -E 'args.length - 2 !== 2 \* FORWARDER_ARGS_SIZE|const canonical = |const at = |FORWARDER_ARGS\[at\]\?\.name \?\? "length"' origin/dev -- src/konto/chain.ts` -> `:113: if (args.length - 2 !== 2 * FORWARDER_ARGS_SIZE) return "length";`, `:121: const canonical = encodeAbiParameters(...)`, `:123: const at = FORWARDER_ARGS.findIndex(...)`, `:124: return FORWARDER_ARGS[at]?.name ?? "length";` | src/konto/chain.ts:124
Empfehlung: `return FORWARDER_ARGS[at].name;` ohne Rückfall, damit der Zweig sichtbar an der Längenprüfung in `:113` hängt, beim nächsten Goal an `src/konto/chain.ts`.
MVP: Schönheit

Linse Q, Frage 3.
