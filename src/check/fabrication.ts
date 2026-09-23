/**
 * Which claim in a submission is not in the briefing?
 *
 * The bounty market this service is heading for depends on a buyer being able to judge the work
 * without being an expert. They cannot judge taste, but they can judge invented facts, and those
 * are the risk: in the test run of 20.09.2026 an agent wrote "Viewings available on short notice"
 * into a Dubai listing, a promise the briefing does not contain and for which the seller is liable.
 *
 * The command line version including the measurement series is in `ops/invention-check.py`, the
 * sample with known ground truth in `ops/probes/dubai-facts.json`. Measured on 20.09.2026: on a
 * factual briefing three out of three planted errors found, no false alarm; on marketing copy 23
 * findings across nine submissions, which is why the second mode exists for that case.
 *
 * This module deliberately holds nothing but text and pure logic. The model call runs through
 * `handleChat`, so billing, reservation, coalescing and margin are the same as for any other
 * inference.
 */

/** What the buyer ordered. Factual blocks, creative asks back. */
export type CheckMode = "factual" | "creative";

export interface Finding {
  /** Verbatim quote from the submission. The anchor against which the finding is checked. */
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
 * Quote comparison without the differences no human reads as a difference.
 *
 * The models deliver typographic characters (non-breaking hyphen, apostrophe, em dash), and when
 * quoting, the checker often silently normalises them to ASCII. Without this alignment a correct
 * finding falls through as "not findable".
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
  /** Findings whose quote could not be found in the submission. */
  discarded: number;
}

/**
 * The checker is itself checked.
 *
 * A model that looks for fabrications fabricates findings: it quotes sentences that do not appear
 * in the submission at all. Such a finding is worse than a missed one, because it accuses an honest
 * text. So only what can be found verbatim counts; the rest is discarded and counted, so the rate
 * stays visible.
 */
export function verifyFindings(submission: string, raw: unknown): CheckResult {
  const list = (raw as { findings?: unknown })?.findings;
  if (!Array.isArray(list)) return { findings: [], discarded: 0 };
  const haystack = normalise(submission);
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

/** The messages for the model call. Kept separate so the construction stays testable. */
export function messages(briefing: string, submission: string, kind: CheckMode) {
  return [
    { role: "system" as const, content: INSTRUCTION_FACTUAL[kind] },
    { role: "user" as const, content: `BRIEFING:\n${briefing}\n\n---\n\nSUBMISSION:\n${submission}` },
  ];
}
