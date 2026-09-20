/**
 * Welche Behauptung in einer Einreichung steht nicht im Briefing?
 *
 * Der Auftragsmarkt, auf den dieser Dienst zulaeuft, lebt davon, dass ein Auftraggeber die Arbeit
 * bewerten kann, ohne Fachmann zu sein. Geschmack kann er nicht bewerten, erfundene Tatsachen
 * schon, und die sind das Risiko: Im Testlauf vom 20.09.2026 schrieb ein Agent "Viewings available
 * on short notice" in ein Dubai-Expose, eine Zusage, die im Briefing nicht steht und fuer die der
 * Verkaeufer haftet.
 *
 * Die Kommandozeilenfassung samt Messreihe liegt in `ops/erfindungspruefung.py`, die Probe mit
 * bekannter Wahrheit in `ops/proben/dubai-fakten.json`. Gemessen am 20.09.2026: auf ein faktisches
 * Briefing drei von drei gepflanzten Fehlern gefunden, kein Fehlalarm; auf Werbetext 23 Befunde
 * auf neun Einreichungen, weshalb es dort die zweite Betriebsart gibt.
 *
 * Dieses Modul enthaelt bewusst nur Text und reine Logik. Der Modellaufruf laeuft ueber
 * `handleChat`, damit Abrechnung, Reservierung, Zusammenlegung und Marge dieselben sind wie bei
 * jeder anderen Inferenz.
 */

/** Was der Auftraggeber bestellt hat. Faktisch sperrt, schoepferisch fragt zurueck. */
export type CheckMode = "factual" | "creative";

export interface Finding {
  /** Woertliches Zitat aus der Einreichung. Der Anker, an dem der Finding ueberprueft wird. */
  quote: string;
  kind: "miscalculation" | "contradiction" | "unsupported";
  reason: string;
}

const SHARED_RULES = `Rules you must follow exactly:
- Every finding MUST include "quote": the exact substring from the SUBMISSION, copied character for
  character, long enough to locate but no longer than one sentence. Never paraphrase it. Never
  quote from the briefing in this field.
- If there is nothing to report, return an empty list. That is a valid and common answer. Do not
  invent findings to appear thorough.

Answer with JSON only, no prose, in this shape:
{"findings": [{"quote": "...", "kind": "miscalculation"|"contradiction"|"unsupported", "reason": "one short sentence"}]}`;

const FACTUAL = `You check a submitted piece of work against the briefing it was written for.

Your job is to find claims the briefing does not support. Be precise about what that means, because
the most valuable work a writer does is to DERIVE facts the briefing only implies.

NOT a finding, never list these:
- A claim that follows from the briefing by correct arithmetic. If the briefing gives a rate and a
  quantity, their correct product is supported, not invented. Do the multiplication yourself before
  you judge.
- A claim that is a direct restatement or a necessary consequence of something in the briefing.
- Ordinary connective phrasing, tone, or self-description of care, quality or attention.

A finding, list these:
- "miscalculation": the submission derives a number from the briefing and gets it WRONG. Compute the
  correct value yourself and put it in "reason". This is the most serious kind.
- "contradiction": the submission states something the briefing contradicts.
- "unsupported": the submission states a checkable fact that the briefing neither contains nor implies,
  and that cannot be derived from it.

${SHARED_RULES}`;

const CREATIVE = `You check a submitted piece of creative copy against the briefing it was
written for.

Creative copy necessarily adds. A hundred-word briefing cannot cover a hundred-word text, so the
writer fills in connective tissue, rhythm and framing. That is the work, not a defect. Do not
report it.

Report ONLY what the client could be held to if it is not true. Ask of each candidate: if a
customer arrived expecting this and it did not exist, would the client have a problem? If no, it is
not a finding.

A finding, list these:
- "miscalculation": the copy derives a number from the briefing and gets it WRONG. Compute the correct
  value yourself and put it in "reason".
- "contradiction": the copy states something the briefing contradicts.
- "unsupported": the copy commits the client to something the briefing does not support. Equipment or
  specifications not listed, a service not offered, a contact or booking channel that may not exist,
  a credential, a certification, a guarantee, a price, a date, an availability, a capacity.

NOT a finding, never list these:
- Tone, rhythm, framing, or any self-description of care, quality, attention or experience.
- A claim that follows from the briefing by correct arithmetic or as a necessary consequence.
- Plausible detail that binds the client to nothing.

${SHARED_RULES}`;

export const INSTRUCTION_FACTUAL: Record<CheckMode, string> = { factual: FACTUAL, creative: CREATIVE };

/**
 * Zitatvergleich ohne die Unterschiede, die kein Mensch als Unterschied liest.
 *
 * Die Modelle liefern typografische Zeichen (geschuetzter Bindestrich, Apostroph, Geviertstrich),
 * und der Pruefer normalisiert sie beim Zitieren oft still zu ASCII. Ohne diese Angleichung faellt
 * ein korrekter Finding als "nicht auffindbar" durch.
 */
export function normalise(s: string): string {
  let t = s.normalize("NFKC");
  for (const [a, b] of [
    ["‑", "-"], ["‐", "-"], ["–", "-"], ["—", "-"],
    ["’", "'"], ["‘", "'"], ["“", '"'], ["”", '"'],
    [" ", " "], [" ", " "],
  ] as const) {
    t = t.split(a).join(b);
  }
  return t.replace(/\s+/g, " ").trim().toLowerCase();
}

export interface CheckResult {
  findings: Finding[];
  /** Befunde, deren Zitat sich in der Einreichung nicht wiederfinden liess. */
  discarded: number;
}

/**
 * Der Pruefer wird selbst geprueft.
 *
 * Ein Modell, das Erfindungen sucht, erfindet Funde: Es zitiert Saetze, die in der Einreichung gar
 * nicht vorkommen. Ein solcher Finding ist schlimmer als ein uebersehener, weil er einen ehrlichen
 * Text beschuldigt. Deshalb zaehlt nur, was sich woertlich wiederfinden laesst; der Rest wird
 * discarded und gezaehlt, damit die Quote sichtbar bleibt.
 */
export function verifyFindings(einreichung: string, raw: unknown): CheckResult {
  const list = (raw as { findings?: unknown })?.findings;
  if (!Array.isArray(list)) return { findings: [], discarded: 0 };
  const haystack = normalise(einreichung);
  const findings: Finding[] = [];
  let discarded = 0;
  for (const entry of list) {
    const b = entry as Partial<Finding>;
    const quote = typeof b.quote === "string" ? b.quote.trim() : "";
    const kind = b.kind === "miscalculation" || b.kind === "contradiction" || b.kind === "unsupported" ? b.kind : null;
    if (!quote || !kind || !haystack.includes(normalise(quote))) {
      discarded++;
      continue;
    }
    findings.push({ quote, kind, reason: typeof b.reason === "string" ? b.reason : "" });
  }
  return { findings, discarded };
}

/** Die Nachrichten fuer den Modellaufruf. Getrennt, damit der Aufbau testbar bleibt. */
export function messages(briefing: string, einreichung: string, kind: CheckMode) {
  return [
    { role: "system" as const, content: INSTRUCTION_FACTUAL[kind] },
    { role: "user" as const, content: `BRIEFING:\n${briefing}\n\n---\n\nSUBMISSION:\n${einreichung}` },
  ];
}
