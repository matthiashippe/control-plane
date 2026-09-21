/**
 * What a brief is missing, said before the work is done rather than after.
 *
 * Measured on 2026-09-20: three agents differing in nothing but their genesis prompt were given
 * the same briefs, and the difference in output quality tracked the brief far more than the agent.
 * The brief that said *buyers want the numbers listings usually hide* got AED 18 x 1,240 sqft =
 * 22,320 computed by all three without being asked. The briefs that banned specific words came
 * back clean. The parts left vague came back vague.
 *
 * The consequence for this market is not a documentation problem. A buyer who writes a thin brief
 * gets thin work, concludes that agents cannot do the job, and does not come back. They are the
 * scarce side, so that is the expensive failure, and it happens before a single agent has done
 * anything wrong.
 *
 * **No model runs here, on purpose.** Judging whether a brief is *good* needs one, would cost the
 * buyer credits at the worst possible moment, and would sometimes be confidently wrong about
 * somebody's own trade. What a rule can do honestly is notice that something is absent: no length,
 * nothing to hand in, nothing ruled out. So every finding below is the absence of a thing the
 * measurement showed to matter, phrased as a question about the brief and never as a verdict on
 * it. A buyer is free to ignore all of it, and posting is never blocked: it is their money and
 * their trade.
 *
 * The counter-check that keeps this honest is in `test/bounties.test.ts`: the two briefs actually
 * running on the live market produce no findings at all. A lint that fires on the work of the
 * person who wrote it would teach nothing and annoy everyone.
 */

export interface BriefFinding {
  /** Stable identifier, so a caller can ignore one kind without parsing prose. */
  id: "too_short" | "no_length" | "no_deliverable" | "nothing_ruled_out" | "no_reader";
  /** What the brief does not appear to say. */
  missing: string;
  /** What it costs when it is missing. Taken from the measurement, not from taste. */
  costs: string;
}

/** Under this many words a brief cannot carry a task, a reader and a limit at once. */
const SHORT_WORDS = 25;

/** "90 words", "one paragraph", "3 sentences", "80 words maximum". */
const LENGTH = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(word|words|character|characters|sentence|sentences|paragraph|paragraphs|line|lines|bullet|bullets)\b/i;

/** "Deliver the finished paragraph only", "return just the JSON", "hand in the text". */
const DELIVERABLE = /\b(deliver|return|reply with|respond with|hand in|output|submit)\b[^.]{0,80}\b(only|nothing else|just)\b|\bnothing else\b/i;

/** "Do not use", "no lists of three", "avoid", "must not". */
const RULED_OUT = /\b(do not|don't|never|avoid|without|no more than|must not|do no)\b/i;

/** "for a developer", "aimed at", "the reader is", "who has never". */
const READER = /\b(reader|audience|aimed at|for (a|an|somebody|someone|people|developers?|buyers?|customers?|managers?)|who has never|deciding whether)\b/i;

/**
 * Reads a brief and names what is absent. Never judges what is there.
 *
 * `kind` is taken because the two differ in what a missing piece costs: on factual work the
 * fabrication check is a gate, so a brief that carries no facts sets its own submissions up to
 * fail against it.
 */
export function reviewBrief(brief: string, kind: "factual" | "creative"): BriefFinding[] {
  const text = brief.trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  const findings: BriefFinding[] = [];

  if (words < SHORT_WORDS) {
    findings.push({
      id: "too_short",
      missing: `The whole brief is ${words} words.`,
      costs:
        "Everything an agent is not told, it decides for itself, and five agents decide five " +
        "different ways. The submissions then differ in what they attempted, which leaves nothing " +
        "to compare and no reason to prefer one.",
    });
  }

  if (!LENGTH.test(text)) {
    findings.push({
      id: "no_length",
      missing: "No length: how many words, sentences or paragraphs.",
      costs:
        "Without a limit each agent writes to its own default, and submissions arrive at wildly " +
        "different lengths. Comparing them then means comparing a paragraph against a page.",
    });
  }

  if (!DELIVERABLE.test(text)) {
    findings.push({
      id: "no_deliverable",
      missing: "No statement of what to hand in and nothing else.",
      costs:
        "Submissions come back wrapped in an explanation of how the agent approached it. You pay " +
        "for the work, then do the unwrapping by hand for every submission.",
    });
  }

  if (!RULED_OUT.test(text)) {
    findings.push({
      id: "nothing_ruled_out",
      missing: "Nothing is ruled out: no banned words, forms or claims.",
      costs:
        kind === "creative"
          ? "Measured on 2026-09-20: the briefs that banned specific words came back clean, and " +
            "the ones that did not came back full of the words every model reaches for first."
          : "On factual work every claim is checked against this brief. Saying what must not be " +
            "claimed is what turns that check from a list of surprises into a gate you set.",
    });
  }

  if (!READER.test(text)) {
    findings.push({
      id: "no_reader",
      missing: "No reader: who this is written for and what they are deciding.",
      costs:
        "The same facts written for a developer and for a buyer are two different texts. Without " +
        "a reader an agent writes for nobody, which reads as writing for everybody.",
    });
  }

  return findings;
}
