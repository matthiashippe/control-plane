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

/**
 * German alongside English, because the check was telling German briefs they were bad.
 *
 * Measured against production on 2026-09-23 with one brief in two languages, the same brief: the
 * English version came back with zero findings and the German with four, and every one of the
 * four was wrong. "400 bis 500 Woerter" is a length. "Nur den Text abgeben, kein Anschreiben" is
 * a deliverable. "Keinen Preis nennen und kein Gesetz ohne Paragraphennummer zitieren" rules
 * things out. "fuer einen Vermieter, der zum ersten Mal einen bestellt" is a reader.
 *
 * That is worse than a gap. A check whose whole promise is "this names what your brief does not
 * say" told a careful writer four times over that they had left out things they had written down,
 * and it did it on the one page a stranger can use without an account, in the language of the
 * market this is run from.
 *
 * The patterns stay patterns and do not become a model. They are cheap, they are readable, and
 * what they cost when they are wrong is exactly what was just measured, which is the argument for
 * keeping them small rather than clever. Umlauts are matched both ways: somebody typing into a
 * web form writes "Wörter", somebody pasting out of a terminal often writes "Woerter".
 */

/** "90 words", "one paragraph", "3 sentences", "400 bis 500 Woerter", "zwei Absaetze". */
const LENGTH =
  /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|ein|eine|zwei|drei|vier|fuenf|f\u00fcnf|sechs|sieben|acht|neun|zehn)\s+(?:bis\s+\d+\s+)?(word|words|character|characters|sentence|sentences|paragraph|paragraphs|line|lines|bullet|bullets|W\u00f6rter|Woerter|Wort|Zeichen|Satz|S\u00e4tze|Saetze|Absatz|Abs\u00e4tze|Absaetze|Zeile|Zeilen|Stichpunkte?|Aufz\u00e4hlungspunkte?)\b/i;

/** "Deliver the paragraph only", "Nur den Text abgeben", "sonst nichts", "ohne Anschreiben". */
const DELIVERABLE =
  /\b(deliver|return|reply with|respond with|hand in|output|submit)\b[^.]{0,80}\b(only|nothing else|just)\b|\bnothing else\b|\bnur\s+(den|die|das)\b[^.]{0,60}\b(abgeben|liefern|ausgeben|zur\u00fcckgeben|zurueckgeben|schreiben)\b|\bsonst nichts\b|\bnichts (?:weiter|anderes)\b|\bkein(?:e|en)?\s+(?:Anschreiben|Vorwort|Einleitung|Kommentar|Erkl\u00e4rung|Erklaerung)\b/i;

/**
 * "Do not use", "avoid", "Keinen Preis nennen", "nicht erfinden", "vermeide".
 *
 * Die deutsche Halfte haengt an einer Verbliste und nicht an "kein" allein. Gemessen am
 * 2026-09-23: ein Brief mit "das keinen Keller und keine Garage hat" liess den Check
 * verstummen, obwohl der Brief nichts ausschliesst. Das ist derselbe Fehler wie der, den
 * diese Aenderung behebt, nur in die andere Richtung, und er ist der teurere: ein falscher
 * Befund aergert, ein ausgelassener Befund macht den Check wertlos.
 */
// eslint-disable-next-line no-useless-escape
const VERBOT_VERB =
  "nennen|zitieren|verwenden|benutzen|erw\u00e4hnen|erwaehnen|schreiben|behaupten|versprechen|" +
  "empfehlen|bewerten|vergleichen|aufz\u00e4hlen|aufzaehlen|erfinden|spekulieren|werben|angeben|" +
  "einbauen|ausgeben|liefern|anpreisen|beziffern|sch\u00e4tzen|schaetzen";
const RULED_OUT = new RegExp(
  "\\b(do not|don't|never|avoid|without|no more than|must not|do no)\\b" +
    `|\\bkein(?:e|en|em|er)?\\b[^.]{0,60}?\\b(?:${VERBOT_VERB})\\b` +
    `|\\b(?:nicht|niemals|keinesfalls)\\s+(?:\\w+\\s+){0,3}?(?:${VERBOT_VERB})\\b` +
    "|\\bvermeide\\b|\\bverzichte auf\\b|\\bunzul\u00e4ssig\\b|\\bverboten\\b|\\btabu\\b",
  "i",
);

/** "for a developer", "aimed at", "fuer einen Vermieter", "die Leserin ist", "richtet sich an". */
const READER =
  /\b(reader|audience|aimed at|for (a|an|somebody|someone|people|developers?|buyers?|customers?|managers?)|who has never|deciding whether)\b|\bf\u00fcr\s+(?:eine[nm]?|die|den|das)\b|\bfuer\s+(?:eine[nm]?|die|den|das)\b|\b(?:Leser|Leserin|Zielgruppe|Publikum)\b|\brichtet sich an\b|\bder\s+(?:noch\s+)?nie\b/i;

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
