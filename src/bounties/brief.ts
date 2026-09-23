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

import { MISSING_DE, COSTS_DE, tooShortDe, detectBriefLanguage } from "./brief.de.js";

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

/**
 * "90 words", "one paragraph", "3 sentences", "400 bis 500 Woerter", "zwei Absaetze".
 *
 * The German units a buyer actually writes are wider than the English ones. Measured on
 * 2026-09-23 over 50 real German commissions: "ca. 5-8 Dokumente a max. 12 Seiten" and
 * "508.727 Normzeilen" were both told they carried no length. A page and a Normzeile are
 * lengths, and the Normzeile is what every German translation contract is priced in. The
 * number has to sit directly in front of the unit, which is what keeps "auf Seite 3" out.
 */
const LENGTH =
  /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|ein|eine|zwei|drei|vier|fuenf|f\u00fcnf|sechs|sieben|acht|neun|zehn)\s+(?:bis\s+\d+\s+)?(word|words|character|characters|sentence|sentences|paragraph|paragraphs|line|lines|page|pages|bullet|bullets|W\u00f6rter|Woerter|Wort|Zeichen|Satz|S\u00e4tze|Saetze|Absatz|Abs\u00e4tze|Absaetze|Zeile|Zeilen|Seiten?|Normzeilen?|Anschl\u00e4ge|Anschlaege|B\u00e4nde|Baende|Stichpunkte?|Aufz\u00e4hlungspunkte?)\b/i;

/**
 * "Was nicht dazugehoert", the German way: a scope drawn by naming what is outside it.
 *
 * "Die technische Betreuung des Internetauftritts ist nicht Bestandteil der Ausschreibung" and
 * "Die Leistung umfasst keine fachtechnische Planung" answer two of the four questions at once,
 * which is why the same expression is read by both the deliverable and the ruled-out check. It
 * says what is handed over (everything else) and it forbids something (that). Both checks were
 * silent on it, and both were wrong, on four of the 50 briefs measured.
 */
const SCOPE_EXCLUSION =
  "\\b(?:ist|sind|war|waren)\\s+nicht\\s+(?:Bestandteil|Gegenstand|Teil)\\b" +
  "|\\b(?:umfasst|umfassen|beinhaltet|beinhalten|enth\u00e4lt|enthaelt|enthalten)\\s+" +
  "(?:ausdr\u00fccklich\\s+|ausdruecklich\\s+)?kein(?:e|en)?\\b";

/** "Deliver the paragraph only", "Nur den Text abgeben", "sonst nichts", "ohne Anschreiben". */
const DELIVERABLE = new RegExp(
  "\\b(deliver|return|reply with|respond with|hand in|output|submit)\\b[^.]{0,80}\\b(only|nothing else|just)\\b" +
    "|\\bnothing else\\b" +
    "|\\bnur\\s+(den|die|das)\\b[^.]{0,60}\\b(abgeben|liefern|ausgeben|zur\u00fcckgeben|zurueckgeben|schreiben)\\b" +
    "|\\bsonst nichts\\b|\\bnichts (?:weiter|anderes)\\b" +
    "|\\bkein(?:e|en)?\\s+(?:Anschreiben|Vorwort|Einleitung|Kommentar|Erkl\u00e4rung|Erklaerung)\\b" +
    "|\\berwartete[sr]?\\s+Ergebnis(?:se)?\\b" +
    `|${SCOPE_EXCLUSION}`,
  "i",
);

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
/**
 * The four other shapes a German ban takes, each one measured rather than guessed.
 *
 * Over 50 real German commissions on 2026-09-23 the verb list above missed every ban that was
 * not built on a verb: "Allgemeine oder austauschbare Texte sind nicht gewuenscht", a section
 * headed "Was ich nicht suche", "Reine Produktpflege der Artikel, keine Produkttexte", and
 * "Inhalte, die nicht primaer auf SEO ausgerichtet sind, sondern auf fachliche Fundierung".
 *
 * The last one is the dangerous one, because "nicht X, sondern Y" and "nicht nur X, sondern
 * auch Y" look alike and mean the opposite: the first forbids X, the second adds Y. So the
 * contrast only counts when "nur", "ausschliesslich" or "allein" does not follow the "nicht".
 * The noun ban stays tied to a text ("keine Produkttexte", "keinen Werbetext") and does not
 * accept any noun, because "das keinen Keller hat" must still leave the check talking.
 */
const RULED_OUT = new RegExp(
  "\\b(do not|don't|never|avoid|without|no more than|must not|do no)\\b" +
    `|\\bkein(?:e|en|em|er)?\\b[^.]{0,60}?\\b(?:${VERBOT_VERB})\\b` +
    `|\\b(?:nicht|niemals|keinesfalls)\\s+(?:\\w+\\s+){0,3}?(?:${VERBOT_VERB})\\b` +
    "|\\bvermeide\\b|\\bverzichte auf\\b|\\bunzul\u00e4ssig\\b|\\bverboten\\b|\\btabu\\b" +
    `|${SCOPE_EXCLUSION}` +
    "|\\bnicht\\s+(?:gew\u00fcnscht|gewuenscht|erw\u00fcnscht|erwuenscht|zul\u00e4ssig|zulaessig|gestattet|erlaubt|vorgesehen|akzeptiert)\\b" +
    "|\\bwas\\s+(?:ich|wir)\\s+nicht\\s+(?:suche|suchen|will|wollen|m\u00f6chte|moechte|m\u00f6chten|moechten|brauche|brauchen)\\b" +
    "|\\bkein(?:e|en)?\\s+\\w*texte?\\b" +
    "|\\bnicht\\s+(?!nur\\b|ausschlie\u00dflich\\b|ausschliesslich\\b|allein\\b)[^.]{0,60}?\\bsondern\\b",
  "i",
);

