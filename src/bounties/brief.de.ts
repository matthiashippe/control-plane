/**
 * The German half of the brief check: the same findings, in the reader's language.
 *
 * `loop-constraints.md` says everything in the code is English, without exception, and it means
 * identifiers, comments, test names, log lines and fixtures, because the repository is public and
 * German code shuts every reader out. That rule is kept here in full: every name and every comment
 * in this file is English. What is German is the content -- the sentences a person reads -- and
 * content is not code. It lives in one file for exactly that reason, so the line between the two
 * is visible rather than argued about.
 *
 * Why the sentences exist at all. Measured against production on 2026-09-23: a German brief comes
 * back with five findings, and all five are English. The population this service is closest to
 * reaching is German (the demand-side workflow of 2026-09-23 put it at property managers in
 * Hamburg, and the one event where 300 of them sit in a room is on 24.09.), and somebody holding a
 * phone in a foyer does not read five English sentences about their German brief. It is the same
 * failure as the patterns being English-only, one layer up: the check was right and unreadable.
 *
 * These are not translations of the English. "No length: how many words, sentences or paragraphs"
 * becomes a sentence that names the thing the way somebody would say it out loud, because a
 * literal translation of a terse English label reads like a machine in German.
 */

/** Keyed by BriefFinding.id, so a new finding cannot quietly ship without its German. */
export const MISSING_DE: Record<string, string> = {
  no_length: "Keine Länge: wie viele Wörter, Sätze oder Absätze es werden sollen.",
  no_deliverable: "Es steht nicht da, was abgegeben werden soll und was nicht.",
  nothing_ruled_out: "Nichts ist ausgeschlossen: keine verbotenen Wörter, Formen oder Aussagen.",
  no_reader: "Keine Leserin, kein Leser: für wen der Text ist und was diese Person entscheidet.",
};

export const COSTS_DE: Record<string, string> = {
  too_short:
    "Alles, was nicht dasteht, entscheidet der Agent selbst, und fünf Agenten entscheiden fünf " +
    "Mal anders. Die Einsendungen unterscheiden sich dann darin, was sie überhaupt versucht " +
    "haben, und es bleibt nichts zu vergleichen.",
  no_length:
    "Ohne Grenze schreibt jeder Agent so lang, wie er von sich aus schreibt. Dann steht ein " +
    "Absatz neben einer Seite, und die beiden sind nicht vergleichbar.",
  no_deliverable:
    "Die Einsendungen kommen in eine Erklärung eingewickelt zurück, wie der Agent vorgegangen " +
    "ist. Sie zahlen für den Text und packen ihn danach bei jeder Einsendung von Hand aus.",
  nothing_ruled_out:
    "Bei Sachtexten wird jede Aussage gegen diesen Auftrag geprüft. Zu sagen, was nicht " +
    "behauptet werden darf, macht aus dieser Prüfung eine Grenze, die Sie selbst ziehen, statt " +
    "einer Liste von Überraschungen.",
  no_reader:
    "Dieselben Fakten für eine Maklerin und für eine Mieterin sind zwei verschiedene Texte. " +
    "Ohne Leser schreibt ein Agent für niemanden, und das liest sich, als sei es für alle.",
};

/** The one finding whose sentence carries a number, so it is built rather than looked up. */
export function tooShortDe(words: number): string {
  return `Der ganze Auftrag hat ${words} Wörter.`;
}

/**
 * Which language the person wrote in.
 *
 * Function words, not umlauts alone. Both real briefs this was measured on start with the English
 * words "FACT SHEET", and half the German ones are typed without umlauts by somebody pasting out
 * of a terminal, so either signal on its own gets it wrong in a way the reader sees immediately.
 *
 * A tie goes to English, which is what the service has always answered in. Silence about the
 * language is not a reason to switch it.
 */
const DE_WORDS =
  /\b(der|die|das|den|dem|des|ein|eine|einen|einem|einer|und|oder|aber|nicht|kein|keine|keinen|für|fuer|über|ueber|ohne|mit|von|vom|zum|zur|bei|als|auch|wie|dass|werden|wird|sind|ist|war|soll|sollen|muss|müssen|muessen|wenn|weil|damit|nur|noch|schon|sich|man|wer|was|welche|welcher)\b/gi;
const EN_WORDS =
  /\b(the|a|an|and|or|but|not|no|for|about|without|with|of|to|at|as|also|how|that|are|is|was|will|shall|must|if|because|so|only|still|already|itself|one|who|what|which)\b/gi;

export function detectBriefLanguage(text: string): "de" | "en" {
  const de = (text.match(DE_WORDS) ?? []).length;
  const en = (text.match(EN_WORDS) ?? []).length;
  // Umlauts and ß only break the tie: they are decisive when present and say nothing when absent.
  const umlauts = (text.match(/[äöüßÄÖÜ]/g) ?? []).length;
  if (de === en) return umlauts > 0 ? "de" : "en";
  return de > en ? "de" : "en";
}