/**
 * "for a developer", "aimed at", "fuer einen Vermieter", "die Leserin ist", "richtet sich an".
 *
 * German names its audience without an article far more often than with one: "fuer Lehrkraefte,
 * Fachkraefte und Eltern", "fuer Finanzberater, professionelle Fonds-Investoren und private
 * Anleger", "fuer Schwangere und Eltern mit Kindern bis drei Jahre". All three were told they
 * named no reader, and all three name one in the first sentence.
 *
 * The group has to be a word for people, not any capitalised noun. "Fuer unseren Kunden suchen
 * wir" is the agency talking about its client and says nothing about who reads the text, and
 * "fuer verschiedene Zielgruppen" concedes there is an audience without naming it: both were
 * checked against the 50 briefs and both must keep the finding, so neither is in the list.
 */
const READER_GROUP =
  "leser|h\u00f6rer|hoerer|anleger|berater|investor|nutzer|anwender|verbraucher|b\u00fcrger|buerger|" +
  "eltern|kr\u00e4fte|kraefte|mitarbeitende|besch\u00e4ftigte|beschaeftigte|jugendliche|erwachsene|" +
  "schwangere|patient|angeh\u00f6rige|angehoerige|betroffene|einsteiger|laien|fachleute|experten|" +
  "unternehmer|entscheider|sch\u00fcler|schueler|studierende|senioren|familien|vermieter|mieter|" +
  "k\u00e4ufer|kaeufer|\u00e4rzte|aerzte|makler|interessierte|teilnehmende|g\u00e4ste|gaeste|besucher";
const READER = new RegExp(
  "\\b(reader|audience|aimed at|for (a|an|somebody|someone|people|developers?|buyers?|customers?|managers?)|who has never|deciding whether)\\b" +
    "|\\bf\u00fcr\\s+(?:eine[nm]?|die|den|das)\\b|\\bfuer\\s+(?:eine[nm]?|die|den|das)\\b" +
    `|\\bf(?:\u00fc|ue)r\\s+(?:\\w+[\\s,]+){0,2}\\w*(?:${READER_GROUP})\\w*\\b` +
    "|\\b(?:Leser|Leserin|Zielgruppe|Publikum)\\b|\\brichtet sich an\\b|\\bder\\s+(?:noch\\s+)?nie\\b",
  "i",
);

/**
 * Reads a brief and names what is absent. Never judges what is there.
 *
 * `kind` is taken because the two differ in what a missing piece costs: on factual work the
 * fabrication check is a gate, so a brief that carries no facts sets its own submissions up to
 * fail against it.
 */
/**
 * The findings, in the language the brief was written in.
 *
 * `lang` is normally left out and detected from the text. It is a parameter so a caller that
 * already knows (a page that was asked for German, a test standing on one side of the detector)
 * does not have to write German and hope.
 */
export function reviewBrief(
  brief: string,
  kind: "factual" | "creative",
  lang: "de" | "en" = detectBriefLanguage(brief),
): BriefFinding[] {
  const text = brief.trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  const findings: BriefFinding[] = [];
  const de = lang === "de";

  if (words < SHORT_WORDS) {
    findings.push({
      id: "too_short",
      missing: de ? tooShortDe(words) : `The whole brief is ${words} words.`,
      costs: de
        ? COSTS_DE.too_short
        : "Everything an agent is not told, it decides for itself, and five agents decide five " +
          "different ways. The submissions then differ in what they attempted, which leaves nothing " +
          "to compare and no reason to prefer one.",
    });
  }

  if (!LENGTH.test(text)) {
    findings.push({
      id: "no_length",
      missing: de ? MISSING_DE.no_length : "No length: how many words, sentences or paragraphs.",
      costs: de
        ? COSTS_DE.no_length
        : "Without a limit each agent writes to its own default, and submissions arrive at wildly " +
          "different lengths. Comparing them then means comparing a paragraph against a page.",
    });
  }

  if (!DELIVERABLE.test(text)) {
    findings.push({
      id: "no_deliverable",
      missing: de ? MISSING_DE.no_deliverable : "No statement of what to hand in and nothing else.",
      costs: de
        ? COSTS_DE.no_deliverable
        : "Submissions come back wrapped in an explanation of how the agent approached it. You pay " +
          "for the work, then do the unwrapping by hand for every submission.",
    });
  }

  if (!RULED_OUT.test(text)) {
    findings.push({
      id: "nothing_ruled_out",
      missing: de ? MISSING_DE.nothing_ruled_out : "Nothing is ruled out: no banned words, forms or claims.",
      costs: de
        ? COSTS_DE.nothing_ruled_out
        : kind === "creative"
          ? "Measured on 2026-09-20: the briefs that banned specific words came back clean, and " +
            "the ones that did not came back full of the words every model reaches for first."
          : "On factual work every claim is checked against this brief. Saying what must not be " +
            "claimed is what turns that check from a list of surprises into a gate you set.",
    });
  }

  if (!READER.test(text)) {
    findings.push({
      id: "no_reader",
      missing: de ? MISSING_DE.no_reader : "No reader: who this is written for and what they are deciding.",
      costs: de
        ? COSTS_DE.no_reader
        : "The same facts written for a developer and for a buyer are two different texts. Without " +
          "a reader an agent writes for nobody, which reads as writing for everybody.",
    });
  }

  return findings;
}
